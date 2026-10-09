'use strict';
// ---------- 程序化像素纹理（16x16）与纹理图集 ----------
// 程序生成的像素画作为后备；有 VoxeLibre 素材包（CC BY-SA）时由 pack.js 覆盖。

const TS = 16;
const TEX = {};            // 纹理名 -> 图集索引
const TEX_IMG = [];        // 索引 -> ImageData 像素
let ATLAS = null;          // { canvas, cols, rows, texture }

class Pix {
  constructor(name) {
    this.d = new Uint8ClampedArray(TS * TS * 4);
    this.r = mulberry32(hashString(name));
  }
  set(x, y, c, a) {
    if (x < 0 || y < 0 || x >= TS || y >= TS) return;
    const i = (y * TS + x) * 4;
    this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = a === undefined ? (c[3] === undefined ? 255 : c[3]) : a;
  }
  get(x, y) { const i = (y * TS + x) * 4; return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]]; }
  fill(c, v) { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) this.set(x, y, vary(c, v || 0, this.r)); return this; }
  rect(x0, y0, w, h, c, v) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, vary(c, v || 0, this.r)); }
  speck(c, n, size, v) {
    for (let i = 0; i < n; i++) {
      const x = Math.floor(this.r() * TS), y = Math.floor(this.r() * TS);
      for (let k = 0; k < size; k++) this.set(x + (k % 2), y + (k > 1 ? 1 : 0), vary(c, v || 0.1, this.r));
    }
  }
  copy(o) { this.d.set(o.d); return this; }
}
function vary(c, v, r) {
  if (!v) return c;
  const f = 1 + (r() - 0.5) * 2 * v;
  return [c[0] * f, c[1] * f, c[2] * f, c[3]];
}
const shade = (c, f) => [c[0] * f, c[1] * f, c[2] * f, c[3]];

const TEX_ANIM = [];       // {idx, frames, speed}

function defTex(name, fn) {
  const p = new Pix(name);
  fn(p, p.r);
  TEX[name] = TEX_IMG.length;
  // 素材包里有对应贴图时覆盖程序纹理
  const ps = typeof PACK_MAP !== 'undefined' ? resolvePackSpec(PACK_MAP[name]) : null;
  if (ps) {
    TEX_IMG.push(ps.frames[0]);
    if (ps.frames.length > 1) TEX_ANIM.push({ idx: TEX[name], frames: ps.frames, speed: ps.speed || 1 });
  } else TEX_IMG.push(p.d);
  return p;
}

// 直接引用素材包贴图名（例如 'mcl_nether_netherrack'），首次使用时加入图集
function ensureTex(name) {
  if (TEX[name] !== undefined) return TEX[name];
  if (ATLAS) console.warn('图集已生成，无法再加入纹理', name);
  TEX[name] = TEX_IMG.length;
  const mapped = PACK_MAP[name] && typeof PACK_MAP[name] === 'object' ? resolvePackSpec(PACK_MAP[name]) : null;
  if (mapped) { TEX_IMG.push(mapped.frames[0]); if (mapped.frames.length > 1) TEX_ANIM.push({ idx: TEX[name], frames: mapped.frames, speed: mapped.speed || 1 }); }
  else if (PACK_IMG[name]) {
    const n = packFrameCount(name);
    const frames = [];
    for (let i = 0; i < n; i++) frames.push(packFrame(name, i));
    TEX_IMG.push(frames[0]);
    if (n > 1 && /anim|portal|fire|flame|lava|water|magma|prismarine|sea_lantern/.test(name)) TEX_ANIM.push({ idx: TEX[name], frames, speed: 2 });
  } else {
    // 缺图：品红黑格，方便发现问题
    const d = new Uint8ClampedArray(TS * TS * 4);
    for (let i = 0; i < TS * TS; i++) { const m = ((i % 16) >> 3) ^ ((i >> 7) & 1); d[i * 4] = m ? 248 : 0; d[i * 4 + 2] = m ? 248 : 0; d[i * 4 + 3] = 255; }
    TEX_IMG.push(d);
  }
  return TEX[name];
}

// 方块定义里出现的所有纹理名都确保在图集中
function collectBlockTextures() {
  for (const d of BLOCKS) {
    if (!d.tex) continue;
    for (const k in d.tex) if (typeof d.tex[k] === 'string') ensureTex(d.tex[k]);
    if (d.texNames) d.texNames.forEach(ensureTex);
  }
}

// ---- 基础图案 ----
function stoneLike(p, base, v) {
  p.fill(base, v || 0.08);
  for (let i = 0; i < 9; i++) {
    const x = Math.floor(p.r() * 15), y = Math.floor(p.r() * 16), len = 1 + Math.floor(p.r() * 3);
    for (let k = 0; k < len; k++) p.set(x + k, y, shade(base, 0.82 + p.r() * 0.06));
  }
  for (let i = 0; i < 6; i++) p.set(Math.floor(p.r() * 16), Math.floor(p.r() * 16), shade(base, 1.12));
}
function cellular(p, base, edge, cells, v) {
  const pts = [];
  for (let i = 0; i < cells; i++) pts.push([p.r() * 16, p.r() * 16, 0.8 + p.r() * 0.35]);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    let d1 = 1e9, d2 = 1e9, best = 0;
    for (let i = 0; i < pts.length; i++) {
      for (let ox = -16; ox <= 16; ox += 16) for (let oy = -16; oy <= 16; oy += 16) {
        const dx = x + 0.5 - pts[i][0] - ox, dy = y + 0.5 - pts[i][1] - oy, d = dx * dx + dy * dy;
        if (d < d1) { d2 = d1; d1 = d; best = i; } else if (d < d2) d2 = d;
      }
    }
    if (Math.sqrt(d2) - Math.sqrt(d1) < 1.0) p.set(x, y, vary(edge, 0.08, p.r));
    else p.set(x, y, vary(shade(base, pts[best][2]), v || 0.07, p.r));
  }
}
function oreTex(p, baseFn, oreC, n) {
  baseFn(p);
  for (let i = 0; i < n; i++) {
    const cx = 2 + Math.floor(p.r() * 12), cy = 2 + Math.floor(p.r() * 12);
    const pts = [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1]];
    const cnt = 3 + Math.floor(p.r() * 3);
    for (let k = 0; k < cnt; k++) {
      const q = pts[k];
      p.set(cx + q[0], cy + q[1], vary(k === 0 ? shade(oreC, 1.15) : oreC, 0.1, p.r));
    }
    p.set(cx + 1, cy + 2, shade(oreC, 0.6));
  }
}
function logSide(p, bark, dark) {
  for (let x = 0; x < TS; x++) {
    const f = 0.85 + p.r() * 0.3;
    for (let y = 0; y < TS; y++) p.set(x, y, vary(shade(bark, f), 0.05, p.r));
  }
  for (let i = 0; i < 10; i++) {
    const x = Math.floor(p.r() * 16), y = Math.floor(p.r() * 14), l = 2 + Math.floor(p.r() * 4);
    for (let k = 0; k < l; k++) p.set(x, y + k, dark);
  }
}
function logTop(p, bark, inner) {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const dx = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    if (dx > 6.6) p.set(x, y, vary(bark, 0.08, p.r));
    else {
      const ring = Math.floor(dx) % 2 === 0;
      p.set(x, y, vary(ring ? inner : shade(inner, 0.86), 0.04, p.r));
    }
  }
}
function planks(p, c) {
  for (let y = 0; y < TS; y++) {
    const row = Math.floor(y / 4);
    for (let x = 0; x < TS; x++) {
      let col = vary(c, 0.05, p.r);
      if (y % 4 === 3) col = shade(c, 0.65);
      const seam = row % 2 === 0 ? 4 : 11;
      if (x === seam && y % 4 !== 3) col = shade(c, 0.72);
      if (p.r() < 0.06) col = shade(c, 0.88);
      p.set(x, y, col);
    }
  }
}
function leaves(p, c, holes) {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const r = p.r();
    if (r < (holes || 0.16)) p.set(x, y, [0, 0, 0], 0);
    else p.set(x, y, shade(c, 0.7 + p.r() * 0.45));
  }
}
function wool(p, c) {
  p.fill(c, 0.04);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    if ((x + y * 3) % 5 === 0) p.set(x, y, shade(c, 0.9));
    if ((x * 2 + y) % 7 === 0) p.set(x, y, shade(c, 1.07));
  }
}
function metalBlock(p, c) {
  p.fill(c, 0.03);
  for (let i = 0; i < 16; i++) { p.set(i, 0, shade(c, 1.25)); p.set(0, i, shade(c, 1.2)); p.set(i, 15, shade(c, 0.7)); p.set(15, i, shade(c, 0.75)); }
  for (let i = 2; i < 14; i++) p.set(i, 13 - (i % 3), shade(c, 1.1));
}
function bricksPattern(p, c, mortar, bw, bh) {
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const row = Math.floor(y / bh), off = row % 2 ? bw / 2 : 0;
    const mx = (x + off) % bw === 0, my = y % bh === 0;
    p.set(x, y, mx || my ? vary(mortar, 0.06, p.r) : vary(c, 0.09, p.r));
  }
}
const FONT3 = { T: ['111', '010', '010', '010', '010'], N: ['101', '111', '111', '111', '101'] };
function text3(p, s, x0, y0, c) {
  for (let i = 0; i < s.length; i++) {
    const g = FONT3[s[i]];
    for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) if (g[y][x] === '1') p.set(x0 + i * 4 + x, y0 + y, c);
  }
}
function plant(p, stemC, fn) {
  p.fill([0, 0, 0], 0);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) p.set(x, y, [0, 0, 0], 0);
  fn(p);
}
function flower(p, petal, center, stem) {
  plant(p, stem, () => {
    for (let y = 8; y < 16; y++) p.set(7, y, stem || [60, 120, 40]);
    p.set(6, 12, [70, 140, 50]); p.set(8, 11, [70, 140, 50]); p.set(5, 13, [60, 130, 45]); p.set(9, 12, [60, 130, 45]);
    const pts = [[7, 4], [6, 5], [8, 5], [5, 6], [9, 6], [6, 7], [8, 7], [7, 8], [6, 6], [8, 6], [7, 5], [7, 7]];
    pts.forEach(q => p.set(q[0], q[1], vary(petal, 0.1, p.r)));
    p.set(7, 6, center);
  });
}

function buildTextures() {
  const STONE = [125, 125, 125], DIRT = [134, 96, 67], DEEP = [80, 80, 86];
  defTex('stone', p => stoneLike(p, STONE));
  defTex('cobblestone', p => cellular(p, [128, 128, 128], [80, 80, 80], 11));
  defTex('mossy_cobblestone', p => { cellular(p, [128, 128, 128], [80, 80, 80], 11); p.speck([80, 120, 50], 30, 2); });
  defTex('dirt', p => { p.fill(DIRT, 0.1); p.speck([108, 76, 52], 18, 2); p.speck([150, 112, 80], 10, 1); });
  defTex('grass_top', p => { p.fill([150, 150, 150], 0.16); p.speck([120, 120, 120], 20, 1); });
  defTex('grass_side', p => {
    p.fill(DIRT, 0.1); p.speck([108, 76, 52], 14, 2);
    for (let x = 0; x < 16; x++) { const h = 3 + Math.floor(p.r() * 3); for (let y = 0; y < h; y++) p.set(x, y, vary([95, 159, 53], 0.12, p.r)); }
  });
  defTex('snow', p => { p.fill([240, 250, 252], 0.03); p.speck([220, 232, 240], 10, 1); });
  defTex('grass_snow_side', p => {
    p.fill(DIRT, 0.1);
    for (let x = 0; x < 16; x++) { const h = 3 + Math.floor(p.r() * 3); for (let y = 0; y < h; y++) p.set(x, y, vary([240, 250, 252], 0.03, p.r)); }
  });
  defTex('sand', p => { p.fill([219, 207, 163], 0.06); p.speck([200, 186, 140], 20, 1); });
  defTex('red_sand', p => { p.fill([190, 102, 33], 0.07); p.speck([170, 90, 30], 20, 1); });
  defTex('gravel', p => cellular(p, [130, 124, 122], [100, 94, 92], 18, 0.15));
  defTex('clay', p => { p.fill([160, 166, 179], 0.05); p.speck([145, 150, 162], 14, 2); });
  defTex('sandstone_top', p => p.fill([218, 205, 160], 0.04));
  defTex('sandstone_side', p => { p.fill([216, 202, 156], 0.04); for (let x = 0; x < 16; x++) { p.set(x, 3, [200, 186, 140]); p.set(x, 10, [196, 180, 135]); p.set(x, 15, [190, 175, 130]); } });
  defTex('bedrock', p => cellular(p, [90, 90, 90], [40, 40, 40], 14, 0.25));
  defTex('obsidian', p => { p.fill([20, 16, 32], 0.15); p.speck([60, 40, 90], 12, 2); });
  defTex('deepslate', p => { p.fill(DEEP, 0.07); for (let y = 0; y < 16; y += 3) for (let x = 0; x < 16; x++) if (p.r() < 0.5) p.set(x, y, shade(DEEP, 0.8)); });
  defTex('deepslate_top', p => { p.fill(DEEP, 0.07); p.speck([64, 64, 70], 20, 1); });
  defTex('cobbled_deepslate', p => cellular(p, [80, 80, 86], [50, 50, 55], 12));
  defTex('water', p => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, vary([46, 92, 210], 0.08, p.r), 175); for (let i = 0; i < 6; i++) { const y = Math.floor(p.r() * 16), x = Math.floor(p.r() * 12); for (let k = 0; k < 4; k++) p.set(x + k, y, [80, 130, 230], 185); } });
  defTex('lava', p => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const n = Math.sin(x * 0.9 + p.r()) + Math.cos(y * 0.7 + p.r() * 2); p.set(x, y, n > 0.6 ? [255, 210, 80] : n > -0.4 ? [234, 120, 20] : [200, 70, 10]); } });
  defTex('ice', p => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, vary([140, 180, 252], 0.05, p.r), 200); for (let i = 0; i < 5; i++) { const x = Math.floor(p.r() * 14); for (let k = 0; k < 3; k++) p.set(x + k, 2 + i * 3 - k, [220, 235, 255], 220); } });
  defTex('packed_ice', p => { p.fill([150, 185, 245], 0.05); p.speck([190, 215, 255], 12, 2); });
  defTex('glass', p => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, [255, 255, 255], 0);
    for (let i = 0; i < 16; i++) { p.set(i, 0, [220, 240, 245]); p.set(i, 15, [190, 220, 230]); p.set(0, i, [220, 240, 245]); p.set(15, i, [190, 220, 230]); }
    for (let k = 0; k < 4; k++) { p.set(3 + k, 5 - k, [240, 250, 255], 200); p.set(9 + k, 12 - k, [240, 250, 255], 200); }
  });
  defTex('magma', p => { cellular(p, [140, 50, 20], [255, 140, 30], 9, 0.15); });

  // 木材
  const woods = {
    oak: { bark: [109, 85, 50], dark: [80, 62, 36], inner: [176, 142, 88], plank: [162, 130, 78] },
    birch: { bark: [216, 215, 210], dark: [50, 50, 46], inner: [200, 184, 130], plank: [196, 179, 123] },
    spruce: { bark: [62, 42, 22], dark: [44, 28, 14], inner: [120, 88, 52], plank: [115, 85, 49] },
    cherry: { bark: [54, 33, 44], dark: [36, 20, 28], inner: [226, 170, 164], plank: [226, 178, 172] },
    pale_oak: { bark: [170, 160, 152], dark: [120, 112, 106], inner: [236, 230, 226], plank: [230, 224, 220] },
    poplar: { bark: [176, 168, 150], dark: [90, 84, 72], inner: [214, 192, 140], plank: [212, 186, 136] },
  };
  for (const k in woods) {
    const w = woods[k];
    defTex(k + '_log', p => logSide(p, w.bark, w.dark));
    defTex(k + '_log_top', p => logTop(p, w.bark, w.inner));
    defTex(k + '_planks', p => planks(p, w.plank));
  }
  defTex('oak_leaves', p => leaves(p, [150, 150, 150]));
  defTex('birch_leaves', p => leaves(p, [118, 158, 78]));
  defTex('spruce_leaves', p => leaves(p, [60, 96, 60], 0.1));
  defTex('cherry_leaves', p => leaves(p, [236, 168, 204]));
  defTex('pale_oak_leaves', p => leaves(p, [140, 150, 130]));
  defTex('poplar_leaves_red', p => leaves(p, [186, 52, 40]));
  defTex('poplar_leaves_yellow', p => leaves(p, [226, 186, 54]));
  defTex('poplar_leaves_orange', p => leaves(p, [224, 122, 40]));

  // 矿石
  const ores = { coal: [30, 30, 30], iron: [216, 175, 147], copper: [224, 128, 90], gold: [250, 220, 70], redstone: [220, 20, 20], lapis: [30, 70, 190], diamond: [90, 236, 220], emerald: [30, 200, 90] };
  for (const k in ores) {
    defTex(k + '_ore', p => oreTex(p, q => stoneLike(q, STONE), ores[k], 4));
    defTex('deepslate_' + k + '_ore', p => oreTex(p, q => q.fill(DEEP, 0.07), ores[k], 4));
  }
  const metals = { iron_block: [220, 220, 220], gold_block: [250, 214, 60], diamond_block: [100, 230, 225], copper_block: [192, 108, 80], emerald_block: [40, 200, 100], coal_block: [24, 24, 24], redstone_block: [176, 24, 14], lapis_block: [30, 64, 160] };
  for (const k in metals) defTex(k, p => metalBlock(p, metals[k]));

  // 功能方块
  defTex('crafting_table_top', p => { planks(p, [162, 130, 78]); for (let i = 0; i < 16; i++) { p.set(i, 0, [80, 55, 30]); p.set(0, i, [80, 55, 30]); p.set(i, 15, [80, 55, 30]); p.set(15, i, [80, 55, 30]); p.set(i, 5, [110, 80, 45]); p.set(i, 10, [110, 80, 45]); p.set(5, i, [110, 80, 45]); p.set(10, i, [110, 80, 45]); } });
  defTex('crafting_table_side', p => { planks(p, [162, 130, 78]); p.rect(0, 0, 16, 3, [110, 80, 45]); p.rect(3, 6, 2, 8, [100, 100, 100]); p.rect(2, 5, 4, 2, [140, 140, 140]); p.rect(10, 6, 1, 8, [110, 80, 45]); p.rect(9, 5, 4, 2, [150, 150, 150]); });
  defTex('crafting_table_front', p => { planks(p, [162, 130, 78]); p.rect(0, 0, 16, 3, [110, 80, 45]); p.rect(4, 6, 8, 2, [120, 120, 120]); p.rect(7, 8, 2, 7, [110, 80, 45]); });
  const furnaceBase = p => stoneLike(p, [110, 110, 110]);
  defTex('furnace_side', p => { furnaceBase(p); p.rect(0, 0, 16, 2, [90, 90, 90]); });
  defTex('furnace_top', p => furnaceBase(p));
  defTex('furnace_front', p => { furnaceBase(p); p.rect(3, 3, 10, 4, [70, 70, 70]); p.rect(3, 9, 10, 5, [25, 25, 25]); p.rect(3, 8, 10, 1, [90, 90, 90]); });
  defTex('furnace_front_lit', p => { furnaceBase(p); p.rect(3, 3, 10, 4, [70, 70, 70]); p.rect(3, 9, 10, 5, [25, 25, 25]); p.rect(4, 11, 8, 3, [255, 160, 40], 0.2); p.rect(5, 10, 6, 1, [255, 220, 90]); });
  const chestC = [160, 110, 40];
  defTex('chest_side', p => { p.fill(chestC, 0.06); p.rect(0, 0, 16, 1, [70, 45, 15]); p.rect(0, 15, 16, 1, [70, 45, 15]); p.rect(0, 0, 1, 16, [70, 45, 15]); p.rect(15, 0, 1, 16, [70, 45, 15]); p.rect(0, 6, 16, 1, [70, 45, 15]); });
  defTex('chest_front', p => { p.fill(chestC, 0.06); p.rect(0, 0, 16, 1, [70, 45, 15]); p.rect(0, 15, 16, 1, [70, 45, 15]); p.rect(0, 0, 1, 16, [70, 45, 15]); p.rect(15, 0, 1, 16, [70, 45, 15]); p.rect(0, 6, 16, 1, [70, 45, 15]); p.rect(7, 4, 2, 4, [200, 200, 200]); });
  defTex('chest_top', p => { p.fill(chestC, 0.06); p.rect(0, 0, 16, 1, [70, 45, 15]); p.rect(0, 15, 16, 1, [70, 45, 15]); p.rect(0, 0, 1, 16, [70, 45, 15]); p.rect(15, 0, 1, 16, [70, 45, 15]); });
  defTex('tnt_side', p => { p.fill([200, 40, 30], 0.08); for (let x = 0; x < 16; x += 4) p.rect(x, 0, 1, 16, [150, 30, 20]); p.rect(0, 5, 16, 6, [235, 235, 235]); text3(p, 'TNT', 2, 6, [30, 30, 30]); });
  defTex('tnt_top', p => { p.fill([200, 40, 30], 0.08); p.rect(5, 5, 6, 6, [180, 180, 180]); p.rect(7, 7, 2, 2, [40, 40, 40]); });
  defTex('tnt_bottom', p => p.fill([200, 40, 30], 0.08));
  defTex('bookshelf', p => {
    planks(p, [162, 130, 78]);
    const colors = [[150, 40, 40], [40, 80, 150], [50, 120, 50], [180, 150, 60], [110, 50, 120]];
    for (const y0 of [1, 9]) for (let x = 1; x < 15; x++) { const c = colors[Math.floor(p.r() * 5)]; const h = 5 + Math.floor(p.r() * 2); for (let y = 0; y < h; y++) p.set(x, y0 + 6 - h + y, shade(c, 0.9 + p.r() * 0.2)); }
  });
  defTex('bricks', p => bricksPattern(p, [150, 70, 54], [180, 170, 160], 8, 4));
  defTex('stone_bricks', p => { bricksPattern(p, [122, 122, 122], [80, 80, 80], 8, 8); });
  defTex('mossy_stone_bricks', p => { bricksPattern(p, [122, 122, 122], [80, 80, 80], 8, 8); p.speck([80, 120, 50], 26, 2); });
  defTex('glowstone', p => cellular(p, [230, 190, 110], [140, 100, 50], 10, 0.2));
  defTex('moss_block', p => { p.fill([90, 120, 46], 0.12); p.speck([70, 100, 36], 20, 2); });
  defTex('pumpkin_side', p => { p.fill([216, 128, 30], 0.06); for (let x = 0; x < 16; x += 4) p.rect(x, 0, 1, 16, [180, 100, 20]); });
  defTex('pumpkin_top', p => { p.fill([216, 128, 30], 0.06); p.rect(7, 6, 2, 3, [90, 110, 40]); });
  defTex('melon_side', p => { p.fill([110, 150, 30], 0.08); for (let x = 1; x < 16; x += 3) p.rect(x, 0, 1, 16, [170, 190, 60]); });
  defTex('melon_top', p => { p.fill([110, 150, 30], 0.08); p.rect(7, 7, 2, 2, [80, 100, 30]); });
  defTex('hay_side', p => { p.fill([200, 170, 40], 0.1); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if ((x + Math.floor(p.r() * 2)) % 3 === 0) p.set(x, y, [170, 140, 30]); p.rect(0, 4, 16, 1, [110, 80, 30]); p.rect(0, 11, 16, 1, [110, 80, 30]); });
  defTex('hay_top', p => { p.fill([200, 170, 40], 0.12); p.speck([160, 130, 30], 30, 1); });
  defTex('farmland', p => { p.fill([96, 64, 40], 0.1); for (let y = 1; y < 16; y += 4) p.rect(0, y, 16, 1, [70, 46, 28]); });
  defTex('bed_top', p => { p.fill([180, 30, 30], 0.05); p.rect(0, 0, 16, 6, [235, 235, 235]); p.rect(0, 6, 16, 1, [140, 20, 20]); });
  defTex('bed_side', p => { p.fill([162, 130, 78], 0.05); p.rect(0, 0, 16, 9, [180, 30, 30]); p.rect(0, 0, 4, 9, [235, 235, 235]); });
  defTex('straw_bed_top', p => { p.fill([214, 186, 90], 0.12); for (let y = 0; y < 16; y += 2) for (let x = 0; x < 16; x++) if (p.r() < 0.4) p.set(x, y, [180, 150, 60]); });
  defTex('cushion', p => { p.fill([170, 60, 50], 0.04); for (let i = 2; i < 14; i++) { p.set(i, 2, [200, 90, 70]); p.set(i, 13, [130, 40, 30]); p.set(2, i, [200, 90, 70]); p.set(13, i, [130, 40, 30]); } p.rect(7, 7, 2, 2, [230, 200, 120]); });
  const woolColors = { white: [233, 236, 236], orange: [240, 118, 19], magenta: [189, 68, 179], light_blue: [58, 175, 217], yellow: [248, 197, 39], lime: [112, 185, 25], pink: [237, 141, 172], gray: [62, 68, 71], light_gray: [142, 142, 134], cyan: [21, 137, 145], purple: [121, 42, 172], blue: [53, 57, 157], brown: [114, 71, 40], green: [84, 109, 27], red: [161, 39, 34], black: [20, 21, 25] };
  for (const k in woolColors) defTex(k + '_wool', p => wool(p, woolColors[k]));
  defTex('terracotta', p => p.fill([152, 94, 67], 0.05));

  // 植物
  defTex('short_grass', p => plant(p, 0, () => { for (let i = 0; i < 9; i++) { const x = 1 + Math.floor(p.r() * 14), h = 5 + Math.floor(p.r() * 9); for (let y = 16 - h; y < 16; y++) p.set(x + (y < 10 && p.r() < 0.3 ? 1 : 0), y, shade([160, 160, 160], 0.7 + p.r() * 0.5)); } }));
  defTex('fern', p => plant(p, 0, () => { for (let y = 3; y < 16; y++) { p.set(7, y, [140, 140, 140]); const w = Math.floor((16 - y) / 3); for (let k = 1; k <= w; k++) if (y % 2) { p.set(7 - k, y - 1, [150, 150, 150]); p.set(7 + k, y - 1, [130, 130, 130]); } } }));
  defTex('dandelion', p => flower(p, [250, 220, 30], [240, 180, 20]));
  defTex('poppy', p => flower(p, [220, 30, 30], [40, 20, 20]));
  defTex('cornflower', p => flower(p, [70, 100, 230], [40, 60, 160]));
  defTex('allium', p => flower(p, [180, 100, 220], [150, 70, 190]));
  defTex('orange_tulip', p => flower(p, [240, 120, 30], [200, 90, 20]));
  defTex('oxeye_daisy', p => flower(p, [240, 240, 240], [240, 200, 40]));
  defTex('dead_bush', p => plant(p, 0, () => { const c = [120, 80, 40]; for (let y = 8; y < 16; y++) p.set(7, y, c); for (let k = 0; k < 5; k++) { p.set(7 - k, 8 - k, c); p.set(7 + k, 9 - k, c); p.set(5 + k, 5 - Math.floor(k / 2), c); } }));
  const sap = (leaf, stem) => p => plant(p, 0, () => { for (let y = 10; y < 16; y++) p.set(7, y, stem); for (let y = 2; y < 11; y++) for (let x = 3; x < 12; x++) if (Math.abs(x - 7) + Math.abs(y - 6) < 5 && p.r() < 0.75) p.set(x, y, shade(leaf, 0.8 + p.r() * 0.4)); });
  defTex('oak_sapling', sap([70, 140, 40], [100, 70, 40]));
  defTex('birch_sapling', sap([118, 158, 78], [210, 210, 200]));
  defTex('spruce_sapling', sap([50, 90, 50], [70, 50, 25]));
  defTex('cherry_sapling', sap([236, 168, 204], [70, 40, 50]));
  defTex('poplar_sapling', sap([224, 140, 40], [176, 168, 150]));
  defTex('red_mushroom', p => plant(p, 0, () => { p.rect(7, 10, 2, 6, [220, 210, 190]); p.rect(4, 6, 8, 4, [200, 30, 30]); p.rect(5, 5, 6, 1, [200, 30, 30]); p.set(5, 7, [255, 255, 255]); p.set(9, 6, [255, 255, 255]); p.set(10, 8, [255, 255, 255]); }));
  defTex('brown_mushroom', p => plant(p, 0, () => { p.rect(7, 11, 2, 5, [220, 210, 190]); p.rect(4, 8, 8, 3, [150, 110, 80]); p.rect(5, 7, 6, 1, [160, 120, 90]); }));
  defTex('sugar_cane', p => plant(p, 0, () => { for (const x of [3, 8, 12]) for (let y = 0; y < 16; y++) p.set(x, y, y % 5 === 0 ? [150, 200, 100] : [110, 170, 70]); p.set(4, 4, [90, 150, 60]); p.set(9, 9, [90, 150, 60]); }));
  defTex('cactus_side', p => { p.fill([88, 132, 40], 0.06); for (let x = 1; x < 16; x += 4) p.rect(x, 0, 1, 16, [60, 100, 30]); for (let i = 0; i < 8; i++) p.set(Math.floor(p.r() * 16), Math.floor(p.r() * 16), [230, 230, 180]); });
  defTex('cactus_top', p => { p.fill([100, 150, 50], 0.06); p.rect(4, 4, 8, 8, [120, 170, 70]); });
  for (let s = 0; s < 4; s++) defTex('wheat_' + s, p => plant(p, 0, () => { const h = 4 + s * 3; const c = s === 3 ? [200, 170, 60] : [90, 160, 40]; for (const x of [2, 5, 8, 11, 14]) { for (let y = 16 - h; y < 16; y++) p.set(x, y, shade(c, 0.85 + p.r() * 0.3)); if (s === 3) { p.set(x - 1, 16 - h + 1, [180, 150, 50]); p.set(x + 1, 16 - h + 2, [180, 150, 50]); } } }));
  defTex('torch', p => plant(p, 0, () => { p.rect(7, 6, 2, 10, [110, 80, 40]); p.rect(7, 6, 2, 2, [255, 230, 120]); p.set(7, 5, [255, 200, 60]); p.set(8, 5, [255, 160, 40]); }));
  defTex('campfire', p => plant(p, 0, () => { p.rect(1, 13, 14, 2, [100, 70, 40]); p.rect(3, 11, 10, 2, [80, 55, 30]); for (let x = 4; x < 12; x++) { const h = 3 + Math.floor(p.r() * 7); for (let y = 11 - h; y < 11; y++) p.set(x, y, y < 11 - h / 2 ? [255, 220, 90] : [250, 130, 30]); } }));

  // 26.2 硫磺洞穴
  const SUL = [212, 196, 70], CIN = [170, 40, 36];
  defTex('sulfur', p => { p.fill(SUL, 0.08); for (let y = 0; y < 16; y += 4) for (let x = 0; x < 16; x++) if (p.r() < 0.6) p.set(x, y + Math.floor(p.r() * 2), shade(SUL, 0.85)); p.speck([235, 222, 110], 10, 1); });
  defTex('cinnabar', p => { p.fill(CIN, 0.1); p.speck([210, 70, 60], 16, 2); p.speck([110, 24, 24], 10, 1); });
  defTex('potent_sulfur', p => { cellular(p, [230, 214, 80], [160, 140, 30], 8, 0.1); p.speck([250, 240, 160], 8, 1); });
  defTex('polished_sulfur', p => { p.fill(SUL, 0.03); for (let i = 0; i < 16; i++) { p.set(i, 0, shade(SUL, 1.12)); p.set(0, i, shade(SUL, 1.1)); p.set(i, 15, shade(SUL, 0.78)); p.set(15, i, shade(SUL, 0.8)); } });
  defTex('sulfur_bricks', p => bricksPattern(p, SUL, shade(SUL, 0.7), 8, 4));
  defTex('polished_cinnabar', p => { p.fill(CIN, 0.03); for (let i = 0; i < 16; i++) { p.set(i, 0, shade(CIN, 1.2)); p.set(0, i, shade(CIN, 1.15)); p.set(i, 15, shade(CIN, 0.7)); p.set(15, i, shade(CIN, 0.72)); } });
  defTex('cinnabar_bricks', p => bricksPattern(p, CIN, shade(CIN, 0.65), 8, 4));
  defTex('sulfur_spike', p => plant(p, 0, () => { for (let y = 0; y < 16; y++) { const w = Math.max(0, Math.floor(y / 3)); for (let x = 8 - w / 2 - 1; x <= 8 + w / 2; x++) p.set(Math.floor(x), y, vary(SUL, 0.1, p.r)); } }));
  // 26.3 斑驳森林
  defTex('red_shrub', p => plant(p, 0, () => { for (let i = 0; i < 70; i++) { const x = 1 + Math.floor(p.r() * 14), y = 5 + Math.floor(p.r() * 11); p.set(x, y, shade([176, 40, 34], 0.75 + p.r() * 0.5)); } for (let y = 12; y < 16; y++) p.set(7, y, [90, 50, 30]); }));
  defTex('shelf_mushroom', p => plant(p, 0, () => { p.rect(2, 7, 12, 2, [196, 140, 80]); p.rect(3, 6, 10, 1, [220, 170, 100]); p.rect(4, 10, 8, 2, [180, 120, 70]); p.rect(5, 9, 6, 1, [210, 160, 90]); }));
  // 苍白之园
  defTex('creaking_heart', p => { logSide(p, [170, 160, 152], [120, 112, 106]); p.rect(5, 5, 6, 6, [60, 50, 45]); p.rect(6, 7, 1, 2, [255, 150, 40]); p.rect(9, 7, 1, 2, [255, 150, 40]); });

  // 破坏裂纹 0..9
  for (let s = 0; s < 10; s++) defTex('destroy_' + s, p => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, [0, 0, 0], 0);
    const r = mulberry32(777);
    const lines = 2 + s * 2;
    for (let i = 0; i < lines; i++) {
      let x = 8 + Math.floor((r() - 0.5) * (4 + s)), y = 8 + Math.floor((r() - 0.5) * (4 + s));
      const len = 3 + Math.floor(r() * (2 + s));
      for (let k = 0; k < len; k++) { p.set(x, y, [20, 20, 20], 170); x += Math.floor(r() * 3) - 1; y += Math.floor(r() * 3) - 1; }
    }
  });
}

function buildAtlas() {
  const n = TEX_IMG.length, cols = 32, rows = Math.pow(2, Math.ceil(Math.log2(Math.ceil(n / cols))));
  const cv = document.createElement('canvas');
  cv.width = cols * TS; cv.height = rows * TS;
  const ctx = cv.getContext('2d');
  for (let i = 0; i < n; i++) {
    const img = new ImageData(new Uint8ClampedArray(TEX_IMG[i]), TS, TS);
    ctx.putImageData(img, (i % cols) * TS, Math.floor(i / cols) * TS);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  ATLAS = { canvas: cv, ctx, cols, rows, texture: tex, frame: -1 };
}

// 动画纹理（水、熔岩、传送门……）按时间切帧
function animateAtlas(t) {
  if (!ATLAS || !TEX_ANIM.length) return;
  const f = Math.floor(t * 8);
  if (f === ATLAS.frame) return;
  ATLAS.frame = f;
  for (const a of TEX_ANIM) {
    const k = Math.floor(f / a.speed) % a.frames.length;
    if (a.cur === k) continue;
    a.cur = k;
    ATLAS.ctx.putImageData(new ImageData(new Uint8ClampedArray(a.frames[k]), TS, TS), (a.idx % ATLAS.cols) * TS, Math.floor(a.idx / ATLAS.cols) * TS);
    ATLAS.texture.needsUpdate = true;
  }
}

// 图集中某个纹理的 UV 矩形（可选子区域，像素坐标 0..16，y 自上而下）
function tileUV(idx, px0, py0, px1, py1) {
  const c = idx % ATLAS.cols, r = Math.floor(idx / ATLAS.cols);
  if (px0 === undefined) { px0 = 0; py0 = 0; px1 = 16; py1 = 16; }
  const e = 0.0005;
  return {
    u0: (c * TS + px0) / (ATLAS.cols * TS) + e, u1: (c * TS + px1) / (ATLAS.cols * TS) - e,
    v1: 1 - (r * TS + py0) / (ATLAS.rows * TS) - e, v0: 1 - (r * TS + py1) / (ATLAS.rows * TS) + e,
  };
}
