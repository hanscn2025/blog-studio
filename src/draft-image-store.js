const databaseName = "hans-blog-draft-images";
const objectStore = "images";
const storedIds = new Set();

function database() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error("浏览器不支持图片本地存储"));
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(objectStore);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function persistDraftImages(drafts) {
  const images = drafts.flatMap(draft => draft.pendingImages || []).filter(image => image.id && image.src && !storedIds.has(image.id));
  if (!images.length) return;
  const db = await database();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(objectStore, "readwrite");
      for (const image of images) transaction.objectStore(objectStore).put(image.src, image.id);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    for (const image of images) storedIds.add(image.id);
  } finally { db.close(); }
}

export async function hydrateDraftImages(drafts) {
  const missing = drafts.flatMap(draft => draft.pendingImages || []).filter(image => image.id && !image.src);
  if (!missing.length) return drafts;
  const db = await database();
  try {
    const sources = new Map();
    for (const image of missing) {
      const src = await new Promise((resolve, reject) => {
        const request = db.transaction(objectStore).objectStore(objectStore).get(image.id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      if (!src) throw new Error("草稿图片恢复失败，请勿清理浏览器数据");
      sources.set(image.id, src);
      storedIds.add(image.id);
    }
    return drafts.map(draft => ({ ...draft, pendingImages: (draft.pendingImages || []).map(image => image.src ? image : { ...image, src: sources.get(image.id) }) }));
  } finally { db.close(); }
}

export function draftsWithoutImageData(drafts) {
  return drafts.map(draft => ({ ...draft, pendingImages: (draft.pendingImages || []).map(({ src, ...image }) => image) }));
}
