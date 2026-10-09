'use strict';
// ---------- 原版主世界地形接入 ----------
// 依赖 assets/vanilla/worldgen.js（tools/build_worldgen.mjs 生成：deepslate 源码 + 本机客户端 worldgen 数据 + 生成核心）。
// 流程（仿原版区块状态）：后台线程生成「原始地形」（方块 + 每列地面高度 + 生物群系）放进缓存；
// 一个区块周围 3x3 的原始地形都到齐后，主线程才放矿石、花草、树木、结构（跨区块的树才能对齐）。
// 缺少原版数据时 VWG.ok = false，世界退回旧的程序地形。

const VWG = {
  ok: typeof window.WG_DATA === 'object' && typeof window.WG_DEEPSLATE_SRC === 'string' && typeof window.WG_CORE_SRC === 'string',
  core: null, seed: null, url: null,
  workers: [],            // { w, job }
  queue: [],              // 待生成的区块 [cx, cz]
  queued: new Set(),      // key -> 已排队或正在生成
  protos: new Map(),      // key -> { blocks?: Uint16Array(本作方块 id), ground: Int16Array(256 内部 y), surf: string[256], cave: string[256] }
  cols: new Map(),        // 'x,z' -> 主线程单点查询结果缓存
  center: [0, 0],
};

// 原版方块名 -> 本作方块（同名直接用；没有的就近替代）
const VWG_FALLBACK = {
  grass_block: 'grass_block', powder_snow: 'snow_block', mud: 'dirt', muddy_mangrove_roots: 'dirt', mangrove_roots: 'oak_log',
  raw_copper_block: 'copper_block', raw_iron_block: 'iron_block', dripstone_block: 'stone', sculk: 'deepslate', smooth_basalt: 'deepslate',
  blue_ice: 'packed_ice', red_sandstone: 'sandstone', mycelium: 'grass_block', podzol: 'dirt', coarse_dirt: 'dirt',
};
const VWG_IDS = new Map();
function vwgBlockId(name) {
  let id = VWG_IDS.get(name);
  if (id !== undefined) return id;
  const n = name.startsWith('minecraft:') ? name.slice(10) : name;
  id = B[n] !== undefined ? B[n] : (VWG_FALLBACK[n] && B[VWG_FALLBACK[n]] !== undefined ? B[VWG_FALLBACK[n]] : B.stone);
  VWG_IDS.set(name, id);
  return id;
}
const vwgBiomeName = n => n.startsWith('minecraft:') ? n.slice(10) : n;

function vwgInit(seed) {
  if (!VWG.ok) return false;
  if (VWG.seed === seed) return true;
  try {
    if (!VWG.core) {
      (0, eval)(window.WG_DEEPSLATE_SRC); // UMD：挂到 globalThis.deepslate
      VWG.core = new Function('deepslate', 'WG_DATA', window.WG_CORE_SRC + '\nreturn { init: init, genChunk: genChunk, column: column, locate: locate, biomeOf: biomeOf };')(window.deepslate, window.WG_DATA);
      VWG.url = URL.createObjectURL(new Blob([window.WG_DEEPSLATE_SRC, '\n;var WG_DATA = ', JSON.stringify(window.WG_DATA), ';\n', window.WG_CORE_SRC], { type: 'text/javascript' }));
    }
    VWG.core.init(seed);
  } catch (e) { console.error('[原版地形] 初始化失败，退回旧地形', e); VWG.ok = false; return false; }
  for (const k of VWG.workers) k.w.terminate();
  VWG.workers = [];
  const n = Math.max(2, Math.min(6, (navigator.hardwareConcurrency || 4) - 2));
  for (let i = 0; i < n; i++) {
    const w = new Worker(VWG.url), slot = { w, job: null };
    w.onmessage = e => vwgOnMessage(slot, e.data);
    w.onerror = e => console.error('[原版地形] 后台线程出错', e.message);
    w.postMessage({ type: 'init', seed });
    VWG.workers.push(slot);
  }
  VWG.seed = seed; VWG.protos.clear(); VWG.cols.clear(); VWG.queue = []; VWG.queued.clear();
  return true;
}

// 后台线程结果 -> 本作方块 id 的原始地形
function vwgStoreProto(cx, cz, r) {
  const ids = r.palette.map(vwgBlockId);
  const blocks = new Uint16Array(r.data.length);
  for (let i = 0; i < blocks.length; i++) blocks[i] = ids[r.data[i]];
  const ground = new Int16Array(256);
  for (let i = 0; i < 256; i++) {
    let y = r.height[i];
    // 地面 = 最高的非空气非流体方块（同 OCEAN_FLOOR 高度图）
    while (y > 0) { const id = blocks[(y << 8) | i]; if (id && !isLiquid(id)) break; y--; }
    ground[i] = y;
  }
  VWG.protos.set(ckey(cx, cz), { blocks, ground, surf: r.surf.map(vwgBiomeName), cave: r.cave.map(vwgBiomeName) });
}
function vwgOnMessage(slot, m) {
  if (m.type === 'chunk') { vwgStoreProto(m.cx, m.cz, m); VWG.queued.delete(ckey(m.cx, m.cz)); slot.job = null; vwgPump(); }
  else if (m.type === 'error') { console.error('[原版地形] 生成失败', m.message); if (slot.job) VWG.queued.delete(ckey(slot.job[0], slot.job[1])); slot.job = null; vwgPump(); }
}
function vwgRequest(cx, cz) {
  const k = ckey(cx, cz);
  if (VWG.protos.has(k) || VWG.queued.has(k)) return;
  VWG.queued.add(k); VWG.queue.push([cx, cz]);
}
// 空闲的后台线程按离玩家由近到远领活
function vwgPump() {
  if (!VWG.queue.length) return;
  const [px, pz] = VWG.center;
  VWG.queue.sort((a, b) => ((b[0] - px) ** 2 + (b[1] - pz) ** 2) - ((a[0] - px) ** 2 + (a[1] - pz) ** 2));
  for (const s of VWG.workers) {
    if (s.job || !VWG.queue.length) continue;
    const j = VWG.queue.pop(); s.job = j;
    s.w.postMessage({ type: 'gen', cx: j[0], cz: j[1] });
  }
}
// 每帧：记录玩家位置；丢掉离得太远的排队任务和原始地形
function vwgTick(cx, cz, keepR) {
  VWG.center = [cx, cz];
  if (VWG.queue.length) VWG.queue = VWG.queue.filter(j => { const ok = Math.max(Math.abs(j[0] - cx), Math.abs(j[1] - cz)) <= keepR; if (!ok) VWG.queued.delete(ckey(j[0], j[1])); return ok; });
  if (VWG.protos.size > 1500) for (const [k, p] of VWG.protos) { const [x, z] = k.split(',').map(Number); if (Math.max(Math.abs(x - cx), Math.abs(z - cz)) > keepR + 6) VWG.protos.delete(k); }
  if (VWG.cols.size > 60000) VWG.cols.clear();
  vwgPump();
}
// 同步生成（传送门等必须立刻拿到区块时，在主线程算）
function vwgGenSync(cx, cz) {
  const k = ckey(cx, cz);
  if (VWG.protos.has(k)) return;
  vwgStoreProto(cx, cz, VWG.core.genChunk(cx, cz));
}

// 某一列的地面信息：有原始地形就读真值，否则主线程单点估算（结构选址用）
function vwgColumn(x, z) {
  const p = VWG.protos.get(ckey(x >> 4, z >> 4));
  let h, vb;
  if (p) { const i = (z & 15) * 16 + (x & 15); h = p.ground[i]; vb = p.surf[i]; }
  else {
    const k = x + ',' + z;
    let c = VWG.cols.get(k);
    if (!c) { const r = VWG.core.column(x, z); c = { h: r.h + 64, vb: vwgBiomeName(r.biome.toString()) }; VWG.cols.set(k, c); }
    h = c.h; vb = c.vb;
  }
  const bi = BIOMES[vb] || BIOMES.plains;
  return { h, biome: bi.cat || vb, vbiome: vb, mf: bi.cat === 'stony_peaks' || bi.cat === 'snowy_peaks' ? 1 : 0, t: bi.temp === undefined ? 0.5 : bi.temp };
}

// 找某类生物群系（名字可以是原版名，也可以是本作类别名）
function vwgLocate(target, ox, oz) {
  const names = Object.keys(BIOMES).filter(n => n === target || BIOMES[n].cat === target).map(n => 'minecraft:' + n);
  if (!names.length) return null;
  const r = VWG.core.locate(names, ox, oz, 6400);
  return r ? [r.x, r.z, Math.round(Math.hypot(r.x - ox, r.z - oz))] : null;
}

// 原版矿石分布（原版 Y；三角分布 = 两个均匀随机数的平均）：[名字, 每区块次数, Y 下限, Y 上限, 矿脉大小, 三角?]
const VWG_ORES = [
  ['coal', 30, 136, 320, 17, false], ['coal', 20, 0, 192, 17, true],
  ['iron', 90, 80, 384, 9, true], ['iron', 10, -24, 56, 9, true], ['iron', 10, -64, 72, 4, false],
  ['copper', 16, -16, 112, 10, true], ['gold', 4, -64, 32, 9, true], ['redstone', 4, -64, 15, 8, false], ['redstone', 8, -96, -32, 8, true],
  ['lapis', 2, -32, 32, 7, true], ['lapis', 4, -64, 64, 7, false], ['diamond', 7, -144, 16, 4, true], ['diamond', 4, -144, 16, 8, true],
];

// 世界类上的原版路径（world.js 在 overworld 且 VWG 可用时调用）
Object.assign(World.prototype, {
  generateVanilla(cx, cz, sync) {
    const key = ckey(cx, cz), sv = this.saved.get(key);
    if (sv) {
      const ch = new Chunk(cx, cz);
      ch.blocks.set(sv.b); ch.meta.set(sv.m); ch.modified = true;
      if (sv.bi) for (let i = 0; i < 256; i++) ch.biome[i] = sv.bi[i];
      else { const p = VWG.protos.get(key); if (!p) { if (!sync) { vwgRequest(cx, cz); return null; } vwgGenSync(cx, cz); } const q = VWG.protos.get(key); for (let i = 0; i < 256; i++) ch.biome[i] = q.surf[i]; }
      this.chunks.set(key, ch); this._last = null; this.initLight(ch);
      return ch;
    }
    // 3x3 原始地形齐了才落地
    let missing = false;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const k = ckey(cx + dx, cz + dz);
      if (VWG.protos.has(k) && (dx || dz || VWG.protos.get(k).blocks)) continue;
      if (sync) vwgGenSync(cx + dx, cz + dz); else { vwgRequest(cx + dx, cz + dz); missing = true; }
    }
    if (missing) return null;
    const p = VWG.protos.get(key);
    if (!p.blocks) { VWG.protos.delete(key); if (!sync) { vwgRequest(cx, cz); return null; } vwgGenSync(cx, cz); return this.generateVanilla(cx, cz, sync); }
    const ch = new Chunk(cx, cz);
    ch.blocks.set(p.blocks); p.blocks = null; // 方块只用一次；高度和生物群系留给邻居查询
    for (let i = 0; i < 256; i++) ch.biome[i] = p.surf[i];
    const cols = new Array(18 * 18);
    for (let z = -1; z <= 16; z++) for (let x = -1; x <= 16; x++) cols[(z + 1) * 18 + x + 1] = this.columnInfo(cx * 16 + x, cz * 16 + z);
    this.freezeTop(ch);
    this.genOresVanilla(ch);
    this.genDecor(ch, cols);
    this.genTrees(ch);
    this.genStructures(ch, cols);
    for (const f of FEATURES) if (f.genChunk) f.genChunk(this, ch, cols);
    this.chunks.set(key, ch); this._last = null;
    this.initLight(ch);
    return ch;
  },
  // 原版 freeze_top_layer：寒冷生物群系里海平面的水结冰、草方块盖雪
  freezeTop(ch) {
    const b = ch.blocks;
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const bi = BIOMES[ch.biome[z * 16 + x]]; if (!bi || !bi.snowy) continue;
      let y = CH - 1; while (y > 0 && b[idx3(x, y, z)] === 0) y--;
      const id = b[idx3(x, y, z)];
      if (id === B.water) b[idx3(x, y, z)] = B.ice;
      else if (id === B.grass_block) b[idx3(x, y, z)] = B.snowy_grass;
    }
  },
  genOresVanilla(ch) {
    const r = mulberry32(hash3(this.seed, ch.cx, 999, ch.cz)), b = ch.blocks;
    const bio = BIOMES[ch.biome[8 * 16 + 8]] || {};
    const list = VWG_ORES.slice();
    if (bio.cat === 'stony_peaks' || bio.cat === 'snowy_peaks') list.push(['emerald', 100, -16, 480, 3, true]);
    if (bio.cat === 'desert' && /badlands/.test(ch.biome[8 * 16 + 8])) list.push(['gold', 50, 32, 256, 9, false]);
    for (const [k, count, y0, y1, size, tri] of list) {
      for (let n = 0; n < count; n++) {
        const t = tri ? (r() + r()) / 2 : r();
        let y = Math.floor(y0 + t * (y1 - y0)) + 64, x = Math.floor(r() * 16), z = Math.floor(r() * 16);
        if (y < 1 || y >= CH - 1) continue;
        for (let s = 0; s < size; s++) {
          if (x >= 0 && x < 16 && z >= 0 && z < 16 && y > 0 && y < CH) {
            const i = idx3(x, y, z);
            if (b[i] === B.stone) b[i] = B[k + '_ore'];
            else if (b[i] === B.deepslate) b[i] = B['deepslate_' + k + '_ore'];
          }
          const d = Math.floor(r() * 6); x += DIRS[d][0]; y += DIRS[d][1]; z += DIRS[d][2];
        }
      }
    }
  },
});

// 原版生物群系并入 BIOMES（中文名、草/树叶/水颜色、降雪、装饰类别）
if (typeof window.VANILLA_BIOMES === 'object') {
  for (const [n, v] of Object.entries(window.VANILLA_BIOMES)) {
    if (/nether|end|void|basalt|soul_sand|crimson|warped|small_end|the_void/.test(n)) continue;
    BIOMES[n] = Object.assign({}, BIOMES[n] || {}, { zh: v.zh, grass: v.grass, foliage: v.foliage, water: v.water, snowy: v.snowy, dry: v.dry, temp: v.temp, cat: v.cat });
  }
}

// 原版地形会出现、本作原来没有的方块（贴图用原版 block/ 下同名贴图）
FEATURES.push({
  name: 'vanilla_terrain_blocks',
  blocks() {
    const T = n => 'vb_' + n;
    const d = (name, zh, o) => { if (B[name] === undefined) defBlock(name, zh, o); };
    d('coarse_dirt', '砂土', { tex: T('coarse_dirt'), hard: 0.5, tool: 'shovel', sound: 'gravel' });
    d('podzol', '灰化土', { tex: { top: T('podzol_top'), side: T('podzol_side'), bottom: T('dirt') }, hard: 0.5, tool: 'shovel', drop: 'dirt', sound: 'gravel' });
    d('mycelium', '菌丝', { tex: { top: T('mycelium_top'), side: T('mycelium_side'), bottom: T('dirt') }, hard: 0.6, tool: 'shovel', drop: 'dirt', sound: 'grass' });
    d('mud', '泥巴', { tex: T('mud'), hard: 0.5, tool: 'shovel', sound: 'gravel' });
    d('powder_snow', '细雪', { tex: T('powder_snow'), hard: 0.25, tool: 'shovel', solid: false, opaque: true, drop: null, sound: 'snow' });
    d('red_sandstone', '红砂岩', { tex: { top: T('red_sandstone_top'), side: T('red_sandstone'), bottom: T('red_sandstone_bottom') }, hard: 0.8, tool: 'pickaxe', tier: 1 });
    d('raw_copper_block', '粗铜块', { tex: T('raw_copper_block'), hard: 5, tool: 'pickaxe', tier: 2, sound: 'stone' });
    d('raw_iron_block', '粗铁块', { tex: T('raw_iron_block'), hard: 5, tool: 'pickaxe', tier: 2, sound: 'stone' });
    d('blue_ice', '蓝冰', { tex: T('blue_ice'), hard: 2.8, tool: 'pickaxe', drop: null, slip: 0.989, sound: 'glass' });
    d('dripstone_block', '滴水石块', { tex: T('dripstone_block'), hard: 1.5, tool: 'pickaxe', tier: 1 });
    d('sculk', '幽匿块', { tex: T('sculk'), hard: 0.2, tool: 'hoe' });
    d('smooth_basalt', '平滑玄武岩', { tex: T('smooth_basalt'), hard: 1.25, tool: 'pickaxe', tier: 1 });
  },
});
