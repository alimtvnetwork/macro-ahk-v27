/**
 * MacroLoop Controller — Project-Scoped IndexedDB Key-Value Store
 *
 * Generic, reusable IndexedDB wrapper. Any plugin/script can store
 * key-value data scoped to a project via section-based namespacing.
 *
 * DB Name:   RiseUpAsia.Projects.<ProjectName>.IndexDb
 * Store:     kv  (keyPath: "key")
 * Compound:  ${section}::${key}
 *
 * @see spec/21-app/02-features/macro-controller/ts-migration-v2/07-rename-persistence-indexeddb.md
 */

import { logError } from './error-utils';

const FN = 'ProjectKvStore';
const DB_VERSION = 1;
const STORE_NAME = 'kv';
const SEPARATOR = '::';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface KvRecord {
  key: string;       // compound: section::key
  section: string;
  value: unknown;
  updatedAt: number;
}

export interface ProjectKvStore {
  get<T = unknown>(section: string, key: string): Promise<T | null>;
  set<T = unknown>(section: string, key: string, value: T): Promise<void>;
  delete(section: string, key: string): Promise<void>;
  list(section: string): Promise<Array<{ key: string; value: unknown }>>;
  getAll(section: string): Promise<Record<string, unknown>>;
}

/* ------------------------------------------------------------------ */
/*  DB Name                                                            */
/* ------------------------------------------------------------------ */

function buildDbName(projectName: string): string {
  return 'RiseUpAsia.Projects.' + projectName + '.IndexDb';
}

function compoundKey(section: string, key: string): string {
  return section + SEPARATOR + key;
}

function stripSection(compound: string, section: string): string {
  return compound.substring(section.length + SEPARATOR.length);
}

/* ------------------------------------------------------------------ */
/*  Open Database                                                      */
/* ------------------------------------------------------------------ */

function openDb(dbName: string): Promise<IDBDatabase> {
  return new Promise(function (resolve, reject) {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(dbName, DB_VERSION);
    } catch (err) {
      logError(FN, 'IndexedDB open failed for DB "' + dbName + '"', err);
      reject(err);
      return;
    }

    request.onupgradeneeded = function () {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };

    request.onsuccess = function () {
      resolve(request.result);
    };

    request.onerror = function () {
      logError(FN, 'IndexedDB open error for DB "' + dbName + '"', request.error);
      reject(request.error);
    };
  });
}

/* ------------------------------------------------------------------ */
/*  Transaction Helpers                                                */
/* ------------------------------------------------------------------ */

function txGet<T>(db: IDBDatabase, key: string): Promise<T | null> {
  return new Promise(function (resolve, reject) {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(key);
    req.onsuccess = function () {
      const rec = req.result as KvRecord | undefined;
      resolve(rec ? (rec.value as T) : null);
    };
    req.onerror = function () { reject(req.error); };
  });
}

function txPut(db: IDBDatabase, record: KvRecord): Promise<void> {
  return new Promise(function (resolve, reject) {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(record);
    req.onsuccess = function () { resolve(); };
    req.onerror = function () { reject(req.error); };
  });
}

function txDelete(db: IDBDatabase, key: string): Promise<void> {
  return new Promise(function (resolve, reject) {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(key);
    req.onsuccess = function () { resolve(); };
    req.onerror = function () { reject(req.error); };
  });
}

function txGetAllBySection(db: IDBDatabase, section: string): Promise<KvRecord[]> {
  return new Promise(function (resolve, reject) {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = function () {
      const all = (req.result || []) as KvRecord[];
      resolve(all.filter(function (r) { return r.section === section; }));
    };
    req.onerror = function () { reject(req.error); };
  });
}

/* ------------------------------------------------------------------ */
/*  Factory                                                            */
/* ------------------------------------------------------------------ */

const dbCache: Record<string, IDBDatabase> = {};

async function getDb(projectName: string): Promise<IDBDatabase> {
  const dbName = buildDbName(projectName);
  if (dbCache[dbName]) {
    return dbCache[dbName];
  }
  const db = await openDb(dbName);
  dbCache[dbName] = db;
  return db;
}

// eslint-disable-next-line max-lines-per-function -- factory returning store interface with 5 async methods
export function getProjectKvStore(projectName: string): ProjectKvStore {
  const dbName = buildDbName(projectName);

  return {
    async get<T = unknown>(section: string, key: string): Promise<T | null> {
      try {
        const db = await getDb(projectName);
        return await txGet<T>(db, compoundKey(section, key));
      } catch (err) {
        logError(FN, 'get failed — DB "' + dbName + '", store "' + STORE_NAME + '", key "' + compoundKey(section, key) + '"', err);
        return null;
      }
    },

    async set<T = unknown>(section: string, key: string, value: T): Promise<void> {
      try {
        const db = await getDb(projectName);
        await txPut(db, {
          key: compoundKey(section, key),
          section,
          value,
          updatedAt: Date.now(),
        });
      } catch (err) {
        logError(FN, 'set failed — DB "' + dbName + '", store "' + STORE_NAME + '", key "' + compoundKey(section, key) + '"', err);
      }
    },

    async delete(section: string, key: string): Promise<void> {
      try {
        const db = await getDb(projectName);
        await txDelete(db, compoundKey(section, key));
      } catch (err) {
        logError(FN, 'delete failed — DB "' + dbName + '", store "' + STORE_NAME + '", key "' + compoundKey(section, key) + '"', err);
      }
    },

    async list(section: string): Promise<Array<{ key: string; value: unknown }>> {
      try {
        const db = await getDb(projectName);
        const records = await txGetAllBySection(db, section);
        return records.map(function (r) {
          return { key: stripSection(r.key, section), value: r.value };
        });
      } catch (err) {
        logError(FN, 'list failed — DB "' + dbName + '", section "' + section + '"', err);
        return [];
      }
    },

    async getAll(section: string): Promise<Record<string, unknown>> {
      try {
        const db = await getDb(projectName);
        const records = await txGetAllBySection(db, section);
        const result: Record<string, unknown> = {};
        for (const r of records) {
          result[stripSection(r.key, section)] = r.value;
        }
        return result;
      } catch (err) {
        logError(FN, 'getAll failed — DB "' + dbName + '", section "' + section + '"', err);
        return {};
      }
    },
  };
}
