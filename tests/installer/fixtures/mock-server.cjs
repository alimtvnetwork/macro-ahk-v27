#!/usr/bin/env node
// Disabled lint: this is a CommonJS test fixture, not part of the linted source set.
// ─────────────────────────────────────────────────────────────────────
// Marco Extension — Installer Mock Server
//
// A zero-dependency Node HTTP server that simulates the GitHub endpoints
// `scripts/install.sh` reaches in production:
//
//   GET  /repos/:owner/:repo/releases/latest     → { "tag_name": "..." }
//   HEAD /repos/:owner/:repo                     → sibling-discovery probe
//   GET  /:owner/:repo/releases/download/:tag/:asset
//                                                → tiny synthetic ZIP
//
// It lets the installer test suite (tests/installer/*.test.sh) exercise
// the full resolution + download path without ever hitting the real
// network — the suite redirects curl/wget via the
// MARCO_API_BASE / MARCO_DOWNLOAD_BASE env-var hooks declared in
// scripts/install.sh.
//
// Configuration (via env vars, all optional):
//   MOCK_PORT            Port to listen on (default: ephemeral)
//   MOCK_LATEST_TAG      Tag returned by /releases/latest (default v2.224.0)
//   MOCK_API_FAIL        "1" → /releases/latest returns 503 + empty body
//                        "timeout" → connection hang (used to test exit 5)
//   MOCK_SIBLINGS        CSV of repo:status, e.g. "repo-v3:200,repo-v4:404"
//                        Probed via HEAD /repos/:owner/:repo
//   MOCK_MISSING_ASSETS  CSV of versions whose ZIP returns 404 (strict-mode
//                        exit-4 testing), e.g. "v9.9.9,v0.0.1"
//   MOCK_ZERO_RELEASES   "1" → /releases/latest returns 200 + "{}" body
//                        (host reachable, repo has zero releases). Triggers
//                        the spec §2 step 5 / AC-2 main-branch fallback.
//                        "404" → /releases/latest returns 404 (GitHub's
//                        actual contract for "no releases yet"), which the
//                        installer also treats as zero-releases.
//   MOCK_MAIN_BRANCH     Branch name advertised at the tarball route
//                        (default "main"). The route served is
//                        /:owner/:repo/archive/refs/heads/:branch.tar.gz.
//   MOCK_CHECKSUM_MODE   "correct"  (default) → checksums.txt lists the real
//                                    SHA-256 of the served ZIP for ${tag}.
//                        "wrong"    → checksums.txt lists a deterministic but
//                                    bogus hash so the installer rejects it
//                                    with exit 6 (spec §7.1, §8 rule 2).
//                        "missing"  → /checksums.txt returns 404 — covers the
//                                    soft-warn-and-continue back-compat path
//                                    for releases predating v0.2 hardening.
//   MOCK_PORT_FILE       Path to write the resolved port (default
//                        ./.mock-port).  Useful when MOCK_PORT=0.
//   MOCK_LOG             "1" → log every request to stderr
//
// Lifecycle:
//   - Writes the listening port to MOCK_PORT_FILE (atomic write).
//   - Listens until SIGTERM / SIGINT, then exits 0.
//
// Spec reference: spec/14-update/01-generic-installer-behavior.md §2-4, §7.1.
//
// File extension is `.cjs` because the repo's package.json sets
// "type": "module" — using `.cjs` keeps this file in CommonJS mode so
// `require('http')` works without rewriting it as ESM.
// ─────────────────────────────────────────────────────────────────────

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const PORT = parseInt(process.env.MOCK_PORT || '0', 10);
const LATEST_TAG = process.env.MOCK_LATEST_TAG || 'v2.224.0';
const API_FAIL = process.env.MOCK_API_FAIL || '';
const SIBLINGS = parseSiblings(process.env.MOCK_SIBLINGS || '');
const MISSING_ASSETS = new Set(
    (process.env.MOCK_MISSING_ASSETS || '').split(',').map(s => s.trim()).filter(Boolean)
);
const ZERO_RELEASES = process.env.MOCK_ZERO_RELEASES || '';
const MAIN_BRANCH = process.env.MOCK_MAIN_BRANCH || 'main';
const CHECKSUM_MODE = (process.env.MOCK_CHECKSUM_MODE || 'correct').toLowerCase();
const PORT_FILE = process.env.MOCK_PORT_FILE || path.join(process.cwd(), '.mock-port');
const LOG = process.env.MOCK_LOG === '1';


function parseSiblings(csv) {
    const map = new Map();
    for (const pair of csv.split(',').map(s => s.trim()).filter(Boolean)) {
        const [repo, status] = pair.split(':');
        if (repo && status) map.set(repo, parseInt(status, 10));
    }
    return map;
}

function log(...args) {
    if (LOG) process.stderr.write(`[mock] ${args.join(' ')}\n`);
}

// Minimal valid ZIP containing a manifest.json so install.sh's "no manifest"
// guard is satisfied. Built once at startup.
function buildFakeZip(version) {
    const manifest = JSON.stringify({
        manifest_version: 3,
        name: 'Marco Mock',
        version: version.replace(/^v/, ''),
    });
    // CRC-32 of manifest string.
    const crc = crc32(Buffer.from(manifest));
    const data = Buffer.from(manifest);
    const compressed = data; // store (no compression) — simpler than deflate

    const fileName = Buffer.from('manifest.json');
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);   // local file header sig
    localHeader.writeUInt16LE(20, 4);            // version needed
    localHeader.writeUInt16LE(0, 6);             // flags
    localHeader.writeUInt16LE(0, 8);             // method (0 = store)
    localHeader.writeUInt16LE(0, 10);            // mtime
    localHeader.writeUInt16LE(0, 12);            // mdate
    localHeader.writeUInt32LE(crc, 14);          // crc32
    localHeader.writeUInt32LE(compressed.length, 18); // compressed size
    localHeader.writeUInt32LE(data.length, 22);  // uncompressed size
    localHeader.writeUInt16LE(fileName.length, 26);
    localHeader.writeUInt16LE(0, 28);            // extra length

    const localBlock = Buffer.concat([localHeader, fileName, compressed]);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);  // central dir sig
    centralHeader.writeUInt16LE(20, 4);           // version made by
    centralHeader.writeUInt16LE(20, 6);           // version needed
    centralHeader.writeUInt16LE(0, 8);            // flags
    centralHeader.writeUInt16LE(0, 10);           // method
    centralHeader.writeUInt16LE(0, 12);           // mtime
    centralHeader.writeUInt16LE(0, 14);           // mdate
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(fileName.length, 28);
    centralHeader.writeUInt16LE(0, 30);           // extra
    centralHeader.writeUInt16LE(0, 32);           // comment
    centralHeader.writeUInt16LE(0, 34);           // disk
    centralHeader.writeUInt16LE(0, 36);           // internal
    centralHeader.writeUInt32LE(0, 38);           // external attrs
    centralHeader.writeUInt32LE(0, 42);           // local header offset

    const centralBlock = Buffer.concat([centralHeader, fileName]);

    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);                     // disk
    eocd.writeUInt16LE(0, 6);                     // central disk
    eocd.writeUInt16LE(1, 8);                     // entries this disk
    eocd.writeUInt16LE(1, 10);                    // total entries
    eocd.writeUInt32LE(centralBlock.length, 12);  // central dir size
    eocd.writeUInt32LE(localBlock.length, 16);    // central dir offset
    eocd.writeUInt16LE(0, 20);                    // comment len

    return Buffer.concat([localBlock, centralBlock, eocd]);
}

function crc32(buf) {
    let table = crc32.table;
    if (!table) {
        table = new Int32Array(256);
        for (let i = 0; i < 256; i++) {
            let c = i;
            for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            table[i] = c;
        }
        crc32.table = table;
    }
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ table[(c ^ buf[i]) & 0xFF];
    return (c ^ -1) >>> 0;
}

// Build a minimal ustar tar archive containing two entries:
//   <wrapper>/                  (directory)
//   <wrapper>/manifest.json     (file with the same JSON the ZIP carries)
// Then gzip-wrap it so the route returns a valid `.tar.gz` matching what
// codeload.github.com serves for /archive/refs/heads/<branch>.tar.gz.
// `wrapper` mirrors GitHub's "<repo>-<branch>" naming so install.sh's
// --strip-components=1 collapses it cleanly. Used by the AC-2
// (main-branch fallback) path.
function buildFakeTarGz(wrapper) {
    const manifest = JSON.stringify({
        manifest_version: 3,
        name: 'Marco Mock (main)',
        version: '0.0.0-main',
    });
    const blocks = [];
    blocks.push(makeTarHeader(`${wrapper}/`, 0, '5'));   // directory
    const fileBuf = Buffer.from(manifest);
    blocks.push(makeTarHeader(`${wrapper}/manifest.json`, fileBuf.length, '0'));
    blocks.push(padTo512(fileBuf));
    // Two 512-byte zero blocks terminate a tar archive.
    blocks.push(Buffer.alloc(1024));
    const tar = Buffer.concat(blocks);
    return zlib.gzipSync(tar);
}

function padTo512(buf) {
    const pad = (512 - (buf.length % 512)) % 512;
    return pad === 0 ? buf : Buffer.concat([buf, Buffer.alloc(pad)]);
}

function makeTarHeader(name, size, typeflag) {
    // ustar header is 512 bytes. We populate name, mode, uid, gid, size,
    // mtime, typeflag, magic, version. Checksum is computed last.
    const header = Buffer.alloc(512);
    header.write(name.slice(0, 100), 0, 100, 'utf8');
    header.write('0000644 \0', 100, 8, 'utf8');     // mode
    header.write('0000000 \0', 108, 8, 'utf8');     // uid
    header.write('0000000 \0', 116, 8, 'utf8');     // gid
    header.write(size.toString(8).padStart(11, '0') + ' ', 124, 12, 'utf8');
    header.write('00000000000 ', 136, 12, 'utf8');  // mtime (epoch)
    // Checksum field — fill with spaces for the calculation, write later.
    header.write('        ', 148, 8, 'utf8');
    header.write(typeflag, 156, 1, 'utf8');
    header.write('ustar\0', 257, 6, 'utf8');
    header.write('00', 263, 2, 'utf8');
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += header[i];
    header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'utf8');
    return header;
}

const server = http.createServer((req, res) => {
    log(req.method, req.url);
    const url = new URL(req.url, 'http://localhost');

    // ── /repos/:owner/:repo/releases/latest ──────────────────────────
    const latestMatch = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/releases\/latest$/);
    if (latestMatch && req.method === 'GET') {
        if (API_FAIL === 'timeout') {
            // Hold the connection open until the client times out.
            return; // intentionally never call res.end()
        }
        if (API_FAIL === '1') {
            res.writeHead(503, { 'content-type': 'application/json' });
            return res.end('{}');
        }
        // AC-2 — repo reachable but reports zero releases.
        // ZERO_RELEASES === '404' mirrors GitHub's actual behavior; '1'
        // returns a 200 with an empty-object body. install.sh treats
        // both as the main-branch trigger.
        if (ZERO_RELEASES === '404') {
            res.writeHead(404, { 'content-type': 'application/json' });
            return res.end('{"message":"Not Found"}');
        }
        if (ZERO_RELEASES === '1' || ZERO_RELEASES.toLowerCase() === 'true') {
            res.writeHead(200, { 'content-type': 'application/json' });
            return res.end('{}');
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ tag_name: LATEST_TAG, name: LATEST_TAG }));
    }

    // ── HEAD /repos/:owner/:repo (sibling discovery probe) ───────────
    const repoMatch = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)$/);
    if (repoMatch && req.method === 'HEAD') {
        const repo = repoMatch[2];
        const status = SIBLINGS.has(repo) ? SIBLINGS.get(repo) : 404;
        res.writeHead(status);
        return res.end();
    }

    // ── GET /:owner/:repo/releases/download/:tag/checksums.txt ──────
    // Must come BEFORE the generic asset route below — otherwise the
    // 4-segment regex would treat "checksums.txt" as just another asset
    // name and try to serve a fake zip for it.
    const checksumMatch = url.pathname.match(/^\/([^/]+)\/([^/]+)\/releases\/download\/([^/]+)\/checksums\.txt$/);
    if (checksumMatch && req.method === 'GET') {
        if (CHECKSUM_MODE === 'missing') {
            res.writeHead(404, { 'content-type': 'text/plain' });
            return res.end('Not Found');
        }
        const tag = checksumMatch[3];
        const assetName = `marco-extension-${tag}.zip`;
        const zip = buildFakeZip(tag);
        const realHash = crypto.createHash('sha256').update(zip).digest('hex');
        const hash = CHECKSUM_MODE === 'wrong'
            ? '0'.repeat(64)
            : realHash;
        const body = `${hash}  ${assetName}\n`;
        res.writeHead(200, {
            'content-type': 'text/plain',
            'content-length': Buffer.byteLength(body),
        });
        return res.end(body);
    }

    // ── GET /:owner/:repo/releases/download/:tag/:asset ──────────────
    const dlMatch = url.pathname.match(/^\/([^/]+)\/([^/]+)\/releases\/download\/([^/]+)\/([^/]+)$/);
    if (dlMatch && req.method === 'GET') {
        const tag = dlMatch[3];
        if (MISSING_ASSETS.has(tag)) {
            res.writeHead(404, { 'content-type': 'text/plain' });
            return res.end('Not Found');
        }
        const zip = buildFakeZip(tag);
        res.writeHead(200, {
            'content-type': 'application/zip',
            'content-length': zip.length,
        });
        return res.end(zip);
    }


    // ── GET /:owner/:repo/archive/refs/heads/:branch.tar.gz ──────────
    // Spec §2 step 5 / AC-2 — main-branch fallback target. Mirrors
    // codeload.github.com's tarball route. Served only when the requested
    // branch matches MAIN_BRANCH (default "main"); other branches 404 so
    // wrong-branch installs surface as exit 5 cleanly.
    const tarMatch = url.pathname.match(/^\/([^/]+)\/([^/]+)\/archive\/refs\/heads\/(.+)\.tar\.gz$/);
    if (tarMatch && req.method === 'GET') {
        const repo = tarMatch[2];
        const branch = tarMatch[3];
        if (branch !== MAIN_BRANCH) {
            res.writeHead(404, { 'content-type': 'text/plain' });
            return res.end('Not Found');
        }
        const tarball = buildFakeTarGz(`${repo}-${branch}`);
        res.writeHead(200, {
            'content-type': 'application/gzip',
            'content-length': tarball.length,
        });
        return res.end(tarball);
    }


    // ── Fallback ─────────────────────────────────────────────────────
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end(`mock-server: no route for ${req.method} ${url.pathname}\n`);
});

server.listen(PORT, '127.0.0.1', () => {
    const addr = server.address();
    const resolvedPort = addr.port;
    // Atomic write: temp file → rename, so readers never see a partial port.
    const tmp = `${PORT_FILE}.tmp`;
    fs.writeFileSync(tmp, String(resolvedPort));
    fs.renameSync(tmp, PORT_FILE);
    process.stderr.write(`[mock] listening on http://127.0.0.1:${resolvedPort} (port file: ${PORT_FILE})\n`);
});

function shutdown() {
    log('shutting down');
    try { fs.unlinkSync(PORT_FILE); } catch { /* ignore */ }
    server.close(() => process.exit(0));
    // Force-exit if shutdown stalls.
    setTimeout(() => process.exit(0), 1000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
