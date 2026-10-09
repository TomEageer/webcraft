'use strict';
// ---------- 合成音效（WebAudio，无外部音频文件） ----------

class SoundSystem {
  constructor() {
    this.ctx = null; this.vol = 0.6; this.musicVol = 0.35; this.listener = null; this.musicT = 20;
    this.pool = new Map(); this.music = null; this.loops = {};
  }
  // 播放素材包音效；找不到返回 false，由调用方退回合成音
  sfx(event, pos, vol, pitch) {
    const list = packSound(event);
    if (!list) return false;
    const a = this.atten(pos) * (vol === undefined ? 1 : vol) * this.vol;
    if (a <= 0.01) return true;
    const url = list[Math.floor(Math.random() * list.length)];
    let arr = this.pool.get(url);
    if (!arr) { arr = []; this.pool.set(url, arr); }
    let el = arr.find(e => e.paused || e.ended);
    if (!el) { if (arr.length >= 6) el = arr[0]; else { el = new Audio(url); el.preservesPitch = false; arr.push(el); } }
    try {
      el.volume = Math.min(1, a); el.playbackRate = clamp(pitch || (0.85 + Math.random() * 0.3), 0.5, 2); el.currentTime = 0;
      const pr = el.play(); if (pr && pr.catch) pr.catch(() => { });
    } catch (e) { }
    return true;
  }
  // 循环环境音（雨声等），v=0 停止
  loop(event, v) {
    let el = this.loops[event];
    if (!v) { if (el) el.pause(); return; }
    if (!el) { const l = packSound(event); if (!l) return; el = this.loops[event] = new Audio(l[0]); el.loop = true; }
    el.volume = Math.min(1, v * this.vol);
    if (el.paused) { const pr = el.play(); if (pr && pr.catch) pr.catch(() => { }); }
  }
  // 原版雨声：不是循环一段音频，而是每隔几刻随机再播一段 2 秒左右的雨声片段，多段重叠成连续的雨声；
  // 头顶有遮挡时改播降低一个八度、音量减半的闷雨声（weather.rain.above）。v 为目标音量（0 = 停）
  rainTick(dt, v, muffled) {
    this.rainV = (this.rainV || 0) + (v - (this.rainV || 0)) * Math.min(1, dt * 1.5);
    this.rainT = (this.rainT || 0) - dt;
    if (this.rainV < 0.01 || this.rainT > 0) return;
    this.rainT = 0.15 + Math.random() * 0.15;
    const list = packSound('rain'); if (!list) return;
    const url = list[Math.floor(Math.random() * list.length)];
    const pool = this.rainEls || (this.rainEls = []);
    let el = pool.find(e => (e.paused || e.ended) && e.dataset.src === url);
    if (!el && pool.length < 24) { el = new Audio(url); el.dataset.src = url; el.preload = 'auto'; pool.push(el); }
    if (!el) return;
    el.preservesPitch = false; el.mozPreservesPitch = false; el.webkitPreservesPitch = false;
    el.playbackRate = muffled ? 0.5 : 1;
    el.volume = Math.min(1, this.rainV * this.vol * (muffled ? 0.5 : 1) * (0.8 + Math.random() * 0.2));
    el.currentTime = 0;
    const pr = el.play(); if (pr && pr.catch) pr.catch(() => { });
  }
  init() {
    if (this.ctx) return;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    const len = this.ctx.sampleRate * 1;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.master = this.ctx.createGain(); this.master.gain.value = this.vol; this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = this.musicVol; this.musicGain.connect(this.ctx.destination);
  }
  setVolume(v) { this.vol = v; if (this.master) this.master.gain.value = v; }
  setMusic(v) { this.musicVol = v; if (this.musicGain) this.musicGain.gain.value = v; if (this.music) this.music.volume = Math.min(1, v); }
  atten(pos) {
    if (!pos || !this.listener) return 1;
    const d = this.listener.distanceTo(pos);
    return Math.max(0, 1 - d / 24);
  }
  noiseHit(freq, q, dur, gain, type, pos) {
    if (!this.ctx) return;
    const a = this.atten(pos) * gain; if (a <= 0.01) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource(); src.buffer = this.noise; src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = this.ctx.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq * (0.85 + Math.random() * 0.3); f.Q.value = q;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(a, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  }
  tone(freq, dur, gain, type, slide, pos, dest) {
    if (!this.ctx) return;
    const a = this.atten(pos) * gain; if (a <= 0.01) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(a, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  material(id) {
    const d = BLOCKS[id] || BLOCKS[0];
    if (d.sound) return d.sound;
    if (id === B.ice || id === B.packed_ice) return 'ice';
    if (id === B.glass || id === B.glowstone || d.name.includes('glass')) return 'glass';
    if (/iron_block|gold_block|diamond_block|copper|emerald_block|netherite|anvil|lantern|chain/.test(d.name)) return 'metal';
    if (d.tool === 'pickaxe' || id === B.bedrock) return 'stone';
    if (d.tool === 'axe') return 'wood';
    if (id === B.sand || id === B.red_sand || d.name.includes('soul_sand')) return 'sand';
    if (id === B.snow_block || id === B.snowy_grass || d.name.includes('snow')) return 'snow';
    if (id === B.gravel) return 'gravel';
    if (id === B.dirt || id === B.farmland || id === B.clay || id === B.coarse_dirt) return 'dirt';
    if (d.tool === 'shears' || d.name.includes('wool') || id === B.cushion) return 'wool';
    return 'grass';
  }
  digSound(id, v) {
    const m = this.material(id);
    if (this.sfx('dig.' + m, null, v >= 1 ? 0.9 : 0.45, v >= 1 ? 1 : 0.8)) return;
    const p = { stone: [900, 1.2, 0.18], wood: [450, 2, 0.16], sand: [2500, 0.6, 0.14], gravel: [1200, 0.8, 0.16], glass: [3000, 4, 0.2], wool: [700, 0.5, 0.12], grass: [1600, 0.7, 0.14], dirt: [1400, 0.7, 0.14], snow: [2200, 0.5, 0.12], metal: [1800, 3, 0.2], ice: [2600, 3, 0.18] }[m];
    this.noiseHit(p[0], p[1], p[2], 0.5 * v);
    if (m === 'glass' && v >= 1) for (let i = 0; i < 4; i++) setTimeout(() => this.tone(2000 + Math.random() * 2000, 0.15, 0.08, 'triangle'), i * 30);
  }
  placeSound(id) {
    const m = this.material(id);
    if (this.sfx(m === 'stone' ? 'place.stone' : m === 'metal' ? 'place.metal' : 'dig.' + m, null, 0.8)) return;
    this.digSound(id, 0.8);
  }
  stepSound(id, inWater) {
    if (inWater) { if (this.sfx('step.water', null, 0.3)) return; }
    if (!id) return;
    if (this.sfx('step.' + this.material(id), null, 0.3)) return;
    this.digSound(id, 0.25);
  }
  play(name, pos) {
    if (this.sfx(name, pos)) return;
    if (!this.ctx) return;
    switch (name) {
      case 'pop': this.tone(600 + Math.random() * 300, 0.08, 0.25, 'sine', 1.8); break;
      case 'click': this.tone(900, 0.04, 0.2, 'square', 0.5); break;
      case 'hurt': this.tone(300, 0.18, 0.35, 'sawtooth', 0.6); this.noiseHit(500, 1, 0.15, 0.3); break;
      case 'attack': this.noiseHit(800, 1, 0.08, 0.3); break;
      case 'mob_hurt': this.tone(160, 0.25, 0.3, 'sawtooth', 0.7, pos); break;
      case 'animal_hurt': this.tone(500, 0.18, 0.3, 'square', 0.6, pos); break;
      case 'wood_hit': this.noiseHit(300, 3, 0.2, 0.5, 'bandpass', pos); break;
      case 'explode': this.noiseHit(120, 0.4, 1.4, 1.2, 'lowpass', pos); this.tone(60, 1.0, 0.6, 'sine', 0.4, pos); break;
      case 'fuse': this.noiseHit(4000, 0.5, 1.2, 0.35, 'highpass', pos); break;
      case 'eat': this.noiseHit(1400, 1.5, 0.08, 0.3); break;
      case 'burp': this.tone(180, 0.25, 0.3, 'sawtooth', 0.7); break;
      case 'xp': this.tone(1200 + Math.random() * 800, 0.12, 0.12, 'sine'); break;
      case 'levelup': [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.25, 0.2, 'triangle'), i * 90)); break;
      case 'bucket': this.noiseHit(700, 2, 0.3, 0.4, 'lowpass'); break;
      case 'fizz': this.noiseHit(5000, 0.5, 0.5, 0.4, 'highpass', pos); break;
      case 'bow': this.tone(400, 0.2, 0.3, 'triangle', 2); break;
      case 'arrow_hit': this.noiseHit(1500, 2, 0.08, 0.3, 'bandpass', pos); break;
      case 'chest': this.noiseHit(300, 2, 0.3, 0.35); break;
      case 'shear': this.noiseHit(5000, 3, 0.1, 0.3); break;
      case 'slime': this.tone(250, 0.2, 0.3, 'sine', 0.5, pos); break;
      case 'break_tool': this.noiseHit(2000, 3, 0.3, 0.5); break;
      case 'door': this.noiseHit(400, 2, 0.2, 0.4); break;
    }
  }
  // 极简环境音乐：偶尔弹几个五声音阶的柔和音符
  updateMusic(dt) {
    if (this.musicVol <= 0) { if (this.music) this.music.pause(); return; }
    if (this.music && !this.music.paused && !this.music.ended) return;
    this.musicT -= dt;
    if (this.musicT > 0) return;
    this.musicT = 120 + Math.random() * 240;
    // 有素材包时像原版一样隔几分钟随机放一首背景音乐
    if (window.PACK_MUSIC && window.PACK_MUSIC.length) {
      const url = window.PACK_MUSIC[Math.floor(Math.random() * window.PACK_MUSIC.length)];
      if (!this.music) this.music = new Audio();
      this.music.src = url; this.music.volume = Math.min(1, this.musicVol);
      const pr = this.music.play(); if (pr && pr.catch) pr.catch(() => { this.musicT = 5; });
      return;
    }
    if (!this.ctx) return;
    const scale = [261.6, 293.7, 329.6, 392, 440, 523.3, 587.3, 659.3];
    const n = 6 + Math.floor(Math.random() * 8);
    let t = 0;
    for (let i = 0; i < n; i++) {
      const f = scale[Math.floor(Math.random() * scale.length)] * (Math.random() < 0.3 ? 0.5 : 1);
      setTimeout(() => { this.tone(f, 2.5, 0.12, 'sine', 0, null, this.musicGain); this.tone(f * 2, 1.5, 0.03, 'sine', 0, null, this.musicGain); }, t * 1000);
      t += 0.6 + Math.random() * 1.2;
    }
  }
}
