'use strict';
// ---------- 界面：HUD、物品栏、合成、熔炉、箱子、创造物品栏、菜单、聊天命令 ----------

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// 插件界面：SCREENS[name] = { title, render(ui, arg) => html, open(ui, arg), close(ui), update(ui, dt),
//   containers: { 容器名: { get(ui) => 数组, accept(ui, i, stack) => bool, output: true, take(ui, i, shift) => stack|null, quick: true } } }
const SCREENS = {};
// 插件命令：COMMANDS[name] = (args, ui, game) => void
const COMMANDS = {};
const sameStack = (a, b) => a && b && a.id === b.id && !a.ench && !b.ench && !a.dmg && !b.dmg;

class UI {
  constructor(game) {
    this.g = game; this.screen = null; this.cursor = null; this.craft = new Array(9).fill(null); this.craftW = 2;
    this.chatLines = []; this.nameT = 0; this.lastSel = -1; this.creativeFilter = ''; this.creativeScroll = 0;
    this.mx = 0; this.my = 0;
  }
  init() {
    this.icons = hudIcons();
    this.el = { hud: $('#hud'), hotbar: $('#hotbar'), hearts: $('#hearts'), food: $('#food'), air: $('#air'), xp: $('#xpfill'), xpl: $('#xplevel'),
      armor: $('#armor'), effects: $('#effects'), name: $('#itemname'), debug: $('#debug'), chatlog: $('#chatlog'), chatin: $('#chatinput'), screen: $('#screen'), cursor: $('#cursor'), tip: $('#tooltip'),
      flash: $('#dmgflash'), water: $('#waterov'), fade: $('#fade'), menu: $('#menu'), crosshair: $('#crosshair'), vignette: $('#vignette') };
    document.addEventListener('mousemove', e => {
      this.mx = e.clientX; this.my = e.clientY;
      this.el.cursor.style.transform = `translate(${e.clientX - 24}px, ${e.clientY - 24}px)`;
      this.el.tip.style.transform = `translate(${e.clientX + 16}px, ${e.clientY - 30}px)`;
    });
    this.el.screen.addEventListener('mousedown', e => {
      const s = e.target.closest('.slot');
      if (!s) return;
      e.preventDefault();
      this.slotClick(s.dataset.c, +s.dataset.i, e.button, e.shiftKey);
    });
    this.el.screen.addEventListener('contextmenu', e => e.preventDefault());
    this.el.screen.addEventListener('mouseover', e => {
      const s = e.target.closest('.slot');
      const st = s ? this.getSlot(s.dataset.c, +s.dataset.i) : null;
      if (st && !this.cursor) { this.el.tip.textContent = this.itemLabel(st); this.el.tip.style.display = 'block'; }
      else this.el.tip.style.display = 'none';
    });
    this.el.screen.addEventListener('mouseleave', () => { this.el.tip.style.display = 'none'; });
    this.el.chatin.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { const v = this.el.chatin.value.trim(); this.closeChat(); if (v) this.sendChat(v); }
      else if (e.key === 'Escape') this.closeChat();
    });
  }
  itemLabel(st) {
    const it = ITEMS[st.id]; if (!it) return st.id;
    let s = st.name || it.zh;
    if (st.ench) s += '\n' + enchText(st);
    if (it.armor) s += `\n护甲值 +${it.armor.points}` + (it.armor.tough ? `  盔甲韧性 +${it.armor.tough}` : '');
    if (it.tool && it.tool.dmg) s += `\n攻击伤害 ${it.tool.dmg}`;
    if (it.durability) s += `\n耐久 ${it.durability - (st.dmg || 0)}/${it.durability}`;
    if (it.food && it.food[0]) s += `\n饥饿值 +${it.food[0]}`;
    if (it.desc) s += '\n' + it.desc;
    return s;
  }

  // ---------------- HUD ----------------
  slotHTML(c, i, st, extra) {
    let inner = '';
    if (st) {
      inner = `<img src="${iconURL(st.id)}" draggable="false">${st.ench || (ITEMS[st.id] && ITEMS[st.id].glint) ? '<b class="glint"></b>' : ''}`;
      if (st.n > 1) inner += `<span class="cnt">${st.n}</span>`;
      const it = ITEMS[st.id];
      if (it && it.durability && st.dmg) { const f = 1 - st.dmg / it.durability; inner += `<span class="dur"><i style="width:${f * 100}%;background:hsl(${f * 120},90%,45%)"></i></span>`; }
    }
    return `<div class="slot ${extra || ''}" data-c="${c}" data-i="${i}">${inner}</div>`;
  }
  refresh() {
    const p = this.g.player; if (!p) return;
    let h = '';
    for (let i = 0; i < 9; i++) h += this.slotHTML('hb', i, p.inventory.slots[i], i === p.sel ? 'sel' : '');
    this.el.hotbar.innerHTML = h;
    if (this.screen) this.renderScreen();
    this.el.cursor.innerHTML = this.cursor ? `<img src="${iconURL(this.cursor.id)}">${this.cursor.n > 1 ? `<span class="cnt">${this.cursor.n}</span>` : ''}` : '';
  }
  update(dt) {
    const g = this.g, p = g.player; if (!p) return;
    if (p.sel !== this.lastSel) { this.lastSel = p.sel; this.refresh(); const st = p.held(); if (st) { this.el.name.textContent = ITEMS[st.id].zh; this.nameT = 2; } }
    this.nameT -= dt; this.el.name.style.opacity = Math.max(0, Math.min(1, this.nameT));
    const surv = p.mode === 'survival';
    this.el.hearts.style.display = this.el.food.style.display = this.el.air.style.display = this.el.armor.style.display = surv ? '' : 'none';
    this.renderEffects();
    $('#xpbar').style.display = surv ? '' : 'none';
    if (surv) {
      const apts = p.armorPoints()[0];
      const pois = effLv(p, 'poison') ? 'p' : effLv(p, 'wither') ? 'w' : '';
      const key = `${Math.ceil(p.health)}|${p.food}|${p.air >= 14.99 ? 'full' : Math.ceil(p.air / 1.5)}|${p.hurtTime > 0}|${apts}|${Math.ceil(p.absorb || 0)}|${pois}`;
      if (key !== this.barKey) {
        this.barKey = key;
        let hh = '', fh = '', ah = '';
        const hp = Math.ceil(p.health);
        for (let i = 0; i < 10; i++) hh += `<i style="background-image:url(${hp >= (i + 1) * 2 ? this.icons.heartFull : hp === i * 2 + 1 ? this.icons.heartHalf : this.icons.heartEmpty})" class="${hp <= 4 ? 'shake' : ''} ${pois}"></i>`;
        const ab = Math.ceil(p.absorb || 0);
        for (let i = 0; i < Math.ceil(ab / 2); i++) hh += `<i class="gold" style="background-image:url(${ab >= (i + 1) * 2 ? this.icons.heartFull : this.icons.heartHalf})"></i>`;
        let ah2 = '';
        if (apts > 0) for (let i = 0; i < 10; i++) ah2 += `<i style="background-image:url(${apts >= (i + 1) * 2 ? this.icons.armorFull : apts === i * 2 + 1 ? this.icons.armorHalf : this.icons.armorEmpty})"></i>`;
        this.el.armor.innerHTML = ah2;
        for (let i = 0; i < 10; i++) fh += `<i style="background-image:url(${p.food >= (i + 1) * 2 ? this.icons.drumFull : p.food === i * 2 + 1 ? this.icons.drumHalf : this.icons.drumEmpty})"></i>`;
        if (p.air < 14.99) { const b = Math.ceil(p.air / 1.5); for (let i = 0; i < b; i++) ah += `<i style="background-image:url(${this.icons.bubble})"></i>`; }
        this.el.hearts.innerHTML = hh; this.el.food.innerHTML = fh; this.el.air.innerHTML = ah;
      }
      const need = p.level < 16 ? 2 * p.level + 7 : p.level < 31 ? 5 * p.level - 38 : 9 * p.level - 158;
      this.el.xp.style.width = (p.xp / need * 100) + '%';
      this.el.xpl.textContent = p.level > 0 ? p.level : '';
    }
    this.el.water.style.display = p.eyeInWater ? 'block' : 'none';
    this.el.water.style.background = g.world.getBlock(Math.floor(p.pos.x), Math.floor(p.eye().y), Math.floor(p.pos.z)) === B.lava ? 'rgba(220,80,0,.85)' : '';
    if (p.eyeInWater) {
      const tex = this.el.water.firstElementChild;
      if (tex && !tex.dataset.ok && PACK_READY && PACK_IMG.misc_underwater) { tex.style.backgroundImage = `url(${packCanvas('misc_underwater').toDataURL()})`; tex.dataset.ok = 1; }
      // 原版：贴图偏移 = 偏航角/64、俯仰角/64 个贴图单位
      if (tex) tex.style.backgroundPosition = `${(p.yaw * 180 / Math.PI) / 64 * 25}vw ${(-p.pitch * 180 / Math.PI) / 64 * 25}vh`;
    }
    // 聊天淡出
    const now = performance.now();
    this.el.chatlog.innerHTML = this.chatLines.filter(l => g.state === 'chat' || now - l.t < 10000).slice(-10).map(l => `<div>${esc(l.s)}</div>`).join('');
    if (this.screen === 'furnace') this.updateFurnaceBars();
    if (SCREENS[this.screen] && SCREENS[this.screen].update) SCREENS[this.screen].update(this, dt);
    if (g.showDebug) this.renderDebug(); else this.el.debug.style.display = 'none';
  }
  renderDebug() {
    const g = this.g, p = g.player, w = g.world;
    const bx = Math.floor(p.pos.x), by = Math.floor(p.pos.y), bz = Math.floor(p.pos.z);
    const facing = ['北 (-Z)', '西 (-X)', '南 (+Z)', '东 (+X)'][((Math.round(p.yaw / (Math.PI / 2)) % 4) + 4) % 4];
    const bio = w.getChunk(bx >> 4, bz >> 4) ? w.getChunk(bx >> 4, bz >> 4).biome[(bz & 15) * 16 + (bx & 15)] : '-';
    const tg = p.target();
    this.el.debug.style.display = 'block';
    this.el.debug.innerHTML = [
      `WebCraft（参考 Java 版 26.3 Wilderness Bound）`,
      `${g.fps} fps  区块: ${g.chunksRendered}/${w.chunks.size}  实体: ${g.mobs.length + g.entities.length}`,
      `XYZ: ${p.pos.x.toFixed(3)} / ${dispY(g.world, p.pos.y).toFixed(3)} / ${p.pos.z.toFixed(3)}`,
      `方块: ${bx} ${dispY(w, by)} ${bz}  区块: ${bx >> 4} ${bz >> 4}`,
      `朝向: ${facing}`,
      `生物群系: ${BIOMES[bio] ? BIOMES[bio].zh + ' (' + bio + ')' : bio}`,
      `光照: 天空 ${w.skyLight(bx, by + 1, bz)}  方块 ${w.blockLight(bx, by + 1, bz)}`,
      `时间: 第 ${Math.floor(g.time / 24000) + 1} 天 ${fmtTime(g.time % 24000)}  模式: ${p.mode}`,
      `种子: ${w.seed}`,
      tg.block ? `目标方块: ${BLOCKS[tg.block.id].zh} (${BLOCKS[tg.block.id].name}) @ ${tg.block.x} ${tg.block.y} ${tg.block.z}` : (tg.mob ? `目标生物: ${tg.mob.def.zh}  生命 ${tg.mob.health}` : ''),
    ].map(esc).join('<br>');
  }
  renderEffects() {
    const p = this.g.player, ef = p.effects || {};
    const ids = Object.keys(ef);
    const key = ids.map(id => id + ef[id].level + Math.ceil(ef[id].t)).join('|');
    if (key === this.efKey) return;
    this.efKey = key;
    this.el.effects.innerHTML = ids.map(id => {
      const e = EFFECTS[id], t = Math.ceil(ef[id].t), icon = e.icon && PACK_READY && window.PACK_TEX[e.icon];
      return `<div class="eff ${e.good ? '' : 'bad'}">${icon ? `<img src="${icon}">` : `<span style="background:rgb(${e.color.join(',')})"></span>`}<div><b>${e.zh} ${ROMAN[ef[id].level + 1] || ''}</b><small>${t > 3600 ? '**:**' : Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0')}</small></div></div>`;
    }).join('');
  }
  // 首领血条：bossBar('末影龙', 0.5)；bossBar(null) 隐藏
  bossBar(name, frac) {
    const el = document.getElementById('bossbar');
    if (!name) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    el.innerHTML = `${esc(name)}<div class="bar"><i style="width:${Math.max(0, Math.min(1, frac)) * 100}%"></i></div>`;
  }
  flashDamage() { this.el.flash.style.opacity = 0.45; setTimeout(() => { this.el.flash.style.opacity = 0; }, 120); }
  chat(s) { this.chatLines.push({ s, t: performance.now() }); if (this.chatLines.length > 100) this.chatLines.shift(); }

  // ---------------- 聊天与命令 ----------------
  openChat(prefix) {
    const g = this.g; g.state = 'chat'; document.exitPointerLock && document.exitPointerLock();
    this.el.chatin.style.display = 'block'; this.el.chatin.value = prefix || ''; setTimeout(() => this.el.chatin.focus(), 0);
  }
  closeChat() { this.el.chatin.style.display = 'none'; this.el.chatin.blur(); this.g.state = 'playing'; this.g.lockPointer(); }
  sendChat(v) {
    if (v[0] !== '/') { this.chat('<玩家> ' + v); return; }
    const a = v.slice(1).split(/\s+/), g = this.g, p = g.player, cmd = a[0];
    if (g.rules && g.rules.cheats === false && !['help', 'seed', 'locatevillage', 'locatestronghold', 'locatefortress'].includes(cmd)) { this.chat('这个世界没有开启作弊，不能使用该命令'); return; }
    const ok = s => this.chat(s), bad = s => this.chat('错误：' + s);
    switch (cmd) {
      case 'help': ok('可用命令：/time set <day|noon|night|midnight|数字>  /gamemode <survival|creative|spectator>  /tp x y z  /give <物品> [数量]  /summon <生物>  /locate biome <群系>  /kill  /seed  /spawnpoint  /clear  /gamerule keepInventory <true|false>  /weather <clear|rain|thunder>  /effect <效果> [秒] [等级]  /enchant <附魔> [等级]  /xp <数量>  /dim <overworld|nether|end>' + (Object.keys(COMMANDS).length ? '  /' + Object.keys(COMMANDS).join('  /') : '')); break;
      case 'time': {
        const m = { day: 1000, noon: 6000, night: 13000, midnight: 18000, sunrise: 23000, sunset: 12000 };
        const v2 = a[1] === 'set' ? a[2] : a[1] === 'add' ? null : a[1];
        if (a[1] === 'add') { g.time += +a[2] || 0; ok('时间已增加'); break; }
        const t = m[v2] !== undefined ? m[v2] : +v2;
        if (isNaN(t)) { bad('无效的时间'); break; }
        g.time = Math.floor(g.time / 24000) * 24000 + t; ok('时间已设为 ' + t); break;
      }
      case 'gamemode': case 'gm': {
        const m = { survival: 'survival', s: 'survival', 0: 'survival', creative: 'creative', c: 'creative', 1: 'creative', spectator: 'spectator', sp: 'spectator', 3: 'spectator' }[a[1]];
        if (!m) { bad('未知的游戏模式'); break; }
        g.setMode(m); ok('已将游戏模式切换为 ' + { survival: '生存模式', creative: '创造模式', spectator: '旁观模式' }[m]); break;
      }
      case 'tp': {
        const r = (s, base) => s && s[0] === '~' ? base + (+s.slice(1) || 0) : +s;
        // 输入的 y 是原版坐标，换算成内部坐标
        const off = Y_OFF[g.world.dim] || 0;
        const x = r(a[1], p.pos.x), y = a[2] && a[2][0] === '~' ? r(a[2], p.pos.y) : r(a[2], 0) + off, z = r(a[3], p.pos.z);
        if ([x, y, z].some(isNaN)) { bad('坐标无效'); break; }
        p.pos.set(x, y, z); p.vel.set(0, 0, 0); ok(`已传送到 ${x.toFixed(1)} ${(y - off).toFixed(1)} ${z.toFixed(1)}`); break;
      }
      case 'give': {
        const n = (a[1] || '').replace('minecraft:', '');
        if (!ITEMS[n]) { bad('未知物品 ' + n); break; }
        const c = Math.min(6400, +a[2] || 1);
        const left = p.inventory.add(n, c); if (left) g.dropItem(p.pos.x, p.pos.y + 1, p.pos.z, n, left);
        this.refresh(); ok(`已将 ${c} 个 [${ITEMS[n].zh}] 给予玩家`); break;
      }
      case 'summon': {
        const t = (a[1] || '').replace('minecraft:', '');
        if (!MOB_DEFS[t]) { bad('未知生物 ' + t + '，可用：' + Object.keys(MOB_DEFS).join(', ')); break; }
        const d = p.lookDir();
        g.spawnMob(t, p.pos.x + d.x * 3, p.pos.y + 0.5, p.pos.z + d.z * 3, t === 'creaking' ? { heart: g.findNearby(B.creaking_heart, 16) } : null);
        ok('已召唤新的 ' + MOB_DEFS[t].zh); break;
      }
      case 'locate': {
        if (a[1] === 'structure') { if (COMMANDS['locate' + a[2]]) COMMANDS['locate' + a[2]](a, this, g); else bad('未知结构'); break; }
        const target = a[1] === 'biome' ? a[2] : a[1];
        if (!BIOMES[target]) { bad('未知群系，可用：' + Object.keys(BIOMES).join(', ')); break; }
        const r = g.locateBiome(target);
        if (r) ok(`最近的 ${BIOMES[target].zh} 位于 [${r[0]}, ~, ${r[1]}]（距离 ${r[2]} 格）`); else bad('附近 4000 格内未找到');
        break;
      }
      case 'kill': p.mode = 'survival'; p.hurtTime = 0; p.hurt(1000, 'void'); break;
      case 'seed': ok('种子：[' + g.world.seed + ']'); break;
      case 'spawnpoint': p.spawn = [p.pos.x, p.pos.y, p.pos.z]; ok('已设置出生点'); break;
      case 'clear': p.inventory.slots.fill(null); this.refresh(); ok('已清空物品栏'); break;
      case 'gamerule': if (a[1] === 'keepInventory') { g.rules.keepInventory = a[2] === 'true'; ok('游戏规则 keepInventory 已设为 ' + g.rules.keepInventory); } else bad('未知规则'); break;
      case 'weather': {
        const k = { clear: 'clear', rain: 'rain', thunder: 'thunder' }[a[1]];
        if (!k) { bad('用法：/weather <clear|rain|thunder> [秒]'); break; }
        g.setWeather(k, a[2] ? +a[2] * 20 : undefined); ok('天气已设为 ' + { clear: '晴天', rain: '雨天', thunder: '雷暴' }[k]); break;
      }
      case 'effect': {
        if (a[1] === 'clear') { clearEffects(p); ok('已清除所有效果'); break; }
        const id = a[1] === 'give' ? a[2] : a[1];
        const off = a[1] === 'give' ? 3 : 2;
        if (!EFFECTS[id]) { bad('未知效果，可用：' + Object.keys(EFFECTS).join(', ')); break; }
        applyEffect(p, id, +a[off] || 30, Math.max(0, (+a[off + 1] || 1) - 1)); ok('已给予效果 ' + EFFECTS[id].zh); break;
      }
      case 'enchant': {
        const st = p.held(), id = a[1], lv = +a[2] || 1;
        if (!st) { bad('手上没有物品'); break; }
        if (!ENCHANTS[id]) { bad('未知附魔，可用：' + Object.keys(ENCHANTS).join(', ')); break; }
        st.ench = Object.assign({}, st.ench || {}, { [id]: lv }); this.refresh(); ok(`已附魔：${ENCHANTS[id].zh} ${ROMAN[lv] || lv}`); break;
      }
      case 'xp': p.addXp(+a[1] || 0); ok('已给予经验'); break;
      case 'dim': case 'dimension': {
        if (!DIM_INFO[a[1]]) { bad('可用维度：' + Object.keys(DIM_INFO).join(', ')); break; }
        const y = a[1] === 'end' ? 70 : a[1] === 'nether' ? 70 : p.pos.y;
        g.changeDimension(a[1], a[1] === 'end' ? 100.5 : p.pos.x, y, a[1] === 'end' ? 0.5 : p.pos.z); break;
      }
      default:
        if (COMMANDS[cmd]) { try { COMMANDS[cmd](a, this, g); } catch (e) { bad(e.message); } }
        else bad('未知的命令，输入 /help 查看帮助');
    }
  }

  // ---------------- 容器界面 ----------------
  getSlot(c, i) {
    const p = this.g.player;
    switch (c) {
      case 'inv': case 'hb': return p.inventory.slots[i];
      case 'craft': return this.craft[i];
      case 'out': { const r = this.craftResult(); return r ? { id: r.out, n: r.n } : null; }
      case 'chest': case 'furnace': return this.tile.items[i];
      case 'cre': { const n = this.creativeList()[i]; return n ? { id: n, n: 1 } : null; }
      case 'armor': return p.armor[i];
    }
    const sc = this.feat(c);
    if (sc) return sc.get(this)[i];
    return null;
  }
  feat(c) { const S = SCREENS[this.screen]; return S && S.containers && S.containers[c]; }
  setSlot(c, i, v) {
    const p = this.g.player;
    if (c === 'inv' || c === 'hb') p.inventory.slots[i] = v;
    else if (c === 'craft') this.craft[i] = v;
    else if (c === 'chest' || c === 'furnace') this.tile.items[i] = v;
    else if (c === 'armor') p.armor[i] = v;
    else { const sc = this.feat(c); if (sc) sc.get(this)[i] = v; }
  }
  // 槽位是否接受该物品
  accepts(c, i, st) {
    if (!st) return true;
    if (c === 'armor') { const it = ITEMS[st.id]; return !!(it && it.armor && it.armor.slot === ARMOR_SLOTS[i]); }
    const sc = this.feat(c);
    if (sc && sc.accept) return sc.accept(this, i, st);
    return true;
  }
  craftResult() {
    const w = this.craftW, grid = [];
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) { const s = this.craft[y * 3 + x]; grid.push(s ? s.id : null); }
    return matchRecipe(grid, w);
  }
  consumeCraft() {
    for (let y = 0; y < this.craftW; y++) for (let x = 0; x < this.craftW; x++) {
      const i = y * 3 + x, s = this.craft[i];
      if (!s) continue;
      if (--s.n <= 0) this.craft[i] = null;
      if (s.id === 'water_bucket' || s.id === 'lava_bucket') this.craft[i] = { id: 'bucket', n: 1 };
    }
  }
  slotClick(c, i, btn, shift) {
    const g = this.g, p = g.player;
    g.audio.play('click');
    if (c === 'cre') {
      const n = this.creativeList()[i];
      if (this.cursor) { this.cursor = null; }
      else if (n) { if (shift) p.inventory.add(n, ITEMS[n].stack); else this.cursor = { id: n, n: btn === 2 ? 1 : ITEMS[n].stack }; }
      this.refresh(); return;
    }
    if (c === 'trash') { this.cursor = null; this.refresh(); return; }
    const fc = this.feat(c);
    if (fc && (fc.output || fc.take)) {
      // 输出槽：只能取出
      const got = fc.take ? fc.take(this, i, shift) : null;
      if (got) {
        if (shift) { const left = p.inventory.add(got.id, got.n, got.dmg, got.ench); if (left) g.dropItem(p.pos.x, p.pos.y + 1, p.pos.z, got.id, left, got.dmg, got.ench); }
        else if (!this.cursor) this.cursor = got;
        else if (sameStack(this.cursor, got) && this.cursor.n + got.n <= ITEMS[got.id].stack) this.cursor.n += got.n;
        else { const left = p.inventory.add(got.id, got.n, got.dmg, got.ench); if (left) g.dropItem(p.pos.x, p.pos.y + 1, p.pos.z, got.id, left, got.dmg, got.ench); }
      }
      this.refresh(); return;
    }
    if (this.cursor && !this.accepts(c, i, this.cursor)) return;
    if (c === 'out') {
      const r = this.craftResult(); if (!r) return;
      if (shift) {
        for (let k = 0; k < 64; k++) { const rr = this.craftResult(); if (!rr || rr !== r) break; const left = p.inventory.add(r.out, r.n); this.consumeCraft(); if (left) { g.dropItem(p.pos.x, p.pos.y + 1, p.pos.z, r.out, left); break; } }
      } else {
        const ms = ITEMS[r.out].stack;
        if (!this.cursor) this.cursor = { id: r.out, n: r.n };
        else if (this.cursor.id === r.out && this.cursor.n + r.n <= ms) this.cursor.n += r.n;
        else return;
        this.consumeCraft();
      }
      g.stats.crafted = (g.stats.crafted || 0) + r.n;
      this.refresh(); return;
    }
    if (c === 'furnace' && i === 2) {
      const s = this.tile.items[2]; if (!s) return;
      if (shift) { const left = p.inventory.add(s.id, s.n); this.tile.items[2] = left ? { id: s.id, n: left } : null; }
      else if (!this.cursor) { this.cursor = s; this.tile.items[2] = null; }
      else if (this.cursor.id === s.id && this.cursor.n + s.n <= ITEMS[s.id].stack) { this.cursor.n += s.n; this.tile.items[2] = null; }
      if (this.tile.xp) { p.addXp(Math.floor(this.tile.xp)); this.tile.xp = 0; }
      this.refresh(); return;
    }
    const st = this.getSlot(c, i);
    if (shift && st) { this.quickMove(c, i, st); this.refresh(); return; }
    const ms = st ? ITEMS[st.id].stack : 64;
    if (btn === 0) {
      if (!this.cursor) { if (st) { this.cursor = st; this.setSlot(c, i, null); } }
      else if (!st) { this.setSlot(c, i, this.cursor); this.cursor = null; }
      else if (sameStack(st, this.cursor) && ms > 1) { const k = Math.min(ms - st.n, this.cursor.n); st.n += k; this.cursor.n -= k; if (this.cursor.n <= 0) this.cursor = null; }
      else { this.setSlot(c, i, this.cursor); this.cursor = st; }
    } else if (btn === 2) {
      if (!this.cursor) { if (st) { const k = Math.ceil(st.n / 2); this.cursor = { id: st.id, n: k, dmg: st.dmg }; st.n -= k; if (st.n <= 0) this.setSlot(c, i, null); } }
      else if (!st) { this.setSlot(c, i, { id: this.cursor.id, n: 1, dmg: this.cursor.dmg, ench: this.cursor.ench }); if (--this.cursor.n <= 0) this.cursor = null; }
      else if (sameStack(st, this.cursor) && st.n < ms) { st.n++; if (--this.cursor.n <= 0) this.cursor = null; }
      else { this.setSlot(c, i, this.cursor); this.cursor = st; }
    }
    this.refresh();
  }
  quickMove(c, i, st) {
    const p = this.g.player, inv = p.inventory;
    const moveInto = (arr, from, to, acc) => {
      const ms = ITEMS[st.id].stack;
      for (let k = from; k < to && st.n > 0; k++) if (sameStack(arr[k], st) && arr[k].n < ms && (!acc || acc(k))) { const m = Math.min(ms - arr[k].n, st.n); arr[k].n += m; st.n -= m; }
      for (let k = from; k < to && st.n > 0; k++) if (!arr[k] && (!acc || acc(k))) { arr[k] = { id: st.id, n: st.n, dmg: st.dmg, ench: st.ench }; st.n = 0; }
    };
    const it = ITEMS[st.id];
    if ((c === 'inv' || c === 'hb') && it && it.armor && (this.screen === 'inventory') && !p.armor[ARMOR_SLOTS.indexOf(it.armor.slot)]) {
      p.armor[ARMOR_SLOTS.indexOf(it.armor.slot)] = Object.assign({}, st); st.n = 0; this.setSlot(c, i, null); return;
    }
    const S = SCREENS[this.screen];
    if ((c === 'inv' || c === 'hb') && S && S.containers) {
      for (const cn in S.containers) { const ct = S.containers[cn]; if (ct.quick && !ct.output && st.n > 0) { const arr = ct.get(this); moveInto(arr, 0, arr.length, k => !ct.accept || ct.accept(this, k, st)); } }
      if (st.n <= 0) { this.setSlot(c, i, null); return; }
    }
    if (c === 'inv' || c === 'hb') {
      if (this.screen === 'chest') moveInto(this.tile.items, 0, 27);
      else if (this.screen === 'furnace') {
        if (SMELT[st.id]) moveInto(this.tile.items, 0, 1); else if (fuelValue(st.id)) moveInto(this.tile.items, 1, 2);
      }
      if (st.n > 0) { if (i < 9) moveInto(inv.slots, 9, 36); else moveInto(inv.slots, 0, 9); }
    } else moveInto(inv.slots, 0, 36);
    if (st.n <= 0) this.setSlot(c, i, null);
  }

  openScreen(name, arg) {
    const g = this.g;
    this.screen = name; g.state = 'screen';
    document.exitPointerLock && document.exitPointerLock();
    this.craftW = name === 'crafting' ? 3 : 2;
    if (name === 'furnace' || name === 'chest') {
      const k = arg.join(',');
      if (!g.world.tiles.has(k)) g.world.tiles.set(k, name === 'chest' ? { type: 'chest', items: new Array(27).fill(null) } : { type: 'furnace', items: [null, null, null], burn: 0, burnMax: 0, cook: 0, xp: 0 });
      this.tile = g.world.tiles.get(k); this.tilePos = arg;
      g.world.getChunk(arg[0] >> 4, arg[2] >> 4).modified = true;
    }
    if (name === 'inventory' && g.player.mode === 'creative') this.screen = 'creative';
    if (SCREENS[name] && SCREENS[name].open) SCREENS[name].open(this, arg);
    this.screenArg = arg;
    this.palKey = null; this.el.screen.innerHTML = '';
    this.el.screen.style.display = 'flex';
    this.el.crosshair.style.display = 'none';
    this.renderScreen();
  }
  closeScreen() {
    const g = this.g, p = g.player;
    if (SCREENS[this.screen] && SCREENS[this.screen].close) SCREENS[this.screen].close(this);
    for (let i = 0; i < 9; i++) if (this.craft[i]) { const s = this.craft[i]; const left = p.inventory.add(s.id, s.n, s.dmg); if (left) g.dropItem(p.pos.x, p.pos.y + 1.2, p.pos.z, s.id, left); this.craft[i] = null; }
    if (this.cursor) { const s = this.cursor; const left = p.inventory.add(s.id, s.n, s.dmg, s.ench); if (left) g.dropItem(p.pos.x, p.pos.y + 1.2, p.pos.z, s.id, left, s.dmg, s.ench); this.cursor = null; }
    this.screen = null; this.tile = null;
    this.el.screen.style.display = 'none'; this.el.screen.innerHTML = ''; this.el.tip.style.display = 'none';
    this.el.crosshair.style.display = '';
    g.state = 'playing'; g.lockPointer(); this.refresh();
  }
  invGrid() {
    const p = this.g.player;
    let h = '<div class="grid9">';
    for (let i = 9; i < 36; i++) h += this.slotHTML('inv', i, p.inventory.slots[i]);
    h += '</div><div class="grid9 hbrow">';
    for (let i = 0; i < 9; i++) h += this.slotHTML('inv', i, p.inventory.slots[i]);
    return h + '</div>';
  }
  craftGrid() {
    let h = `<div class="craftwrap"><div class="cgrid w${this.craftW}">`;
    for (let y = 0; y < this.craftW; y++) for (let x = 0; x < this.craftW; x++) h += this.slotHTML('craft', y * 3 + x, this.craft[y * 3 + x]);
    const r = this.craftResult();
    h += `</div><div class="arrow"></div>${this.slotHTML('out', 0, r ? { id: r.out, n: r.n } : null, 'big')}</div>`;
    return h;
  }
  // 创造模式「生存物品栏」标签：盔甲 + 完整背包 + 垃圾桶
  creInvFull() {
    const p = this.g.player;
    let ar = '<div class="armorcol">';
    for (let i = 0; i < 4; i++) ar += this.slotHTML('armor', i, p.armor[i], p.armor[i] ? '' : 'empty-' + ARMOR_SLOTS[i]);
    return `<div class="invtop">${ar}<div class="playerview" id="pview"></div></div><div class="invtrash"><div>${this.invGrid()}</div><div class="slot trash" data-c="trash" data-i="0"></div></div>`;
  }
  creativeList() {
    const tab = this.creTab || 'building';
    if (tab === 'search') return creativeSearch(this.creativeFilter);
    if (tab === 'inventory') return [];
    return creativeIndex()[tab] || [];
  }
  // 只重绘物品格（不重建搜索框，保证输入法组字不被打断）
  updatePalette() {
    const pal = this.el.screen.querySelector('#crepal'); if (!pal) return;
    const list = this.creativeList();
    pal.innerHTML = list.map((n, i) => this.slotHTML('cre', i, { id: n, n: 1 })).join('') || '<div class="cempty">没有找到物品</div>';
    pal.scrollTop = 0;
  }
  renderScreen() {
    const s = this.screen, el = this.el.screen;
    let h = '';
    if (SCREENS[s]) h = `<div class="panel ${SCREENS[s].wide ? 'wide' : ''}"><div class="ptitle">${esc(SCREENS[s].title || '')}</div>${SCREENS[s].render(this, this.screenArg)}${SCREENS[s].noInv ? '' : `<div class="ptitle">物品栏</div>${this.invGrid()}`}</div>`;
    else if (s === 'inventory') {
      const p = this.g.player;
      let ar = '<div class="armorcol">';
      for (let i = 0; i < 4; i++) ar += this.slotHTML('armor', i, p.armor[i], p.armor[i] ? '' : 'empty-' + ARMOR_SLOTS[i]);
      ar += '</div>';
      h = `<div class="panel"><div class="invtop">${ar}<div class="playerview" id="pview"></div><div><div class="ptitle">合成</div>${this.craftGrid()}</div></div><div class="ptitle">物品栏</div>${this.invGrid()}</div>`;
    }
    else if (s === 'crafting') h = `<div class="panel"><div class="ptitle">工作台</div>${this.craftGrid()}<div class="ptitle">物品栏</div>${this.invGrid()}</div>`;
    else if (s === 'chest') {
      h = '<div class="panel"><div class="ptitle">箱子</div><div class="grid9">';
      for (let i = 0; i < 27; i++) h += this.slotHTML('chest', i, this.tile.items[i]);
      h += `</div><div class="ptitle">物品栏</div>${this.invGrid()}</div>`;
    } else if (s === 'furnace') {
      const t = this.tile;
      h = `<div class="panel"><div class="ptitle">熔炉</div><div class="furnace"><div class="fcol">${this.slotHTML('furnace', 0, t.items[0])}<div class="flame"><i id="fflame"></i></div>${this.slotHTML('furnace', 1, t.items[1])}</div><div class="farrow"><i id="fprog"></i></div>${this.slotHTML('furnace', 2, t.items[2], 'big')}</div><div class="ptitle">物品栏</div>${this.invGrid()}</div>`;
    } else if (s === 'creative') {
      const tab = this.creTab || 'building', T = CREATIVE_TABS.find(t => t.id === tab);
      const p = this.g.player;
      const hot = `<div class="grid9">${[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => this.slotHTML('inv', i, p.inventory.slots[i])).join('')}</div><div class="slot trash" data-c="trash" data-i="0" title="拖到这里删除"></div>`;
      const ci = el.querySelector('#creinv');
      if (ci && this.palKey === tab) {
        // 只刷新下方物品栏
        if (tab === 'inventory') { const iv = el.querySelector('#creinvfull'); if (iv) iv.innerHTML = this.creInvFull(); }
        else ci.innerHTML = hot;
        return;
      }
      this.palKey = tab;
      const tabsHTML = (arr) => arr.map(t => `<div class="ctab ${t.id === tab ? 'on' : ''}" data-tab="${t.id}" title="${esc(t.zh)}"><img src="${iconURL(ITEMS[t.icon] ? t.icon : 'stone')}" draggable="false"></div>`).join('');
      let body;
      if (T.inv) body = `<div id="creinvfull">${this.creInvFull()}</div>`;
      else body = `<div class="grid9 cre" id="crepal"></div><div class="invtrash" id="creinv">${hot}</div>`;
      h = `<div class="creative"><div class="ctabs">${tabsHTML(CREATIVE_TABS.slice(0, 6))}</div>
        <div class="panel cpanel"><div class="ptitle">${esc(T.zh)}${T.search ? `<input id="cresearch" placeholder="输入物品名称（支持中文）" autocomplete="off">` : ''}</div>${body}</div>
        <div class="ctabs bottom">${tabsHTML(CREATIVE_TABS.slice(6))}</div></div>`;
    }
    const prevScroll = el.querySelector('.cre') ? el.querySelector('.cre').scrollTop : 0;
    const hadFocus = document.activeElement && document.activeElement.id === 'cresearch';
    el.innerHTML = h;
    const cre = el.querySelector('.cre'); if (cre) cre.scrollTop = prevScroll;
    if (s === 'creative') {
      this.updatePalette();
      el.querySelectorAll('.ctab').forEach(t => t.onmousedown = e => { e.preventDefault(); e.stopPropagation(); this.g.audio.play('click'); this.creTab = t.dataset.tab; this.palKey = null; this.renderScreen(); });
    }
    const si = el.querySelector('#cresearch');
    if (si) {
      si.value = this.creativeFilter;
      let composing = false;
      si.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') this.closeScreen(); });
      si.addEventListener('compositionstart', () => { composing = true; });
      si.addEventListener('compositionend', () => { composing = false; this.creativeFilter = si.value; this.updatePalette(); });
      si.addEventListener('input', e => { if (composing || e.isComposing) return; this.creativeFilter = si.value; this.updatePalette(); });
      setTimeout(() => { si.focus(); si.setSelectionRange(si.value.length, si.value.length); }, 0);
    }
    if (s === 'furnace') this.updateFurnaceBars();
    if (SCREENS[s] && SCREENS[s].after) SCREENS[s].after(this);
  }
  updateFurnaceBars() {
    const t = this.tile; if (!t) return;
    const f = $('#fflame'), pr = $('#fprog');
    if (f) f.style.height = (t.burnMax ? t.burn / t.burnMax * 100 : 0) + '%';
    if (pr) pr.style.width = (t.cook / 200 * 100) + '%';
    if (t._dirtyUI) { t._dirtyUI = false; this.renderScreen(); }
  }

  // ---------------- 菜单 ----------------
  menu(html) { this.el.menu.innerHTML = html; this.el.menu.style.display = html ? 'flex' : 'none'; }
  btn(id, text, cls) { return `<button class="mcbtn ${cls || ''}" id="${id}">${text}</button>`; }
  bind(map) { for (const k in map) { const e = document.getElementById(k); if (e) e.onclick = () => { this.g.audio.init(); this.g.audio.play('click'); map[k](); }; } }

  // 原版风格两列按钮行
  row(...btns) { return `<div class="mcrow">${btns.join('')}</div>`; }
  hbtn(id, text, dis) { return `<button class="mcbtn half" id="${id}" ${dis ? 'disabled' : ''}>${text}</button>`; }
  // 循环切换按钮：标签：值
  cyc(id, label, val) { return `<button class="mcbtn half" id="${id}">${esc(label)}：${esc(val)}</button>`; }
  slider(id, label, min, max, step, val, fmt) {
    return `<div class="mcslider half"><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}"><span id="${id}-v">${esc(label)}：${esc(fmt(val))}</span></div>`;
  }
  wireSlider(id, label, key, fmt, after) {
    const s = this.g.settings, e = document.getElementById(id);
    if (!e) return;
    e.oninput = () => { s[key] = +e.value; document.getElementById(id + '-v').textContent = label + '：' + fmt(+e.value); this.g.applySettings(); if (after) after(); };
  }
  screenBox(title, inner, cls) { return `<div class="mcscreen ${cls || ''}"><h2 class="mctitle">${esc(title)}</h2>${inner}</div>`; }

  showTitle() {
    this.menu(`<div class="title"><div class="logo">WEBCRAFT</div><div class="splash">Wilderness Bound!</div>
      <div class="titlebtns">${this.btn('b-single', '单人游戏')}${this.btn('b-multi', '多人游戏')}${this.btn('b-about', '关于本作与功能清单')}
      ${this.row(this.hbtn('b-opt', '选项...'), this.hbtn('b-credits', '制作人员与素材'))}</div>
      <div class="ver">WebCraft 网页版（参考 Java 版 26.3）</div><div class="copy">非官方作品，与 Mojang/Microsoft 无关</div></div>`);
    document.getElementById('b-multi').disabled = true;
    document.getElementById('b-multi').title = '网页单机版不支持多人游戏';
    this.bind({ 'b-single': () => this.showWorlds(), 'b-opt': () => this.showOptions(() => this.showTitle()), 'b-about': () => this.showAbout(), 'b-credits': () => this.showCredits() });
  }
  showCredits() {
    this.menu(this.screenBox('制作人员与素材', `<div class="about"><p>程序：WebCraft（Three.js 网页实现）。</p><p>贴图、音效与背景音乐来自开源项目 VoxeLibre（https://github.com/VoxeLibre/VoxeLibre），按 CC BY-SA 3.0 / 4.0 许可使用；贴图主要基于 XSSheep 的 Pixel Perfection；音乐作者包括 Dark Reaven、Jester、Exhale &amp; Tim Unwin、Diminixed、Herowl。完整署名见 assets/CREDITS.md。</p><p>本作是非官方的学习作品，未使用 Mojang 的官方素材。</p></div>${this.btn('cr-back', '完成')}`));
    this.bind({ 'cr-back': () => this.showTitle() });
  }
  async showWorlds() {
    const list = await SaveDB.listWorlds();
    this.selWorld = list.length ? list[0].id : null;
    const modeZh = { survival: '生存模式', creative: '创造模式', spectator: '旁观模式' };
    const rows = list.map(w => `<div class="wrow ${w.id === this.selWorld ? 'sel' : ''}" data-id="${esc(w.id)}"><div class="wicon">${esc((w.name || '?').slice(0, 1))}</div><div><b>${esc(w.name)}</b><br><small>${new Date(w.lastPlayed).toLocaleString()}</small><br><small>${modeZh[w.player && w.player.mode] || '生存模式'}，${{ peaceful: '和平', easy: '简单', normal: '普通', hard: '困难' }[w.rules && w.rules.difficulty] || '普通'}　种子 ${w.seed}</small></div></div>`).join('') || '<div class="empty">还没有世界，点击「创建新的世界」开始。</div>';
    this.menu(this.screenBox('选择世界', `<div class="wlist">${rows}</div>
      ${this.row(this.hbtn('w-play', '进入选中的世界', !list.length), this.hbtn('w-new', '创建新的世界'))}
      ${this.row(this.hbtn('w-del', '删除', !list.length), this.hbtn('w-back', '取消'))}`, 'wide'));
    const sel = id => { this.selWorld = id; this.el.menu.querySelectorAll('.wrow').forEach(r => r.classList.toggle('sel', r.dataset.id === id)); const d = document.getElementById('w-del'); d.textContent = '删除'; delete d.dataset.confirm; };
    this.el.menu.querySelectorAll('.wrow').forEach(r => {
      r.onclick = () => sel(r.dataset.id);
      r.ondblclick = () => { this.g.audio.init(); this.g.loadWorld(r.dataset.id); };
    });
    this.bind({
      'w-play': () => { if (this.selWorld) this.g.loadWorld(this.selWorld); },
      'w-new': () => this.showCreate(),
      'w-del': async () => {
        const b = document.getElementById('w-del');
        if (!this.selWorld) return;
        if (b.dataset.confirm) { await SaveDB.deleteWorld(this.selWorld); this.showWorlds(); }
        else { b.dataset.confirm = 1; b.textContent = '再点一次确认删除'; }
      },
      'w-back': () => this.showTitle(),
    });
  }
  showCreate() {
    const st = this.createState || (this.createState = { name: '新的世界', seed: '', mode: 'survival', diff: 'normal', cheats: true, biome: '', more: false });
    const modes = ['survival', 'creative'], modeZh = { survival: '生存', creative: '创造' };
    const diffs = ['peaceful', 'easy', 'normal', 'hard'], diffZh = { peaceful: '和平', easy: '简单', normal: '普通', hard: '困难' };
    const modeDesc = { survival: '探索神秘的世界，建造、收集、合成并与怪物战斗。', creative: '无限资源、自由飞行、瞬间破坏方块。' };
    const biomeOpts = `<option value="">随机</option>${Object.keys(BIOMES).filter(b => !b.includes('ocean')).map(b => `<option value="${b}" ${st.biome === b ? 'selected' : ''}>${BIOMES[b].zh}${b === 'dappled_forest' ? '（26.3 新增）' : ''}</option>`).join('')}`;
    const more = st.more ? `<label class="mclabel">世界生成器的种子<input id="c-seed" value="${esc(st.seed)}" placeholder="留空则随机"></label>
      <label class="mclabel">出生地群系<select id="c-biome">${biomeOpts}</select></label>` : '';
    this.menu(this.screenBox('创建新的世界', `<label class="mclabel">世界名称<input id="c-name" value="${esc(st.name)}"></label>
      ${this.row(this.cyc('c-mode', '游戏模式', modeZh[st.mode]), this.cyc('c-diff', '难度', diffZh[st.diff]))}
      <div class="mchint">${esc(modeDesc[st.mode])}</div>
      ${this.row(this.cyc('c-cheat', '允许作弊（命令）', st.cheats ? '开' : '关'), this.hbtn('c-more', st.more ? '收起世界选项' : '更多世界选项...'))}
      ${more}
      ${this.row(this.hbtn('c-go', '创建新的世界'), this.hbtn('c-back', '取消'))}`, 'wide'));
    this.el.menu.querySelectorAll('input').forEach(i => i.addEventListener('keydown', e => e.stopPropagation()));
    const save = () => { const n = $('#c-name'); if (n) st.name = n.value; const sd = $('#c-seed'); if (sd) st.seed = sd.value; const bi = $('#c-biome'); if (bi) st.biome = bi.value; };
    const cycle = (arr, v) => arr[(arr.indexOf(v) + 1) % arr.length];
    this.bind({
      'c-mode': () => { save(); st.mode = cycle(modes, st.mode); this.showCreate(); },
      'c-diff': () => { save(); st.diff = cycle(diffs, st.diff); this.showCreate(); },
      'c-cheat': () => { save(); st.cheats = !st.cheats; this.showCreate(); },
      'c-more': () => { save(); st.more = !st.more; this.showCreate(); },
      'c-go': () => {
        save();
        const sv = st.seed.trim();
        const seed = sv === '' ? Math.floor(Math.random() * 2e9) - 1e9 : (/^-?\d+$/.test(sv) ? parseInt(sv) | 0 : hashString(sv));
        this.createState = null;
        this.g.createWorld(st.name.trim() || '新的世界', seed, st.mode, st.biome, { difficulty: st.diff, cheats: st.cheats });
      },
      'c-back': () => { this.createState = null; this.showWorlds(); },
    });
  }
  // 选项主页
  showOptions(back) {
    this.optBack = back || this.optBack;
    const s = this.g.settings, inGame = this.g.state !== 'title' && this.g.worldMeta;
    const diffZh = { peaceful: '和平', easy: '简单', normal: '普通', hard: '困难' };
    this.menu(this.screenBox('选项', `
      ${this.row(this.slider('o-fov', '视场角', 30, 110, 1, s.fov, v => v === 70 ? '默认' : v === 110 ? '超大' : v), inGame ? this.cyc('o-diff', '难度', diffZh[this.g.rules.difficulty || 'normal']) : this.hbtn('o-none', '难度：创建世界时设置', true))}
      <div class="mcgap"></div>
      ${this.row(this.hbtn('o-video', '视频设置...'), this.hbtn('o-sound', '音乐和声音...'))}
      ${this.row(this.hbtn('o-ctrl', '控制...'), this.hbtn('o-hud', '小地图与界面...'))}
      ${this.row(this.hbtn('o-lang', '语言：简体中文', true), this.hbtn('o-pack', '资源包：VoxeLibre', true))}
      <div class="mcgap"></div>${this.btn('o-done', '完成')}`));
    this.wireSlider('o-fov', '视场角', 'fov', v => v === 70 ? '默认' : v === 110 ? '超大' : v);
    this.bind({
      'o-diff': () => { const d = ['peaceful', 'easy', 'normal', 'hard']; this.g.rules.difficulty = d[(d.indexOf(this.g.rules.difficulty || 'normal') + 1) % 4]; this.showOptions(); },
      'o-video': () => this.showVideo(), 'o-sound': () => this.showSound(), 'o-ctrl': () => this.showControls(), 'o-hud': () => this.showHudOpts(),
      'o-done': () => this.optBack(),
    });
  }
  showVideo() {
    const s = this.g.settings, onoff = v => v ? '开' : '关';
    const gui = { 0.75: '小', 1: '普通', 1.25: '大', 1.5: '超大' }, part = ['全部', '减少', '最少'];
    this.menu(this.screenBox('视频设置', `
      ${this.row(this.slider('v-rd', '渲染距离', 2, 16, 1, s.renderDist, v => v + ' 区块'), this.slider('v-gamma', '亮度', 0, 1, 0.05, s.gamma, v => v < 0.05 ? '昏暗' : v > 0.95 ? '明亮' : '+' + Math.round(v * 100) + '%'))}
      ${this.row(this.cyc('v-gui', '界面尺寸', gui[s.guiScale] || '普通'), this.cyc('v-part', '粒子', part[s.particles || 0]))}
      ${this.row(this.cyc('v-bob', '视角摇晃', onoff(s.bob)), this.cyc('v-clouds', '云', onoff(s.clouds)))}
      ${this.row(this.cyc('v-fps', '显示帧率', onoff(s.showFps)), this.slider('v-fov', '视场角', 30, 110, 1, s.fov, v => v))}
      <div class="mcgap"></div>${this.btn('v-done', '完成')}`));
    this.wireSlider('v-rd', '渲染距离', 'renderDist', v => v + ' 区块');
    this.wireSlider('v-gamma', '亮度', 'gamma', v => v < 0.05 ? '昏暗' : v > 0.95 ? '明亮' : '+' + Math.round(v * 100) + '%');
    this.wireSlider('v-fov', '视场角', 'fov', v => v);
    const toggle = k => () => { s[k] = !s[k]; this.g.applySettings(); this.showVideo(); };
    this.bind({
      'v-gui': () => { const o = [0.75, 1, 1.25, 1.5]; s.guiScale = o[(o.indexOf(s.guiScale || 1) + 1) % o.length]; this.g.applySettings(); this.showVideo(); },
      'v-part': () => { s.particles = ((s.particles || 0) + 1) % 3; this.g.applySettings(); this.showVideo(); },
      'v-bob': toggle('bob'), 'v-clouds': toggle('clouds'), 'v-fps': toggle('showFps'),
      'v-done': () => this.showOptions(),
    });
  }
  showSound() {
    const s = this.g.settings, pct = v => v <= 0 ? '关' : Math.round(v * 100) + '%';
    this.menu(this.screenBox('音乐和声音', `
      ${this.slider('s-vol', '主音量（音效）', 0, 1, 0.05, s.vol, pct).replace('half', 'full')}
      ${this.row(this.slider('s-music', '音乐', 0, 1, 0.05, s.music, pct), this.slider('s-weather', '天气', 0, 1, 0.05, s.weatherVol, pct))}
      <div class="mcgap"></div>${this.btn('s-done', '完成')}`));
    this.wireSlider('s-vol', '主音量（音效）', 'vol', pct);
    this.wireSlider('s-music', '音乐', 'music', pct);
    this.wireSlider('s-weather', '天气', 'weatherVol', pct);
    this.bind({ 's-done': () => this.showOptions() });
  }
  showControls() {
    const s = this.g.settings, onoff = v => v ? '开' : '关';
    const keys = [['前进/后退/左/右', 'W / S / A / D'], ['跳跃（创造模式双击飞行）', '空格'], ['潜行', '左 Shift'], ['疾跑', '左 Ctrl 或双击 W'], ['攻击/破坏', '鼠标左键'], ['使用物品/放置方块', '鼠标右键'], ['选择方块（鼠标中键）', '鼠标中键'], ['切换物品', '1-9 / 滚轮 / 方向键左右'], ['物品栏', 'E'], ['丢弃物品（Ctrl 整组）', 'Q'], ['聊天 / 命令', 'T / /'], ['地图', 'M'], ['调试信息', 'F3'], ['截图', 'F2'], ['切换视角', 'F5'], ['暂停', 'ESC']];
    this.menu(this.screenBox('控制', `
      ${this.row(this.slider('c-sens', '鼠标灵敏度', 0.1, 2, 0.05, s.sens, v => Math.round(v * 100) + '%'), this.cyc('c-inv', '反转鼠标', onoff(s.invertY)))}
      ${this.row(this.cyc('c-auto', '自动跳跃', onoff(s.autoJump)), this.cyc('c-sneak', '潜行模式', s.toggleSneak ? '切换' : '按住'))}
      <div class="keylist">${keys.map(([a, b]) => `<div><span>${esc(a)}</span><kbd>${esc(b)}</kbd></div>`).join('')}</div>
      ${this.btn('c-done', '完成')}`, 'wide'));
    this.wireSlider('c-sens', '鼠标灵敏度', 'sens', v => Math.round(v * 100) + '%');
    const toggle = k => () => { s[k] = !s[k]; this.g.applySettings(); this.showControls(); };
    this.bind({ 'c-inv': toggle('invertY'), 'c-auto': toggle('autoJump'), 'c-sneak': toggle('toggleSneak'), 'c-done': () => this.showOptions() });
  }
  showHudOpts() {
    const s = this.g.settings, onoff = v => v ? '开' : '关';
    const sizeZh = { small: '小', medium: '中', large: '大' };
    this.menu(this.screenBox('小地图与界面', `
      ${this.row(this.cyc('h-map', '小地图', onoff(s.minimap)), this.cyc('h-coords', '显示坐标', onoff(s.coords)))}
      ${this.row(this.cyc('h-size', '小地图大小', sizeZh[s.minimapSize] || '中'), this.cyc('h-zoom', '小地图缩放', (s.minimapZoom || 1) + 'x'))}
      ${this.row(this.cyc('h-rot', '小地图方向', s.minimapRotate ? '跟随视角' : '北方朝上'), this.cyc('h-mobs', '显示生物', onoff(s.minimapMobs)))}
      <div class="mchint">按 M 打开大地图；地下与下界自动切换为洞穴视图。</div>
      <div class="mcgap"></div>${this.btn('h-done', '完成')}`));
    const toggle = k => () => { s[k] = !s[k]; this.g.applySettings(); this.showHudOpts(); };
    this.bind({
      'h-map': toggle('minimap'), 'h-coords': toggle('coords'), 'h-rot': toggle('minimapRotate'), 'h-mobs': toggle('minimapMobs'),
      'h-size': () => { const o = ['small', 'medium', 'large']; s.minimapSize = o[(o.indexOf(s.minimapSize || 'medium') + 1) % 3]; this.g.applySettings(); this.showHudOpts(); },
      'h-zoom': () => { const o = [1, 2, 3]; s.minimapZoom = o[(o.indexOf(s.minimapZoom || 1) + 1) % 3]; this.g.applySettings(); this.showHudOpts(); },
      'h-done': () => this.showOptions(),
    });
  }
  showAbout() {
    this.menu(`<div class="mcscreen wide"><h2 class="mctitle">关于 WebCraft</h2><div class="about">
      <p>一个用 Three.js 写的网页版方块沙盒游戏，玩法与内容尽量参考 Minecraft Java 版最新的 26.3「Wilderness Bound」。贴图、音效与音乐使用开源 VoxeLibre 素材（CC BY-SA），未使用 Mojang 官方素材。</p>
      <p><b>操作：</b>WASD 移动 · 空格跳跃（创造模式双击飞行）· Shift 潜行 · Ctrl 疾跑 · 鼠标左键挖掘/攻击 · 右键放置/使用（按住吃东西、拉弓）· 1-9/滚轮 切换物品 · E 物品栏 · Q 丢弃 · T 聊天 · / 命令 · M 地图 · F3 调试信息 · F2 截图 · F5 切换视角 · ESC 暂停</p>
      <p><b>26.3 Wilderness Bound：</b>斑驳森林群系、三种叶色的杨树（红/黄/橙）与杨木全套、红灌木、层架菌（踩上去跳得更高，可做炖菜）、废弃营地（营火、稻草床、靠垫、战利品箱）、羊毛台阶与楼梯。</p>
      <p><b>26.2 Chaos Cubed：</b>硫磺洞穴（硫磺/朱砂条带、硫磺池、强效硫磺水下气泡上推、硫磺尖刺）、硫磺立方（会吸收手中方块并改变物理性质：木头弹跳、冰面滑行、石头沉重；吸了 TNT 后可用打火石引爆；死亡分裂成两个小的）、硫磺与朱砂建筑方块。</p>
      <p><b>其他群系与生物：</b>平原、森林、桦木森林、针叶林、积雪针叶林、雪原、沙漠、裸岩/尖峭山峰、樱花树林、苍白之园（嘎枝之心 + 嘎枝：被注视时静止，只有破坏嘎枝之心才能消灭）、海洋、冻洋、沙滩、河流；猪、牛、羊（可剪毛、吃草长回）、鸡、狐狸、僵尸与骷髅（白天燃烧）、苦力怕（爆炸）、蜘蛛（白天中立）。</p>
      <p><b>维度：</b>下界（五种群系、熔岩海、下界要塞、主世界废弃传送门，黑曜石框点燃传送门，坐标 8:1）；末地（要塞与末影之眼、末地传送门、主岛与黑曜石柱、末地水晶、末影龙首领战与返回传送门、龙蛋）。</p>
      <p><b>红石：</b>红石线 0-15 级功率、红石火把、拉杆、按钮、压力板、红石灯、中继器、比较器、侦测器、活塞与粘性活塞、音符盒、阳光探测器、发射器、投掷器、漏斗、TNT 充能点燃；各木种门/活板门/栅栏门与铁门。</p>
      <p><b>村庄：</b>平原/沙漠/针叶林/雪原村庄、村民职业与交易（五级）、铁傀儡、钟、职业方块（烟熏炉、高炉、锻造台下界合金升级、切石机、木桶、堆肥桶等）、地牢刷怪笼、沙漠水井。</p>
      <p><b>附魔与酿造：</b>附魔台（书架加成）、附魔书、铁砧（修复/合并/改名）、砂轮、酿造台与 18 种药水（延长/增强/喷溅/滞留）、炼药锅、经验瓶、金苹果、牛奶。盔甲（皮革/锁链/铁/金/钻石/下界合金）与全部附魔效果、状态效果。</p>
      <p><b>建筑与生活：</b>栅栏、墙、玻璃板、染色玻璃、混凝土、陶瓦、地毯、梯子与藤蔓（可攀爬）、雪层、灯笼、锁链、石材变种与晶洞、铜氧化、胡萝卜/马铃薯/甜菜根/南瓜西瓜茎/甜浆果、蛋糕、钓鱼、船、铁轨与矿车、16 色染料。</p>
      <p><b>系统：</b>无限地形、洞穴与矿石（含深板岩层）、昼夜循环、雨雪雷暴与闪电、天空光与方块光照、平滑光照与 AO、流体流动、沙砾下落、作物与树苗、TNT 连锁爆炸、合成与熔炼、工具等级与耐久、生命/饥饿/饱和/氧气/经验、摔落伤害、繁殖、睡觉跳夜、命令、多维度存档（IndexedDB）。</p>
      <p><b>素材：</b>贴图、音效与音乐来自开源项目 VoxeLibre（CC BY-SA 3.0/4.0，作者见 assets/CREDITS.md），未使用 Mojang 官方素材。</p>
      <p><b>未实现：</b>多人联机、末地城与鞘翅、海底神殿、林地府邸、告示牌与旗帜、命令方块。</p>
      </div>${this.btn('a-back', '完成')}</div>`);
    this.bind({ 'a-back': () => this.showTitle() });
  }
  showPause() {
    this.menu(this.screenBox('游戏菜单', `${this.btn('p-back', '回到游戏')}
      ${this.row(this.hbtn('p-stats', '统计信息'), this.hbtn('p-help', '操作说明'))}
      ${this.row(this.hbtn('p-map', '地图'), this.hbtn('p-shot', '截图'))}
      ${this.row(this.hbtn('p-opt', '选项...'), this.hbtn('p-lan', '对局域网开放', true))}
      ${this.btn('p-quit', '保存并退回到标题画面')}`));
    this.bind({
      'p-back': () => this.g.resume(), 'p-opt': () => this.showOptions(() => this.showPause()), 'p-quit': () => this.g.quitToTitle(),
      'p-stats': () => this.showStats(), 'p-help': () => { this.optBack = () => this.showPause(); this.showControls(); },
      'p-map': () => { this.menu(''); openBigMap(this.g); },
      'p-shot': () => { this.menu(''); this.g.screenshot = true; setTimeout(() => this.showPause(), 100); },
    });
  }
  showStats() {
    const st = this.g.stats || {};
    const t = Math.floor((st.playTime || 0));
    const items = [['游戏时间', `${Math.floor(t / 3600)} 小时 ${Math.floor(t % 3600 / 60)} 分钟`], ['行走距离', `${((st.distance || 0) / 1000).toFixed(2)} 千米`], ['跳跃次数', st.jumps || 0], ['破坏方块', st.mined || 0], ['放置方块', st.placed || 0], ['击杀生物', st.kills || 0], ['死亡次数', st.deaths || 0], ['受到伤害', Math.round(st.damage || 0)], ['合成物品', st.crafted || 0], ['当前等级', this.g.player.level]];
    this.menu(this.screenBox('统计信息', `<div class="statlist">${items.map(([a, b]) => `<div><span>${esc(a)}</span><b>${esc(b)}</b></div>`).join('')}</div>${this.btn('st-back', '完成')}`));
    this.bind({ 'st-back': () => this.showPause() });
  }
  showDeath(msg) {
    this.g.state = 'dead'; document.exitPointerLock && document.exitPointerLock();
    if (this.g.stats) this.g.stats.deaths = (this.g.stats.deaths || 0) + 1;
    this.menu(`<div class="mcscreen death"><h1>你死了！</h1><p>${esc(msg)}</p><p>分数：<b>${this.g.player.level * 7 + this.g.player.xp}</b></p>${this.btn('d-re', '重生')}${this.btn('d-title', '标题画面')}</div>`);
    const btns = this.el.menu.querySelectorAll('.mcbtn'); btns.forEach(b => b.disabled = true);
    setTimeout(() => btns.forEach(b => b.disabled = false), 1000);
    this.bind({ 'd-re': () => { this.g.player.respawn(); this.menu(''); this.g.state = 'playing'; this.g.lockPointer(); this.refresh(); }, 'd-title': () => { this.g.player.respawn(); this.g.quitToTitle(); } });
  }
  loadingEarly(text, pct) {
    const m = document.getElementById('menu');
    m.innerHTML = `<div class="box loading"><h2>${esc(text)}</h2><div class="pbar"><i style="width:${pct}%"></i></div></div>`; m.style.display = 'flex';
  }
  loading(text, pct) {
    this.menu(`<div class="box loading"><h2>${esc(text)}</h2><div class="pbar"><i style="width:${pct}%"></i></div></div>`);
  }
}
