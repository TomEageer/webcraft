'use strict';
const WORLD_VER = 2;
// ---------- 存档（IndexedDB）：世界元数据 + 修改过的区块 ----------

const SaveDB = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      let req;
      try { req = indexedDB.open('webcraft', 1); } catch (e) { rej(e); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('worlds', { keyPath: 'id' });
        const cs = db.createObjectStore('chunks', { keyPath: 'key' });
        cs.createIndex('w', 'w');
      };
      req.onsuccess = () => { this.db = req.result; res(this.db); };
      req.onerror = () => rej(req.error);
    });
  },
  async tx(stores, mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const t = db.transaction(stores, mode);
      let out;
      t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
      out = fn(t);
    });
  },
  async listWorlds() {
    try {
      const all = await new Promise(async (res, rej) => {
        const db = await this.open();
        const r = db.transaction('worlds').objectStore('worlds').getAll();
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
      // 世界格式 2：高度 384（原版 -64..320）。旧格式的存档与新地形不兼容，按用户确认直接删除
      const old = all.filter(w => (w.ver || 1) < WORLD_VER);
      for (const w of old) await this.deleteWorld(w.id);
      return all.filter(w => (w.ver || 1) >= WORLD_VER).sort((a, b) => b.lastPlayed - a.lastPlayed);
    } catch (e) { console.warn('IndexedDB 不可用', e); return []; }
  },
  async getWorld(id) {
    const db = await this.open();
    return new Promise((res, rej) => { const r = db.transaction('worlds').objectStore('worlds').get(id); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  },
  async putWorld(meta) {
    try { await this.tx(['worlds'], 'readwrite', t => t.objectStore('worlds').put(meta)); } catch (e) { console.warn('保存世界失败', e); }
  },
  async putChunks(wid, list) {
    if (!list.length) return;
    try {
      await this.tx(['chunks'], 'readwrite', t => {
        const s = t.objectStore('chunks');
        for (const c of list) s.put({ key: wid + '|' + c.k, w: wid, k: c.k, b: c.b, m: c.m, bi: c.bi });
      });
    } catch (e) { console.warn('保存区块失败', e); }
  },
  async getChunks(wid) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const map = new Map();
      const r = db.transaction('chunks').objectStore('chunks').index('w').openCursor(IDBKeyRange.only(wid));
      r.onsuccess = () => { const c = r.result; if (c) { map.set(c.value.k, { b: c.value.b, m: c.value.m, bi: c.value.bi }); c.continue(); } else res(map); };
      r.onerror = () => rej(r.error);
    });
  },
  async deleteWorld(wid) {
    await this.tx(['worlds', 'chunks'], 'readwrite', t => {
      t.objectStore('worlds').delete(wid);
      const r = t.objectStore('chunks').index('w').openCursor(IDBKeyRange.only(wid));
      r.onsuccess = () => { const c = r.result; if (c) { c.delete(); c.continue(); } };
    });
  },
};
