// audio.js — Web Audio 절차 생성 BGM(화풍: 고토·피리·태고) + 효과음. 외부 음원 파일 없음.
import { rand, pick } from './util.js';

// 미야코부시(도시 음계)풍 5음: A, Bb, D, E, F  /  새벽: 밝은 5음 C D E G A
const NIGHT_SCALE = [0, 1, 5, 7, 8];
const DAWN_SCALE = [0, 2, 4, 7, 9];
const ROOT_NIGHT = 220;   // A3
const ROOT_DAWN = 261.63; // C4

const noteHz = (root, scale, degree, octave = 0) => {
  const n = scale.length;
  const idx = ((degree % n) + n) % n;
  const oct = Math.floor(degree / n) + octave;
  return root * Math.pow(2, (scale[idx] + 12 * oct) / 12);
};

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.mode = 'menu';   // menu | night | boss | dawn
    this.started = false;
    this._timer = null;
    this._nextBeat = 0;
    this._beatIndex = 0;
    this._melodyDeg = 4;
    this._phraseRest = 0;
    try { this.muted = localStorage.getItem('taisho_mute') === '1'; } catch (_) { /* ignore */ }
  }

  // 사용자 제스처 안에서 호출해야 함 (iOS 정책)
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.6;
    this.master.connect(ctx.destination);

    // 음악 버스: 약간의 딜레이 잔향
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = 0.55;
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = 0.9;
    const delay = ctx.createDelay(1.0); delay.delayTime.value = 0.34;
    const fb = ctx.createGain(); fb.gain.value = 0.32;
    const dl = ctx.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 2400;
    delay.connect(dl); dl.connect(fb); fb.connect(delay);
    const wet = ctx.createGain(); wet.gain.value = 0.35;
    this.musicBus.connect(this.master);
    this.musicBus.connect(delay); delay.connect(wet); wet.connect(this.master);
    this.sfxBus.connect(this.master);
    this.sfxBus.connect(delay);

    // 노이즈 버퍼 (효과음/북)
    const len = ctx.sampleRate * 1.5;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;

    this.started = true;
    this._nextBeat = ctx.currentTime + 0.1;
    this._timer = setInterval(() => this._schedule(), 90);
    this._drone();
  }

  toggleMute() {
    this.muted = !this.muted;
    try { localStorage.setItem('taisho_mute', this.muted ? '1' : '0'); } catch (_) { /* ignore */ }
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.6, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this._beatIndex = 0;
    this._phraseRest = 0;
  }

  // ---------- 악기 ----------
  get _bpm() { return this.mode === 'boss' ? 104 : this.mode === 'dawn' ? 58 : 74; }
  get _scale() { return this.mode === 'dawn' ? DAWN_SCALE : NIGHT_SCALE; }
  get _root() { return this.mode === 'dawn' ? ROOT_DAWN : ROOT_NIGHT; }

  // 고토풍 현: 빠른 어택 + 지수 감쇠, 살짝 밝은 배음
  _koto(freq, t, vel = 0.5, dur = 1.4) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const o1 = c.createOscillator(); o1.type = 'triangle'; o1.frequency.setValueAtTime(freq * 1.01, t); o1.frequency.exponentialRampToValueAtTime(freq, t + 0.06);
    const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq * 2;
    const g2 = c.createGain(); g2.gain.setValueAtTime(0.35, t); g2.gain.exponentialRampToValueAtTime(0.01, t + dur * 0.4);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(freq * 6, t); f.frequency.exponentialRampToValueAtTime(freq * 1.5, t + dur);
    o1.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(this.musicBus);
    o1.start(t); o2.start(t); o1.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }

  // 피리(샤쿠하치)풍 패드: 사인 + 비브라토 + 숨소리
  _flute(freq, t, dur = 2.8, vel = 0.16) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.5);
    g.gain.setValueAtTime(vel, t + dur - 0.7);
    g.gain.linearRampToValueAtTime(0, t + dur);
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    const lfo = c.createOscillator(); lfo.frequency.value = 5.2;
    const lg = c.createGain(); lg.gain.value = freq * 0.012;
    lfo.connect(lg); lg.connect(o.frequency);
    const n = c.createBufferSource(); n.buffer = this.noise; n.loop = true;
    const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = freq * 2; nf.Q.value = 12;
    const ng = c.createGain(); ng.gain.value = 0.12;
    n.connect(nf); nf.connect(ng); ng.connect(g);
    o.connect(g); g.connect(this.musicBus);
    o.start(t); lfo.start(t); n.start(t);
    o.stop(t + dur + 0.1); lfo.stop(t + dur + 0.1); n.stop(t + dur + 0.1);
  }

  // 태고: 저음 사인 피치 드롭 + 노이즈 타격
  _taiko(t, vel = 0.9, big = false) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(big ? 95 : 130, t);
    o.frequency.exponentialRampToValueAtTime(big ? 38 : 52, t + 0.18);
    const g = c.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (big ? 0.7 : 0.4));
    o.connect(g); g.connect(this.musicBus);
    o.start(t); o.stop(t + 0.8);
    const n = c.createBufferSource(); n.buffer = this.noise;
    const nf = c.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 900;
    const ng = c.createGain(); ng.gain.setValueAtTime(vel * 0.5, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    n.connect(nf); nf.connect(ng); ng.connect(this.musicBus);
    n.start(t); n.stop(t + 0.1);
  }

  // 딱딱이(박자목) 클릭
  _click(t, vel = 0.25) {
    const c = this.ctx;
    const n = c.createBufferSource(); n.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3200; f.Q.value = 6;
    const g = c.createGain(); g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    n.connect(f); f.connect(g); g.connect(this.musicBus);
    n.start(t); n.stop(t + 0.06);
  }

  // 밤의 저음 드론 (지속)
  _drone() {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 55;
    const o2 = c.createOscillator(); o2.type = 'triangle'; o2.frequency.value = 110.3;
    const g = c.createGain(); g.gain.value = 0.0;
    g.gain.linearRampToValueAtTime(0.08, c.currentTime + 3);
    const g2 = c.createGain(); g2.gain.value = 0.25;
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(this.musicBus);
    o.start(); o2.start();
    this.droneGain = g;
  }

  // ---------- 시퀀서 ----------
  _schedule() {
    if (!this.ctx) return;
    const c = this.ctx;
    const beat = 60 / this._bpm;
    while (this._nextBeat < c.currentTime + 0.35) {
      const t = this._nextBeat;
      const i = this._beatIndex;
      if (this.mode !== 'menu') this._playBeat(t, i, beat);
      else if (i % 8 === 0) this._koto(noteHz(ROOT_NIGHT, NIGHT_SCALE, pick([0, 2, 4, 5]), pick([0, 1])), t, 0.2, 2.5);
      this._nextBeat += beat / 2; // 8분음표 단위
      this._beatIndex++;
    }
    if (this.droneGain) {
      const target = this.mode === 'dawn' ? 0.02 : this.mode === 'boss' ? 0.12 : 0.08;
      this.droneGain.gain.setTargetAtTime(target, c.currentTime, 1.5);
    }
  }

  _playBeat(t, i, beat) {
    const bar = Math.floor(i / 8);    // 4/4, 8분음표 8개
    const step = i % 8;
    const boss = this.mode === 'boss';
    const dawn = this.mode === 'dawn';
    const scale = this._scale, root = this._root;

    // 태고
    if (!dawn) {
      if (step === 0) this._taiko(t, boss ? 1.0 : 0.8, true);
      if (step === 4) this._taiko(t, boss ? 0.8 : 0.5);
      if (boss && (step === 3 || step === 6)) this._taiko(t, 0.55);
      if (step % 2 === 1 && (boss || bar % 2 === 1)) this._click(t, boss ? 0.3 : 0.18);
    } else if (step === 0 && bar % 2 === 0) {
      this._taiko(t, 0.35, true);
    }

    // 고토 선율: 음계 안에서 걷는 랜덤 워크, 구절 사이 쉼
    if (this._phraseRest > 0) { this._phraseRest--; }
    else {
      const density = dawn ? 0.28 : boss ? 0.62 : 0.42;
      if (step === 0 || Math.random() < density) {
        const stepSize = pick([-2, -1, -1, 1, 1, 2, 3]);
        this._melodyDeg += stepSize;
        if (this._melodyDeg < 2) this._melodyDeg += 4;
        if (this._melodyDeg > 11) this._melodyDeg -= 5;
        const vel = dawn ? 0.28 : step === 0 ? 0.55 : 0.4;
        this._koto(noteHz(root, scale, this._melodyDeg, 0), t, vel, dawn ? 2.2 : 1.4);
        if (boss && step % 4 === 0) this._koto(noteHz(root, scale, this._melodyDeg - 5, 0), t, 0.3, 0.8);
        if (step === 7 && Math.random() < 0.35) this._phraseRest = pick([4, 8]);
      }
    }
    // 피리 패드: 2마디마다 긴 음
    if (step === 0 && bar % 2 === 0) {
      const deg = pick(dawn ? [4, 7, 9] : [4, 6, 9]);
      this._flute(noteHz(root, scale, deg, 1), t, beat * 8 * 0.9, dawn ? 0.2 : 0.14);
    }
  }

  // ---------- 효과음 ----------
  sfx(name, opt = {}) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const out = this.sfxBus;
    const noiseBurst = (dur, f0, f1, vel, type = 'bandpass', q = 1.2) => {
      const n = c.createBufferSource(); n.buffer = this.noise;
      const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
      f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const g = c.createGain(); g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      n.connect(f); f.connect(g); g.connect(out); n.start(t); n.stop(t + dur + 0.02);
    };
    const tone = (type, f0, f1, dur, vel, delay = 0) => {
      const o = c.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f0, t + delay); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + delay + dur);
      const g = c.createGain(); g.gain.setValueAtTime(0, t + delay); g.gain.linearRampToValueAtTime(vel, t + delay + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + delay + dur);
      o.connect(g); g.connect(out); o.start(t + delay); o.stop(t + delay + dur + 0.02);
    };
    switch (name) {
      case 'swing': noiseBurst(0.16, 900, 3800, 0.35, 'bandpass', 0.9); break;
      case 'swingHeavy': noiseBurst(0.3, 400, 3000, 0.5, 'bandpass', 0.8); tone('sine', 120, 60, 0.25, 0.25); break;
      case 'hit': noiseBurst(0.12, 2500, 600, 0.5, 'bandpass', 2); tone('triangle', 220, 90, 0.14, 0.35); break;
      case 'hitHeavy': noiseBurst(0.22, 1800, 300, 0.7, 'lowpass', 1); tone('sine', 150, 45, 0.3, 0.6); break;
      case 'kill': noiseBurst(0.5, 1800, 200, 0.5, 'bandpass', 1.5); tone('sawtooth', 260, 60, 0.45, 0.2); break;
      case 'parry': tone('sine', 1800, 2600, 0.12, 0.3); noiseBurst(0.1, 4000, 6000, 0.25, 'highpass', 1); break;
      case 'hurt': tone('sine', 110, 50, 0.3, 0.7); noiseBurst(0.2, 600, 150, 0.5, 'lowpass', 1); tone('square', 330, 300, 0.12, 0.08); break;
      case 'dash': noiseBurst(0.22, 300, 2500, 0.3, 'bandpass', 0.7); break;
      case 'special':
        noiseBurst(0.9, 200, 5000, 0.6, 'bandpass', 0.6);
        [0, 4, 7, 12, 16].forEach((d, k) => tone('sine', 440 * Math.pow(2, d / 12), 440 * Math.pow(2, d / 12), 0.6, 0.22, k * 0.07));
        tone('sine', 80, 30, 0.8, 0.6);
        break;
      case 'wave': noiseBurst(0.5, 500, 2500, 0.4, 'bandpass', 0.8); tone('sine', 200, 400, 0.4, 0.2); break;
      case 'fire': noiseBurst(0.3, 3000, 800, 0.3, 'bandpass', 2); tone('sine', 700, 350, 0.25, 0.15); break;
      case 'fireHit': noiseBurst(0.25, 1500, 300, 0.4, 'lowpass', 1); break;
      case 'slam': tone('sine', 90, 30, 0.6, 0.9); noiseBurst(0.4, 800, 100, 0.8, 'lowpass', 1); break;
      case 'roar': tone('sawtooth', 70, 45, 1.1, 0.35); tone('square', 92, 55, 0.9, 0.12); noiseBurst(1.0, 400, 120, 0.4, 'lowpass', 1); break;
      case 'spawn': noiseBurst(0.6, 300, 1200, 0.2, 'bandpass', 1); tone('sine', 160, 90, 0.5, 0.15); break;
      case 'gong': tone('sine', 196, 190, 2.2, 0.5); tone('sine', 392, 385, 1.6, 0.2); tone('triangle', 590, 580, 1.0, 0.08); break;
      case 'bell': [880, 1320, 1760].forEach((f, k) => tone('sine', f, f * 0.995, 2.5 - k * 0.5, 0.25 - k * 0.06)); break;
      case 'start': tone('sine', 523, 520, 0.8, 0.3); tone('sine', 784, 780, 1.2, 0.2, 0.12); break;
      case 'dead': tone('sine', 160, 40, 1.4, 0.6); noiseBurst(1.2, 800, 80, 0.5, 'lowpass', 1); break;
      default: break;
    }
  }
}
