const DB_NAME = "clearmap_history";
const STORE_NAME = "batches";
const DB_VERSION = 2;

export interface CachedBatch {
  id: number;
  alerts: { time: number; cities: string[]; threat: number; isDrill: boolean }[];
  cachedAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      // Delete old store if exists
      if (db.objectStoreNames.contains("daily_alerts")) {
        db.deleteObjectStore("daily_alerts");
      }
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Get all cached batch IDs */
export async function getCachedBatchIds(): Promise<Set<number>> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAllKeys();
      request.onsuccess = () => resolve(new Set(request.result as number[]));
      request.onerror = () => resolve(new Set());
      tx.oncomplete = () => db.close();
    });
  } catch {
    return new Set();
  }
}

/** Get cached batches by IDs */
export async function getCachedBatches(ids: number[]): Promise<CachedBatch[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const results: CachedBatch[] = [];
      let pending = ids.length;
      if (pending === 0) { db.close(); resolve([]); return; }
      for (const id of ids) {
        const req = store.get(id);
        req.onsuccess = () => {
          if (req.result) results.push(req.result);
          if (--pending === 0) resolve(results);
        };
        req.onerror = () => {
          if (--pending === 0) resolve(results);
        };
      }
      tx.oncomplete = () => db.close();
    });
  } catch {
    return [];
  }
}

/** Cache multiple batches */
export async function cacheBatches(batches: CachedBatch[]): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      for (const b of batches) store.put(b);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); };
    });
  } catch {
    // quota exceeded — silently fail
  }
}
