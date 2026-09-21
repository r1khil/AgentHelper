/** Pending audio stays in IndexedDB until the server confirms its upload. */
export type LocalPart = { key: string; callId: string; seq: number; blob: Blob; mimeType: string; offset: number; duration: number };
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open("owl-call-audio", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("parts", { keyPath: "key" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function change(mode: IDBTransactionMode, action: (store: IDBObjectStore) => void) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("parts", mode);
      action(tx.objectStore("parts"));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("Audio could not be saved locally."));
    });
  } finally {
    db.close();
  }
}
export const saveLocalPart = (p: LocalPart) =>
  change("readwrite", (s) => {
    s.put(p);
  });
export const removeLocalPart = (key: string) =>
  change("readwrite", (s) => {
    s.delete(key);
  });
export async function localParts(callId: string): Promise<LocalPart[]> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction("parts", "readonly").objectStore("parts").getAll();
      req.onsuccess = () => resolve((req.result as LocalPart[]).filter((p) => p.callId === callId).sort((a, b) => a.seq - b.seq));
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}
