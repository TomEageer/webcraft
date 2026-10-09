'use strict';
// ---------- 末地模块（一）：要塞结构与末地维度地形 ----------

// 模块共享状态；END.state 随存档保存（见 feat_end.js 的 save/load）
const END = {
  state: null, metaId: null,
  defaults() {
    return { killed: false, everKilled: false, hp: 200, crystals: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], pending: false, placed: [], respawnT: 0 };
  },
};
const END_S = 62;           // 主岛中心地表高度（返回传送门所在层）
const DIRV = [[0, -1], [1, 0], [0, 1], [-1, 0]];   // 0:-Z 1:+X 2:+Z 3:-X（与玩家朝向索引一致）
const STAIR_UP = [2, 3, 0, 1];                    // 楼梯高侧朝向 d 时的 meta
const CHEST_FACE = { '0,1': 0, '-1,0': 1, '0,-1': 2, '1,0': 3 }; // 箱子正面朝向向量 -> meta
const dirIndex = (vx, vz) => DIRV.findIndex(v => v[0] === vx && v[1] === vz);

// ---------------- 要塞 ----------------
const SH_CACHE = new Map();
function strongholdList(seed) {
  if (SH_CACHE.has(seed)) return SH_CACHE.get(seed);
  const r = mulberry32(hash3(seed, 7771, 31, 1717)), list = [];
  const ring = (n, d0, d1) => {
    const base = r() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = base + i * Math.PI * 2 / n + (r() - 0.5) * 0.6, d = d0 + r() * (d1 - d0);
      list.push({ x: Math.round(Math.cos(a) * d), z: Math.round(Math.sin(a) * d), y: 24 + Math.floor(r() * 10), layout: null });
    }
  };
  ring(3, 640, 1150);
  ring(6, 1450, 1950);
  SH_CACHE.set(seed, list);
  return list;
}

// 局部坐标系：f 沿方向 d 前进，u 为其左右，y 相对 oy
function mkPiece(kind, ox, oy, oz, d, f0, f1, u0, u1, y0, y1, gen, extra) {
  const [dx, dz] = DIRV[d], ux = -dz, uz = dx;
  const xs = [ox + f0 * dx + u0 * ux, ox + f1 * dx + u1 * ux], zs = [oz + f0 * dz + u0 * uz, oz + f1 * dz + u1 * uz];
  return Object.assign({
    kind, ox, oy, oz, d, dx, dz, ux, uz, f0, f1, u0, u1, y0, y1, gen,
    minX: Math.min(xs[0], xs[1]) - 1, maxX: Math.max(xs[0], xs[1]) + 1, minZ: Math.min(zs[0], zs[1]) - 1, maxZ: Math.max(zs[0], zs[1]) + 1,
  }, extra || {});
}
const BRICK = -1; // 生成时按坐标随机选石砖/苔石砖/裂石砖

function shellAndCarve(pc, put, cf0, cf1, cu, cy0, cy1) {
  for (let f = pc.f0; f <= pc.f1; f++) for (let u = pc.u0; u <= pc.u1; u++) for (let y = pc.y0; y <= pc.y1; y++) put(f, y, u, BRICK, 0, 0);
  for (let f = cf0; f <= cf1; f++) for (let u = -cu; u <= cu; u++) for (let y = cy0; y <= cy1; y++) put(f, y, u, 0, 0, 1);
}
function genCorridor(pc, put) {
  shellAndCarve(pc, put, pc.f0 - 1, pc.f1 + 1, 1, 1, 3);
  if (pc.chest) put(pc.chest, 1, 1, B.chest, CHEST_FACE[(-pc.ux) + ',' + (-pc.uz)], 2, 'corridor');
}
function genRoom(pc, put) {
  shellAndCarve(pc, put, pc.f0 + 1, pc.f1 - 1, pc.u1 - 1, pc.y0 + 1, pc.y1 - 1);
}
function genHub(pc, put) {
  genRoom(pc, put);
  for (let y = 1; y <= 5; y++) put(0, y, 0, BRICK, 0, 2);
  for (const [f, u] of [[-3, -3], [-3, 3], [3, -3], [3, 3]]) put(f, 1, u, B.torch, 0, 2);
}
function genStairs(pc, put) {
  for (let f = pc.f0; f <= pc.f1; f++) for (let u = -2; u <= 2; u++) for (let y = -4; y <= 4; y++) put(f, y, u, BRICK, 0, 0);
  const back = (pc.d + 2) % 4;
  for (let g = 0; g <= 6; g++) {
    const f = pc.f0 + g, k = Math.min(g, 4);
    for (let u = -1; u <= 1; u++) {
      for (let y = (g < 4 ? 1 - k : -3); y <= 3; y++) put(f, y, u, 0, 0, 1);
      if (g < 4) put(f, -k, u, B.stone_brick_stairs, STAIR_UP[back], 2);
    }
  }
  for (let u = -1; u <= 1; u++) for (let y = -3; y <= -1; y++) put(pc.f1 + 1, y, u, 0, 0, 1);
}
function genLibrary(pc, put) {
  genRoom(pc, put);
  const F = pc.f0;
  for (let g = 1; g <= 13; g++) for (let y = 1; y <= 4; y++) for (const u of [-4, 4]) put(F + g, y, u, g % 4 === 0 ? B.oak_planks : B.bookshelf, 0, 2);
  for (let g = 3; g <= 11; g++) if (g !== 7) for (let y = 1; y <= 3; y++) for (const u of [-2, 2]) put(F + g, y, u, B.bookshelf, 0, 2);
  for (let u = -3; u <= 3; u++) for (let y = 1; y <= 4; y++) if (u !== 0 || y > 1) put(F + 13, y, u, B.bookshelf, 0, 2);
  put(F + 13, 1, 0, B.chest, CHEST_FACE[(-pc.dx) + ',' + (-pc.dz)], 2, 'library');
  for (const g of [3, 11]) for (const u of [-2, 2]) put(F + g, 4, u, B.torch, 0, 2);
}
function genPrison(pc, put) {
  genRoom(pc, put);
  const F = pc.f0, bars = B.iron_bars;
  for (let g = 1; g <= 9; g++) for (let y = 1; y <= 3; y++) for (const u of [-1, 1]) {
    const door = (g === 2 || g === 6) && y <= 2;
    if (!door) put(F + g, y, u, bars !== undefined ? bars : (y === 2 && g % 2 ? 0 : BRICK), 0, 2);
  }
  for (const g of [4, 8]) for (let y = 1; y <= 3; y++) for (const u of [-3, -2, 2, 3]) put(F + g, y, u, BRICK, 0, 2);
  put(F + 1, 1, 0, B.torch, 0, 2);
}
function genStore(pc, put) {
  genRoom(pc, put);
  put(pc.f0 + 7, 1, 0, B.chest, CHEST_FACE[(-pc.dx) + ',' + (-pc.dz)], 2, 'corridor');
  put(pc.f0 + 4, 1, -3, B.torch, 0, 2); put(pc.f0 + 4, 1, 3, B.torch, 0, 2);
  for (let y = 1; y <= 4; y++) { put(pc.f0 + 4, y, 0, BRICK, 0, 2); }
}
function genPortalRoom(pc, put, seed) {
  genRoom(pc, put);
  const F = pc.f0;
  const fwd = pc.d, back = (pc.d + 2) % 4, uPos = dirIndex(pc.ux, pc.uz), uNeg = (uPos + 2) % 4;
  for (let u = -1; u <= 1; u++) {
    put(F + 4, 1, u, B.stone_brick_stairs, STAIR_UP[fwd], 2);
    put(F + 5, 1, u, BRICK, 0, 2); put(F + 5, 2, u, B.stone_brick_stairs, STAIR_UP[fwd], 2);
  }
  for (let g = 6; g <= 12; g++) for (let u = -3; u <= 3; u++) for (let y = 1; y <= 2; y++) put(F + g, y, u, BRICK, 0, 2);
  for (let g = 8; g <= 10; g++) for (let u = -1; u <= 1; u++) put(F + g, 2, u, B.lava, 0, 3);
  // 12 个末地传送门框架，朝向中心
  const frame = (g, u, face) => put(F + g, 3, u, B.end_portal_frame, face, 3, 'frame');
  for (let u = -1; u <= 1; u++) { frame(7, u, fwd); frame(11, u, back); }
  for (let g = 8; g <= 10; g++) { frame(g, -2, uPos); frame(g, 2, uNeg); }
  for (const [g, u] of [[2, -3], [2, 3], [13, -3], [13, 3]]) put(F + g, 1, u, B.torch, 0, 2);
}

// 生成要塞布局（只计算一次）：中心十字大厅 + 四向走廊，分别通往传送门房间、图书馆、牢房、储藏室
function strongholdLayout(sh, seed) {
  if (sh.layout) return sh.layout;
  const r = mulberry32(hash3(seed, sh.x, 9191, sh.z));
  const X = sh.x, Y = sh.y, Z = sh.z, P = [];
  P.push(mkPiece('hub', X, Y, Z, 2, -5, 5, -5, 5, 0, 6, genHub));
  const dirs = [0, 1, 2, 3], kinds = ['portal', 'library', 'prison', 'store'];
  for (let i = 3; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
  let portal = null;
  for (let i = 0; i < 4; i++) {
    const d = dirs[i], kind = kinds[i], L = 6 + Math.floor(r() * 10);
    const chest = r() < 0.5 ? 6 + Math.floor(L / 2) : 0;
    P.push(mkPiece('corridor', X, Y, Z, d, 6, 5 + L, -2, 2, 0, 4, genCorridor, { chest }));
    let f = 6 + L;
    if (kind === 'portal') {
      P.push(mkPiece('stairs', X, Y, Z, d, f, f + 6, -2, 2, -4, 4, genStairs));
      f += 7;
      const pc = mkPiece('portal', X, Y - 4, Z, d, f, f + 15, -5, 5, 0, 7, genPortalRoom);
      P.push(pc);
      portal = [X + (f + 9) * pc.dx, Y - 4 + 3, Z + (f + 9) * pc.dz];
    } else if (kind === 'library') P.push(mkPiece('library', X, Y, Z, d, f, f + 14, -5, 5, 0, 6, genLibrary));
    else if (kind === 'prison') P.push(mkPiece('prison', X, Y, Z, d, f, f + 10, -4, 4, 0, 5, genPrison));
    else P.push(mkPiece('store', X, Y, Z, d, f, f + 8, -4, 4, 0, 5, genStore));
  }
  sh.layout = { pieces: P, portal };
  sh.portal = portal;
  return sh.layout;
}
function strongholdPortals(seed) {
  return strongholdList(seed).map(sh => strongholdLayout(sh, seed).portal);
}
function nearestStronghold(seed, x, z) {
  let best = null, bd = Infinity;
  for (const p of strongholdPortals(seed)) { const d = Math.hypot(p[0] - x, p[2] - z); if (d < bd) { bd = d; best = p; } }
  return best ? { pos: best, dist: Math.round(bd) } : null;
}

const SH_LOOT = {
  corridor: ['ender_pearl', 'ender_pearl', 'bread', 'apple', 'iron_ingot', 'gold_ingot', 'redstone', 'coal', 'diamond', 'iron_pickaxe', 'iron_sword'],
  library: ['book', 'book', 'paper', 'paper', 'apple', 'enchanted_book', 'book'],
};
function shLoot(kind, seed, x, y, z) {
  const r = mulberry32(hash3(seed, x, y * 7 + 3, z)), items = new Array(27).fill(null);
  const pool = SH_LOOT[kind].filter(n => ITEMS[n]);
  for (let i = 0; i < 6 && pool.length; i++) {
    const n = pool[Math.floor(r() * pool.length)], max = ITEMS[n].stack > 1 ? 3 : 1;
    items[Math.floor(r() * 27)] = { id: n, n: 1 + Math.floor(r() * max) };
  }
  return items;
}

// 主世界区块生成钩子：只写入当前区块范围内的要塞部分
function genStrongholdChunk(world, ch) {
  const bx = ch.cx * 16, bz = ch.cz * 16, seed = world.seed;
  for (const sh of strongholdList(seed)) {
    if (Math.abs(sh.x - bx - 8) > 100 || Math.abs(sh.z - bz - 8) > 100) continue;
    const L = strongholdLayout(sh, seed), ops = [];
    for (const pc of L.pieces) {
      if (pc.maxX < bx || pc.minX > bx + 15 || pc.maxZ < bz || pc.minZ > bz + 15) continue;
      pc.gen(pc, (f, y, u, id, meta, prio, tag) => {
        const wx = pc.ox + f * pc.dx + u * pc.ux, wz = pc.oz + f * pc.dz + u * pc.uz, wy = pc.oy + y;
        if (wx < bx || wx > bx + 15 || wz < bz || wz > bz + 15 || wy < 1 || wy >= CH - 1) return;
        ops.push([prio, wx, wy, wz, id, meta, tag]);
      }, seed);
    }
    if (!ops.length) continue;
    ops.sort((a, b) => a[0] - b[0]);
    for (const [, wx, wy, wz, id0, meta0, tag] of ops) {
      let id = id0, meta = meta0 || 0;
      if (id === BRICK) {
        const r = rand3(seed ^ 0x5151, wx, wy, wz);
        id = r < 0.15 ? B.mossy_stone_bricks : r < 0.3 && B.cracked_stone_bricks !== undefined ? B.cracked_stone_bricks : B.stone_bricks;
      }
      if (tag === 'frame' && rand3(seed ^ 0x7e7e, wx, wy, wz) < 0.1) meta |= 4;
      const i = idx3(wx - bx, wy, wz - bz);
      ch.blocks[i] = id; ch.meta[i] = meta;
      if (tag === 'corridor' || tag === 'library') {
        const k = wx + ',' + wy + ',' + wz;
        if (!world.tiles.has(k)) world.tiles.set(k, { type: 'chest', items: shLoot(tag, seed, wx, wy, wz) });
      }
    }
  }
}

// ---------------- 末地维度 ----------------
const END_NOISE = new Map();
function endNoise(seed) { if (!END_NOISE.has(seed)) END_NOISE.set(seed, new Noise(seed + 777)); return END_NOISE.get(seed); }

// 主岛某列的 [底, 顶]，岛外返回 null
function endIsland(nz, wx, wz) {
  const r = Math.hypot(wx + 0.5, wz + 0.5);
  const R = 89 + nz.n2(wx / 45, wz / 45) * 7 + nz.n2(wx / 17, wz / 17) * 2;
  if (r >= R) return null;
  const f = r / R;
  let top = 61 + nz.n2(wx / 30 + 40, wz / 30) * 2 - f * f * f * 5;
  top = Math.round(lerp(END_S, top, smoothstep(6, 14, r)));
  const depth = 2 + 18 * Math.sqrt(1 - f * f) * (0.8 + 0.2 * nz.n2(wx / 9, wz / 9));
  return [Math.round(top - depth), top];
}

// 10 根黑曜石柱：半径 43 环绕，粗细与高度按种子打乱
const PILLAR_CACHE = new Map();
function pillarList(seed) {
  if (PILLAR_CACHE.has(seed)) return PILLAR_CACHE.get(seed);
  const r = mulberry32(hash3(seed, 4040, 1, 4040)), perm = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let i = 9; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  const list = [];
  for (let i = 0; i < 10; i++) {
    const a = Math.PI * 2 * i / 10, k = perm[i];
    list.push({ x: Math.floor(Math.cos(a) * 43), z: Math.floor(Math.sin(a) * 43), r: 2 + Math.floor(k / 3), h: 76 + k * 3, caged: k === 1 || k === 2 });
  }
  PILLAR_CACHE.set(seed, list);
  return list;
}

// 紫颂植物：主干 + 少量侧枝，只写本区块
function chorusTree(ch, lx, y, lz, r) {
  const b = ch.blocks, m = ch.meta;
  const set = (x, yy, z, id, meta) => {
    if (x < 0 || x > 15 || z < 0 || z > 15 || yy < 1 || yy >= CH - 1) return false;
    const i = idx3(x, yy, z); if (b[i]) return false;
    b[i] = id; m[i] = meta || 0; return true;
  };
  const h = 2 + Math.floor(r() * 3);
  for (let k = 0; k < h; k++) set(lx, y + k, lz, B.chorus_plant);
  set(lx, y + h, lz, B.chorus_flower, 5);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (r() > 0.45) continue;
    const by = y + 1 + Math.floor(r() * (h - 1));
    if (!set(lx + dx, by, lz + dz, B.chorus_plant)) continue;
    const up = 1 + Math.floor(r() * 2);
    for (let k = 1; k <= up; k++) set(lx + dx, by + k, lz + dz, B.chorus_plant);
    set(lx + dx, by + up + 1, lz + dz, B.chorus_flower, 5);
  }
}

DIM_GEN.end = (world, ch, fromSave) => {
  ch.biome.fill('end');
  if (fromSave) return;
  const nz = endNoise(world.seed), b = ch.blocks, bx = ch.cx * 16, bz = ch.cz * 16, seed = world.seed;
  const ES = B.end_stone, OB = B.obsidian, BR = B.bedrock;
  // 主岛
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const wx = bx + x, wz = bz + z, isl = endIsland(nz, wx, wz);
    if (!isl) continue;
    for (let y = Math.max(1, isl[0]); y <= isl[1]; y++) b[idx3(x, y, z)] = ES;
  }
  // 外围小岛（离中心 220 格以外）
  const CELL = 56;
  for (let gx = Math.floor((bx - 16) / CELL); gx <= Math.floor((bx + 31) / CELL); gx++) for (let gz = Math.floor((bz - 16) / CELL); gz <= Math.floor((bz + 31) / CELL); gz++) {
    const r = mulberry32(hash3(seed, gx, 4321, gz));
    if (r() > 0.45) continue;
    const icx = gx * CELL + 8 + Math.floor(r() * 40), icz = gz * CELL + 8 + Math.floor(r() * 40);
    if (Math.hypot(icx, icz) < 220) continue;
    const rad = 4 + r() * 9, iy = 48 + Math.floor(r() * 14);
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const d = Math.hypot(bx + x - icx, bz + z - icz);
      if (d >= rad) continue;
      const t = d / rad, top = iy + Math.round(1 - t * t * 2), bot = iy - Math.round((1 - t * t) * rad * 0.7);
      for (let y = bot; y <= top; y++) b[idx3(x, y, z)] = ES;
    }
    const lx = icx - bx, lz = icz - bz;
    if (lx >= 0 && lx < 16 && lz >= 0 && lz < 16 && r() < 0.8) {
      let y = CH - 2; while (y > 1 && b[idx3(lx, y, lz)] !== ES) y--;
      if (y > 1) chorusTree(ch, lx, y + 1, lz, r);
    }
  }
  // 主岛边缘零星紫颂植物
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const wx = bx + x, wz = bz + z, rr = Math.hypot(wx, wz);
    if (rr < 75 || rand3(seed ^ 0xc0c0, wx, 5, wz) > 0.0025) continue;
    const isl = endIsland(nz, wx, wz); if (!isl) continue;
    chorusTree(ch, x, isl[1] + 1, z, mulberry32(hash3(seed, wx, 77, wz)));
  }
  // 黑曜石柱
  for (const p of pillarList(seed)) {
    if (p.x + p.r + 3 < bx || p.x - p.r - 3 > bx + 15 || p.z + p.r + 3 < bz || p.z - p.r - 3 > bz + 15) continue;
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const dx = bx + x - p.x, dz = bz + z - p.z;
      if (dx * dx + dz * dz <= p.r * p.r + p.r * 0.6) for (let y = 40; y <= p.h; y++) b[idx3(x, y, z)] = OB;
      if (dx === 0 && dz === 0) b[idx3(x, p.h + 1, z)] = BR;
      if (p.caged && B.iron_bars !== undefined && Math.abs(dx) <= 2 && Math.abs(dz) <= 2) {
        for (let y = p.h + 1; y <= p.h + 4; y++) {
          const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
          if (edge || y === p.h + 4) { const i = idx3(x, y, z); if (!b[i]) b[i] = B.iron_bars; }
        }
      }
    }
  }
  // 中心返回传送门（基岩框架，龙死前不激活）
  if (bx <= 3 && bx + 15 >= -3 && bz <= 3 && bz + 15 >= -3) {
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const wx = bx + x, wz = bz + z, d2 = wx * wx + wz * wz;
      if (d2 > 12.25) continue;
      b[idx3(x, END_S - 1, z)] = BR;
      for (let y = END_S; y <= END_S + 8; y++) b[idx3(x, y, z)] = 0;
      if (d2 > 6.25) { b[idx3(x, END_S, z)] = BR; b[idx3(x, END_S + 1, z)] = BR; }
      if (wx === 0 && wz === 0) for (let y = END_S; y <= END_S + 3; y++) b[idx3(x, y, z)] = BR;
    }
  }
};

// 返回传送门内圈坐标（不含中心柱）
function exitPortalCells() {
  const out = [];
  for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) { const d2 = x * x + z * z; if (d2 <= 6.25 && d2 > 0) out.push([x, z]); }
  return out;
}
