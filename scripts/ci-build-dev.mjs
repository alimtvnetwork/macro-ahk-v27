#!/usr/bin/env node
/**
 * ci-build-dev.mjs
 *
 * Single-entry CI build wrapper that runs the prebuild guards and
 * `vite build --mode development` as one orchestrated pipeline.
 *
 * Why this exists:
 *   The transient "result-webhook.ts missing" failure was hard to diagnose
 *   because each step ran as an opaque `&&`-chained shell command. This
 *   wrapper executes each step as a child process and emits structured,
 *   actionable logs (step name, duration, exit code, stdout/stderr tail,
 *   and a remediation hint) so CI logs make the root cause obvious.
 *
 * Policy compliance:
 *   - No retries (fail-fast, single-attempt) per `mem://constraints/no-retry-policy`.
 *   - Sequential execution; stops at first failure.
 */

import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";

const STEPS = [
  {
    name: "prebuild:clean-verify",
    cmd: "node",
    args: ["scripts/prebuild-clean-and-verify.mjs"],
    hint: "Cache clear + step-library verification. If this fails, the forensic dump above lists exact paths, missing items, and reasoning. Restore the missing file from source control or update EXPECTED_STEP_LIBRARY_FILES.",
  },
  {
    name: "check:step-library-files",
    cmd: "node",
    args: ["scripts/check-step-library-files.mjs"],
    hint: "Validates every expected step-library source file before Vite runs. Restore missing files from source control, or update EXPECTED_STEP_LIBRARY_FILES if a removal was intentional.",
  },
  {
    name: "check:result-webhook",
    cmd: "node",
    args: ["scripts/check-result-webhook.mjs"],
    hint: "Validates result-webhook module shape. Inspect the script output for the failing assertion.",
  },
  {
    name: "check:result-webhook-imports",
    cmd: "node",
    args: ["scripts/check-result-webhook-imports.mjs"],
    hint: "Flags imports pointing at the step-library folder instead of the explicit file. Update offending imports to `.../step-library/result-webhook`.",
  },
  {
    name: "verify:worktree-fresh",
    cmd: "node",
    args: ["scripts/verify-worktree-fresh.mjs"],
    hint: "Confirms critical source files are present, non-empty, and stable across a 250ms settle (re-read from disk, hashed twice). If this fails, the working tree is mid-checkout or a writer is still active — wait for it to finish and re-run.",
  },
  {
    name: "vite:build:dev",
    cmd: "npx",
    args: ["vite", "build", "--mode", "development"],
    hint: "Vite/Rollup bundling. ENOENT here usually means a source file vanished mid-build (cache mismatch) — re-run `pnpm prebuild:clean-verify` and inspect its forensic dump.",
  },
];

function runStep(step) {
  return new Promise((resolve) => {
    const start = performance.now();
    const stdoutChunks = [];
    const stderrChunks = [];

    process.stdout.write(`\n▶ [ci-build-dev] ${step.name} — ${step.cmd} ${step.args.join(" ")}\n`);

    const child = spawn(step.cmd, step.args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });

    child.stdout.on("data", (b) => {
      stdoutChunks.push(b);
      process.stdout.write(b);
    });
    child.stderr.on("data", (b) => {
      stderrChunks.push(b);
      process.stderr.write(b);
    });

    child.on("close", (code, signal) => {
      const durationMs = Math.round(performance.now() - start);
      resolve({
        step,
        code: code ?? -1,
        signal,
        durationMs,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
      });
    });

    child.on("error", (err) => {
      const durationMs = Math.round(performance.now() - start);
      resolve({
        step,
        code: -1,
        signal: null,
        durationMs,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: `${Buffer.concat(stderrChunks).toString("utf8")}\n[spawn error] ${err.message}`,
      });
    });
  });
}

function tail(text, lines = 30) {
  const arr = text.split(/\r?\n/);
  return arr.slice(Math.max(0, arr.length - lines)).join("\n");
}

function reportFailure(result) {
  const { step, code, signal, durationMs, stdout, stderr } = result;
  process.stderr.write(
    [
      "",
      "================================================================",
      "❌ [ci-build-dev] BUILD FAILED",
      "================================================================",
      `Step          : ${step.name}`,
      `Command       : ${step.cmd} ${step.args.join(" ")}`,
      `Exit code     : ${code}${signal ? ` (signal ${signal})` : ""}`,
      `Duration      : ${durationMs} ms`,
      `Timestamp     : ${new Date().toISOString()}`,
      "",
      "── stdout (last 30 lines) ──────────────────────────────────────",
      tail(stdout) || "(empty)",
      "",
      "── stderr (last 30 lines) ──────────────────────────────────────",
      tail(stderr) || "(empty)",
      "",
      "── remediation ─────────────────────────────────────────────────",
      step.hint,
      "================================================================",
      "",
    ].join("\n"),
  );
}

async function main() {
  const overallStart = performance.now();
  const summary = [];

  for (const step of STEPS) {
    const result = await runStep(step);
    summary.push({
      name: step.name,
      code: result.code,
      durationMs: result.durationMs,
    });

    if (result.code !== 0) {
      reportFailure(result);
      process.stderr.write("── pipeline summary ────────────────────────────────────────────\n");
      for (const s of summary) {
        process.stderr.write(`  ${s.code === 0 ? "✓" : "✗"} ${s.name}  (${s.durationMs} ms, exit ${s.code})\n`);
      }
      process.exit(result.code === 0 ? 1 : result.code);
    }
  }

  const totalMs = Math.round(performance.now() - overallStart);
  process.stdout.write("\n✅ [ci-build-dev] All steps passed.\n");
  for (const s of summary) {
    process.stdout.write(`   ✓ ${s.name}  (${s.durationMs} ms)\n`);
  }
  process.stdout.write(`   total: ${totalMs} ms\n`);
}

main().catch((err) => {
  process.stderr.write(`\n❌ [ci-build-dev] Unexpected orchestrator error: ${err?.stack ?? err}\n`);
  process.exit(1);
});
