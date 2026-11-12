/**
 * DocDock IndexedDB Document Storage Layer
 * 100% On-Device, Private Document Storage
 */

const DB_NAME = 'DocDockDB';
const DB_VERSION = 1;
const STORE_NAME = 'documents';

let dbInstance = null;

function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('name', 'name', { unique: false });
        store.createIndex('category', 'category', { unique: false });
        store.createIndex('type', 'type', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('IndexedDB open error:', event.target.error);
      reject(event.target.error);
    };
  });
}

/**
 * Add a new document to IndexedDB
 * @param {Object} docData
 * @param {string} docData.name - File name
 * @param {string} docData.type - MIME type
 * @param {number} docData.size - File size in bytes
 * @param {ArrayBuffer} docData.data - Raw binary data
 * @param {string} [docData.category='General'] - Category label
 * @param {string} [docData.thumbnail=''] - Data URL thumbnail
 * @returns {Promise<Object>} The saved document record (without raw data)
 */
async function addDocument(docData) {
  const db = await openDB();
  const id = 'doc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  const now = Date.now();

  const record = {
    id,
    name: docData.name || 'Untitled Document',
    type: docData.type || 'application/octet-stream',
    size: docData.size || (docData.data ? docData.data.byteLength : 0),
    category: docData.category || 'General',
    thumbnail: docData.thumbnail || '',
    data: docData.data, // Stored locally in IndexedDB as ArrayBuffer
    createdAt: now,
    updatedAt: now
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.add(record);

    request.onsuccess = () => {
      // Return metadata without heavy buffer for memory efficiency
      const { data, ...meta } = record;
      resolve(meta);
    };

    request.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Get all document metadata (excluding heavy data blobs)
 * @returns {Promise<Array<Object>>}
 */
async function getAllDocuments() {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.openCursor(null, 'prev');
    const documents = [];

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        const val = cursor.value;
        // Exclude raw ArrayBuffer for the list view
        const { data, ...meta } = val;
        documents.push(meta);
        cursor.continue();
      } else {
        resolve(documents);
      }
    };

    request.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Retrieve complete document record including ArrayBuffer data
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
async function getDocument(id) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = (event) => resolve(event.target.result || null);
    request.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Update document metadata (name, category)
 * @param {string} id
 * @param {Object} updates
 * @returns {Promise<boolean>}
 */
async function updateDocument(id, updates) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(id);

    getReq.onsuccess = (event) => {
      const record = event.target.result;
      if (!record) return reject(new Error('Document not found'));

      if (updates.name) record.name = updates.name;
      if (updates.category) record.category = updates.category;
      record.updatedAt = Date.now();

      const putReq = store.put(record);
      putReq.onsuccess = () => resolve(true);
      putReq.onerror = (e) => reject(e.target.error);
    };

    getReq.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Delete a document from IndexedDB
 * @param {string} id
 * @returns {Promise<boolean>}
 */
async function deleteDocument(id) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve(true);
    request.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Clear all documents from IndexedDB
 * @returns {Promise<boolean>}
 */
async function clearAllDocuments() {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => resolve(true);
    request.onerror = (event) => reject(event.target.error);
  });
}

// Export functions to global scope for extension scripts
window.DocDockDB = {
  openDB,
  addDocument,
  getAllDocuments,
  getDocument,
  updateDocument,
  deleteDocument,
  clearAllDocuments
};
