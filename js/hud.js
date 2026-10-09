'use strict';
// ---------- HUD：小地图、坐标面板、大地图（M）、帧率、物品栏玩家预览 ----------

const HUD = {
  colors: null,          // 方块 id -> [r,g,b]
  tiles: new Map(),      // "dim:cx,cz" -> {meshes, cave, data(Uint8ClampedArray 16*16*4)}
  mapT: 0,
  big: null,             // 大地图状态 {zoom, ox, oz, drag}
};

function hudBlockColors() {
  const cols = new Array(BLOCKS.length);
  for (const d of BLOCKS) {
    if (!d.tex || d.shape === 'air') { cols[d.id] = null; continue; }
    let idx;
    try { idx = texOf(d, 2, 0); } catch (e) { idx = undefined; }
    const img = idx !== undefined ? TEX_IMG[idx] : null;
    if (!img) { cols[d.id] = [128, 128, 128]; continue; }
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < img.length; i += 4) if (img[i + 3] > 100) { r += img[i]; g += img[i + 1]; b += img[i + 2]; n++; }
    cols[d.id] = n ? [r / n, g / n, b / n] : [128, 128, 128];
  }
  HUD.colors = cols;
}

// 地图上视为“透明”的方块：空气、十字形小植物、火把等
function hudSkip(id) {
  if (!id) return true;
  const d = BLOCKS[id];
  return d.shape === 'torch' || (d.shape === 'cross' && !/flower|poppy|dandelion|cornflower|allium|tulip|daisy|sapling|mushroom/.test(d.name) && d.replaceable) || d.name === 'nether_portal' || d.name === 'fire';
}

// 计算一个区块的 16x16 颜色块；cave=true 时从 topY 往下找第一个“空气下方的实体”
function hudChunkTile(w, c, cave, topY) {
  const data = new Uint8ClampedArray(16 * 16 * 4), hs = new Int16Array(16 * 16);
  const cols = HUD.colors;
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    let y = cave ? Math.min(CH - 1, topY) : CH - 1, id = 0;
    if (cave) {
      // 先向下穿过实体（头顶的岩层），再找到空气，再找到地面
      while (y > 0 && c.blocks[idx3(x, y, z)] && !hudSkip(c.blocks[idx3(x, y, z)])) y--;
      while (y > 0 && hudSkip(c.blocks[idx3(x, y, z)])) y--;
    } else {
      while (y > 0 && hudSkip(c.blocks[idx3(x, y, z)])) y--;
    }
    id = c.blocks[idx3(x, y, z)];
    let col = cols[id] || [0, 0, 0];
    const d = BLOCKS[id];
    const bio = BIOMES[c.biome[z * 16 + x]];
    if (d && d.tint && bio) { const t = d.tint === 'grass' ? bio.grass : bio.foliage; col = [col[0] * t[0] / 160, col[1] * t[1] / 160, col[2] * t[2] / 160]; }
    if (id === B.water) {
      // 水深越深越暗
      let dep = 0; while (y - dep > 0 && c.blocks[idx3(x, y - dep, z)] === B.water && dep < 12) dep++;
      const f = 1 - Math.min(0.5, dep * 0.04); col = [50 * f, 90 * f, 220 * f];
    }
    hs[z * 16 + x] = y;
    const i = (z * 16 + x) * 4;
    data[i] = col[0]; data[i + 1] = col[1]; data[i + 2] = col[2]; data[i + 3] = 255;
  }
  // 高度阴影：比北侧高则亮、低则暗（与原版地图类似）
  for (let z = 15; z >= 1; z--) for (let x = 0; x < 16; x++) {
    const dh = hs[z * 16 + x] - hs[(z - 1) * 16 + x], f = dh > 0 ? 1.12 : dh < 0 ? 0.82 : 1;
    const i = (z * 16 + x) * 4; data[i] *= f; data[i + 1] *= f; data[i + 2] *= f;
  }
  return data;
}

function hudGetTile(w, c, cave, topY) {
  const k = w.dim + ':' + c.cx + ',' + c.cz;
  let t = HUD.tiles.get(k);
  const band = cave ? Math.floor(topY / 8) : -1;
  if (!t || t.meshes !== c.meshes || t.band !== band) {
    t = { meshes: c.meshes, band, data: hudChunkTile(w, c, cave, topY) };
    HUD.tiles.set(k, t);
    if (HUD.tiles.size > 4000) HUD.tiles.delete(HUD.tiles.keys().next().value);
  }
  return t.data;
}

// 把以 (cx0,cz0) 为左上角、R×R 方块范围画进 ImageData
function hudPaint(game, img, x0, z0, size, scale) {
  const w = game.world, p = game.player, d = img.data;
  const cave = w.dim !== 'overworld' || w.skyLight(Math.floor(p.pos.x), Math.floor(p.pos.y + 1.6), Math.floor(p.pos.z)) < 4;
  const topY = Math.floor(p.pos.y) + 2;
  d.fill(0);
  const blocks = size / scale;
  for (let cz = Math.floor(z0 / 16); cz <= Math.floor((z0 + blocks) / 16); cz++) for (let cx = Math.floor(x0 / 16); cx <= Math.floor((x0 + blocks) / 16); cx++) {
    const c = w.getChunk(cx, cz); if (!c || !c.lit) continue;
    const t = hudGetTile(w, c, cave, topY);
    for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) {
      const bx = cx * 16 + lx - x0, bz = cz * 16 + lz - z0;
      if (bx < 0 || bz < 0 || bx >= blocks || bz >= blocks) continue;
      const si = (lz * 16 + lx) * 4;
      for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
        const px = Math.floor(bx * scale) + sx, pz = Math.floor(bz * scale) + sy;
        if (px >= size || pz >= size) continue;
        const di = (pz * size + px) * 4;
        d[di] = t[si]; d[di + 1] = t[si + 1]; d[di + 2] = t[si + 2]; d[di + 3] = 255;
      }
    }
  }
  return cave;
}

const DIR_ZH = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
function hudFacing(yaw) {
  // yaw=0 看向 -Z（北），向右转 yaw 变小
  let a = (-yaw * 180 / Math.PI) % 360; if (a < 0) a += 360;
  return DIR_ZH[Math.round(a / 45) % 8];
}

function hudUpdate(game, dt) {
  const s = game.settings, p = game.player, el = document.getElementById('minimapwrap');
  if (!el) return;
  const show = game.state !== 'title' && p && s.minimap;
  el.style.display = show || s.coords ? '' : 'none';
  document.getElementById('fpsbox').style.display = s.showFps ? '' : 'none';
  if (s.showFps) document.getElementById('fpsbox').textContent = game.fps + ' FPS';
  if (!p || game.state === 'title') return;
  if (!HUD.colors) hudBlockColors();
  // 坐标面板
  const info = document.getElementById('mapinfo');
  info.style.display = s.coords ? '' : 'none';
  if (s.coords) {
    const bio = game.world.biomeAt(p.pos.x, p.pos.z);
    const dimZh = DIM_INFO[game.world.dim] ? DIM_INFO[game.world.dim].zh : '';
    const t = game.time % 24000;
    info.innerHTML = `<div>XYZ: ${Math.floor(p.pos.x)} / ${dispY(game.world, Math.floor(p.pos.y))} / ${Math.floor(p.pos.z)}</div><div>朝向：${hudFacing(p.yaw)}　${esc(dimZh)}</div><div>${esc(BIOMES[bio] ? BIOMES[bio].zh : bio || '')}</div><div>第 ${Math.floor(game.time / 24000) + 1} 天 ${fmtTime(t)}</div>`;
  }
  const cv = document.getElementById('minimap');
  cv.style.display = s.minimap ? '' : 'none';
  if (!s.minimap) return;
  HUD.mapT -= dt;
  const size = { small: 112, medium: 144, large: 192 }[s.minimapSize] || 144;
  if (cv.width !== size) { cv.width = cv.height = size; cv.style.width = cv.style.height = size + 'px'; HUD.mapT = 0; }
  if (HUD.mapT > 0) return;
  HUD.mapT = 0.2;
  const scale = s.minimapZoom || 1;
  const ctx = cv.getContext('2d');
  if (!HUD.off || HUD.off.width !== size) { HUD.off = document.createElement('canvas'); HUD.off.width = HUD.off.height = size; HUD.offImg = HUD.off.getContext('2d').createImageData(size, size); }
  const half = size / scale / 2;
  const x0 = Math.floor(p.pos.x - half), z0 = Math.floor(p.pos.z - half);
  const cave = hudPaint(game, HUD.offImg, x0, z0, size, scale);
  HUD.off.getContext('2d').putImageData(HUD.offImg, 0, 0);
  ctx.save();
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, size, size);
  ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2); ctx.clip();
  ctx.translate(size / 2, size / 2);
  const rot = s.minimapRotate ? p.yaw : 0;
  ctx.rotate(rot);
  // 偏移：玩家在方块内的小数位置
  const fx = (p.pos.x - x0 - half) * scale, fz = (p.pos.z - z0 - half) * scale;
  ctx.drawImage(HUD.off, -size / 2 - fx, -size / 2 - fz);
  // 生物点
  if (s.minimapMobs) {
    for (const m of game.mobs) {
      if (m.dead) continue;
      const mx = (m.pos.x - p.pos.x) * scale, mz = (m.pos.z - p.pos.z) * scale;
      if (Math.abs(mx) > size / 2 || Math.abs(mz) > size / 2) continue;
      ctx.fillStyle = m.def.hostile ? '#ff3030' : m.type === 'villager' ? '#40ff60' : '#ffffff';
      ctx.fillRect(mx - 1.5, mz - 1.5, 3, 3);
    }
  }
  ctx.restore();
  // 玩家箭头（固定朝上或按朝向）
  ctx.save(); ctx.translate(size / 2, size / 2); ctx.rotate(s.minimapRotate ? 0 : -p.yaw);
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  // 外圈与“北”标记
  ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(200,200,200,.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2 - 3.5, 0, Math.PI * 2); ctx.stroke();
  const na = -Math.PI / 2 + rot, nr = size / 2 - 9;
  ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000'; ctx.fillRect(size / 2 + Math.cos(na) * nr - 7, size / 2 + Math.sin(na) * nr - 7, 14, 14);
  ctx.fillStyle = '#ff5050'; ctx.fillText('北', size / 2 + Math.cos(na) * nr, size / 2 + Math.sin(na) * nr + 1);
  if (cave) { ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(size / 2 - 22, size - 18, 44, 14); ctx.fillStyle = '#ccc'; ctx.font = '11px sans-serif'; ctx.fillText('洞穴视图', size / 2, size - 11); }
}

// ---------------- 大地图（M） ----------------
function openBigMap(game) {
  if (!HUD.colors) hudBlockColors();
  HUD.big = { zoom: 2, ox: game.player.pos.x, oz: game.player.pos.z, drag: null };
  game.state = 'map';
  document.exitPointerLock && document.exitPointerLock();
  const el = document.getElementById('bigmap');
  el.style.display = 'flex';
  const cv = document.getElementById('bigmapcv');
  cv.onwheel = e => { e.preventDefault(); HUD.big.zoom = clamp(HUD.big.zoom * (e.deltaY > 0 ? 0.8 : 1.25), 0.5, 8); drawBigMap(game); };
  cv.onmousedown = e => { HUD.big.drag = [e.clientX, e.clientY, HUD.big.ox, HUD.big.oz]; };
  window.addEventListener('mouseup', () => { if (HUD.big) HUD.big.drag = null; });
  cv.onmousemove = e => {
    const b = HUD.big; if (!b) return;
    if (b.drag) { b.ox = b.drag[2] - (e.clientX - b.drag[0]) / b.zoom; b.oz = b.drag[3] - (e.clientY - b.drag[1]) / b.zoom; drawBigMap(game); }
    const r = cv.getBoundingClientRect();
    const wx = Math.floor(b.ox + (e.clientX - r.left - cv.width / 2) / b.zoom), wz = Math.floor(b.oz + (e.clientY - r.top - cv.height / 2) / b.zoom);
    document.getElementById('bigmapinfo').textContent = `光标：X ${wx}  Z ${wz}　　滚轮缩放，拖动平移，按 M 或 ESC 关闭`;
  };
  document.getElementById('bigmapcenter').onclick = () => { HUD.big.ox = game.player.pos.x; HUD.big.oz = game.player.pos.z; drawBigMap(game); };
  drawBigMap(game);
}
function closeBigMap(game) {
  document.getElementById('bigmap').style.display = 'none';
  HUD.big = null;
  game.state = 'playing'; game.lockPointer();
}
function drawBigMap(game) {
  const b = HUD.big; if (!b) return;
  const cv = document.getElementById('bigmapcv');
  const W = Math.min(innerWidth - 80, 1100), H = Math.min(innerHeight - 140, 760);
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#1b1b1b'; ctx.fillRect(0, 0, W, H);
  const w = game.world, p = game.player;
  const cave = w.dim !== 'overworld';
  const topY = Math.floor(p.pos.y) + 2;
  const bw = W / b.zoom, bh = H / b.zoom, x0 = b.ox - bw / 2, z0 = b.oz - bh / 2;
  const tmp = HUD.bigTmp || (HUD.bigTmp = document.createElement('canvas'));
  tmp.width = tmp.height = 16;
  const tctx = tmp.getContext('2d'), timg = tctx.createImageData(16, 16);
  ctx.imageSmoothingEnabled = false;
  for (const c of w.chunks.values()) {
    if (!c.lit) continue;
    const sx = (c.cx * 16 - x0) * b.zoom, sz = (c.cz * 16 - z0) * b.zoom;
    if (sx > W || sz > H || sx + 16 * b.zoom < 0 || sz + 16 * b.zoom < 0) continue;
    timg.data.set(hudGetTile(w, c, cave, topY));
    tctx.putImageData(timg, 0, 0);
    ctx.drawImage(tmp, sx, sz, 16 * b.zoom + 0.5, 16 * b.zoom + 0.5);
  }
  // 生物与玩家
  for (const m of game.mobs) {
    if (m.dead) continue;
    ctx.fillStyle = m.def.hostile ? '#ff3030' : m.type === 'villager' ? '#40ff60' : '#fff';
    ctx.fillRect((m.pos.x - x0) * b.zoom - 2, (m.pos.z - z0) * b.zoom - 2, 4, 4);
  }
  ctx.save(); ctx.translate((p.pos.x - x0) * b.zoom, (p.pos.z - z0) * b.zoom); ctx.rotate(-p.yaw);
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(7, 8); ctx.lineTo(0, 4); ctx.lineTo(-7, 8); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  // 出生点
  if (p.spawn && (!p.spawnDim || p.spawnDim === w.dim)) { ctx.fillStyle = '#ffd030'; ctx.fillRect((p.spawn[0] - x0) * b.zoom - 3, (p.spawn[2] - z0) * b.zoom - 3, 6, 6); }
  ctx.fillStyle = '#ddd'; ctx.font = '12px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText(`${DIM_INFO[w.dim] ? DIM_INFO[w.dim].zh : ''}　缩放 ${b.zoom.toFixed(1)}x　（仅显示已加载区域）`, 10, 18);
}

// ---------------- 物品栏里的玩家预览 ----------------
const PVIEW = { renderer: null, scene: null, cam: null, model: null };
function updatePlayerPreview(game, mx, my) {
  const box = document.getElementById('pview');
  if (!box) return;
  if (!PVIEW.renderer) {
    PVIEW.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    PVIEW.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    PVIEW.scene = new THREE.Scene();
    PVIEW.cam = new THREE.PerspectiveCamera(30, 100 / 160, 0.1, 20);
    PVIEW.cam.position.set(0, 1.05, 4.2);
    PVIEW.cam.lookAt(0, 0.95, 0);
  }
  if (!PVIEW.model && typeof buildMob === 'function') {
    PVIEW.model = buildMob('steve');
    PVIEW.scene.add(PVIEW.model.root);
  }
  const cv = PVIEW.renderer.domElement;
  if (cv.parentNode !== box) { box.innerHTML = ''; box.appendChild(cv); PVIEW.renderer.setSize(box.clientWidth || 100, box.clientHeight || 160); }
  // 像原版一样跟随鼠标转头/身体
  const r = box.getBoundingClientRect();
  const dx = (mx - (r.left + r.width / 2)) / 200, dy = (my - (r.top + r.height * 0.25)) / 200;
  const m = PVIEW.model;
  if (m) {
    m.root.rotation.y = clamp(dx, -1, 1) * 0.6;
    if (m.P.head) { m.P.head.rotation.y = clamp(dx, -1, 1) * 0.5; m.P.head.rotation.x = clamp(dy, -1, 1) * 0.5; }
    for (const mat of m.mats) mat.color.setRGB(1, 1, 1);
  }
  PVIEW.renderer.render(PVIEW.scene, PVIEW.cam);
}

function drawBigMapThrottled(game, dt) {
  HUD.bigT = (HUD.bigT || 0) - dt;
  if (HUD.bigT > 0) return;
  HUD.bigT = 0.25;
  drawBigMap(game);
}
