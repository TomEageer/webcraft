'use strict';
// ---------- 末地模块（三）：方块物品配方、维度切换、龙战管理、存档与命令 ----------
// 依赖 feat_end_gen.js（END、要塞/末地生成）与 feat_end_mobs.js（生物与实体）

// 末地外观：深紫黑天空与雾；entityLight 让生物/手持物品在无天空光的末地不至于全黑
Object.assign(DIM_INFO.end, {
  fog: 0x170f22, ambient: 0.3, fogNear: 0.6, fogFar: 1.05, entityLight: 0.42,
  update(game) { endSkyUpdate(game); },
});

Object.assign(SND_MAP, {
  'ender_dragon.say': 'mobs_mc_ender_dragon_attack', 'ender_dragon.hurt': 'mobs_mc_ender_dragon_attack',
  'endermite.say': 'mobs_mc_endermite_random', 'endermite.hurt': 'mobs_mc_endermite_hurt', 'endermite.death': 'mobs_mc_endermite_death',
  'pearl.tp': 'mcl_end_teleport', 'enderman.tp2': 'mobs_mc_enderman_teleport_dst',
});

const END_TEX = {
  frameTop: 'mcl_portals_endframe_top', frameSide: 'mcl_portals_endframe_side', frameBottom: 'mcl_portals_endframe_bottom', frameEye: 'mcl_portals_endframe_eye',
  portal: 'mcl_portals_end_portal', rod: 'mcl_end_end_rod', egg: 'mcl_end_dragon_egg',
  chorusPlant: 'mcl_end_chorus_plant', chorusFlower: 'mcl_end_chorus_flower', chorusDead: 'mcl_end_chorus_flower_dead',
};

// ---------------- 方块形状 ----------------
const EGG_BOXES = [[6, 15, 6, 10, 16, 10], [5, 14, 5, 11, 15, 11], [4, 13, 4, 12, 14, 12], [3, 11, 3, 13, 13, 13], [2, 8, 2, 14, 11, 14], [1, 3, 1, 15, 8, 15], [2, 1, 2, 14, 3, 14], [3, 0, 3, 13, 1, 13]]
  .map(b => b.map(v => v / 16));
function chorusIsPart(id) { return id === B.chorus_plant || id === B.chorus_flower; }
function chorusPlantBoxes(meta, nb) {
  const out = [[0.25, 0.25, 0.25, 0.75, 0.75, 0.75]];
  if (chorusIsPart(nb(1, 0, 0))) out.push([0.75, 0.25, 0.25, 1, 0.75, 0.75]);
  if (chorusIsPart(nb(-1, 0, 0))) out.push([0, 0.25, 0.25, 0.25, 0.75, 0.75]);
  if (chorusIsPart(nb(0, 1, 0))) out.push([0.25, 0.75, 0.25, 0.75, 1, 0.75]);
  const dn = nb(0, -1, 0); if (chorusIsPart(dn) || dn === B.end_stone) out.push([0.25, 0, 0.25, 0.75, 0.25, 0.75]);
  if (chorusIsPart(nb(0, 0, 1))) out.push([0.25, 0.25, 0.75, 0.75, 0.75, 1]);
  if (chorusIsPart(nb(0, 0, -1))) out.push([0.25, 0.25, 0, 0.75, 0.75, 0.25]);
  return out;
}
function chorusSupported(w, x, y, z, id) {
  const dn = w.getBlock(x, y - 1, z);
  if (dn === B.chorus_plant || dn === B.end_stone) return true;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (w.getBlock(x + dx, y, z + dz) === B.chorus_plant) return true;
  return false;
}

// ---------------- 状态辅助 ----------------
function endState() { if (!END.state) END.state = END.defaults(); return END.state; }
function endEnsureChunk(w, x, z) { if (!w.getChunk(x >> 4, z >> 4)) w.generateChunk(x >> 4, z >> 4); }

// 每次进入末地都清理并重建 5x5 黑曜石平台
function endBuildPlatform(g) {
  const w = g.world;
  for (let x = 96; x <= 104; x += 4) for (let z = -4; z <= 4; z += 4) endEnsureChunk(w, x, z);
  for (let x = 98; x <= 102; x++) for (let z = -2; z <= 2; z++) {
    w.setBlock(x, 48, z, B.obsidian, 0, { noUpdate: true });
    for (let y = 49; y <= 51; y++) if (w.getBlock(x, y, z)) w.setBlock(x, y, z, 0, 0, { noUpdate: true });
  }
}

// 激活/关闭返回传送门
function endSetExitPortal(w, on, egg) {
  for (const [x, z] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) if (!w.isLoaded(x, z)) return false;
  for (const [x, z] of exitPortalCells()) {
    const cur = w.getBlock(x, END_S, z);
    if (on && (cur === 0 || cur === B.end_portal)) w.setBlock(x, END_S, z, B.end_portal, 0, { noUpdate: true });
    else if (!on && cur === B.end_portal) w.setBlock(x, END_S, z, 0, 0, { noUpdate: true });
  }
  if (egg && w.getBlock(0, END_S + 4, 0) === 0) w.setBlock(0, END_S + 4, 0, B.dragon_egg, 0, { noUpdate: true });
  return true;
}
function endFinishDragon(g) {
  const st = endState(), w = g.world;
  if (w.dim !== 'end') return;
  if (endSetExitPortal(w, true, !st.eggPlaced)) {
    st.pending = false; st.eggPlaced = true;
    g.audio.play('end_portal');
    g.ui.chat('返回传送门已开启。');
  }
}

// 龙蛋被敲击时随机传送
function endEggTeleport(g, x, y, z) {
  const w = g.world;
  for (let i = 0; i < 64; i++) {
    const nx = x + Math.floor(Math.random() * 31) - 15, ny = y + Math.floor(Math.random() * 15) - 7, nz = z + Math.floor(Math.random() * 31) - 15;
    if (ny < 1 || ny >= CH - 1 || !w.isLoaded(nx, nz) || w.getBlock(nx, ny, nz) !== 0) continue;
    w.setBlock(x, y, z, 0);
    w.setBlock(nx, ny, nz, B.dragon_egg);
    for (let k = 0; k <= 16; k++) { const t = k / 16; g.particles.add(lerp(x, nx, t) + 0.5, lerp(y, ny, t) + 0.5, lerp(z, nz, t) + 0.5, 0, 0, 0, [150, 50, 200], 1, 0); }
    return true;
  }
  return false;
}

// 末地传送门框架是否组成完整环；成功返回中心
function endCheckFrameRing(w, x, y, z) {
  for (let cx = x - 2; cx <= x + 2; cx++) for (let cz = z - 2; cz <= z + 2; cz++) {
    let ok = true;
    for (let dx = -2; dx <= 2 && ok; dx++) for (let dz = -2; dz <= 2 && ok; dz++) {
      const ring = (Math.abs(dx) === 2) !== (Math.abs(dz) === 2);
      if (!ring) continue;
      const id = w.getBlock(cx + dx, y, cz + dz);
      if (id !== B.end_portal_frame || !(w.getMeta(cx + dx, y, cz + dz) & 4)) ok = false;
    }
    if (ok) return [cx, cz];
  }
  return null;
}

// ---------------- 末地天空盒 ----------------
let END_SKY = null;
function endSkyUpdate(g) {
  if (!END_SKY) {
    const t = packTexture('mcl_playerplus_end_sky');
    let mat;
    if (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 4); mat = new THREE.MeshBasicMaterial({ map: t, color: 0x8a6aa8, side: THREE.BackSide, fog: false, depthWrite: false }); }
    else mat = new THREE.MeshBasicMaterial({ color: 0x140c1e, side: THREE.BackSide, fog: false, depthWrite: false });
    END_SKY = new THREE.Mesh(new THREE.BoxGeometry(800, 800, 800), mat);
    END_SKY.renderOrder = -2; END_SKY.frustumCulled = false;
    g.scene.add(END_SKY);
  }
  END_SKY.visible = true;
  END_SKY.position.copy(g.camera.position);
}

// 水晶治疗光束
let END_BEAM = null;
function endBeamUpdate(g, dragon) {
  if (!END_BEAM) {
    const geo = new THREE.BoxGeometry(0.18, 0.18, 1); geo.translate(0, 0, 0.5);
    END_BEAM = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff90ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    END_BEAM.frustumCulled = false; g.scene.add(END_BEAM);
  }
  const c = dragon && dragon.link && !dragon.link.dead ? dragon.link : null;
  END_BEAM.visible = !!c;
  if (!c) return;
  const a = new THREE.Vector3(c.pos.x, c.pos.y + 1.25 + (c.model.P.spin ? c.model.P.spin.position.y - 1.25 : 0), c.pos.z);
  const b = new THREE.Vector3(dragon.pos.x, dragon.pos.y + 2.2, dragon.pos.z);
  END_BEAM.position.copy(a); END_BEAM.lookAt(b); const k = 1 + Math.sin(performance.now() / 80) * 0.3; END_BEAM.scale.set(k, k, a.distanceTo(b));
}

// ---------------- 物品使用 ----------------
function endThrowEye(g, p) {
  const sh = nearestStronghold(g.world.seed, p.pos.x, p.pos.z);
  if (!sh) return false;
  g.entities.push(new EyeOfEnder(g, p, sh.pos));
  g.audio.play('bow', p.pos.clone());
  p.consume(1);
  return true;
}

// 末影龙重生：在返回传送门四边放置 4 个末地水晶
function endCheckRespawn(g) {
  const st = endState(), w = g.world;
  if (!st.killed || st.respawnT > 0) return;
  const near = g.mobs.filter(m => m.type === 'end_crystal' && !m.dead && m.placedId && Math.abs(m.pos.y - (END_S + 1)) < 2.5 && Math.hypot(m.pos.x - 0.5, m.pos.z - 0.5) < 5);
  if (near.length < 4) return;
  st.respawnT = 5;
  g.ui.chat('末影龙正在复活……');
  for (const m of near) { m.silentDeath = true; m.health = 0; m.die(null); }
  endSetExitPortal(w, false, false);
}

const END_FEATURE = {
  name: 'end',
  blocks() {
    const pick = { tool: 'pickaxe', tier: 1 };
    defBlock('end_stone', '末地石', Object.assign({ tex: 'mcl_end_end_stone', hard: 3, blast: 9 }, pick));
    defBlock('end_stone_bricks', '末地石砖', Object.assign({ tex: 'mcl_end_end_bricks', hard: 3, blast: 9 }, pick));
    defBlock('purpur_block', '紫珀块', Object.assign({ tex: 'mcl_end_purpur_block', hard: 1.5, blast: 6 }, pick));
    defBlock('purpur_pillar', '紫珀柱', Object.assign({ tex: { top: 'mcl_end_purpur_pillar_top', side: 'mcl_end_purpur_pillar' }, hard: 1.5, blast: 6 }, pick));
    if (B.cracked_stone_bricks === undefined) defBlock('cracked_stone_bricks', '裂纹石砖', Object.assign({ tex: 'mcl_core_stonebrick_cracked', hard: 1.5, blast: 6 }, pick));
    defBlock('end_rod', '末地烛', {
      tex: END_TEX.rod, shape: 'boxes', opaque: false, render: 'cutout', hard: 0, emit: 14, sound: 'wood',
      boxes: () => [
        [6 / 16, 0, 6 / 16, 10 / 16, 1 / 16, 10 / 16, { uv: f => (f === 2 || f === 3 ? [2, 2, 6, 6] : [2, 6, 6, 7]) }],
        [7 / 16, 1 / 16, 7 / 16, 9 / 16, 1, 9 / 16, { uv: f => (f === 2 || f === 3 ? [2, 0, 4, 2] : [0, 0, 2, 15]) }],
      ],
    });
    defBlock('dragon_egg', '龙蛋', {
      tex: END_TEX.egg, shape: 'boxes', opaque: false, render: 'cutout', hard: 3, emit: 1, gravity: true, blast: 1e9,
      boxes: () => EGG_BOXES, collide: () => [[1 / 16, 0, 1 / 16, 15 / 16, 1, 15 / 16]],
    });
    defBlock('end_portal_frame', '末地传送门框架', {
      tex: END_TEX.frameTop, shape: 'boxes', opaque: false, render: 'cutout', hard: -1, blast: 1e9, emit: 1, drop: null,
      texNames: [END_TEX.frameTop, END_TEX.frameSide, END_TEX.frameBottom, END_TEX.frameEye],
      texFn: (f) => TEX[f === 2 ? END_TEX.frameTop : f === 3 ? END_TEX.frameBottom : END_TEX.frameSide],
      boxes: (meta) => {
        const out = [[0, 0, 0, 1, 13 / 16, 1]];
        if (meta & 4) out.push([4 / 16, 13 / 16, 4 / 16, 12 / 16, 1, 12 / 16, { tex: () => TEX[END_TEX.frameEye], uv: f => (f === 2 || f === 3 ? [4, 4, 12, 12] : [4, 0, 12, 3]) }]);
        return out;
      },
      collide: (meta) => [[0, 0, 0, 1, (meta & 4) ? 1 : 13 / 16, 1]],
    });
    defBlock('end_portal', '末地传送门', {
      tex: END_TEX.portal, shape: 'boxes', solid: false, opaque: false, render: 'opaque', hard: -1, blast: 1e9, emit: 15, drop: null, noItem: true,
      boxes: () => [[0, 0, 0, 1, 12 / 16, 1, { faces: [false, false, true, true, false, false], noCull: true }]],
    });
    defBlock('chorus_plant', '紫颂植物', {
      tex: END_TEX.chorusPlant, shape: 'boxes', opaque: false, render: 'cutout', hard: 0.4, tool: 'axe', sound: 'wood',
      drop: () => (Math.random() < 0.5 ? ['chorus_fruit', 1] : null), boxes: (meta, nb) => chorusPlantBoxes(meta, nb),
    });
    defBlock('chorus_flower', '紫颂花', {
      tex: END_TEX.chorusFlower, shape: 'boxes', opaque: false, render: 'cutout', hard: 0.4, tool: 'axe', sound: 'wood',
      texNames: [END_TEX.chorusFlower, END_TEX.chorusDead],
      texFn: (f, m) => TEX[m >= 5 ? END_TEX.chorusDead : END_TEX.chorusFlower],
      boxes: () => [[1 / 16, 0, 1 / 16, 15 / 16, 14 / 16, 15 / 16]],
    });
    if (!MODELS.enderman) MODELS.enderman = END_MODELS.enderman;
    if (!MODELS.endermite) MODELS.endermite = END_MODELS.endermite;
    if (!MODELS.ender_dragon) MODELS.ender_dragon = END_MODELS.ender_dragon;
    if (!MODELS.end_crystal) MODELS.end_crystal = END_MODELS.end_crystal;
  },
  items() {
    defItem('eye_of_ender', '末影之眼', { icon: 'mcl_end_ender_eye', desc: '右键扔出，指向最近的要塞' });
    defItem('ender_pearl', '末影珍珠', { icon: 'mcl_throwing_ender_pearl', stack: 16 });
    defItem('chorus_fruit', '紫颂果', { icon: 'mcl_end_chorus_fruit', food: [4, 2.4], alwaysEat: true, onEat: (p, st, g) => { endTeleport(p, g, p.pos.x, p.pos.y, p.pos.z, 8, 'pearl.tp'); return null; } });
    defItem('popped_chorus_fruit', '爆裂紫颂果', { icon: 'mcl_end_chorus_fruit_popped' });
    defItem('end_crystal', '末地水晶', { icon: 'mcl_end_crystal_item', desc: '只能放在黑曜石或基岩上' });
    defItem('enderman_spawn_egg', '末影人刷怪蛋', { spawnEgg: 'enderman', creativeOnly: true, icon: 'mobs_mc_spawn_icon_enderman' });
    defItem('endermite_spawn_egg', '末影螨刷怪蛋', { spawnEgg: 'endermite', creativeOnly: true, icon: 'mobs_mc_spawn_icon_endermite' });
  },
  recipes() {
    shapeless(['ender_pearl', 'blaze_powder'], 'eye_of_ender');
    shaped(['SS', 'SS'], { S: 'end_stone' }, 'end_stone_bricks', 4);
    shaped(['CC', 'CC'], { C: 'popped_chorus_fruit' }, 'purpur_block', 4);
    shaped(['P', 'P'], { P: 'purpur_block' }, 'purpur_pillar', 2);
    shaped(['B', 'P'], { B: 'blaze_rod', P: 'popped_chorus_fruit' }, 'end_rod', 4);
    shaped(['GGG', 'GEG', 'GTG'], { G: 'glass', E: 'eye_of_ender', T: 'ghast_tear' }, 'end_crystal');
    SMELT.chorus_fruit = 'popped_chorus_fruit';
    if (!SMELT.stone_bricks) SMELT.stone_bricks = 'cracked_stone_bricks';
  },
  textures() {
    for (const k in END_TEX) ensureTex(END_TEX[k]);
    // 末地烛物品图标：斜放的细杆
    if (typeof ICON_CANVAS !== 'undefined' && !ICON_CANVAS.has('end_rod')) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 48; const x = cv.getContext('2d'); x.scale(1.5, 1.5);
      for (let i = 0; i < 22; i++) { x.fillStyle = i % 5 ? '#fbe9df' : '#f3d2c4'; x.fillRect(6 + i, 25 - i, 3, 3); }
      x.fillStyle = '#6a4a78'; x.fillRect(3, 25, 6, 4);
      ICON_CANVAS.set('end_rod', cv);
    }
  },
  genChunk(world, ch) { genStrongholdChunk(world, ch); },

  // 方块支撑：紫颂植物失去支撑即断裂
  blockUpdate(w, x, y, z, id) {
    if (id !== B.chorus_plant && id !== B.chorus_flower) return false;
    if (!chorusSupported(w, x, y, z, id)) w.schedule(x, y, z, 1);
    return true;
  },
  scheduledTick(w, x, y, z, id) {
    if (id !== B.chorus_plant && id !== B.chorus_flower) return false;
    if (!chorusSupported(w, x, y, z, id)) w.breakBlock(x, y, z, true);
    return true;
  },
  randomTick(w, x, y, z, id) {
    if (id !== B.chorus_flower) return false;
    const age = w.getMeta(x, y, z);
    if (age >= 5 || Math.random() > 0.15) return true;
    let h = 0; while (w.getBlock(x, y - 1 - h, z) === B.chorus_plant) h++;
    if (w.getBlock(x, y + 1, z) === 0 && w.getBlock(x, y + 2, z) === 0 && h < 4 && Math.random() < 0.7) {
      w.setBlock(x, y, z, B.chorus_plant); w.setBlock(x, y + 1, z, B.chorus_flower, age);
    } else {
      let grew = false;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (Math.random() < 0.5 || w.getBlock(x + dx, y, z + dz) || w.getBlock(x + dx, y - 1, z + dz)) continue;
        if (!grew) w.setBlock(x, y, z, B.chorus_plant);
        w.setBlock(x + dx, y, z + dz, B.chorus_flower, age + 1); grew = true;
      }
      if (!grew) w.setMeta(x, y, z, 5);
    }
    return true;
  },

  useBlock(g, p, hit, held) {
    const w = g.world;
    if (hit.id === B.end_portal_frame && held && held.id === 'eye_of_ender') {
      const m = w.getMeta(hit.x, hit.y, hit.z);
      if (m & 4) return true;
      w.setMeta(hit.x, hit.y, hit.z, m | 4);
      w.markDirty(hit.x, hit.y, hit.z);
      p.consume(1);
      g.audio.play('place.stone', new THREE.Vector3(hit.x, hit.y, hit.z));
      endBurst(g, hit.x + 0.5, hit.y + 0.8, hit.z + 0.5, 10);
      const c = endCheckFrameRing(w, hit.x, hit.y, hit.z);
      if (c) {
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) w.setBlock(c[0] + dx, hit.y, c[1] + dz, B.end_portal, 0, { noUpdate: true });
        g.audio.sfx('end_portal', null, 1);
        g.ui.chat('末地传送门已开启。');
      }
      return true;
    }
    if (hit.id === B.dragon_egg) { endEggTeleport(g, hit.x, hit.y, hit.z); return true; }
    return false;
  },
  useItem(g, p, hit, held) {
    if (!held) return false;
    if (hit && !p.sneaking && BLOCKS[hit.id].interact) return false;
    const now = performance.now();
    if (held.id === 'ender_pearl') {
      if (now - (END.pearlT || 0) < 1000) return true;
      END.pearlT = now;
      g.entities.push(new ThrownPearl(g, p)); g.audio.play('bow', p.pos.clone()); p.consume(1);
      return true;
    }
    if (held.id === 'eye_of_ender') {
      if (g.world.dim !== 'overworld') return false;
      if (now - (END.eyeT || 0) < 600) return true;
      END.eyeT = now;
      endThrowEye(g, p);
      return true;
    }
    if (held.id === 'end_crystal' && hit && hit.n[1] === 1 && (hit.id === B.obsidian || hit.id === B.bedrock)) {
      const w = g.world;
      if (w.getBlock(hit.x, hit.y + 1, hit.z) || w.getBlock(hit.x, hit.y + 2, hit.z)) return true;
      if (g.mobs.some(m => m.type === 'end_crystal' && !m.dead && Math.abs(m.pos.x - hit.x - 0.5) < 1 && Math.abs(m.pos.z - hit.z - 0.5) < 1)) return true;
      const id = 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1e4);
      const c = { id, dim: w.dim, x: hit.x + 0.5, y: hit.y + 1, z: hit.z + 0.5 };
      endState().placed.push(c);
      const m = g.spawnMob('end_crystal', c.x, c.y, c.z); m.placedId = id; m.showBase = true;
      p.consume(1);
      endCheckRespawn(g);
      return true;
    }
    return false;
  },
  // 龙蛋：左键敲击也会传送
  breakSpeed(g, p, id, speed) {
    if (id === B.dragon_egg && p.mode !== 'creative' && p.mining) { endEggTeleport(g, p.mining.x, p.mining.y, p.mining.z); p.mining = null; return 0; }
    return speed;
  },
  damageTaken(g, e, dmg, src, attacker) {
    if (e.type === 'enderman') {
      if (src === 'arrow') { e.tpPending = true; return 0; }
      if (attacker && attacker.isPlayer) { e.angry = true; e.angerT = 30; }
      if (dmg > 0 && Math.random() < 0.35) e.tpPending = true;
    }
    if (e.type === 'ender_dragon' && (src === 'fall' || src === 'void' || src === 'fire' || src === 'lava')) return 0;
    return dmg;
  },

  spawn(g) {
    const w = g.world, p = g.player;
    const count = g.mobs.filter(m => m.type === 'enderman' && !m.dead).length;
    if (w.dim === 'overworld') {
      if (count >= 3 || Math.random() > 0.08) return;
      const a = Math.random() * Math.PI * 2, r = 24 + Math.random() * 30;
      const x = Math.floor(p.pos.x + Math.cos(a) * r), z = Math.floor(p.pos.z + Math.sin(a) * r);
      if (!w.isLoaded(x, z)) return;
      const y = Math.random() < 0.6 ? g.surfaceAt(x, z) : 8 + Math.floor(Math.random() * 50);
      if (y < 1 || y >= CH - 4) return;
      if (w.getBlock(x, y, z) || w.getBlock(x, y + 1, z) || w.getBlock(x, y + 2, z) || !BLOCKS[w.getBlock(x, y - 1, z)].opaque) return;
      if (w.blockLight(x, y, z) > 0 || w.skyLight(x, y, z) - g.skyDarken > 4) return;
      g.spawnMob('enderman', x + 0.5, y, z + 0.5);
    } else if (w.dim === 'end') {
      if (count >= 12) return;
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2, r = 16 + Math.random() * 40;
        const x = Math.floor(p.pos.x + Math.cos(a) * r), z = Math.floor(p.pos.z + Math.sin(a) * r);
        if (!w.isLoaded(x, z)) continue;
        const y = g.surfaceAt(x, z);
        if (y < 2 || y >= CH - 4 || w.getBlock(x, y - 1, z) !== B.end_stone) continue;
        if (w.getBlock(x, y, z) || w.getBlock(x, y + 1, z) || w.getBlock(x, y + 2, z)) continue;
        g.spawnMob('enderman', x + 0.5, y, z + 0.5);
        break;
      }
    }
  },

  tick(g) {
    const w = g.world, p = g.player;
    if (!g.worldMeta) return;
    if (END.metaId !== g.worldMeta.id) { END.state = END.defaults(); END.metaId = g.worldMeta.id; END.lastDim = 'overworld'; }
    const st = endState();
    END.portalCd = (END.portalCd || 0) - 1;
    // 维度变化
    if (END.lastDim !== w.dim) {
      const from = END.lastDim; END.lastDim = w.dim;
      if (w.dim === 'end' && from && Math.abs(p.pos.x - 100.5) < 4 && Math.abs(p.pos.z - 0.5) < 4) { endBuildPlatform(g); p.pos.set(100.5, 49, 0.5); p.vel.set(0, 0, 0); }
    }
    // 在末地死亡后重生：回到主世界出生点
    if (w.dim === 'end' && p.alive && END.wasDead) { END.wasDead = false; const s = p.spawn; g.changeDimension('overworld', s[0], s[1], s[2]); return; }
    END.wasDead = !p.alive && w.dim === 'end';
    // 传送门
    if (p.alive && END.portalCd <= 0 && endTouchingPortal(p)) {
      END.portalCd = 60;
      if (w.dim === 'end') { const s = p.spawn; g.changeDimension('overworld', s[0], s[1], s[2]); END.lastDim = 'overworld'; }
      else { g.changeDimension('end', 100.5, 49, 0.5); endBuildPlatform(g); END.lastDim = 'end'; }
      return;
    }
    if (w.dim !== 'end' || w.tick % 10) return;
    // 柱顶水晶、玩家放置的水晶
    const pil = pillarList(w.seed);
    for (let i = 0; i < 10; i++) {
      if (!st.crystals[i]) continue;
      const q = pil[i];
      if (!w.isLoaded(q.x, q.z) || g.mobs.some(m => m.type === 'end_crystal' && m.pillar === i && !m.dead)) continue;
      const m = g.spawnMob('end_crystal', q.x + 0.5, q.h + 2, q.z + 0.5); m.pillar = i; m.showBase = false;
    }
    for (const c of st.placed) {
      if (c.dim !== w.dim || !w.isLoaded(Math.floor(c.x), Math.floor(c.z)) || g.mobs.some(m => m.placedId === c.id && !m.dead)) continue;
      const m = g.spawnMob('end_crystal', c.x, c.y, c.z); m.placedId = c.id; m.showBase = true;
    }
    const fx = g.entities.some(e => e instanceof DragonDeathFx);
    if (st.respawnT > 0) {
      st.respawnT -= 0.5;
      if (st.respawnT <= 0) { st.respawnT = 0; st.killed = false; st.hp = 200; st.crystals = st.crystals.map(() => 1); g.ui.chat('末影龙复活了！'); }
    }
    if (!st.killed && !st.respawnT && !fx && w.isLoaded(0, 0) && !g.mobs.some(m => m.type === 'ender_dragon' && m.fight && !m.dead)) {
      const d = g.spawnMob('ender_dragon', 0.5, 88, 0.5); d.fight = true; d.health = Math.max(1, st.hp);
    }
    if (st.pending && !fx) endFinishDragon(g);
    if (st.killed && !st.pending && w.isLoaded(0, 0) && w.getBlock(1, END_S, 0) === 0 && !st.respawnT) endSetExitPortal(w, true, false);
  },

  frame(g) {
    const inEnd = g.world && g.world.dim === 'end';
    if (END_SKY && !inEnd) END_SKY.visible = false;
    const dragon = inEnd ? g.mobs.find(m => m.type === 'ender_dragon' && m.fight && !m.dead) : null;
    if (END_BEAM || dragon) endBeamUpdate(g, dragon);
    const key = dragon ? Math.ceil(dragon.health) : null;
    if (key !== END.barKey) {
      END.barKey = key;
      if (dragon) { g.ui.bossBar('末影龙', dragon.health / dragon.def.hp); END.barShown = true; }
      else if (END.barShown) { g.ui.bossBar(null); END.barShown = false; }
    }
  },

  save() { return END.state; },
  load(g, json) { END.state = Object.assign(END.defaults(), json || {}); END.metaId = g.worldMeta && g.worldMeta.id; END.lastDim = null; },
};
FEATURES.push(END_FEATURE);

function endTouchingPortal(p) {
  const w = p.world;
  for (const x of [Math.floor(p.pos.x - p.w), Math.floor(p.pos.x + p.w)]) for (const z of [Math.floor(p.pos.z - p.w), Math.floor(p.pos.z + p.w)])
    for (const y of [Math.floor(p.pos.y), Math.floor(p.pos.y + 0.6)]) if (w.getBlock(x, y, z) === B.end_portal && p.pos.y < y + 0.8) return true;
  return false;
}

// ---------------- 命令 ----------------
COMMANDS.locatestronghold = (a, ui, g) => {
  if (g.world.dim !== 'overworld') { ui.chat('错误：要塞只存在于主世界'); return; }
  const r = nearestStronghold(g.world.seed, g.player.pos.x, g.player.pos.z);
  ui.chat(`最近的要塞（末地传送门房间）位于 [${r.pos[0]}, ${r.pos[1]}, ${r.pos[2]}]（距离 ${r.dist} 格）`);
};
COMMANDS.enddragon = (a, ui, g) => {
  const st = endState(), d = g.mobs.find(m => m.type === 'ender_dragon' && m.fight && !m.dead);
  ui.chat(`末影龙：${st.killed ? '已被击败' : d ? '生命 ' + Math.ceil(d.health) + '/200' : '未加载'}；剩余末地水晶 ${st.crystals.filter(Boolean).length}/10`);
};
