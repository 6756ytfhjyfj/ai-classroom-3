import type { InkDocument } from "../../shared/protocol";
export interface Draft {
  key: string;
  document: InkDocument;
  serverRevision: number;
  savedAt: number;
}
function open() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open("classroom-private-drafts", 1);
    req.onupgradeneeded = () =>
      req.result.createObjectStore("ink", { keyPath: "key" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export async function loadDraft(key: string) {
  const db = await open();
  return new Promise<Draft | undefined>((resolve, reject) => {
    const t = db.transaction("ink", "readonly"),
      r = t.objectStore("ink").get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    t.oncomplete = () => db.close();
  });
}
export async function saveDraft(draft: Draft) {
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const t = db.transaction("ink", "readwrite");
    t.objectStore("ink").put(draft);
    t.oncomplete = () => {
      db.close();
      resolve();
    };
    t.onerror = () => reject(t.error);
  });
}
export async function clearUserDrafts(userId: string) {
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const t = db.transaction("ink", "readwrite"),
      store = t.objectStore("ink"),
      r = store.openCursor();
    r.onsuccess = () => {
      const c = r.result;
      if (c) {
        if (String(c.key).startsWith(userId + ":")) c.delete();
        c.continue();
      }
    };
    t.oncomplete = () => {
      db.close();
      resolve();
    };
    t.onerror = () => reject(t.error);
  });
}
