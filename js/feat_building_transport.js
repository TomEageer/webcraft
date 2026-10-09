'use strict';
// ---------- 建筑模块：交通（铁轨、动力铁轨、矿车、船） ----------

// 铁轨形状 meta（低 4 位）：0 南北 1 东西 2 东上坡 3 西上坡 4 北上坡 5 南上坡 6 南东 7 南西 8 北西 9 北东；动力铁轨 bit4 = 充能
const RAIL_ENDS = [
  [[0, -1, 0], [0, 1, 0]], [[1, 0, 0], [-1, 0, 0]],
  [[1, 0, 1], [-1, 0, 0]], [[-1, 0, 1], [1, 0, 0]], [[0, -1, 1], [0, 1, 0]], [[0, 1, 1], [0, -1, 0]],
  [[0, 1, 0], [1, 0, 0]], [[0, 1, 0], [-1, 0, 0]], [[0, -1, 0], [-1, 0, 0]], [[0, -1, 0], [1, 0, 0]],
];
const RAIL_Y = 1 / 16;
const isRail = id => !!(BLOCKS[id] && BLOCKS[id].rail);

function railTexName(id, sh, powered) {
  if (id === B.powered_rail) return (sh === 1 || sh === 2 || sh === 3 ? 'bld_prail_ew' : 'bld_prail_ns') + (powered ? '_on' : '');
  if (sh >= 6) return 'bld_rail_c' + sh;
  return sh === 1 || sh === 2 || sh === 3 ? 'bld_rail_ew' : 'bld_rail_ns';
}
function railBoxes(meta, nb, id) {
  const sh = meta & 15, t = TEX[railTexName(id, sh, meta & 16)];
  const ext = { tex: f => f === 2 ? t : -1 };
  if (sh < 2 || sh > 5) return [[0, 0, 0, 1, 1 / 16, 1, ext]];
  // 上坡：8 级台阶近似斜面
  const out = [];
  for (let i = 0; i < 8; i++) {
    const a = i / 8, b = (i + 1) / 8, y1 = (sh === 2 || sh === 5 ? i + 1 : 8 - i) / 8, y0 = Math.max(0, y1 - 1 / 8);
    if (sh === 2 || sh === 3) out.push([a, y0, 0, b, y1, 1, ext]);
    else out.push([0, y0, a, 1, y1, b, ext]);
  }
  return out;
}

// 指定端点方向上的相邻铁轨位置（含上下一格）
function railAt(w, x, y, z, e) {
  const nx = x + e[0], nz = z + e[1];
  if (e[2]) return isRail(w.getBlock(nx, y + 1, nz)) ? [nx, y + 1, nz] : null;
  if (isRail(w.getBlock(nx, y, nz))) return [nx, y, nz];
  if (isRail(w.getBlock(nx, y - 1, nz))) return [nx, y - 1, nz];
  return null;
}
// 相邻铁轨 n 的某个端点是否指向 (x,y,z)（含高度：上坡端指向高一格，平端指向同层或低一格的上坡）
function railPointsTo(w, n, x, y, z) {
  const sh = w.getMeta(n[0], n[1], n[2]) & 15;
  return (RAIL_ENDS[sh] || []).some(e => n[0] + e[0] === x && n[2] + e[1] === z && (e[2] ? n[1] + 1 === y : (n[1] === y || n[1] - 1 === y)));
}
function railFull(w, x, y, z) {
  const sh = w.getMeta(x, y, z) & 15;
  return RAIL_ENDS[sh].every(e => { const n = railAt(w, x, y, z, e); return n && railPointsTo(w, n, x, y, z); });
}
function railShape(w, x, y, z, id, deep) {
  const meta = w.getMeta(x, y, z), cur = meta & 15;
  if (railFull(w, x, y, z)) return;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const back = [], free = [];
  for (const d of dirs) {
    const n = railAt(w, x, y, z, [d[0], d[1], 0]) || railAt(w, x, y, z, [d[0], d[1], 1]);
    if (!n) continue;
    if (railPointsTo(w, n, x, y, z)) back.push(d); else if (!railFull(w, n[0], n[1], n[2])) free.push(d);
  }
  const cand = back.concat(free);
  const canCurve = id === B.rail;
  let sh = cur;
  const has = (dx, dz) => cand.some(d => d[0] === dx && d[1] === dz);
  const axisOf = d => d[0] ? 1 : 0;
  if (cand.length >= 2) {
    const a = cand[0];
    const opp = cand.find(d => d[0] === -a[0] && d[1] === -a[1]);
    if (opp) sh = axisOf(a);
    else if (canCurve) {
      const b = cand.find(d => d[0] !== a[0] || d[1] !== a[1]);
      const s = (a[1] === 1 || b[1] === 1), e = (a[0] === 1 || b[0] === 1);
      sh = s ? (e ? 6 : 7) : (e ? 9 : 8);
    } else sh = axisOf(a);
  } else if (cand.length === 1) sh = axisOf(cand[0]);
  // 上坡判断
  if (sh <= 1 || (sh >= 2 && sh <= 5)) {
    const ax = sh === 1 || sh === 2 || sh === 3 ? 1 : 0;
    if (ax) { if (isRail(w.getBlock(x + 1, y + 1, z))) sh = 2; else if (isRail(w.getBlock(x - 1, y + 1, z))) sh = 3; else sh = 1; }
    else { if (isRail(w.getBlock(x, y + 1, z - 1))) sh = 4; else if (isRail(w.getBlock(x, y + 1, z + 1))) sh = 5; else sh = 0; }
  }
  if (sh !== cur) w.setMeta(x, y, z, (meta & 16) | sh);
  if (deep) return;
  for (const e of RAIL_ENDS[sh]) {
    const n = railAt(w, x, y, z, e);
    if (n && !railPointsTo(w, n, x, y, z)) railShape(w, n[0], n[1], n[2], w.getBlock(n[0], n[1], n[2]), true);
  }
}
// 动力铁轨是否充能：没有红石模块时视为始终充能；否则自身或沿线 8 格内有被充能的动力铁轨
function railPowered(w, x, y, z) {
  if (typeof redstonePowered !== 'function') return true;
  if (redstonePowered(w, x, y, z)) return true;
  const sh = w.getMeta(x, y, z) & 15;
  for (const e of RAIL_ENDS[sh] || []) {
    let cx = x, cy = y, cz = z, ce = e;
    for (let i = 0; i < 8; i++) {
      const n = railAt(w, cx, cy, cz, ce);
      if (!n || w.getBlock(n[0], n[1], n[2]) !== B.powered_rail) break;
      if (redstonePowered(w, n[0], n[1], n[2])) return true;
      cx = n[0]; cy = n[1]; cz = n[2];
    }
  }
  return false;
}
function railUpdatePower(w, x, y, z, seen) {
  if (w.getBlock(x, y, z) !== B.powered_rail) return;
  const k = x + ',' + y + ',' + z; if (seen.has(k) || seen.size > 20) return; seen.add(k);
  const m = w.getMeta(x, y, z), p = railPowered(w, x, y, z) ? 16 : 0;
  if ((m & 16) !== p) {
    w.setMeta(x, y, z, (m & 15) | p);
    for (const e of RAIL_ENDS[m & 15]) { const n = railAt(w, x, y, z, e); if (n) railUpdatePower(w, n[0], n[1], n[2], seen); }
  }
}

// ---------------- 方块 ----------------
function bldTrBlocks() {
  const names = ['bld_rail_ns', 'bld_rail_ew', 'bld_rail_c6', 'bld_rail_c7', 'bld_rail_c8', 'bld_rail_c9'];
  defBlock('rail', '铁轨', { shape: 'boxes', tex: 'bld_rail_ns', texNames: names, solid: false, opaque: false, render: 'cutout', hard: 0.7, tool: 'pickaxe', rail: true, sound: 'metal', boxes: railBoxes });
  defBlock('powered_rail', '动力铁轨', {
    shape: 'boxes', tex: 'bld_prail_ns', texNames: ['bld_prail_ew', 'bld_prail_ns_on', 'bld_prail_ew_on'], solid: false, opaque: false, render: 'cutout', hard: 0.7, tool: 'pickaxe', rail: true, sound: 'metal', boxes: railBoxes,
  });
  ITEMS.rail.icon = 'default_rail'; ITEMS.powered_rail.icon = 'mcl_minecarts_rail_golden_powered';
}
BLD.BOATS = { oak: '橡木船', birch: '白桦木船', spruce: '云杉木船', cherry: '樱花木船' };
function bldTrItems() {
  for (const w in BLD.BOATS) defItem(w + '_boat', BLD.BOATS[w], { stack: 1, icon: 'mcl_boats_' + w + '_boat', boatWood: w });
  defItem('minecart', '矿车', { stack: 1, icon: 'mcl_minecarts_minecart_normal' });
}
function bldTrRecipes() {
  for (const w in BLD.BOATS) shaped(['P P', 'PPP'], { P: w + '_planks' }, w + '_boat', 1);
  shaped(['I I', 'ISI', 'I I'], { I: 'iron_ingot', S: 'stick' }, 'rail', 16);
  shaped(['G G', 'GSG', 'GRG'], { G: 'gold_ingot', S: 'stick', R: 'redstone' }, 'powered_rail', 6);
  shaped(['I I', 'III'], { I: 'iron_ingot' }, 'minecart', 1);
}
function bldTrTextures() {
  const rot = (src, k) => p => {
    const fr = PACK_READY ? packFrame(src, 0) : null;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      // 顺时针旋转 k 次：new(X,Y) = old(Y, 15-X)
      let sx = x, sy = y;
      for (let i = 0; i < k; i++) { const t = sx; sx = sy; sy = 15 - t; }
      if (fr) { const j = (sy * 16 + sx) * 4; p.set(x, y, [fr[j], fr[j + 1], fr[j + 2]], fr[j + 3]); }
      else { const onRail = (k % 2 ? sy : sx) === 3 || (k % 2 ? sy : sx) === 12, tie = (k % 2 ? sx : sy) % 4 === 1; p.set(x, y, onRail ? [110, 110, 110] : [120, 86, 50], onRail || tie ? 255 : 0); }
    }
  };
  defTex('bld_rail_ns', rot('default_rail', 0)); defTex('bld_rail_ew', rot('default_rail', 1));
  for (let k = 0; k < 4; k++) defTex('bld_rail_c' + (6 + k), rot('default_rail_curved', k));
  defTex('bld_prail_ns', rot('mcl_minecarts_rail_golden', 0)); defTex('bld_prail_ew', rot('mcl_minecarts_rail_golden', 1));
  defTex('bld_prail_ns_on', rot('mcl_minecarts_rail_golden_powered', 0)); defTex('bld_prail_ew_on', rot('mcl_minecarts_rail_golden_powered', 1));
}
function bldTrBlockUpdate(w, x, y, z, id) {
  if (!BLOCKS[id].rail) return false;
  const below = BLOCKS[w.getBlock(x, y - 1, z)];
  if (!below.solid || below.shape === 'boxes' && !below.fence) { w.breakBlock(x, y, z, true); return true; }
  railShape(w, x, y, z, id, false);
  if (id === B.powered_rail) railUpdatePower(w, x, y, z, new Set());
  return true;
}

// ---------------- 载具模型 ----------------
function bldTileTexture(name) {
  const idx = TEX[name]; if (idx === undefined) return null;
  const t = new THREE.CanvasTexture(tileCanvas(idx)); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  return t;
}
function bldBoxMesh(mats, tex, w, h, d, x, y, z, color) {
  const m = new THREE.MeshBasicMaterial({ map: tex, color: color || 0xffffff });
  mats.push(m);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  return mesh;
}
MODELS.boat = () => {
  const root = new THREE.Group(), mats = [], tex = bldTileTexture('oak_planks');
  const body = new THREE.Group(); root.add(body);
  body.add(bldBoxMesh(mats, tex, 1.25, 0.12, 1.75, 0, 0.06, 0));
  body.add(bldBoxMesh(mats, tex, 0.12, 0.38, 1.75, -0.565, 0.31, 0));
  body.add(bldBoxMesh(mats, tex, 0.12, 0.38, 1.75, 0.565, 0.31, 0));
  body.add(bldBoxMesh(mats, tex, 1.01, 0.38, 0.12, 0, 0.31, 0.815));
  body.add(bldBoxMesh(mats, tex, 1.01, 0.38, 0.12, 0, 0.31, -0.815));
  // 桨
  const oar = new THREE.Group();
  for (const s of [-1, 1]) { const o = bldBoxMesh(mats, tex, 0.08, 0.08, 1.0, s * 0.72, 0.42, 0.05); o.rotation.y = s * 0.25; o.rotation.z = s * -0.5; oar.add(o); }
  root.add(oar);
  return { root, mats, P: { body, oar } };
};
MODELS.minecart = () => {
  const root = new THREE.Group(), mats = [], tex = bldTileTexture('iron_block');
  const body = new THREE.Group(); root.add(body);
  const c = 0x8a8a90;
  body.add(bldBoxMesh(mats, tex, 0.9, 0.1, 1.2, 0, 0.17, 0, c));
  body.add(bldBoxMesh(mats, tex, 0.08, 0.5, 1.2, -0.41, 0.42, 0, c));
  body.add(bldBoxMesh(mats, tex, 0.08, 0.5, 1.2, 0.41, 0.42, 0, c));
  body.add(bldBoxMesh(mats, tex, 0.74, 0.5, 0.08, 0, 0.42, 0.56, c));
  body.add(bldBoxMesh(mats, tex, 0.74, 0.5, 0.08, 0, 0.42, -0.56, c));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) body.add(bldBoxMesh(mats, null, 0.06, 0.18, 0.18, sx * 0.46, 0.1, sz * 0.36, 0x303034));
  return { root, mats, P: { body } };
};

// ---------------- 载具 AI ----------------
function bldDismount(game, player) {
  const v = player.riding; if (!v) return;
  player.riding = null; v.rider = null;
  const w = game.world;
  const yaw = v.yaw, sx = Math.cos(yaw), sz = -Math.sin(yaw);
  let pos = null;
  for (const [ox, oz] of [[sx, sz], [-sx, -sz], [Math.sin(yaw), Math.cos(yaw)], [-Math.sin(yaw), -Math.cos(yaw)]]) {
    for (const dy of [0, 1]) {
      const x = v.pos.x + ox * 1.1, z = v.pos.z + oz * 1.1, y = Math.floor(v.pos.y) + dy + (dy === 0 && BLOCKS[w.getBlock(Math.floor(x), Math.floor(v.pos.y), Math.floor(z))].solid ? 1 : 0);
      if (boxFree(w, x, y, z, 0.3, 1.8) && !boxFree(w, x, y - 0.6, z, 0.3, 0.55)) { pos = [x, y, z]; break; }
    }
    if (pos) break;
  }
  if (!pos) pos = [v.pos.x, v.pos.y + v.h + 0.05, v.pos.z];
  player.pos.set(pos[0], pos[1], pos[2]); player.vel.set(0, 0, 0); player.fallDist = 0;
}

function bldBoatAI(m, dt, g) {
  const w = m.world, inp = m.rider ? m.input || {} : {};
  const fx = Math.floor(m.pos.x), fz = Math.floor(m.pos.z);
  const c = Math.floor(m.pos.y + 0.3);
  let floating = false;
  if (w.getBlock(fx, c, fz) === B.water) {
    let t = c; while (t < CH - 1 && w.getBlock(fx, t + 1, fz) === B.water) t++;
    const want = t + 0.9 - 0.32;
    m.vel.y += ((want - m.pos.y) * 25 - m.vel.y * 7) * dt;
    floating = true;
  } else m.vel.y = Math.max(m.vel.y - 32 * dt, -40);
  // 转向与推进
  const turn = -(inp.st || 0) * 2.4 * dt;
  m.yaw += turn;
  if (m.rider) m.rider.yaw += turn;
  const fw = inp.fw || 0, fdx = Math.sin(m.yaw), fdz = Math.cos(m.yaw);
  const below = w.getBlock(fx, Math.floor(m.pos.y - 0.05), fz), ice = BLOCKS[below].slip;
  const acc = fw > 0 ? 6 : fw < 0 ? -2.5 : 0;
  m.vel.x += fdx * acc * dt; m.vel.z += fdz * acc * dt;
  const drag = floating ? 0.4 : ice ? 0.6 : 0.0005;
  m.vel.x *= Math.pow(drag, dt); m.vel.z *= Math.pow(drag, dt);
  m.move(m.vel.x * dt, m.vel.y * dt, m.vel.z * dt);
  m.onGround = m.onGround || floating;
  if (m.model.P.oar) m.model.P.oar.rotation.x = fw ? Math.sin(m.age * 8) * 0.4 : 0;
  // 船在岩浆中烧毁；无骑乘者时缓慢漂动
  return true;
}

function bldFindRail(w, pos, vel) {
  const x = Math.floor(pos.x + vel.x * 0.002), z = Math.floor(pos.z + vel.z * 0.002), y = Math.floor(pos.y + 0.01);
  for (const yy of [y, y - 1]) {
    const id = w.getBlock(x, yy, z);
    if (isRail(id)) {
      const sh = w.getMeta(x, yy, z) & 15;
      if (yy === y - 1 && (sh < 2 || sh > 5) && pos.y - yy > 0.6) continue;
      return { x, y: yy, z, id, sh };
    }
  }
  return null;
}
function bldRailSeg(r) {
  return RAIL_ENDS[r.sh].map(e => new THREE.Vector3(r.x + 0.5 + e[0] * 0.5, r.y + RAIL_Y + (e[2] ? 1 : 0), r.z + 0.5 + e[1] * 0.5));
}
function bldCartAI(m, dt, g) {
  const w = m.world, inp = m.rider ? m.input || {} : {};
  const r = bldFindRail(w, m.pos, m.vel);
  if (!r) { m.physics(dt); m.onRail = false; return true; }
  const [e1, e2] = bldRailSeg(r);
  const seg = e2.clone().sub(e1), len = seg.length(), d = seg.clone().divideScalar(len);
  const mag = m.vel.length(), dot = m.vel.dot(d);
  let s;
  if (mag < 1e-4) s = 0;
  else if (Math.abs(dot) > 0.05 * mag) s = Math.sign(dot) * mag;
  else s = m.pos.distanceTo(e1) < m.pos.distanceTo(e2) ? mag : -mag;
  let t = clamp(m.pos.clone().sub(e1).dot(d), 0, len);
  // 坡道重力、摩擦、骑乘者推动
  s -= 12 * d.y * dt;
  if (m.rider && inp.fw > 0) {
    const look = m.rider.lookDir(), dd = look.x * d.x + look.z * d.z;
    if (Math.abs(dd) > 0.2 && Math.abs(s) < 5) s += Math.sign(dd) * 4 * dt;
  }
  if (r.id === B.powered_rail) {
    if (railPowered(w, r.x, r.y, r.z)) {
      if (Math.abs(s) > 0.05) s += Math.sign(s) * 12 * dt;
      else {
        // 静止时被推离相邻的方块
        const blockAt = e => BLOCKS[w.getBlock(Math.floor(e.x + (e.x - (r.x + 0.5))), r.y, Math.floor(e.z + (e.z - (r.z + 0.5))))].solid;
        if (blockAt(e1)) s = 1.5; else if (blockAt(e2)) s = -1.5;
      }
    } else { s *= Math.pow(0.002, dt); if (Math.abs(s) < 0.1) s = 0; }
  }
  s *= Math.pow(m.rider ? 0.92 : 0.85, dt);
  s = clamp(s, -8, 8);
  let nt = t + s * dt;
  const p = e1.clone().addScaledVector(d, clamp(nt, 0, len));
  if (nt > len || nt < 0) {
    // 越过端点：前方有方块则停下，否则进入下一格
    const out = nt > len ? d.clone() : d.clone().negate();
    const ahead = p.clone().addScaledVector(out, 0.02);
    const nr = bldFindRail(w, ahead, out);
    const solid = BLOCKS[w.getBlock(Math.floor(ahead.x), Math.floor(ahead.y + 0.2), Math.floor(ahead.z))].solid;
    if (!nr && solid) { s = 0; p.addScaledVector(out, -0.01); }
    else p.addScaledVector(out, Math.abs(nt > len ? nt - len : nt) + 0.002);
  }
  m.pos.copy(p);
  m.vel.copy(d).multiplyScalar(s);
  if (Math.abs(d.x) + Math.abs(d.z) > 0.01) m.yaw = Math.atan2(d.x, d.z);
  m.model.P.body.rotation.x = -Math.asin(clamp(d.y, -1, 1)) * (1);
  m.onGround = true; m.onRail = true; m.fallDist = 0;
  return true;
}

function bldTrMobDefs() {
  const vehicle = (zh, hp, w, h, ai, drops) => ({ zh, hp, w, h, speed: 0, vehicle: true, noDespawn: true, ai, drops, xp: 0 });
  MOB_DEFS.boat = vehicle('船', 2, 0.65, 0.55, bldBoatAI, m => m.game.player.mode === 'creative' ? [] : [[(m.wood || 'oak') + '_boat', 1]]);
  MOB_DEFS.minecart = vehicle('矿车', 2, 0.49, 0.7, bldCartAI, m => m.game.player.mode === 'creative' ? [] : [['minecart', 1]]);
  SND_MAP['boat.hurt'] = 'default_dig_choppy'; SND_MAP['boat.death'] = 'default_dig_choppy';
  SND_MAP['minecart.hurt'] = 'default_dig_metal'; SND_MAP['minecart.death'] = 'default_dug_metal';
}
bldTrMobDefs();

function bldSpawnVehicle(game, type, x, y, z, yaw, wood) {
  const m = game.spawnMob(type, x, y, z);
  m.yaw = yaw || 0; m.stepH = 0;
  if (type === 'boat' && wood && wood !== 'oak') {
    m.wood = wood;
    const t = bldTileTexture(wood + '_planks');
    if (t) for (const mt of m.model.mats) mt.map = t;
  } else if (type === 'boat') m.wood = 'oak';
  m.animate(0, 0);
  return m;
}

function bldTrUseItem(game, player, b, held) {
  if (!held) return false;
  const it = ITEMS[held.id], w = game.world;
  if (it && it.boatWood) {
    const hit = raycastBlocks(w, player.eye(), player.lookDir(), 5, true);
    if (!hit) return true;
    let x = hit.x + 0.5, z = hit.z + 0.5, y;
    if (hit.id === B.water) y = hit.y + 0.6;
    else { if (hit.n[1] !== 1) return true; y = hit.y + 1; }
    if (!boxFree(w, x, y + 0.05, z, 0.5, 0.5)) return true;
    bldSpawnVehicle(game, 'boat', x, y, z, player.yaw + Math.PI, it.boatWood);
    player.consume(); game.audio.placeSound(B.oak_planks);
    return true;
  }
  if (held.id === 'minecart') {
    if (!b || !isRail(b.id)) return true;
    const sh = w.getMeta(b.x, b.y, b.z) & 15;
    const yaw = sh === 1 || sh === 2 || sh === 3 ? Math.PI / 2 : 0;
    bldSpawnVehicle(game, 'minecart', b.x + 0.5, b.y + RAIL_Y + (sh >= 2 && sh <= 5 ? 0.5 : 0), b.z + 0.5, yaw);
    player.consume(); game.audio.placeSound(B.iron_block);
    return true;
  }
  if (held.id === 'rail' || held.id === 'powered_rail') {
    if (!b) return false;
    const [x, y, z] = BLD.placePos(b);
    if (!BLD.canReplace(w, x, y, z)) return true;
    const bl = BLOCKS[w.getBlock(x, y - 1, z)];
    if (!bl.solid || bl.shape === 'boxes') return true;
    const yd = BLD.yawDir(player);
    return BLD.place(game, player, x, y, z, B[held.id], yd % 2 ? 1 : 0);
  }
  return false;
}

function bldTrUseMob(game, player, mob, held) {
  if (!mob.def.vehicle) return false;
  if (player.riding || mob.rider || player.sneaking) return true;
  player.riding = mob; mob.rider = player; mob.input = {};
  return true;
}

function bldTrPlayerMove(game, player, dt, inp) {
  const v = player.riding;
  if (!v) return false;
  if (v.dead || !player.alive || inp.sneak || v.world !== game.world) { bldDismount(game, player); return false; }
  v.input = inp;
  bldSeat(player, v);
  return true;
}
function bldSeat(player, v) {
  player.pos.set(v.pos.x, v.pos.y + (v.type === 'boat' ? -0.4 : -0.25), v.pos.z);
  player.vel.copy(v.vel); player.onGround = true; player.flying = false;
}

FEATURES.push({
  name: 'building_transport',
  blocks: bldTrBlocks,
  items: bldTrItems,
  recipes: bldTrRecipes,
  textures: bldTrTextures,
  blockUpdate: bldTrBlockUpdate,
  useItem: bldTrUseItem,
  useMob: bldTrUseMob,
  playerMove: bldTrPlayerMove,
  frame(game) {
    const p = game.player;
    if (p && p.riding && !p.riding.dead) bldSeat(p, p.riding);
  },
  tick(game) {
    if (this._pending && game.world && game.player) {
      for (const v of this._pending) if ((v.dim || 'overworld') === game.world.dim && MOB_DEFS[v.t]) bldSpawnVehicle(game, v.t, v.p[0], v.p[1], v.p[2], v.yaw, v.wood);
      this._pending = null;
    }
  },
  save(game) {
    return { v: game.mobs.filter(m => !m.dead && m.def.vehicle).map(m => ({ t: m.type, p: [m.pos.x, m.pos.y, m.pos.z], yaw: m.yaw, wood: m.wood, dim: game.world.dim })) };
  },
  load(game, data) { this._pending = data && data.v ? data.v : null; },
});
