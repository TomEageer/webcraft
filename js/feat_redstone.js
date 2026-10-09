'use strict';
// ---------- 红石：充能模型、红石线与基础元件 ----------
// 简化版 Java 版规则：
//   元件直接输出 out(d)（弱充能，给相邻元件/红石线），strong(d) 强充能相邻实体方块；
//   红石线只“弱充能”它下方与指向的方块；实体方块被强充能时可再驱动相邻红石线，被弱充能时只驱动相邻元件。
// 其他模块可用：redstonePower(world,x,y,z[,fromDir]) / redstonePowered(world,x,y,z)；
//   方块定义里加 redstoneListener:true，即可在相邻实体方块的充能变化时收到 blockUpdate。

const RS = {
  specs: [],          // 待注册方块：{name, zh, opts, h, flat, icon}
  byId: [],           // 方块 id -> 处理器
  place: {},          // 物品名 -> 放置函数(ctx) => bool
  WIRE: -1,
  hist: new Map(),    // 红石火把切换记录（烧毁保护）
  burnt: new Map(),
  busy: false,
  scanned: new WeakSet(),
  screens: new Set(),
};
const H_FACE = [5, 0, 4, 1];            // 水平朝向索引 0:-Z 1:+X 2:+Z 3:-X -> 面编号
const FACE_H = [1, 3, -1, -1, 2, 0];    // 面编号 -> 水平朝向索引
const rsKey = (x, y, z) => x + ',' + y + ',' + z;

function rsDefine(name, zh, opts, h, extra) {
  RS.specs.push(Object.assign({ name, zh, opts, h: h || {} }, extra || {}));
  return h;
}

// ---------------- 基础判断 ----------------
function rsConductor(id) {
  if (!id) return false;
  const d = BLOCKS[id];
  if (!d.solid || !d.opaque) return false;
  const h = RS.byId[id];
  return !h || !!h.conductor;
}
function rsOpaqueId(id) { return !!id && BLOCKS[id].solid && BLOCKS[id].opaque; }
// 方块顶面能否承载红石线/中继器/压力板等
function rsTopSolid(id) {
  if (!id) return false;
  const d = BLOCKS[id];
  if (!d.solid) return false;
  if (d.shape === 'cube') return true;
  const h = RS.byId[id];
  return !!(h && h.topSolid);
}
function rsSideSolid(id) { return rsOpaqueId(id); }

// ---------------- 红石线 ----------------
// 水平连接：g(dx,dy,dz) 返回相对坐标处方块 id；结果 [h0..h3]：0 无，1 平/向下，2 向上爬
function rsWireConnRel(g) {
  const res = [0, 0, 0, 0];
  const upOpen = !rsOpaqueId(g(0, 1, 0));
  for (let h = 0; h < 4; h++) {
    const D = DIRS[H_FACE[h]], dx = D[0], dz = D[2];
    const n = g(dx, 0, dz);
    if (n === RS.WIRE || (n && BLOCKS[n].rsConnect)) { res[h] = 1; continue; }
    const opq = rsOpaqueId(n);
    if (!opq && g(dx, -1, dz) === RS.WIRE) { res[h] = 1; continue; }
    if (opq && upOpen && g(dx, 1, dz) === RS.WIRE) res[h] = 2;
  }
  return res;
}
// 线-线连接（用于线网泛洪）
function rsWireLinks(world, x, y, z, out) {
  const upOpen = !rsOpaqueId(world.getBlock(x, y + 1, z));
  for (let h = 0; h < 4; h++) {
    const D = DIRS[H_FACE[h]], nx = x + D[0], nz = z + D[2];
    const n = world.getBlock(nx, y, nz);
    if (n === RS.WIRE) { out.push(nx, y, nz); continue; }
    const opq = rsOpaqueId(n);
    if (!opq && world.getBlock(nx, y - 1, nz) === RS.WIRE) out.push(nx, y - 1, nz);
    if (opq && upOpen && world.getBlock(nx, y + 1, nz) === RS.WIRE) out.push(nx, y + 1, nz);
  }
}
// 线指向的水平方向（位掩码，按水平索引）
function rsWirePoints(world, x, y, z) {
  const c = rsWireConnRel((dx, dy, dz) => world.getBlock(x + dx, y + dy, z + dz));
  let m = 0, n = 0;
  for (let h = 0; h < 4; h++) if (c[h]) { m |= 1 << h; n++; }
  if (n === 0) return 15;
  if (n === 1) m |= 1 << ((Math.log2(m) + 2) & 3);
  return m;
}
function rsWireOut(world, x, y, z, meta, d) {
  const p = meta & 15;
  if (!p || d === 2) return 0;
  if (d === 3) return p;
  return (rsWirePoints(world, x, y, z) >> FACE_H[d]) & 1 ? p : 0;
}

// ---------------- 充能查询 ----------------
// 实体方块受到的充能：weak=false 时只算强充能（供红石线读取）
function rsBlockPower(world, bx, by, bz, weak) {
  let best = 0;
  for (let d = 0; d < 6; d++) {
    const D = DIRS[d], x = bx + D[0], y = by + D[1], z = bz + D[2];
    const id = world.getBlock(x, y, z), h = RS.byId[id];
    if (!h) continue;
    const t = d ^ 1, m = world.getMeta(x, y, z);
    let v = h.strong ? h.strong(world, x, y, z, m, t) : 0;
    if (weak && h.wire) v = Math.max(v, rsWireOut(world, x, y, z, m, t));
    if (v > best) { best = v; if (best >= 15) return 15; }
  }
  return best;
}
// 从 d 方向的邻居传来的充能
function rsFrom(world, x, y, z, d, forWire) {
  const D = DIRS[d], nx = x + D[0], ny = y + D[1], nz = z + D[2];
  const id = world.getBlock(nx, ny, nz);
  if (!id) return 0;
  const h = RS.byId[id], t = d ^ 1;
  if (h) {
    let v = 0;
    if (h.wire) { if (!forWire) v = rsWireOut(world, nx, ny, nz, world.getMeta(nx, ny, nz), t); }
    else if (h.out) v = h.out(world, nx, ny, nz, world.getMeta(nx, ny, nz), t);
    if (h.conductor && v < 15) v = Math.max(v, rsBlockPower(world, nx, ny, nz, !forWire));
    return v;
  }
  if (rsConductor(id)) return rsBlockPower(world, nx, ny, nz, !forWire);
  return 0;
}
function rsInput(world, x, y, z, forWire, skip) {
  let best = 0;
  for (let d = 0; d < 6; d++) {
    if (d === skip) continue;
    const v = rsFrom(world, x, y, z, d, forWire);
    if (v > best) { best = v; if (best >= 15) return 15; }
  }
  return best;
}
// 导出给其他模块：fromDir 为面编号时只看该方向的邻居
function redstonePower(world, x, y, z, fromDir) {
  if (!world) return 0;
  if (fromDir !== undefined && fromDir !== null) return rsFrom(world, x, y, z, fromDir, false);
  return rsInput(world, x, y, z, false, -1);
}
function redstonePowered(world, x, y, z) { return redstonePower(world, x, y, z) > 0; }

// ---------------- 更新调度 ----------------
// 通知 6 个邻居（实体方块会再转发给与它相邻的元件，实现隔一格传导）
function rsNotify(world, x, y, z) {
  for (const D of DIRS) world.blockUpdate(x + D[0], y + D[1], z + D[2]);
}
function rsDispatch(world, x, y, z, id) {
  const h = RS.byId[id];
  if (h) {
    if (h.wire) rsQueueWire(world, x, y, z);
    else if (h.update) h.update(world, x, y, z, world.getMeta(x, y, z), id);
    return;
  }
  if (id === B.tnt) rsTnt(world, x, y, z);
  else if (BLOCKS[id] && BLOCKS[id].redstoneListener) world.blockUpdate(x, y, z);
}
function rsTnt(world, x, y, z) {
  if (world !== game.world || rsInput(world, x, y, z, false, -1) <= 0) return;
  world.setBlock(x, y, z, 0);
  game.entities.push(new PrimedTNT(game, x, y, z));
}

function rsQueueWire(world, x, y, z) {
  const P = world._rsPend || (world._rsPend = new Set());
  P.add(rsKey(x, y, z));
  if (!RS.busy) rsDrain(world, 512);
}
function rsDrain(world, limit) {
  const P = world._rsPend; if (!P || !P.size) return;
  RS.busy = true;
  try {
    let n = 0;
    while (P.size && n < limit) {
      const k = P.values().next().value; P.delete(k);
      const [x, y, z] = k.split(',').map(Number);
      if (world.getBlock(x, y, z) === RS.WIRE) rsWireRecalc(world, x, y, z);
      n++;
    }
  } finally { RS.busy = false; }
}

// 重算整个线网的功率：多源 BFS（按功率桶从高到低传播，每格减 1）
function rsWireRecalc(world, sx, sy, sz) {
  const idx = new Map(), pos = [], stack = [sx, sy, sz];
  while (stack.length && pos.length < 3 * 4096) {
    const z = stack.pop(), y = stack.pop(), x = stack.pop();
    const k = rsKey(x, y, z);
    if (idx.has(k) || world.getBlock(x, y, z) !== RS.WIRE) continue;
    idx.set(k, pos.length / 3); pos.push(x, y, z);
    rsWireLinks(world, x, y, z, stack);
  }
  const n = pos.length / 3, lvl = new Uint8Array(n), links = new Array(n);
  const buckets = []; for (let i = 0; i <= 15; i++) buckets.push([]);
  const tmp = [];
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    tmp.length = 0; rsWireLinks(world, x, y, z, tmp);
    const L = [];
    for (let j = 0; j < tmp.length; j += 3) { const q = idx.get(rsKey(tmp[j], tmp[j + 1], tmp[j + 2])); if (q !== undefined) L.push(q); }
    links[i] = L;
    lvl[i] = rsInput(world, x, y, z, true, -1);
    if (lvl[i]) buckets[lvl[i]].push(i);
  }
  for (let L = 15; L >= 2; L--) {
    for (const i of buckets[L]) {
      if (lvl[i] !== L) continue;
      for (const j of links[i]) if (lvl[j] < L - 1) { lvl[j] = L - 1; buckets[L - 1].push(j); }
    }
  }
  const changed = [];
  const P = world._rsPend, done = world._rsDone || (world._rsDone = new Set());
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2], k = rsKey(x, y, z);
    if (P) P.delete(k);
    done.add(k);
    const m = world.getMeta(x, y, z);
    if ((m & 15) !== lvl[i]) { world.setMeta(x, y, z, (m & ~15) | lvl[i]); changed.push(i); }
  }
  if (!changed.length) return;
  const seen = new Set();
  for (const i of changed) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    for (const D of DIRS) {
      const nx = x + D[0], ny = y + D[1], nz = z + D[2], k = rsKey(nx, ny, nz);
      if (seen.has(k) || idx.has(k)) continue;
      seen.add(k);
      if (world.getBlock(nx, ny, nz) === RS.WIRE) continue;
      world.blockUpdate(nx, ny, nz);
    }
  }
}

// ---------------- 盒子变换 ----------------
// 规范坐标：附着面在 y=0（离附着面的距离为 y）。s 为附着方向（面编号），rot 为地面/天花板上的水平旋转
function rsPt(x, y, z, s, rot) {
  let X, Y, Z;
  switch (s) {
    case 2: X = x; Y = 1 - y; Z = z; break;
    case 0: X = 1 - y; Y = z; Z = x; break;
    case 1: X = y; Y = z; Z = x; break;
    case 4: X = x; Y = z; Z = 1 - y; break;
    case 5: X = x; Y = z; Z = y; break;
    default: X = x; Y = y; Z = z;
  }
  if ((s === 2 || s === 3) && rot) [X, Z] = rsRotXZ(X, Z, rot);
  return [X, Y, Z];
}
function rsRotXZ(x, z, k) {
  switch (k & 3) { case 1: return [1 - z, x]; case 2: return [1 - x, 1 - z]; case 3: return [z, 1 - x]; default: return [x, z]; }
}
function rsBox(b, s, rot) {
  const a = rsPt(b[0], b[1], b[2], s, rot), c = rsPt(b[3], b[4], b[5], s, rot);
  const r = [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.min(a[2], c[2]), Math.max(a[0], c[0]), Math.max(a[1], c[1]), Math.max(a[2], c[2])];
  if (b[6]) r.push(b[6]);
  return r;
}
// 水平旋转（朝向索引 h，规范模型朝 -Z）
function rsBoxH(b, h) {
  const [x0, z0] = rsRotXZ(b[0], b[2], h), [x1, z1] = rsRotXZ(b[3], b[5], h);
  const r = [Math.min(x0, x1), b[1], Math.min(z0, z1), Math.max(x0, x1), b[4], Math.max(z0, z1)];
  if (b[6]) r.push(b[6]);
  return r;
}
// 朝向 f 的方块：规范模型正面朝 +Y
function rsBoxF(b, f) {
  const P = (x, y, z) => {
    switch (f) {
      case 3: return [x, 1 - y, z];
      case 0: return [y, x, z];
      case 1: return [1 - y, x, z];
      case 4: return [x, z, y];
      case 5: return [x, z, 1 - y];
      default: return [x, y, z];
    }
  };
  const a = P(b[0], b[1], b[2]), c = P(b[3], b[4], b[5]);
  const r = [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.min(a[2], c[2]), Math.max(a[0], c[0]), Math.max(a[1], c[1]), Math.max(a[2], c[2])];
  if (b[6]) r.push(b[6]);
  return r;
}
const px16b = (a) => a.map((v, i) => i < 6 ? v / 16 : v);
// 侧面贴图旋转：朝向 dir 在该面贴图坐标中的位置（0 上 1 右 2 下 3 左）
function rsSideRot(face, dir) {
  let up, right;
  if (face < 2) { up = 2; right = 4; } else if (face < 4) { up = 5; right = 0; } else { up = 2; right = 0; }
  if (dir === up) return 0; if (dir === right) return 1; if (dir === (up ^ 1)) return 2; if (dir === (right ^ 1)) return 3;
  return 0;
}

// ---------------- 放置 ----------------
function rsYawH(p) { return ((Math.round(-p.yaw / (Math.PI / 2)) % 4) + 4) % 4; }
function rsLookFace(p) {
  const d = p.lookDir();
  if (d.y > 0.75) return 2;
  if (d.y < -0.75) return 3;
  return H_FACE[rsYawH(p)];
}
function rsFaceOfN(n) {
  if (n[0] > 0) return 0; if (n[0] < 0) return 1; if (n[1] > 0) return 2; if (n[1] < 0) return 3; if (n[2] > 0) return 4; return 5;
}
// 计算放置坐标；返回 null 表示不可放
function rsTarget(world, hit) {
  const repl = BLOCKS[hit.id].replaceable && !isLiquid(hit.id);
  const x = repl ? hit.x : hit.x + hit.n[0], y = repl ? hit.y : hit.y + hit.n[1], z = repl ? hit.z : hit.z + hit.n[2];
  if (y < 0 || y >= CH) return null;
  const cur = world.getBlock(x, y, z);
  if (cur && !BLOCKS[cur].replaceable) return null;
  // 点击可替换方块时视为点击其下方方块的顶面
  const n = repl ? [0, 1, 0] : hit.n;
  return { x, y, z, n, face: rsFaceOfN(n) };
}
function rsEntityBlocks(g, x, y, z, boxes) {
  for (const e of [g.player, ...g.mobs]) {
    if (!e || e.dead) continue;
    for (const bb of boxes) if (x + bb[3] > e.pos.x - e.w && x + bb[0] < e.pos.x + e.w && y + bb[4] > e.pos.y && y + bb[1] < e.pos.y + e.h && z + bb[5] > e.pos.z - e.w && z + bb[2] < e.pos.z + e.w) return true;
  }
  return false;
}
function rsPut(ctx, id, meta) {
  const { g, p, world, x, y, z } = ctx;
  const def = BLOCKS[id];
  if (def.solid) {
    const bx = collisionBoxes(id, meta, worldNB(world, x, y, z)) || [];
    if (rsEntityBlocks(g, x, y, z, bx)) return false;
  }
  world.setBlock(x, y, z, id, meta);
  const h = RS.byId[id];
  if (h && h.placed) h.placed(world, x, y, z, meta);
  g.audio.placeSound(id);
  p.consume();
  return true;
}
// 附着型（火把/拉杆/按钮）的附着方向：返回面编号或 -1
function rsAttachDir(world, t, allowCeil) {
  const s = t.face ^ 1;   // 指向被点击方块
  const D = DIRS[s], sid = world.getBlock(t.x + D[0], t.y + D[1], t.z + D[2]);
  if (s === 3) return rsTopSolid(sid) ? 3 : -1;
  if (s === 2) return allowCeil && rsOpaqueId(sid) ? 2 : -1;
  return rsSideSolid(sid) ? s : -1;
}
function rsSupportOK(world, x, y, z, s) {
  const D = DIRS[s], sid = world.getBlock(x + D[0], y + D[1], z + D[2]);
  if (s === 3) return rsTopSolid(sid);
  return rsOpaqueId(sid);
}

// ---------------- 声音与粒子 ----------------
function rsSound(key, x, y, z, vol, pitch, fallback) {
  const pos = new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5);
  if (game.audio.sfx(key, pos, vol === undefined ? 1 : vol, pitch)) return;
  if (fallback) fallback(pos);
  else game.audio.tone(pitch && pitch > 0.55 ? 900 : 700, 0.05, 0.25, 'square', 0.6, pos);
}
function rsClick(x, y, z, on) { rsSound('mesecons_button_push', x, y, z, 0.6, on ? 0.65 : 0.55); }

// 红石线颜色（功率 0..15）
const RS_WIRE_COL = [];
for (let p = 0; p <= 15; p++) {
  const f = p / 15;
  const r = f * 0.6 + (p > 0 ? 0.4 : 0.3), g = Math.max(0, f * f * 0.7 - 0.5), b = Math.max(0, f * f * 0.6 - 0.7);
  RS_WIRE_COL.push([Math.min(1.25, r * 1.25), g * 1.2, b * 1.2]);
}

// =====================================================================
// 元件定义
// =====================================================================
const TOP_ONLY = [false, false, true, false, false, false];

// ---- 红石线 ----
rsDefine('redstone_wire', '红石线', {
  shape: 'boxes', solid: false, opaque: false, render: 'cutout', hard: 0, tex: 'rs_dust_dot', drop: 'redstone', noItem: true, rsConnect: true,
  boxes(meta, nb) {
    const tint = RS_WIRE_COL[meta & 15];
    const c = rsWireConnRel(nb);
    const H = 1 / 32;
    let m = 0, cnt = 0;
    for (let h = 0; h < 4; h++) if (c[h]) { m |= 1 << h; cnt++; }
    if (cnt === 1) m |= 1 << ((Math.log2(m) + 2) & 3);
    const tDot = TEX.rs_dust_dot, tNS = TEX.rs_dust_ns, tEW = TEX.rs_dust_ew;
    const out = [];
    if (m === 0) out.push([0, 0, 0, 1, H, 1, { tex: () => tDot, tint, faces: TOP_ONLY }]);
    else {
      if (m !== 5 && m !== 10) out.push([0, 0, 0, 1, H + 0.004, 1, { tex: () => tDot, tint, faces: TOP_ONLY }]);
      if (m & 1) out.push([0, 0, 0, 1, H, 0.5, { tex: () => tNS, tint, faces: TOP_ONLY }]);
      if (m & 4) out.push([0, 0, 0.5, 1, H, 1, { tex: () => tNS, tint, faces: TOP_ONLY }]);
      if (m & 2) out.push([0.5, 0, 0, 1, H + 0.002, 1, { tex: () => tEW, tint, faces: TOP_ONLY }]);
      if (m & 8) out.push([0, 0, 0, 0.5, H + 0.002, 1, { tex: () => tEW, tint, faces: TOP_ONLY }]);
    }
    // 爬墙段：画在相邻方块的侧面上
    const e = 1 / 64;
    const wall = (b, f) => { const faces = [false, false, false, false, false, false]; faces[f] = true; out.push(b.concat([{ tex: () => tNS, tint, faces, noCull: true }])); };
    if (c[1] === 2) wall([1 - e, 0, 0, 1, 1, 1], 1);
    if (c[3] === 2) wall([0, 0, 0, e, 1, 1], 0);
    if (c[2] === 2) wall([0, 0, 1 - e, 1, 1, 1], 5);
    if (c[0] === 2) wall([0, 0, 0, 1, 1, e], 4);
    return out;
  },
}, {
  wire: true,
  update(world, x, y, z) {},
  tick(world, x, y, z) { const done = world._rsDone; if (!done || !done.has(rsKey(x, y, z))) rsQueueWire(world, x, y, z); },
});

// ---- 红石火把 ----
function rsTorchBoxes(meta, lit) {
  const s = meta & 7, t = lit ? TEX.jeija_torches_on : TEX.jeija_torches_off;
  const uvA = f => f === 2 ? [7, 6, 9, 8] : f === 3 ? [7, 14, 9, 16] : [7, 6, 9, 16];
  if (s === 3 || s === 2) return [[7 / 16, 0, 7 / 16, 9 / 16, 10 / 16, 9 / 16, { tex: () => t, uv: uvA }]];
  const uv1 = f => f === 2 ? [7, 11, 9, 13] : f === 3 ? [7, 14, 9, 16] : [7, 11, 9, 16];
  const uv2 = f => f === 2 ? [7, 6, 9, 8] : f === 3 ? [7, 9, 9, 11] : [7, 6, 9, 11];
  return [
    rsBox(px16b([7, 0, 3.5, 9, 2.5, 8.5, { tex: () => t, uv: uv1 }]), s),
    rsBox(px16b([7, 2, 8.5, 9, 4.5, 13.5, { tex: () => t, uv: uv2 }]), s),
  ];
}
function rsTorchPowered(world, x, y, z, s) {
  const D = DIRS[s], bx = x + D[0], by = y + D[1], bz = z + D[2];
  const id = world.getBlock(bx, by, bz);
  if (id === B.redstone_block) return true;
  if (!rsConductor(id)) return false;
  return rsBlockPower(world, bx, by, bz, true) > 0;
}
function rsTorchHandler(lit) {
  return {
    topSolid: false,
    out(world, x, y, z, m, d) { return lit && d !== (m & 7) ? 15 : 0; },
    strong(world, x, y, z, m, d) { return lit && d === 2 && (m & 7) !== 2 ? 15 : 0; },
    update(world, x, y, z, m) {
      const s = m & 7;
      if (!rsSupportOK(world, x, y, z, s)) { world.breakBlock(x, y, z, true); return; }
      const want = !rsTorchPowered(world, x, y, z, s) && !rsTorchBurnt(world, x, y, z);
      if (want !== lit) world.schedule(x, y, z, 2);
    },
    tick(world, x, y, z, m) {
      const s = m & 7;
      if (!rsSupportOK(world, x, y, z, s)) { world.breakBlock(x, y, z, true); return; }
      const burnt = rsTorchBurnt(world, x, y, z);
      const want = !rsTorchPowered(world, x, y, z, s) && !burnt;
      if (want === lit) return;
      if (lit) {
        // 记录熄灭次数，60 刻内超过 8 次则烧毁 160 刻
        const k = rsKey(x, y, z), now = world.tick;
        const a = (RS.hist.get(k) || []).filter(t => now - t < 60); a.push(now); RS.hist.set(k, a);
        if (a.length >= 8) {
          RS.burnt.set(k, now + 160); RS.hist.delete(k);
          world.schedule(x, y, z, 160);
          rsSound('fizz', x, y, z, 0.5, 2.2, pos => game.audio.noiseHit(3000, 1, 0.3, 0.2, 'highpass', pos));
          if (game.particles) for (let i = 0; i < 5; i++) game.particles.add(x + 0.5, y + 0.7, z + 0.5, (Math.random() - 0.5) * 0.6, 1 + Math.random(), (Math.random() - 0.5) * 0.6, [90, 90, 90], 0.8, -1);
        }
      }
      world.setBlock(x, y, z, lit ? B.unlit_redstone_torch : B.redstone_torch, m);
      rsNotify(world, x, y + 1, z);
    },
  };
}
function rsTorchBurnt(world, x, y, z) {
  const k = rsKey(x, y, z), t = RS.burnt.get(k);
  if (t === undefined) return false;
  if (world.tick >= t) { RS.burnt.delete(k); return false; }
  return true;
}
function rsPlaceTorch(ctx) {
  const s = rsAttachDir(ctx.world, ctx.t, false);
  if (s < 0) return true;
  rsPut(ctx, B.redstone_torch, s);
  return true;
}
rsDefine('redstone_torch', '红石火把', {
  shape: 'boxes', solid: false, opaque: false, render: 'cutout', hard: 0, emit: 7, tex: 'jeija_torches_on', rsConnect: true,
  boxes(meta) { return rsTorchBoxes(meta, true); },
}, rsTorchHandler(true), { flat: true, icon: 'jeija_torches_on', place: rsPlaceTorch });
rsDefine('unlit_redstone_torch', '红石火把（熄灭）', {
  shape: 'boxes', solid: false, opaque: false, render: 'cutout', hard: 0, tex: 'jeija_torches_off', noItem: true, drop: 'redstone_torch', rsConnect: true,
  boxes(meta) { return rsTorchBoxes(meta, false); },
}, rsTorchHandler(false));

// ---- 拉杆 ----
function rsLeverBoxes(meta) {
  const s = meta & 7, on = !!(meta & 8), rot = (meta >> 4) & 3;
  const tb = TEX.cobblestone, th = TEX.jeija_wall_lever;
  const dz = on ? -1 : 1;
  const zA = 8 + dz * 1, zB = 8 + dz * 3;
  return [
    rsBox(px16b([5, 0, 4, 11, 3, 12, { tex: () => tb }]), s, rot),
    rsBox(px16b([7, 3, zA - 1, 9, 7, zA + 1, { tex: () => th, uv: f => f === 3 ? [7, 14, 9, 16] : [7, 11, 9, 16] }]), s, rot),
    rsBox(px16b([7, 7, zB - 1, 9, 10, zB + 1, { tex: () => th, uv: f => f === 2 ? [7, 6, 9, 8] : [7, 6, 9, 11] }]), s, rot),
  ];
}
const RS_ATTACH_H = {
  out(world, x, y, z, m, d) { return m & 8 ? 15 : 0; },
  strong(world, x, y, z, m, d) { return m & 8 && d === (m & 7) ? 15 : 0; },
};
function rsAttachedNotify(world, x, y, z, m) {
  rsNotify(world, x, y, z);
  const D = DIRS[m & 7];
  rsNotify(world, x + D[0], y + D[1], z + D[2]);
}
rsDefine('lever', '拉杆', {
  shape: 'boxes', solid: false, opaque: false, render: 'cutout', hard: 0.5, tex: 'cobblestone', rsConnect: true,
  boxes: rsLeverBoxes,
}, Object.assign({
  update(world, x, y, z, m) { if (!rsSupportOK(world, x, y, z, m & 7)) world.breakBlock(x, y, z, true); },
  use(g, p, hit) {
    const w = g.world, m = w.getMeta(hit.x, hit.y, hit.z) ^ 8;
    w.setMeta(hit.x, hit.y, hit.z, m);
    rsClick(hit.x, hit.y, hit.z, m & 8);
    rsAttachedNotify(w, hit.x, hit.y, hit.z, m);
    return true;
  },
}, RS_ATTACH_H), {
  flat: true, iconFn: 'lever',
  place(ctx) {
    const s = rsAttachDir(ctx.world, ctx.t, true);
    if (s < 0) return true;
    rsPut(ctx, B.lever, s | ((rsYawH(ctx.p) & 3) << 4));
    return true;
  },
});

// ---- 按钮 ----
function rsButtonHandler(ticks, wood) {
  return Object.assign({
    update(world, x, y, z, m) { if (!rsSupportOK(world, x, y, z, m & 7)) world.breakBlock(x, y, z, true); },
    use(g, p, hit) {
      const w = g.world, m = w.getMeta(hit.x, hit.y, hit.z);
      if (m & 8) return true;
      w.setMeta(hit.x, hit.y, hit.z, m | 8);
      rsSound(wood ? 'mesecons_button_push_wood' : 'mesecons_button_push', hit.x, hit.y, hit.z, 0.7, 1);
      rsAttachedNotify(w, hit.x, hit.y, hit.z, m | 8);
      w.schedule(hit.x, hit.y, hit.z, ticks);
      return true;
    },
    tick(world, x, y, z, m) {
      if (!(m & 8)) return;
      world.setMeta(x, y, z, m & ~8);
      rsSound(wood ? 'mesecons_button_push_wood' : 'mesecons_button_push', x, y, z, 0.5, 0.8);
      rsAttachedNotify(world, x, y, z, m & ~8);
    },
  }, RS_ATTACH_H);
}
function rsDefButton(name, zh, tex, wood) {
  rsDefine(name, zh, {
    shape: 'boxes', solid: false, opaque: false, render: 'cutout', hard: 0.5, tex, rsConnect: true, tool: wood ? 'axe' : 'pickaxe',
    boxes(meta) { return [rsBox(px16b([5, 0, 6, 11, meta & 8 ? 1 : 2, 10, { tex: () => TEX[tex] }]), meta & 7, (meta >> 4) & 3)]; },
  }, rsButtonHandler(wood ? 30 : 20, wood), {
    flat: true, iconFn: 'button', iconTex: tex,
    place(ctx) {
      const s = rsAttachDir(ctx.world, ctx.t, true);
      if (s < 0) return true;
      rsPut(ctx, B[name], s | ((rsYawH(ctx.p) & 1) << 4));
      return true;
    },
  });
}

// ---- 压力板 ----
// kind: mob 玩家与生物；all 含掉落物；light 轻质（数量）；heavy 重质（数量/10）
function rsPlateCount(world, x, y, z, kind) {
  const g = game; if (world !== g.world) return 0;
  const x0 = x + 1 / 16, x1 = x + 15 / 16, z0 = z + 1 / 16, z1 = z + 15 / 16, y0 = y, y1 = y + 0.3;
  const hit = e => e.pos.x + e.w > x0 && e.pos.x - e.w < x1 && e.pos.z + e.w > z0 && e.pos.z - e.w < z1 && e.pos.y < y1 && e.pos.y + e.h > y0;
  let n = 0;
  const p = g.player;
  if (p && p.alive && p.mode !== 'spectator' && hit(p)) n++;
  for (const m of g.mobs) if (!m.dead && hit(m)) n++;
  if (kind !== 'mob') for (const e of g.entities) if (!e.dead && e instanceof ItemEntity && hit(e)) n += kind === 'all' ? 1 : e.count;
  return n;
}
function rsPlateEval(world, x, y, z, kind) {
  const m = world.getMeta(x, y, z), cur = m & 15;
  const n = rsPlateCount(world, x, y, z, kind);
  let lvl = 0;
  if (n > 0) lvl = kind === 'light' ? Math.min(15, n) : kind === 'heavy' ? Math.min(15, Math.ceil(n / 10)) : 15;
  if (lvl !== cur) {
    world.setMeta(x, y, z, (m & ~15) | lvl);
    if (!cur !== !lvl) rsSound('mesecons_button_push', x, y, z, 0.5, lvl ? 0.6 : 0.5);
    rsNotify(world, x, y, z); rsNotify(world, x, y - 1, z);
  }
  if (lvl) world.schedule(x, y, z, 10);
}
function rsDefPlate(name, zh, tex, kind, tool) {
  rsDefine(name, zh, {
    shape: 'boxes', solid: false, opaque: false, render: 'cutout', hard: 0.5, tex, tool, rsConnect: true,
    boxes(meta) { return [[1 / 16, 0, 1 / 16, 15 / 16, meta & 15 ? 0.5 / 16 : 1 / 16, 15 / 16, { tex: () => TEX[tex] }]]; },
  }, {
    plate: kind,
    out(world, x, y, z, m) { return m & 15; },
    strong(world, x, y, z, m, d) { return d === 3 ? m & 15 : 0; },
    update(world, x, y, z) { if (!rsTopSolid(world.getBlock(x, y - 1, z))) world.breakBlock(x, y, z, true); },
    tick(world, x, y, z) { rsPlateEval(world, x, y, z, kind); },
  }, {
    flat: true, iconFn: 'plate', iconTex: tex,
    place(ctx) {
      if (!rsTopSolid(ctx.world.getBlock(ctx.x, ctx.y - 1, ctx.z))) return true;
      rsPut(ctx, B[name], 0);
      return true;
    },
  });
}

// ---- 红石灯 ----
rsDefine('redstone_lamp', '红石灯', { tex: 'jeija_lightstone_gray_off', hard: 0.3, sound: 'glass' }, {
  conductor: true,
  update(world, x, y, z) { if (rsInput(world, x, y, z, false, -1) > 0) world.setBlock(x, y, z, B.lit_redstone_lamp); },
  tick(world, x, y, z) { this.update(world, x, y, z); },
});
rsDefine('lit_redstone_lamp', '红石灯（点亮）', { tex: 'jeija_lightstone_gray_on', hard: 0.3, emit: 15, noItem: true, drop: 'redstone_lamp', sound: 'glass' }, {
  conductor: true,
  update(world, x, y, z) { if (rsInput(world, x, y, z, false, -1) === 0) world.schedule(x, y, z, 4); },
  tick(world, x, y, z) { if (rsInput(world, x, y, z, false, -1) === 0) world.setBlock(x, y, z, B.redstone_lamp); },
});

// ---- 中继器 ----
// meta：0-1 朝向（输出方向），2-3 延迟-1，4 激活，5 锁定，6 待激活
function rsDiodeTorch(x0, z0, lit, h) {
  const t = lit ? TEX.jeija_torches_on : TEX.jeija_torches_off;
  return rsBoxH(px16b([x0, 2, z0, x0 + 2, 7, z0 + 2, { tex: () => t, uv: f => f === 2 ? [7, 6, 9, 8] : f === 3 ? [7, 14, 9, 16] : [7, 6, 9, 11] }]), h);
}
function rsRepeaterLocked(world, x, y, z, h) {
  for (const sh of [1, 3]) {
    const d = H_FACE[(h + sh) & 3], D = DIRS[d];
    const nx = x + D[0], nz = z + D[2], id = world.getBlock(nx, y, nz);
    if (id !== B.repeater && id !== B.comparator) continue;
    if (RS.byId[id].out(world, nx, y, nz, world.getMeta(nx, y, nz), d ^ 1) > 0) return true;
  }
  return false;
}
const RS_DIODE_OPTS = { shape: 'boxes', solid: true, opaque: false, render: 'cutout', hard: 0, rsConnect: true };
rsDefine('repeater', '红石中继器', Object.assign({}, RS_DIODE_OPTS, {
  tex: 'mesecons_delayer_off',
  boxes(meta) {
    const h = meta & 3, on = !!(meta & 16), locked = !!(meta & 32), dl = (meta >> 2) & 3;
    const top = TEX['rs_rep_' + (on ? 'on' : 'off') + '_' + h], side = TEX[on ? 'mesecons_delayer_sides_on' : 'mesecons_delayer_sides_off'], stone = TEX.stone;
    const out = [[0, 0, 0, 1, 2 / 16, 1, { tex: f => f === 2 ? top : f === 3 ? stone : side }]];
    out.push(rsDiodeTorch(7, 2, on, h));
    const zt = 6 + dl * 2;
    if (locked) out.push(rsBoxH(px16b([2, 2, zt, 14, 4, zt + 2, { tex: () => TEX.bedrock }]), h));
    else out.push(rsDiodeTorch(7, zt, on, h));
    return out;
  },
  collide() { return [[0, 0, 0, 1, 2 / 16, 1]]; },
}), {
  pushBreak: true,
  out(world, x, y, z, m, d) { return m & 16 && d === H_FACE[m & 3] ? 15 : 0; },
  strong(world, x, y, z, m, d) { return m & 16 && d === H_FACE[m & 3] ? 15 : 0; },
  update(world, x, y, z, m) {
    if (!rsTopSolid(world.getBlock(x, y - 1, z))) { world.breakBlock(x, y, z, true); return; }
    const h = m & 3, locked = rsRepeaterLocked(world, x, y, z, h);
    if (locked !== !!(m & 32)) { m = locked ? m | 32 : m & ~32; world.setMeta(x, y, z, m); }
    if (locked) return;
    const inp = rsFrom(world, x, y, z, H_FACE[h] ^ 1, false) > 0, on = !!(m & 16), delay = (((m >> 2) & 3) + 1) * 2;
    if (inp && !on && !(m & 64)) { world.setMeta(x, y, z, m | 64); world.schedule(x, y, z, delay); }
    else if (!inp && on) world.schedule(x, y, z, delay);
  },
  tick(world, x, y, z, m) {
    if (m & 32) return;
    const h = m & 3, inp = rsFrom(world, x, y, z, H_FACE[h] ^ 1, false) > 0, on = !!(m & 16), delay = (((m >> 2) & 3) + 1) * 2;
    if (on && !inp) { world.setMeta(x, y, z, m & ~(16 | 64)); rsNotify(world, x, y, z); }
    else if (!on && (inp || (m & 64))) {
      world.setMeta(x, y, z, (m | 16) & ~64); rsNotify(world, x, y, z);
      if (!inp) world.schedule(x, y, z, delay);
    } else if (m & 64) world.setMeta(x, y, z, m & ~64);
  },
  use(g, p, hit) {
    const w = g.world, m = w.getMeta(hit.x, hit.y, hit.z);
    const dl = (((m >> 2) & 3) + 1) & 3;
    w.setMeta(hit.x, hit.y, hit.z, (m & ~12) | (dl << 2));
    rsClick(hit.x, hit.y, hit.z, true);
    return true;
  },
}, {
  flat: true, icon: 'mesecons_delayer_item',
  place(ctx) {
    if (!rsTopSolid(ctx.world.getBlock(ctx.x, ctx.y - 1, ctx.z))) return true;
    rsPut(ctx, B.repeater, rsYawH(ctx.p));
    return true;
  },
});

// ---- 比较器 ----
// meta：0-1 朝向，2 减法模式，3 有输出；输出强度存于方块实体 {type:'rs_comparator', out}
function rsContainerTile(world, x, y, z) {
  const id = world.getBlock(x, y, z);
  if (!id) return null;
  const t = world.tiles.get(rsKey(x, y, z));
  if (t && Array.isArray(t.items)) return t;
  return null;
}
function rsFillLevel(t) {
  if (!t) return 0;
  let s = 0, any = false;
  for (const st of t.items) if (st) { any = true; s += st.n / ((ITEMS[st.id] && ITEMS[st.id].stack) || 64); }
  if (!any) return 0;
  return Math.floor(1 + s / t.items.length * 14);
}
function rsComparatorCalc(world, x, y, z, m) {
  const h = m & 3, back = H_FACE[h] ^ 1, D = DIRS[back];
  const bx = x + D[0], bz = z + D[2];
  let rear = rsFrom(world, x, y, z, back, false);
  const ct = rsContainerTile(world, bx, y, bz);
  if (ct) rear = Math.max(rear, rsFillLevel(ct));
  else if (rear < 15 && rsConductor(world.getBlock(bx, y, bz))) rear = Math.max(rear, rsFillLevel(rsContainerTile(world, bx + D[0], y, bz + D[2])));
  let side = 0;
  for (const sh of [1, 3]) {
    const d = H_FACE[(h + sh) & 3], S = DIRS[d], nx = x + S[0], nz = z + S[2];
    const id = world.getBlock(nx, y, nz), hh = RS.byId[id];
    if (!hh) continue;
    const nm = world.getMeta(nx, y, nz);
    let v = 0;
    if (hh.wire) v = rsWireOut(world, nx, y, nz, nm, d ^ 1);
    else if (id === B.repeater || id === B.comparator || id === B.redstone_block) v = hh.out(world, nx, y, nz, nm, d ^ 1);
    if (v > side) side = v;
  }
  return m & 4 ? Math.max(0, rear - side) : (rear >= side ? rear : 0);
}
function rsCompTile(world, x, y, z) {
  const k = rsKey(x, y, z);
  let t = world.tiles.get(k);
  if (!t) { t = { type: 'rs_comparator', out: 0 }; world.tiles.set(k, t); }
  return t;
}
rsDefine('comparator', '红石比较器', Object.assign({}, RS_DIODE_OPTS, {
  tex: 'mcl_comparators_off',
  boxes(meta) {
    const h = meta & 3, on = !!(meta & 8), sub = !!(meta & 4);
    const top = TEX['rs_cmp_' + (on ? 'on' : 'off') + '_' + h], side = TEX[on ? 'mcl_comparators_sides_on' : 'mcl_comparators_sides_off'], stone = TEX.stone;
    return [
      [0, 0, 0, 1, 2 / 16, 1, { tex: f => f === 2 ? top : f === 3 ? stone : side }],
      rsDiodeTorch(7, 2, sub, h), rsDiodeTorch(3, 11, on, h), rsDiodeTorch(11, 11, on, h),
    ];
  },
  collide() { return [[0, 0, 0, 1, 2 / 16, 1]]; },
}), {
  pushBreak: true,
  out(world, x, y, z, m, d) {
    if (d !== H_FACE[m & 3] || !(m & 8)) return 0;
    const t = world.tiles.get(rsKey(x, y, z));
    return t ? t.out | 0 : 0;
  },
  strong(world, x, y, z, m, d) { return this.out(world, x, y, z, m, d); },
  placed(world, x, y, z) { rsCompTile(world, x, y, z); world.schedule(x, y, z, 1); },
  update(world, x, y, z, m) {
    if (!rsTopSolid(world.getBlock(x, y - 1, z))) { world.breakBlock(x, y, z, true); return; }
    if (rsComparatorCalc(world, x, y, z, m) !== rsCompTile(world, x, y, z).out) world.schedule(x, y, z, 2);
  },
  tick(world, x, y, z, m) {
    const t = rsCompTile(world, x, y, z), v = rsComparatorCalc(world, x, y, z, m);
    if (v === t.out) return;
    t.out = v;
    world.setMeta(x, y, z, v > 0 ? m | 8 : m & ~8);
    rsNotify(world, x, y, z);
  },
  use(g, p, hit) {
    const w = g.world, m = w.getMeta(hit.x, hit.y, hit.z) ^ 4;
    w.setMeta(hit.x, hit.y, hit.z, m);
    rsClick(hit.x, hit.y, hit.z, m & 4);
    w.schedule(hit.x, hit.y, hit.z, 2);
    return true;
  },
}, {
  flat: true, icon: 'mcl_comparators_item',
  place(ctx) {
    if (!rsTopSolid(ctx.world.getBlock(ctx.x, ctx.y - 1, ctx.z))) return true;
    rsPut(ctx, B.comparator, rsYawH(ctx.p));
    return true;
  },
});

// ---- 侦测器 ----
// meta：0-2 观察方向（面），3 输出中，4 待输出；方块实体记录上次看到的状态
rsDefine('observer', '侦测器', {
  tex: 'mcl_observers_observer_side', hard: 3, tool: 'pickaxe', tier: 1,
  texNames: ['mcl_observers_observer_front', 'mcl_observers_observer_back', 'mcl_observers_observer_back_lit'],
  texFn(face, meta) {
    const f = meta & 7;
    if (face === f) return TEX.mcl_observers_observer_front;
    if (face === (f ^ 1)) return TEX[meta & 8 ? 'mcl_observers_observer_back_lit' : 'mcl_observers_observer_back'];
    return TEX['rs_obs_side_' + rsSideRot(face, f)];
  },
}, {
  out(world, x, y, z, m, d) { return m & 8 && d === ((m & 7) ^ 1) ? 15 : 0; },
  strong(world, x, y, z, m, d) { return this.out(world, x, y, z, m, d); },
  placed(world, x, y, z, m) {
    const D = DIRS[m & 7];
    world.tiles.set(rsKey(x, y, z), { type: 'rs_observer', last: world.getBlock(x + D[0], y + D[1], z + D[2]) * 256 + world.getMeta(x + D[0], y + D[1], z + D[2]) });
  },
  update() {},
  tick(world, x, y, z, m) {
    if (m & 8) { world.setMeta(x, y, z, m & ~(8 | 16)); rsNotifyBack(world, x, y, z, m); }
    else if (m & 16) { world.setMeta(x, y, z, (m | 8) & ~16); rsNotifyBack(world, x, y, z, m); world.schedule(x, y, z, 2); }
  },
}, { place(ctx) { rsPut(ctx, B.observer, rsLookFace(ctx.p)); return true; } });
function rsNotifyBack(world, x, y, z, m) {
  const D = DIRS[(m & 7) ^ 1];
  rsNotify(world, x, y, z);
  world.blockUpdate(x + D[0], y + D[1], z + D[2]);
  rsNotify(world, x + D[0], y + D[1], z + D[2]);
}
function rsObserverPoll(world, x, y, z, t) {
  if (world.getBlock(x, y, z) !== B.observer) { world.tiles.delete(rsKey(x, y, z)); return; }
  const m = world.getMeta(x, y, z), D = DIRS[m & 7];
  const s = world.getBlock(x + D[0], y + D[1], z + D[2]) * 256 + world.getMeta(x + D[0], y + D[1], z + D[2]);
  if (s === t.last) return;
  t.last = s;
  if (!(m & 24)) { world.setMeta(x, y, z, m | 16); world.schedule(x, y, z, 2); }
}

// ---- 音符盒 ----
const RS_NOTE_SND = [
  [b => b === B.gold_block, 'mesecons_noteblock_bell'], [b => b === B.clay, 'mesecons_noteblock_flute'], [b => b === B.packed_ice, 'mesecons_noteblock_chime'],
  [b => BLOCKS[b].name.endsWith('_wool'), 'mesecons_noteblock_guitar'], [b => b === B.iron_block, 'mesecons_noteblock_xylophone_metal'],
  [b => b === B.emerald_block, 'mesecons_noteblock_banjo'], [b => b === B.hay_block, 'mesecons_noteblock_banjo'], [b => b === B.pumpkin, 'mesecons_noteblock_didgeridoo'],
  [b => b === B.glowstone, 'mesecons_noteblock_piano_digital'], [b => B.bone_block !== undefined && b === B.bone_block, 'mesecons_noteblock_xylophone_wood'],
  [b => b === B.sand || b === B.gravel || b === B.red_sand, 'mesecons_noteblock_snare'], [b => b === B.glass, 'mesecons_noteblock_hit'],
  [b => BLOCKS[b].tool === 'axe', 'mesecons_noteblock_bass_guitar'], [b => BLOCKS[b].tool === 'pickaxe' && BLOCKS[b].opaque, 'mesecons_noteblock_bass_drum'],
];
function rsPlayNote(world, x, y, z, m) {
  if (world.getBlock(x, y + 1, z)) return;
  const pitch = m & 31, below = world.getBlock(x, y - 1, z);
  let key = 'mesecons_noteblock_fsharp';
  for (const [f, k] of RS_NOTE_SND) if (below && f(below)) { key = k; break; }
  const rate = Math.pow(2, (pitch - 12) / 12);
  const pos = new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5);
  if (!game.audio.sfx(key, pos, 1, rate)) game.audio.tone(370 * rate, 0.4, 0.25, 'triangle', 0, pos);
  if (game.particles) {
    const hue = pitch / 24;
    const c = [Math.floor(255 * Math.max(0, Math.sin(hue * 6.28) * 0.5 + 0.5)), Math.floor(255 * Math.max(0, Math.sin(hue * 6.28 + 2.1) * 0.5 + 0.5)), Math.floor(255 * Math.max(0, Math.sin(hue * 6.28 + 4.2) * 0.5 + 0.5))];
    game.particles.add(x + 0.5, y + 1.2, z + 0.5, 0, 1.2, 0, c, 0.8, 0);
  }
}
rsDefine('note_block', '音符盒', { tex: 'mesecons_noteblock', hard: 0.8, tool: 'axe', fuel: 300 }, {
  conductor: true,
  update(world, x, y, z, m) {
    const p = rsInput(world, x, y, z, false, -1) > 0;
    if (p === !!(m & 32)) return;
    world.setMeta(x, y, z, p ? m | 32 : m & ~32);
    if (p) rsPlayNote(world, x, y, z, m);
  },
  use(g, p, hit) {
    const w = g.world, m = w.getMeta(hit.x, hit.y, hit.z), pitch = ((m & 31) + 1) % 25;
    w.setMeta(hit.x, hit.y, hit.z, (m & ~31) | pitch);
    rsPlayNote(w, hit.x, hit.y, hit.z, pitch);
    return true;
  },
});

// ---- 阳光探测器 ----
// meta：0-3 输出，4 反相
function rsDaylightCalc(world, x, y, z, m) {
  if (!world.hasSky) return m & 16 ? 15 : 0;
  const sl = world.skyLight(x, y, z);
  const t = (game.time % 24000) / 24000;
  const sun = Math.cos((t - 0.25) * Math.PI * 2);
  const rain = game.isRaining && game.isRaining() ? 0.8 : 1;
  const v = Math.max(0, Math.min(15, Math.round(sl * Math.max(0, Math.min(1, sun * 1.4 + 0.25)) * rain)));
  return m & 16 ? 15 - Math.min(15, Math.round(sl * Math.max(0, Math.min(1, sun * 1.4 + 0.25)))) : v;
}
function rsDaylightPoll(world, x, y, z) {
  if (world.getBlock(x, y, z) !== B.daylight_detector) { world.tiles.delete(rsKey(x, y, z)); return; }
  const m = world.getMeta(x, y, z), v = rsDaylightCalc(world, x, y, z, m);
  if (v === (m & 15)) return;
  world.setMeta(x, y, z, (m & ~15) | v);
  rsNotify(world, x, y, z);
}
rsDefine('daylight_detector', '阳光探测器', {
  shape: 'boxes', solid: true, opaque: false, render: 'cutout', hard: 0.2, tool: 'axe', tex: 'rs_daylight_top', fuel: 300, rsConnect: true,
  boxes(meta) {
    const top = TEX[meta & 16 ? 'rs_daylight_inv' : 'rs_daylight_top'], side = TEX.rs_daylight_side;
    return [[0, 0, 0, 1, 6 / 16, 1, { tex: f => f === 2 ? top : side }]];
  },
}, {
  out(world, x, y, z, m) { return m & 15; },
  placed(world, x, y, z) { world.tiles.set(rsKey(x, y, z), { type: 'rs_daylight' }); rsDaylightPoll(world, x, y, z); },
  use(g, p, hit) {
    const w = g.world, m = w.getMeta(hit.x, hit.y, hit.z) ^ 16;
    w.setMeta(hit.x, hit.y, hit.z, m);
    rsClick(hit.x, hit.y, hit.z, m & 16);
    rsDaylightPoll(w, hit.x, hit.y, hit.z);
    return true;
  },
}, { flat: true, iconFn: 'slab6', iconTex: 'rs_daylight_top' });

// =====================================================================
// 注册
// =====================================================================
const RS_WOODS = { oak: '橡木', birch: '白桦木', spruce: '云杉木', cherry: '樱花木', pale_oak: '苍白橡木', poplar: '杨木' };
rsDefButton('stone_button', '石质按钮', 'stone', false);
for (const w in RS_WOODS) rsDefButton(w + '_button', RS_WOODS[w] + '按钮', w + '_planks', true);
rsDefPlate('stone_pressure_plate', '石质压力板', 'stone', 'mob', 'pickaxe');
for (const w in RS_WOODS) rsDefPlate(w + '_pressure_plate', RS_WOODS[w] + '压力板', w + '_planks', 'all', 'axe');
rsDefPlate('light_weighted_pressure_plate', '轻质测重压力板', 'gold_block', 'light', 'pickaxe');
rsDefPlate('heavy_weighted_pressure_plate', '重质测重压力板', 'iron_block', 'heavy', 'pickaxe');

// 程序贴图与派生贴图
function rsPix(src) { return typeof PACK_READY !== 'undefined' && PACK_READY && PACK_IMG[src] ? packFrame(src, 0) : null; }
function rsRotPix(d, k) {
  let s = d;
  for (let i = 0; i < (k & 3); i++) {
    const o = new Uint8ClampedArray(1024);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const si = ((15 - x) * 16 + y) * 4, di = (y * 16 + x) * 4;
      o[di] = s[si]; o[di + 1] = s[si + 1]; o[di + 2] = s[si + 2]; o[di + 3] = s[si + 3];
    }
    s = o;
  }
  return s;
}
// 由素材（或后备绘制）生成旋转 k 次的贴图
function rsTexFrom(name, src, k, fallback) {
  defTex(name, p => {
    let d = rsPix(src);
    if (!d) { if (fallback) fallback(p); d = new Uint8ClampedArray(p.d); }
    p.d.set(rsRotPix(d, k || 0));
  });
}
// 用目标纹理的平均色给素材重新上色
function rsAvgColor(texName) {
  const d = TEX_IMG[TEX[texName]]; if (!d) return [150, 110, 70];
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 100) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
  return n ? [r / n, g / n, b / n] : [150, 110, 70];
}
function rsRecolorPix(src, col) {
  const d = rsPix(src); if (!d) return null;
  let sum = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 100) { sum += (d[i] + d[i + 1] + d[i + 2]) / 3; n++; }
  const avg = n ? sum / n : 128;
  for (let i = 0; i < d.length; i += 4) {
    const l = (d[i] + d[i + 1] + d[i + 2]) / 3 / avg;
    d[i] = Math.min(255, col[0] * l); d[i + 1] = Math.min(255, col[1] * l); d[i + 2] = Math.min(255, col[2] * l);
  }
  return d;
}
function rsTextures() {
  // 素材包的红石粉线条只有 2 像素宽，这里生成更接近原版宽度的灰度粉末（运行时按功率染色）
  const grain = (x, y) => ((x * 73856093) ^ (y * 19349663)) >>> 0;
  const dust = (p, vert) => {
    for (let i = 0; i < 16; i++) for (let w = 5; w < 11; w++) {
      const g = grain(i, w) % 100, edge = w === 5 || w === 10;
      if (g < (edge ? 55 : 12)) continue;
      const v = 190 + (g % 6) * 13;
      p.set(vert ? w : i, vert ? i : w, [v, v, v]);
    }
  };
  defTex('rs_dust_ns', p => dust(p, true));
  defTex('rs_dust_ew', p => dust(p, false));
  defTex('rs_dust_dot', p => {
    for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5), g = grain(x + 31, y) % 100;
      if (d > 4.6 || (d > 3.4 && g < 50) || g < 8) continue;
      const v = 190 + (g % 6) * 13;
      p.set(x, y, [v, v, v]);
    }
  });
  const diode = (p, c) => { p.fill([160, 160, 160], 0.08); p.rect(7, 2, 2, 12, c); };
  for (let k = 0; k < 4; k++) {
    rsTexFrom('rs_rep_off_' + k, 'mesecons_delayer_off', k, p => diode(p, [110, 20, 20]));
    rsTexFrom('rs_rep_on_' + k, 'mesecons_delayer_on', k, p => diode(p, [250, 40, 40]));
    rsTexFrom('rs_cmp_off_' + k, 'mcl_comparators_off', k, p => diode(p, [110, 20, 20]));
    rsTexFrom('rs_cmp_on_' + k, 'mcl_comparators_on', k, p => diode(p, [250, 40, 40]));
    rsTexFrom('rs_obs_side_' + k, 'mcl_observers_observer_side', k, p => { p.fill([110, 110, 110], 0.1); p.rect(6, 1, 4, 3, [60, 60, 60]); });
    rsTexFrom('rs_pside_' + k, 'mesecons_piston_bottom', k, p => { p.fill([120, 120, 120], 0.1); p.rect(0, 0, 16, 4, [160, 125, 80], 0.1); });
    rsTexFrom('rs_phead_' + k, 'mesecons_piston_pusher_top', k, p => { p.fill([160, 125, 80], 0.1); });
  }
  const dl = (p, cell) => {
    p.fill([170, 130, 80], 0.08);
    for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) {
      const line = x % 5 === 0 || y % 5 === 0;
      p.set(x, y, line ? [120, 90, 55] : shade(cell, 0.9 + ((x * 3 + y * 5) % 7) / 30));
    }
  };
  defTex('rs_daylight_top', p => dl(p, [232, 222, 196, 255]));
  defTex('rs_daylight_inv', p => dl(p, [96, 128, 196, 255]));
  defTex('rs_daylight_side', p => { p.fill([170, 130, 80], 0.08); for (let x = 0; x < 16; x++) { p.set(x, 10, [120, 90, 55]); p.set(x, 15, [110, 80, 50]); } });
  for (const f of RS_TEX_HOOKS) f();
}
const RS_TEX_HOOKS = [];  // 其他红石文件追加的贴图生成

// 物品图标：扁平元件画成小立体
function rsIsoIcon(texName, h, scale, extraFn) {
  const cv = document.createElement('canvas'); cv.width = cv.height = IS;
  const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
  const tmp = document.createElement('canvas'); tmp.width = tmp.height = IS;
  const fake = { tex: { all: texName }, shape: h === 'slab' ? 'slab' : h === 'cushion' ? 'cushion' : 'cube' };
  drawIsoBlock(tmp.getContext('2d'), fake);
  if (h === 'thin') {
    // 极薄：取顶面 + 下压
    const t2 = document.createElement('canvas'); t2.width = t2.height = IS;
    const c2 = t2.getContext('2d'); c2.imageSmoothingEnabled = false;
    drawIsoBlock(c2, Object.assign({}, fake, { shape: 'cushion' }));
    ctx.drawImage(t2, 0, 0, IS, IS, 0, 0, IS, IS);
  } else {
    const s = scale || 1, o = (IS - IS * s) / 2;
    ctx.drawImage(tmp, 0, 0, IS, IS, o, o + (h === 'button' ? 6 : 0), IS * s, IS * s);
  }
  if (extraFn) extraFn(ctx);
  return cv;
}
function rsPackCanvas(name, recol) {
  const d = recol ? rsRecolorPix(name, recol) : rsPix(name);
  if (!d) return null;
  const c16 = document.createElement('canvas'); c16.width = c16.height = 16;
  c16.getContext('2d').putImageData(new ImageData(d, 16, 16), 0, 0);
  const cv = document.createElement('canvas'); cv.width = cv.height = IS;
  const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(c16, 0, 0, IS, IS);
  return cv;
}
function rsIcons() {
  for (const s of RS.specs) {
    if (!s.iconFn) continue;
    if (s.iconTex) ensureTex(s.iconTex);
    let cv = null;
    if (s.iconFn === 'button') cv = rsIsoIcon(s.iconTex, 'cube', 0.45);
    else if (s.iconFn === 'plate') cv = rsIsoIcon(s.iconTex, 'thin');
    else if (s.iconFn === 'slab6') cv = rsIsoIcon(s.iconTex, 'cushion');
    else if (s.iconFn === 'lever') {
      cv = rsIsoIcon('cobblestone', 'cube', 0.5);
      const ctx = cv.getContext('2d'), hd = rsPackCanvas('jeija_wall_lever');
      if (hd) { ctx.save(); ctx.translate(26, 2); ctx.rotate(0.35); ctx.drawImage(hd, -24, 0, IS, IS * 0.75); ctx.restore(); }
      else { ctx.fillStyle = '#7a5a30'; ctx.fillRect(22, 4, 4, 22); }
    } else if (typeof s.iconFn === 'function') cv = s.iconFn();
    if (cv) ICON_CANVAS.set(s.itemName || s.name, cv);
  }
}

// 每格加载后的复查：存档里的瞬态（按下的按钮、待更新的线等）需要重新调度
const RS_SCAN = new Uint8Array(65536);
function rsScanChunk(world, ch) {
  const bx = ch.cx * 16, bz = ch.cz * 16, b = ch.blocks;
  for (let i = 0; i < b.length; i++) {
    if (!RS_SCAN[b[i]]) continue;
    const x = i & 15, z = (i >> 4) & 15, y = i >> 8;
    world.schedule(bx + x, y, bz + z, 1 + (i % 3));
  }
}

FEATURES.push({
  name: 'redstone',
  blocks() {
    for (const s of RS.specs) {
      const d = defBlock(s.name, s.zh, s.opts);
      const h = s.h || {};
      h.id = d.id; h.name = s.name;
      RS.byId[d.id] = h;
      if (!h.wire && (h.tick || h.update)) RS_SCAN[d.id] = 1;
    }
    RS.WIRE = B.redstone_wire; RS_SCAN[RS.WIRE] = 1;
    RS.byId[B.redstone_block] = { core: true, out: () => 15 };
    BLOCKS[B.redstone_block].rsConnect = true;
  },
  items() {
    for (const s of RS.specs) {
      const iname = s.itemName || s.name;
      if (s.itemDef) defItem(iname, s.itemZh || s.zh, s.itemDef);
      const item = ITEMS[iname];
      if (!item) continue;
      if (s.flat) { delete item.block; item.rsBlock = B[s.name]; }
      if (s.icon) item.icon = s.icon;
      if (s.place) RS.place[iname] = s.place;
      else if (s.flat) RS.place[iname] = ctx => { rsPut(ctx, B[s.name], 0); return true; };
    }
    RS.place.redstone = ctx => {
      if (!rsTopSolid(ctx.world.getBlock(ctx.x, ctx.y - 1, ctx.z))) return true;
      rsPut(ctx, RS.WIRE, 0);
      return true;
    };
  },
  recipes() { rsRecipes(); },
  textures() { rsTextures(); rsIcons(); },
  blockUpdate(world, x, y, z, id) {
    const h = RS.byId[id];
    if (h) {
      if (h.core) return false;
      if (h.wire) {
        if (!rsTopSolid(world.getBlock(x, y - 1, z))) { world.breakBlock(x, y, z, true); return true; }
        rsQueueWire(world, x, y, z);
      } else if (h.update) h.update(world, x, y, z, world.getMeta(x, y, z), id);
      return true;
    }
    if (id === B.tnt) { rsTnt(world, x, y, z); return false; }
    // 实体方块变化：转发给与它相邻的元件（隔一格传导）
    if (rsConductor(id)) {
      for (const D of DIRS) {
        const nx = x + D[0], ny = y + D[1], nz = z + D[2], nid = world.getBlock(nx, ny, nz);
        if (nid && (RS.byId[nid] && !RS.byId[nid].core || nid === B.tnt || BLOCKS[nid].redstoneListener)) rsDispatch(world, nx, ny, nz, nid);
      }
    }
    return false;
  },
  scheduledTick(world, x, y, z, id) {
    const h = RS.byId[id];
    if (!h || h.core) return false;
    if (h.tick) h.tick(world, x, y, z, world.getMeta(x, y, z), id);
    else if (h.update) h.update(world, x, y, z, world.getMeta(x, y, z), id);
    return true;
  },
  useBlock(g, p, hit, held) {
    const h = RS.byId[hit.id];
    if (h && h.use) return !!h.use(g, p, hit, held);
    return false;
  },
  useItem(g, p, hit, held) {
    if (!held || !hit) return false;
    if (!(held.id in RS.place)) return false;
    const fn = RS.place[held.id];
    const world = g.world, t = rsTarget(world, hit);
    if (!t) return true;
    const ctx = { g, p, world, hit, held, t, x: t.x, y: t.y, z: t.z };
    return fn ? fn(ctx) : false;
  },
  onBreak(g, x, y, z, id, meta) {
    const h = RS.byId[id];
    if (h && h.broken) h.broken(g.world, x, y, z, meta, id);
  },
  tick(g) {
    const w = g.world;
    if (w._rsDone) w._rsDone.clear();
    if (w._rsPend && w._rsPend.size) rsDrain(w, 256);
    // 新载入区块复查
    let n = 0;
    for (const ch of w.chunks.values()) {
      if (RS.scanned.has(ch)) continue;
      RS.scanned.add(ch); rsScanChunk(w, ch);
      if (++n >= 6) break;
    }
    // 压力板：检测站在上面的实体
    const ents = [g.player, ...g.mobs];
    for (const e of g.entities) if (e instanceof ItemEntity) ents.push(e);
    for (const e of ents) {
      if (!e || e.dead || (e.isPlayer && (!e.alive || e.mode === 'spectator'))) continue;
      const x = Math.floor(e.pos.x), y = Math.floor(e.pos.y + 0.01), z = Math.floor(e.pos.z);
      const id = w.getBlock(x, y, z), h = RS.byId[id];
      if (!h || !h.plate || (w.getMeta(x, y, z) & 15)) continue;
      if (h.plate === 'mob' && e instanceof ItemEntity) continue;
      rsPlateEval(w, x, y, z, h.plate);
    }
    // 方块实体轮询
    const t20 = w.tick % 20 === 0, t4 = w.tick % 4 === 0;
    for (const [k, t] of w.tiles) {
      const ty = t.type;
      if (ty !== 'rs_observer' && ty !== 'hopper' && !(t4 && ty === 'rs_comparator') && !(t20 && ty === 'rs_daylight')) continue;
      const c = k.indexOf(','), c2 = k.indexOf(',', c + 1);
      const x = +k.slice(0, c), y = +k.slice(c + 1, c2), z = +k.slice(c2 + 1);
      if (!w.isLoaded(x, z)) continue;
      if (ty === 'rs_observer') rsObserverPoll(w, x, y, z, t);
      else if (ty === 'hopper') { if (typeof rsHopperTick === 'function') rsHopperTick(w, x, y, z, t); }
      else if (ty === 'rs_comparator') {
        if (w.getBlock(x, y, z) !== B.comparator) { w.tiles.delete(k); continue; }
        if (rsComparatorCalc(w, x, y, z, w.getMeta(x, y, z)) !== (t.out | 0)) w.schedule(x, y, z, 2);
      } else rsDaylightPoll(w, x, y, z);
    }
    // 打开的容器界面对应方块已不存在时关闭
    const ui = g.ui;
    if (ui.screen && RS.screens.has(ui.screen) && ui.rsTile && ui.rsPos && w.tiles.get(rsKey(ui.rsPos[0], ui.rsPos[1], ui.rsPos[2])) !== ui.rsTile) ui.closeScreen();
    if (w.tick % 200 === 0) for (const [k, a] of RS.hist) if (!a.length || w.tick - a[a.length - 1] > 60) RS.hist.delete(k);
  },
});

// ---------------- 配方（Java 版） ----------------
function rsRecipes() {
  const quartz = ITEMS.quartz ? 'quartz' : ITEMS.nether_quartz ? 'nether_quartz' : 'redstone';
  shaped(['R', 'S'], { R: 'redstone', S: 'stick' }, 'redstone_torch');
  shaped(['S', 'C'], { S: 'stick', C: 'cobblestone' }, 'lever');
  shapeless(['stone'], 'stone_button');
  shaped(['SS'], { S: 'stone' }, 'stone_pressure_plate');
  for (const w in RS_WOODS) {
    shapeless([w + '_planks'], w + '_button');
    shaped(['PP'], { P: w + '_planks' }, w + '_pressure_plate');
  }
  shaped(['GG'], { G: 'gold_ingot' }, 'light_weighted_pressure_plate');
  shaped(['II'], { I: 'iron_ingot' }, 'heavy_weighted_pressure_plate');
  shaped([' R ', 'RGR', ' R '], { R: 'redstone', G: 'glowstone' }, 'redstone_lamp');
  shaped(['TRT', 'SSS'], { T: 'redstone_torch', R: 'redstone', S: 'stone' }, 'repeater');
  shaped([' T ', 'TQT', 'SSS'], { T: 'redstone_torch', Q: quartz, S: 'stone' }, 'comparator');
  shaped(['CCC', 'RRQ', 'CCC'], { C: '#stone_mat', R: 'redstone', Q: quartz }, 'observer');
  shaped(['PPP', 'PRP', 'PPP'], { P: '#planks', R: 'redstone' }, 'note_block');
  shaped(['GGG', 'QQQ', 'SSS'], { G: 'glass', Q: quartz, S: ITEMS.oak_slab ? 'oak_slab' : '#planks' }, 'daylight_detector');
  for (const f of RS_RECIPE_HOOKS) f(quartz);
}
const RS_RECIPE_HOOKS = [];
