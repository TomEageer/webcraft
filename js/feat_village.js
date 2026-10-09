'use strict';
// ---------- 村庄模块（一）：职业方块、土径、刷怪笼、下界合金工具及其界面 ----------
(() => {
  const V = window.VILLAGE = window.VILLAGE || {};

  // 职业 -> 工作站点方块名（方块可能由其他模块定义，按名字引用）
  V.JOBS = {
    farmer: 'composter', librarian: 'lectern', armorer: 'blast_furnace', weaponsmith: 'grindstone', toolsmith: 'smithing_table',
    butcher: 'smoker', leatherworker: 'cauldron', cleric: 'brewing_stand', shepherd: 'loom', fletcher: 'fletching_table',
    cartographer: 'cartography_table', mason: 'stonecutter', fisherman: 'barrel',
  };
  V.PROF_ZH = {
    farmer: '农民', librarian: '图书管理员', armorer: '盔甲匠', weaponsmith: '武器匠', toolsmith: '工具匠', butcher: '屠夫',
    leatherworker: '皮匠', cleric: '牧师', shepherd: '牧羊人', fletcher: '制箭师', cartographer: '制图师', mason: '石匠',
    fisherman: '渔夫', nitwit: '傻子', none: '无业村民',
  };
  V.jobOfBlock = id => { for (const p in V.JOBS) if (B[V.JOBS[p]] !== undefined && B[V.JOBS[p]] === id) return p; return null; };

  // 只读的单格视图：让 SCREENS 容器能直接读写 tile.items 的某一格
  const view = (getArr, idx) => ({ get 0() { return getArr()[idx]; }, set 0(v) { getArr()[idx] = v; }, length: 1 });
  V.view = view;

  const T16 = v => v / 16;
  const tex = n => TEX[n];

  // ---------------- 盒子形状 ----------------
  const PATH_BOX = [[0, 0, 0, 1, 15 / 16, 1]];
  const compCache = [];
  function composterBoxes(m) {
    if (compCache[m]) return compCache[m];
    const t = 2 / 16, side = f => (f === 2 ? tex('mcl_composter_top') : f === 3 ? tex('mcl_composter_bottom') : tex('mcl_composter_side'));
    const bx = [
      [0, 0, 0, 1, 1, t, { tex: side }], [0, 0, 1 - t, 1, 1, 1, { tex: side }],
      [0, 0, t, t, 1, 1 - t, { tex: side }], [1 - t, 0, t, 1, 1, 1 - t, { tex: side }],
      [t, 0, t, 1 - t, t, 1 - t, { tex: f => (f === 2 ? tex('mcl_composter_bottom') : -1) }],
    ];
    if (m > 0) {
      const h = Math.min(15, 1 + 2 * Math.min(m, 7)) / 16;
      bx.push([t, t, t, 1 - t, h, 1 - t, { tex: f => (f === 2 ? tex(m >= 8 ? 'mcl_composter_ready' : 'mcl_composter_compost') : -1) }]);
    }
    return (compCache[m] = bx);
  }
  let lecternB = null, bellB = null, cutterB = null;
  function lecternBoxes() {
    if (lecternB) return lecternB;
    const pl = () => tex('oak_planks');
    return (lecternB = [
      [0, 0, 0, 1, T16(2), 1, { tex: pl }],
      [T16(4), T16(2), T16(4), T16(12), T16(13), T16(12), { tex: f => (f >= 2 && f < 4 ? pl() : tex('v_lectern_side')) }],
      [0, T16(13), 0, 1, 1, 1],
    ]);
  }
  function bellBoxes() {
    if (bellB) return bellB;
    const wood = () => tex('spruce_planks'), gold = () => tex('mcl_bells_bell_top');
    return (bellB = [
      [0, 0, T16(6), T16(2), 1, T16(10), { tex: wood }], [T16(14), 0, T16(6), 1, 1, T16(10), { tex: wood }],
      [T16(2), T16(13), T16(7), T16(14), T16(15), T16(9), { tex: wood }],
      [T16(5), T16(5), T16(5), T16(11), T16(13), T16(11), { tex: gold }],
      [T16(4), T16(3), T16(4), T16(12), T16(5), T16(12), { tex: gold }],
    ]);
  }
  function cutterBoxes() {
    if (cutterB) return cutterB;
    return (cutterB = [[0, 0, 0, 1, T16(9), 1], [T16(1), T16(9), T16(7.5), T16(15), 1, T16(8.5), { tex: f => (f >= 4 ? tex('mcl_stonecutter_saw') : -1), uv: () => [1, 0, 15, 7], noCull: true }]]);
  }

  // ---------------- 堆肥 ----------------
  const COMPOST = {
    wheat_seeds: 0.3, short_grass: 0.3, fern: 0.3, kelp: 0.3, sweet_berries: 0.3, beetroot_seeds: 0.3, melon_seeds: 0.3, pumpkin_seeds: 0.3,
    sugar_cane: 0.5, cactus: 0.5, melon_slice: 0.5, red_shrub: 0.5,
    wheat: 0.65, apple: 0.65, carrot: 0.65, potato: 0.65, beetroot: 0.65, pumpkin: 0.65, melon: 0.65, red_mushroom: 0.65, brown_mushroom: 0.65, shelf_mushroom: 0.65,
    bread: 0.85, hay_block: 0.85, baked_potato: 0.85, cookie: 0.85, pumpkin_pie: 1,
  };
  V.compostChance = name => {
    if (COMPOST[name] !== undefined) return COMPOST[name];
    const it = ITEMS[name]; if (!it || it.block === undefined) return 0;
    const d = BLOCKS[it.block];
    if (d.leaves || d.sapling) return 0.3;
    if (d.plant) return 0.65;
    return 0;
  };

  // ---------------- 切石机配方 ----------------
  const CUTS = {
    stone: [['stone_bricks', 1], ['stone_brick_slab', 2], ['stone_brick_stairs', 1], ['stone_slab', 2], ['stone_stairs', 1], ['chiseled_stone_bricks', 1], ['stone_brick_wall', 1]],
    stone_bricks: [['stone_brick_slab', 2], ['stone_brick_stairs', 1], ['stone_brick_wall', 1], ['chiseled_stone_bricks', 1]],
    cobblestone: [['cobblestone_slab', 2], ['cobblestone_stairs', 1], ['cobblestone_wall', 1]],
    mossy_cobblestone: [['mossy_cobblestone_slab', 2], ['mossy_cobblestone_stairs', 1], ['mossy_cobblestone_wall', 1]],
    sandstone: [['sandstone_slab', 2], ['sandstone_stairs', 1], ['sandstone_wall', 1], ['cut_sandstone', 1], ['chiseled_sandstone', 1]],
    bricks: [['brick_slab', 2], ['brick_stairs', 1], ['brick_wall', 1]],
    cobbled_deepslate: [['polished_deepslate', 1], ['deepslate_bricks', 1], ['deepslate_tiles', 1], ['cobbled_deepslate_slab', 2], ['cobbled_deepslate_stairs', 1]],
    sulfur: [['polished_sulfur', 1], ['sulfur_bricks', 1], ['sulfur_slab', 2], ['sulfur_stairs', 1]],
    polished_sulfur: [['sulfur_bricks', 1]],
    cinnabar: [['polished_cinnabar', 1], ['cinnabar_bricks', 1], ['cinnabar_slab', 2], ['cinnabar_stairs', 1]],
    polished_cinnabar: [['cinnabar_bricks', 1]],
  };
  V.cutOptions = name => (CUTS[name] || []).filter(([n]) => ITEMS[n]).map(([n, c]) => ({ id: n, n: c }));

  // ---------------- 烟熏炉 / 高炉 ----------------
  const smeltFilter = {
    smoker: inp => { const r = SMELT[inp]; return !!(r && ITEMS[r] && ITEMS[r].food); },
    blast_furnace: inp => { const r = SMELT[inp]; return !!r && (/_ore$|^raw_|^ancient_debris$/.test(inp) || /_ingot$|_nugget$|^netherite_scrap$/.test(r)); },
  };
  V.smeltFilter = smeltFilter;
  function newFurnaceTile(type) { return { type, items: [null, null, null], burn: 0, burnMax: 0, cook: 0, xp: 0 }; }
  function getTile(g, pos, make) {
    const k = pos.join(',');
    if (!g.world.tiles.has(k) && make) g.world.tiles.set(k, make());
    const c = g.world.getChunk(pos[0] >> 4, pos[2] >> 4); if (c) c.modified = true;
    return g.world.tiles.get(k);
  }
  V.getTile = getTile;
  function tickVFurnaces(g) {
    const w = g.world;
    for (const [k, t] of w.tiles) {
      if (t.type !== 'smoker' && t.type !== 'blast_furnace') continue;
      const [x, y, z] = k.split(',').map(Number);
      if (!w.isLoaded(x, z)) continue;
      const [inp, fuel, out] = t.items;
      const res = inp && smeltFilter[t.type](inp.id) ? SMELT[inp.id] : null;
      const can = res && (!out || (out.id === res && out.n < ITEMS[res].stack));
      const wasLit = t.burn > 0;
      // 燃料消耗速度是普通熔炉的两倍，冶炼时间减半
      if (t.burn > 0) t.burn = Math.max(0, t.burn - 2);
      if (t.burn <= 0 && can && fuel && fuelValue(fuel.id)) {
        t.burn = t.burnMax = fuelValue(fuel.id);
        if (fuel.id === 'lava_bucket') t.items[1] = { id: 'bucket', n: 1 }; else if (--fuel.n <= 0) t.items[1] = null;
        t._dirtyUI = true;
      }
      if (t.burn > 0 && can) {
        t.cook++;
        if (t.cook >= 100) {
          t.cook = 0;
          if (--inp.n <= 0) t.items[0] = null;
          if (t.items[2]) t.items[2].n++; else t.items[2] = { id: res, n: 1 };
          t.xp = (t.xp || 0) + (t.type === 'blast_furnace' ? 0.7 : 0.35); t._dirtyUI = true;
        }
      } else t.cook = Math.max(0, t.cook - 2);
      const lit = t.burn > 0, id = w.getBlock(x, y, z);
      const off = B[t.type], on = B['lit_' + t.type];
      if (lit !== wasLit || (lit && id === off) || (!lit && id === on)) {
        if (id === off || id === on) w.setBlock(x, y, z, lit ? on : off, w.getMeta(x, y, z), { keepTile: true, noUpdate: true });
      }
    }
  }

  function furnaceScreen(type, zh) {
    return {
      title: zh,
      open(ui, pos) { ui.vtile = getTile(ui.g, pos, () => newFurnaceTile(type)); ui.vpos = pos; },
      close(ui) { ui.vtile = null; },
      render(ui) {
        const t = ui.vtile;
        return `<div class="furnace"><div class="fcol">${ui.slotHTML('vf_in', 0, t.items[0])}<div class="flame"><i id="vflame"></i></div>${ui.slotHTML('vf_fuel', 0, t.items[1])}</div><div class="farrow"><i id="vprog"></i></div>${ui.slotHTML('vf_out', 0, t.items[2], 'big')}</div><div class="vhint">${type === 'smoker' ? '只能烹饪食物，速度是熔炉的两倍' : '只能冶炼矿石与金属，速度是熔炉的两倍'}</div>`;
      },
      after(ui) { this.update(ui); },
      update(ui) {
        const t = ui.vtile; if (!t) return;
        const f = document.getElementById('vflame'), p = document.getElementById('vprog');
        if (f) f.style.height = (t.burnMax ? t.burn / t.burnMax * 100 : 0) + '%';
        if (p) p.style.width = (t.cook / 100 * 100) + '%';
        if (t._dirtyUI) { t._dirtyUI = false; ui.renderScreen(); }
      },
      containers: {
        vf_in: { get: ui => view(() => ui.vtile.items, 0), accept: (ui, i, st) => smeltFilter[type](st.id), quick: true },
        vf_fuel: { get: ui => view(() => ui.vtile.items, 1), accept: (ui, i, st) => fuelValue(st.id) > 0, quick: true },
        vf_out: {
          get: ui => view(() => ui.vtile.items, 2), output: true,
          take(ui) {
            const t = ui.vtile, s = t.items[2]; if (!s) return null;
            t.items[2] = null;
            if (t.xp >= 1) { ui.g.player.addXp(Math.floor(t.xp)); t.xp -= Math.floor(t.xp); }
            return s;
          },
        },
      },
    };
  }
  SCREENS.smoker = furnaceScreen('smoker', '烟熏炉');
  SCREENS.blast_furnace = furnaceScreen('blast_furnace', '高炉');

  SCREENS.barrel = {
    title: '木桶',
    open(ui, pos) { ui.vtile = getTile(ui.g, pos, () => ({ type: 'barrel', items: new Array(27).fill(null) })); ui.g.audio.sfx('mcl_barrels_default_barrel_open', null); },
    close(ui) { ui.vtile = null; ui.g.audio.sfx('mcl_barrels_default_barrel_close', null); },
    render(ui) { let h = '<div class="grid9">'; for (let i = 0; i < 27; i++) h += ui.slotHTML('barrel', i, ui.vtile.items[i]); return h + '</div>'; },
    containers: { barrel: { get: ui => ui.vtile.items, quick: true } },
  };

  // ---------------- 锻造台 ----------------
  V.upgradeOf = name => {
    if (!/^diamond_/.test(name)) return null;
    const out = name.replace(/^diamond_/, 'netherite_');
    return ITEMS[out] ? out : null;
  };
  function smithResult(ui) {
    const [base, add] = ui.smIn;
    if (!base || !add || add.id !== 'netherite_ingot') return null;
    const out = V.upgradeOf(base.id); if (!out) return null;
    const r = { id: out, n: 1 };
    if (base.dmg) r.dmg = base.dmg;
    if (base.ench) r.ench = Object.assign({}, base.ench);
    if (base.name) r.name = base.name;
    return r;
  }
  V.smithResult = smithResult;
  const giveBack = (ui, arr) => {
    const p = ui.g.player;
    for (let i = 0; i < arr.length; i++) if (arr[i]) { const s = arr[i]; const left = p.inventory.add(s.id, s.n, s.dmg, s.ench); if (left) ui.g.dropItem(p.pos.x, p.pos.y + 1, p.pos.z, s.id, left, s.dmg, s.ench); arr[i] = null; }
  };
  SCREENS.smithing = {
    title: '锻造台',
    open(ui) { ui.smIn = [null, null]; },
    close(ui) { giveBack(ui, ui.smIn); },
    render(ui) {
      const r = smithResult(ui);
      return `<div class="vrow">${ui.slotHTML('sm_in', 0, ui.smIn[0])}<span class="vplus">+</span>${ui.slotHTML('sm_in', 1, ui.smIn[1])}<div class="arrow"></div>${ui.slotHTML('sm_out', 0, r, 'big')}</div><div class="vhint">放入钻石装备与下界合金锭，升级为下界合金装备（保留附魔与耐久）</div>`;
    },
    containers: {
      sm_in: { get: ui => ui.smIn, accept: (ui, i, st) => (i === 0 ? !!V.upgradeOf(st.id) : st.id === 'netherite_ingot'), quick: true },
      sm_out: {
        get: ui => [smithResult(ui)], output: true,
        take(ui) {
          const r = smithResult(ui); if (!r) return null;
          ui.smIn[0] = null;
          if (--ui.smIn[1].n <= 0) ui.smIn[1] = null;
          ui.g.audio.sfx('mcl_anvils_anvil_use', null) || ui.g.audio.play('anvil');
          return r;
        },
      },
    },
  };

  // ---------------- 切石机 ----------------
  SCREENS.stonecutter = {
    title: '切石机',
    open(ui) { ui.scIn = [null]; ui.scSel = -1; },
    close(ui) { giveBack(ui, ui.scIn); },
    render(ui) {
      const opts = ui.scIn[0] ? V.cutOptions(ui.scIn[0].id) : [];
      if (ui.scSel >= opts.length) ui.scSel = -1;
      let h = `<div class="vrow">${ui.slotHTML('sc_in', 0, ui.scIn[0])}<div class="vopts">`;
      opts.forEach((o, i) => { h += ui.slotHTML('sc_opt', i, o, i === ui.scSel ? 'vsel' : ''); });
      if (!opts.length) h += `<span class="vhint">${ui.scIn[0] ? '这种材料无法切割' : '放入石材'}</span>`;
      h += `</div><div class="arrow"></div>${ui.slotHTML('sc_out', 0, ui.scSel >= 0 ? opts[ui.scSel] : null, 'big')}</div>`;
      return h;
    },
    containers: {
      sc_in: { get: ui => ui.scIn, accept: (ui, i, st) => V.cutOptions(st.id).length > 0, quick: true },
      sc_opt: { get: ui => (ui.scIn[0] ? V.cutOptions(ui.scIn[0].id) : []), take(ui, i) { ui.scSel = i; return null; } },
      sc_out: {
        get: ui => { const o = ui.scIn[0] ? V.cutOptions(ui.scIn[0].id) : []; return [ui.scSel >= 0 ? o[ui.scSel] : null]; },
        output: true,
        take(ui) {
          if (!ui.scIn[0] || ui.scSel < 0) return null;
          const o = V.cutOptions(ui.scIn[0].id)[ui.scSel]; if (!o) return null;
          if (--ui.scIn[0].n <= 0) { ui.scIn[0] = null; ui.scSel = -1; }
          ui.g.audio.play('dig.stone');
          return { id: o.id, n: o.n };
        },
      },
    },
  };

  // ---------------- 刷怪笼：周期刷怪 + 旋转虚影 ----------------
  const ghosts = new Map();
  function tickSpawners(g) {
    const w = g.world, p = g.player;
    if (!p || !p.alive) return;
    for (const [k, t] of w.tiles) {
      if (t.type !== 'spawner' || !t.mob || !MOB_DEFS[t.mob]) continue;
      const [x, y, z] = k.split(',').map(Number);
      if (Math.abs(x - p.pos.x) > 16 || Math.abs(z - p.pos.z) > 16 || Math.abs(y - p.pos.y) > 16) continue;
      if (Math.hypot(x + 0.5 - p.pos.x, y + 0.5 - p.pos.y, z + 0.5 - p.pos.z) > 16) continue;
      if (w.getBlock(x, y, z) !== B.monster_spawner) continue;
      if (t.delay === undefined) t.delay = 200 + Math.floor(Math.random() * 600);
      if (--t.delay > 0) continue;
      t.delay = 200 + Math.floor(Math.random() * 600);
      const near = g.mobs.filter(m => !m.dead && m.type === t.mob && Math.abs(m.pos.x - x) < 9 && Math.abs(m.pos.z - z) < 9 && Math.abs(m.pos.y - y) < 5).length;
      if (near >= 6) continue;
      const n = 1 + Math.floor(Math.random() * 4);
      let made = 0;
      for (let a = 0; a < 16 && made < n && near + made < 6; a++) {
        const sx = x + Math.floor(Math.random() * 9) - 4, sy = y + Math.floor(Math.random() * 3) - 1, sz = z + Math.floor(Math.random() * 9) - 4;
        if (w.getBlock(sx, sy, sz) || w.getBlock(sx, sy + 1, sz) || !BLOCKS[w.getBlock(sx, sy - 1, sz)].solid) continue;
        g.spawnMob(t.mob, sx + 0.5, sy, sz + 0.5);
        g.particles.burst(sx + 0.5, sy + 0.8, sz + 0.5, [80, 80, 80], 12, 1);
        made++;
      }
      if (made) g.particles.burst(x + 0.5, y + 0.5, z + 0.5, [255, 160, 40], 10, 1);
    }
  }
  V.tickSpawners = tickSpawners;
  function frameSpawners(g, dt) {
    const w = g.world, p = g.player;
    if (!p || !g.scene) return;
    const seen = new Set();
    for (const [k, t] of w.tiles) {
      if (t.type !== 'spawner' || !t.mob) continue;
      const [x, y, z] = k.split(',').map(Number);
      if (Math.abs(x - p.pos.x) > 24 || Math.abs(z - p.pos.z) > 24 || Math.abs(y - p.pos.y) > 24) continue;
      if (w.getBlock(x, y, z) !== B.monster_spawner) continue;
      seen.add(k);
      let gh = ghosts.get(k);
      if (gh && gh.mob !== t.mob) { g.scene.remove(gh.m.root); gh = null; ghosts.delete(k); }
      if (!gh) {
        try {
          const m = buildMob(t.mob);
          const box = new THREE.Box3().setFromObject(m.root), hgt = Math.max(0.5, box.max.y - box.min.y);
          m.root.scale.setScalar(Math.min(0.45, 0.55 / hgt));
          g.scene.add(m.root); gh = { m, mob: t.mob }; ghosts.set(k, gh);
        } catch (e) { continue; }
      }
      gh.m.root.position.set(x + 0.5, y + 0.15, z + 0.5);
      gh.m.root.rotation.y += dt * (t.delay !== undefined && t.delay < 40 ? 6 : 1.5);
      const b = Math.max(0.35, Math.pow(0.82, 15 - Math.max(w.blockLight(x, y + 1, z), w.skyLight(x, y + 1, z) - g.skyDarken)));
      for (const mt of gh.m.mats) mt.color.setRGB(b, b, b);
      if (Math.random() < dt * 4) g.particles.add(x + Math.random(), y + Math.random(), z + Math.random(), 0, 0.5, 0, Math.random() < 0.5 ? [255, 140, 30] : [60, 60, 60], 0.6, -0.5);
    }
    for (const [k, gh] of ghosts) if (!seen.has(k)) { g.scene.remove(gh.m.root); ghosts.delete(k); }
  }

  // ---------------- 界面样式 ----------------
  function injectCSS() {
    if (document.getElementById('village-css')) return;
    const st = document.createElement('style'); st.id = 'village-css';
    st.textContent = `
.vrow { display: flex; align-items: center; gap: 10px; margin: 6px 0 8px; }
.vplus { font-size: 22px; font-weight: 700; color: #555; }
.vhint { font-size: 12px; color: #555; margin: 2px 0 6px; }
.vopts { display: grid; grid-template-columns: repeat(4, 40px); min-width: 160px; min-height: 40px; max-height: 124px; overflow-y: auto; background: #8b8b8b; align-items: center; }
.slot.vsel { outline: 3px solid #fff; outline-offset: -3px; }
.vtrade { display: flex; gap: 14px; }
.vt-list { width: 230px; max-height: 250px; overflow-y: auto; background: #8b8b8b; border: 2px solid; border-color: var(--slot-lo) var(--slot-hi) var(--slot-hi) var(--slot-lo); }
.vt-row { display: flex; align-items: center; gap: 2px; padding: 2px 4px; cursor: pointer; border-bottom: 1px solid #777; color: #fff; text-shadow: 1px 1px 0 #333; font-size: 13px; }
.vt-row:hover { background: #a0a0c8; }
.vt-row.sel { background: #b6b6e8; }
.vt-row.out { opacity: .45; }
.vt-row img { width: 26px; height: 26px; image-rendering: pixelated; }
.vt-row .vc { min-width: 18px; font-weight: 700; }
.vt-row .va { margin: 0 6px; color: #333; text-shadow: none; }
.vt-row .vx { margin-left: auto; font-size: 11px; color: #ff6060; }
.vt-row .vglint { box-shadow: 0 0 6px #c08aff; border-radius: 4px; }
.vt-right { display: flex; flex-direction: column; gap: 8px; }
.vt-lvl { font-size: 13px; }
.vt-xp { width: 200px; height: 6px; background: #333; } .vt-xp i { display: block; height: 100%; background: #6fda4a; }
`;
    document.head.appendChild(st);
  }

  // ---------------- 交互 ----------------
  function useBlock(g, p, hit, held) {
    const w = g.world, id = hit.id, pos = [hit.x, hit.y, hit.z];
    if (id === B.composter) {
      const m = w.getMeta(hit.x, hit.y, hit.z);
      if (m >= 8) {
        w.setMeta(hit.x, hit.y, hit.z, 0);
        g.dropItem(hit.x + 0.5, hit.y + 1.1, hit.z + 0.5, 'bone_meal', 1);
        g.audio.play('dig.grass');
        return true;
      }
      if (m === 7 || !held) return true;
      const ch = V.compostChance(held.id);
      if (!ch) return true;
      p.consume(1);
      if (Math.random() < ch) {
        const nm = m + 1;
        w.setMeta(hit.x, hit.y, hit.z, nm);
        if (nm === 7) w.schedule(hit.x, hit.y, hit.z, 20);
        g.particles.burst(hit.x + 0.5, hit.y + 1, hit.z + 0.5, [120, 200, 80], 8, 0.6);
      }
      g.audio.play('dig.grass');
      return true;
    }
    if (id === B.smithing_table) { g.ui.openScreen('smithing', pos); return true; }
    if (id === B.stonecutter) { g.ui.openScreen('stonecutter', pos); return true; }
    if (id === B.barrel) { g.ui.openScreen('barrel', pos); return true; }
    if (id === B.smoker || id === B.lit_smoker) { g.ui.openScreen('smoker', pos); return true; }
    if (id === B.blast_furnace || id === B.lit_blast_furnace) { g.ui.openScreen('blast_furnace', pos); return true; }
    if (id === B.bell) { V.ringBell(g, hit.x, hit.y, hit.z); p.swing = 1; return true; }
    if (id === B.cartography_table) { g.ui.chat('制图台：本作暂无地图物品，可作为制图师的工作站点'); return true; }
    if (id === B.loom) { g.ui.chat('织布机：本作暂无旗帜，可作为牧羊人的工作站点'); return true; }
    if (id === B.monster_spawner && held && ITEMS[held.id] && ITEMS[held.id].spawnEgg) {
      const t = getTile(g, pos, () => ({ type: 'spawner', mob: null, delay: 200 }));
      t.mob = ITEMS[held.id].spawnEgg; t.delay = 40;
      if (p.mode !== 'creative') p.consume(1);
      g.ui.chat('刷怪笼已设置为：' + (MOB_DEFS[t.mob] ? MOB_DEFS[t.mob].zh : t.mob));
      return true;
    }
    return false;
  }
  V.ringBell = (g, x, y, z) => {
    if (!g.audio.sfx('bell', new THREE.Vector3(x, y, z))) g.audio.play('click');
    g.particles.burst(x + 0.5, y + 0.6, z + 0.5, [250, 220, 90], 8, 0.8);
    let n = 0;
    for (const m of g.mobs) if (!m.dead && m.type === 'villager' && Math.hypot(m.pos.x - x, m.pos.z - z) < 48) { m.alarm = 30; m.alarmAt = [x + 0.5, y, z + 0.5]; n++; }
    return n;
  };

  function useItem(g, p, hit, held) {
    if (!hit || !held) return false;
    const it = ITEMS[held.id], w = g.world;
    if (!it || !it.tool) return false;
    const above = w.getBlock(hit.x, hit.y + 1, hit.z);
    // 锹：草方块/泥土 -> 土径
    if (it.tool.type === 'shovel' && (hit.id === B.grass_block || hit.id === B.dirt || hit.id === B.snowy_grass || (B.coarse_dirt !== undefined && hit.id === B.coarse_dirt) || (B.podzol !== undefined && hit.id === B.podzol) || (B.mycelium !== undefined && hit.id === B.mycelium)) && hit.n[1] !== -1 && (above === 0 || BLOCKS[above].replaceable && !isLiquid(above))) {
      if (above) w.setBlock(hit.x, hit.y + 1, hit.z, 0);
      w.setBlock(hit.x, hit.y, hit.z, B.grass_path);
      g.audio.digSound(B.grass_block, 1); p.swing = 1; p.damageHeld(1);
      return true;
    }
    // 锄：土径 -> 耕地
    if (it.tool.type === 'hoe' && hit.id === B.grass_path && above === 0) {
      w.setBlock(hit.x, hit.y, hit.z, B.farmland); g.audio.digSound(B.dirt, 1); p.damageHeld(1);
      return true;
    }
    return false;
  }

  FEATURES.push({
    name: 'village',
    blocks() {
      const wood = { hard: 2.5, tool: 'axe', fuel: 300, sound: 'wood' };
      defBlock('grass_path', '土径', { tex: { top: 'mcl_core_grass_path_top', side: 'mcl_core_grass_path_side', bottom: 'dirt' }, shape: 'boxes', opaque: false, boxes: () => PATH_BOX, hard: 0.65, tool: 'shovel', drop: 'dirt', sound: 'grass' });
      defBlock('composter', '堆肥桶', Object.assign({}, wood, { hard: 0.6, tex: { top: 'mcl_composter_top', side: 'mcl_composter_side', bottom: 'mcl_composter_bottom' }, texNames: ['mcl_composter_compost', 'mcl_composter_ready'], shape: 'boxes', opaque: false, render: 'cutout', boxes: m => composterBoxes(m), drop: 'composter' }));
      defBlock('lectern', '讲台', Object.assign({}, wood, { tex: { top: 'v_lectern_top', side: 'v_lectern_side', bottom: 'oak_planks' }, texNames: ['oak_planks'], shape: 'boxes', opaque: false, render: 'cutout', boxes: () => lecternBoxes() }));
      defBlock('smithing_table', '锻造台', Object.assign({}, wood, { tex: { top: 'mcl_smithing_table_top', bottom: 'mcl_smithing_table_bottom', side: 'mcl_smithing_table_side', front: 'mcl_smithing_table_front' } }));
      defBlock('barrel', '木桶', Object.assign({}, wood, { tex: { top: 'mcl_barrels_barrel_top', bottom: 'mcl_barrels_barrel_bottom', side: 'mcl_barrels_barrel_side' } }));
      defBlock('stonecutter', '切石机', { tex: { top: 'mcl_stonecutter_top', bottom: 'mcl_stonecutter_bottom', side: 'mcl_stonecutter_side' }, texNames: ['mcl_stonecutter_saw'], shape: 'boxes', opaque: false, render: 'cutout', boxes: () => cutterBoxes(), collide: () => [[0, 0, 0, 1, 9 / 16, 1]], hard: 3.5, tool: 'pickaxe', tier: 1, sound: 'stone' });
      defBlock('cartography_table', '制图台', Object.assign({}, wood, { tex: { top: 'mcl_cartography_table_top', side: 'mcl_cartography_table_side1', front: 'mcl_cartography_table_side3', bottom: 'oak_planks' } }));
      defBlock('fletching_table', '制箭台', Object.assign({}, wood, { tex: { top: 'fletching_table_top', side: 'fletching_table_side', front: 'fletching_table_front', bottom: 'fletching_table_bottom' } }));
      defBlock('loom', '织布机', Object.assign({}, wood, { tex: { top: 'loom_top', side: 'loom_side', front: 'loom_front', bottom: 'loom_bottom' } }));
      const stoneJob = { hard: 3.5, tool: 'pickaxe', tier: 1, sound: 'stone' };
      defBlock('smoker', '烟熏炉', Object.assign({}, stoneJob, { tex: { top: 'smoker_top', bottom: 'smoker_bottom', side: 'smoker_side', front: 'smoker_front' } }));
      defBlock('lit_smoker', '燃烧中的烟熏炉', Object.assign({}, stoneJob, { tex: { top: 'smoker_top', bottom: 'smoker_bottom', side: 'smoker_side', front: 'smoker_front_on' }, emit: 13, drop: 'smoker', noItem: true }));
      defBlock('blast_furnace', '高炉', Object.assign({}, stoneJob, { tex: { top: 'blast_furnace_top', side: 'blast_furnace_side', front: 'blast_furnace_front' } }));
      defBlock('lit_blast_furnace', '燃烧中的高炉', Object.assign({}, stoneJob, { tex: { top: 'blast_furnace_top', side: 'blast_furnace_side', front: 'blast_furnace_front_on' }, emit: 13, drop: 'blast_furnace', noItem: true }));
      defBlock('bell', '钟', { tex: { top: 'mcl_bells_bell_top', side: 'mcl_bells_bell_top', bottom: 'mcl_bells_bell_bottom' }, texNames: ['spruce_planks'], shape: 'boxes', opaque: false, render: 'cutout', boxes: () => bellBoxes(), hard: 5, tool: 'pickaxe', sound: 'metal' });
      defBlock('monster_spawner', '刷怪笼', { tex: 'mob_spawner', opaque: false, render: 'cutout', hard: 5, tool: 'pickaxe', tier: 1, drop: null, xp: 20, sound: 'metal', noSilk: true });
    },
    items() {
      // 方块物品图标（盒子形状的方块用素材包物品图标更好看）
      const icon = { bell: 'mcl_bells_bell' };
      for (const k in icon) if (ITEMS[k] && PACK_IMG[icon[k]]) ITEMS[k].icon = icon[k];
      // 下界合金工具（若其他模块未定义）
      const kinds = { sword: ['剑', 8, 'default_tool_netheritesword'], pickaxe: ['镐', 6, 'default_tool_netheritepick'], axe: ['斧', 10, 'default_tool_netheriteaxe'], shovel: ['锹', 6.5, 'default_tool_netheriteshovel'], hoe: ['锄', 1, 'farming_tool_netheritehoe'] };
      for (const k in kinds) {
        const n = 'netherite_' + k;
        if (ITEMS[n]) continue;
        defItem(n, '下界合金' + kinds[k][0], { tool: { type: k, tier: 4, speed: 9, dmg: kinds[k][1] }, durability: 2031, icon: kinds[k][2], fireproof: true });
      }
      SND_MAP.bell = 'mcl_bells_bell_stroke';
      injectCSS();
    },
    recipes() {
      const has = n => !!ITEMS[n];
      const slab = has('oak_slab') ? 'oak_slab' : '#planks';
      shaped(['P P', 'P P', 'PPP'], { P: slab }, 'composter');
      shaped(['SSS', ' B ', ' S '], { S: slab, B: 'bookshelf' }, 'lectern');
      shaped(['II', 'PP', 'PP'], { I: 'iron_ingot', P: '#planks' }, 'smithing_table');
      shaped(['PSP', 'P P', 'PSP'], { P: '#planks', S: slab }, 'barrel');
      shaped([' I ', 'SSS'], { I: 'iron_ingot', S: 'stone' }, 'stonecutter');
      shaped(['AA', 'PP', 'PP'], { A: 'paper', P: '#planks' }, 'cartography_table');
      shaped(['FF', 'PP', 'PP'], { F: 'flint', P: '#planks' }, 'fletching_table');
      shaped(['SS', 'PP'], { S: 'string', P: '#planks' }, 'loom');
      shaped([' L ', 'LFL', ' L '], { L: '#log', F: 'furnace' }, 'smoker');
      shaped(['III', 'IFI', 'SSS'], { I: 'iron_ingot', F: 'furnace', S: 'stone' }, 'blast_furnace');
    },
    textures() {
      defTex('v_lectern_top', p => {
        planks(p, [162, 130, 78]);
        p.rect(2, 3, 12, 10, [236, 228, 200]); p.rect(7, 3, 2, 10, [190, 170, 130]);
        for (let y = 5; y < 12; y += 2) { p.rect(3, y, 3, 1, [120, 110, 100]); p.rect(10, y, 3, 1, [120, 110, 100]); }
      });
      defTex('v_lectern_side', p => { planks(p, [150, 118, 70]); p.rect(0, 0, 16, 2, [110, 84, 50]); p.rect(0, 14, 16, 2, [110, 84, 50]); });
    },
    useBlock,
    useItem,
    scheduledTick(w, x, y, z, id) {
      if (id === B.composter) { if (w.getMeta(x, y, z) === 7) { w.setMeta(x, y, z, 8); if (w.hooks.sound) w.hooks.sound('dig.grass', x, y, z); } return true; }
      return false;
    },
    blockUpdate(w, x, y, z, id) {
      // 土径上方被实心方块覆盖时变回泥土
      if (id === B.grass_path) { const a = BLOCKS[w.getBlock(x, y + 1, z)]; if (a.solid && a.opaque) { w.setBlock(x, y, z, B.dirt, 0, { noUpdate: true }); return true; } }
      return false;
    },
    tick(g) { tickVFurnaces(g); tickSpawners(g); },
    frame(g, dt) { if (g.state !== 'title') frameSpawners(g, dt); },
  });
})();
