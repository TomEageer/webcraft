'use strict';
// ---------- 物品图标：方块等轴渲染 + 物品像素画 ----------

const ICON_URL = new Map(), ICON_CANVAS = new Map(), ICON_TEX = new Map(), TILE_CANVAS = new Map();
const IS = 48;

function tileCanvas(idx, tint) {
  const k = idx + (tint ? ':' + tint.join(',') : '');
  if (TILE_CANVAS.has(k)) return TILE_CANVAS.get(k);
  const cv = document.createElement('canvas'); cv.width = 16; cv.height = 16;
  const src = TEX_IMG[idx], d = new Uint8ClampedArray(src);
  if (tint) for (let i = 0; i < d.length; i += 4) { d[i] *= tint[0]; d[i + 1] *= tint[1]; d[i + 2] *= tint[2]; }
  cv.getContext('2d').putImageData(new ImageData(d, 16, 16), 0, 0);
  TILE_CANVAS.set(k, cv);
  return cv;
}

function drawIsoBlock(ctx, def) {
  ctx.imageSmoothingEnabled = false;
  const tint = def.tint ? (def.tint === 'grass' ? [0.57, 0.74, 0.35] : [0.47, 0.67, 0.19]) : null;
  const hf = def.shape === 'slab' ? 0.5 : def.shape === 'bed' ? 0.56 : def.shape === 'cushion' ? 0.32 : def.shape === 'farmland' ? 0.94 : 1;
  const top = tileCanvas(texOf(def, 2, 0), tint);
  const sideTint = def.tint === 'grass' ? null : tint;
  const left = tileCanvas(texOf(def, 4, 0), sideTint), right = tileCanvas(texOf(def, 0, 0), sideTint);
  const s = 21 / 16, v = 10 / 16, dv = 22 / 16, off = 22 * (1 - hf);
  const face = (img, a, b, c, d, e, f, dark, h) => {
    ctx.save(); ctx.setTransform(a, b, c, d, e, f);
    ctx.drawImage(img, 0, 16 - 16 * h, 16, 16 * h, 0, 0, 16, 16 * h);
    if (dark) { ctx.fillStyle = `rgba(0,0,0,${dark})`; ctx.fillRect(0, 0, 16, 16 * h); }
    ctx.restore();
  };
  face(left, s, v, 0, dv, 3, 13 + off, 0.22, hf);
  face(right, s, -v, 0, dv, 24, 23 + off, 0.4, hf);
  ctx.save(); ctx.setTransform(s, v, -s, v, 24, 3 + off); ctx.drawImage(top, 0, 0); ctx.restore();
}

function drawStairsIcon(ctx, def) {
  // 用两次等轴绘制近似楼梯
  drawIsoBlock(ctx, Object.assign({}, def, { shape: 'slab' }));
  ctx.save(); ctx.translate(-5, -2); ctx.scale(1, 1);
  const half = Object.assign({}, def, { shape: 'slab' });
  ctx.globalAlpha = 1; ctx.translate(0, -12); ctx.scale(0.999, 1);
  drawIsoBlock(ctx, half); ctx.restore();
}

// ---- 物品像素画 ----
const TOOL_MAT = { wooden: [168, 126, 72], stone: [136, 136, 136], iron: [224, 224, 224], golden: [250, 222, 80], diamond: [96, 232, 222] };
const STICK = [120, 86, 44], STICK_D = [86, 60, 30];
function px16(fn) {
  const cv = document.createElement('canvas'); cv.width = 16; cv.height = 16;
  const ctx = cv.getContext('2d');
  const set = (x, y, c, a) => { if (x < 0 || y < 0 || x > 15 || y > 15) return; ctx.fillStyle = `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a === undefined ? 1 : a})`; ctx.fillRect(x, y, 1, 1); };
  fn(set, ctx);
  return cv;
}
const sh = (c, f) => [c[0] * f, c[1] * f, c[2] * f];
function handle(set, len) { for (let i = 0; i < len; i++) { set(2 + i, 13 - i, i % 2 ? STICK : STICK_D); set(1 + i, 13 - i, sh(STICK_D, 0.8)); } }
function toolIcon(kind, c) {
  return px16(set => {
    if (kind === 'sword') {
      for (let i = 0; i < 9; i++) { set(5 + i, 10 - i, c); set(6 + i, 10 - i, sh(c, 0.75)); set(5 + i, 9 - i, sh(c, 1.15)); }
      set(3, 9, [80, 60, 30]); set(4, 10, [80, 60, 30]); set(5, 11, [80, 60, 30]); set(6, 12, [80, 60, 30]); set(4, 9, sh(c, 0.6)); set(6, 11, sh(c, 0.6));
      for (let i = 0; i < 3; i++) set(2 + i, 13 - i, STICK); set(1, 14, sh(STICK, 0.7));
      return;
    }
    handle(set, kind === 'shovel' ? 9 : 10);
    if (kind === 'pickaxe') {
      const pts = [[5, 2], [6, 1], [7, 1], [8, 1], [9, 2], [10, 2], [11, 3], [12, 4], [13, 5], [13, 6], [14, 7], [14, 8], [14, 9]];
      pts.forEach(([x, y], i) => { set(x, y, c); set(x - (i > 6 ? 1 : 0), y + (i > 6 ? 0 : 1), sh(c, 0.7)); });
    } else if (kind === 'axe') {
      for (let y = 1; y < 7; y++) for (let x = 8; x < 13; x++) if (x - 8 + (6 - y) < 8 && !(x + y === 15)) set(x, y, (x + y) % 3 ? c : sh(c, 0.75));
      set(12, 1, sh(c, 1.15)); set(13, 2, sh(c, 0.8));
    } else if (kind === 'shovel') {
      for (let y = 1; y < 6; y++) for (let x = 10; x < 15; x++) if (Math.abs((x - 12) + (y - 3)) < 3 && Math.abs((x - 12) - (y - 3)) < 4) set(x, y, (x * y) % 4 ? c : sh(c, 0.75));
    } else if (kind === 'hoe') {
      [[8, 2], [9, 2], [10, 2], [11, 3], [12, 3], [12, 4]].forEach(([x, y]) => { set(x, y, c); set(x, y + 1, sh(c, 0.7)); });
    }
  });
}
function blob(set, cx, cy, r, c, var_, seed) {
  const rr = mulberry32(seed || 5);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d < r + (rr() - 0.5) * 0.8) set(x, y, sh(c, 0.82 + rr() * (var_ || 0.3) + (y < cy ? 0.12 : 0)));
  }
}
function itemIcon(name) {
  const m = name.match(/^(wooden|stone|iron|golden|diamond)_(pickaxe|axe|shovel|hoe|sword)$/);
  if (m) return toolIcon(m[2], TOOL_MAT[m[1]]);
  const ingot = c => px16(set => { for (let y = 6; y < 11; y++) for (let x = 3 + (10 - y); x < 13 - (y - 6) + 1; x++) set(x, y, y === 6 ? sh(c, 1.2) : y === 10 ? sh(c, 0.7) : c); });
  const gem = c => px16(set => { for (let y = 2; y < 14; y++) { const w = y < 6 ? (y - 1) * 1.5 : (14 - y) * 0.8; for (let x = Math.round(8 - w); x <= Math.round(7 + w); x++) set(x, y, y < 6 ? sh(c, 1.25) : (x < 8 ? c : sh(c, 0.75))); } });
  const dust = (c, n) => px16(set => { const r = mulberry32(hashString(name)); for (let i = 0; i < (n || 26); i++) { const x = 3 + Math.floor(r() * 10), y = 4 + Math.floor(r() * 9); set(x, y, sh(c, 0.7 + r() * 0.5)); } });
  const meat = (c, cooked) => px16(set => { blob(set, 8, 8, 5, c, 0.3, 3); for (let i = 0; i < 4; i++) set(12 + (i >> 1), 3 + i, [240, 236, 220]); if (!cooked) { set(6, 7, [255, 240, 240]); set(8, 9, [255, 240, 240]); } });
  const egg = (a, b) => px16(set => { for (let y = 2; y < 15; y++) for (let x = 3; x < 13; x++) { const dx = (x - 7.5) / 4.6, dy = (y - 8.8) / (y < 8 ? 6.5 : 5.5); if (dx * dx + dy * dy < 1) set(x, y, ((x * 7 + y * 3) % 5 === 0) ? b : a); } });
  switch (name) {
    case 'stick': return px16(set => handle(set, 12));
    case 'coal': return px16(set => blob(set, 8, 8, 5, [40, 40, 40], 0.5));
    case 'charcoal': return px16(set => blob(set, 8, 8, 5, [60, 48, 38], 0.5));
    case 'raw_iron': return px16(set => blob(set, 8, 8, 5, [200, 160, 130], 0.4));
    case 'raw_gold': return px16(set => blob(set, 8, 8, 5, [236, 190, 50], 0.4));
    case 'raw_copper': return px16(set => blob(set, 8, 8, 5, [200, 110, 70], 0.4));
    case 'iron_ingot': return ingot([220, 220, 220]);
    case 'gold_ingot': return ingot([250, 214, 60]);
    case 'copper_ingot': return ingot([214, 120, 80]);
    case 'brick': return ingot([170, 80, 60]);
    case 'diamond': return gem([96, 232, 222]);
    case 'emerald': return gem([40, 210, 100]);
    case 'lapis_lazuli': return gem([40, 80, 200]);
    case 'redstone': return dust([220, 20, 20]);
    case 'glowstone_dust': return dust([250, 220, 120]);
    case 'gunpowder': return dust([90, 90, 90]);
    case 'bone_meal': return dust([240, 240, 230]);
    case 'flint': return px16(set => { for (let y = 3; y < 13; y++) for (let x = 5; x < 12; x++) if (Math.abs(x - 8) < (y < 8 ? y - 2 : 13 - y) * 0.7) set(x, y, x < 8 ? [70, 70, 74] : [40, 40, 44]); });
    case 'clay_ball': return px16(set => blob(set, 8, 8, 4.5, [160, 166, 179], 0.2));
    case 'slime_ball': return px16(set => blob(set, 8, 8, 4.5, [110, 200, 90], 0.3));
    case 'apple': return px16(set => { blob(set, 8, 9, 5, [220, 30, 30], 0.3); set(8, 3, [90, 60, 30]); set(8, 4, [90, 60, 30]); set(9, 3, [60, 160, 40]); set(10, 3, [60, 160, 40]); set(6, 7, [255, 200, 200]); });
    case 'bread': return px16(set => { for (let y = 6; y < 12; y++) for (let x = 2; x < 14; x++) if (Math.abs(x - 8) + Math.abs(y - 9) * 2 < 9) set(x, y, y < 8 ? [200, 140, 60] : [170, 110, 40]); [4, 7, 10].forEach(x => set(x, 7, [230, 190, 110])); });
    case 'melon_slice': return px16(set => { for (let y = 4; y < 13; y++) for (let x = 3; x < 14; x++) { const d = Math.hypot(x - 8, y - 4); if (d < 9 && y >= 4) set(x, y, d > 7.5 ? [80, 140, 40] : d > 6.6 ? [230, 230, 170] : [230, 60, 60]); } set(7, 7, [30, 30, 30]); set(10, 8, [30, 30, 30]); });
    case 'porkchop': return meat([240, 140, 140]);
    case 'cooked_porkchop': return meat([190, 120, 70], true);
    case 'beef': return meat([200, 50, 50]);
    case 'cooked_beef': return meat([120, 70, 40], true);
    case 'chicken': return meat([240, 200, 180]);
    case 'cooked_chicken': return meat([200, 140, 70], true);
    case 'mutton': return meat([210, 70, 70]);
    case 'cooked_mutton': return meat([150, 90, 50], true);
    case 'rotten_flesh': return meat([120, 110, 60]);
    case 'mushroom_stew': case 'shelf_mushroom_stew': return px16(set => { for (let y = 7; y < 13; y++) for (let x = 2; x < 14; x++) if (Math.abs(x - 7.5) < 6 - (y - 7) * 0.6) set(x, y, [120, 80, 40]); for (let x = 3; x < 13; x++) set(x, 7, name === 'mushroom_stew' ? [190, 140, 100] : [210, 150, 80]); });
    case 'bucket': case 'water_bucket': case 'lava_bucket': return px16(set => { for (let y = 4; y < 14; y++) for (let x = 3; x < 13; x++) { const w = 5 - (y - 4) * 0.25; if (Math.abs(x - 7.5) < w) set(x, y, Math.abs(x - 7.5) > w - 1 || y === 13 ? [150, 150, 150] : [210, 210, 210]); } if (name !== 'bucket') for (let x = 4; x < 12; x++) { set(x, 5, name === 'water_bucket' ? [50, 90, 220] : [240, 120, 20]); set(x, 6, name === 'water_bucket' ? [70, 110, 230] : [250, 170, 40]); } });
    case 'flint_and_steel': return px16(set => { for (let i = 0; i < 6; i++) { set(3 + i, 12 - i, [200, 200, 200]); set(4 + i, 12 - i, [150, 150, 150]); } for (let y = 3; y < 8; y++) for (let x = 9; x < 13; x++) set(x, y, [60, 60, 64]); });
    case 'shears': return px16(set => { for (let i = 0; i < 7; i++) { set(4 + i, 11 - i, [210, 210, 210]); set(5 + i, 12 - i + 0, [170, 170, 170]); } for (let y = 10; y < 14; y++) { set(2, y, [140, 40, 40]); set(5, y + 0, [140, 40, 40]); } });
    case 'bow': return px16(set => { for (let i = 0; i < 12; i++) { const t = i / 11, x = 3 + Math.round(10 * t), y = 13 - Math.round(10 * t); set(x - Math.round(Math.sin(t * Math.PI) * 3), y - Math.round(Math.sin(t * Math.PI) * 3), [120, 86, 44]); set(x, y, [230, 230, 230]); } });
    case 'arrow': return px16(set => { for (let i = 0; i < 10; i++) set(3 + i, 12 - i, [120, 86, 44]); set(13, 2, [100, 100, 100]); set(12, 2, [100, 100, 100]); set(13, 3, [100, 100, 100]); set(2, 12, [240, 240, 240]); set(3, 13, [240, 240, 240]); set(2, 13, [240, 240, 240]); });
    case 'string': return px16(set => { for (let i = 0; i < 12; i++) set(2 + i, 8 + Math.round(Math.sin(i * 0.9) * 2), [235, 235, 235]); });
    case 'feather': return px16(set => { for (let i = 0; i < 11; i++) { set(3 + i, 13 - i, [200, 200, 200]); set(4 + i, 13 - i, [250, 250, 250]); if (i > 2) set(4 + i, 12 - i, [240, 240, 240]); } });
    case 'leather': return px16(set => { for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) if (!((x === 3 || x === 12) && (y === 3 || y === 12))) set(x, y, (x + y) % 4 ? [150, 90, 50] : [130, 76, 40]); });
    case 'paper': return px16(set => { for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) set(x, y, (y % 3 === 0 && x > 4 && x < 11) ? [200, 200, 190] : [245, 245, 235]); });
    case 'book': return px16(set => { for (let y = 2; y < 14; y++) for (let x = 3; x < 13; x++) set(x, y, x > 10 ? [240, 240, 230] : [130, 60, 40]); for (let x = 5; x < 9; x++) set(x, 5, [220, 190, 80]); });
    case 'bone': return px16(set => { for (let i = 0; i < 9; i++) { set(4 + i, 11 - i, [240, 238, 220]); set(4 + i, 12 - i, [210, 206, 190]); } [[3, 11], [3, 12], [4, 13], [12, 2], [13, 3], [13, 2]].forEach(([x, y]) => set(x, y, [240, 238, 220])); });
    case 'wheat': return px16(set => { for (const x of [5, 8, 11]) { for (let y = 6; y < 15; y++) set(x - (y > 11 ? 0 : 0), y, [170, 150, 60]); for (let y = 2; y < 7; y++) { set(x, y, [220, 190, 80]); set(x + (y % 2 ? 1 : -1), y, [200, 170, 60]); } } });
    case 'wheat_seeds': return px16(set => { [[5, 6], [8, 5], [10, 8], [6, 10], [9, 11], [12, 11], [4, 12]].forEach(([x, y]) => { set(x, y, [80, 170, 50]); set(x + 1, y, [60, 130, 40]); }); });
  }
  if (name.endsWith('_spawn_egg')) {
    const cols = { pig: [[240, 160, 160], [200, 110, 110]], cow: [[70, 50, 40], [220, 220, 220]], sheep: [[230, 230, 230], [240, 190, 190]], chicken: [[230, 230, 230], [220, 40, 40]], fox: [[220, 130, 60], [240, 230, 220]], zombie: [[40, 160, 160], [90, 140, 80]], skeleton: [[200, 200, 200], [80, 80, 80]], creeper: [[90, 176, 80], [20, 20, 20]], spider: [[52, 44, 40], [200, 20, 20]], sulfur_cube: [[230, 210, 80], [170, 40, 36]], creaking: [[96, 84, 74], [255, 150, 40]] };
    const c = cols[name.replace('_spawn_egg', '')] || [[200, 200, 200], [100, 100, 100]];
    return egg(c[0], c[1]);
  }
  return px16(set => blob(set, 8, 8, 4, [200, 100, 200]));
}

function iconCanvas(name) {
  if (ICON_CANVAS.has(name)) return ICON_CANVAS.get(name);
  const cv = document.createElement('canvas'); cv.width = IS; cv.height = IS;
  const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
  const it = ITEMS[name];
  // 原版素材包里有同名物品图标（textures/item/<名字>.png）时优先用它
  const vi = 'vi_' + name;
  const pk = PACK_READY && ((PACK_IMG[vi] && vi) || (it && it.icon) || ICON_MAP[name]);
  if (pk && PACK_IMG[pk]) {
    const fr = packFrame(pk, 0), c16 = document.createElement('canvas'); c16.width = c16.height = 16;
    c16.getContext('2d').putImageData(new ImageData(fr, 16, 16), 0, 0);
    ctx.drawImage(c16, 0, 0, IS, IS);
  } else if (it && it.block !== undefined) {
    const def = BLOCKS[it.block];
    if (def.shape === 'cross' || def.shape === 'torch') {
      const tint = def.tint ? [0.57, 0.74, 0.35] : null;
      ctx.drawImage(tileCanvas(texOf(def, 0, 7), tint), 0, 0, IS, IS);
    } else if (def.shape === 'stairs') drawStairsIcon(ctx, def);
    else drawIsoBlock(ctx, def);
  } else {
    ctx.drawImage(itemIcon(name), 0, 0, IS, IS);
  }
  ICON_CANVAS.set(name, cv);
  return cv;
}
function iconURL(name) {
  if (!ICON_URL.has(name)) ICON_URL.set(name, iconCanvas(name).toDataURL());
  return ICON_URL.get(name);
}
function iconTexture(name) {
  if (ICON_TEX.has(name)) return ICON_TEX.get(name);
  const t = new THREE.CanvasTexture(iconCanvas(name)); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  ICON_TEX.set(name, t);
  return t;
}

// HUD 小图标（心、鸡腿、气泡）
function hudIcons() {
  const mk = (fn) => { const cv = px16(fn); const big = document.createElement('canvas'); big.width = 18; big.height = 18; const c = big.getContext('2d'); c.imageSmoothingEnabled = false; c.drawImage(cv, 0, 0, 9, 9, 0, 0, 18, 18); return big.toDataURL(); };
  const heartShape = ['.XX.XX..', 'XXXXXXX.', 'XXXXXXX.', '.XXXXX..', '..XXX...', '...X....'];
  const heart = (fill, half) => mk(set => {
    heartShape.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === 'X') { const edge = y === 0 || x === 0 || x === 6 || heartShape[y + 1] === undefined || heartShape[y + 1][x] !== 'X' || row[x - 1] !== 'X' || row[x + 1] !== 'X'; const filled = fill && (!half || x < 4); set(x + 1, y + 1, edge ? [20, 20, 20] : filled ? (y === 1 && x === 2 ? [255, 200, 200] : [220, 20, 20]) : [60, 20, 20]); } }));
  });
  const drumShape = ['....XX..', '...XXXX.', '..XXXXX.', '.XXXXX..', 'X.XX....', '.X......', 'X.......'];
  const drum = (fill, half) => mk(set => {
    drumShape.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === 'X') { const bone = y >= 4; const filled = fill && (!half || x > 3); set(x + 1, y + 1, bone ? [230, 220, 200] : filled ? [190, 110, 50] : [60, 40, 30]); } }));
  });
  const bubble = mk(set => { for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) { const d = Math.hypot(x - 3, y - 3); if (d < 3.5) set(x + 1, y + 1, d > 2.5 ? [40, 90, 200] : (x === 2 && y === 2 ? [255, 255, 255] : [140, 190, 255])); } });
  const res = { heartFull: heart(true), heartHalf: heart(true, true), heartEmpty: heart(false), drumFull: drum(true), drumHalf: drum(true, true), drumEmpty: drum(false), bubble };
  // 盔甲图标（程序生成后备）
  const shirt = (fill, half) => mk(set => { const sh = ['XX.XX', 'XXXXX', '.XXX.', '.XXX.', '.XXX.']; sh.forEach((r, y) => [...r].forEach((c, x) => { if (c === 'X') set(x + 2, y + 2, fill && (!half || x < 2) ? [220, 220, 230] : [60, 60, 70]); })); });
  Object.assign(res, { armorFull: shirt(true), armorHalf: shirt(true, true), armorEmpty: shirt(false) });
  // 有素材包时改用素材包 HUD 图标
  const packHud = (full, bg, half) => {
    if (!PACK_READY || !PACK_IMG[full] || !PACK_IMG[bg]) return null;
    const c = document.createElement('canvas'); c.width = c.height = 18; const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    const toC = (n) => { const fr = packFrame(n, 0), t = document.createElement('canvas'); t.width = t.height = 16; t.getContext('2d').putImageData(new ImageData(fr, 16, 16), 0, 0); return t; };
    x.drawImage(toC(bg), 0, 0, 18, 18);
    if (half === 1) x.drawImage(toC(full), 0, 0, 16, 16, 0, 0, 18, 18);
    else if (half === 0.5) x.drawImage(toC(full), 0, 0, 8, 16, 0, 0, 9, 18);
    return c.toDataURL();
  };
  const sets = [['heart', 'hudbars_icon_health', 'hudbars_bgicon_health'], ['drum', 'hbhunger_icon', 'hbhunger_bgicon'], ['armor', 'hbarmor_icon', 'hbarmor_bgicon']];
  for (const [k, f, b] of sets) {
    const full = packHud(f, b, 1);
    if (!full) continue;
    res[k + 'Full'] = full; res[k + 'Half'] = packHud(f, b, 0.5); res[k + 'Empty'] = packHud(f, b, 0);
  }
  if (PACK_READY && PACK_IMG.hudbars_icon_breath) { const fr = packFrame('hudbars_icon_breath', 0), t = document.createElement('canvas'); t.width = t.height = 16; t.getContext('2d').putImageData(new ImageData(fr, 16, 16), 0, 0); const c = document.createElement('canvas'); c.width = c.height = 18; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(t, 0, 0, 18, 18); res.bubble = c.toDataURL(); }
  return res;
}
