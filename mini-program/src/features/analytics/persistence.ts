// IndexedDB transactions keep queue serialization/storage away from business handlers.
export function createAnalyticsPersistence(key: string) {
  let pending: Promise<void> = Promise.resolve();
  function database(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('analytics storage unavailable')); return; }
      const request = indexedDB.open('nordic-analytics-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('state');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('analytics storage unavailable'));
      request.onblocked = () => reject(new Error('analytics storage blocked'));
    });
  }
  async function read(): Promise<unknown> {
    await pending;
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('state', 'readonly');
      const request = tx.objectStore('state').get(key);
      tx.oncomplete = () => { db.close(); resolve(request.result); };
      tx.onerror = tx.onabort = () => { db.close(); reject(new Error('analytics read unavailable')); };
    });
  }
  function write(value: unknown) {
    const operation = pending.catch(() => undefined).then(async () => {
      const db = await database();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('state', 'readwrite');
        tx.objectStore('state').put(value, key);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = tx.onabort = () => { db.close(); reject(new Error('analytics write unavailable')); };
      });
    });
    pending = operation.catch(() => undefined);
    return operation;
  }
  return { read, write };
}
