'use strict';
// ---------- 下界地形、下界要塞、主世界废弃传送门 ----------

function netherNoise(w) {
  if (!w._ng) w._ng = { a: new Noise(w.seed + 401), b: new Noise(w.seed + 402), t: new Noise(w.seed + 403), h: new Noise(w.seed + 404), d: new Noise(w.seed + 405), e: new Noise(w.seed + 406) };
  return w._ng;
}
// 五个群系在 (温度, 湿度) 平面上的中心点，取最近者
const NETHER_BIOME_PTS = [['nether_wastes', 0, 0], ['soul_sand_valley', 0, -0.55], ['crimson_forest', 0.55, 0], ['warped_forest', 0, 0.55], ['basalt_deltas', -0.55, 0]];
function netherBiomeAt(w, x, z) {
  const n = netherNoise(w);
  const t = n.t.fbm2(x / 240, z / 240, 2) * 1.5, h = n.h.fbm2(x / 240 + 31, z / 240 - 17, 2) * 1.5;
  let best = 'nether_wastes', bd = 1e9;
  for (const [name, a, b] of NETHER_BIOME_PTS) { const d = (t - a) * (t - a) + (h - b) * (h - b); if (d < bd) { bd = d; best = name; } }
  return best;
}
// 网格节点密度（> 0 为实心）
function netherDensity(n, x, y, z) {
  let d = n.a.n3(x / 76, y / 42, z / 76) + n.b.n3(x / 30, y / 20, z / 30) * 0.45 + 0.08;
  if (y < 28) d += (28 - y) / 8;
  if (y > 96) d += (y - 96) / 10;
  return d;
}

DIM_GEN.nether = (world, ch, fromSave) => {
  const bx = ch.cx * 16, bz = ch.cz * 16;
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) ch.biome[z * 16 + x] = netherBiomeAt(world, bx + x, bz + z);
  if (fromSave) return;
  const n = netherNoise(world), b = ch.blocks, seed = world.seed;
  // 4x4x4 采样网格 + 三线性插值
  const SX = 5, SY = 33, den = new Float32Array(SX * SX * SY);
  for (let gz = 0; gz < SX; gz++) for (let gx = 0; gx < SX; gx++) for (let gy = 0; gy < SY; gy++) den[(gz * SX + gx) * SY + gy] = netherDensity(n, bx + gx * 4, gy * 4, bz + gz * 4);
  const samp = (x, y, z) => {
    const fx = x / 4, fy = y / 4, fz = z / 4, x0 = Math.floor(fx), y0 = Math.floor(fy), z0 = Math.floor(fz);
    const tx = fx - x0, ty = fy - y0, tz = fz - z0, x1 = Math.min(x0 + 1, 4), y1 = Math.min(y0 + 1, 32), z1 = Math.min(z0 + 1, 4);
    const g = (a, c, e) => den[(e * SX + a) * SY + c];
    return lerp(lerp(lerp(g(x0, y0, z0), g(x1, y0, z0), tx), lerp(g(x0, y0, z1), g(x1, y0, z1), tx), tz),
      lerp(lerp(g(x0, y1, z0), g(x1, y1, z0), tx), lerp(g(x0, y1, z1), g(x1, y1, z1), tx), tz), ty);
  };
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const wx = bx + x, wz = bz + z, bio = ch.biome[z * 16 + x];
    for (let y = 0; y < CH; y++) {
      let id;
      if (y === 0 || y === CH - 1) id = B.bedrock;
      else if (y <= 4 && rand3(seed, wx, y, wz) < (5 - y) / 5) id = B.bedrock;
      else if (y >= CH - 5 && rand3(seed, wx, y, wz) < (y - (CH - 6)) / 5) id = B.bedrock;
      else if (samp(x, y, z) > 0) {
        if (bio === 'basalt_deltas') id = n.e.n3(wx / 14, y / 10, wz / 14) > -0.15 ? B.basalt : B.blackstone;
        else id = B.netherrack;
      } else id = y <= 31 ? B.lava : 0;
      b[idx3(x, y, z)] = id;
    }
  }
  netherSurface(world, ch, n);
  netherOres(world, ch);
  netherFeatures(world, ch);
  netherDrawFortresses(world, ch);
};

// 地表：菌岩、灵魂沙/灵魂土、沙砾、三角洲熔岩池、植物与藤蔓
function netherSurface(world, ch, n) {
  const b = ch.blocks, bx = ch.cx * 16, bz = ch.cz * 16, seed = world.seed;
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const wx = bx + x, wz = bz + z, bio = ch.biome[z * 16 + x];
    for (let y = CH - 6; y > 5; y--) {
      const i = idx3(x, y, z), id = b[i];
      if (!id || id === B.lava || id === B.bedrock) continue;
      const above = b[idx3(x, y + 1, z)], below = b[idx3(x, y - 1, z)];
      const r = rand3(seed, wx, y, wz), r2 = rand3(seed + 7, wx, y, wz);
      if (above === 0) {
        // 地面
        if (bio === 'crimson_forest' || bio === 'warped_forest') {
          b[i] = bio === 'crimson_forest' ? B.crimson_nylium : B.warped_nylium;
          if (bio === 'crimson_forest') {
            if (r < 0.08) b[idx3(x, y + 1, z)] = B.crimson_roots;
            else if (r < 0.095) b[idx3(x, y + 1, z)] = B.crimson_fungus;
            else if (r < 0.1) b[idx3(x, y + 1, z)] = B.warped_fungus;
          } else {
            if (r < 0.06) b[idx3(x, y + 1, z)] = B.warped_roots;
            else if (r < 0.12) b[idx3(x, y + 1, z)] = B.nether_sprouts;
            else if (r < 0.135) b[idx3(x, y + 1, z)] = B.warped_fungus;
            else if (r < 0.15) {
              const len = 1 + Math.floor(r2 * 6);
              for (let k = 1; k <= len && b[idx3(x, y + k, z)] === 0 && y + k < CH - 5; k++) b[idx3(x, y + k, z)] = B.twisting_vines;
            }
          }
        } else if (bio === 'soul_sand_valley') {
          const sv = n.e.n2(wx / 9, wz / 9) > 0 ? B.soul_sand : B.soul_soil;
          b[i] = sv;
          if (below !== 0 && below !== B.lava && below !== B.bedrock) b[idx3(x, y - 1, z)] = sv;
          if (r < 0.004 && y < CH - 7) b[idx3(x, y + 1, z)] = B.soul_fire;
        } else if (bio === 'nether_wastes') {
          if (y >= 30 && y <= 35) { const g = n.e.n2(wx / 7, wz / 7); if (g > 0.35) b[i] = B.gravel; else if (g < -0.45) b[i] = B.soul_sand; }
          if (b[i] === B.netherrack && r < 0.0025) b[idx3(x, y + 1, z)] = B.fire;
        } else if (bio === 'basalt_deltas') {
          // 三角洲：被实心方块围住的地面凹坑成为熔岩池，周围是岩浆块
          if (x > 0 && x < 15 && z > 0 && z < 15 && n.e.n2(wx / 5, wz / 5) > 0.42) {
            let enclosed = true;
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nid = b[idx3(x + dx, y, z + dz)]; if (!nid) enclosed = false; }
            if (enclosed && below) { b[i] = B.lava; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (b[idx3(x + dx, y, z + dz)] !== B.lava && rand3(seed, wx + dx, y, wz + dz) < 0.5) b[idx3(x + dx, y, z + dz)] = B.magma_block; }
          } else if (r < 0.025) {
            const len = 1 + Math.floor(r2 * 5);
            for (let k = 1; k <= len && b[idx3(x, y + k, z)] === 0 && y + k < CH - 5; k++) b[idx3(x, y + k, z)] = B.basalt;
          }
        }
      } else if (below === 0 && (id === B.netherrack || id === B.basalt || id === B.blackstone)) {
        // 天花板
        if (bio === 'crimson_forest' && r < 0.05) {
          const len = 1 + Math.floor(r2 * 5);
          for (let k = 1; k <= len && b[idx3(x, y - k, z)] === 0; k++) b[idx3(x, y - k, z)] = B.weeping_vines;
        } else if (bio === 'basalt_deltas' && r < 0.03) {
          const len = 1 + Math.floor(r2 * 4);
          for (let k = 1; k <= len && b[idx3(x, y - k, z)] === 0; k++) b[idx3(x, y - k, z)] = B.basalt;
        }
      }
    }
  }
}

function netherOres(world, ch) {
  const r = mulberry32(hash3(world.seed, ch.cx, 9191, ch.cz)), b = ch.blocks;
  const stone = new Set([B.netherrack, B.basalt, B.blackstone]);
  const bio = ch.biome[8 * 16 + 8];
  const vein = (id, count, size, y0, y1, only) => {
    for (let c = 0; c < count; c++) {
      let x = Math.floor(r() * 16), y = y0 + Math.floor(r() * (y1 - y0)), z = Math.floor(r() * 16);
      for (let s = 0; s < size; s++) {
        if (x >= 0 && x < 16 && z >= 0 && z < 16 && y > 4 && y < CH - 5) { const i = idx3(x, y, z); if ((only || stone).has(b[i])) b[i] = id; }
        const d = DIRS[Math.floor(r() * 6)]; x += d[0]; y += d[1]; z += d[2];
      }
    }
  };
  const rack = new Set([B.netherrack]);
  vein(B.nether_quartz_ore, bio === 'basalt_deltas' ? 0 : 14, 10, 10, 117, rack);
  vein(B.nether_gold_ore, bio === 'basalt_deltas' ? 0 : 10, 8, 10, 117, rack);
  vein(B.magma_block, 4, 12, 26, 37, rack);
  if (bio === 'basalt_deltas') { vein(B.nether_gold_ore, 8, 6, 10, 117, new Set([B.blackstone])); vein(B.gilded_blackstone, 2, 4, 10, 117, new Set([B.blackstone])); }
  if (bio === 'soul_sand_valley') vein(B.soul_soil, 4, 14, 20, 100, rack);
  vein(B.gravel, 2, 16, 5, 41, rack);
  // 远古残骸：不暴露在空气中
  const debris = (y0, y1, size) => {
    let x = 1 + Math.floor(r() * 14), y = y0 + Math.floor(r() * (y1 - y0)), z = 1 + Math.floor(r() * 14);
    for (let s = 0; s < size; s++) {
      if (x > 0 && x < 15 && z > 0 && z < 15 && y > 5 && y < CH - 5 && stone.has(b[idx3(x, y, z)])) {
        let hidden = true;
        for (const d of DIRS) { const nid = b[idx3(x + d[0], y + d[1], z + d[2])]; if (!nid || nid === B.lava) { hidden = false; break; } }
        if (hidden) b[idx3(x, y, z)] = B.ancient_debris;
      }
      const d = DIRS[Math.floor(r() * 6)]; x += d[0]; y += d[1]; z += d[2];
    }
  };
  debris(8, 23, 1 + Math.floor(r() * 3));
  if (r() < 0.5) debris(8, 119, 1 + Math.floor(r() * 2));
}

// 荧石簇、巨型菌、骨块化石、废弃传送门遗迹由区块内随机数决定，均限制在区块内部
function netherFeatures(world, ch) {
  const r = mulberry32(hash3(world.seed, ch.cx, 4848, ch.cz)), b = ch.blocks, bx = ch.cx * 16, bz = ch.cz * 16;
  const bio = ch.biome[8 * 16 + 8];
  const inC = (x, y, z) => x >= 0 && x < 16 && z >= 0 && z < 16 && y > 0 && y < CH - 1;
  // 荧石：挂在天花板下
  const glowN = bio === 'nether_wastes' ? 9 : bio === 'basalt_deltas' ? 2 : 5;
  for (let k = 0; k < glowN; k++) {
    const x = 2 + Math.floor(r() * 12), z = 2 + Math.floor(r() * 12);
    let y = 40 + Math.floor(r() * 70);
    let found = false;
    for (let s = 0; s < 40 && y < CH - 6; s++, y++) { if (b[idx3(x, y, z)] === 0 && b[idx3(x, y + 1, z)] === B.netherrack) { found = true; break; } }
    if (!found) continue;
    b[idx3(x, y, z)] = B.glowstone;
    for (let i = 0; i < 60; i++) {
      const gx = x + Math.floor(r() * 5) - 2, gy = y - Math.floor(r() * 6), gz = z + Math.floor(r() * 5) - 2;
      if (!inC(gx, gy, gz) || b[idx3(gx, gy, gz)] !== 0) continue;
      let adj = 0;
      for (const d of DIRS) { const nx = gx + d[0], ny = gy + d[1], nz = gz + d[2]; if (inC(nx, ny, nz) && b[idx3(nx, ny, nz)] === B.glowstone) adj++; }
      if (adj === 1) b[idx3(gx, gy, gz)] = B.glowstone;
    }
  }
  // 巨型菌
  if (bio === 'crimson_forest' || bio === 'warped_forest') {
    const type = bio === 'crimson_forest' ? 'crimson' : 'warped', NY = B[type + '_nylium'];
    for (let k = 0; k < 9; k++) {
      const x = 3 + Math.floor(r() * 10), z = 3 + Math.floor(r() * 10);
      if (ch.biome[z * 16 + x] !== bio) continue;
      const floors = [];
      for (let y = 32; y < CH - 16; y++) if (b[idx3(x, y, z)] === NY && (b[idx3(x, y + 1, z)] === 0 || BLOCKS[b[idx3(x, y + 1, z)]].plant)) floors.push(y);
      if (!floors.length) continue;
      const y0 = floors[Math.floor(r() * floors.length)] + 1;
      const set = (wx, wy, wz, id) => { const lx = wx - bx, lz = wz - bz; if (!inC(lx, wy, lz)) return; const i = idx3(lx, wy, lz), c = b[i]; if (c === 0 || BLOCKS[c].replaceable || BLOCKS[c].plant) b[i] = id; };
      const get = (wx, wy, wz) => { const lx = wx - bx, lz = wz - bz; if (!inC(lx, wy, lz)) return B.netherrack; const c = b[idx3(lx, wy, lz)]; return BLOCKS[c].plant ? 0 : c; };
      netherHugeFungus(set, get, bx + x, y0, bz + z, type, r);
    }
  }
  // 灵魂沙峡谷：骨块化石
  if (bio === 'soul_sand_valley' && r() < 0.18) {
    const x = 4 + Math.floor(r() * 8), z = 4 + Math.floor(r() * 8);
    let y = 34;
    while (y < CH - 20 && !(b[idx3(x, y, z)] !== 0 && b[idx3(x, y + 1, z)] === 0)) y++;
    if (y < CH - 20) {
      const len = 5 + Math.floor(r() * 5), alongX = r() < 0.5;
      for (let i = 0; i < len; i++) {
        const sx = alongX ? x - 2 + i : x, sz = alongX ? z : z - 2 + i;
        if (!inC(sx, y + 3, sz)) continue;
        b[idx3(sx, y + 3, sz)] = B.bone_block;
        if (i % 2 === 0) for (let k = 0; k <= 3; k++) for (const s of [-2, 2]) {
          const rx = alongX ? sx : sx + s, rz = alongX ? sz + s : sz, ry = y + 3 - (k === 3 ? 1 : 0) - (Math.abs(s) === 2 && k > 1 ? k - 1 : 0);
          if (inC(rx, ry, rz) && b[idx3(rx, ry, rz)] === 0) b[idx3(rx, ry, rz)] = B.bone_block;
        }
      }
    }
  }
}

// ---------------- 下界要塞 ----------------
const FORT_REGION = 384, FORT_SPACING = 18;
function netherFortress(w, rx, rz) {
  if (!w._fort) w._fort = new Map();
  const key = rx + ',' + rz;
  if (w._fort.has(key)) return w._fort.get(key);
  const r = mulberry32(hash3(w.seed, rx, 5150, rz));
  const fx = rx * FORT_REGION + 100 + Math.floor(r() * 184), fz = rz * FORT_REGION + 100 + Math.floor(r() * 184);
  const fy = 58 + Math.floor(r() * 14);
  const nodes = new Map(), edges = [];
  const node = (i, j) => { const k = i + ',' + j; if (!nodes.has(k)) nodes.set(k, { i, j, x: fx + i * FORT_SPACING, z: fz + j * FORT_SPACING, dirs: new Set(), type: 'junction', half: 3 }); return nodes.get(k); };
  node(0, 0);
  const D = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const target = 10 + Math.floor(r() * 6);
  for (let guard = 0; edges.length < target && guard < 500; guard++) {
    const list = [...nodes.values()], a = list[Math.floor(r() * list.length)];
    if (a.dirs.size >= 3 && r() < 0.8) continue;
    const d = Math.floor(r() * 4), ni = a.i + D[d][0], nj = a.j + D[d][1];
    if (Math.abs(ni) > 3 || Math.abs(nj) > 3 || a.dirs.has(d)) continue;
    const c = node(ni, nj);
    a.dirs.add(d); c.dirs.add(d ^ 1);
    edges.push({ a, b: c, d, type: r() < 0.35 ? 'corridor' : 'bridge', chest: r() < 0.5 });
  }
  const list = [...nodes.values()];
  const center = nodes.get('0,0'); center.type = 'blaze'; center.half = 5;
  const others = list.filter(nd => nd !== center);
  if (others.length) { const wn = others[Math.floor(r() * others.length)]; wn.type = 'wart'; wn.half = 4; }
  for (const nd of others) if (nd.type === 'junction' && nd.dirs.size === 1 && r() < 0.5) { nd.type = 'blaze'; nd.half = 4; }
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const nd of list) { x0 = Math.min(x0, nd.x - nd.half - 1); x1 = Math.max(x1, nd.x + nd.half + 1); z0 = Math.min(z0, nd.z - nd.half - 1); z1 = Math.max(z1, nd.z + nd.half + 1); }
  const f = { x: fx, y: fy, z: fz, nodes: list, edges, box: [x0, x1, z0, z1], seed: hash3(w.seed, rx, 5151, rz) };
  w._fort.set(key, f);
  return f;
}
function netherFortressNear(w, x, z) {
  const rx = Math.floor(x / FORT_REGION), rz = Math.floor(z / FORT_REGION);
  let best = null, bd = 1e18;
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
    const f = netherFortress(w, rx + dx, rz + dz), d = (f.x - x) * (f.x - x) + (f.z - z) * (f.z - z);
    if (d < bd) { bd = d; best = f; }
  }
  return best;
}
// 返回点是否在要塞范围内（含一定余量）
function netherInFortress(w, x, y, z, pad) {
  const f = netherFortress(w, Math.floor(x / FORT_REGION), Math.floor(z / FORT_REGION));
  pad = pad || 0;
  return x >= f.box[0] - pad && x <= f.box[1] + pad && z >= f.box[2] - pad && z <= f.box[3] + pad && Math.abs(y - f.y) < 14 + pad ? f : null;
}
function netherDrawFortresses(w, ch) {
  const bx = ch.cx * 16, bz = ch.cz * 16;
  const f = netherFortress(w, Math.floor((bx + 8) / FORT_REGION), Math.floor((bz + 8) / FORT_REGION));
  if (f.box[0] > bx + 15 || f.box[1] < bx || f.box[2] > bz + 15 || f.box[3] < bz) return;
  const b = ch.blocks, m = ch.meta, BR = B.nether_bricks, FE = B.nether_brick_fence;
  const set = (x, y, z, id, mt) => { const lx = x - bx, lz = z - bz; if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || y < 1 || y > CH - 2) return; const i = idx3(lx, y, lz); b[i] = id; m[i] = mt || 0; };
  const get = (x, y, z) => { const lx = x - bx, lz = z - bz; if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || y < 0 || y >= CH) return -1; return b[idx3(lx, y, lz)]; };
  const inChunk = (x, z) => x >= bx && x < bx + 16 && z >= bz && z < bz + 16;
  // 支柱一直向下延伸到实心地面（只处理本区块内的列）
  const pillar = (x, z, yTop) => {
    if (!inChunk(x, z)) return;
    for (let y = yTop; y > 4; y--) { const c = get(x, y, z); if (c > 0 && c !== B.lava && BLOCKS[c].solid && c !== BR) break; set(x, y, z, BR); }
  };
  const Y = f.y;
  const chest = (x, y, z, rr) => {
    if (!inChunk(x, z)) return;
    set(x, y, z, B.chest, 0);
    const k = x + ',' + y + ',' + z;
    if (w.tiles.has(k)) return;
    const loot = [['diamond', 1, 3, 5], ['iron_ingot', 1, 5, 5], ['gold_ingot', 1, 3, 15], ['golden_sword', 1, 1, 5], ['golden_chestplate', 1, 1, 5], ['flint_and_steel', 1, 1, 5],
      ['nether_wart', 3, 7, 5], ['saddle', 1, 1, 10], ['golden_horse_armor', 1, 1, 8], ['iron_horse_armor', 1, 1, 5], ['diamond_horse_armor', 1, 1, 3], ['obsidian', 2, 4, 2]].filter(e => ITEMS[e[0]]);
    const tw = loot.reduce((a, e) => a + e[3], 0), items = new Array(27).fill(null);
    const n = 2 + Math.floor(rr() * 4);
    for (let i = 0; i < n; i++) {
      let t = rr() * tw, e = loot[0];
      for (const q of loot) { t -= q[3]; if (t <= 0) { e = q; break; } }
      items[Math.floor(rr() * 27)] = { id: e[0], n: e[1] + Math.floor(rr() * (e[2] - e[1] + 1)) };
    }
    w.tiles.set(k, { type: 'chest', items });
  };
  for (const e of f.edges) {
    const a = e.a, c = e.b, alongX = e.d < 2;
    const lo = alongX ? Math.min(a.x, c.x) : Math.min(a.z, c.z), hi = alongX ? Math.max(a.x, c.x) : Math.max(a.z, c.z);
    const loN = (alongX ? a.x : a.z) === lo ? a : c, hiN = loN === a ? c : a;
    const s0 = lo + loN.half + 1, s1 = hi - hiN.half - 1, perp = alongX ? a.z : a.x;
    const P = (s, k) => alongX ? [s, perp + k] : [perp + k, s];
    for (let s = s0; s <= s1; s++) for (let k = -2; k <= 2; k++) {
      const [x, z] = P(s, k);
      if (!inChunk(x, z)) continue;
      const edgeK = Math.abs(k) === 2;
      for (let y = Y + 1; y <= Y + 5; y++) set(x, y, z, 0);
      set(x, Y, z, BR); set(x, Y - 1, z, BR);
      if (e.type === 'bridge') { if (edgeK) set(x, Y + 1, z, FE); }
      else {
        if (edgeK) { set(x, Y + 1, z, BR); set(x, Y + 2, z, (s % 3 === 0) ? FE : BR); set(x, Y + 3, z, BR); }
        set(x, Y + 4, z, BR);
      }
      // 拱与桥墩：每 9 格一组
      const ph = ((s - (alongX ? f.x : f.z)) % 9 + 9) % 9, dd = Math.min(ph, 9 - ph);
      if (dd === 0) pillar(x, z, Y - 2);
      else if (dd <= 2) for (let y = Y - 2; y >= Y - 1 - (3 - dd); y--) set(x, y, z, BR);
    }
    if (e.type === 'corridor' && e.chest) {
      const s = Math.floor((s0 + s1) / 2), [x, z] = P(s, 1);
      chest(x, Y + 1, z, mulberry32(hash3(f.seed, x, Y, z)));
    }
  }
  for (const nd of f.nodes) {
    const h = nd.half;
    if (nd.x + h < bx || nd.x - h > bx + 15 || nd.z + h < bz || nd.z - h > bz + 15) continue;
    const open = (dx, dz, wide) => {
      if (dx === h && Math.abs(dz) <= wide && nd.dirs.has(0)) return true;
      if (dx === -h && Math.abs(dz) <= wide && nd.dirs.has(1)) return true;
      if (dz === h && Math.abs(dx) <= wide && nd.dirs.has(2)) return true;
      if (dz === -h && Math.abs(dx) <= wide && nd.dirs.has(3)) return true;
      return false;
    };
    const top = nd.type === 'wart' ? Y + 5 : Y + 6;
    for (let dx = -h; dx <= h; dx++) for (let dz = -h; dz <= h; dz++) {
      const x = nd.x + dx, z = nd.z + dz;
      if (!inChunk(x, z)) continue;
      const rim = Math.abs(dx) === h || Math.abs(dz) === h;
      for (let y = Y + 1; y <= top; y++) set(x, y, z, 0);
      set(x, Y, z, BR); set(x, Y - 1, z, BR);
      if (nd.type === 'wart') {
        if (rim) { for (let y = Y + 1; y <= Y + 4; y++) set(x, y, z, open(dx, dz, 1) && y <= Y + 3 ? 0 : (y === Y + 2 && (dx + dz) % 2 === 0 ? FE : BR)); }
        set(x, Y + 5, z, BR);
        if (Math.abs(dz) === 2 && Math.abs(dx) <= 2) { set(x, Y, z, B.soul_sand); set(x, Y + 1, z, B.nether_wart, Math.floor(rand3(f.seed, x, Y, z) * 4)); }
      } else {
        if (rim && !open(dx, dz, 2)) set(x, Y + 1, z, FE);
        if (nd.type === 'blaze' && Math.abs(dx) <= 1 && Math.abs(dz) <= 1) { set(x, Y + 1, z, BR); if (Math.abs(dx) === 1 && Math.abs(dz) === 1) set(x, Y + 2, z, FE); }
      }
      if ((Math.abs(dx) <= 1 && Math.abs(dz) <= 1) || (Math.abs(dx) === h && Math.abs(dz) === h)) pillar(x, z, Y - 2);
    }
    if (nd.type === 'wart') chest(nd.x + h - 1, Y + 1, nd.z + h - 1, mulberry32(hash3(f.seed, nd.x, Y, nd.z)));
  }
}

// ---------------- 主世界：废弃传送门 ----------------
FEATURES.push({
  name: 'nether_gen',
  genChunk(world, ch, cols) {
    const r = mulberry32(hash3(world.seed, ch.cx, 8080, ch.cz));
    if (r() > 1 / 70) return;
    const ci = cols[(8 + 1) * 18 + 8 + 1];
    if (ci.h < SEA || ci.h > CH - 12 || ci.biome === 'ocean' || ci.biome === 'frozen_ocean') return;
    const b = ch.blocks, y0 = ci.h + 1, axisX = r() < 0.5;
    const surf = (x, z) => { for (let y = Math.min(CH - 2, y0 + 6); y > 1; y--) { const id = b[idx3(x, y, z)]; if (id && BLOCKS[id].solid && !BLOCKS[id].leaves) return y; } return -1; };
    // 地面：下界岩与岩浆块斑块
    for (let x = 2; x <= 13; x++) for (let z = 2; z <= 13; z++) {
      const d = Math.hypot(x - 7.5, z - 7.5);
      if (d > 5.5 + r() * 1.5) continue;
      const sy = surf(x, z); if (sy < 0) continue;
      if (r() < 0.75) b[idx3(x, sy, z)] = r() < 0.12 ? B.magma_block : B.netherrack;
      for (let y = sy + 1; y < sy + 5 && y < CH - 1; y++) { const id = b[idx3(x, y, z)]; if (id && (BLOCKS[id].plant || BLOCKS[id].replaceable) && !isLiquid(id)) b[idx3(x, y, z)] = 0; }
    }
    // 残缺的传送门框
    const fx = 6, fz = 7;
    const fy = Math.max(surf(fx + 1, fz), surf(fx + 2, fz)) + 1;
    const frame = [];
    for (let i = 0; i < 4; i++) { frame.push([i, -1]); frame.push([i, 3]); }
    for (let j = 0; j < 3; j++) { frame.push([0, j]); frame.push([3, j]); }
    for (const [i, j] of frame) {
      const x = axisX ? fx + i : fx + 1, z = axisX ? fz : fz - 1 + i, y = fy + j;
      if (y < 1 || y >= CH - 1) continue;
      const q = r();
      if (q < 0.18) continue;
      b[idx3(x, y, z)] = q < 0.32 ? B.crying_obsidian : B.obsidian;
    }
    for (let i = 0; i < 4; i++) {
      const x = 3 + Math.floor(r() * 10), z = 3 + Math.floor(r() * 10), sy = surf(x, z);
      if (sy > 0 && b[idx3(x, sy + 1, z)] === 0) b[idx3(x, sy + 1, z)] = r() < 0.3 ? B.crying_obsidian : B.obsidian;
    }
    // 战利品箱
    const cx = axisX ? fx + 5 : fx + 3, cz = axisX ? fz + 2 : fz + 4, cy = surf(cx, cz) + 1;
    if (cy < 2 || cy >= CH - 1) return;
    b[idx3(cx, cy, cz)] = B.chest; ch.meta[idx3(cx, cy, cz)] = 0;
    const loot = [['obsidian', 1, 2, 40], ['flint', 1, 4, 40], ['iron_nugget', 9, 18, 40], ['flint_and_steel', 1, 1, 40], ['fire_charge', 1, 1, 40], ['golden_apple', 1, 1, 15],
      ['gold_nugget', 4, 24, 15], ['golden_sword', 1, 1, 15], ['golden_axe', 1, 1, 15], ['golden_hoe', 1, 1, 15], ['golden_shovel', 1, 1, 15], ['golden_pickaxe', 1, 1, 15],
      ['golden_boots', 1, 1, 15], ['golden_chestplate', 1, 1, 15], ['golden_helmet', 1, 1, 15], ['golden_leggings', 1, 1, 15], ['glistering_melon_slice', 4, 12, 5],
      ['golden_carrot', 4, 12, 5], ['gold_ingot', 2, 8, 5], ['clock', 1, 1, 5], ['bell', 1, 1, 1], ['enchanted_golden_apple', 1, 1, 1], ['gold_block', 1, 2, 1]].filter(e => ITEMS[e[0]]);
    const tw = loot.reduce((a, e) => a + e[3], 0), items = new Array(27).fill(null), n = 4 + Math.floor(r() * 5);
    for (let i = 0; i < n; i++) {
      let t = r() * tw, e = loot[0];
      for (const q of loot) { t -= q[3]; if (t <= 0) { e = q; break; } }
      items[Math.floor(r() * 27)] = { id: e[0], n: e[1] + Math.floor(r() * (e[2] - e[1] + 1)) };
    }
    const k = (ch.cx * 16 + cx) + ',' + cy + ',' + (ch.cz * 16 + cz);
    if (!world.tiles.has(k)) world.tiles.set(k, { type: 'chest', items });
  },
});

// 命令：查找要塞
COMMANDS.locatefortress = (a, ui, g) => {
  const p = g.player, inN = g.world.dim === 'nether';
  if (g.world.dim !== 'nether' && g.world.dim !== 'overworld') { ui.chat('错误：只能在下界或主世界使用'); return; }
  const nw = g.getDim('nether');
  const x = inN ? p.pos.x : p.pos.x / 8, z = inN ? p.pos.z : p.pos.z / 8;
  const f = netherFortressNear(nw, x, z);
  const d = Math.round(Math.hypot(f.x - x, f.z - z));
  ui.chat(`最近的下界要塞位于下界坐标 [${f.x}, ${f.y}, ${f.z}]（距离 ${d} 格）` + (inN ? '' : `，对应主世界约 [${f.x * 8}, ~, ${f.z * 8}]`));
};
COMMANDS.locate_fortress = COMMANDS.locatefortress;
COMMANDS.locatenether = (a, ui, g) => {
  const t = a[1];
  if (!NETHER_BIOME_PTS.some(e => e[0] === t)) { ui.chat('错误：可用群系：' + NETHER_BIOME_PTS.map(e => e[0]).join(', ')); return; }
  const nw = g.getDim('nether'), p = g.player, inN = g.world.dim === 'nether';
  const ox = inN ? p.pos.x : p.pos.x / 8, oz = inN ? p.pos.z : p.pos.z / 8;
  for (let r = 0; r <= 3000; r += 16) {
    const n = Math.max(1, Math.floor(2 * Math.PI * r / 16));
    for (let i = 0; i < n; i++) {
      const ang = i / n * Math.PI * 2, x = Math.round(ox + Math.cos(ang) * r), z = Math.round(oz + Math.sin(ang) * r);
      if (netherBiomeAt(nw, x, z) === t) { ui.chat(`最近的${BIOMES[t].zh}位于下界坐标 [${x}, ~, ${z}]（距离 ${r} 格）`); return; }
    }
  }
  ui.chat('错误：3000 格内未找到');
};
