/**
 * db.js — Base de datos IndexedDB
 * Control de Pintores PWA
 */

const DB = (() => {
  const DB_NAME    = 'ControlPintores';
  const DB_VERSION = 2;
  let _db = null;

  function open() {
    return new Promise((resolve, reject) => {
      if (_db) { resolve(_db); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;

        if (!db.objectStoreNames.contains('painters')) {
          const ps = db.createObjectStore('painters', { keyPath: 'id', autoIncrement: true });
          ps.createIndex('name', 'name');
        }
        if (!db.objectStoreNames.contains('shifts')) {
          const ss = db.createObjectStore('shifts', { keyPath: 'id', autoIncrement: true });
          ss.createIndex('painterId', 'painterId');
          ss.createIndex('date', 'date');
        }
        if (!db.objectStoreNames.contains('payments')) {
          const py = db.createObjectStore('payments', { keyPath: 'id', autoIncrement: true });
          py.createIndex('painterId', 'painterId');
          py.createIndex('date', 'date');
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };

      req.onsuccess  = (e) => { _db = e.target.result; resolve(_db); };
      req.onerror    = (e) => reject(e.target.error);
    });
  }

  function tx(store, mode = 'readonly') {
    return _db.transaction(store, mode).objectStore(store);
  }

  function all(store) {
    return open().then(() => new Promise((res, rej) => {
      const r = tx(store).getAll();
      r.onsuccess = () => res(r.result);
      r.onerror   = () => rej(r.error);
    }));
  }

  function get(store, key) {
    return open().then(() => new Promise((res, rej) => {
      const r = tx(store).get(key);
      r.onsuccess = () => res(r.result);
      r.onerror   = () => rej(r.error);
    }));
  }

  function put(store, item) {
    return open().then(() => new Promise((res, rej) => {
      const r = tx(store, 'readwrite').put(item);
      r.onsuccess = () => res(r.result);
      r.onerror   = () => rej(r.error);
    }));
  }

  function remove(store, key) {
    return open().then(() => new Promise((res, rej) => {
      const r = tx(store, 'readwrite').delete(key);
      r.onsuccess = () => res(r.result);
      r.onerror   = () => rej(r.error);
    }));
  }

  function byIndex(store, indexName, value) {
    return open().then(() => new Promise((res, rej) => {
      const r = tx(store).index(indexName).getAll(value);
      r.onsuccess = () => res(r.result);
      r.onerror   = () => rej(r.error);
    }));
  }

  function getSetting(key) {
    return get('settings', key).then(r => r ? r.value : null);
  }

  function setSetting(key, value) {
    return put('settings', { key, value });
  }

  function clearAll() {
    return open().then(() => Promise.all(
      ['painters','shifts','payments'].map(store =>
        new Promise((res, rej) => {
          const r = tx(store, 'readwrite').clear();
          r.onsuccess = () => res();
          r.onerror   = () => rej(r.error);
        })
      )
    ));
  }

  return { open, all, get, put, remove, byIndex, getSetting, setSetting, clearAll };
})();
