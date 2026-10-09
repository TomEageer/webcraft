'use strict';
// ---------- 附魔与酿造（二）：附魔台、附魔书、铁砧、砂轮 ----------

// 附魔等级的花费区间（Java 版数值）：min = a + (等级-1)*b，max = min + c
const MG_ENCH_COST = {
  protection: [1, 11, 11], fire_protection: [10, 8, 8], feather_falling: [5, 6, 6], blast_protection: [5, 8, 8], projectile_protection: [3, 6, 6],
  respiration: [10, 10, 30], aqua_affinity: [1, 0, 40], thorns: [10, 20, 50], depth_strider: [10, 10, 15],
  sharpness: [1, 11, 20], smite: [5, 8, 20], bane_of_arthropods: [5, 8, 20], knockback: [5, 20, 50], fire_aspect: [10, 20, 50],
  looting: [15, 9, 50], sweeping: [5, 9, 15], efficiency: [1, 10, 50], silk_touch: [15, 0, 50], fortune: [15, 9, 50],
  unbreaking: [5, 8, 50], power: [1, 10, 15], punch: [12, 20, 25], flame: [20, 0, 30], infinity: [20, 0, 30], mending: [25, 25, 50],
};
const MG_TREASURE = new Set(['mending']);
function mgEnchMin(id, lv) { const c = MG_ENCH_COST[id] || [1, 10, 50]; return c[0] + (lv - 1) * c[1]; }
function mgEnchMax(id, lv) { const c = MG_ENCH_COST[id] || [1, 10, 50]; return mgEnchMin(id, lv) + c[2]; }
function mgConflict(a, b) {
  if (a === b) return false;
  return ENCH_CONFLICT.some(g => g.includes(a) && g.includes(b));
}
// 物品附魔能力（Java 版材料数值）
function mgEnchantability(name) {
  const it = ITEMS[name]; if (!it) return 0;
  if (name === 'book' || name === 'bow' || name === 'crossbow' || name === 'fishing_rod' || name === 'trident') return 1;
  if (it.armor) return { leather: 15, chainmail: 12, iron: 9, golden: 25, diamond: 10, netherite: 15, turtle: 9 }[it.material] || 9;
  if (it.tool && ['sword', 'pickaxe', 'axe', 'shovel', 'hoe'].includes(it.tool.type)) {
    const m = name.split('_')[0];
    return { wooden: 15, stone: 5, iron: 14, golden: 22, diamond: 10, netherite: 15 }[m] || 10;
  }
  if (it.tool && it.tool.type === 'mace') return 15;
  return 0;
}
function mgCanEnchant(st) { return !!st && !st.ench && mgEnchantability(st.id) > 0; }

// ---------- 附魔台 ----------
// 有效书架：以附魔台为中心 5x5 外圈、两层高，且书架与附魔台之间的格子为空气
function mgCountShelves(world, x, y, z) {
  let n = 0;
  for (let dy = 0; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
    if (Math.abs(dx) < 2 && Math.abs(dz) < 2) continue;
    if (world.getBlock(x + dx, y + dy, z + dz) !== B.bookshelf) continue;
    const mid = world.getBlock(x + Math.trunc(dx / 2), y + dy, z + Math.trunc(dz / 2));
    if (mid === 0 || (BLOCKS[mid] && BLOCKS[mid].replaceable && !isLiquid(mid))) n++;
  }
  return Math.min(15, n);
}
const mgRand = (r, n) => Math.floor(r() * n);
// 按 Java 版算法为一个槽位生成附魔组合
function mgPickEnchants(name, level, seed) {
  const r = mulberry32(seed), e = mgEnchantability(name);
  let L = level + 1 + mgRand(r, Math.floor(e / 4) + 1) + mgRand(r, Math.floor(e / 4) + 1);
  L = Math.max(1, Math.round(L * (1 + (r() + r() - 1) * 0.15)));
  const avail = [];
  for (const id in ENCHANTS) {
    if (MG_TREASURE.has(id) || ENCHANTS[id].treasure || ENCHANTS[id].curse) continue;
    if (!enchApplies(name, id)) continue;
    for (let lv = ENCHANTS[id].max; lv >= 1; lv--) if (L >= mgEnchMin(id, lv) && L <= mgEnchMax(id, lv)) { avail.push({ id, lv, w: ENCHANTS[id].weight || 1 }); break; }
  }
  const pick = list => { let tot = 0; for (const a of list) tot += a.w; let k = r() * tot; for (const a of list) { k -= a.w; if (k < 0) return a; } return list[list.length - 1]; };
  const out = [];
  let pool = avail.slice();
  if (pool.length) {
    out.push(pick(pool));
    while (mgRand(r, 50) <= L) {
      const last = out[out.length - 1];
      pool = pool.filter(a => a.id !== last.id && !mgConflict(a.id, last.id));
      if (!pool.length) break;
      out.push(pick(pool));
      L = Math.floor(L / 2);
    }
  }
  if (name === 'book' && out.length > 1) out.splice(mgRand(r, out.length), 1);
  return out;
}
// 三个选项：{cost, list, clue}
function mgEnchOptions(st, shelves, seed) {
  if (!mgCanEnchant(st)) return [null, null, null];
  const r = mulberry32(seed);
  const base = mgRand(r, 8) + 1 + (shelves >> 1) + mgRand(r, shelves + 1);
  const costs = [Math.max(Math.floor(base / 3), 1), Math.floor(base * 2 / 3) + 1, Math.max(base, shelves * 2)];
  return costs.map((c, i) => {
    if (c < i + 1) return null;
    const list = mgPickEnchants(st.id, c, seed + i + 1);
    if (!list.length) return null;
    const clue = list[mulberry32(seed * 31 + i)() * list.length | 0];
    return { cost: c, list, clue };
  });
}
function mgSeed(p) { if (!p.mgEnchSeed) p.mgEnchSeed = (Math.random() * 2147483647) | 0 || 1; return p.mgEnchSeed; }
const MG_GLYPHS = 'ᔑʖᓵ↸ᒷ⎓⊣⍑╎⋮ꖌꖎᒲリ𝙹!¡ᑑ∷ᓭℸ⚍⍊∴̇/||⨅';
function mgGlyphText(seed) { const r = mulberry32(seed), g = [...MG_GLYPHS]; let s = ''; const n = 3 + mgRand(r, 3); for (let i = 0; i < n; i++) { for (let k = 0; k < 2 + mgRand(r, 4); k++) s += g[mgRand(r, g.length)]; s += ' '; } return s; }

function mgEnchantState(ui) {
  const p = ui.g.player, st = ui.mgSlots[0], pos = ui.mgPos;
  const shelves = mgCountShelves(ui.g.world, pos[0], pos[1], pos[2]);
  const seed = mgSeed(p);
  const key = [seed, st && st.id, st && !!st.ench, shelves].join('|');
  if (ui.mgOptKey !== key) { ui.mgOptKey = key; ui.mgOpts = mgEnchOptions(st, shelves, seed); }
  return { shelves, opts: ui.mgOpts };
}
// 选择第 i 个选项
function mgDoEnchant(ui, i) {
  const g = ui.g, p = g.player, st = ui.mgSlots[0], lap = ui.mgSlots[1];
  const { opts } = mgEnchantState(ui), o = opts[i];
  if (!o || !st) return false;
  const surv = p.mode === 'survival';
  if (surv && (p.level < o.cost || !lap || lap.n < i + 1)) return false;
  const ench = {};
  for (const e of o.list) ench[e.id] = e.lv;
  if (st.id === 'book') ui.mgSlots[0] = { id: 'enchanted_book', n: 1, ench };
  else st.ench = ench;
  if (surv) {
    p.level = Math.max(0, p.level - (i + 1));
    lap.n -= i + 1; if (lap.n <= 0) ui.mgSlots[1] = null;
  }
  p.mgEnchSeed = 0; mgSeed(p);
  g.audio.play('enchant', p.pos);
  const pos = ui.mgPos; g.particles.burst(pos[0] + 0.5, pos[1] + 1, pos[2] + 0.5, [180, 120, 255], 20, 1.2);
  ui.refresh();
  return true;
}

SCREENS.enchanting = {
  title: '附魔',
  open(ui, arg) { ui.mgSlots = [null, null]; ui.mgPos = arg; ui.mgOptKey = null; },
  close(ui) { mgReturnSlots(ui); },
  render(ui) {
    const p = ui.g.player, { opts } = mgEnchantState(ui), lap = ui.mgSlots[1], surv = p.mode === 'survival';
    let h = `<div class="mg-ench"><div class="mg-enchslots">${ui.slotHTML('ench', 0, ui.mgSlots[0])}${ui.slotHTML('ench', 1, ui.mgSlots[1], lap ? '' : 'mg-lapis')}</div><div class="mg-opts">`;
    opts.forEach((o, i) => {
      if (!o) { h += '<div class="mg-opt off"></div>'; return; }
      const ok = !surv || (p.level >= o.cost && lap && lap.n >= i + 1);
      const clue = ENCHANTS[o.clue.id].zh + ' ' + (ROMAN[o.clue.lv] || o.clue.lv);
      h += `<div class="mg-opt ${ok ? 'ok' : 'no'}" data-mgopt="${i}" title="${esc(clue)} . . . ？\n青金石 ${i + 1} 个，消耗 ${i + 1} 级经验">`
        + `<span class="lp">${i + 1}</span><span class="gl">${esc(mgGlyphText(ui.g.player.mgEnchSeed + i))}</span><br><span>${esc(clue)} . . . ？</span><span class="lv">${o.cost}</span></div>`;
    });
    return h + '</div></div>';
  },
  after(ui) {
    ui.el.screen.querySelectorAll('[data-mgopt]').forEach(el => {
      el.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); mgDoEnchant(ui, +el.dataset.mgopt); });
    });
  },
  update(ui) {
    // 物品槽只放一个物品，多出来的退回
    const st = ui.mgSlots[0];
    if (st && st.n > 1) {
      const extra = { id: st.id, n: st.n - 1 }; st.n = 1;
      if (!ui.cursor) ui.cursor = extra; else mgGive(ui.g, extra);
      ui.refresh();
    }
  },
  containers: {
    ench: {
      get: ui => ui.mgSlots,
      accept: (ui, i, st) => i === 0 ? mgCanEnchant(st) : st.id === 'lapis_lazuli',
      quick: true,
    },
  },
};
// 关闭界面时把输入槽与鼠标上的物品放回物品栏（保留附魔、名称）
function mgReturnSlots(ui) {
  if (ui.mgSlots) for (const s of ui.mgSlots) if (s) mgGive(ui.g, s);
  ui.mgSlots = null;
  if (ui.cursor) { mgGive(ui.g, ui.cursor); ui.cursor = null; }
}

// ---------- 铁砧 ----------
const MG_ANVILS = ['anvil', 'chipped_anvil', 'damaged_anvil'];
function mgRepairMat(name) {
  const it = ITEMS[name]; if (!it || !it.durability) return null;
  const m = it.armor ? it.material : name.split('_')[0];
  return { wooden: '#planks', stone: '#stone_mat', iron: 'iron_ingot', golden: 'gold_ingot', diamond: 'diamond', netherite: 'netherite_ingot', leather: 'leather', chainmail: 'iron_ingot', turtle: 'turtle_scute' }[m] || null;
}
// 稀有度系数：按权重 10/5/2/1 对应 1/2/4/8，来自附魔书时减半
function mgEnchMult(id, fromBook) {
  const w = ENCHANTS[id] ? ENCHANTS[id].weight || 1 : 1;
  const m = w >= 10 ? 1 : w >= 5 ? 2 : w >= 2 ? 4 : 8;
  return fromBook ? Math.max(1, m >> 1) : m;
}
// 计算铁砧输出：{out, cost, mat, tooExpensive}
function mgAnvilResult(ui) {
  const [L, R] = ui.mgSlots || [];
  if (!L) return null;
  const p = ui.g.player, itL = ITEMS[L.id];
  const out = Object.assign({}, L, { n: 1, ench: L.ench ? Object.assign({}, L.ench) : undefined });
  let cost = 0, mat = 0, renameOnly = !R;
  if (R) {
    const isBook = R.id === 'enchanted_book' && R.ench;
    const matName = mgRepairMat(L.id);
    if (matName && tagMatch(matName, R.id) && L.dmg > 0) {
      // 材料修复：每个材料修复 25% 耐久
      let dmg = L.dmg; const per = Math.floor(itL.durability / 4);
      while (dmg > 0 && mat < R.n) { dmg = Math.max(0, dmg - per); mat++; cost++; }
      out.dmg = dmg || undefined;
    } else if ((R.id === L.id || isBook) && (L.id !== 'enchanted_book' || isBook)) {
      if (itL.durability && !isBook && R.id === L.id && (L.dmg || 0) > 0) {
        const max = itL.durability, rem = (max - (L.dmg || 0)) + (max - (R.dmg || 0)) + Math.floor(max * 0.12);
        out.dmg = Math.max(0, max - rem) || undefined; cost += 2;
      }
      let any = false, bad = false;
      const res = out.ench || {};
      for (const id in (R.ench || {})) {
        if (L.id !== 'enchanted_book' && !enchApplies(L.id, id)) { bad = true; continue; }
        if (Object.keys(res).some(k => mgConflict(k, id))) { cost += 1; bad = true; continue; }
        const a = res[id] || 0, b = R.ench[id], max = ENCHANTS[id] ? ENCHANTS[id].max : 5;
        const lv = a === b ? Math.min(a + 1, max) : Math.max(a, b);
        res[id] = lv; any = true;
        cost += lv * mgEnchMult(id, isBook);
      }
      if (Object.keys(res).length) out.ench = res;
      if (bad && !any && !cost) return null;
      if (!any && !cost) return null;
    } else return null;
  }
  // 改名
  const curName = L.name || (itL ? itL.zh : L.id), want = (ui.mgName || '').trim();
  if (want && want !== curName) { out.name = want; cost += 1; }
  else if (!want && L.name) { delete out.name; cost += 1; }
  else if (renameOnly) return null;
  if (cost <= 0) return null;
  let total = cost + (L.rc || 0) + (R ? R.rc || 0 : 0);
  if (renameOnly && total >= 40) total = 39;
  out.rc = Math.max(L.rc || 0, R ? R.rc || 0 : 0) * 2 + 1;
  if (!out.ench || !Object.keys(out.ench).length) delete out.ench;
  if (!out.dmg) delete out.dmg;
  return { out, cost: total, mat, tooExpensive: total >= 40 && p.mode !== 'creative' };
}
function mgAnvilTake(ui, i, shift) {
  const g = ui.g, p = g.player, r = mgAnvilResult(ui);
  if (!r || r.tooExpensive) return null;
  if (!shift && ui.cursor) return null;
  const surv = p.mode === 'survival';
  if (surv && p.level < r.cost) return null;
  if (surv) p.level -= r.cost;
  const R = ui.mgSlots[1];
  ui.mgSlots[0] = null;
  if (R) { if (r.mat) { R.n -= r.mat; if (R.n <= 0) ui.mgSlots[1] = null; } else ui.mgSlots[1] = null; }
  ui.mgName = ''; ui.mgLastL = null;
  // 12% 几率损坏一级
  const pos = ui.mgPos, w = g.world, id = w.getBlock(pos[0], pos[1], pos[2]), k = MG_ANVILS.indexOf(BLOCKS[id] ? BLOCKS[id].name : '');
  const v = new THREE.Vector3(pos[0] + 0.5, pos[1] + 0.5, pos[2] + 0.5);
  if (surv && k >= 0 && Math.random() < 0.12) {
    if (k === 2) { w.setBlock(pos[0], pos[1], pos[2], 0); g.audio.play('anvil.break', v); }
    else w.setBlock(pos[0], pos[1], pos[2], B[MG_ANVILS[k + 1]], w.getMeta(pos[0], pos[1], pos[2]));
  }
  g.audio.play('anvil.use', v);
  if (shift) { mgGive(g, r.out); return null; }
  return r.out;
}
SCREENS.anvil = {
  title: '修复和命名',
  open(ui, arg) { ui.mgSlots = [null, null]; ui.mgPos = arg; ui.mgName = ''; ui.mgLastL = null; },
  close(ui) { mgReturnSlots(ui); },
  render(ui) {
    const L = ui.mgSlots[0];
    if (L !== ui.mgLastL) { ui.mgLastL = L; ui.mgName = L ? (L.name || ITEMS[L.id].zh) : ''; }
    const r = mgAnvilResult(ui), p = ui.g.player;
    let cost = '';
    if (r) cost = r.tooExpensive ? '<div class="mg-cost bad">过于昂贵！</div>' : `<div class="mg-cost ${p.mode === 'survival' && p.level < r.cost ? 'bad' : ''}">经验等级花费：${r.cost}</div>`;
    else cost = '<div class="mg-cost"></div>';
    return `<input id="mg-name" maxlength="50" placeholder="${L ? '' : '放入物品后可改名'}" value="${esc(ui.mgName || '')}" ${L ? '' : 'disabled'}>
      <div class="mg-anvil">${ui.slotHTML('anvil', 0, L)}<span class="mg-plus">+</span>${ui.slotHTML('anvil', 1, ui.mgSlots[1])}<div class="arrow"></div>${ui.slotHTML('anvilout', 0, r && !r.tooExpensive ? r.out : null, 'big')}</div>${cost}`;
  },
  after(ui) {
    const inp = document.getElementById('mg-name'); if (!inp) return;
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape' || e.key === 'Enter') inp.blur(); });
    inp.addEventListener('input', () => { ui.mgName = inp.value; ui.mgRefocus = inp.selectionStart; ui.renderScreen(); });
    if (ui.mgRefocus !== undefined && ui.mgRefocus !== null) { inp.focus(); inp.setSelectionRange(ui.mgRefocus, ui.mgRefocus); ui.mgRefocus = null; }
  },
  containers: {
    anvil: { get: ui => ui.mgSlots, quick: true },
    anvilout: { get: ui => { const r = mgAnvilResult(ui); return [r && !r.tooExpensive ? r.out : null]; }, output: true, take: mgAnvilTake },
  },
};

// ---------- 砂轮 ----------
function mgGrindResult(ui) {
  const [a, b] = ui.mgSlots || [];
  let out = null, src = [];
  if (a && b) {
    const it = ITEMS[a.id];
    if (a.id !== b.id || !it.durability) return null;
    const max = it.durability, rem = (max - (a.dmg || 0)) + (max - (b.dmg || 0)) + Math.floor(max * 0.05);
    out = { id: a.id, n: 1 }; const d = Math.max(0, max - rem); if (d) out.dmg = d;
    if (a.name) out.name = a.name;
    src = [a, b];
  } else {
    const s = a || b;
    if (!s || !s.ench) return null;
    out = { id: s.id === 'enchanted_book' ? 'book' : s.id, n: 1 };
    if (s.dmg) out.dmg = s.dmg; if (s.name) out.name = s.name;
    src = [s];
  }
  let xp = 0;
  for (const s of src) for (const id in (s.ench || {})) xp += mgEnchMin(id, s.ench[id]);
  return { out, xp };
}
function mgGrindTake(ui, i, shift) {
  const g = ui.g, r = mgGrindResult(ui);
  if (!r) return null;
  if (!shift && ui.cursor) return null;
  ui.mgSlots[0] = ui.mgSlots[1] = null;
  if (r.xp > 0) { const j = Math.ceil(r.xp / 2); g.player.addXp(j + Math.floor(Math.random() * j)); }
  const pos = ui.mgPos; g.audio.play('grindstone.use', new THREE.Vector3(pos[0] + 0.5, pos[1] + 0.5, pos[2] + 0.5));
  if (shift) { mgGive(g, r.out); return null; }
  return r.out;
}
SCREENS.grindstone = {
  title: '修复和祛魔',
  open(ui, arg) { ui.mgSlots = [null, null]; ui.mgPos = arg; },
  close(ui) { mgReturnSlots(ui); },
  render(ui) {
    const r = mgGrindResult(ui);
    return `<div class="mg-grind"><div>${ui.slotHTML('grind', 0, ui.mgSlots[0])}</div><div style="grid-row:span 2" class="arrow"></div><div style="grid-row:span 2">${ui.slotHTML('grindout', 0, r ? r.out : null, 'big')}</div><div>${ui.slotHTML('grind', 1, ui.mgSlots[1])}</div></div>`;
  },
  containers: {
    grind: { get: ui => ui.mgSlots, accept: (ui, i, st) => !!(ITEMS[st.id] && (ITEMS[st.id].durability || st.ench)), quick: true },
    grindout: { get: ui => { const r = mgGrindResult(ui); return [r ? r.out : null]; }, output: true, take: mgGrindTake },
  },
};

// ---------- 方块形状 ----------
// 铁砧：meta 为放置时的视线方向（核心对有 front 纹理的方块自动设置），长轴与视线垂直
function mgAnvilBoxes(meta, nb, id) {
  const p = MG_P, def = BLOCKS[id], top = def.anvilTop;
  const T = { tex: f => f === 2 ? TEX[top] : TEX.mcl_anvils_anvil_base };
  const Tb = { tex: f => TEX.mcl_anvils_anvil_base };
  const raw = [[2, 0, 2, 14, 4, 14, Tb], [4, 4, 3, 12, 5, 13, Tb], [6, 5, 4, 10, 10, 12, Tb], [3, 10, 0, 13, 16, 16, T]];
  return raw.map(([a, b, c, d, e, f, x]) => !(meta & 1) ? [c * p, b * p, a * p, f * p, e * p, d * p, x] : [a * p, b * p, c * p, d * p, e * p, f * p, x]);
}
// 砂轮：轮缘朝向玩家
function mgGrindBoxes(meta) {
  const p = MG_P;
  const wheel = { tex: f => f === 2 || f === 3 ? TEX.grindstone_top : (f < 2 ? TEX.grindstone_side : TEX.grindstone_front), uv: f => f < 2 ? [2, 0, 14, 12] : f < 4 ? [4, 2, 12, 14] : [4, 0, 12, 12] };
  const leg = { tex: () => TEX.spruce_planks };
  const raw = [[4, 4, 2, 12, 16, 14, wheel], [2, 0, 6, 4, 12, 10, leg], [12, 0, 6, 14, 12, 10, leg], [2, 7, 5, 4, 13, 11, leg], [12, 7, 5, 14, 13, 11, leg]];
  return raw.map(([a, b, c, d, e, f, x]) => (meta & 1) ? [c * p, b * p, a * p, f * p, e * p, d * p, x] : [a * p, b * p, c * p, d * p, e * p, f * p, x]);
}

// 附魔台上漂浮的书
const MG_BOOKS = new Map();
function mgBookMesh() {
  const g = new THREE.Group();
  const cover = new THREE.MeshBasicMaterial({ color: 0x6b3b1e }), page = new THREE.MeshBasicMaterial({ color: 0xf0ead0 });
  const l = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.4), cover), r = l.clone();
  const pl = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.36), page), pr = pl.clone();
  const L = new THREE.Group(), R = new THREE.Group();
  l.position.x = -0.15; pl.position.set(-0.14, 0.035, 0); L.add(l, pl);
  r.position.x = 0.15; pr.position.set(0.14, 0.035, 0); R.add(r, pr);
  g.add(L, R); g.userData = { L, R, mats: [cover, page] };
  return g;
}
function mgUpdateBooks(game, dt) {
  const p = game.player, w = game.world;
  game.mgBookScan = (game.mgBookScan || 0) - dt;
  if (game.mgBookScan <= 0) {
    game.mgBookScan = 1;
    const seen = new Set(), px = Math.floor(p.pos.x), py = Math.floor(p.pos.y), pz = Math.floor(p.pos.z);
    for (let x = px - 10; x <= px + 10; x++) for (let z = pz - 10; z <= pz + 10; z++) for (let y = py - 5; y <= py + 5; y++) {
      if (w.getBlock(x, y, z) !== B.enchanting_table) continue;
      const k = x + ',' + y + ',' + z; seen.add(k);
      if (!MG_BOOKS.has(k)) { const m = mgBookMesh(); m.position.set(x + 0.5, y + 1.1, z + 0.5); game.scene.add(m); MG_BOOKS.set(k, { m, y, t: Math.random() * 6, w }); }
    }
    for (const [k, b] of MG_BOOKS) if (!seen.has(k) || b.w !== w) { game.scene.remove(b.m); MG_BOOKS.delete(k); }
  }
  for (const b of MG_BOOKS.values()) {
    b.t += dt;
    const m = b.m, d = Math.hypot(p.pos.x - m.position.x, p.pos.z - m.position.z), near = d < 3;
    m.position.y = b.y + 1.15 + 0.05 * Math.sin(b.t * 2);
    const yawT = near ? Math.atan2(p.pos.x - m.position.x, p.pos.z - m.position.z) : b.t * 0.6;
    m.rotation.y = yawT + Math.PI / 2;
    const open = near ? 1.1 : 0.15;
    const u = m.userData; u.open = (u.open || 0) + (open - (u.open || 0)) * Math.min(1, dt * 4);
    u.L.rotation.z = u.open * 0.5; u.R.rotation.z = -u.open * 0.5;
    m.rotation.x = -0.3;
    const lt = Math.max(0.35, Math.min(1, (w.skyLight(Math.floor(m.position.x), Math.floor(m.position.y), Math.floor(m.position.z)) - game.skyDarken) / 15 + 0.3));
    u.mats[0].color.setRGB(0.42 * lt, 0.23 * lt, 0.12 * lt); u.mats[1].color.setRGB(0.94 * lt, 0.92 * lt, 0.82 * lt);
  }
}

FEATURES.push({
  name: 'magic_ench',
  blocks() {
    defBlock('enchanting_table', '附魔台', { shape: 'boxes', boxes: () => [[0, 0, 0, 1, 0.75, 1]], tex: { top: 'mcl_enchanting_table_top', side: 'mcl_enchanting_table_side', bottom: 'mcl_enchanting_table_bottom' }, solid: true, opaque: false, hard: 5, tool: 'pickaxe', tier: 1, emit: 7, blast: 1200 });
    const zh = ['铁砧', '开裂的铁砧', '损坏的铁砧'];
    MG_ANVILS.forEach((n, i) => defBlock(n, zh[i], { shape: 'boxes', boxes: mgAnvilBoxes, anvilTop: 'mcl_anvils_anvil_top_damaged_' + i, tex: { all: 'mcl_anvils_anvil_base', front: 'mcl_anvils_anvil_base' }, texNames: ['mcl_anvils_anvil_base', 'mcl_anvils_anvil_top_damaged_' + i], solid: true, opaque: false, hard: 5, tool: 'pickaxe', tier: 1, blast: 1200, gravity: true, sound: 'metal' }));
    defBlock('grindstone', '砂轮', { shape: 'boxes', boxes: mgGrindBoxes, tex: { all: 'grindstone_side', front: 'grindstone_front' }, texNames: ['grindstone_side', 'grindstone_top', 'grindstone_front'], solid: true, opaque: false, hard: 2, tool: 'pickaxe', tier: 1, sound: 'stone' });
  },
  items() {
    defItem('enchanted_book', '附魔书', { icon: 'mcl_enchanting_book_enchanted', stack: 1, glint: true, desc: '可在铁砧上为物品附魔' });
    Object.assign(SND_MAP, { 'anvil.use': 'default_place_node_metal', 'anvil.break': 'default_dig_metal', 'grindstone.use': 'default_dig_cracky' });
  },
  recipes() {
    shaped([' B ', 'DOD', 'OOO'], { B: 'book', D: 'diamond', O: 'obsidian' }, 'enchanting_table');
    shaped(['BBB', ' I ', 'III'], { B: 'iron_block', I: 'iron_ingot' }, 'anvil');
    shaped(['SPS', 'L L'], { S: 'stick', P: 'stone_slab', L: '#planks' }, 'grindstone');
  },
  useBlock(game, player, hit) {
    const def = BLOCKS[hit.id];
    if (hit.id === B.enchanting_table) { game.ui.openScreen('enchanting', [hit.x, hit.y, hit.z]); return true; }
    if (MG_ANVILS.includes(def.name)) { game.ui.openScreen('anvil', [hit.x, hit.y, hit.z]); return true; }
    if (hit.id === B.grindstone) { game.ui.openScreen('grindstone', [hit.x, hit.y, hit.z]); return true; }
    return false;
  },
  frame(game, dt) {
    if (game.state === 'playing' || game.state === 'screen') mgUpdateBooks(game, dt);
  },
  save(game) { return { seed: game.player ? game.player.mgEnchSeed || 0 : 0 }; },
  load(game, d) { if (d && d.seed && game.player) game.player.mgEnchSeed = d.seed; },
});
