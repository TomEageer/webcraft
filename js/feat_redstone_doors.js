'use strict';
// ---------- 红石：门、活板门、栅栏门（依赖 feat_redstone.js） ----------

const RS_DOOR_WOODS = {
  oak: { zh: '橡木', lo: 'mcl_doors_door_wood_lower', up: 'mcl_doors_door_wood_upper', icon: 'doors_item_wood', trap: 'doors_trapdoor' },
  birch: { zh: '白桦木', lo: 'mcl_doors_door_birch_lower', up: 'mcl_doors_door_birch_upper', icon: 'mcl_doors_door_birch', trap: 'mcl_doors_trapdoor_birch' },
  spruce: { zh: '云杉木', lo: 'mcl_doors_door_spruce_lower', up: 'mcl_doors_door_spruce_upper', icon: 'mcl_doors_door_spruce', trap: 'mcl_doors_trapdoor_spruce' },
  cherry: { zh: '樱花木', lo: 'mcl_cherry_blossom_door_bottom', up: 'mcl_cherry_blossom_door_top', icon: 'mcl_cherry_blossom_door_inv', trap: 'mcl_cherry_blossom_trapdoor' },
  pale_oak: { zh: '苍白橡木', recolor: 'pale_oak_planks' },
  poplar: { zh: '杨木', recolor: 'poplar_planks' },
};
const DT = 3 / 16;
// 贴着某一水平面的薄板（sf 为面编号）
function rsPanel(sf, y0, y1) {
  switch (sf) {
    case 0: return [1 - DT, y0, 0, 1, y1, 1];
    case 1: return [0, y0, 0, DT, y1, 1];
    case 4: return [0, y0, 1 - DT, 1, y1, 1];
    default: return [0, y0, 0, 1, y1, DT];
  }
}
function rsDoorSound(iron, open, x, y, z, pitch) {
  rsSound(iron ? (open ? 'doors_steel_door_open' : 'doors_steel_door_close') : (open ? 'doors_door_open' : 'doors_door_close'), x, y, z, 0.8, pitch || 1,
    pos => game.audio.noiseHit(open ? 500 : 350, 1.5, 0.25, 0.4, 'bandpass', pos));
}

// ---------------- 门 ----------------
// meta：0-1 朝向（放置时玩家视线方向），2 打开，3 上半，4 铰链在右，5 被充能。两半都存完整状态
function rsDoorSide(m) {
  const h = m & 3;
  if (!(m & 4)) return H_FACE[h] ^ 1;
  return H_FACE[(h + (m & 16 ? 1 : 3)) & 3];
}
function rsDoorSet(world, x, ly, z, m) {
  world.setMeta(x, ly, z, m & ~8);
  world.setMeta(x, ly + 1, z, m | 8);
}
function rsDoorHandler(iron) {
  return {
    pushBreak: true,
    update(world, x, y, z, m, id) {
      const upper = !!(m & 8), ly = upper ? y - 1 : y;
      if (world.getBlock(x, ly, z) !== id || world.getBlock(x, ly + 1, z) !== id || (world.getMeta(x, ly + 1, z) & 8) === 0 || (world.getMeta(x, ly, z) & 8)) {
        world.setBlock(x, y, z, 0); return;
      }
      if (!rsTopSolid(world.getBlock(x, ly - 1, z))) { if (!upper) world.breakBlock(x, y, z, true); return; }
      const lm = world.getMeta(x, ly, z);
      const p = rsInput(world, x, ly, z, false, -1) > 0 || rsInput(world, x, ly + 1, z, false, -1) > 0;
      if (p === !!(lm & 32)) return;
      const open = p, was = !!(lm & 4);
      rsDoorSet(world, x, ly, z, (lm & ~(4 | 32)) | (open ? 4 : 0) | (p ? 32 : 0));
      if (open !== was) rsDoorSound(iron, open, x, ly, z);
    },
    use: iron ? null : (g, p, hit) => {
      const w = g.world, m = w.getMeta(hit.x, hit.y, hit.z), ly = m & 8 ? hit.y - 1 : hit.y;
      const lm = w.getMeta(hit.x, ly, hit.z) ^ 4;
      rsDoorSet(w, hit.x, ly, hit.z, lm);
      rsDoorSound(false, !!(lm & 4), hit.x, ly, hit.z);
      return true;
    },
  };
}
function rsPlaceDoor(name, iron) {
  return ctx => {
    const { world, x, y, z, p, hit } = ctx;
    if (ctx.t.face !== 2) return true;
    if (y + 1 >= CH || !rsTopSolid(world.getBlock(x, y - 1, z))) return true;
    const above = world.getBlock(x, y + 1, z);
    if (above && !BLOCKS[above].replaceable) return true;
    const id = B[name], h = rsYawH(p);
    // 铰链：左侧已有同种门则放右侧，否则按点击位置
    const L = DIRS[H_FACE[(h + 3) & 3]];
    let right = false;
    const ln = world.getBlock(x + L[0], y, z + L[2]);
    if (ln === id && !(world.getMeta(x + L[0], y, z + L[2]) & 16)) right = true;
    else if (hit.p) {
      const off = (hit.p[0] - (x + 0.5)) * L[0] + (hit.p[2] - (z + 0.5)) * L[2];
      right = off < -0.05;
    }
    const m = h | (right ? 16 : 0);
    const bx = collisionBoxes(id, m, null) || [];
    if (rsEntityBlocks(ctx.g, x, y, z, bx) || rsEntityBlocks(ctx.g, x, y + 1, z, bx)) return true;
    world.setBlock(x, y + 1, z, id, m | 8, { noUpdate: true });
    world.setBlock(x, y, z, id, m, { noUpdate: true });
    rsUpdateCells(world, [[x, y, z], [x, y + 1, z]]);
    ctx.g.audio.placeSound(id);
    p.consume();
    return true;
  };
}
function rsDefDoor(name, zh, lo, up, opts, iron, icon) {
  rsDefine(name, zh, Object.assign({
    shape: 'boxes', solid: true, opaque: false, render: 'cutout', tex: lo, noItem: true, drop: name, texNames: [lo, up],
    boxes(meta) {
      const t = TEX[meta & 8 ? up : lo];
      return [rsPanel(rsDoorSide(meta), 0, 1).concat([{ tex: () => t }])];
    },
  }, opts), rsDoorHandler(iron), {
    itemDef: { stack: 64 }, flat: false, icon, place: rsPlaceDoor(name, iron),
    iconFn: icon ? null : () => rsPackCanvas('doors_item_wood', rsAvgColorLater(opts.recolorFrom)),
  });
}
// 图标重新上色时纹理已建好，延迟取平均色
function rsAvgColorLater(texName) { return texName ? rsAvgColor(texName) : null; }

// ---------------- 活板门 ----------------
// meta：0-1 朝向（打开后贴向 -朝向 一侧），2 打开，3 上半格，4 被充能
function rsTrapHandler(iron) {
  return {
    update(world, x, y, z, m) {
      const p = rsInput(world, x, y, z, false, -1) > 0;
      if (p === !!(m & 16)) return;
      const was = !!(m & 4);
      world.setMeta(x, y, z, (m & ~(4 | 16)) | (p ? 4 | 16 : 0));
      if (p !== was) rsDoorSound(iron, p, x, y, z, 1.15);
    },
    use: iron ? null : (g, p, hit) => {
      const w = g.world, m = w.getMeta(hit.x, hit.y, hit.z) ^ 4;
      w.setMeta(hit.x, hit.y, hit.z, m);
      rsDoorSound(false, !!(m & 4), hit.x, hit.y, hit.z, 1.15);
      return true;
    },
  };
}
function rsTrapBoxes(meta, t) {
  const ext = { tex: () => TEX[t] };
  if (meta & 4) return [rsPanel(H_FACE[meta & 3] ^ 1, 0, 1).concat([ext])];
  return [meta & 8 ? [0, 1 - DT, 0, 1, 1, 1, ext] : [0, 0, 0, 1, DT, 1, ext]];
}
function rsPlaceTrap(name) {
  return ctx => {
    const { t, p, hit } = ctx;
    let h, top;
    if (t.face === 2) { h = (rsYawH(p) + 2) & 3; top = false; }
    else if (t.face === 3) { h = (rsYawH(p) + 2) & 3; top = true; }
    else { h = FACE_H[t.face]; top = hit.p ? hit.p[1] - ctx.y > 0.5 : false; }
    rsPut(ctx, B[name], h | (top ? 8 : 0));
    return true;
  };
}
function rsDefTrap(name, zh, tex, opts, iron) {
  rsDefine(name, zh, Object.assign({
    shape: 'boxes', solid: true, opaque: false, render: 'cutout', tex,
    boxes(meta) { return rsTrapBoxes(meta, tex); },
  }, opts), rsTrapHandler(iron), { flat: true, iconFn: 'plate', iconTex: tex, place: rsPlaceTrap(name) });
}

// ---------------- 栅栏门 ----------------
// meta：0-1 朝向（规范模型朝 -Z），2 打开，3 被充能
function rsGateBoxes(meta, tex) {
  const h = meta & 3, open = !!(meta & 4), e = { tex: () => TEX[tex] };
  const b = [px16b([0, 5, 7, 2, 16, 9, e]), px16b([14, 5, 7, 16, 16, 9, e])];
  if (!open) {
    b.push(px16b([2, 6, 7, 14, 9, 9, e]), px16b([2, 12, 7, 14, 15, 9, e]), px16b([6, 9, 7, 8, 12, 9, e]), px16b([8, 9, 7, 10, 12, 9, e]));
  } else {
    // 两扇向 -Z 一侧打开
    for (const x0 of [0, 14]) b.push(px16b([x0, 6, 1, x0 + 2, 9, 7, e]), px16b([x0, 12, 1, x0 + 2, 15, 7, e]), px16b([x0, 9, 1, x0 + 2, 12, 3, e]));
  }
  return b.map(q => rsBoxH(q, h));
}
function rsGateHandler() {
  return {
    update(world, x, y, z, m) {
      const p = rsInput(world, x, y, z, false, -1) > 0;
      if (p === !!(m & 8)) return;
      const was = !!(m & 4);
      world.setMeta(x, y, z, (m & ~(4 | 8)) | (p ? 4 | 8 : 0));
      if (p !== was) rsSound(p ? 'doors_fencegate_open' : 'doors_fencegate_close', x, y, z, 0.8, 1);
    },
    use(g, p, hit) {
      const w = g.world;
      let m = w.getMeta(hit.x, hit.y, hit.z);
      const opening = !(m & 4), ph = rsYawH(p);
      // 从另一侧打开时转向，使门朝远离玩家的方向打开
      if (opening && ((m & 3) ^ 2) === ph) m = (m & ~3) | ph;
      m ^= 4;
      w.setMeta(hit.x, hit.y, hit.z, m);
      rsSound(m & 4 ? 'doors_fencegate_open' : 'doors_fencegate_close', hit.x, hit.y, hit.z, 0.8, 1);
      return true;
    },
  };
}
function rsGateIcon(tex) {
  return () => {
    const cv = document.createElement('canvas'); cv.width = cv.height = IS;
    const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
    const tc = tileCanvas(TEX[tex]);
    const r = (x, y, w, h) => ctx.drawImage(tc, x / 3, y / 3, w / 3, h / 3, x, y, w, h);
    r(4, 6, 6, 38); r(38, 6, 6, 38); r(10, 12, 28, 8); r(10, 30, 28, 8); r(20, 20, 8, 10);
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(4, 42, 6, 2); ctx.fillRect(38, 42, 6, 2);
    return cv;
  };
}

// ---------------- 注册 ----------------
for (const w in RS_DOOR_WOODS) {
  const d = RS_DOOR_WOODS[w];
  const lo = d.lo || 'rs_door_' + w + '_lower', up = d.up || 'rs_door_' + w + '_upper', trap = d.trap || 'rs_trap_' + w;
  const wopt = { hard: 3, tool: 'axe', fuel: 300 };
  rsDefDoor(w + '_door', d.zh + '门', lo, up, Object.assign({ recolorFrom: d.recolor }, wopt), false, d.icon);
  rsDefTrap(w + '_trapdoor', d.zh + '活板门', trap, wopt, false);
  rsDefine(w + '_fence_gate', d.zh + '栅栏门', {
    shape: 'boxes', solid: true, opaque: false, render: 'cutout', hard: 2, tool: 'axe', fuel: 300, tex: w + '_planks', fenceGate: true, tall: true,
    boxes(meta) { return rsGateBoxes(meta, w + '_planks'); },
    collide(meta) { return meta & 4 ? null : [rsBoxH([0, 0, 6 / 16, 1, 1.5, 10 / 16], meta & 3)]; },
  }, rsGateHandler(), { flat: true, iconFn: rsGateIcon(w + '_planks'), place(ctx) { rsPut(ctx, B[w + '_fence_gate'], rsYawH(ctx.p)); return true; } });
}
rsDefDoor('iron_door', '铁门', 'mcl_doors_door_iron_lower', 'mcl_doors_door_iron_upper', { hard: 5, tool: 'pickaxe', tier: 1, sound: 'metal' }, true, 'doors_item_steel');
rsDefTrap('iron_trapdoor', '铁活板门', 'doors_trapdoor_steel', { hard: 5, tool: 'pickaxe', tier: 1, sound: 'metal' }, true);

// 缺素材的木种：用橡木门/活板门贴图按木板颜色重新上色
RS_TEX_HOOKS.push(() => {
  for (const w in RS_DOOR_WOODS) {
    const d = RS_DOOR_WOODS[w];
    if (!d.recolor) continue;
    const col = rsAvgColor(d.recolor);
    const mk = (name, src, fb) => defTex(name, p => { const px = rsRecolorPix(src, col); if (px) p.d.set(px); else fb(p); });
    mk('rs_door_' + w + '_lower', 'mcl_doors_door_wood_lower', p => p.fill(col.concat([255]), 0.08));
    mk('rs_door_' + w + '_upper', 'mcl_doors_door_wood_upper', p => { p.fill(col.concat([255]), 0.08); p.rect(4, 3, 8, 5, [0, 0, 0, 0]); });
    mk('rs_trap_' + w, 'doors_trapdoor', p => { p.fill(col.concat([255]), 0.08); });
  }
});

RS_RECIPE_HOOKS.push(() => {
  for (const w in RS_DOOR_WOODS) {
    const P = w + '_planks';
    shaped(['PP', 'PP', 'PP'], { P }, w + '_door', 3);
    shaped(['PPP', 'PPP'], { P }, w + '_trapdoor', 2);
    shaped(['SPS', 'SPS'], { S: 'stick', P }, w + '_fence_gate');
  }
  shaped(['II', 'II', 'II'], { I: 'iron_ingot' }, 'iron_door', 3);
  shaped(['II', 'II'], { I: 'iron_ingot' }, 'iron_trapdoor');
});
