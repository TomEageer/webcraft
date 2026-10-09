'use strict';
// ---------- 红石：活塞、发射器、投掷器、漏斗（依赖 feat_redstone.js） ----------

// ---------------- 活塞 ----------------
// 活塞 meta：0-2 朝向（面），3 已伸出；活塞头 meta：0-2 朝向，3 粘性
function rsPistonTex(face, meta, sticky) {
  const f = meta & 7, ext = meta & 8;
  if (face === f) return TEX[ext ? 'mesecons_piston_on_front' : sticky ? 'mesecons_piston_pusher_front_sticky' : 'mesecons_piston_pusher_front'];
  if (face === (f ^ 1)) return TEX.mesecons_piston_back;
  return TEX['rs_pside_' + rsSideRot(face, f)];
}
function rsHeadTex(face, meta) {
  const f = meta & 7;
  if (face === f) return TEX[meta & 8 ? 'mesecons_piston_pusher_front_sticky' : 'mesecons_piston_pusher_front'];
  if (face === (f ^ 1)) return TEX.mesecons_piston_pusher_back;
  return TEX['rs_phead_' + rsSideRot(face, f)];
}
const RS_PISTON_TEX = ['mesecons_piston_on_front', 'mesecons_piston_pusher_front', 'mesecons_piston_pusher_front_sticky', 'mesecons_piston_back', 'mesecons_piston_pusher_back'];

// 0 空，1 被破坏，2 不可推，3 可移动
function rsPushKind(world, x, y, z, id) {
  if (!id) return 0;
  const d = BLOCKS[id];
  if (isLiquid(id) || d.replaceable) return 1;
  if (d.hard < 0 || d.blast > 100 || id === B.piston_head) return 2;
  if ((id === B.piston || id === B.sticky_piston) && (world.getMeta(x, y, z) & 8)) return 2;
  const t = world.tiles.get(rsKey(x, y, z));
  if (t && Array.isArray(t.items)) return 2;
  const h = RS.byId[id];
  if (h && h.pushBreak) return 1;
  if (!d.solid || d.shape === 'cross' || d.shape === 'torch' || d.shape === 'bed' || d.plant || d.crop) return 1;
  return 3;
}
function rsUpdateCells(world, cells) {
  const seen = new Set();
  const up = (x, y, z) => { const k = rsKey(x, y, z); if (seen.has(k)) return; seen.add(k); world.blockUpdate(x, y, z); };
  for (const [x, y, z] of cells) { up(x, y, z); for (const D of DIRS) up(x + D[0], y + D[1], z + D[2]); }
}
function rsPushEntities(world, cells, D) {
  if (world !== game.world) return;
  const ents = [game.player, ...game.mobs, ...game.entities];
  for (const e of ents) {
    if (!e || e.dead || !e.pos) continue;
    const w = e.w || 0.2, h = e.h || 0.2;
    for (const [x, y, z] of cells) {
      if (e.pos.x + w > x && e.pos.x - w < x + 1 && e.pos.z + w > z && e.pos.z - w < z + 1 && e.pos.y + h > y && e.pos.y < y + 1) {
        e.pos.x += D[0] * 1.01; e.pos.y += D[1] * 1.01; e.pos.z += D[2] * 1.01;
        if (D[1] > 0 && e.vel) e.vel.y = Math.max(e.vel.y, 2);
        break;
      }
    }
  }
}
function rsPistonExtend(world, x, y, z, f, sticky) {
  const D = DIRS[f], list = [];
  let cx = x + D[0], cy = y + D[1], cz = z + D[2], brk = null;
  for (let i = 0; ; i++) {
    if (cy < 0 || cy >= CH || !world.isLoaded(cx, cz)) return false;
    const id = world.getBlock(cx, cy, cz), k = rsPushKind(world, cx, cy, cz, id);
    if (k === 0) break;
    if (k === 1) { brk = [cx, cy, cz, id]; break; }
    if (k === 2 || i >= 12) return false;
    list.push([cx, cy, cz, id, world.getMeta(cx, cy, cz)]);
    cx += D[0]; cy += D[1]; cz += D[2];
  }
  if (brk) {
    if (isLiquid(brk[3])) world.setBlock(brk[0], brk[1], brk[2], 0, 0, { noUpdate: true });
    else world.breakBlock(brk[0], brk[1], brk[2], true);
  }
  const tiles = list.map(([bx, by, bz]) => { const k = rsKey(bx, by, bz), t = world.tiles.get(k); if (t) world.tiles.delete(k); return t; });
  for (let i = list.length - 1; i >= 0; i--) { const [bx, by, bz, id, m] = list[i]; world.setBlock(bx + D[0], by + D[1], bz + D[2], id, m, { noUpdate: true }); }
  const hx = x + D[0], hy = y + D[1], hz = z + D[2];
  world.setBlock(hx, hy, hz, B.piston_head, f | (sticky ? 8 : 0), { noUpdate: true });
  list.forEach(([bx, by, bz], i) => { if (tiles[i]) world.tiles.set(rsKey(bx + D[0], by + D[1], bz + D[2]), tiles[i]); });
  world.setMeta(x, y, z, f | 8);
  const dest = [[hx, hy, hz]], cells = [[x, y, z], [hx, hy, hz]];
  for (const [bx, by, bz] of list) { dest.push([bx + D[0], by + D[1], bz + D[2]]); cells.push([bx + D[0], by + D[1], bz + D[2]]); }
  rsPushEntities(world, dest, D);
  rsUpdateCells(world, cells);
  rsSound('piston_extend', x, y, z, 0.6, 0.9 + Math.random() * 0.2, pos => game.audio.noiseHit(400, 1, 0.25, 0.4, 'bandpass', pos));
  return true;
}
function rsPistonRetract(world, x, y, z, f, sticky) {
  const D = DIRS[f], hx = x + D[0], hy = y + D[1], hz = z + D[2];
  world.setMeta(x, y, z, f);
  if (world.getBlock(hx, hy, hz) === B.piston_head) world.setBlock(hx, hy, hz, 0, 0, { noUpdate: true });
  const cells = [[x, y, z], [hx, hy, hz]];
  if (sticky && hy + D[1] >= 0 && hy + D[1] < CH && world.isLoaded(hx + D[0], hz + D[2])) {
    const fx = hx + D[0], fy = hy + D[1], fz = hz + D[2], id = world.getBlock(fx, fy, fz);
    if (id && rsPushKind(world, fx, fy, fz, id) === 3 && world.getBlock(hx, hy, hz) === 0) {
      const m = world.getMeta(fx, fy, fz), k = rsKey(fx, fy, fz), t = world.tiles.get(k);
      if (t) world.tiles.delete(k);
      world.setBlock(hx, hy, hz, id, m, { noUpdate: true });
      world.setBlock(fx, fy, fz, 0, 0, { noUpdate: true });
      if (t) world.tiles.set(rsKey(hx, hy, hz), t);
      cells.push([fx, fy, fz]);
    }
  }
  rsUpdateCells(world, cells);
  rsSound('piston_retract', x, y, z, 0.6, 0.9 + Math.random() * 0.2, pos => game.audio.noiseHit(300, 1, 0.25, 0.35, 'bandpass', pos));
}
function rsPistonHandler(sticky) {
  return {
    topSolid: true,
    update(world, x, y, z, m) {
      const f = m & 7, ext = !!(m & 8);
      if (ext) {
        const D = DIRS[f];
        if (world.getBlock(x + D[0], y + D[1], z + D[2]) !== B.piston_head) { world.setMeta(x, y, z, f); return; }
      }
      if ((rsInput(world, x, y, z, false, f) > 0) !== ext) world.schedule(x, y, z, 1);
    },
    tick(world, x, y, z, m) {
      const f = m & 7, ext = !!(m & 8), want = rsInput(world, x, y, z, false, f) > 0;
      if (want && !ext) rsPistonExtend(world, x, y, z, f, sticky);
      else if (!want && ext) rsPistonRetract(world, x, y, z, f, sticky);
    },
  };
}
function rsPistonBoxes(meta) {
  if (!(meta & 8)) return [[0, 0, 0, 1, 1, 1]];
  const f = meta & 7;
  return [rsBoxF([0, 0, 0, 1, 12 / 16, 1], f), rsBoxF(px16b([6, 12, 6, 10, 16, 10, { tex: face => TEX['rs_phead_' + rsSideRot(face, f)] }]), f)];
}
function rsPlacePiston(name) {
  return ctx => { rsPut(ctx, B[name], rsLookFace(ctx.p) ^ 1); return true; };
}
rsDefine('piston', '活塞', {
  shape: 'boxes', solid: true, opaque: false, render: 'cutout', hard: 1.5, tool: 'pickaxe', tex: 'mesecons_piston_back', texNames: RS_PISTON_TEX,
  texFn: (face, meta) => rsPistonTex(face, meta, false), boxes: rsPistonBoxes,
}, rsPistonHandler(false), { place: rsPlacePiston('piston') });
rsDefine('sticky_piston', '黏性活塞', {
  shape: 'boxes', solid: true, opaque: false, render: 'cutout', hard: 1.5, tool: 'pickaxe', tex: 'mesecons_piston_back', texNames: RS_PISTON_TEX,
  texFn: (face, meta) => rsPistonTex(face, meta, true), boxes: rsPistonBoxes,
}, rsPistonHandler(true), { place: rsPlacePiston('sticky_piston') });
rsDefine('piston_head', '活塞头', {
  shape: 'boxes', solid: true, opaque: false, render: 'cutout', hard: 1.5, tool: 'pickaxe', tex: 'mesecons_piston_pusher_back', noItem: true, drop: null,
  texFn: rsHeadTex,
  boxes(meta) { const f = meta & 7; return [rsBoxF([0, 12 / 16, 0, 1, 1, 1], f), rsBoxF([6 / 16, 0, 6 / 16, 10 / 16, 12 / 16, 10 / 16], f)]; },
}, {
  update(world, x, y, z, m) {
    const f = m & 7, D = DIRS[f], bx = x - D[0], by = y - D[1], bz = z - D[2];
    const bid = world.getBlock(bx, by, bz), bm = world.getMeta(bx, by, bz);
    if (!((bid === B.piston || bid === B.sticky_piston) && (bm & 8) && (bm & 7) === f)) world.setBlock(x, y, z, 0);
  },
  broken(world, x, y, z, m) {
    const f = m & 7, D = DIRS[f], bx = x - D[0], by = y - D[1], bz = z - D[2];
    const bid = world.getBlock(bx, by, bz);
    if ((bid === B.piston || bid === B.sticky_piston) && (world.getMeta(bx, by, bz) & 7) === f) {
      if (game.player && game.player.mode === 'creative') world.setBlock(bx, by, bz, 0);
      else world.breakBlock(bx, by, bz, true);
    }
  },
});

// ---------------- 容器通用 ----------------
const rsRange = n => { const a = []; for (let i = 0; i < n; i++) a.push(i); return a; };
// side：容器被访问的那一面（面编号）。返回 {t, ins, ext, fuelSlot}
function rsContainer(world, x, y, z, side) {
  const id = world.getBlock(x, y, z);
  if (!id) return null;
  const k = rsKey(x, y, z);
  let t = world.tiles.get(k);
  if (id === B.chest) {
    if (!t) { t = { type: 'chest', items: new Array(27).fill(null) }; world.tiles.set(k, t); }
    return { t, ins: rsRange(t.items.length), ext: rsRange(t.items.length) };
  }
  if (id === B.furnace || id === B.lit_furnace) {
    if (!t) { t = { type: 'furnace', items: [null, null, null], burn: 0, burnMax: 0, cook: 0, xp: 0 }; world.tiles.set(k, t); }
    return { t, ins: side === 2 ? [0] : side === 3 ? [] : [1], ext: side === 3 ? [2] : [], fuelSlot: 1 };
  }
  if (t && Array.isArray(t.items)) return { t, ins: rsRange(t.items.length), ext: rsRange(t.items.length) };
  return null;
}
// 尽量放入；st.n 会被减少；全部放入返回 true
function rsInsert(c, st) {
  const items = c.t.items, ms = (ITEMS[st.id] && ITEMS[st.id].stack) || 64;
  const ok = i => !(c.fuelSlot === i && !fuelValue(st.id));
  for (const i of c.ins) {
    const s = items[i];
    if (!ok(i) || !s || s.id !== st.id || s.ench || st.ench || s.dmg || st.dmg || s.n >= ms) continue;
    const k = Math.min(ms - s.n, st.n); s.n += k; st.n -= k;
    if (st.n <= 0) return true;
  }
  for (const i of c.ins) {
    if (!ok(i) || items[i]) continue;
    const k = Math.min(ms, st.n);
    items[i] = { id: st.id, n: k }; if (st.dmg) items[i].dmg = st.dmg; if (st.ench) items[i].ench = st.ench;
    st.n -= k;
    if (st.n <= 0) return true;
  }
  return false;
}
function rsTouched(t) {
  if (t.type === 'furnace') t._dirtyUI = true;
  const ui = game.ui;
  if (ui && ui.screen && (ui.tile === t || ui.rsTile === t)) ui.refresh();
}
function rsTileAt(world, x, y, z, type, n) {
  const k = rsKey(x, y, z);
  let t = world.tiles.get(k);
  if (!t) { t = { type, items: new Array(n).fill(null) }; if (type === 'hopper') t.cd = 0; world.tiles.set(k, t); }
  return t;
}
function rsScreen(name, title, type, n, cols) {
  RS.screens.add(name);
  SCREENS[name] = {
    title,
    open(ui, arg) { ui.rsTile = rsTileAt(ui.g.world, arg[0], arg[1], arg[2], type, n); ui.rsPos = arg; },
    close(ui) { ui.rsTile = null; ui.rsPos = null; },
    render(ui) {
      let h = `<div class="cgrid" style="grid-template-columns:repeat(${cols},40px);justify-content:center;margin:6px 0 10px">`;
      for (let i = 0; i < n; i++) h += ui.slotHTML('rsc', i, ui.rsTile ? ui.rsTile.items[i] : null);
      return h + '</div>';
    },
    containers: { rsc: { get: ui => (ui.rsTile ? ui.rsTile.items : []), quick: true } },
  };
}
rsScreen('rs_dispenser', '发射器', 'dispenser', 9, 3);
rsScreen('rs_dropper', '投掷器', 'dropper', 9, 3);
rsScreen('rs_hopper', '漏斗', 'hopper', 5, 5);

// ---------------- 发射器 / 投掷器 ----------------
// 发射器射出的箭：能击中玩家和生物
class RsArrow extends Arrow {
  constructor(g, x, y, z, vx, vy, vz) { super(g, x, y, z, vx, vy, vz, null, 3); }
  update(dt) {
    this.age += dt;
    if (this.age > 60) { this.dead = true; return; }
    const g = this.game;
    if (this.stuck) {
      const pl = g.player;
      if (pl.alive && this.age > 0.5 && pl.pos.distanceTo(this.pos) < 1.5) { if (pl.mode === 'survival' && pl.inventory.add('arrow', 1) === 0) { g.audio.play('pop'); g.ui.refresh(); } this.dead = true; }
      return;
    }
    this.vel.y -= 20 * dt;
    for (let s = 0; s < 4; s++) {
      const nx = this.pos.x + this.vel.x * dt / 4, ny = this.pos.y + this.vel.y * dt / 4, nz = this.pos.z + this.vel.z * dt / 4;
      const id = this.world.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz));
      if (id && BLOCKS[id].solid) { this.stuck = true; g.audio.play('arrow_hit', this.pos); break; }
      this.pos.set(nx, ny, nz);
      for (const t of [g.player, ...g.mobs]) {
        if (t.dead || (t.isPlayer && (!t.alive || t.mode !== 'survival'))) continue;
        if (Math.abs(t.pos.x - nx) < t.w + 0.1 && Math.abs(t.pos.z - nz) < t.w + 0.1 && ny > t.pos.y && ny < t.pos.y + t.h) {
          t.hurt(Math.max(1, Math.ceil(this.dmg * this.vel.length() / 25)), 'arrow', null);
          this.dead = true; return;
        }
      }
    }
    this.mesh.position.copy(this.pos);
    this.mesh.lookAt(this.pos.x + this.vel.x, this.pos.y + this.vel.y, this.pos.z + this.vel.z);
  }
}
function rsDropOut(world, x, y, z, f, st) {
  const D = DIRS[f];
  const e = game.dropItem(x + 0.5 + D[0] * 0.7, y + 0.5 + D[1] * 0.7 - (D[1] === 0 ? 0.15 : 0), z + 0.5 + D[2] * 0.7, st.id, st.n, st.dmg, st.ench);
  if (e) { e.vel.set(D[0] * 5 + (Math.random() - 0.5) * 0.6, D[1] * 5 + (D[1] === 0 ? 1.5 : 0), D[2] * 5 + (Math.random() - 0.5) * 0.6); e.pickup = 0.4; }
  if (game.particles) for (let i = 0; i < 4; i++) game.particles.add(x + 0.5 + D[0] * 0.6, y + 0.5 + D[1] * 0.6, z + 0.5 + D[2] * 0.6, (Math.random() - 0.5), Math.random(), (Math.random() - 0.5), [110, 110, 110], 0.5, -1);
}
// 发射器的特殊物品行为；返回 true 表示已处理（物品已消耗/替换）
function rsDispenseSpecial(world, x, y, z, f, t, i) {
  const st = t.items[i], D = DIRS[f], fx = x + D[0], fy = y + D[1], fz = z + D[2];
  const it = ITEMS[st.id] || {};
  const front = world.getBlock(fx, fy, fz), fdef = BLOCKS[front];
  const take = () => { if (--st.n <= 0) t.items[i] = null; };
  const g = game;
  if (st.id === 'arrow') {
    const sp = 22;
    g.entities.push(new RsArrow(g, x + 0.5 + D[0] * 0.7, y + 0.5 + D[1] * 0.7, z + 0.5 + D[2] * 0.7, D[0] * sp + (Math.random() - 0.5), D[1] * sp + (D[1] === 0 ? 2 : 0), D[2] * sp + (Math.random() - 0.5)));
    g.audio.play('bow', new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5));
    take(); return true;
  }
  if (st.id === 'water_bucket' || st.id === 'lava_bucket') {
    if (front && !fdef.replaceable) return true;
    world.setBlock(fx, fy, fz, st.id === 'water_bucket' ? B.water : B.lava, 0);
    t.items[i] = { id: 'bucket', n: 1 };
    g.audio.play('bucket'); return true;
  }
  if (st.id === 'bucket') {
    if (!isLiquid(front) || (world.getMeta(fx, fy, fz) & 15) !== 0) return false;
    const full = front === B.water ? 'water_bucket' : 'lava_bucket';
    world.setBlock(fx, fy, fz, 0);
    take();
    const c = { t, ins: rsRange(9), ext: [] };
    const nb = { id: full, n: 1 };
    if (!rsInsert(c, nb)) rsDropOut(world, x, y, z, f, { id: full, n: 1 });
    g.audio.play('bucket'); return true;
  }
  if (st.id === 'flint_and_steel') {
    if (front === B.tnt) { world.setBlock(fx, fy, fz, 0); g.entities.push(new PrimedTNT(g, fx, fy, fz)); }
    else if (B.fire !== undefined && (!front || fdef.replaceable) && rsOpaqueId(world.getBlock(fx, fy - 1, fz))) world.setBlock(fx, fy, fz, B.fire, 0);
    else return true;
    g.audio.play('flint');
    st.dmg = (st.dmg || 0) + 1;
    if (st.dmg >= (it.durability || 64)) t.items[i] = null;
    return true;
  }
  if (st.id === 'tnt') {
    if (front && !fdef.replaceable) return false;
    g.entities.push(new PrimedTNT(g, fx, fy, fz));
    take(); return true;
  }
  if (it.spawnEgg && MOB_DEFS[it.spawnEgg]) {
    g.spawnMob(it.spawnEgg, fx + 0.5, fy, fz + 0.5);
    take(); return true;
  }
  if (st.id === 'bone_meal') {
    if (fdef && fdef.sapling) world.growTree(fx, fy, fz, fdef.sapling);
    else if (fdef && fdef.crop) world.setMeta(fx, fy, fz, Math.min(7, world.getMeta(fx, fy, fz) + 2 + Math.floor(Math.random() * 3)));
    else return true;
    if (g.particles) g.particles.burst(fx + 0.5, fy + 0.5, fz + 0.5, [120, 230, 120], 10, 1);
    take(); return true;
  }
  return false;
}
function rsDispense(world, x, y, z, m, dropper) {
  if (world !== game.world) return;
  const t = rsTileAt(world, x, y, z, dropper ? 'dropper' : 'dispenser', 9);
  const full = [];
  for (let i = 0; i < t.items.length; i++) if (t.items[i]) full.push(i);
  if (!full.length) { rsSound('mesecons_button_push', x, y, z, 0.4, 1.6, pos => game.audio.tone(1200, 0.05, 0.2, 'square', 1, pos)); return; }
  const i = full[Math.floor(Math.random() * full.length)], st = t.items[i], f = m & 7, D = DIRS[f];
  rsSound('mesecons_button_push', x, y, z, 0.45, 1.25);
  if (dropper) {
    const c = rsContainer(world, x + D[0], y + D[1], z + D[2], f ^ 1);
    if (c) {
      const one = { id: st.id, n: 1, dmg: st.dmg, ench: st.ench };
      if (rsInsert(c, one)) { if (--st.n <= 0) t.items[i] = null; rsTouched(c.t); }
      rsTouched(t); return;
    }
  } else if (rsDispenseSpecial(world, x, y, z, f, t, i)) { rsTouched(t); return; }
  rsDropOut(world, x, y, z, f, { id: st.id, n: 1, dmg: st.dmg, ench: st.ench });
  if (--st.n <= 0) t.items[i] = null;
  rsTouched(t);
}
function rsDispenserHandler(dropper) {
  const type = dropper ? 'dropper' : 'dispenser';
  return {
    conductor: true,
    placed(world, x, y, z) { rsTileAt(world, x, y, z, type, 9); },
    // meta：0-2 朝向，3 已触发，4 待发射
    update(world, x, y, z, m) {
      const p = rsInput(world, x, y, z, false, -1) > 0;
      if (p && !(m & 8)) { world.setMeta(x, y, z, m | 8 | 16); world.schedule(x, y, z, 4); }
      else if (!p && (m & 8)) world.setMeta(x, y, z, m & ~8);
    },
    tick(world, x, y, z, m) {
      if (m & 16) { world.setMeta(x, y, z, m & ~16); rsDispense(world, x, y, z, m, dropper); }
      else this.update(world, x, y, z, m);
    },
    use(g, p, hit) { g.ui.openScreen(dropper ? 'rs_dropper' : 'rs_dispenser', [hit.x, hit.y, hit.z]); return true; },
  };
}
function rsDispTexFn(front) {
  return (face, meta) => {
    const f = meta & 7;
    if (face === f) return TEX[front + (f === 2 || f === 3 ? '_vertical' : '_horizontal')];
    if (face === 2 || face === 3) return TEX.furnace_top;
    return TEX.furnace_side;
  };
}
rsDefine('dispenser', '发射器', {
  tex: 'furnace_side', hard: 3.5, tool: 'pickaxe', tier: 1,
  texNames: ['mcl_dispensers_dispenser_front_horizontal', 'mcl_dispensers_dispenser_front_vertical'],
  texFn: rsDispTexFn('mcl_dispensers_dispenser_front'),
}, rsDispenserHandler(false), { place(ctx) { rsPut(ctx, B.dispenser, rsLookFace(ctx.p) ^ 1); return true; } });
rsDefine('dropper', '投掷器', {
  tex: 'furnace_side', hard: 3.5, tool: 'pickaxe', tier: 1,
  texNames: ['mcl_droppers_dropper_front_horizontal', 'mcl_droppers_dropper_front_vertical'],
  texFn: rsDispTexFn('mcl_droppers_dropper_front'),
}, rsDispenserHandler(true), { place(ctx) { rsPut(ctx, B.dropper, rsLookFace(ctx.p) ^ 1); return true; } });

// ---------------- 漏斗 ----------------
// meta：0-2 输出方向（下或水平），3 被充能锁定
function rsHopperTick(world, x, y, z, t) {
  if (world.getBlock(x, y, z) !== B.hopper) return;
  if (t.cd > 0) { t.cd--; return; }
  const m = world.getMeta(x, y, z);
  if (m & 8) return;
  let moved = false;
  const f = m & 7, D = DIRS[f];
  const dst = rsContainer(world, x + D[0], y + D[1], z + D[2], f ^ 1);
  if (dst && dst.t !== t) {
    for (let i = 0; i < t.items.length; i++) {
      const s = t.items[i]; if (!s) continue;
      const one = { id: s.id, n: 1, dmg: s.dmg, ench: s.ench };
      if (rsInsert(dst, one)) { if (--s.n <= 0) t.items[i] = null; moved = true; rsTouched(dst.t); break; }
    }
  }
  const self = { t, ins: rsRange(t.items.length), ext: [] };
  const src = rsContainer(world, x, y + 1, z, 3);
  if (src) {
    for (const i of src.ext) {
      const s = src.t.items[i]; if (!s) continue;
      const one = { id: s.id, n: 1, dmg: s.dmg, ench: s.ench };
      if (rsInsert(self, one)) { if (--s.n <= 0) src.t.items[i] = null; moved = true; rsTouched(src.t); break; }
    }
  } else if (world === game.world && !rsOpaqueId(world.getBlock(x, y + 1, z))) {
    for (const e of game.entities) {
      if (e.dead || !(e instanceof ItemEntity)) continue;
      if (e.pos.x < x || e.pos.x >= x + 1 || e.pos.z < z || e.pos.z >= z + 1 || e.pos.y < y + 0.5 || e.pos.y >= y + 2) continue;
      const st = { id: e.name, n: e.count, dmg: e.dmg, ench: e.ench };
      rsInsert(self, st);
      if (st.n < e.count) { e.count = st.n; if (st.n <= 0) e.dead = true; moved = true; }
    }
  }
  if (moved) { t.cd = 8; rsTouched(t); }
}
function rsHopperBoxes(meta) {
  const f = meta & 7;
  const out = TEX.mcl_hoppers_hopper_outside, top = TEX.mcl_hoppers_hopper_top, ins = TEX.mcl_hoppers_hopper_inside;
  const rim = { tex: fc => fc === 2 ? top : out };
  const b = [
    px16b([0, 10, 0, 16, 16, 2, rim]), px16b([0, 10, 14, 16, 16, 16, rim]), px16b([0, 10, 2, 2, 16, 14, rim]), px16b([14, 10, 2, 16, 16, 14, rim]),
    px16b([2, 10, 2, 14, 11, 14, { tex: fc => fc === 2 ? ins : out }]),
    px16b([4, 4, 4, 12, 10, 12, { tex: () => out }]),
  ];
  if (f === 3) b.push(px16b([6, 0, 6, 10, 4, 10, { tex: () => out }]));
  else b.push(rsBoxH(px16b([6, 4, 0, 10, 8, 4, { tex: () => out }]), FACE_H[f]));
  return b;
}
rsDefine('hopper', '漏斗', {
  shape: 'boxes', solid: true, opaque: false, render: 'cutout', hard: 3, tool: 'pickaxe', tier: 1, tex: 'mcl_hoppers_hopper_outside',
  texNames: ['mcl_hoppers_hopper_top', 'mcl_hoppers_hopper_inside'],
  boxes: rsHopperBoxes,
}, {
  topSolid: true,
  placed(world, x, y, z) { rsTileAt(world, x, y, z, 'hopper', 5); },
  update(world, x, y, z, m) {
    const p = rsInput(world, x, y, z, false, -1) > 0;
    if (p !== !!(m & 8)) world.setMeta(x, y, z, p ? m | 8 : m & ~8);
  },
  use(g, p, hit) { g.ui.openScreen('rs_hopper', [hit.x, hit.y, hit.z]); return true; },
}, {
  flat: true, icon: 'mcl_hoppers_item',
  place(ctx) {
    const f = ctx.t.face;
    rsPut(ctx, B.hopper, f === 2 || f === 3 ? 3 : f ^ 1);
    return true;
  },
});

RS_RECIPE_HOOKS.push(() => {
  shaped(['PPP', 'CIC', 'CRC'], { P: '#planks', C: '#stone_mat', I: 'iron_ingot', R: 'redstone' }, 'piston');
  shaped(['S', 'P'], { S: 'slime_ball', P: 'piston' }, 'sticky_piston');
  shaped(['CCC', 'CBC', 'CRC'], { C: '#stone_mat', B: 'bow', R: 'redstone' }, 'dispenser');
  shaped(['CCC', 'C C', 'CRC'], { C: '#stone_mat', R: 'redstone' }, 'dropper');
  shaped(['I I', 'ICI', ' I '], { I: 'iron_ingot', C: 'chest' }, 'hopper');
});
