'use strict';
// ---------- 村庄模块（三）：村民、交易、铁傀儡、村庄记录与存档 ----------
(() => {
  const V = window.VILLAGE = window.VILLAGE || {};
  const rn = n => Math.floor(Math.random() * (n + 1));
  const LV_ZH = ['新手', '学徒', '老手', '专家', '大师'];
  const LV_XP = [0, 10, 70, 150, 250];
  const UNDEAD_HUNTERS = ['zombie', 'husk', 'drowned', 'zombie_villager'];

  // ---------------- 交易表（Java 版风格的绿宝石经济） ----------------
  const buy = (id, n, max, vxp) => () => ({ a: { id, n }, out: { id: 'emerald', n: 1 }, max: max || 16, vxp: vxp || 2 });
  const sell = (e, id, n, max, vxp, ench) => () => ({ a: { id: 'emerald', n: e }, out: Object.assign({ id, n: n || 1 }, ench ? { ench } : {}), max: max || 12, vxp: vxp || 1 });
  const swap = (e, bid, bn, id, n) => () => ({ a: { id: 'emerald', n: e }, b: { id: bid, n: bn }, out: { id, n }, max: 16, vxp: 1 });
  const enchBook = () => {
    if (!ITEMS.enchanted_book || typeof ENCHANTS === 'undefined') return null;
    const ks = Object.keys(ENCHANTS), k = ks[Math.floor(Math.random() * ks.length)], lv = 1 + rn(ENCHANTS[k].max - 1);
    return { a: { id: 'emerald', n: Math.min(64, 2 + 3 * lv + rn(5 + lv * 10)) }, b: { id: 'book', n: 1 }, out: { id: 'enchanted_book', n: 1, ench: { [k]: lv } }, max: 12, vxp: 5 };
  };
  const enchSell = (e, id) => () => {
    if (!ITEMS[id]) return null;
    const pool = typeof ENCHANTS === 'undefined' ? [] : Object.keys(ENCHANTS).filter(k => enchApplies(id, k) && k !== 'mending');
    const o = sell(e, id, 1, 3, 15)();
    if (pool.length) { const k = pool[Math.floor(Math.random() * pool.length)]; o.out.ench = { [k]: 1 + rn(Math.min(2, ENCHANTS[k].max - 1)) }; }
    return o;
  };
  const TRADES = {
    farmer: [[buy('wheat', 20), buy('potato', 26), buy('carrot', 22), buy('beetroot', 15), sell(1, 'bread', 6, 16)], [buy('pumpkin', 6, 12, 10), sell(1, 'pumpkin_pie', 4), sell(1, 'apple', 4, 16, 5)], [buy('melon', 4, 12, 20), sell(3, 'cookie', 18)], [sell(1, 'cake', 1), sell(1, 'suspicious_stew', 1), sell(2, 'hay_block', 1, 12, 15)], [sell(3, 'golden_carrot', 3, 12, 30), sell(4, 'glistering_melon_slice', 3, 12, 30)]],
    librarian: [[buy('paper', 24), sell(9, 'bookshelf', 1), enchBook], [buy('book', 4, 12, 10), sell(1, 'lantern', 1, 12, 5), enchBook], [buy('ink_sac', 5, 12, 20), sell(1, 'glass', 4, 12, 10), enchBook], [buy('writable_book', 2, 12, 30), sell(5, 'clock', 1, 12, 15), sell(4, 'compass', 1, 12, 15)], [sell(20, 'name_tag', 1, 12, 30), enchBook]],
    armorer: [[buy('coal', 15), sell(7, 'iron_leggings'), sell(4, 'iron_boots'), sell(5, 'iron_helmet'), sell(9, 'iron_chestplate')], [buy('iron_ingot', 4, 12, 10), sell(36, 'bell', 1, 12, 5), sell(1, 'chainmail_boots', 1, 12, 5), sell(4, 'chainmail_leggings', 1, 12, 5)], [buy('lava_bucket', 1, 12, 20), buy('diamond', 1, 12, 20), sell(1, 'chainmail_helmet', 1, 12, 10), sell(4, 'chainmail_chestplate', 1, 12, 10), sell(5, 'shield', 1, 12, 10)], [enchSell(14, 'diamond_leggings'), enchSell(8, 'diamond_boots')], [enchSell(8, 'diamond_helmet'), enchSell(16, 'diamond_chestplate')]],
    weaponsmith: [[buy('coal', 15), sell(3, 'iron_axe'), enchSell(2, 'iron_sword')], [buy('iron_ingot', 4, 12, 10), sell(36, 'bell', 1, 12, 5)], [buy('flint', 24, 12, 20)], [buy('diamond', 1, 12, 30), enchSell(17, 'diamond_axe')], [enchSell(13, 'diamond_sword')]],
    toolsmith: [[buy('coal', 15), sell(1, 'stone_axe'), sell(1, 'stone_shovel'), sell(1, 'stone_pickaxe'), sell(1, 'stone_hoe')], [buy('iron_ingot', 4, 12, 10), sell(36, 'bell', 1, 12, 5)], [buy('flint', 30, 12, 20), enchSell(1, 'iron_axe'), enchSell(2, 'iron_shovel'), enchSell(3, 'iron_pickaxe'), sell(4, 'diamond_hoe', 1, 3, 10)], [buy('diamond', 1, 12, 30), enchSell(12, 'diamond_axe'), enchSell(5, 'diamond_shovel')], [enchSell(13, 'diamond_pickaxe')]],
    butcher: [[buy('chicken', 14), buy('porkchop', 7), buy('rabbit', 4), sell(1, 'rabbit_stew', 1)], [buy('coal', 15), sell(1, 'cooked_porkchop', 5, 16, 5), sell(1, 'cooked_chicken', 8, 16, 5)], [buy('mutton', 7, 16, 20), buy('beef', 10, 16, 20)], [buy('dried_kelp_block', 10, 12, 30)], [buy('sweet_berries', 10, 12, 30)]],
    leatherworker: [[buy('leather', 6), sell(3, 'leather_leggings'), sell(7, 'leather_chestplate')], [buy('flint', 26, 12, 10), sell(5, 'leather_helmet', 1, 12, 5), sell(4, 'leather_boots', 1, 12, 5)], [buy('rabbit_hide', 9, 12, 20), sell(7, 'leather_chestplate', 1, 12, 10)], [sell(6, 'leather_horse_armor', 1, 12, 15)], [sell(6, 'saddle', 1, 12, 30), sell(5, 'leather_helmet', 1, 12, 30)]],
    cleric: [[buy('rotten_flesh', 32), sell(1, 'redstone', 2)], [buy('gold_ingot', 3, 12, 10), sell(1, 'lapis_lazuli', 1, 12, 5)], [buy('rabbit_foot', 2, 12, 20), sell(4, 'glowstone', 1, 12, 10)], [buy('glass_bottle', 9, 12, 30), sell(5, 'ender_pearl', 1, 12, 15)], [buy('nether_wart', 22, 12, 30), sell(3, 'experience_bottle', 1, 12, 30)]],
    shepherd: [[buy('white_wool', 18), buy('brown_wool', 18), buy('black_wool', 18), buy('gray_wool', 18), sell(2, 'shears')], [sell(1, 'white_wool', 1, 16, 5), sell(1, 'red_wool', 1, 16, 5), sell(1, 'blue_wool', 1, 16, 5)], [sell(3, 'red_bed', 1, 12, 10), sell(3, 'straw_bed', 1, 12, 10)], [sell(1, 'cushion', 2, 12, 15)], [sell(2, 'painting', 3, 12, 30)]],
    fletcher: [[buy('stick', 32), sell(1, 'arrow', 16), swap(1, 'gravel', 10, 'flint', 10)], [buy('flint', 26, 12, 10), sell(2, 'bow', 1, 12, 5)], [buy('string', 14, 16, 20), sell(3, 'crossbow', 1, 12, 10)], [buy('feather', 24, 16, 30), enchSell(2, 'bow')], [buy('tripwire_hook', 8, 12, 30), enchSell(8, 'crossbow')]],
    cartographer: [[buy('paper', 24), buy('glass_pane', 11), buy('glass', 11), sell(7, 'map', 1)], [buy('compass', 1, 12, 10), sell(13, 'filled_map', 1, 12, 5)], [sell(7, 'item_frame', 1, 12, 15)], [sell(3, 'white_banner', 1, 12, 15)], [sell(8, 'globe_banner_pattern', 1, 12, 30)]],
    mason: [[buy('clay_ball', 10), sell(1, 'brick', 10)], [buy('stone', 20, 16, 10), sell(1, 'stone_bricks', 4, 16, 5)], [buy('granite', 16, 16, 20), sell(1, 'polished_granite', 4, 16, 10), sell(1, 'terracotta', 1, 12, 10)], [buy('quartz', 12, 12, 30), sell(1, 'mossy_stone_bricks', 4, 12, 15)], [sell(1, 'quartz_pillar', 1, 12, 30)]],
    fisherman: [[buy('string', 20), buy('coal', 10), swap(1, 'cod', 6, 'cooked_cod', 6)], [buy('cod', 15, 16, 10), sell(1, 'campfire', 1, 12, 5)], [buy('salmon', 13, 16, 20), enchSell(3, 'fishing_rod')], [buy('tropical_fish', 6, 12, 30)], [buy('pufferfish', 4, 12, 30)]],
  };
  const validOffer = o => o && ITEMS[o.a.id] && ITEMS[o.out.id] && (!o.b || ITEMS[o.b.id]);
  function rollLevel(prof, lvl, count) {
    const list = (TRADES[prof] || [])[lvl - 1] || [];
    const offers = list.map(f => f()).filter(validOffer);
    for (let i = offers.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [offers[i], offers[j]] = [offers[j], offers[i]]; }
    return offers.slice(0, count).map(o => Object.assign(o, { uses: 0, lvl }));
  }
  V.rollLevel = rollLevel;
  function setProf(v, prof) {
    v.prof = prof; v.lvl = 1; v.xp = 0;
    v.trades = TRADES[prof] ? rollLevel(prof, 1, 3) : [];
  }
  V.setProf = setProf;
  const levelOf = xp => { let l = 1; for (let i = 1; i < 5; i++) if (xp >= LV_XP[i]) l = i + 1; return l; };

  // ---------------- 村庄记录 ----------------
  V.records = {};
  V.worldId = null;
  function getRec(plan, g) {
    let rec = V.records[plan.id];
    if (rec) return rec;
    const r = mulberry32(hash3(g.world.seed, plan.rx, 4646, plan.rz));
    rec = V.records[plan.id] = { id: plan.id, villagers: [], golem: 1, food: 6, breedT: 0 };
    const key = Math.floor(g.time / 12000);
    const freeJobs = plan.jobs.slice();
    // 先给每栋房子的床配上本屋的工作站点，剩下的村民领取其余站点（例如农田堆肥桶）
    plan.beds.forEach((bed, i) => {
      const v = { uid: plan.id + ':' + i, bed, prof: 'none', lvl: 1, xp: 0, trades: [], job: null, restock: key };
      rec.villagers.push(v);
    });
    for (const h of plan.houses) {
      const hv = rec.villagers.filter(v => h.beds && h.beds.some(b => b === v.bed));
      for (let k = 0; k < Math.min(hv.length, h.jobs.length); k++) {
        const j = h.jobs[k], prof = V.jobOfBlock(B[j.block]);
        if (!prof) continue;
        hv[k].job = j.pos; setProf(hv[k], prof);
        freeJobs.splice(freeJobs.indexOf(j), 1);
      }
    }
    for (const v of rec.villagers) {
      if (v.job) continue;
      if (r() < 0.08) { v.prof = 'nitwit'; continue; }
      const j = freeJobs.shift(); if (!j) continue;
      const prof = V.jobOfBlock(B[j.block]); if (!prof) continue;
      v.job = j.pos; setProf(v, prof);
    }
    return rec;
  }
  V.getRec = getRec;

  function spawnVillager(g, v, x, y, z, plan) {
    const m = g.spawnMob('villager', x, y, z, v && v.baby ? { small: true } : null);
    m.vrec = v || { uid: 'egg' + Math.random(), prof: 'none', lvl: 1, xp: 0, trades: [], job: null, restock: Math.floor(g.time / 12000) };
    m.plan = plan || null; m.villageId = plan ? plan.id : null;
    applyLook(m);
    return m;
  }
  V.spawnVillager = spawnVillager;
  function spawnGolem(g, x, y, z, plan, built) {
    const m = g.spawnMob('iron_golem', x, y, z);
    m.plan = plan || null; m.villageId = plan ? plan.id : null; m.playerBuilt = !!built;
    return m;
  }
  V.spawnGolem = spawnGolem;

  function syncVillages(g) {
    const w = g.world, p = g.player;
    if (w.dim !== 'overworld' || !p) return;
    if (g.worldMeta && V.worldId !== g.worldMeta.id) { V.records = {}; V.worldId = g.worldMeta.id; }
    const px = p.pos.x, pz = p.pos.z;
    const plans = V.plansNear(w, Math.floor(px) - 96, Math.floor(pz) - 96, Math.floor(px) + 96, Math.floor(pz) + 96);
    for (const plan of plans) {
      if (Math.hypot(plan.cx - px, plan.cz - pz) > 110) continue;
      if (!w.isLoaded(plan.cx, plan.cz)) continue;
      const rec = getRec(plan, g);
      const live = new Set(); let golems = 0;
      for (const m of g.mobs) if (!m.dead && m.villageId === plan.id) { if (m.vrec) live.add(m.vrec); if (m.type === 'iron_golem') golems++; }
      for (const v of rec.villagers) {
        if (live.has(v)) continue;
        const b = v.bed;
        if (!w.isLoaded(b[0], b[2]) || !w.getChunk(b[0] >> 4, b[2] >> 4).meshes) continue;
        spawnVillager(g, v, b[0] + 0.5, b[1] + 0.6, b[2] + 0.5, plan);
      }
      if (rec.golem > golems) {
        const gx = plan.golem[0], gz = plan.golem[2];
        if (w.isLoaded(gx, gz) && w.getChunk(gx >> 4, gz >> 4).meshes) { const y = g.surfaceAt(gx, gz); if (y > 0) spawnGolem(g, gx + 0.5, y, gz + 0.5, plan); }
      }
      villageLife(g, plan, rec);
    }
  }

  // 补货、繁殖
  function villageLife(g, plan, rec) {
    const key = Math.floor(g.time / 12000);
    for (const v of rec.villagers) if (v.restock !== key) { v.restock = key; for (const o of v.trades || []) o.uses = 0; }
    rec.breedT = (rec.breedT || 0) + 1;
    if (rec.breedT < 60) return; // 约每 60 秒检查一次（本函数每秒调用）
    rec.breedT = 0;
    const free = plan.beds.filter(b => !rec.villagers.some(v => v.bed === b || (v.bed && v.bed.join() === b.join())));
    const adults = rec.villagers.filter(v => !v.baby).length;
    if (free.length && rec.food >= 6 && adults >= 2 && Math.random() < 0.5) {
      rec.food -= 6;
      const v = { uid: plan.id + ':b' + Date.now().toString(36), bed: free[0], prof: 'none', lvl: 1, xp: 0, trades: [], job: null, restock: key, baby: true };
      rec.villagers.push(v);
      const parent = g.mobs.find(m => !m.dead && m.vrec && m.villageId === plan.id && !m.small);
      if (parent) {
        const m = spawnVillager(g, v, parent.pos.x, parent.pos.y + 0.2, parent.pos.z, plan);
        g.particles.burst(m.pos.x, m.pos.y + 1, m.pos.z, [255, 120, 160], 12, 1);
      }
    }
  }

  // ---------------- 外观（占位模型，models 模块会覆盖） ----------------
  const ROBE = { farmer: [196, 160, 92], librarian: [226, 222, 206], armorer: [70, 72, 82], weaponsmith: [56, 56, 60], toolsmith: [104, 78, 58], butcher: [236, 236, 236], leatherworker: [142, 94, 52], cleric: [140, 60, 160], shepherd: [214, 214, 210], fletcher: [170, 120, 70], cartographer: [190, 170, 130], mason: [120, 120, 124], fisherman: [70, 110, 140], nitwit: [84, 140, 64], none: [122, 88, 62] };
  // mob.profession 始终与记录同步（models 模块按它选皮肤）
  function bindProf(m) { if (!Object.getOwnPropertyDescriptor(m, 'profession')) Object.defineProperty(m, 'profession', { get() { return (m.vrec && m.vrec.prof) || 'none'; }, configurable: true }); }
  function applyLook(m) {
    bindProf(m);
    const P = m.model && m.model.P;
    if (!P || !m.model.root.userData.vPlaceholder) return;
    const prof = (m.vrec && m.vrec.prof) || 'none';
    const t = skinTex('villager_robe_' + prof, ROBE[prof] || ROBE.none, (ctx, r) => { if (prof !== 'none' && prof !== 'nitwit') { ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(2, 0, 4, 8); } });
    for (const part0 of [P.body, P.arms0]) if (part0) part0.material.forEach(mt => { mt.map = t; });
  }
  V.applyLook = applyLook;
  if (!MODELS.villager) MODELS.villager = (small) => {
    const root = new THREE.Group(), mats = [], P = { legs: [], arms: [] };
    root.userData.vPlaceholder = true;
    for (const s of [-1, 1]) { const lg = pivot(part(mats, 4, 12, 4, [92, 70, 50], 'villager_leg'), s * 2, 12, 0, -6); root.add(lg); P.legs.push(lg); }
    const bd = part(mats, 8, 12, 6, ROBE.none, 'villager_robe'); bd.position.set(0, 18 / 16, 0); root.add(bd); P.body = bd;
    const hd = pivot(part(mats, 8, 10, 8, [190, 140, 110], 'villager_head', (ctx) => { ctx.fillStyle = '#3a2a1a'; ctx.fillRect(1, 2, 6, 1); ctx.fillStyle = '#fff'; ctx.fillRect(1, 3, 2, 1); ctx.fillRect(5, 3, 2, 1); ctx.fillStyle = '#2a7a3a'; ctx.fillRect(2, 3, 1, 1); ctx.fillRect(5, 3, 1, 1); }), 0, 24, 0, 5);
    const nose = part(mats, 2, 4, 2, [176, 124, 96], 'villager_nose'); nose.position.set(0, -1 / 16, 5 / 16); hd.children[0].add(nose);
    root.add(hd); P.head = hd;
    const arms = part(mats, 8, 4, 4, ROBE.none, 'villager_arms'); arms.position.set(0, 20 / 16, 4 / 16); arms.rotation.x = -0.3; root.add(arms); P.arms0 = arms;
    if (small) root.scale.setScalar(0.55);
    return { root, mats, P };
  };
  if (!MODELS.iron_golem) MODELS.iron_golem = () => {
    const root = new THREE.Group(), mats = [], P = { legs: [], arms: [] };
    const IRON = [212, 206, 196];
    const vines = (ctx, r) => { ctx.fillStyle = '#4a7a2a'; for (let i = 0; i < 6; i++) ctx.fillRect(r() * 8 | 0, r() * 8 | 0, 1, 2); };
    for (const s of [-1, 1]) { const lg = pivot(part(mats, 6, 16, 5, IRON, 'golem_leg'), s * 4, 16, 0, -8); root.add(lg); P.legs.push(lg); }
    const bd = part(mats, 18, 13, 11, IRON, 'golem_body', null); bd.position.set(0, (16 + 6.5) / 16, 0); root.add(bd); P.body = bd;
    bd.material.forEach(mt => { mt.map = skinTex('golem_body_v', IRON, vines); });
    const hd = pivot(part(mats, 8, 10, 8, IRON, 'golem_head', (ctx) => { ctx.fillStyle = '#5a2a1a'; ctx.fillRect(1, 3, 2, 1); ctx.fillRect(5, 3, 2, 1); ctx.fillStyle = '#9a8a7a'; ctx.fillRect(3, 4, 2, 3); }), 0, 29, 2, 5);
    root.add(hd); P.head = hd;
    for (const s of [-1, 1]) { const ar = pivot(part(mats, 4, 28, 6, IRON, 'golem_arm'), s * 11, 28, 0, -13); root.add(ar); P.arms.push(ar); }
    return { root, mats, P };
  };

  // ---------------- 寻路辅助：进出房屋走门 ----------------
  function houseAt(plan, x, z) {
    if (!plan) return null;
    for (const h of plan.houses) if (h.door && x >= h.rc.x0 && x < h.rc.x1 + 1 && z >= h.rc.z0 && z < h.rc.z1 + 1) return h;
    return null;
  }
  function waypoint(m, tx, tz) {
    const hs = houseAt(m.plan, m.pos.x, m.pos.z), ht = houseAt(m.plan, tx, tz);
    if (hs && hs !== ht) {
      const di = hs.doorIn, d1 = Math.hypot(m.pos.x - di[0] - 0.5, m.pos.z - di[2] - 0.5);
      if (!m.leaving && d1 > 0.6) return [di[0] + 0.5, di[2] + 0.5];
      m.leaving = true; return [hs.door[0] + 0.5, hs.door[1] + 0.5];
    }
    m.leaving = false;
    if (ht && hs !== ht) {
      const d0 = Math.hypot(m.pos.x - ht.door[0] - 0.5, m.pos.z - ht.door[1] - 0.5);
      if (d0 > 0.7) return [ht.door[0] + 0.5, ht.door[1] + 0.5];
      return [ht.doorIn[0] + 0.5, ht.doorIn[2] + 0.5];
    }
    return [tx, tz];
  }

  // ---------------- 村民 AI ----------------
  function nearestHostile(g, m, r, types) {
    let best = null, bd = r;
    for (const o of g.mobs) {
      if (o.dead || o === m || !o.def.hostile) continue;
      if (types && !types.includes(o.type)) continue;
      const d = Math.hypot(o.pos.x - m.pos.x, o.pos.y - m.pos.y, o.pos.z - m.pos.z);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }
  function villagerAI(m, dt, g) {
    const v = m.vrec || (m.vrec = { uid: 'x' + Math.random(), prof: 'none', lvl: 1, xp: 0, trades: [], restock: 0 });
    const pl = g.player, w = m.world;
    if (v.baby && !m.small) v.baby = false;
    m.thinkT = (m.thinkT || Math.random() * 3) - dt;
    if (m.alarm > 0) m.alarm -= dt;
    if (m.trading) {
      m.yaw = Math.atan2(pl.pos.x - m.pos.x, pl.pos.z - m.pos.z);
      m.steer(0, 0, 0, dt); m.physics(dt); return true;
    }
    const T = g.time % 24000, night = T > 12500 && T < 23500;
    let tx = null, tz = null, sp = 2.2, stop = 0.8;
    const threat = nearestHostile(g, m, 8, UNDEAD_HUNTERS);
    if (threat || m.flee > 0) {
      const src = threat || pl;
      const dx = m.pos.x - src.pos.x, dz = m.pos.z - src.pos.z, l = Math.hypot(dx, dz) || 1;
      tx = m.pos.x + dx / l * 6; tz = m.pos.z + dz / l * 6; sp = 3.4; stop = 0;
      if (Math.random() < dt * 0.5) g.audio.sfx('villager.hurt', m.pos, 0.6);
    } else if (m.alarm > 0) {
      const a = m.alarmAt || (m.plan ? m.plan.center : null);
      if (a) { tx = a[0]; tz = a[2]; sp = 3.2; stop = 2.5; }
    } else if (night && v.bed) {
      tx = v.bed[0] + 0.5; tz = v.bed[2] + 0.5; sp = 2.2; stop = 0.7;
    } else if (v.job && T > 2000 && T < 9000 && !m.small) {
      tx = v.job[0] + 0.5; tz = v.job[2] + 0.5; stop = 1.6;
      // 农民收割附近成熟作物（为村庄积累食物）
      if (v.prof === 'farmer' && m.thinkT <= 0) harvest(g, m);
    } else {
      if (!m.wander || m.thinkT <= 0 || Math.hypot(m.wander[0] - m.pos.x, m.wander[1] - m.pos.z) < 1) {
        const c = m.plan ? [m.plan.cx, m.plan.cz] : [m.home ? m.home[0] : m.pos.x, m.home ? m.home[1] : m.pos.z];
        if (!m.plan && !m.home) m.home = [m.pos.x, m.pos.z];
        m.wander = Math.random() < 0.35 ? null : [c[0] + (Math.random() - 0.5) * 36, c[1] + (Math.random() - 0.5) * 36];
      }
      if (m.wander) { tx = m.wander[0]; tz = m.wander[1]; sp = 1.6; }
    }
    if (m.thinkT <= 0) {
      m.thinkT = 4 + Math.random() * 4;
      checkJob(g, m, v);
      // 卡住了就换个目标
      if (m.lastP && Math.hypot(m.lastP[0] - m.pos.x, m.lastP[1] - m.pos.z) < 0.4 && tx !== null && Math.hypot(tx - m.pos.x, tz - m.pos.z) > 2) { m.wander = null; m.stuck = (m.stuck || 0) + 1; }
      else m.stuck = 0;
      m.lastP = [m.pos.x, m.pos.z];
    }
    if (tx !== null) {
      let [wx, wz] = waypoint(m, tx, tz);
      if (m.stuck > 1) { wx = m.pos.x + Math.sin(m.age) * 3; wz = m.pos.z + Math.cos(m.age) * 3; }
      const dx = wx - m.pos.x, dz = wz - m.pos.z, d = Math.hypot(dx, dz);
      const final = wx === tx && wz === tz;
      if (!final || d > stop) m.steer(dx, dz, sp, dt);
      else m.steer(0, 0, 0, dt);
    } else m.steer(0, 0, 0, dt);
    m.physics(dt);
    return true;
  }
  function harvest(g, m) {
    const w = m.world, bx = Math.floor(m.pos.x), by = Math.floor(m.pos.y), bz = Math.floor(m.pos.z);
    for (let x = bx - 4; x <= bx + 4; x++) for (let z = bz - 4; z <= bz + 4; z++) for (let y = by - 1; y <= by + 1; y++) {
      const id = w.getBlock(x, y, z);
      if (id && BLOCKS[id].crop && w.getMeta(x, y, z) >= 7) {
        w.setMeta(x, y, z, 0);
        g.particles.blockBreak(x, y, z, id);
        const rec = m.villageId && V.records[m.villageId]; if (rec) rec.food = (rec.food || 0) + 1;
        return;
      }
    }
  }
  // 校验工作站点；无业村民寻找附近未被占用的站点
  function checkJob(g, m, v) {
    const w = m.world;
    if (v.prof === 'nitwit' || m.small) return;
    if (v.job) {
      const [x, y, z] = v.job;
      if (!w.isLoaded(x, z)) return;
      const prof = V.jobOfBlock(w.getBlock(x, y, z));
      if (prof === v.prof) return;
      v.job = null;
      if (!v.xp) { v.prof = 'none'; v.trades = []; applyLook(m); }
      return;
    }
    const claimed = new Set();
    for (const o of g.mobs) if (o.vrec && o.vrec.job && o !== m) claimed.add(o.vrec.job.join());
    for (const rec of Object.values(V.records)) for (const o of rec.villagers) if (o.job) claimed.add(o.job.join());
    const bx = Math.floor(m.pos.x), by = Math.floor(m.pos.y), bz = Math.floor(m.pos.z);
    let best = null, bd = 1e9;
    for (let x = bx - 12; x <= bx + 12; x++) for (let z = bz - 12; z <= bz + 12; z++) for (let y = by - 3; y <= by + 3; y++) {
      const prof = V.jobOfBlock(w.getBlock(x, y, z));
      if (!prof || claimed.has(x + ',' + y + ',' + z)) continue;
      if (v.prof !== 'none' && prof !== v.prof) continue;
      const d = Math.abs(x - bx) + Math.abs(z - bz) + Math.abs(y - by);
      if (d < bd) { bd = d; best = [x, y, z, prof]; }
    }
    if (!best) return;
    v.job = best.slice(0, 3);
    if (v.prof !== best[3]) { setProf(v, best[3]); applyLook(m); g.particles.burst(m.pos.x, m.pos.y + 2, m.pos.z, [80, 220, 80], 10, 1); g.audio.sfx('villager.yes', m.pos); }
  }

  // ---------------- 铁傀儡 AI ----------------
  function golemAI(m, dt, g) {
    const pl = g.player;
    if (m.angerT > 0) m.angerT -= dt;
    if (m.hurtTime > 0.45) { m.vel.x *= 0.2; m.vel.z *= 0.2; m.vel.y = Math.min(m.vel.y, 1); } // 抗击退
    let target = null;
    if (m.angerT > 0 && pl.alive && pl.mode === 'survival' && m.distTo(pl) < 24) target = pl;
    if (!target) {
      let bd = 16;
      for (const o of g.mobs) {
        if (o.dead || !o.def.hostile || o.type === 'creeper') continue;
        const d = m.distTo(o); if (d < bd) { bd = d; target = o; }
      }
    }
    if (target) {
      const dx = target.pos.x - m.pos.x, dz = target.pos.z - m.pos.z, d = Math.hypot(dx, dz);
      m.steer(dx, dz, d > 2 ? 2.6 : 0, dt);
      if (d < m.w + target.w + 1.4 && Math.abs(target.pos.y - m.pos.y) < 2.2 && m.attackCd <= 0) {
        m.attackCd = 1.25;
        const dmg = 7 + rn(14);
        if (target.hurt(dmg, 'mob', m)) {
          const l = d || 1;
          target.vel.x += dx / l * 3; target.vel.z += dz / l * 3; target.vel.y = 10; // 击飞
        }
        m.swingT = 0.4;
        g.audio.sfx('mobs_mc_iron_golem_random', m.pos);
      }
    } else {
      if (!m.wander || Math.random() < dt * 0.1) {
        const c = m.plan ? [m.plan.cx, m.plan.cz] : [m.pos.x, m.pos.z];
        m.wander = Math.random() < 0.5 ? null : [c[0] + (Math.random() - 0.5) * 28, c[1] + (Math.random() - 0.5) * 28];
      }
      if (m.wander && Math.hypot(m.wander[0] - m.pos.x, m.wander[1] - m.pos.z) > 1) m.steer(m.wander[0] - m.pos.x, m.wander[1] - m.pos.z, 1.1, dt);
      else m.steer(0, 0, 0, dt);
    }
    m.physics(dt);
    if (m.swingT > 0) m.swingT -= dt;
    return true;
  }

  // ---------------- 僵尸攻击村民 ----------------
  function wrapZombie(type) {
    const def = MOB_DEFS[type]; if (!def || def._vWrapped) return;
    const old = def.ai; def._vWrapped = true;
    def.ai = function (m, dt, g) {
      if (old && old(m, dt, g) !== false) return true;
      const pl = g.player;
      let best = null, bd = 16;
      for (const o of g.mobs) if (!o.dead && o.type === 'villager') { const d = m.distTo(o); if (d < bd) { bd = d; best = o; } }
      if (!best) return false;
      if (pl.alive && pl.mode === 'survival' && m.distTo(pl) < bd) return false;
      const dx = best.pos.x - m.pos.x, dz = best.pos.z - m.pos.z;
      m.steer(dx, dz, m.def.speed, dt);
      if (bd < 1.6 + m.w && Math.abs(best.pos.y - m.pos.y) < 1.8 && m.attackCd <= 0) { m.attackCd = 1; best.hurt(m.def.dmg || 3, 'mob', m); }
      m.physics(dt);
      return true;
    };
  }

  // ---------------- 铁傀儡搭建 ----------------
  function tryBuildGolem(w, x, y, z) {
    const I = B.iron_block;
    if (w.getBlock(x, y - 1, z) !== I || w.getBlock(x, y - 2, z) !== I) return false;
    for (const [ax, az] of [[1, 0], [0, 1]]) {
      if (w.getBlock(x + ax, y - 1, z + az) !== I || w.getBlock(x - ax, y - 1, z - az) !== I) continue;
      const free = id => id === 0 || (BLOCKS[id].replaceable && !isLiquid(id));
      if (!free(w.getBlock(x + ax, y - 2, z + az)) || !free(w.getBlock(x - ax, y - 2, z - az))) continue;
      for (const [dx, dy, dz] of [[0, 0, 0], [0, -1, 0], [0, -2, 0], [ax, -1, az], [-ax, -1, -az]]) w.setBlock(x + dx, y + dy, z + dz, 0, 0, { noUpdate: true });
      if (typeof game !== 'undefined' && game.world === w) {
        const plan = V.plansNear(w, x - 1, z - 1, x + 1, z + 1)[0];
        spawnGolem(game, x + 0.5, y - 2, z + 0.5, plan, true);
        game.particles.burst(x + 0.5, y - 1, z + 0.5, [200, 200, 200], 30, 2);
        game.ui.chat('铁傀儡被召唤出来了');
      }
      return true;
    }
    return false;
  }
  V.tryBuildGolem = tryBuildGolem;

  // ---------------- 交易界面 ----------------
  const LOOK = st => `<img src="${iconURL(st.id)}" title="${esc(ITEMS[st.id] ? ITEMS[st.id].zh : st.id)}${st.ench ? ' ' + esc(enchText(st)) : ''}" class="${st.ench ? 'vglint' : ''}">`;
  function payOk(o, pay) {
    const need = {};
    need[o.a.id] = o.a.n; if (o.b) need[o.b.id] = (need[o.b.id] || 0) + o.b.n;
    for (const id in need) { let have = 0; for (const s of pay) if (s && s.id === id && !s.ench) have += s.n; if (have < need[id]) return false; }
    return true;
  }
  function currentOffer(ui) {
    const v = ui.vtMob && ui.vtMob.vrec; if (!v) return null;
    const sel = v.trades[ui.vtSel];
    if (sel && sel.uses < sel.max && payOk(sel, ui.vtPay)) return sel;
    return v.trades.find(o => o.uses < o.max && payOk(o, ui.vtPay)) || null;
  }
  function takeFromPay(pay, id, n) {
    for (let i = 0; i < pay.length && n > 0; i++) { const s = pay[i]; if (s && s.id === id && !s.ench) { const k = Math.min(n, s.n); s.n -= k; n -= k; if (s.n <= 0) pay[i] = null; } }
  }
  function giveBack(ui, arr) {
    const p = ui.g.player;
    for (let i = 0; i < arr.length; i++) if (arr[i]) { const s = arr[i]; const left = p.inventory.add(s.id, s.n, s.dmg, s.ench); if (left) ui.g.dropItem(p.pos.x, p.pos.y + 1, p.pos.z, s.id, left, s.dmg, s.ench); arr[i] = null; }
  }
  function fillFromInv(ui, slot, req) {
    if (!req) return;
    const inv = ui.g.player.inventory.slots;
    let n = req.n;
    for (let i = 0; i < inv.length && n > 0; i++) {
      const s = inv[i]; if (!s || s.id !== req.id || s.ench || s.dmg) continue;
      const k = Math.min(n, s.n); s.n -= k; n -= k; if (s.n <= 0) inv[i] = null;
      if (!ui.vtPay[slot]) ui.vtPay[slot] = { id: req.id, n: 0 };
      ui.vtPay[slot].n += k;
    }
  }
  V.selectOffer = (ui, i) => {
    const v = ui.vtMob.vrec, o = v.trades[i]; if (!o) return;
    ui.vtSel = i;
    giveBack(ui, ui.vtPay);
    fillFromInv(ui, 0, o.a); fillFromInv(ui, 1, o.b);
    ui.refresh();
  };
  SCREENS.trade = {
    title: '交易', wide: true,
    open(ui, mob) {
      ui.vtMob = mob; ui.vtPay = [null, null]; ui.vtSel = 0; mob.trading = true;
      const v = mob.vrec;
      SCREENS.trade.title = `${V.PROF_ZH[v.prof] || '村民'} - ${LV_ZH[(v.lvl || 1) - 1]}`;
      ui.g.audio.sfx('villager.trade', mob.pos);
    },
    close(ui) { giveBack(ui, ui.vtPay); if (ui.vtMob) ui.vtMob.trading = false; ui.vtMob = null; },
    render(ui) {
      const v = ui.vtMob.vrec;
      let rows = '';
      v.trades.forEach((o, i) => {
        rows += `<div class="vt-row ${i === ui.vtSel ? 'sel' : ''} ${o.uses >= o.max ? 'out' : ''}" data-vo="${i}">${LOOK(o.a)}<span class="vc">${o.a.n}</span>${o.b ? LOOK(o.b) + `<span class="vc">${o.b.n}</span>` : ''}<span class="va">→</span>${LOOK(o.out)}<span class="vc">${o.out.n > 1 ? o.out.n : ''}</span>${o.uses >= o.max ? '<span class="vx">缺货</span>' : `<span class="vx" style="color:#ddd">${o.max - o.uses}</span>`}</div>`;
      });
      if (!rows) rows = '<div class="vhint" style="padding:8px">没有可交易的物品</div>';
      const lvl = v.lvl || 1, cur = LV_XP[lvl - 1], nxt = LV_XP[lvl] || LV_XP[4];
      const frac = lvl >= 5 ? 1 : (v.xp - cur) / (nxt - cur);
      const o = currentOffer(ui);
      return `<div class="vtrade"><div class="vt-list">${rows}</div><div class="vt-right"><div class="vt-lvl">${esc(V.PROF_ZH[v.prof] || '')} · ${LV_ZH[lvl - 1]}</div><div class="vt-xp"><i style="width:${Math.max(0, Math.min(1, frac)) * 100}%"></i></div>
        <div class="vrow">${ui.slotHTML('vt_pay', 0, ui.vtPay[0])}${ui.slotHTML('vt_pay', 1, ui.vtPay[1])}<div class="arrow"></div>${ui.slotHTML('vt_out', 0, o ? o.out : null, 'big')}</div>
        <div class="vhint">点击左侧报价自动放入材料，再点结果格完成交易</div></div></div>`;
    },
    after(ui) {
      ui.el.screen.querySelectorAll('.vt-row').forEach(r => { r.onmousedown = e => { e.preventDefault(); V.selectOffer(ui, +r.dataset.vo); }; });
    },
    update(ui) { if (ui.vtMob && (ui.vtMob.dead || ui.vtMob.distTo(ui.g.player) > 8)) ui.closeScreen(); },
    containers: {
      vt_pay: { get: ui => ui.vtPay, quick: true },
      vt_out: {
        get: ui => { const o = currentOffer(ui); return [o ? o.out : null]; }, output: true,
        take(ui) {
          const o = currentOffer(ui); if (!o) return null;
          return doTrade(ui.g, ui.vtMob, o, ui.vtPay);
        },
      },
    },
  };
  function doTrade(g, mob, o, pay) {
    const v = mob.vrec;
    takeFromPay(pay, o.a.id, o.a.n); if (o.b) takeFromPay(pay, o.b.id, o.b.n);
    o.uses++;
    v.xp = (v.xp || 0) + (o.vxp || 1);
    g.player.addXp(3 + rn(3));
    g.audio.sfx('villager.yes', mob.pos);
    const nl = levelOf(v.xp);
    if (nl > (v.lvl || 1) && TRADES[v.prof]) {
      for (let l = (v.lvl || 1) + 1; l <= nl; l++) v.trades.push(...rollLevel(v.prof, l, 2));
      v.lvl = nl;
      g.particles.burst(mob.pos.x, mob.pos.y + 2.1, mob.pos.z, [100, 255, 100], 16, 1.2);
      if (g.ui.screen === 'trade') SCREENS.trade.title = `${V.PROF_ZH[v.prof]} - ${LV_ZH[nl - 1]}`;
    }
    const out = { id: o.out.id, n: o.out.n };
    if (o.out.ench) out.ench = Object.assign({}, o.out.ench);
    return out;
  }
  V.doTrade = doTrade;

  // ---------------- 生物定义 ----------------
  MOB_DEFS.villager = {
    zh: '村民', hp: 20, w: 0.3, h: 1.95, speed: 2.2, drops: () => [], xp: 0, villager: true,
    ai: villagerAI,
    onDeath(m) {
      const rec = m.villageId && V.records[m.villageId];
      if (rec) rec.villagers = rec.villagers.filter(v => v !== m.vrec);
      if (typeof game !== 'undefined' && m.lastAttacker && !m.lastAttacker.isPlayer) game.ui.chat('村民' + (m.vrec ? '（' + (V.PROF_ZH[m.vrec.prof] || '') + '）' : '') + '被' + (m.lastAttacker.def ? m.lastAttacker.def.zh : '怪物') + '杀死了');
    },
  };
  MOB_DEFS.iron_golem = {
    zh: '铁傀儡', hp: 100, w: 0.7, h: 2.7, speed: 2.0, noDespawn: true, xp: 0,
    drops: () => [['iron_ingot', 3 + rn(2)], ['poppy', rn(2)]],
    ai: golemAI,
    onDeath(m) { const rec = m.villageId && V.records[m.villageId]; if (rec && !m.playerBuilt) rec.golem = 0; },
  };

  FEATURES.push({
    name: 'village_mobs',
    items() {
      defItem('villager_spawn_egg', '村民刷怪蛋', { spawnEgg: 'villager', creativeOnly: true, icon: 'mobs_mc_spawn_icon_villager' });
      defItem('iron_golem_spawn_egg', '铁傀儡刷怪蛋', { spawnEgg: 'iron_golem', creativeOnly: true, icon: 'mobs_mc_spawn_icon_iron_golem' });
      for (const t of UNDEAD_HUNTERS) wrapZombie(t);
      Object.assign(SND_MAP, { 'villager.death': 'mobs_mc_villager_hurt', 'iron_golem.say': 'mobs_mc_iron_golem_random' });
    },
    tick(g) {
      if (g.world.tick % 20 === 0) {
        for (const t of UNDEAD_HUNTERS) wrapZombie(t);
        syncVillages(g);
        // 刷怪蛋 / 命令召唤的村民没有记录，补一个临时记录
        for (const m of g.mobs) if (m.type === 'villager' && !m.vrec) { m.vrec = { uid: 'x' + Math.random(), prof: 'none', lvl: 1, xp: 0, trades: [], job: null, restock: 0 }; applyLook(m); }
      }
    },
    useMob(g, p, m, held) {
      if (held && ITEMS[held.id] && ITEMS[held.id].spawnEgg) return false;
      if (m.type === 'iron_golem') {
        if (held && held.id === 'iron_ingot' && m.health < m.def.hp) { m.health = Math.min(m.def.hp, m.health + 25); p.consume(1); g.audio.sfx('mobs_mc_iron_golem_random', m.pos); return true; }
        return false;
      }
      if (m.type !== 'villager') return false;
      const v = m.vrec;
      if (m.small || !v || !v.trades || !v.trades.length) {
        g.audio.sfx('villager.say', m.pos, 1, 0.8);
        m.yaw = Math.atan2(p.pos.x - m.pos.x, p.pos.z - m.pos.z);
        if (v && v.prof === 'nitwit') g.ui.chat('傻子村民不会交易');
        else if (!m.small) g.ui.chat('这个村民还没有职业，在附近放置工作站点方块让他就业');
        return true;
      }
      g.ui.openScreen('trade', m);
      return true;
    },
    damageTaken(g, e, dmg, src, attacker) {
      if (e.type === 'iron_golem' && (src === 'fall' || src === 'drown')) return 0;
      if (e.type === 'iron_golem' && attacker && attacker.isPlayer && !e.playerBuilt) e.angerT = 30;
      if (e.type === 'villager' && attacker && attacker.isPlayer) {
        for (const o of g.mobs) if (o.type === 'iron_golem' && !o.dead && !o.playerBuilt && o.distTo(e) < 32) o.angerT = 30;
      }
      return dmg;
    },
    blockUpdate(w, x, y, z, id) {
      if (id === B.pumpkin || (B.carved_pumpkin !== undefined && id === B.carved_pumpkin) || (B.jack_o_lantern !== undefined && id === B.jack_o_lantern)) return tryBuildGolem(w, x, y, z);
      return false;
    },
    save() { return { records: V.records }; },
    load(g, json) { V.records = (json && json.records) || {}; V.worldId = g.worldMeta ? g.worldMeta.id : null; },
  });
})();
