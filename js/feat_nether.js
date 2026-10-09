'use strict';
// ---------- 下界：方块/物品/配方、火、下界传送门、杂项交互 ----------
// 地形与结构见 feat_nether_gen.js，生物与投射物见 feat_nether_mobs.js

const NETHER = {
  reg: { wid: null, portals: {} },   // 已点亮的传送门登记（按世界 id 区分）
  portalT: 0, portalCd: false,       // 玩家站在传送门里的计时 / 需离开后才能再次触发
  wasAlive: true, prevPos: null, fogCur: null, partT: 0,
};

// 群系（只用于名称与着色回退）
Object.assign(BIOMES, {
  nether_wastes: { zh: '下界荒地', grass: [191, 183, 85], foliage: [174, 164, 42], nether: true },
  crimson_forest: { zh: '绯红森林', grass: [191, 183, 85], foliage: [174, 164, 42], nether: true },
  warped_forest: { zh: '诡异森林', grass: [191, 183, 85], foliage: [174, 164, 42], nether: true },
  soul_sand_valley: { zh: '灵魂沙峡谷', grass: [191, 183, 85], foliage: [174, 164, 42], nether: true },
  basalt_deltas: { zh: '玄武岩三角洲', grass: [191, 183, 85], foliage: [174, 164, 42], nether: true },
});

// 合成纹理（菌岩侧面 = 下界岩 + 覆盖层；传送门半透明动画）
PACK_MAP.crimson_nylium_side = { layers: [{ src: 'mcl_nether_netherrack' }, { src: 'mcl_crimson_crimson_nylium_side' }] };
PACK_MAP.warped_nylium_side = { layers: [{ src: 'mcl_nether_netherrack' }, { src: 'mcl_crimson_warped_nylium_side' }] };
PACK_MAP.nether_portal_anim = { src: 'mcl_portals_portal', anim: 2, alpha: 190 };

// 音效
Object.assign(SND_MAP, {
  ignite: 'fire_flint_and_steel', extinguish: 'fire_extinguish_flame',
  'zombified_piglin.death': 'mobs_mc_zombiepig_death', 'zombified_piglin.angry': 'mobs_mc_zombiepig_war_cry',
  'piglin.say': 'mobs_mc_zombiepig_random', 'piglin.hurt': 'mobs_mc_zombiepig_hurt', 'piglin.death': 'mobs_mc_zombiepig_death', 'piglin.angry': 'mobs_mc_zombiepig_war_cry',
  'ghast.hurt': 'mobs_eerie', 'ghast.death': 'mobs_eerie', 'ghast.charge': 'mobs_eerie',
  'blaze.shoot': 'mobs_fireball',
  'magma_cube.say': 'mobs_mc_magma_cube_small', 'magma_cube.death': 'mobs_mc_magma_cube_big', 'magma_cube.attack': 'mobs_mc_magma_cube_attack',
  'wither_skeleton.say': 'mobs_mc_skeleton_random', 'wither_skeleton.hurt': 'mobs_mc_skeleton_hurt', 'wither_skeleton.death': 'mobs_mc_skeleton_death',
});

// ---------------- 工具函数 ----------------
const NETHER_PLANTS = ['crimson_fungus', 'warped_fungus', 'crimson_roots', 'warped_roots', 'nether_sprouts'];
function netherRegistry(g) {
  const wid = g.worldMeta ? g.worldMeta.id : null;
  if (NETHER.reg.wid !== wid) NETHER.reg = { wid, portals: {} };
  return NETHER.reg;
}
function netherPlantGround(id) {
  return id === B.crimson_nylium || id === B.warped_nylium || id === B.soul_soil || id === B.grass_block || id === B.dirt
    || id === B.moss_block || id === B.farmland || id === B.snowy_grass || (B.podzol !== undefined && id === B.podzol) || (B.mycelium !== undefined && id === B.mycelium)
    || (B.coarse_dirt !== undefined && id === B.coarse_dirt);
}
// 可燃性：[引燃系数, 烧毁系数]，0 表示不可燃
function netherFlammable(id) {
  if (!id) return null;
  const d = BLOCKS[id];
  if (!d || /crimson|warped/.test(d.name) || isLiquid(id) || d.tool === 'pickaxe') return null;
  if (id === B.tnt) return [15, 100];
  if (d.leaves) return [30, 60];
  if (/_wool$|carpet/.test(d.name)) return [30, 60];
  if (/hay_block|dried_kelp/.test(d.name)) return [60, 20];
  if (/vine/.test(d.name)) return [15, 100];
  if (d.plant && d.replaceable) return [60, 100];
  if (/bookshelf|lectern/.test(d.name)) return [30, 20];
  if (/_log$|_planks$|_stairs$|_slab$|fence|_wood$|cushion|_bed$|scaffold|beehive|composter|barrel|cartography|fletching|loom/.test(d.name) && d.tool !== null && !d.interact) return [5, 20];
  if (d.fuel && !d.interact && d.tool === 'axe') return [5, 20];
  return null;
}
function netherCanFire(w, x, y, z) {
  const cur = w.getBlock(x, y, z);
  if (cur !== 0 && !(BLOCKS[cur].replaceable && !isLiquid(cur) && cur !== B.fire && cur !== B.soul_fire)) return false;
  const below = w.getBlock(x, y - 1, z);
  if (BLOCKS[below].solid && !isLiquid(below)) return true;
  for (const d of DIRS) if (netherFlammable(w.getBlock(x + d[0], y + d[1], z + d[2]))) return true;
  return false;
}
// 放火：若位于黑曜石框内则点亮传送门
function netherPlaceFire(w, x, y, z) {
  if (B.nether_portal !== undefined && (w.dim === 'overworld' || w.dim === 'nether') && netherLightPortal(w, x, y, z)) return 'portal';
  if (!netherCanFire(w, x, y, z)) return null;
  const below = w.getBlock(x, y - 1, z);
  const soul = below === B.soul_sand || below === B.soul_soil;
  w.setBlock(x, y, z, soul ? B.soul_fire : B.fire, 0);
  w.schedule(x, y, z, 20 + Math.floor(Math.random() * 10));
  return 'fire';
}

// ---------------- 下界传送门 ----------------
function netherFindFrame(w, x, y, z, axis) {
  const ax = axis === 0 ? 1 : 0, az = axis === 0 ? 0 : 1, OB = B.obsidian;
  const g = (xx, yy, zz) => w.getBlock(xx, yy, zz);
  const isIn = id => id === 0 || id === B.fire;
  if (!isIn(g(x, y, z))) return null;
  let by = y;
  while (by > 1 && y - by < 21 && isIn(g(x, by - 1, z))) by--;
  if (g(x, by - 1, z) !== OB) return null;
  let lx = x, lz = z, n = 0;
  while (n < 21 && isIn(g(lx - ax, by, lz - az))) { lx -= ax; lz -= az; n++; }
  if (g(lx - ax, by, lz - az) !== OB) return null;
  let wd = 0;
  while (wd < 22 && isIn(g(lx + ax * wd, by, lz + az * wd)) && g(lx + ax * wd, by - 1, lz + az * wd) === OB) wd++;
  if (wd < 2 || wd > 21 || g(lx + ax * wd, by, lz + az * wd) !== OB) return null;
  let h = 0;
  for (; h < 22; h++) {
    let full = true;
    for (let i = 0; i < wd; i++) if (!isIn(g(lx + ax * i, by + h, lz + az * i))) { full = false; break; }
    if (!full) break;
    if (g(lx - ax, by + h, lz - az) !== OB || g(lx + ax * wd, by + h, lz + az * wd) !== OB) return null;
  }
  if (h < 3 || h > 21 || y >= by + h) return null;
  for (let i = 0; i < wd; i++) if (g(lx + ax * i, by + h, lz + az * i) !== OB) return null;
  return { x: lx, y: by, z: lz, axis, w: wd, h };
}
function netherFillPortal(w, f) {
  const ax = f.axis === 0 ? 1 : 0, az = f.axis === 0 ? 0 : 1;
  for (let i = 0; i < f.w; i++) for (let j = 0; j < f.h; j++) w.setBlock(f.x + ax * i, f.y + j, f.z + az * i, B.nether_portal, f.axis, { noUpdate: true });
}
function netherLightPortal(w, x, y, z) {
  for (const axis of [0, 1]) {
    const f = netherFindFrame(w, x, y, z, axis);
    if (f) {
      netherFillPortal(w, f);
      const reg = netherRegistry(game);
      (reg.portals[w.dim] || (reg.portals[w.dim] = [])).push({ x: f.x, y: f.y, z: f.z, axis: f.axis, w: f.w, h: f.h });
      game.audio.sfx('portal', new THREE.Vector3(x, y, z), 0.6, 1.4);
      return f;
    }
  }
  return null;
}
function netherPortalValid(w, x, y, z, meta) {
  const dirs = meta === 1 ? [[0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]] : [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]];
  for (const d of dirs) {
    const nx = x + d[0], ny = y + d[1], nz = z + d[2];
    if (!w.isLoaded(nx, nz)) continue;
    const id = w.getBlock(nx, ny, nz);
    if (id === B.obsidian) continue;
    if (id === B.nether_portal && w.getMeta(nx, ny, nz) === meta) continue;
    return false;
  }
  return true;
}
function netherLoadAround(w, x, z, r) {
  const cx = Math.floor(x) >> 4, cz = Math.floor(z) >> 4;
  for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) if (!w.getChunk(cx + dx, cz + dz)) w.generateChunk(cx + dx, cz + dz, true);
}
// 目标维度中找一个能放 4x5 框的位置；找不到则强制开辟空间并垫黑曜石平台
function netherBuildPortal(w, tx, ty, tz) {
  const nether = w.dim === 'nether';
  const yTop = nether ? 116 : CH - 8, yBot = nether ? 33 : 2;
  const fits = (x, y, z, axis) => {
    const ax = axis === 0 ? 1 : 0, az = axis === 0 ? 0 : 1, px = az, pz = ax;
    for (let i = 0; i < 4; i++) for (let k = -1; k <= 1; k++) {
      const bx = x + ax * i + px * k, bz = z + az * i + pz * k;
      const fl = w.getBlock(bx, y - 1, bz), fd = BLOCKS[fl];
      if (!fd.solid || !fd.opaque || isLiquid(fl) || fd.leaves) return false;
      for (let j = 0; j < 4; j++) if (w.getBlock(bx, y + j, bz) !== 0) return false;
    }
    return true;
  };
  let spot = null;
  for (let r = 0; r <= 16 && !spot; r++) {
    for (let dx = -r; dx <= r && !spot; dx++) for (let dz = -r; dz <= r && !spot; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const x = tx + dx, z = tz + dz;
      // 从参考高度向两侧交替搜索，优先靠近原高度
      for (let k = 0; k < (yTop - yBot) * 2 && !spot; k++) {
        const y = ty + (k % 2 ? -((k + 1) >> 1) : (k >> 1));
        if (y < yBot || y > yTop) continue;
        if (w.getBlock(x, y, z) !== 0 || !BLOCKS[w.getBlock(x, y - 1, z)].solid) continue;
        for (const axis of [0, 1]) if (fits(x, y, z, axis)) { spot = [x, y, z, axis]; break; }
      }
    }
  }
  let forced = false;
  if (!spot) { spot = [tx, clamp(ty, yBot + 1, yTop - 1), tz, 0]; forced = true; }
  const [x, y, z, axis] = spot;
  const ax = axis === 0 ? 1 : 0, az = axis === 0 ? 0 : 1, px = az, pz = ax;
  const set = (i, j, k, id, m) => w.setBlock(x + ax * i + px * k, y + j, z + az * i + pz * k, id, m || 0, { noUpdate: true });
  if (forced) {
    for (let i = -1; i <= 4; i++) for (let k = -1; k <= 1; k++) for (let j = 0; j < 4; j++) set(i, j, k, 0);
    for (let i = 0; i < 4; i++) for (const k of [-1, 1]) { const id = w.getBlock(x + ax * i + px * k, y - 1, z + az * i + pz * k); if (!BLOCKS[id].solid || isLiquid(id)) set(i, -1, k, B.obsidian); }
  }
  for (let i = 0; i < 4; i++) { set(i, -1, 0, B.obsidian); set(i, 3, 0, B.obsidian); }
  for (let j = 0; j < 3; j++) { set(0, j, 0, B.obsidian); set(3, j, 0, B.obsidian); }
  const f = { x: x + ax, y, z: z + az, axis, w: 2, h: 3 };
  netherFillPortal(w, f);
  return f;
}
function netherTravel(g) {
  const p = g.player, from = g.world.dim;
  if (from !== 'overworld' && from !== 'nether') return;
  const to = from === 'overworld' ? 'nether' : 'overworld';
  const sc = to === 'nether' ? 1 / 8 : 8;
  const tx = Math.floor(p.pos.x * sc), tz = Math.floor(p.pos.z * sc);
  const reg = netherRegistry(g);
  g.changeDimension(to, tx + 0.5, 70, tz + 0.5);
  const w = g.world;
  // 1. 已登记的传送门（主世界 128 格、下界 16 格内）
  const rad = to === 'nether' ? 16 : 128;
  const list = (reg.portals[to] || []).slice().sort((a, b) => Math.hypot(a.x - tx, a.z - tz) - Math.hypot(b.x - tx, b.z - tz));
  let f = null;
  for (const c of list) {
    if (Math.max(Math.abs(c.x - tx), Math.abs(c.z - tz)) > rad) break;
    netherLoadAround(w, c.x, c.z, 1);
    if (w.getBlock(c.x, c.y, c.z) === B.nether_portal) { f = c; break; }
    reg.portals[to] = reg.portals[to].filter(e => e !== c);
  }
  // 2. 没有就新建
  if (!f) {
    netherLoadAround(w, tx, tz, 2);
    let ty;
    if (to === 'nether') ty = clamp(Math.floor(p.pos.y), 40, 100);
    else { ty = CH - 2; while (ty > 2 && (!BLOCKS[w.getBlock(tx, ty - 1, tz)].solid || BLOCKS[w.getBlock(tx, ty - 1, tz)].leaves)) ty--; }
    f = netherBuildPortal(w, tx, ty, tz);
    (reg.portals[to] || (reg.portals[to] = [])).push(f);
  }
  const ax = f.axis === 0 ? 1 : 0, az = f.axis === 0 ? 0 : 1;
  p.pos.set(f.x + (ax ? f.w / 2 : 0.5), f.y, f.z + (az ? f.w / 2 : 0.5));
  p.vel.set(0, 0, 0); p.fallDist = 0; p.flying = p.flying && p.mode !== 'survival';
  p.yaw = f.axis === 0 ? Math.PI : -Math.PI / 2;
  NETHER.portalCd = true; NETHER.portalT = 0; NETHER.prevPos = null;
}

// ---------------- 火 ----------------
function netherFireTick(w, x, y, z, id) {
  const below = w.getBlock(x, y - 1, z);
  if (id === B.soul_fire) {
    if (below !== B.soul_sand && below !== B.soul_soil) w.setBlock(x, y, z, 0);
    return;
  }
  const infinite = below === B.netherrack || below === B.magma_block || (w.dim === 'end' && below === B.bedrock);
  if (!infinite && !netherCanFireStay(w, x, y, z)) { w.setBlock(x, y, z, 0); return; }
  if (!infinite && game.isRaining() && w.dim === 'overworld' && w.skyLight(x, y, z) >= 15 && Math.random() < 0.6) {
    w.setBlock(x, y, z, 0); game.audio.sfx('extinguish', new THREE.Vector3(x, y, z), 0.5); return;
  }
  let age = w.getMeta(x, y, z);
  if (age < 15 && Math.random() < 0.5) { age = Math.min(15, age + 1 + Math.floor(Math.random() * 2)); w.setMeta(x, y, z, age); }
  if (!infinite) {
    let nearFuel = false;
    for (const d of DIRS) if (netherFlammable(w.getBlock(x + d[0], y + d[1], z + d[2]))) { nearFuel = true; break; }
    if (!nearFuel) { if (age > 3 || !BLOCKS[below].solid) { w.setBlock(x, y, z, 0); return; } }
    else if (age >= 15 && !netherFlammable(below) && Math.random() < 0.25) { w.setBlock(x, y, z, 0); return; }
  }
  // 烧毁相邻可燃物
  for (const d of DIRS) {
    const nx = x + d[0], ny = y + d[1], nz = z + d[2], nid = w.getBlock(nx, ny, nz), fl = netherFlammable(nid);
    if (!fl || Math.random() * 150 >= fl[1]) continue;
    if (nid === B.tnt) { w.setBlock(nx, ny, nz, 0); game.entities.push(new PrimedTNT(game, nx, ny, nz)); continue; }
    if (Math.random() < 0.6 && age < 15) w.setBlock(nx, ny, nz, B.fire, Math.min(15, age + 2));
    else w.setBlock(nx, ny, nz, 0);
    if (w.getBlock(nx, ny, nz) === B.fire) w.schedule(nx, ny, nz, 25 + Math.floor(Math.random() * 10));
  }
  // 向周围空气蔓延
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 4; dy++) {
    if (!dx && !dy && !dz) continue;
    const nx = x + dx, ny = y + dy, nz = z + dz;
    if (ny < 1 || ny >= CH - 1 || w.getBlock(nx, ny, nz) !== 0) continue;
    let enc = 0;
    for (const d of DIRS) { const fl = netherFlammable(w.getBlock(nx + d[0], ny + d[1], nz + d[2])); if (fl) enc = Math.max(enc, fl[0]); }
    if (!enc) continue;
    const ch = (enc + 40) / (age + 30) / 35 * (dy > 1 ? 0.4 : 1);
    if (Math.random() < ch) { w.setBlock(nx, ny, nz, B.fire, Math.min(15, age + Math.floor(Math.random() * 3))); w.schedule(nx, ny, nz, 25 + Math.floor(Math.random() * 10)); }
  }
  w.schedule(x, y, z, 30 + Math.floor(Math.random() * 10));
}
function netherCanFireStay(w, x, y, z) {
  const below = w.getBlock(x, y - 1, z);
  if (BLOCKS[below].solid && !isLiquid(below)) return true;
  for (const d of DIRS) if (netherFlammable(w.getBlock(x + d[0], y + d[1], z + d[2]))) return true;
  return false;
}
// 实体是否接触某类方块
function netherTouching(world, e, ids) {
  for (let x = Math.floor(e.pos.x - e.w); x <= Math.floor(e.pos.x + e.w); x++)
    for (let z = Math.floor(e.pos.z - e.w); z <= Math.floor(e.pos.z + e.w); z++)
      for (let y = Math.floor(e.pos.y); y <= Math.floor(e.pos.y + e.h - 0.01); y++) if (ids.includes(world.getBlock(x, y, z))) return true;
  return false;
}

// ---------------- 植物支撑判定 ----------------
function netherSupportOk(w, x, y, z, id) {
  const below = w.getBlock(x, y - 1, z), above = w.getBlock(x, y + 1, z);
  if (id === B.nether_wart) return below === B.soul_sand;
  if (id === B.weeping_vines) return above === B.weeping_vines || (BLOCKS[above].solid && BLOCKS[above].opaque);
  if (id === B.twisting_vines) return below === B.twisting_vines || (BLOCKS[below].solid && BLOCKS[below].opaque);
  if (id === B.crimson_roots || id === B.warped_roots || id === B.nether_sprouts || id === B.crimson_fungus || id === B.warped_fungus) return netherPlantGround(below);
  return true;
}
function netherIsPlant(id) {
  return id === B.nether_wart || id === B.weeping_vines || id === B.twisting_vines || id === B.crimson_roots || id === B.warped_roots
    || id === B.nether_sprouts || id === B.crimson_fungus || id === B.warped_fungus;
}

// ---------------- 巨型菌（生成器与骨粉共用） ----------------
// set(x,y,z,id) 只写可替换位置；get(x,y,z) 读取；返回是否成功
function netherHugeFungus(set, get, x0, y0, z0, type, r) {
  const crimson = type === 'crimson';
  const STEM = crimson ? B.crimson_stem : B.warped_stem, WART = crimson ? B.nether_wart_block : B.warped_wart_block;
  let h = 4 + Math.floor(r() * 9);
  if (r() < 0.06) h += 4;
  const free = id => id === 0 || (id > 0 && BLOCKS[id].replaceable && !isLiquid(id));
  let room = 0;
  while (room < h + 2 && free(get(x0, y0 + room, z0))) room++;
  if (room < 5) return false;
  h = Math.min(h, room - 2);
  const rad = h >= 9 ? 3 : 2;
  for (let y = 0; y < h; y++) set(x0, y0 + y, z0, STEM);
  const top = y0 + h;
  set(x0, top, z0, WART);
  for (let dy = -Math.min(h - 2, rad + 1); dy <= 0; dy++) {
    const y = top + dy;
    for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
      const edge = Math.abs(dx) === rad || Math.abs(dz) === rad, corner = Math.abs(dx) === rad && Math.abs(dz) === rad;
      if (dy === 0) {
        if (corner && r() < 0.6) continue;
        if (Math.abs(dx) <= rad - 1 || Math.abs(dz) <= rad - 1 || r() < 0.5) set(x0 + dx, y, z0 + dz, r() < 0.06 ? B.shroomlight : WART);
      } else if (edge) {
        const p = dy === -Math.min(h - 2, rad + 1) ? 0.35 : 0.8;
        if (corner && r() < 0.4) continue;
        if (r() < p) set(x0 + dx, y, z0 + dz, WART);
        if (crimson && dy === -Math.min(h - 2, rad + 1) && r() < 0.15) { const len = 1 + Math.floor(r() * 3); for (let k = 1; k <= len; k++) set(x0 + dx, y - k, z0 + dz, B.weeping_vines); }
      } else if (dy === -1 && r() < 0.1) set(x0 + dx, y, z0 + dz, B.shroomlight);
    }
  }
  return true;
}

// ---------------- 方块定义 ----------------
function netherBlocks() {
  const NB = (name, zh, o) => { if (B[name] === undefined) defBlock(name, zh, o); };
  NB('netherrack', '下界岩', { tex: 'mcl_nether_netherrack', hard: 0.4, tool: 'pickaxe', tier: 1, blast: 0.4 });
  NB('soul_sand', '灵魂沙', { tex: 'mcl_nether_soul_sand', hard: 0.5, tool: 'shovel', sound: 'sand', collide: () => [[0, 0, 0, 1, 14 / 16, 1]] });
  NB('soul_soil', '灵魂土', { tex: 'mcl_blackstone_soul_soil', hard: 0.5, tool: 'shovel', sound: 'sand' });
  NB('basalt', '玄武岩', { tex: { top: 'mcl_blackstone_basalt_top', side: 'mcl_blackstone_basalt_side' }, hard: 1.25, tool: 'pickaxe', tier: 1, blast: 4.2 });
  NB('polished_basalt', '磨制玄武岩', { tex: { top: 'mcl_blackstone_basalt_top_polished', side: 'mcl_blackstone_basalt_side_polished' }, hard: 1.25, tool: 'pickaxe', tier: 1, blast: 4.2 });
  NB('smooth_basalt', '平滑玄武岩', { tex: 'mcl_blackstone_basalt_smooth', hard: 1.25, tool: 'pickaxe', tier: 1, blast: 4.2 });
  NB('blackstone', '黑石', { tex: { top: 'mcl_blackstone_top', side: 'mcl_blackstone_side' }, hard: 1.5, tool: 'pickaxe', tier: 1, blast: 6 });
  NB('polished_blackstone', '磨制黑石', { tex: 'mcl_blackstone_polished', hard: 2, tool: 'pickaxe', tier: 1, blast: 6 });
  NB('polished_blackstone_bricks', '磨制黑石砖', { tex: 'mcl_blackstone_polished_bricks', hard: 1.5, tool: 'pickaxe', tier: 1, blast: 6 });
  NB('gilded_blackstone', '镶金黑石', { tex: 'mcl_blackstone_gilded', hard: 1.5, tool: 'pickaxe', tier: 1, blast: 6, drop: () => Math.random() < 0.1 ? ['gold_nugget', 2 + Math.floor(Math.random() * 4)] : ['gilded_blackstone', 1] });
  NB('nether_bricks', '下界砖块', { tex: 'mcl_nether_nether_brick', hard: 2, tool: 'pickaxe', tier: 1, blast: 6 });
  NB('red_nether_bricks', '红色下界砖块', { tex: 'mcl_nether_red_nether_brick', hard: 2, tool: 'pickaxe', tier: 1, blast: 6 });
  NB('nether_brick_slab', '下界砖台阶', { tex: 'mcl_nether_nether_brick', shape: 'slab', hard: 2, tool: 'pickaxe', tier: 1, blast: 6 });
  NB('nether_brick_stairs', '下界砖楼梯', { tex: 'mcl_nether_nether_brick', shape: 'stairs', hard: 2, tool: 'pickaxe', tier: 1, blast: 6 });
  NB('nether_brick_fence', '下界砖栅栏', {
    tex: 'mcl_nether_nether_brick', shape: 'boxes', opaque: false, render: 'cutout', hard: 2, tool: 'pickaxe', tier: 1, blast: 6,
    boxes: (m, nb) => netherFenceBoxes(nb, false), collide: (m, nb) => netherFenceBoxes(nb, true),
  });
  NB('nether_quartz_ore', '下界石英矿石', { tex: 'mcl_nether_quartz_ore', hard: 3, tool: 'pickaxe', tier: 1, drop: () => ['quartz', 1], xp: 3 });
  NB('nether_gold_ore', '下界金矿石', { tex: 'mcl_nether_gold_ore', hard: 3, tool: 'pickaxe', tier: 1, drop: () => ['gold_nugget', 2 + Math.floor(Math.random() * 5)], xp: 1 });
  NB('ancient_debris', '远古残骸', { tex: { top: 'mcl_nether_ancient_debris_top', side: 'mcl_nether_ancient_debris_side' }, hard: 30, tool: 'pickaxe', tier: 4, blast: 1200 });
  NB('crying_obsidian', '哭泣的黑曜石', { tex: 'mcl_core_crying_obsidian', hard: 50, tool: 'pickaxe', tier: 4, blast: 1200, emit: 10 });
  NB('netherite_block', '下界合金块', { tex: 'mcl_nether_netheriteblock', hard: 50, tool: 'pickaxe', tier: 4, blast: 1200 });
  NB('crimson_stem', '绯红菌柄', { tex: { top: 'mcl_crimson_crimson_hyphae', side: 'mcl_crimson_crimson_hyphae_side' }, hard: 2, tool: 'axe', fuel: 300 });
  NB('warped_stem', '诡异菌柄', { tex: { top: 'mcl_crimson_warped_hyphae', side: 'mcl_crimson_warped_hyphae_side' }, hard: 2, tool: 'axe', fuel: 300 });
  NB('stripped_crimson_stem', '去皮绯红菌柄', { tex: { top: 'mcl_crimson_stripped_crimson_stem_top', side: 'mcl_crimson_stripped_crimson_stem_side' }, hard: 2, tool: 'axe', fuel: 300 });
  NB('stripped_warped_stem', '去皮诡异菌柄', { tex: { top: 'mcl_crimson_stripped_warped_stem_top', side: 'mcl_crimson_stripped_warped_stem_side' }, hard: 2, tool: 'axe', fuel: 300 });
  NB('crimson_planks', '绯红木板', { tex: 'mcl_crimson_crimson_hyphae_wood', hard: 2, tool: 'axe', fuel: 300 });
  NB('warped_planks', '诡异木板', { tex: 'mcl_crimson_warped_hyphae_wood', hard: 2, tool: 'axe', fuel: 300 });
  NB('crimson_nylium', '绯红菌岩', { tex: { top: 'mcl_crimson_crimson_nylium', bottom: 'mcl_nether_netherrack', side: 'crimson_nylium_side' }, hard: 0.4, tool: 'pickaxe', tier: 1, drop: 'netherrack' });
  NB('warped_nylium', '诡异菌岩', { tex: { top: 'mcl_crimson_warped_nylium', bottom: 'mcl_nether_netherrack', side: 'warped_nylium_side' }, hard: 0.4, tool: 'pickaxe', tier: 1, drop: 'netherrack' });
  NB('nether_wart_block', '下界疣块', { tex: 'mcl_nether_nether_wart_block', hard: 1, tool: 'hoe', sound: 'grass' });
  NB('warped_wart_block', '诡异疣块', { tex: 'mcl_crimson_warped_wart_block', hard: 1, tool: 'hoe', sound: 'grass' });
  NB('shroomlight', '菌光体', { tex: 'mcl_crimson_shroomlight', hard: 1, tool: 'hoe', emit: 15, sound: 'grass' });
  NB('quartz_block', '石英块', { tex: { top: 'mcl_nether_quartz_block_top', bottom: 'mcl_nether_quartz_block_bottom', side: 'mcl_nether_quartz_block_side' }, hard: 0.8, tool: 'pickaxe', tier: 1 });
  NB('chiseled_quartz_block', '錾制石英块', { tex: { top: 'mcl_nether_quartz_chiseled_top', side: 'mcl_nether_quartz_chiseled_side' }, hard: 0.8, tool: 'pickaxe', tier: 1 });
  NB('quartz_pillar', '石英柱', { tex: { top: 'mcl_nether_quartz_pillar_top', side: 'mcl_nether_quartz_pillar_side' }, hard: 0.8, tool: 'pickaxe', tier: 1 });
  NB('quartz_bricks', '石英砖', { tex: 'mcl_backstone_quartz_bricks', hard: 0.8, tool: 'pickaxe', tier: 1 });
  NB('quartz_slab', '石英台阶', { tex: 'mcl_nether_quartz_block_top', shape: 'slab', hard: 2, tool: 'pickaxe', tier: 1 });
  NB('quartz_stairs', '石英楼梯', { tex: 'mcl_nether_quartz_block_top', shape: 'stairs', hard: 0.8, tool: 'pickaxe', tier: 1 });
  NB('bone_block', '骨块', { tex: { top: 'mcl_core_bone_block_top', side: 'mcl_core_bone_block_side' }, hard: 2, tool: 'pickaxe', tier: 1 });
  // 植物
  const cross = (name, zh, tex, o) => NB(name, zh, Object.assign({ shape: 'cross', tex, hard: 0, plant: true }, o || {}));
  cross('crimson_fungus', '绯红菌', 'mcl_crimson_crimson_fungus');
  cross('warped_fungus', '诡异菌', 'mcl_crimson_warped_fungus');
  cross('crimson_roots', '绯红菌索', 'mcl_crimson_crimson_roots', { replaceable: true });
  cross('warped_roots', '诡异菌索', 'mcl_crimson_warped_roots', { replaceable: true });
  cross('nether_sprouts', '下界苗', 'mcl_crimson_nether_sprouts', { replaceable: true, tool: 'shears', drop: null });
  cross('weeping_vines', '垂泪藤', 'mcl_crimson_weeping_vines', { climbable: true, plant: false, drop: () => Math.random() < 0.33 ? ['weeping_vines', 1] : null });
  cross('twisting_vines', '缠怨藤', 'mcl_crimson_twisting_vines', { climbable: true, plant: false, drop: () => Math.random() < 0.33 ? ['twisting_vines', 1] : null });
  NB('nether_wart', '下界疣', {
    shape: 'cross', tex: 'mcl_nether_nether_wart_stage_0', hard: 0, crop: true,
    texNames: ['mcl_nether_nether_wart_stage_0', 'mcl_nether_nether_wart_stage_1', 'mcl_nether_nether_wart_stage_2'],
    texFn: (f, m) => TEX['mcl_nether_nether_wart_stage_' + (m >= 3 ? 2 : m >= 1 ? 1 : 0)],
    drop: m => m >= 3 ? ['nether_wart', 2 + Math.floor(Math.random() * 3)] : ['nether_wart', 1],
  });
  // 火与传送门
  NB('fire', '火', { shape: 'cross', tex: 'fire_basic_flame_animated', hard: 0, emit: 15, drop: null, noItem: true, replaceable: true, sound: 'wool' });
  NB('soul_fire', '灵魂火', { shape: 'cross', tex: 'soul_fire_basic_flame_animated', hard: 0, emit: 10, drop: null, noItem: true, replaceable: true, sound: 'wool' });
  NB('nether_portal', '下界传送门', {
    shape: 'boxes', tex: 'nether_portal_anim', solid: false, opaque: false, render: 'blend', hard: -1, emit: 11, drop: null, noItem: true, sound: 'glass',
    boxes: m => m === 1 ? [[0.375, 0, 0, 0.625, 1, 1, { faces: [1, 1, 0, 0, 0, 0] }]] : [[0, 0, 0.375, 1, 1, 0.625, { faces: [0, 0, 0, 0, 1, 1] }]],
  });
}
function netherFenceBoxes(nb, collide) {
  const top = collide ? 1.5 : 1;
  const out = [[6 / 16, 0, 6 / 16, 10 / 16, top, 10 / 16]];
  const con = (dx, dz) => { const n = nb(dx, 0, dz); if (!n) return false; const d = BLOCKS[n]; return /fence/.test(d.name) || (d.solid && d.opaque); };
  const arms = (x0, z0, x1, z1) => {
    if (collide) out.push([x0, 0, z0, x1, 1.5, z1]);
    else { out.push([x0, 6 / 16, z0, x1, 9 / 16, z1]); out.push([x0, 12 / 16, z0, x1, 15 / 16, z1]); }
  };
  if (con(1, 0)) arms(10 / 16, 7 / 16, 1, 9 / 16);
  if (con(-1, 0)) arms(0, 7 / 16, 6 / 16, 9 / 16);
  if (con(0, 1)) arms(7 / 16, 10 / 16, 9 / 16, 1);
  if (con(0, -1)) arms(7 / 16, 0, 9 / 16, 6 / 16);
  return out;
}

// ---------------- 物品 ----------------
function netherItems() {
  const NI = (name, zh, o) => { if (!ITEMS[name]) defItem(name, zh, o); else if (o && o.icon && !ITEMS[name].icon) ITEMS[name].icon = o.icon; };
  NI('nether_brick', '下界砖', { icon: 'mcl_nether_netherbrick' });
  NI('quartz', '下界石英', { icon: 'mcl_nether_quartz' });
  NI('gold_nugget', '金粒', { icon: 'mcl_core_gold_nugget' });
  NI('netherite_scrap', '下界合金碎片', { icon: 'mcl_nether_netherite_scrap' });
  NI('netherite_ingot', '下界合金锭', { icon: 'mcl_nether_netherite_ingot' });
  NI('blaze_rod', '烈焰棒', { icon: 'vl_mobitems_flaming_rod', fuel: 2400 });
  NI('blaze_powder', '烈焰粉', { icon: 'vl_mobitems_flaming_powder' });
  NI('ghast_tear', '恶魂之泪', { icon: 'mcl_mobitems_ghast_tear' });
  NI('magma_cream', '岩浆膏', { icon: 'mcl_mobitems_magma_cream' });
  NI('fire_charge', '火焰弹', { icon: 'mcl_fire_fire_charge', desc: '右键方块点火，对空气使用则投掷' });
  if (ITEMS.nether_wart) ITEMS.nether_wart.icon = 'mcl_nether_nether_wart';
  for (const n of ['crimson_fungus', 'warped_fungus', 'crimson_roots', 'warped_roots', 'weeping_vines', 'twisting_vines']) if (ITEMS[n]) ITEMS[n].icon = ITEMS[n].icon || BLOCKS[B[n]].tex.all;
  // 下界合金工具（锻造台升级由 village 模块提供）
  const tools = { sword: ['剑', 8, 'default_tool_netheritesword'], pickaxe: ['镐', 6, 'default_tool_netheritepick'], axe: ['斧', 10, 'default_tool_netheriteaxe'], shovel: ['锹', 6.5, 'default_tool_netheriteshovel'], hoe: ['锄', 1, 'farming_tool_netheritehoe'] };
  for (const k in tools) NI('netherite_' + k, '下界合金' + tools[k][0], { tool: { type: k, tier: 4, speed: 9, dmg: tools[k][1] }, durability: 2031, icon: tools[k][2] });
  const eggs = { zombified_piglin: ['僵尸猪灵', 'mobs_mc_spawn_icon_zombie_pigman'], piglin: ['猪灵', 'mobs_mc_spawn_icon_zombie_pigman'], ghast: ['恶魂', 'mobs_mc_spawn_icon_ghast'], blaze: ['烈焰人', 'mobs_mc_spawn_icon_blaze'], magma_cube: ['岩浆怪', 'mobs_mc_spawn_icon_magmacube'], wither_skeleton: ['凋灵骷髅', 'mobs_mc_spawn_icon_wither'] };
  for (const k in eggs) NI(k + '_spawn_egg', eggs[k][0] + '刷怪蛋', { spawnEgg: k, creativeOnly: true, icon: eggs[k][1] });
}

// ---------------- 配方 ----------------
function netherRecipes() {
  SMELT.netherrack = 'nether_brick';
  SMELT.nether_quartz_ore = 'quartz';
  SMELT.nether_gold_ore = 'gold_ingot';
  SMELT.ancient_debris = 'netherite_scrap';
  SMELT.basalt = 'smooth_basalt';
  shaped(['BB', 'BB'], { B: 'nether_brick' }, 'nether_bricks');
  shaped(['WB', 'BW'], { W: 'nether_wart', B: 'nether_brick' }, 'red_nether_bricks');
  shaped(['BBB'], { B: 'nether_bricks' }, 'nether_brick_slab', 6);
  shaped(['B  ', 'BB ', 'BBB'], { B: 'nether_bricks' }, 'nether_brick_stairs', 4);
  shaped(['BNB', 'BNB'], { B: 'nether_bricks', N: 'nether_brick' }, 'nether_brick_fence', 6);
  shaped(['QQ', 'QQ'], { Q: 'quartz' }, 'quartz_block');
  shaped(['Q', 'Q'], { Q: 'quartz_block' }, 'quartz_pillar', 2);
  shaped(['QQ', 'QQ'], { Q: 'quartz_block' }, 'quartz_bricks', 4);
  shaped(['S', 'S'], { S: 'quartz_slab' }, 'chiseled_quartz_block');
  shaped(['QQQ'], { Q: 'quartz_block' }, 'quartz_slab', 6);
  shaped(['Q  ', 'QQ ', 'QQQ'], { Q: 'quartz_block' }, 'quartz_stairs', 4);
  shaped(['NNN', 'NNN', 'NNN'], { N: 'gold_nugget' }, 'gold_ingot');
  shapeless(['gold_ingot'], 'gold_nugget', 9);
  shapeless(['netherite_scrap', 'netherite_scrap', 'netherite_scrap', 'netherite_scrap', 'gold_ingot', 'gold_ingot', 'gold_ingot', 'gold_ingot'], 'netherite_ingot');
  shaped(['NNN', 'NNN', 'NNN'], { N: 'netherite_ingot' }, 'netherite_block');
  shapeless(['netherite_block'], 'netherite_ingot', 9);
  shapeless(['crimson_stem'], 'crimson_planks', 4);
  shapeless(['warped_stem'], 'warped_planks', 4);
  shapeless(['stripped_crimson_stem'], 'crimson_planks', 4);
  shapeless(['stripped_warped_stem'], 'warped_planks', 4);
  shapeless(['blaze_rod'], 'blaze_powder', 2);
  shapeless(['blaze_powder', 'slime_ball'], 'magma_cream');
  shapeless(['blaze_powder', 'coal', 'gunpowder'], 'fire_charge', 3);
  shapeless(['blaze_powder', 'charcoal', 'gunpowder'], 'fire_charge', 3);
  shaped(['WWW', 'WWW', 'WWW'], { W: 'nether_wart' }, 'nether_wart_block');
  shaped(['MM', 'MM'], { M: 'magma_cream' }, 'magma_block');
  shaped(['BB', 'BB'], { B: 'basalt' }, 'polished_basalt', 4);
  shaped(['BB', 'BB'], { B: 'blackstone' }, 'polished_blackstone', 4);
  shaped(['BB', 'BB'], { B: 'polished_blackstone' }, 'polished_blackstone_bricks', 4);
  if (ITEMS.bone_meal) { shaped(['MMM', 'MMM', 'MMM'], { M: 'bone_meal' }, 'bone_block'); shapeless(['bone_block'], 'bone_meal', 9); }
}

// ---------------- 交互 ----------------
function netherUseItem(g, p, hit, held) {
  if (!held) return false;
  const w = g.world, id = held.id;
  // 投掷火焰弹
  if (id === 'fire_charge' && !hit) {
    const e = p.eye(), d = p.lookDir();
    if (typeof NetherFireball === 'function') {
      g.entities.push(new NetherFireball(g, e.x + d.x * 0.8, e.y + d.y * 0.8, e.z + d.z * 0.8, d, p, true));
      g.audio.play('blaze.shoot', p.pos); p.consume(1);
    }
    return true;
  }
  if (!hit) return false;
  const def = BLOCKS[hit.id];
  // 点火 / 点亮传送门
  if (id === 'flint_and_steel' || id === 'fire_charge') {
    if (hit.id === B.tnt) return false;
    if (def.interact && !p.sneaking) return false;
    const x = hit.x + hit.n[0], y = hit.y + hit.n[1], z = hit.z + hit.n[2];
    const r = netherPlaceFire(w, x, y, z);
    if (r) {
      g.audio.play(id === 'fire_charge' ? 'blaze.shoot' : 'ignite', new THREE.Vector3(x, y, z));
      if (id === 'flint_and_steel') p.damageHeld(1); else p.consume(1);
    }
    return true;
  }
  // 下界的水会立即蒸发
  if (id === 'water_bucket' && w.dim === 'nether') {
    g.audio.play('fizz', new THREE.Vector3(hit.x, hit.y + 1, hit.z));
    g.particles.burst(hit.x + hit.n[0] + 0.5, hit.y + hit.n[1] + 0.5, hit.z + hit.n[2] + 0.5, [230, 230, 230], 16, 1);
    if (p.mode === 'survival') { p.inventory.slots[p.sel] = { id: 'bucket', n: 1 }; g.ui.refresh(); }
    return true;
  }
  // 骨粉：菌长成巨型菌、菌岩上长出植物；下界疣不受骨粉影响
  if (id === 'bone_meal') {
    if (hit.id === B.nether_wart) return true;
    if (hit.id === B.crimson_fungus || hit.id === B.warped_fungus) {
      const type = hit.id === B.crimson_fungus ? 'crimson' : 'warped';
      const below = w.getBlock(hit.x, hit.y - 1, hit.z);
      p.consume(1); g.particles.burst(hit.x + 0.5, hit.y + 0.6, hit.z + 0.5, [120, 230, 120], 12, 1);
      if (below === B[type + '_nylium'] && Math.random() < 0.4) {
        w.setBlock(hit.x, hit.y, hit.z, 0, 0, { noUpdate: true });
        const ok = netherHugeFungus((x, y, z, b) => { const c = w.getBlock(x, y, z); if (c === 0 || (BLOCKS[c].replaceable && !isLiquid(c)) || (BLOCKS[c].plant && b === B[type + '_stem'])) w.setBlock(x, y, z, b, 0, { noUpdate: true }); },
          (x, y, z) => w.getBlock(x, y, z), hit.x, hit.y, hit.z, type, Math.random);
        if (!ok) w.setBlock(hit.x, hit.y, hit.z, hit.id);
      }
      return true;
    }
    if (hit.id === B.crimson_nylium || hit.id === B.warped_nylium) {
      const cr = hit.id === B.crimson_nylium;
      for (let i = 0; i < 24; i++) {
        const x = hit.x + rnd(6) - 3, z = hit.z + rnd(6) - 3, y = hit.y;
        if (w.getBlock(x, y, z) !== hit.id || w.getBlock(x, y + 1, z) !== 0) continue;
        const r = Math.random();
        w.setBlock(x, y + 1, z, cr ? (r < 0.85 ? B.crimson_roots : B.crimson_fungus) : (r < 0.5 ? B.warped_roots : r < 0.85 ? B.nether_sprouts : B.warped_fungus));
      }
      p.consume(1); g.particles.burst(hit.x + 0.5, hit.y + 1.2, hit.z + 0.5, [120, 230, 120], 12, 1);
      return true;
    }
    if (hit.id === B.netherrack) {
      // 与菌岩相邻的下界岩转化为菌岩
      let found = null;
      for (const d of DIRS) { const n = w.getBlock(hit.x + d[0], hit.y + d[1], hit.z + d[2]); if (n === B.crimson_nylium || n === B.warped_nylium) found = n; }
      if (found && w.getBlock(hit.x, hit.y + 1, hit.z) === 0) { w.setBlock(hit.x, hit.y, hit.z, found); p.consume(1); return true; }
      return false;
    }
    return false;
  }
  // 种植：下界疣只能种在灵魂沙上；菌与菌索种在菌岩、灵魂土等上；藤蔓挂在方块上
  const placeAt = () => {
    const tr = def.replaceable && !isLiquid(hit.id);
    return tr ? [hit.x, hit.y, hit.z] : [hit.x + hit.n[0], hit.y + hit.n[1], hit.z + hit.n[2]];
  };
  if (id === 'nether_wart' || NETHER_PLANTS.includes(id) || id === 'weeping_vines' || id === 'twisting_vines') {
    const [x, y, z] = placeAt();
    const cur = w.getBlock(x, y, z);
    if (cur && !(BLOCKS[cur].replaceable && !isLiquid(cur))) return true;
    const bid = B[id];
    if (!netherSupportOk(w, x, y, z, bid)) return true;
    w.setBlock(x, y, z, bid, 0);
    g.audio.placeSound(bid); p.consume(1);
    return true;
  }
  return false;
}

// ---------------- 功能插件注册 ----------------
FEATURES.push({
  name: 'nether',
  blocks: netherBlocks,
  items: netherItems,
  recipes: netherRecipes,
  textures() {
    defTex('crimson_nylium_side', p => { p.fill([110, 40, 40], 0.1); p.rect(0, 0, 16, 4, [150, 20, 20], 0.1); });
    defTex('warped_nylium_side', p => { p.fill([110, 40, 40], 0.1); p.rect(0, 0, 16, 4, [30, 120, 110], 0.1); });
    defTex('nether_portal_anim', p => { p.fill([110, 40, 200, 190], 0.15); });
  },
  blockUpdate(w, x, y, z, id) {
    if (id === B.nether_portal) {
      if (!netherPortalValid(w, x, y, z, w.getMeta(x, y, z))) w.setBlock(x, y, z, 0);
      return true;
    }
    if (id === B.fire || id === B.soul_fire) {
      const below = w.getBlock(x, y - 1, z);
      if (id === B.soul_fire ? !(below === B.soul_sand || below === B.soul_soil) : !netherCanFireStay(w, x, y, z)) w.schedule(x, y, z, 1);
      else w.schedule(x, y, z, 25 + Math.floor(Math.random() * 10));
      return true;
    }
    if (netherIsPlant(id)) { if (!netherSupportOk(w, x, y, z, id)) w.schedule(x, y, z, 1); return true; }
    if ((id === B.crimson_nylium || id === B.warped_nylium) && BLOCKS[w.getBlock(x, y + 1, z)].opaque) { w.setBlock(x, y, z, B.netherrack); return true; }
    return false;
  },
  scheduledTick(w, x, y, z, id) {
    if (id === B.fire || id === B.soul_fire) { netherFireTick(w, x, y, z, id); return true; }
    if (netherIsPlant(id)) { if (!netherSupportOk(w, x, y, z, id)) w.breakBlock(x, y, z, true); return true; }
    return false;
  },
  randomTick(w, x, y, z, id) {
    if (id === B.fire) { w.schedule(x, y, z, 1 + Math.floor(Math.random() * 20)); return true; }
    if (id === B.nether_wart) {
      const m = w.getMeta(x, y, z);
      if (m < 3 && Math.random() < 0.1 && w.getBlock(x, y - 1, z) === B.soul_sand) w.setMeta(x, y, z, m + 1);
      return true;
    }
    if (id === B.lava && Math.random() < 0.05) {
      // 熔岩点燃附近可燃物
      const nx = x + rnd(2) - 1, ny = y + 1 + rnd(1), nz = z + rnd(2) - 1;
      if (w.getBlock(nx, ny, nz) === 0) {
        for (const d of DIRS) if (netherFlammable(w.getBlock(nx + d[0], ny + d[1], nz + d[2]))) { w.setBlock(nx, ny, nz, B.fire, 0); w.schedule(nx, ny, nz, 20); break; }
      }
      return false;
    }
    if ((id === B.crimson_nylium || id === B.warped_nylium) && BLOCKS[w.getBlock(x, y + 1, z)].opaque) { w.setBlock(x, y, z, B.netherrack); return true; }
    return false;
  },
  useItem: netherUseItem,
  useBlock(g, p, hit, held) {
    // 床在下界爆炸
    if (g.world.dim === 'nether' && BLOCKS[hit.id].interact === 'bed') {
      g.world.setBlock(hit.x, hit.y, hit.z, 0);
      g.explode(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, 5);
      for (let i = 0; i < 12; i++) { const x = hit.x + rnd(6) - 3, z = hit.z + rnd(6) - 3; for (let y = hit.y + 3; y > hit.y - 4; y--) if (netherCanFire(g.world, x, y, z) && BLOCKS[g.world.getBlock(x, y - 1, z)].solid) { if (Math.random() < 0.35) netherPlaceFire(g.world, x, y, z); break; } }
      return true;
    }
    return false;
  },
  tick(g) {
    const p = g.player, w = g.world;
    if (!p || !p.alive) return;
    const t = w.tick;
    // 传送门计时
    if (p.mode !== 'spectator' && netherTouching(w, p, [B.nether_portal])) {
      if (!NETHER.portalCd) {
        NETHER.portalT += 0.05;
        if (NETHER.portalT >= (p.mode === 'creative' ? 0.5 : 4)) netherTravel(g);
      }
    } else { NETHER.portalCd = false; NETHER.portalT = 0; }
    // 火焰接触
    if (netherTouching(w, p, [B.fire, B.soul_fire])) {
      p.fire = Math.max(p.fire, 8);
      if (t % 10 === 0) p.hurt(B.soul_fire !== undefined && netherTouching(w, p, [B.soul_fire]) ? 2 : 1, 'fire');
    }
    // 岩浆块
    const under = w.getBlock(Math.floor(p.pos.x), Math.floor(p.pos.y - 0.1), Math.floor(p.pos.z));
    if (under === B.magma_block && p.onGround && !p.sneaking && t % 10 === 0 && !effLv(p, 'fire_resistance')) p.hurt(1, 'fire');
    // 雨水熄灭身上的火
    if (p.fire > 0 && g.isRaining() && w.skyLight(Math.floor(p.pos.x), Math.floor(p.pos.y + 1), Math.floor(p.pos.z)) >= 15) p.fire = 0;
    if (t % 5 === 0) for (const m of g.mobs) {
      if (m.dead || m.def.fireImmune || m.pos.distanceTo(p.pos) > 48) continue;
      if (netherTouching(w, m, [B.fire, B.soul_fire])) m.fire = Math.max(m.fire, 8);
      const mu = w.getBlock(Math.floor(m.pos.x), Math.floor(m.pos.y - 0.1), Math.floor(m.pos.z));
      if (mu === B.magma_block && m.onGround && t % 10 === 0) m.hurt(1, 'fire');
    }
  },
  frame(g, dt) {
    const p = g.player;
    if (!p || g.state === 'title' || g.state === 'loading') return;
    // 死亡后在其他维度重生：回到出生点所在维度
    if (p.alive && !NETHER.wasAlive) {
      const sd = p.spawnDim || 'overworld';
      if (g.world.dim !== sd && DIM_INFO[sd]) g.changeDimension(sd, p.spawn[0], p.spawn[1], p.spawn[2]);
    }
    NETHER.wasAlive = p.alive;
    // 灵魂沙减速
    const pp = NETHER.prevPos;
    if (pp && p.onGround && !p.flying && p.mode !== 'spectator') {
      const under = g.world.getBlock(Math.floor(p.pos.x), Math.floor(p.pos.y - 0.2), Math.floor(p.pos.z));
      const dx = p.pos.x - pp.x, dz = p.pos.z - pp.z;
      if (under === B.soul_sand && dx * dx + dz * dz < 1) { p.pos.x = pp.x + dx * 0.45; p.pos.z = pp.z + dz * 0.45; }
    }
    NETHER.prevPos = { x: p.pos.x, z: p.pos.z };
    // 传送门紫色覆盖层
    let ov = NETHER.ov;
    if (!ov) {
      ov = NETHER.ov = document.createElement('div');
      ov.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:4;opacity:0;background:radial-gradient(ellipse at center, rgba(150,60,255,0.35) 0%, rgba(90,20,180,0.85) 100%);transition:opacity .1s';
      document.body.appendChild(ov);
    }
    const need = p.mode === 'creative' ? 0.5 : 4;
    ov.style.opacity = NETHER.portalT > 0 ? Math.min(1, NETHER.portalT / need) * 0.8 : 0;
    // 群系雾色与环境粒子
    if (g.world.dim === 'nether') netherAmbient(g, dt);
  },
  save() { return { wid: NETHER.reg.wid, portals: NETHER.reg.portals }; },
  load(g, d) { NETHER.reg = { wid: g.worldMeta ? g.worldMeta.id : null, portals: (d && d.portals) || {} }; },
});

// 下界群系雾色（DIM_INFO.update 每帧调用）
const NETHER_FOG = {
  nether_wastes: [0x330808, 0.15, 0.75], crimson_forest: [0x330303, 0.12, 0.7], warped_forest: [0x1a051a, 0.12, 0.7],
  soul_sand_valley: [0x1b4745, 0.1, 0.62], basalt_deltas: [0x685f70, 0.04, 0.45],
};
DIM_INFO.nether.update = (g) => {
  const info = DIM_INFO.nether, cam = g.camera.position;
  const b = NETHER_FOG[g.world.biomeAt(cam.x, cam.z)] || NETHER_FOG.nether_wastes;
  if (!NETHER.fogCur) NETHER.fogCur = { c: new THREE.Color(b[0]), n: b[1], f: b[2] };
  const cur = NETHER.fogCur, k = 0.03;
  cur.c.lerp(new THREE.Color(b[0]), k); cur.n += (b[1] - cur.n) * k; cur.f += (b[2] - cur.f) * k;
  info.fog = cur.c.getHex(); info.fogNear = cur.n; info.fogFar = cur.f;
};
function netherAmbient(g, dt) {
  const bio = g.world.biomeAt(g.player.pos.x, g.player.pos.z);
  const col = { crimson_forest: [200, 40, 40], warped_forest: [60, 200, 200], soul_sand_valley: [200, 210, 220], basalt_deltas: [230, 230, 230] }[bio];
  if (!col) return;
  NETHER.partT += dt * 8;
  const p = g.player.pos;
  while (NETHER.partT > 1) {
    NETHER.partT -= 1;
    g.particles.add(p.x + (Math.random() - 0.5) * 24, p.y + (Math.random() - 0.3) * 12, p.z + (Math.random() - 0.5) * 24,
      (Math.random() - 0.5) * 0.4, -0.2 - Math.random() * 0.3, (Math.random() - 0.5) * 0.4, col, 3 + Math.random() * 3, 0);
  }
}
