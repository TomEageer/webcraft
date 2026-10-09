'use strict';
// ---------- 世界：区块存储、地形生成、光照、方块更新 ----------

// 世界高度 384：主世界内部 y = 原版 Y + 64（显示坐标见 dispY），海平面原版 63 = 内部 127；下界/末地只用 0..127
const CS = 16, CH = 384, SEA = 127;
const Y_OFF = { overworld: 64, nether: 0, end: 0 };
const dispY = (w, y) => y - (Y_OFF[(w && w.dim) || 'overworld'] || 0);
const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const idx3 = (x, y, z) => (y << 8) | (z << 4) | x;
const ckey = (cx, cz) => cx + ',' + cz;
const DIM_GEN = {};   // 维度名 -> (world, chunk, fromSave) => void
// 维度外观：sky 是否有天空光与日月；fog 雾色；ambient 最低亮度；fogNear/fogFar 相对渲染距离的雾范围
const DIM_INFO = {
  overworld: { zh: '主世界', sky: true, ambient: 0.025 },
  nether: { zh: '下界', sky: false, fog: 0x3a0c08, ambient: 0.16, fogNear: 0.15, fogFar: 0.75, entityLight: 0.4 },
  end: { zh: '末地', sky: false, fog: 0x15101e, ambient: 0.13, fogNear: 0.5, fogFar: 1.0 },
};
const FEATURES = [];  // 功能插件：见 docs/ARCHITECTURE.md 的钩子说明

const BIOMES = {
  ocean: { zh: '海洋', grass: [142, 185, 113], foliage: [113, 167, 77] },
  frozen_ocean: { zh: '冻洋', grass: [128, 180, 151], foliage: [96, 161, 123], snowy: true },
  beach: { zh: '沙滩', grass: [145, 189, 89], foliage: [119, 171, 47] },
  snowy_beach: { zh: '积雪的沙滩', grass: [128, 180, 151], foliage: [96, 161, 123], snowy: true },
  plains: { zh: '平原', grass: [145, 189, 89], foliage: [119, 171, 47] },
  forest: { zh: '森林', grass: [121, 192, 90], foliage: [89, 174, 48] },
  birch_forest: { zh: '桦木森林', grass: [136, 187, 103], foliage: [107, 169, 65] },
  taiga: { zh: '针叶林', grass: [134, 183, 131], foliage: [104, 164, 100] },
  snowy_taiga: { zh: '积雪的针叶林', grass: [128, 180, 151], foliage: [96, 161, 123], snowy: true },
  snowy_plains: { zh: '雪原', grass: [128, 180, 151], foliage: [96, 161, 123], snowy: true },
  desert: { zh: '沙漠', grass: [191, 183, 85], foliage: [174, 164, 42] },
  stony_peaks: { zh: '裸岩山峰', grass: [138, 182, 113], foliage: [110, 160, 80] },
  snowy_peaks: { zh: '尖峭山峰', grass: [128, 180, 151], foliage: [96, 161, 123], snowy: true },
  cherry_grove: { zh: '樱花树林', grass: [182, 219, 97], foliage: [182, 219, 97] },
  pale_garden: { zh: '苍白之园', grass: [119, 130, 114], foliage: [135, 141, 118] },
  dappled_forest: { zh: '斑驳森林', grass: [176, 172, 84], foliage: [170, 150, 70] },
};

class Chunk {
  constructor(cx, cz) {
    this.cx = cx; this.cz = cz;
    this.blocks = new Uint16Array(CS * CS * CH);
    this.meta = new Uint8Array(CS * CS * CH);
    this.light = new Uint8Array(CS * CS * CH);
    this.biome = new Array(CS * CS);
    this.meshes = null; this.dirty = true; this.modified = false; this.lit = false;
  }
}

class World {
  constructor(seed, saved, tiles, dim) {
    this.seed = seed | 0;
    this.dim = dim || 'overworld';
    this.hasSky = this.dim === 'overworld';
    this.chunks = new Map();
    this.saved = saved || new Map();     // key -> {b, m}
    this.tiles = tiles || new Map();     // "x,y,z" -> tile entity data
    this.nCont = new Noise(seed + 1); this.nMount = new Noise(seed + 2); this.nDetail = new Noise(seed + 3);
    this.nTemp = new Noise(seed + 4); this.nHum = new Noise(seed + 5);
    this.nCave1 = new Noise(seed + 6); this.nCave2 = new Noise(seed + 7); this.nCave3 = new Noise(seed + 8);
    this.nPale = new Noise(seed + 9); this.nSulfur = new Noise(seed + 10); this.nRiver = new Noise(seed + 11);
    this.nMisc = new Noise(seed + 12);
    this._last = null;
    this.scheduled = new Map(); // key -> tick
    this.tick = 0;
    this.hooks = { fallingBlock: null, dropItem: null, ignite: null, removed: null };
  }

  // ---------------- 区块访问 ----------------
  getChunk(cx, cz) {
    const l = this._last;
    if (l && l.cx === cx && l.cz === cz) return l;
    const c = this.chunks.get(ckey(cx, cz));
    if (c) this._last = c;
    return c;
  }
  getBlock(x, y, z) {
    if (y < 0) return B.bedrock; if (y >= CH) return 0;
    const c = this.getChunk(x >> 4, z >> 4);
    return c ? c.blocks[idx3(x & 15, y, z & 15)] : 0;
  }
  getMeta(x, y, z) {
    if (y < 0 || y >= CH) return 0;
    const c = this.getChunk(x >> 4, z >> 4);
    return c ? c.meta[idx3(x & 15, y, z & 15)] : 0;
  }
  setMeta(x, y, z, m) {
    const c = this.getChunk(x >> 4, z >> 4); if (!c) return;
    c.meta[idx3(x & 15, y, z & 15)] = m; c.modified = true; this.markDirty(x, y, z);
  }
  isLoaded(x, z) { return !!this.getChunk(x >> 4, z >> 4); }
  skyLight(x, y, z) {
    if (y >= CH) return this.hasSky ? 15 : 0; if (y < 0) return 0;
    const c = this.getChunk(x >> 4, z >> 4); return c ? c.light[idx3(x & 15, y, z & 15)] >> 4 : (this.hasSky ? 15 : 0);
  }
  blockLight(x, y, z) {
    if (y >= CH || y < 0) return 0;
    const c = this.getChunk(x >> 4, z >> 4); return c ? c.light[idx3(x & 15, y, z & 15)] & 15 : 0;
  }
  markDirty(x, y, z) {
    const cx = x >> 4, cz = z >> 4, lx = x & 15, lz = z & 15;
    const c = this.getChunk(cx, cz); if (c) c.dirty = true;
    const m = (dx, dz) => { const n = this.getChunk(cx + dx, cz + dz); if (n) n.dirty = true; };
    if (lx === 0) m(-1, 0); if (lx === 15) m(1, 0); if (lz === 0) m(0, -1); if (lz === 15) m(0, 1);
    if (lx === 0 && lz === 0) m(-1, -1); if (lx === 15 && lz === 0) m(1, -1);
    if (lx === 0 && lz === 15) m(-1, 1); if (lx === 15 && lz === 15) m(1, 1);
  }

  // ---------------- 地形函数 ----------------
  columnInfo(x, z) {
    if (this.dim === 'overworld' && typeof VWG !== 'undefined' && VWG.ok && vwgInit(this.seed)) return vwgColumn(x, z);
    const r = this.columnInfoOld(x, z);
    r.h += 64; // 旧程序地形整体抬高到新坐标系（内部 y = 原版 Y + 64）
    r.vbiome = r.biome;
    return r;
  }
  columnInfoOld(x, z) {
    let c = this.nCont.fbm2(x / 700, z / 700, 4) * 1.5;
    const d = this.nDetail.fbm2(x / 90, z / 90, 4);
    const mRaw = this.nMount.fbm2(x / 420, z / 420, 3);
    const mf = smoothstep(0.12, 0.5, mRaw);
    const ridge = 1 - Math.abs(this.nMount.n2(x / 130 + 50, z / 130 - 50));
    const a = smoothstep(-0.22, -0.05, c);
    let h;
    if (c < -0.22) h = 62 + (c + 0.22) * 90;
    else h = 62 + (c + 0.22) * 16 + a * (d * 9 + 2.5) + mf * a * (16 + 46 * ridge * ridge);
    const rv = Math.abs(this.nRiver.fbm2(x / 520, z / 520, 2));
    if (rv < 0.045 && c > -0.22 && mf < 0.6) h = lerp(h, 58.5, smoothstep(0.045, 0.012, rv) * (1 - mf));
    h = Math.floor(clamp(h, 26, 122));
    const t = this.nTemp.fbm2(x / 900, z / 900, 2) * 1.6 - (h > 90 ? (h - 90) / 40 : 0);
    const w = this.nHum.fbm2(x / 800 + 100, z / 800, 2) * 1.6;
    const pale = this.nPale.fbm2(x / 400, z / 400, 2) * 1.6;
    let biome;
    if (c < -0.22 && h < SEA) biome = t < -0.45 ? 'frozen_ocean' : 'ocean';
    else if (h >= 96 && mf > 0.3) biome = t < 0.25 ? 'snowy_peaks' : 'stony_peaks';
    else if (c < -0.13 && h <= 66) biome = t < -0.45 ? 'snowy_beach' : 'beach';
    else if (pale > 0.58 && t > -0.3 && t < 0.45) biome = 'pale_garden';
    else if (t > 0.42) biome = w < 0.15 ? 'desert' : 'plains';
    else if (t < -0.45) biome = w > 0.15 ? 'snowy_taiga' : 'snowy_plains';
    else if (t < -0.2) biome = 'taiga';
    else if (h > 74 && w > -0.05 && t > -0.05) biome = 'cherry_grove';
    else if (w > 0.2 && t < 0.12) biome = 'dappled_forest';
    else if (w > 0.45) biome = 'birch_forest';
    else if (w > 0.0) biome = 'forest';
    else biome = 'plains';
    return { h, biome, t, w, mf };
  }
  biomeAt(x, z) {
    if (this.dim === 'overworld' && typeof VWG !== 'undefined' && VWG.ok && vwgInit(this.seed)) {
      const c = this.getChunk(Math.floor(x) >> 4, Math.floor(z) >> 4);
      return c ? c.biome[(Math.floor(z) & 15) * 16 + (Math.floor(x) & 15)] : vwgColumn(Math.floor(x), Math.floor(z)).vbiome;
    }
    if (this.dim !== 'overworld') { const c = this.getChunk(Math.floor(x) >> 4, Math.floor(z) >> 4); return c ? c.biome[(Math.floor(z) & 15) * 16 + (Math.floor(x) & 15)] : this.dim; }
    return this.columnInfo(Math.floor(x), Math.floor(z)).biome;
  }
  inSulfurRegion(x, z) { return this.nSulfur.fbm2(x / 260, z / 260, 2) > 0.38; }

  // ---------------- 区块生成 ----------------
  generateChunk(cx, cz, sync) {
    // 原版地形：异步生成，还没好时返回 null（调用方下一帧再来）；sync 为真时在主线程立刻生成
    if (this.dim === 'overworld' && typeof VWG !== 'undefined' && VWG.ok && vwgInit(this.seed)) return this.generateVanilla(cx, cz, sync);
    const key = ckey(cx, cz);
    const ch = new Chunk(cx, cz);
    const sv = this.saved.get(key);
    if (this.dim !== 'overworld') {
      // 下界/末地：由各自的生成器填充（见 feature 文件中的 DIM_GEN）
      if (sv) { ch.blocks.set(sv.b); ch.meta.set(sv.m); ch.modified = true; if (DIM_GEN[this.dim]) DIM_GEN[this.dim](this, ch, true); }
      else if (DIM_GEN[this.dim]) DIM_GEN[this.dim](this, ch, false);
      else ch.biome.fill(this.dim);
      this.chunks.set(key, ch); this._last = null; this.initLight(ch);
      return ch;
    }
    // 列信息（含一圈填充，用于坡度判断）
    const cols = new Array(18 * 18);
    for (let z = -1; z <= 16; z++) for (let x = -1; x <= 16; x++) cols[(z + 1) * 18 + x + 1] = this.columnInfo(cx * 16 + x, cz * 16 + z);
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) ch.biome[z * 16 + x] = cols[(z + 1) * 18 + x + 1].biome;
    if (sv) {
      ch.blocks.set(sv.b); ch.meta.set(sv.m); ch.modified = true;
    } else {
      this.genTerrain(ch, cols);
      this.genCaves(ch, cols);
      this.genOres(ch);
      this.genDecor(ch, cols);
      this.genTrees(ch);
      this.genStructures(ch, cols);
      for (const f of FEATURES) if (f.genChunk) f.genChunk(this, ch, cols);
    }
    this.chunks.set(key, ch);
    this._last = null;
    this.initLight(ch);
    return ch;
  }

  genTerrain(ch, cols) {
    const bx = ch.cx * 16, bz = ch.cz * 16, b = ch.blocks, seed = this.seed;
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const ci = cols[(z + 1) * 18 + x + 1], h = ci.h, bio = ci.biome;
      const wx = bx + x, wz = bz + z;
      let steep = 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) steep = Math.max(steep, Math.abs(cols[(z + 1 + dz) * 18 + x + 1 + dx].h - h));
      const deepTop = 14 + Math.floor(rand3(seed, wx, 3, wz) * 4);
      let top, fill, fillDepth = 3 + Math.floor(rand3(seed, wx, 5, wz) * 2);
      const under = h < SEA;
      if (bio === 'desert' || bio === 'beach' || bio === 'snowy_beach') { top = B.sand; fill = B.sand; fillDepth = 4; }
      else if (bio === 'stony_peaks') { top = B.stone; fill = B.stone; }
      else if (bio === 'snowy_peaks') { top = steep > 3 ? B.stone : B.snow_block; fill = B.stone; }
      else if (BIOMES[bio].snowy) { top = B.snowy_grass; fill = B.dirt; }
      else { top = B.grass_block; fill = B.dirt; }
      if (steep >= 4 && top === B.grass_block && h > 80) { top = B.stone; fill = B.stone; }
      if (bio === 'pale_garden' && rand3(seed, wx, 9, wz) < 0.25) top = B.moss_block;
      if (under) {
        const g = this.nMisc.n2(wx / 20, wz / 20);
        top = h < SEA - 12 ? B.gravel : g > 0.4 ? B.gravel : g < -0.5 ? B.clay : (bio === 'ocean' || bio === 'frozen_ocean' || g > 0) ? B.sand : B.dirt;
        fill = top === B.clay ? B.clay : (top === B.gravel ? B.gravel : B.sand);
        if (bio !== 'ocean' && bio !== 'frozen_ocean' && h >= SEA - 6 && g <= 0.4 && g >= -0.5) { top = B.sand; fill = B.dirt; }
      }
      for (let y = 0; y < CH; y++) {
        let id = 0;
        if (y === 0) id = B.bedrock;
        else if (y <= 3 && rand3(seed, wx, y, wz) < (4 - y) / 4) id = B.bedrock;
        else if (y < h - fillDepth) id = y < deepTop ? B.deepslate : B.stone;
        else if (y < h) id = fill;
        else if (y === h) id = top;
        else if (y <= SEA) id = (y === SEA && (bio === 'frozen_ocean' || (BIOMES[bio].snowy && under))) ? B.ice : B.water;
        b[idx3(x, y, z)] = id;
      }
      if (bio === 'desert') for (let y = h - 7; y < h - 4; y++) if (y > 0) b[idx3(x, y, z)] = B.sandstone;
    }
  }

  genCaves(ch, cols) {
    const bx = ch.cx * 16, bz = ch.cz * 16, b = ch.blocks, n1 = this.nCave1, n2 = this.nCave2, n3 = this.nCave3;
    // 4x4x4 采样网格 + 三线性插值
    const SX = 5, SY = 33, cheese = new Float32Array(SX * SX * SY), spag = new Float32Array(SX * SX * SY);
    const sulfurCol = [];
    for (let gz = 0; gz < SX; gz++) for (let gx = 0; gx < SX; gx++) for (let gy = 0; gy < SY; gy++) {
      const wx = bx + gx * 4, wy = gy * 4, wz = bz + gz * 4, i = (gz * SX + gx) * SY + gy;
      cheese[i] = n1.n3(wx / 56, wy / 30, wz / 56);
      spag[i] = Math.abs(n2.n3(wx / 44, wy / 24, wz / 44)) + Math.abs(n3.n3(wx / 44, wy / 24, wz / 44));
    }
    const samp = (arr, x, y, z) => {
      const fx = x / 4, fy = y / 4, fz = z / 4, x0 = Math.floor(fx), y0 = Math.floor(fy), z0 = Math.floor(fz);
      const tx = fx - x0, ty = fy - y0, tz = fz - z0, x1 = Math.min(x0 + 1, 4), y1 = Math.min(y0 + 1, 32), z1 = Math.min(z0 + 1, 4);
      const g = (a, b2, c) => arr[(c * SX + a) * SY + b2];
      return lerp(lerp(lerp(g(x0, y0, z0), g(x1, y0, z0), tx), lerp(g(x0, y0, z1), g(x1, y0, z1), tx), tz),
        lerp(lerp(g(x0, y1, z0), g(x1, y1, z0), tx), lerp(g(x0, y1, z1), g(x1, y1, z1), tx), tz), ty);
    };
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const ci = cols[(z + 1) * 18 + x + 1], h = ci.h, wx = bx + x, wz = bz + z;
      const sulfur = this.inSulfurRegion(wx, wz);
      sulfurCol.push(sulfur);
      const wet = h < SEA + 3;
      const maxY = wet ? h - 7 : h;
      for (let y = 5; y <= maxY; y++) {
        const i = idx3(x, y, z), id = b[i];
        if (id === B.bedrock || id === B.water) continue;
        const nearTop = Math.max(0, y - (h - 10));
        let thr = 0.6 + nearTop * 0.06;
        if (sulfur && y > 12 && y < 58) thr = 0.42;
        const cv = samp(cheese, x, y, z), sv = samp(spag, x, y, z);
        if (cv > thr || sv < 0.075 - nearTop * 0.004) b[i] = y <= 10 ? B.lava : 0;
      }
      if (sulfur) {
        for (let y = 10; y < Math.min(60, h - 6); y++) {
          const i = idx3(x, y, z), id = b[i];
          if (id !== B.stone && id !== B.deepslate) continue;
          const band = ((Math.floor((y + this.nMisc.n2(wx / 12, wz / 12) * 3) / 2) % 4) + 4) % 4;
          b[i] = band === 0 ? B.cinnabar : B.sulfur;
        }
      }
    }
    // 硫磺洞穴：硫磺池、强效硫磺、尖刺
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      if (!sulfurCol[z * 16 + x]) continue;
      const wx = bx + x, wz = bz + z;
      for (let y = 12; y < 58; y++) {
        const i = idx3(x, y, z);
        if (b[i] !== 0) continue;
        const below = b[idx3(x, y - 1, z)], above = y < CH - 1 ? b[idx3(x, y + 1, z)] : 0;
        const r = rand3(this.seed, wx, y, wz);
        if ((below === B.sulfur || below === B.cinnabar || below === B.stone) && y < 30 && this.nMisc.n3(wx / 9, y / 9, wz / 9) > 0.35) {
          b[idx3(x, y - 1, z)] = B.potent_sulfur; b[i] = B.water;
        } else if ((below === B.sulfur || below === B.cinnabar) && r < 0.07) b[i] = B.sulfur_spike;
        else if ((above === B.sulfur || above === B.cinnabar) && r > 0.93) b[i] = B.sulfur_spike;
      }
    }
  }

  genOres(ch) {
    const r = mulberry32(hash3(this.seed, ch.cx, 999, ch.cz)), b = ch.blocks;
    const bio = ch.biome[8 * 16 + 8];
    const ores = [
      ['coal', 18, 5, 120, 9], ['iron', 12, 5, 72, 6], ['copper', 8, 20, 80, 8], ['gold', 3, 5, 32, 6],
      ['redstone', 5, 5, 16, 6], ['lapis', 2, 5, 30, 5], ['diamond', 2, 5, 16, 5],
    ];
    if (bio === 'stony_peaks' || bio === 'snowy_peaks') ores.push(['emerald', 6, 30, 120, 1]);
    for (const [k, count, y0, y1, size] of ores) {
      for (let n = 0; n < count; n++) {
        let x = Math.floor(r() * 16), y = y0 + Math.floor(r() * (y1 - y0)), z = Math.floor(r() * 16);
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
    // 地下的泥土 / 沙砾团
    for (let n = 0; n < 6; n++) {
      const id = n % 2 ? B.gravel : B.dirt;
      let x = Math.floor(r() * 16), y = 10 + Math.floor(r() * 60), z = Math.floor(r() * 16);
      for (let s = 0; s < 20; s++) {
        if (x >= 0 && x < 16 && z >= 0 && z < 16 && b[idx3(x, y, z)] === B.stone) b[idx3(x, y, z)] = id;
        const d = Math.floor(r() * 6); x += DIRS[d][0]; y += DIRS[d][1]; z += DIRS[d][2];
      }
    }
  }

  surfaceY(ch, x, z) {
    for (let y = CH - 1; y > 0; y--) { const id = ch.blocks[idx3(x, y, z)]; if (id !== 0) return y; }
    return 0;
  }

  genDecor(ch, cols) {
    const b = ch.blocks, seed = this.seed, bx = ch.cx * 16, bz = ch.cz * 16;
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const ci = cols[(z + 1) * 18 + x + 1], bio = ci.biome, wx = bx + x, wz = bz + z;
      const y = ci.h;
      if (y + 1 >= CH) continue;
      const g = b[idx3(x, y, z)], above = idx3(x, y + 1, z);
      if (b[above] !== 0) continue;
      const r = rand3(seed, wx, 77, wz), r2 = rand3(seed, wx, 78, wz);
      const flowerN = this.nMisc.n2(wx / 30, wz / 30);
      if (g === B.grass_block || g === B.moss_block) {
        if (bio === 'plains') {
          if (r < 0.28) b[above] = B.short_grass;
          else if (r < 0.31 + Math.max(0, flowerN) * 0.08) b[above] = [B.dandelion, B.poppy, B.oxeye_daisy, B.cornflower][Math.floor(r2 * 4)];
          else if (r > 0.9995) b[above] = B.pumpkin;
        } else if (bio === 'forest' || bio === 'birch_forest') {
          if (r < 0.2) b[above] = B.short_grass;
          else if (r < 0.23) b[above] = [B.dandelion, B.poppy, B.allium, B.orange_tulip][Math.floor(r2 * 4)];
          else if (r < 0.232) b[above] = r2 < 0.5 ? B.red_mushroom : B.brown_mushroom;
        } else if (bio === 'taiga') {
          if (r < 0.18) b[above] = B.fern; else if (r < 0.24) b[above] = B.short_grass;
          else if (r < 0.245) b[above] = B.brown_mushroom;
        } else if (bio === 'cherry_grove') {
          if (r < 0.2) b[above] = B.short_grass; else if (r < 0.24) b[above] = [B.allium, B.oxeye_daisy, B.dandelion][Math.floor(r2 * 3)];
        } else if (bio === 'pale_garden') {
          if (r < 0.08) b[above] = B.short_grass; else if (r < 0.085) b[above] = B.brown_mushroom;
        } else if (bio === 'dappled_forest') {
          if (r < 0.14) b[above] = B.short_grass;
          else if (r < 0.2) b[above] = B.red_shrub;
          else if (r < 0.22) b[above] = B.fern;
          else if (r < 0.23) b[above] = B.brown_mushroom;
        } else if (r < 0.15) b[above] = B.short_grass;
        // 甘蔗：靠水
        if (y === SEA && r2 > 0.9 && b[above] === 0 || (y === SEA && r2 > 0.9 && b[above] === B.short_grass)) {
          let wet = false;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz; if (nx >= 0 && nx < 16 && nz >= 0 && nz < 16 && b[idx3(nx, y, nz)] === B.water) wet = true; }
          if (wet) { const hh = 1 + Math.floor(r * 30) % 3; for (let k = 1; k <= hh; k++) b[idx3(x, y + k, z)] = B.sugar_cane; }
        }
      } else if (g === B.sand && bio === 'desert') {
        if (r < 0.006 && x > 0 && x < 15 && z > 0 && z < 15) { const hh = 1 + Math.floor(r2 * 3); for (let k = 1; k <= hh; k++) b[idx3(x, y + k, z)] = B.cactus; }
        else if (r < 0.014) b[above] = B.dead_bush;
      } else if (g === B.sand && y === SEA && r2 > 0.92) {
        let wet = false;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz; if (nx >= 0 && nx < 16 && nz >= 0 && nz < 16 && b[idx3(nx, y, nz)] === B.water) wet = true; }
        if (wet) { const hh = 1 + Math.floor(r * 30) % 3; for (let k = 1; k <= hh; k++) b[idx3(x, y + k, z)] = B.sugar_cane; }
      }
    }
  }

  treeCount(bio, r) {
    switch (bio) {
      case 'forest': return 7 + Math.floor(r * 3);
      case 'birch_forest': return 7;
      case 'taiga': return 7;
      case 'snowy_taiga': return 5;
      case 'cherry_grove': return 3;
      case 'pale_garden': return 7;
      case 'dappled_forest': return 6;
      case 'plains': return r < 0.15 ? 1 : 0;
      case 'snowy_plains': return r < 0.08 ? 1 : 0;
      default: return 0;
    }
  }

  genTrees(ch) {
    for (let ncx = ch.cx - 1; ncx <= ch.cx + 1; ncx++) for (let ncz = ch.cz - 1; ncz <= ch.cz + 1; ncz++) {
      const r = mulberry32(hash3(this.seed, ncx, 4242, ncz));
      const cinfo = this.columnInfo(ncx * 16 + 8, ncz * 16 + 8);
      const n = this.treeCount(cinfo.biome, r());
      for (let i = 0; i < n; i++) {
        const lx = Math.floor(r() * 16), lz = Math.floor(r() * 16), rr = r(), seedT = Math.floor(r() * 1e9);
        const wx = ncx * 16 + lx, wz = ncz * 16 + lz;
        const info = this.columnInfo(wx, wz);
        if (info.h < SEA || info.h > CH - 24) continue;
        const bio = info.biome;
        if (bio === 'desert' || bio === 'beach' || bio === 'ocean' || bio === 'stony_peaks' || bio === 'snowy_peaks' || bio === 'snowy_beach' || bio === 'frozen_ocean') continue;
        // 若树基在本区块内，需确认地面未被洞穴挖空
        if (ncx === ch.cx && ncz === ch.cz) {
          const gid = ch.blocks[idx3(lx, info.h, lz)];
          if (gid !== B.grass_block && gid !== B.snowy_grass && gid !== B.moss_block && gid !== B.dirt) continue;
        }
        let type = 'oak';
        if (bio === 'birch_forest') type = 'birch';
        else if (bio === 'forest') type = rr < 0.2 ? 'birch' : 'oak';
        else if (bio === 'taiga' || bio === 'snowy_taiga' || bio === 'snowy_plains') type = 'spruce';
        else if (bio === 'cherry_grove') type = 'cherry';
        else if (bio === 'pale_garden') type = 'pale_oak';
        else if (bio === 'dappled_forest') type = rr < 0.7 ? 'poplar' : 'oak';
        this.placeTree(ch, type, wx, info.h + 1, wz, mulberry32(seedT));
      }
    }
  }

  // 只在目标区块 ch 内落方块（跨区块的树由各区块分别画出自己那一部分）
  placeTree(ch, type, x0, y0, z0, r, force) {
    const bx = ch.cx * 16, bz = ch.cz * 16;
    const set = (x, y, z, id, leaf) => {
      const lx = x - bx, lz = z - bz;
      if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || y < 1 || y >= CH) return;
      const i = idx3(lx, y, lz), cur = ch.blocks[i];
      if (leaf) { if (cur === 0 || BLOCKS[cur].replaceable && cur !== B.water) ch.blocks[i] = id; }
      else if (cur === 0 || BLOCKS[cur].leaves || BLOCKS[cur].replaceable || BLOCKS[cur].sapling || force) ch.blocks[i] = id;
    };
    const setDirt = (x, y, z) => { const lx = x - bx, lz = z - bz; if (lx >= 0 && lx < 16 && lz >= 0 && lz < 16 && y > 0) { const i = idx3(lx, y, lz); if (ch.blocks[i] === B.grass_block || ch.blocks[i] === B.snowy_grass || ch.blocks[i] === B.moss_block) ch.blocks[i] = B.dirt; } };
    const blob = (cx, cy, cz, rx, ry, rz, id, chance) => {
      for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) for (let z = -rz; z <= rz; z++) {
        const d = (x * x) / (rx * rx + 0.3) + (y * y) / (ry * ry + 0.3) + (z * z) / (rz * rz + 0.3);
        if (d <= 1 && r() < (chance || 0.95)) set(cx + x, cy + y, cz + z, id, true);
      }
    };
    setDirt(x0, y0 - 1, z0);
    if (type === 'oak' || type === 'birch') {
      const hgt = (type === 'birch' ? 5 : 4) + Math.floor(r() * 3), L = B[type + '_leaves'];
      for (let y = 0; y < hgt; y++) set(x0, y0 + y, z0, B[type + '_log']);
      const top = y0 + hgt;
      for (let y = top - 3; y <= top; y++) {
        const rad = y >= top - 1 ? 1 : 2;
        for (let x = -rad; x <= rad; x++) for (let z = -rad; z <= rad; z++) {
          if (Math.abs(x) === rad && Math.abs(z) === rad && (y === top || r() < 0.5)) continue;
          if (x === 0 && z === 0 && y < top) continue;
          set(x0 + x, y, z0 + z, L, true);
        }
      }
    } else if (type === 'spruce') {
      const hgt = 6 + Math.floor(r() * 4), L = B.spruce_leaves;
      for (let y = 0; y < hgt; y++) set(x0, y0 + y, z0, B.spruce_log);
      let rad = 0;
      for (let y = y0 + hgt + 1; y >= y0 + 2; y--) {
        for (let x = -rad; x <= rad; x++) for (let z = -rad; z <= rad; z++) {
          if (Math.abs(x) + Math.abs(z) > rad + (rad > 1 ? 1 : 0)) continue;
          if (x === 0 && z === 0 && y < y0 + hgt) continue;
          set(x0 + x, y, z0 + z, L, true);
        }
        rad = rad >= 3 || (rad >= 2 && r() < 0.5) ? 1 : rad + 1;
      }
    } else if (type === 'cherry') {
      const hgt = 4 + Math.floor(r() * 2);
      for (let y = 0; y < hgt; y++) set(x0, y0 + y, z0, B.cherry_log);
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const d = dirs[Math.floor(r() * 4)];
      const bxE = x0 + d[0] * 2, bzE = z0 + d[1] * 2;
      set(x0 + d[0], y0 + hgt - 1, z0 + d[1], B.cherry_log); set(bxE, y0 + hgt, bzE, B.cherry_log);
      blob(x0, y0 + hgt + 1, z0, 3, 2, 3, B.cherry_leaves, 0.9);
      blob(bxE, y0 + hgt + 2, bzE, 2, 1, 2, B.cherry_leaves, 0.9);
      for (let i = 0; i < 6; i++) { const hx = x0 + Math.floor(r() * 7) - 3, hz = z0 + Math.floor(r() * 7) - 3; set(hx, y0 + hgt - 1, hz, B.cherry_leaves, true); }
    } else if (type === 'pale_oak') {
      const hgt = 6 + Math.floor(r() * 3);
      const heart = r() < 0.12 ? Math.floor(r() * 3) + 2 : -1;
      for (let y = 0; y < hgt; y++) for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        set(x0 + dx, y0 + y, z0 + dz, y === heart && dx === 0 && dz === 0 ? B.creaking_heart : B.pale_oak_log, false);
      }
      for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) setDirt(x0 + dx, y0 - 1, z0 + dz);
      blob(x0, y0 + hgt, z0, 4, 2, 4, B.pale_oak_leaves, 0.92);
      for (let i = 0; i < 10; i++) { const hx = x0 + Math.floor(r() * 9) - 4, hz = z0 + Math.floor(r() * 9) - 4; const len = 1 + Math.floor(r() * 3); for (let k = 0; k < len; k++) set(hx, y0 + hgt - 2 - k, hz, B.pale_oak_leaves, true); }
    } else if (type === 'poplar') {
      // 26.3 杨树：高瘦树冠，三种叶色
      const hgt = 7 + Math.floor(r() * 4);
      const L = [B.poplar_leaves_red, B.poplar_leaves_yellow, B.poplar_leaves_orange][Math.floor(r() * 3)];
      for (let y = 0; y < hgt; y++) set(x0, y0 + y, z0, B.poplar_log);
      const top = y0 + hgt + 1, bottom = y0 + 3;
      for (let y = bottom; y <= top; y++) {
        const t = (y - bottom) / (top - bottom);
        const rad = t > 0.85 ? 0 : (t > 0.2 && t < 0.7 ? 2 : 1);
        for (let x = -rad; x <= rad; x++) for (let z = -rad; z <= rad; z++) {
          if (rad === 2 && Math.abs(x) === 2 && Math.abs(z) >= 1) continue;
          if (rad === 2 && Math.abs(z) === 2 && Math.abs(x) >= 1) continue;
          if (x === 0 && z === 0 && y < y0 + hgt) continue;
          if (rad > 0 && r() < 0.08) continue;
          set(x0 + x, y, z0 + z, L, true);
        }
      }
      // 层架菌长在树干侧面
      if (r() < 0.6) { const d = DIRS[Math.floor(r() * 4) < 2 ? Math.floor(r() * 2) : 4 + Math.floor(r() * 2)]; set(x0 + d[0], y0 + 1 + Math.floor(r() * 2), z0 + d[2], B.shelf_mushroom, true); }
    }
  }

  genStructures(ch, cols) {
    // 26.3 废弃营地：斑驳森林中偶尔出现
    const ci = cols[(8 + 1) * 18 + 8 + 1];
    const r = mulberry32(hash3(this.seed, ch.cx, 31337, ch.cz));
    if (ci.biome !== 'dappled_forest' || r() > 0.06 || ci.h < SEA) return;
    const y = ci.h + 1, b = ch.blocks;
    for (let x = 4; x <= 12; x++) for (let z = 4; z <= 12; z++) {
      if ((x - 8) * (x - 8) + (z - 8) * (z - 8) > 18) continue;
      for (let yy = y; yy < y + 6; yy++) if (b[idx3(x, yy, z)] !== B.poplar_log) b[idx3(x, yy, z)] = 0;
      b[idx3(x, y - 1, z)] = r() < 0.3 ? B.coarse_dirt || B.dirt : B.grass_block;
    }
    b[idx3(8, y, 8)] = B.campfire;
    b[idx3(10, y, 7)] = B.straw_bed; b[idx3(10, y, 8)] = B.straw_bed;
    b[idx3(6, y, 9)] = B.cushion; b[idx3(7, y, 11)] = B.cushion;
    b[idx3(6, y, 6)] = B.oak_log; b[idx3(11, y, 10)] = B.oak_log;
    b[idx3(9, y, 5)] = B.chest; ch.meta[idx3(9, y, 5)] = 0;
    const wx = ch.cx * 16 + 9, wz = ch.cz * 16 + 5;
    const loot = ['bread', 'apple', 'string', 'stick', 'coal', 'iron_ingot', 'wheat_seeds', 'feather', 'leather', 'shelf_mushroom', 'poplar_sapling', 'cooked_mutton'];
    const items = new Array(27).fill(null);
    for (let i = 0; i < 6; i++) { const n = loot[Math.floor(r() * loot.length)]; items[Math.floor(r() * 27)] = { id: n, n: 1 + Math.floor(r() * 4) }; }
    const k = wx + ',' + y + ',' + wz;
    if (!this.tiles.has(k)) this.tiles.set(k, { type: 'chest', items });
  }

  // ---------------- 光照 ----------------
  initLight(ch) {
    const b = ch.blocks, L = ch.light;
    let maxTop = 0;
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      let l = this.hasSky ? 15 : 0;
      for (let y = CH - 1; y >= 0; y--) {
        const i = idx3(x, y, z), d = BLOCKS[b[i]];
        if (d.opaque) { l = 0; }
        else if (d.atten) l = Math.max(0, l - d.atten);
        if (l < 15 && y > maxTop) maxTop = y;
        L[i] = (l << 4) | d.emit;
        if (l === 0 && d.opaque) {
          for (let yy = y - 1; yy >= 0; yy--) { const j = idx3(x, yy, z); L[j] = BLOCKS[b[j]].emit; }
          break;
        }
      }
    }
    const skyQ = [], blkQ = [];
    const bx = ch.cx * 16, bz = ch.cz * 16;
    for (let y = 0; y <= Math.min(CH - 1, maxTop + 1); y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const i = idx3(x, y, z), s = L[i] >> 4;
      if (L[i] & 15) blkQ.push(bx + x, y, bz + z);
      if (s < 2) continue;
      let need = false;
      if (x > 0 && (L[i - 1] >> 4) < s - 1 && !BLOCKS[b[i - 1]].opaque) need = true;
      else if (x < 15 && (L[i + 1] >> 4) < s - 1 && !BLOCKS[b[i + 1]].opaque) need = true;
      else if (z > 0 && (L[i - 16] >> 4) < s - 1 && !BLOCKS[b[i - 16]].opaque) need = true;
      else if (z < 15 && (L[i + 16] >> 4) < s - 1 && !BLOCKS[b[i + 16]].opaque) need = true;
      else if (x === 0 || x === 15 || z === 0 || z === 15) need = true;
      if (need) skyQ.push(bx + x, y, bz + z);
    }
    // 相邻已加载区块的边界
    const nb = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dx, dz] of nb) {
      const n = this.getChunk(ch.cx + dx, ch.cz + dz); if (!n) continue;
      for (let y = 0; y < CH; y++) for (let k = 0; k < 16; k++) {
        const lx = dx === -1 ? 15 : dx === 1 ? 0 : k, lz = dz === -1 ? 15 : dz === 1 ? 0 : k;
        const v = n.light[idx3(lx, y, lz)];
        const wx = n.cx * 16 + lx, wz = n.cz * 16 + lz;
        if ((v >> 4) > 1) skyQ.push(wx, y, wz);
        if ((v & 15) > 1) blkQ.push(wx, y, wz);
      }
      n.dirty = true;
    }
    this.lightAdd(skyQ, 1);
    this.lightAdd(blkQ, 0);
    ch.lit = true; ch.dirty = true;
  }

  getL(x, y, z, sky) {
    const c = this.getChunk(x >> 4, z >> 4); if (!c) return 0;
    const v = c.light[idx3(x & 15, y, z & 15)]; return sky ? v >> 4 : v & 15;
  }
  setL(c, i, sky, v) { c.light[i] = sky ? (c.light[i] & 15) | (v << 4) : (c.light[i] & 0xf0) | v; }

  lightAdd(q, sky) {
    let p = 0;
    while (p < q.length) {
      const x = q[p++], y = q[p++], z = q[p++];
      const c0 = this.getChunk(x >> 4, z >> 4); if (!c0) continue;
      const v0 = c0.light[idx3(x & 15, y, z & 15)], L = sky ? v0 >> 4 : v0 & 15;
      if (L <= 1) continue;
      for (let d = 0; d < 6; d++) {
        const nx = x + DIRS[d][0], ny = y + DIRS[d][1], nz = z + DIRS[d][2];
        if (ny < 0 || ny >= CH) continue;
        const c = this.getChunk(nx >> 4, nz >> 4); if (!c) continue;
        const i = idx3(nx & 15, ny, nz & 15), def = BLOCKS[c.blocks[i]];
        if (def.opaque) continue;
        let nl = L - 1 - def.atten;
        if (sky && d === 3 && L === 15 && def.atten === 0) nl = 15;
        const cur = sky ? c.light[i] >> 4 : c.light[i] & 15;
        if (cur < nl) { this.setL(c, i, sky, nl); c.dirty = true; this.markDirty(nx, ny, nz); q.push(nx, ny, nz); }
      }
    }
    if (q.length > 200000) q.length = 0;
  }

  lightRemove(x, y, z, sky, addQ) {
    const c0 = this.getChunk(x >> 4, z >> 4); if (!c0) return;
    const i0 = idx3(x & 15, y, z & 15);
    const old = sky ? c0.light[i0] >> 4 : c0.light[i0] & 15;
    if (old === 0) return;
    this.setL(c0, i0, sky, 0);
    const rq = [x, y, z, old], readd = [];
    let p = 0;
    while (p < rq.length) {
      const cx = rq[p++], cy = rq[p++], cz = rq[p++], L = rq[p++];
      for (let d = 0; d < 6; d++) {
        const nx = cx + DIRS[d][0], ny = cy + DIRS[d][1], nz = cz + DIRS[d][2];
        if (ny < 0 || ny >= CH) continue;
        const c = this.getChunk(nx >> 4, nz >> 4); if (!c) continue;
        const i = idx3(nx & 15, ny, nz & 15);
        const nl = sky ? c.light[i] >> 4 : c.light[i] & 15;
        if (nl === 0) continue;
        if (nl < L || (sky && d === 3 && L === 15 && nl === 15)) {
          this.setL(c, i, sky, 0); c.dirty = true; this.markDirty(nx, ny, nz);
          rq.push(nx, ny, nz, nl);
          if (!sky && BLOCKS[c.blocks[i]].emit) readd.push(nx, ny, nz);
        } else addQ.push(nx, ny, nz);
      }
    }
    for (let k = 0; k < readd.length; k += 3) {
      const c = this.getChunk(readd[k] >> 4, readd[k + 2] >> 4), i = idx3(readd[k] & 15, readd[k + 1], readd[k + 2] & 15);
      this.setL(c, i, false, BLOCKS[c.blocks[i]].emit); addQ.push(readd[k], readd[k + 1], readd[k + 2]);
    }
  }

  updateLight(x, y, z) {
    const c = this.getChunk(x >> 4, z >> 4); if (!c) return;
    const i = idx3(x & 15, y, z & 15), def = BLOCKS[c.blocks[i]];
    for (const sky of [1, 0]) {
      const addQ = [];
      this.lightRemove(x, y, z, sky, addQ);
      if (!sky && def.emit) { this.setL(c, i, 0, def.emit); addQ.push(x, y, z); }
      for (let d = 0; d < 6; d++) {
        const nx = x + DIRS[d][0], ny = y + DIRS[d][1], nz = z + DIRS[d][2];
        if (ny < 0) continue;
        if (ny >= CH) { if (sky && !def.opaque && this.hasSky) { this.setL(c, i, 1, 15); addQ.push(x, y, z); } continue; }
        if (this.getL(nx, ny, nz, sky) > 0) addQ.push(nx, ny, nz);
      }
      this.lightAdd(addQ, sky);
    }
    this.markDirty(x, y, z);
  }

  // ---------------- 方块修改 ----------------
  setBlock(x, y, z, id, meta, opts) {
    if (y < 0 || y >= CH) return false;
    const c = this.getChunk(x >> 4, z >> 4); if (!c) return false;
    const i = idx3(x & 15, y, z & 15), old = c.blocks[i];
    c.blocks[i] = id; c.meta[i] = meta || 0; c.modified = true; c.dirty = true;
    this.markDirty(x, y, z);
    const od = BLOCKS[old], nd = BLOCKS[id];
    if (od.opaque !== nd.opaque || od.emit !== nd.emit || od.atten !== nd.atten) this.updateLight(x, y, z);
    if (old !== id) {
      const k = x + ',' + y + ',' + z;
      if (this.tiles.has(k) && !(opts && opts.keepTile)) {
        const t = this.tiles.get(k);
        if (this.hooks.removed) this.hooks.removed(x, y, z, t);
        this.tiles.delete(k);
      }
    }
    if (!(opts && opts.noUpdate)) {
      this.blockUpdate(x, y, z);
      for (const d of DIRS) this.blockUpdate(x + d[0], y + d[1], z + d[2]);
    }
    return true;
  }

  schedule(x, y, z, delay) {
    const k = x + ',' + y + ',' + z;
    const t = this.tick + delay;
    if (!this.scheduled.has(k) || this.scheduled.get(k) > t) this.scheduled.set(k, t);
  }

  // 邻居变化时的即时规则
  blockUpdate(x, y, z) {
    if (y < 0 || y >= CH) return;
    const id = this.getBlock(x, y, z); if (!id) return;
    const d = BLOCKS[id];
    for (const f of FEATURES) if (f.blockUpdate && f.blockUpdate(this, x, y, z, id)) return;
    if (isLiquid(id)) { this.schedule(x, y, z, id === B.water ? 5 : 30); return; }
    // 液体旁的方块变化 -> 唤醒附近液体
    const below = this.getBlock(x, y - 1, z), bd = BLOCKS[below];
    if (d.gravity && (below === 0 || isLiquid(below) || bd.replaceable && !bd.solid)) {
      this.schedule(x, y, z, 2); return;
    }
    if (d.shape === 'cross' || d.shape === 'torch' || id === B.cactus) {
      let ok = true;
      if (d.spike) ok = true;
      else if (id === B.shelf_mushroom) ok = true;
      else if (id === B.sugar_cane) ok = below === B.sugar_cane || below === B.grass_block || below === B.dirt || below === B.sand;
      else if (id === B.cactus) ok = below === B.cactus || below === B.sand || below === B.red_sand;
      else if (id === B.dead_bush) ok = below === B.sand || below === B.red_sand || below === B.dirt || below === B.terracotta;
      else if (d.crop) ok = below === B.farmland;
      else if (id === B.torch && (this.getMeta(x, y, z) & 7)) ok = this.torchWallSolid(x, y, z);
      else if (id === B.torch && (this.getMeta(x, y, z) & 7)) ok = this.torchWallSolid(x, y, z);
    else if (id === B.torch || id === B.campfire) ok = bd.solid;
      else ok = below === B.grass_block || below === B.dirt || below === B.farmland || below === B.moss_block || below === B.snowy_grass || below === B.mycelium;
      if (!ok) this.schedule(x, y, z, 1);
    }
    if (id === B.farmland) { const a = BLOCKS[this.getBlock(x, y + 1, z)]; if (a.opaque) this.setBlock(x, y, z, B.dirt); }
  }

  runScheduled() {
    if (!this.scheduled.size) return;
    const due = [];
    for (const [k, t] of this.scheduled) if (t <= this.tick) due.push(k);
    for (const k of due) {
      this.scheduled.delete(k);
      const [x, y, z] = k.split(',').map(Number);
      if (!this.isLoaded(x, z)) continue;
      this.scheduledTick(x, y, z);
    }
  }

  scheduledTick(x, y, z) {
    const id = this.getBlock(x, y, z), d = BLOCKS[id];
    for (const f of FEATURES) if (f.scheduledTick && f.scheduledTick(this, x, y, z, id)) return;
    if (isLiquid(id)) { this.liquidTick(x, y, z, id); return; }
    const below = this.getBlock(x, y - 1, z), bd = BLOCKS[below];
    if (d.gravity && (below === 0 || isLiquid(below) || (bd.replaceable && !bd.solid))) {
      this.setBlock(x, y, z, 0);
      if (this.hooks.fallingBlock) this.hooks.fallingBlock(x, y, z, id);
      return;
    }
    if (d.shape === 'cross' || d.shape === 'torch' || id === B.cactus) {
      // 再次检查支撑
      this.blockUpdateCheckSupport(x, y, z, id);
    }
  }
  blockUpdateCheckSupport(x, y, z, id) {
    const d = BLOCKS[id], below = this.getBlock(x, y - 1, z), bd = BLOCKS[below];
    let ok;
    if (d.spike || id === B.shelf_mushroom) ok = true;
    else if (id === B.sugar_cane) ok = below === B.sugar_cane || below === B.grass_block || below === B.dirt || below === B.sand;
    else if (id === B.cactus) ok = below === B.cactus || below === B.sand || below === B.red_sand;
    else if (id === B.dead_bush) ok = below === B.sand || below === B.red_sand || below === B.dirt || below === B.terracotta;
    else if (d.crop) ok = below === B.farmland;
    else if (id === B.torch && (this.getMeta(x, y, z) & 7)) ok = this.torchWallSolid(x, y, z);
    else if (id === B.torch || id === B.campfire) ok = bd.solid;
    else ok = below === B.grass_block || below === B.dirt || below === B.farmland || below === B.moss_block || below === B.snowy_grass;
    if (!ok) this.breakBlock(x, y, z, true);
  }

  // 墙上火把所贴的方块是否还在
  torchWallSolid(x, y, z) {
    const m = this.getMeta(x, y, z) & 7, d = [[-1, 0], [1, 0], [0, -1], [0, 1]][m - 1];
    const id = this.getBlock(x + d[0], y, z + d[1]);
    return !!id && BLOCKS[id].solid && BLOCKS[id].shape === 'cube';
  }
  breakBlock(x, y, z, drop, toolTier) {
    const id = this.getBlock(x, y, z), meta = this.getMeta(x, y, z);
    if (!id) return;
    this.setBlock(x, y, z, 0);
    if (drop && this.hooks.dropItem) {
      for (const [n, c] of blockDrops(id, meta)) this.hooks.dropItem(x + 0.5, y + 0.4, z + 0.5, n, c);
    }
  }

  // 简化版 Minecraft 流体规则
  liquidTick(x, y, z, id) {
    const water = id === B.water;
    const meta = this.getMeta(x, y, z), lvl = meta & 7, falling = meta & 8;
    const drop = water ? 1 : 2, maxL = water ? 7 : 6;
    const other = water ? B.lava : B.water;
    // 与另一种流体接触
    if (!water) {
      for (const dd of DIRS) {
        if (dd[1] === -1) continue;
        if (this.getBlock(x + dd[0], y + dd[1], z + dd[2]) === B.water) {
          this.setBlock(x, y, z, lvl === 0 && !falling ? B.obsidian : B.cobblestone);
          if (this.hooks.sound) this.hooks.sound('fizz', x, y, z);
          return;
        }
      }
    }
    if (lvl !== 0 || falling) {
      // 计算应有的等级
      let best = 99;
      const up = this.getBlock(x, y + 1, z);
      if (up === id) best = -1;
      let sources = 0;
      for (let d = 0; d < 6; d++) {
        if (d === 2 || d === 3) continue;
        const nx = x + DIRS[d][0], nz = z + DIRS[d][2];
        if (this.getBlock(nx, y, nz) === id) {
          const m = this.getMeta(nx, y, nz);
          const l = (m & 8) ? 0 : (m & 7);
          if ((m & 7) === 0 && !(m & 8)) sources++;
          best = Math.min(best, l);
        }
      }
      if (water && sources >= 2) {
        const bl = this.getBlock(x, y - 1, z);
        if (BLOCKS[bl].solid || (bl === id && (this.getMeta(x, y - 1, z) & 7) === 0)) { this.setBlock(x, y, z, id, 0); return; }
      }
      let nm;
      if (best === -1) nm = 8 | 1;
      else if (best + drop > maxL || best === 99) { this.setBlock(x, y, z, 0); return; }
      else nm = best + drop;
      if (nm !== meta) { this.setBlock(x, y, z, id, nm); return; }
    }
    // 向下
    const below = this.getBlock(x, y - 1, z);
    if (y > 0 && this.canFlowInto(below, id)) {
      if (below === other) { this.setBlock(x, y - 1, z, water ? B.stone : B.stone); return; }
      this.flowInto(x, y - 1, z, id, 8 | Math.max(1, lvl));
      if (lvl !== 0) return;
    }
    if (below === id && lvl !== 0) return;
    const next = (falling ? 0 : lvl) + drop;
    if (next > maxL) return;
    for (let d = 0; d < 6; d++) {
      if (d === 2 || d === 3) continue;
      const nx = x + DIRS[d][0], nz = z + DIRS[d][2];
      const n = this.getBlock(nx, y, nz);
      if (n === id) continue;
      if (this.canFlowInto(n, id)) {
        if (n === other) { this.setBlock(nx, y, nz, water ? (this.getMeta(nx, y, nz) === 0 ? B.obsidian : B.cobblestone) : B.cobblestone); continue; }
        this.flowInto(nx, y, nz, id, next);
      }
    }
  }
  canFlowInto(n, id) {
    if (n === 0) return true;
    if (n === id) return false;
    if (isLiquid(n)) return true;
    const d = BLOCKS[n];
    return !d.solid && (d.replaceable || d.plant || d.shape === 'torch') && !d.spike;
  }
  flowInto(x, y, z, id, meta) {
    const n = this.getBlock(x, y, z);
    if (n === id) { const m = this.getMeta(x, y, z); if ((m & 7) <= (meta & 7) && !(meta & 8)) return; }
    if (n && !isLiquid(n) && this.hooks.dropItem) for (const [nm, c] of blockDrops(n, 0)) this.hooks.dropItem(x + 0.5, y + 0.4, z + 0.5, nm, c);
    this.setBlock(x, y, z, id, meta);
  }

  // ---------------- 随机刻 ----------------
  randomTicks(px, pz, rad) {
    const pcx = Math.floor(px) >> 4, pcz = Math.floor(pz) >> 4;
    for (let cx = pcx - rad; cx <= pcx + rad; cx++) for (let cz = pcz - rad; cz <= pcz + rad; cz++) {
      const c = this.getChunk(cx, cz); if (!c) continue;
      for (let n = 0; n < 36; n++) {
        const x = Math.floor(Math.random() * 16), y = Math.floor(Math.random() * (CH - 1)) + 1, z = Math.floor(Math.random() * 16);
        const id = c.blocks[idx3(x, y, z)];
        if (id) this.randomTick(cx * 16 + x, y, cz * 16 + z, id);
      }
    }
  }
  randomTick(x, y, z, id) {
    const d = BLOCKS[id];
    for (const f of FEATURES) if (f.randomTick && f.randomTick(this, x, y, z, id)) return;
    const light = Math.max(this.skyLight(x, y + 1, z), this.blockLight(x, y + 1, z));
    if (id === B.grass_block) {
      if (BLOCKS[this.getBlock(x, y + 1, z)].opaque) { this.setBlock(x, y, z, B.dirt); return; }
      if (light >= 9) for (let k = 0; k < 2; k++) {
        const nx = x + Math.floor(Math.random() * 3) - 1, ny = y + Math.floor(Math.random() * 5) - 3, nz = z + Math.floor(Math.random() * 3) - 1;
        if (this.getBlock(nx, ny, nz) === B.dirt && !BLOCKS[this.getBlock(nx, ny + 1, nz)].opaque && this.skyLight(nx, ny + 1, nz) >= 4) this.setBlock(nx, ny, nz, B.grass_block);
      }
    } else if (d.crop) {
      const m = this.getMeta(x, y, z);
      if (m < 7 && light >= 9 && Math.random() < 0.35) this.setMeta(x, y, z, m + 1);
    } else if (d.sapling) {
      if (light >= 9 && Math.random() < 0.15) this.growTree(x, y, z, d.sapling);
    } else if (id === B.sugar_cane || id === B.cactus) {
      if (this.getBlock(x, y + 1, z) === 0) {
        let h = 1; while (this.getBlock(x, y - h, z) === id) h++;
        if (h < 3 && Math.random() < 0.3) this.setBlock(x, y + 1, z, id);
      }
    } else if (id === B.ice && this.blockLight(x, y + 1, z) > 11) {
      this.setBlock(x, y, z, B.water);
    }
  }
  growTree(x, y, z, type) {
    const cx = x >> 4, cz = z >> 4;
    this.setBlock(x, y, z, 0, 0, { noUpdate: true });
    const seedT = Math.floor(Math.random() * 1e9);
    const touched = [];
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const c = this.getChunk(cx + dx, cz + dz); if (!c) continue;
      const before = c.blocks.slice();
      this.placeTree(c, type, x, y, z, mulberry32(seedT));
      for (let i = 0; i < before.length; i++) if (before[i] !== c.blocks[i]) {
        const nb = c.blocks[i]; c.blocks[i] = before[i];
        touched.push([c.cx * 16 + (i & 15), i >> 8, c.cz * 16 + ((i >> 4) & 15), nb]);
      }
    }
    for (const [tx, ty, tz, nb] of touched) this.setBlock(tx, ty, tz, nb, 0, { noUpdate: true });
  }
}

// 统一的掉落计算，返回 [[name, count], ...]
function blockDrops(id, meta) {
  const d = BLOCKS[id];
  let r = d.drop;
  if (typeof r === 'function') r = r(meta);
  if (!r) return [];
  if (typeof r === 'string') return [[r, 1]];
  if (Array.isArray(r[0])) return r.filter(Boolean);
  return [r];
}
