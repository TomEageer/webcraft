'use strict';
// ---------- 村庄模块（二）：村庄规划与生成、地牢、沙漠水井、/locatevillage ----------
(() => {
  const V = window.VILLAGE = window.VILLAGE || {};
  const REGION = 512;
  const STYLE_OF = { plains: 'plains', desert: 'desert', taiga: 'taiga', snowy_plains: 'snowy', savanna: 'savanna' };
  const FRONT = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // 朝向 f：局部 -Z 映射到的世界方向

  const nameId = n => (typeof n === 'number' ? n : B[n]);
  const has = n => B[n] !== undefined;

  function materials(style) {
    const stairsOf = w => (has(w + '_stairs') ? w + '_stairs' : 'oak_stairs');
    if (style === 'desert') return { log: 'sandstone', wall: 'sandstone', floor: 'sandstone', found: 'sandstone', roof: 'sandstone', stairs: 'sandstone_stairs', slab: 'sandstone_slab', fence: null, flat: true, top: 'sand', wood: 'oak' };
    if (style === 'taiga' || style === 'snowy') return { log: 'spruce_log', wall: 'spruce_planks', floor: 'spruce_planks', found: 'cobblestone', roof: 'spruce_planks', stairs: stairsOf('spruce'), slab: has('spruce_slab') ? 'spruce_slab' : 'oak_slab', fence: has('spruce_fence') ? 'spruce_fence' : (has('oak_fence') ? 'oak_fence' : null), flat: false, snow: style === 'snowy', top: style === 'snowy' ? 'snowy_grass' : 'grass_block', wood: 'spruce' };
    return { log: 'oak_log', wall: 'oak_planks', floor: 'oak_planks', found: 'cobblestone', roof: 'oak_planks', stairs: 'oak_stairs', slab: 'oak_slab', fence: has('oak_fence') ? 'oak_fence' : null, flat: false, top: 'grass_block', wood: 'oak' };
  }

  // ---------------- 战利品 ----------------
  function lootChest(r, table, rolls) {
    const items = new Array(27).fill(null);
    const pool = table.filter(e => ITEMS[e[0]]);
    if (!pool.length) return items;
    const tw = pool.reduce((a, e) => a + e[3], 0);
    for (let i = 0; i < rolls; i++) {
      let x = r() * tw, e = pool[0];
      for (const q of pool) { x -= q[3]; if (x <= 0) { e = q; break; } }
      const st = { id: e[0], n: e[1] + Math.floor(r() * (e[2] - e[1] + 1)) };
      if (e[0] === 'enchanted_book' && typeof ENCHANTS !== 'undefined') { const ks = Object.keys(ENCHANTS); const k = ks[Math.floor(r() * ks.length)]; st.ench = { [k]: 1 + Math.floor(r() * ENCHANTS[k].max) }; }
      let slot = Math.floor(r() * 27); for (let k = 0; k < 27 && items[slot]; k++) slot = (slot + 1) % 27;
      items[slot] = st;
    }
    return items;
  }
  const LOOT_HOUSE = [['bread', 1, 4, 10], ['apple', 1, 5, 8], ['wheat', 2, 7, 8], ['wheat_seeds', 2, 6, 6], ['emerald', 1, 2, 2], ['oak_sapling', 1, 2, 4], ['paper', 1, 3, 3], ['feather', 1, 2, 3], ['iron_ingot', 1, 2, 2], ['potato', 1, 5, 5], ['carrot', 1, 5, 5]];
  const LOOT_SMITH = [['iron_ingot', 1, 5, 10], ['bread', 1, 3, 15], ['apple', 1, 3, 15], ['gold_ingot', 1, 3, 5], ['iron_pickaxe', 1, 1, 5], ['iron_sword', 1, 1, 5], ['iron_helmet', 1, 1, 5], ['iron_chestplate', 1, 1, 5], ['obsidian', 3, 7, 5], ['oak_sapling', 3, 7, 5], ['diamond', 1, 3, 3], ['emerald', 1, 2, 4]];
  const LOOT_BUTCHER = [['porkchop', 1, 3, 6], ['beef', 1, 3, 6], ['mutton', 1, 3, 6], ['emerald', 1, 1, 1], ['wheat', 1, 3, 6], ['coal', 1, 3, 3]];
  const LOOT_DUNGEON = [['bread', 1, 1, 20], ['wheat', 1, 4, 20], ['iron_ingot', 1, 4, 10], ['gold_ingot', 1, 4, 5], ['bucket', 1, 1, 10], ['redstone', 1, 4, 15], ['coal', 1, 4, 15], ['string', 1, 4, 20], ['gunpowder', 1, 4, 20], ['bone', 1, 8, 20], ['rotten_flesh', 1, 8, 20], ['golden_apple', 1, 1, 15], ['enchanted_golden_apple', 1, 1, 2], ['saddle', 1, 1, 20], ['name_tag', 1, 1, 20], ['enchanted_book', 1, 1, 10], ['music_disc_13', 1, 1, 4], ['music_disc_cat', 1, 1, 4], ['diamond', 1, 1, 2]];

  // ---------------- 房屋模板（局部坐标：正面 z=0 朝向道路，门在 x=floor(w/2)） ----------------
  function shell(L, w, d, H, M, opts) {
    opts = opts || {};
    const wall = opts.wall || M.wall, corner = opts.corner || M.log;
    for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) {
      const edge = x === 0 || z === 0 || x === w - 1 || z === d - 1;
      L(x, 0, z, edge ? M.found : (opts.floor || M.floor));
      if (!edge) continue;
      const cor = (x === 0 || x === w - 1) && (z === 0 || z === d - 1);
      for (let y = 1; y <= H; y++) L(x, y, z, cor ? corner : wall);
    }
    // 窗户
    const glass = has('glass_pane') ? 'glass_pane' : 'glass';
    if (H >= 3) {
      for (const z of [Math.floor(d / 2)]) { L(0, 2, z, glass); L(w - 1, 2, z, glass); }
      if (w >= 7) { L(1, 2, 0, glass); L(w - 2, 2, 0, glass); }
      if (w >= 5) L(Math.floor(w / 2), 2, d - 1, glass);
    }
    const dx = Math.floor(w / 2);
    // 门：红石模块的门 meta 低 2 位为朝向（0 时门板贴在 +Z 侧），8 表示上半格
    const door = (M.log && String(M.log).startsWith('spruce') && has('spruce_door')) ? 'spruce_door' : has('oak_door') ? 'oak_door' : null;
    if (door) { L(dx, 1, 0, door, 0); L(dx, 2, 0, door, 8); } else { L(dx, 1, 0, 0); L(dx, 2, 0, 0); }
    roof(L, w, d, H, M);
  }
  function roof(L, w, d, H, M) {
    if (M.flat) {
      for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) L(x, H + 1, z, M.roof);
      for (let x = 0; x < w; x++) { L(x, H + 2, 0, M.slab); L(x, H + 2, d - 1, M.slab); }
      for (let z = 1; z < d - 1; z++) { L(0, H + 2, z, M.slab); L(w - 1, H + 2, z, M.slab); }
      return;
    }
    // 人字形屋顶，屋脊沿 x
    for (let k = 0; ; k++) {
      const z1 = -1 + k, z2 = d - k, y = H + 1 + k;
      for (let x = -1; x <= w; x++) {
        if (z1 < z2) { L(x, y, z1, M.stairs, 0); L(x, y, z2, M.stairs, 2); }
        else if (z1 === z2) L(x, y, z1, M.slab || M.roof);
      }
      if (z1 >= z2 - 1) {
        if (z1 === z2 - 1 && M.snow) for (let x = -1; x <= w; x++) { L(x, y + 1, z1, 'snow_block'); L(x, y + 1, z2, 'snow_block'); }
        break;
      }
      for (let z = z1 + 1; z < z2; z++) { L(0, y, z, M.wall); L(w - 1, y, z, M.wall); }
      if (M.snow && k === 0) { /* 积雪只放屋脊 */ }
    }
  }
  const roofH = (d, flat) => (flat ? 2 : Math.ceil((d + 2) / 2) + 1);

  const TEMPLATES = {
    small: { w: 5, d: 5, H: 3, weight: 5, build(L, M, ctx) {
      shell(L, 5, 5, 3, M);
      ctx.bed(1, 1, 3); if (ctx.job) ctx.jobAt(3, 1, 3, ctx.job, 2);
      L(1, 1, 1, 'torch');
    } },
    medium: { w: 7, d: 6, H: 3, weight: 4, build(L, M, ctx) {
      shell(L, 7, 6, 3, M);
      ctx.bed(1, 1, 4); ctx.bed(2, 1, 4);
      if (ctx.job) ctx.jobAt(5, 1, 4, ctx.job, 2);
      L(5, 1, 1, 'crafting_table'); ctx.chest(1, 1, 1, LOOT_HOUSE, 0); L(4, 1, 4, 'torch');
    } },
    library: { w: 7, d: 7, H: 4, weight: 2, job: 'lectern', build(L, M, ctx) {
      shell(L, 7, 7, 4, M);
      for (let x = 1; x <= 5; x++) for (let y = 1; y <= 2; y++) L(x, y, 5, 'bookshelf');
      for (let z = 2; z <= 4; z++) { L(1, 1, z, 'bookshelf'); L(5, 1, z, 'bookshelf'); }
      ctx.jobAt(3, 1, 3, 'lectern', 0); ctx.bed(4, 1, 1); L(2, 1, 1, 'torch');
    } },
    smithy: { w: 9, d: 7, H: 4, weight: 2, build(L, M, ctx) {
      const st = M.flat ? M : Object.assign({}, M, { wall: 'cobblestone', floor: 'cobblestone', corner: M.log });
      shell(L, 9, 7, 4, st, { wall: M.flat ? M.wall : 'cobblestone', floor: M.flat ? M.floor : 'stone' });
      L(1, 1, 5, 'furnace', 2); L(2, 1, 5, 'furnace', 2);
      ctx.chest(3, 1, 5, LOOT_SMITH, 2);
      const j1 = has('grindstone') ? 'grindstone' : 'smithing_table';
      ctx.jobAt(7, 1, 5, j1, 2);
      ctx.jobAt(7, 1, 3, 'blast_furnace', 1);
      if (j1 !== 'smithing_table') ctx.jobAt(7, 1, 1, 'smithing_table', 1);
      if (has('anvil')) L(5, 1, 5, 'anvil');
      ctx.bed(1, 1, 1); ctx.bed(1, 1, 2); if (j1 !== 'smithing_table') ctx.bed(1, 1, 3);
      L(4, 1, 3, 'torch');
    } },
    butcher: { w: 7, d: 6, H: 3, weight: 2, build(L, M, ctx) {
      shell(L, 7, 6, 3, M, { floor: M.flat ? M.floor : 'stone' });
      ctx.jobAt(5, 1, 4, 'smoker', 2); ctx.chest(4, 1, 4, LOOT_BUTCHER, 2);
      L(1, 1, 1, 'hay_block'); ctx.bed(1, 1, 4); L(5, 1, 1, 'torch');
    } },
    temple: { w: 5, d: 5, H: 6, weight: 1, need: 'brewing_stand', build(L, M, ctx) {
      shell(L, 5, 5, 6, M, { wall: M.flat ? M.wall : 'cobblestone', corner: M.flat ? M.log : 'cobblestone' });
      ctx.jobAt(2, 1, 3, 'brewing_stand', 0); ctx.bed(1, 1, 1); L(3, 1, 1, 'torch');
    } },
    farm: { w: 9, d: 7, H: 0, weight: 3, farm: true, build(L, M, ctx) {
      const crops = [B.wheat].concat(BLOCKS.filter(b => b.crop && b.name !== 'wheat').map(b => b.id));
      const crop = crops[Math.floor(ctx.r() * crops.length)];
      for (let x = 0; x < 9; x++) for (let z = 0; z < 7; z++) {
        const edge = x === 0 || z === 0 || x === 8 || z === 6;
        for (let y = 1; y <= 4; y++) L(x, y, z, 0);
        if (edge) { L(x, 0, z, M.flat ? 'sandstone' : M.log); continue; }
        if (z === 3) { L(x, 0, z, 'water'); L(x, -1, z, M.found); continue; }
        L(x, 0, z, 'farmland'); L(x, -1, z, 'dirt');
        L(x, 1, z, crop, Math.floor(ctx.r() * 8));
      }
      ctx.jobAt(4, 1, 0, 'composter', 0);
      if (!M.flat) L(0, 1, 0, 'hay_block');
    } },
  };

  // ---------------- 区域规划 ----------------
  const planCache = new Map();
  function rectsHit(a, b, m) { return a.x0 - m <= b.x1 && a.x1 + m >= b.x0 && a.z0 - m <= b.z1 && a.z1 + m >= b.z0; }
  function regionPlan(world, rx, rz) {
    const key = world.seed + ':' + rx + ',' + rz;
    if (planCache.has(key)) return planCache.get(key);
    let plan = null;
    try { plan = makePlan(world, rx, rz); } catch (e) { console.error(e); }
    if (planCache.size > 64) planCache.delete(planCache.keys().next().value);
    planCache.set(key, plan);
    return plan;
  }
  V.regionPlan = regionPlan;

  function makePlan(world, rx, rz) {
    const r = mulberry32(hash3(world.seed, rx, 7331, rz));
    if (r() > 0.4) return null;
    let cx, cz, info, style;
    for (let a = 0; a < 4 && !style; a++) {
      cx = rx * REGION + 64 + Math.floor(r() * (REGION - 128)); cz = rz * REGION + 64 + Math.floor(r() * (REGION - 128));
      info = world.columnInfo(cx, cz);
      const s = STYLE_OF[info.biome];
      if (!s || info.h < SEA + 1 || info.h > SEA + 37 || info.mf > 0.35) continue;
      let ok = true;
      for (let i = 0; i < 8 && ok; i++) { const ang = i * Math.PI / 4; const h = world.columnInfo(cx + Math.round(Math.cos(ang) * 14), cz + Math.round(Math.sin(ang) * 14)).h; if (Math.abs(h - info.h) > 6 || h < SEA) ok = false; }
      if (ok) style = s;
    }
    if (!style) return null;
    const M = materials(style);
    const ch = (x, z) => world.columnInfo(x, z).h;
    const plan = { id: rx + ',' + rz, rx, rz, cx, cz, y: info.h, style, biome: info.biome, M, roads: [], houses: [], elems: [], beds: [], jobs: [], lamps: [], occ: [] };
    const occ = plan.occ;
    // 中心广场 + 水井 + 钟
    const plaza = { x0: cx - 4, z0: cz - 4, x1: cx + 4, z1: cz + 4 };
    plan.roads.push(plaza); occ.push(plaza);
    plan.bell = [cx - 3, info.h + 1, cz - 3];
    plan.center = [cx + 0.5, info.h + 1, cz + 0.5];
    // 主干道与支路
    const segs = [];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dz] of dirs) {
      if (segs.length >= 2 && r() < 0.15) continue;
      const len = 22 + Math.floor(r() * 22);
      segs.push({ ox: cx + dx * 5, oz: cz + dz * 5, dx, dz, len });
    }
    for (const s of segs.slice()) {
      if (r() < 0.65) {
        const t = 10 + Math.floor(r() * Math.max(1, s.len - 16)), side = r() < 0.5 ? -1 : 1;
        const px = -s.dz * side, pz = s.dx * side;
        segs.push({ ox: s.ox + s.dx * t + px * 2, oz: s.oz + s.dz * t + pz * 2, dx: px, dz: pz, len: 12 + Math.floor(r() * 14) });
      }
    }
    const segRect = s => {
      const ex = s.ox + s.dx * (s.len - 1), ez = s.oz + s.dz * (s.len - 1), px = Math.abs(s.dz), pz = Math.abs(s.dx);
      return { x0: Math.min(s.ox, ex) - px, x1: Math.max(s.ox, ex) + px, z0: Math.min(s.oz, ez) - pz, z1: Math.max(s.oz, ez) + pz };
    };
    for (const s of segs) {
      // 道路不能穿过大片水域或陡坡（截短）
      let L = 0;
      for (; L < s.len; L++) { const h = ch(s.ox + s.dx * L, s.oz + s.dz * L); if (Math.abs(h - info.h) > 12) break; }
      s.len = L;
      if (s.len < 6) { s.len = 0; continue; }
      const rc = segRect(s); plan.roads.push(rc); occ.push(rc);
    }
    // 职业站点池：保证多样
    const jobPool = ['loom', 'fletching_table', 'cartography_table', 'stonecutter', 'barrel', 'cauldron', 'composter', 'lectern', 'smoker', 'smithing_table'].filter(has);
    for (let i = jobPool.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [jobPool[i], jobPool[j]] = [jobPool[j], jobPool[i]]; }
    let jobIdx = 0;
    const tw = Object.values(TEMPLATES).filter(t => !t.need || has(t.need));
    const pickT = () => {
      let sum = 0; for (const t of tw) sum += t.weight;
      let x = r() * sum; for (const t of tw) { x -= t.weight; if (x <= 0) return t; } return tw[0];
    };
    const counts = {};
    for (const s of segs) {
      if (!s.len) continue;
      const px = -s.dz, pz = s.dx;
      for (const side of [-1, 1]) {
        let t = 1 + Math.floor(r() * 3);
        while (t < s.len - 3 && plan.houses.length < 16) {
          let T = pickT();
          const name = Object.keys(TEMPLATES).find(k => TEMPLATES[k] === T);
          if ((name === 'smithy' || name === 'library' || name === 'temple') && counts[name] >= 1) T = TEMPLATES.small;
          const tname = Object.keys(TEMPLATES).find(k => TEMPLATES[k] === T);
          // 房屋正面朝向道路
          const fv = [-side * px, -side * pz];
          const f = FRONT.findIndex(v => v[0] === fv[0] && v[1] === fv[1]);
          const W = f % 2 ? T.d : T.w, D = f % 2 ? T.w : T.d;
          const along = s.dx ? W : D, depth = s.dx ? D : W;
          const a0 = t, a1 = t + along - 1, b0 = side * 3, b1 = side * (2 + depth);
          const xs = [s.ox + s.dx * a0 + px * b0, s.ox + s.dx * a1 + px * b1], zs = [s.oz + s.dz * a0 + pz * b0, s.oz + s.dz * a1 + pz * b1];
          const rc = { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
          let ok = a1 < s.len && !occ.some(o => rectsHit(o, rc, 1));
          let base = 0;
          if (ok) {
            const hs = [ch(rc.x0, rc.z0), ch(rc.x1, rc.z0), ch(rc.x0, rc.z1), ch(rc.x1, rc.z1), ch((rc.x0 + rc.x1) >> 1, (rc.z0 + rc.z1) >> 1)];
            const lo = Math.min(...hs), hi = Math.max(...hs);
            if (lo < SEA || hi - lo > 5) ok = false;
            base = Math.round(hs.reduce((a, b) => a + b, 0) / hs.length);
          }
          if (!ok) { t += 1; continue; }
          counts[tname] = (counts[tname] || 0) + 1;
          const h = { t: tname, T, f, rc, base, seed: Math.floor(r() * 1e9) };
          if (!T.job && tname !== 'smithy' && tname !== 'butcher' && tname !== 'farm' && tname !== 'temple') h.job = r() < 0.85 ? jobPool[jobIdx++ % jobPool.length] : null;
          // 门口小路
          if (!T.farm) {
            const dl = Math.floor(T.w / 2);
            const lw = toWorldFn(h)(dl, 0, -1);
            h.door = [lw[0], lw[2]]; h.doorIn = toWorldFn(h)(dl, 0, 1);
            plan.elems.push({ kind: 'doorpath', x: lw[0], z: lw[2], y: base, rc: { x0: lw[0], x1: lw[0], z0: lw[2], z1: lw[2] } });
          }
          plan.houses.push(h); occ.push(rc);
          t += along + 1 + Math.floor(r() * 3);
        }
      }
    }
    // 路灯：道路两侧每隔一段
    for (const s of segs) {
      if (!s.len) continue;
      const px = -s.dz, pz = s.dx;
      for (let t = 4; t < s.len; t += 9 + Math.floor(r() * 4)) {
        const side = r() < 0.5 ? -1 : 1;
        const x = s.ox + s.dx * t + px * side * 2, z = s.oz + s.dz * t + pz * side * 2;
        const rc = { x0: x, x1: x, z0: z, z1: z };
        if (occ.some(o => rectsHit(o, rc, 0)) || plan.elems.some(e => e.kind === 'doorpath' && Math.abs(e.x - x) <= 1 && Math.abs(e.z - z) <= 1)) continue;
        const y = ch(x, z); if (y < SEA) continue;
        plan.lamps.push([x, y, z]); plan.elems.push({ kind: 'lamp', x, z, y, rc });
      }
    }
    // 床与工作站点的世界坐标
    for (const h of plan.houses) {
      const ctx = fakeCtx(h, plan);
      h.T.build(ctx.L, plan.M, ctx);
    }
    // 包围盒
    let bb = { x0: plaza.x0, x1: plaza.x1, z0: plaza.z0, z1: plaza.z1 };
    for (const o of occ.concat(plan.elems.map(e => e.rc))) bb = { x0: Math.min(bb.x0, o.x0), x1: Math.max(bb.x1, o.x1), z0: Math.min(bb.z0, o.z0), z1: Math.max(bb.z1, o.z1) };
    plan.bbox = { x0: bb.x0 - 3, x1: bb.x1 + 3, z0: bb.z0 - 3, z1: bb.z1 + 3 };
    plan.golem = [cx + 3, info.h + 1, cz + 6];
    return plan;
  }

  // 局部坐标 -> 世界坐标
  function toWorldFn(h) {
    const T = h.T, f = h.f, rc = h.rc;
    // 先算旋转后的最小偏移
    const rot = (x, z) => { for (let k = 0; k < f; k++) { const t = x; x = -z; z = t; } return [x, z]; };
    const cs = [rot(0, 0), rot(T.w - 1, 0), rot(0, T.d - 1), rot(T.w - 1, T.d - 1)];
    const mx = Math.min(...cs.map(c => c[0])), mz = Math.min(...cs.map(c => c[1]));
    return (lx, ly, lz) => { const [x, z] = rot(lx, lz); return [rc.x0 + x - mx, h.base + ly, rc.z0 + z - mz]; };
  }
  const rotMeta = (m, f) => (m & ~3) | ((m + f) & 3);
  // 规划阶段：只记录床与站点位置
  function fakeCtx(h, plan) {
    const tw = toWorldFn(h);
    h.beds = []; h.jobs = [];
    const ctx = {
      r: mulberry32(h.seed), job: h.job,
      L: () => { },
      bed: (x, y, z) => { const p = tw(x, y, z); h.beds.push(p); plan.beds.push(p); },
      jobAt: (x, y, z, name) => { if (!has(name)) return; const p = tw(x, y, z); const j = { pos: p, block: name, house: plan.houses.indexOf(h) }; h.jobs.push(j); plan.jobs.push(j); },
      chest: () => { },
    };
    return ctx;
  }

  // ---------------- 区块写入 ----------------
  function genVillageChunk(world, ch, cols, plan) {
    const bx = ch.cx * 16, bz = ch.cz * 16, b = ch.blocks, mt = ch.meta, M = plan.M;
    const crc = { x0: bx, x1: bx + 15, z0: bz, z1: bz + 15 };
    if (!rectsHit(plan.bbox, crc, 0)) return false;
    const put = (x, y, z, n, m) => {
      const lx = x - bx, lz = z - bz;
      if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || y < 1 || y >= CH) return;
      const id = nameId(n); if (id === undefined) return;
      const i = idx3(lx, y, lz); b[i] = id; mt[i] = m || 0;
    };
    const get = (x, y, z) => b[idx3(x - bx, y, z - bz)];
    const colH = (x, z) => { const lx = x - bx, lz = z - bz; return lx >= -1 && lx <= 16 && lz >= -1 && lz <= 16 ? cols[(lz + 1) * 18 + lx + 1].h : world.columnInfo(x, z).h; };
    const inC = (x, z) => x >= bx && x <= bx + 15 && z >= bz && z <= bz + 15;
    const pathAt = (x, z, y) => {
      if (!inC(x, z)) return;
      const h = y === undefined ? colH(x, z) : y;
      if (h < SEA) { put(x, SEA, z, M.wood + '_planks'); for (let yy = SEA + 1; yy <= SEA + 4; yy++) put(x, yy, z, 0); return; }
      put(x, h, z, 'grass_path');
      if (get(x, h - 1, z) === 0 || isLiquid(get(x, h - 1, z))) put(x, h - 1, z, 'dirt');
      for (let yy = h + 1; yy <= h + 6; yy++) { const id = get(x, yy, z); if (id && !BLOCKS[id].replaceable && !BLOCKS[id].leaves && !BLOCKS[id].plant && id !== B[M.wood + '_log'] && id !== B.oak_log && id !== B.spruce_log && id !== B.birch_log) break; put(x, yy, z, 0); }
    };
    // 1 道路
    for (const rc of plan.roads) {
      if (!rectsHit(rc, crc, 0)) continue;
      for (let x = Math.max(rc.x0, bx); x <= Math.min(rc.x1, bx + 15); x++) for (let z = Math.max(rc.z0, bz); z <= Math.min(rc.z1, bz + 15); z++) pathAt(x, z);
    }
    // 2 中心水井与钟
    const c = plan, wy = c.y;
    if (rectsHit({ x0: c.cx - 4, x1: c.cx + 4, z0: c.cz - 4, z1: c.cz + 4 }, crc, 0)) {
      for (let x = c.cx - 1; x <= c.cx + 2; x++) for (let z = c.cz - 1; z <= c.cz + 2; z++) {
        const inner = x >= c.cx && x <= c.cx + 1 && z >= c.cz && z <= c.cz + 1;
        for (let y = wy - 4; y <= wy + 5; y++) put(x, y, z, 0);
        put(x, wy - 5, z, M.found);
        if (inner) { for (let y = wy - 4; y <= wy; y++) put(x, y, z, 'water'); }
        else { for (let y = wy - 4; y <= wy; y++) put(x, y, z, M.found); put(x, wy + 1, z, M.found); }
        const corner = (x === c.cx - 1 || x === c.cx + 2) && (z === c.cz - 1 || z === c.cz + 2);
        if (corner) { put(x, wy + 2, z, M.fence || M.log); put(x, wy + 3, z, M.fence || M.log); }
        put(x, wy + 4, z, M.flat ? 'sandstone_slab' : M.found);
      }
      put(c.bell[0], c.bell[1], c.bell[2], 'bell');
      put(c.bell[0], c.bell[1] - 1, c.bell[2], M.found);
    }
    // 3 房屋
    for (const h of plan.houses) {
      if (!rectsHit(h.rc, crc, 2)) continue;
      const tw = toWorldFn(h), T = h.T, base = h.base, rc = h.rc;
      const top = T.H + roofH(T.d, M.flat) + 2;
      // 地基与清空
      for (let x = rc.x0 - 1; x <= rc.x1 + 1; x++) for (let z = rc.z0 - 1; z <= rc.z1 + 1; z++) {
        if (!inC(x, z)) continue;
        const inside = x >= rc.x0 && x <= rc.x1 && z >= rc.z0 && z <= rc.z1, cH = colH(x, z);
        for (let y = base + 1; y <= base + top; y++) put(x, y, z, 0);
        if (inside) { for (let y = Math.min(cH, base - 1); y < base; y++) if (y >= cH - 1 || get(x, y, z) === 0 || isLiquid(get(x, y, z))) put(x, y, z, T.farm ? 'dirt' : M.found); }
        else if (cH >= base) { put(x, base, z, M.top); }
        else for (let y = cH + 1; y < base; y++) put(x, y, z, 'dirt'), put(x, base, z, M.top);
      }
      const r = mulberry32(h.seed);
      const L = (lx, ly, lz, n, m) => {
        const p = tw(lx, ly, lz), id = nameId(n);
        if (id === undefined) return;
        const d = BLOCKS[id];
        const meta = (d.shape === 'stairs' || (d.tex && d.tex.front) || d.name.endsWith('_door')) ? rotMeta(m || 0, h.f) : (m || 0);
        put(p[0], p[1], p[2], id, meta);
      };
      const ctx = {
        r, job: h.job,
        bed: (x, y, z) => L(x, y, z, 'red_bed'),
        jobAt: (x, y, z, name, m) => L(x, y, z, name, m || 0),
        chest: (x, y, z, table, m) => {
          const p = tw(x, y, z);
          if (!inC(p[0], p[2])) return;
          L(x, y, z, 'chest', m || 0);
          const k = p.join(',');
          if (!world.tiles.has(k)) world.tiles.set(k, { type: 'chest', items: lootChest(mulberry32(hash3(world.seed, p[0], p[1], p[2])), table, 3 + Math.floor(r() * 4)) });
        },
      };
      T.build(L, M, ctx);
    }
    // 4 门口小路、路灯
    for (const e of plan.elems) {
      if (!rectsHit(e.rc, crc, 0)) continue;
      if (e.kind === 'doorpath') pathAt(e.x, e.z, e.y);
      else if (e.kind === 'lamp') {
        const y = colH(e.x, e.z);
        put(e.x, y, e.z, M.found);
        if (M.fence) { put(e.x, y + 1, e.z, M.fence); put(e.x, y + 2, e.z, M.fence); put(e.x, y + 3, e.z, M.wood + '_planks'); put(e.x, y + 4, e.z, 'torch'); }
        else { put(e.x, y + 1, e.z, M.log); put(e.x, y + 2, e.z, M.log); put(e.x, y + 3, e.z, 'torch'); }
      }
    }
    return true;
  }

  function plansNear(world, x0, z0, x1, z1) {
    const out = [];
    for (let rx = Math.floor((x0 - 100) / REGION); rx <= Math.floor((x1 + 100) / REGION); rx++)
      for (let rz = Math.floor((z0 - 100) / REGION); rz <= Math.floor((z1 + 100) / REGION); rz++) {
        const p = regionPlan(world, rx, rz);
        if (p && rectsHit(p.bbox, { x0, x1, z0, z1 }, 0)) out.push(p);
      }
    return out;
  }
  V.plansNear = plansNear;

  V.locate = (world, x, z, maxR) => {
    let best = null;
    const R = maxR || 10, rx0 = Math.floor(x / REGION), rz0 = Math.floor(z / REGION);
    for (let rx = rx0 - R; rx <= rx0 + R; rx++) for (let rz = rz0 - R; rz <= rz0 + R; rz++) {
      const p = regionPlan(world, rx, rz); if (!p) continue;
      const d = Math.hypot(p.cx - x, p.cz - z);
      if (!best || d < best.d) best = { plan: p, d };
    }
    return best;
  };

  // ---------------- 沙漠水井 ----------------
  function desertWell(world, ch, cols) {
    const r = mulberry32(hash3(world.seed, ch.cx, 4011, ch.cz));
    if (r() > 1 / 120) return;
    const ci = cols[(8 + 1) * 18 + 9];
    if (ci.biome !== 'desert' || ci.h < SEA + 1) return;
    const b = ch.blocks, y = ci.h, ox = 5, oz = 5;
    for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++) if (Math.abs(cols[(oz + z + 1) * 18 + ox + x + 1].h - y) > 2) return;
    const P = (x, yy, z, n) => { b[idx3(ox + x, yy, oz + z)] = nameId(n) || 0; };
    for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++) {
      for (let yy = y - 3; yy <= y; yy++) P(x, yy, z, 'sandstone');
      for (let yy = y + 1; yy <= y + 5; yy++) P(x, yy, z, 0);
    }
    P(2, y, 2, 'water'); P(2, y - 1, 2, 'water');
    for (const [x, z] of [[1, 2], [3, 2], [2, 1], [2, 3]]) P(x, y + 1, z, 'sandstone_slab');
    for (const [x, z] of [[0, 2], [4, 2], [2, 0], [2, 4]]) P(x, y + 1, z, 'sandstone_slab');
    for (const [x, z] of [[1, 1], [1, 3], [3, 1], [3, 3]]) { P(x, y + 1, z, 'sandstone'); P(x, y + 2, z, 'sandstone'); }
    for (let x = 1; x <= 3; x++) for (let z = 1; z <= 3; z++) P(x, y + 3, z, x === 2 && z === 2 ? 'sandstone' : 'sandstone_slab');
    for (const [x, z] of [[1, 1], [1, 3], [3, 1], [3, 3]]) P(x, y + 3, z, 'sandstone');
    V.wells = V.wells || []; V.wells.push([ch.cx * 16 + ox + 2, y, ch.cz * 16 + oz + 2]);
  }

  // ---------------- 地牢 ----------------
  V.dungeons = [];
  function dungeon(world, ch, cols) {
    const r = mulberry32(hash3(world.seed, ch.cx, 5151, ch.cz));
    if (r() > 0.14) return;
    const lx = 1 + Math.floor(r() * 6), lz = 1 + Math.floor(r() * 6), y = 12 + Math.floor(r() * 34);
    const b = ch.blocks;
    let minH = 999;
    for (let x = lx; x < lx + 9; x++) for (let z = lz; z < lz + 9; z++) minH = Math.min(minH, cols[(z + 1) * 18 + x + 1].h);
    if (minH < y + 10) return;
    let air = 0, wet = 0;
    for (let x = lx; x < lx + 9; x++) for (let z = lz; z < lz + 9; z++) for (let yy = y; yy <= y + 5; yy++) {
      const id = b[idx3(x, yy, z)];
      if (id === 0) air++; else if (isLiquid(id)) wet++;
    }
    if (wet > 0 || air > 9 * 9 * 6 * 0.3) return;
    for (let x = 0; x < 9; x++) for (let z = 0; z < 9; z++) for (let yy = 0; yy <= 5; yy++) {
      const i = idx3(lx + x, y + yy, lz + z);
      const wall = x === 0 || z === 0 || x === 8 || z === 8 || yy === 0 || yy === 5;
      if (!wall) { b[i] = 0; continue; }
      if (b[i] === 0 && yy > 0) continue; // 与洞穴相接处留开口
      b[i] = yy === 0 ? (r() < 0.6 ? B.mossy_cobblestone : B.cobblestone) : (r() < 0.2 ? B.mossy_cobblestone : B.cobblestone);
    }
    const mobs = ['zombie', 'zombie', 'skeleton', 'spider'];
    const mob = mobs[Math.floor(r() * mobs.length)];
    const sx = ch.cx * 16 + lx + 4, sz = ch.cz * 16 + lz + 4;
    b[idx3(lx + 4, y + 1, lz + 4)] = B.monster_spawner;
    world.tiles.set(sx + ',' + (y + 1) + ',' + sz, { type: 'spawner', mob, delay: 200 });
    const n = 1 + Math.floor(r() * 2);
    const spots = [[1, 4], [7, 4], [4, 1], [4, 7]];
    for (let i = 0; i < n; i++) {
      const [cxl, czl] = spots[Math.floor(r() * 4)];
      const i3 = idx3(lx + cxl, y + 1, lz + czl);
      if (b[i3] === B.chest) continue;
      b[i3] = B.chest; ch.meta[i3] = 0;
      const wx = ch.cx * 16 + lx + cxl, wz = ch.cz * 16 + lz + czl;
      const k = wx + ',' + (y + 1) + ',' + wz;
      if (!world.tiles.has(k)) world.tiles.set(k, { type: 'chest', items: lootChest(r, LOOT_DUNGEON, 4 + Math.floor(r() * 5)) });
    }
    V.dungeons.push({ pos: [sx, y + 1, sz], mob });
  }

  FEATURES.push({
    name: 'village_gen',
    genChunk(world, ch, cols) {
      if (world.dim !== 'overworld') return;
      dungeon(world, ch, cols);
      const bx = ch.cx * 16, bz = ch.cz * 16;
      let inVillage = false;
      for (const p of plansNear(world, bx, bz, bx + 15, bz + 15)) if (genVillageChunk(world, ch, cols, p)) inVillage = true;
      if (!inVillage) desertWell(world, ch, cols);
    },
  });

  COMMANDS.locatevillage = (a, ui, g) => {
    const p = g.player;
    if (g.world.dim !== 'overworld') { ui.chat('错误：只有主世界有村庄'); return; }
    const res = V.locate(g.world, Math.floor(p.pos.x), Math.floor(p.pos.z));
    if (!res) { ui.chat('错误：附近 5000 格内未找到村庄'); return; }
    const pl = res.plan;
    ui.chat(`最近的村庄（${BIOMES[pl.biome] ? BIOMES[pl.biome].zh : pl.biome}）位于 [${pl.cx}, ${pl.y + 1}, ${pl.cz}]（距离 ${Math.round(res.d)} 格）`);
    if (a[1] === 'tp') { p.pos.set(pl.cx + 0.5, pl.y + 12, pl.cz + 6.5); p.vel.set(0, 0, 0); p.fallDist = 0; ui.chat('已传送到村庄'); }
  };
})();
