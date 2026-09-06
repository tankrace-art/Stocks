// audio.js — Web Audio 절차 생성 BGM(작곡된 주제곡: 현악 패드·피리 선율·고토·태고·저음) + 효과음
import { pick } from './util.js';

const A3 = 220;
const hz = (semi) => A3 * Math.pow(2, (Number.isFinite(semi) ? semi : 0) / 12);

// 주제곡 "대숲의 밤" — A단조, 8마디 코드 진행 (Am F C G / Am F Dm E)
const CHORDS = [
  { root: 0, notes: [0, 3, 7, 12] },    // Am
  { root: -4, notes: [-4, 0, 3, 8] },   // F
  { root: -9, notes: [-9, -5, -2, 3] }, // C
  { root: -2, notes: [-2, 2, 5, 10] },  // G
  { root: 0, notes: [0, 3, 7, 12] },    // Am
  { root: -4, notes: [-4, 0, 3, 8] },   // F
  { root: -7, notes: [-7, -2, 2, 5] },  // Dm
  { root: -5, notes: [-5, -1, 2, 7] },  // E
];
// 선율: [반음(A4 기준=12), 8분음표 길이]. null = 쉼표. 마디당 8박(8분음표)
const MELODY_A = [
  [19, 2], [15, 1], [17, 1], [19, 3], [24, 1],
  [22, 1], [20, 1], [19, 1], [17, 1], [15, 4],
  [15, 1], [17, 1], [19, 1], [22, 1], [19, 2], [17, 2],
  [17, 2], [14, 2], [15, 1], [17, 1], [14, 2],
  [12, 2], [15, 1], [19, 1], [24, 2], [22, 1], [19, 1],
  [20, 2], [19, 1], [17, 1], [15, 3], [14, 1],
  [17, 1], [20, 1], [24, 2], [22, 2], [20, 2],
  [19, 4], [null, 1], [11, 1], [14, 2],
];
// 2회차 변주: 한 옥타브 위 도약과 장식
const MELODY_B = [
  [19, 1], [22, 1], [24, 2], [27, 2], [24, 1], [22, 1],
  [22, 1], [20, 1], [19, 1], [17, 1], [15, 2], [17, 1], [19, 1],
  [22, 2], [19, 1], [17, 1], [15, 2], [17, 2],
  [17, 1], [14, 1], [12, 2], [15, 1], [17, 1], [14, 2],
  [24, 2], [27, 1], [24, 1], [22, 2], [19, 2],
  [20, 1], [22, 1], [20, 1], [19, 1], [17, 2], [15, 2],
  [17, 2], [20, 2], [24, 1], [26, 1], [24, 2],
  [23, 4], [null, 2], [19, 2],
];
const MELODY = [...MELODY_A, ...MELODY_B];

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.mode = 'menu';   // menu | night | boss | dawn
    this._timer = null;
    this._nextStep = 0;  // 다음 8분음표 시각
    this._step = 0;      // 전체 8분음표 인덱스
    this._melPos = 0; this._melHold = 0;
    this._lastBar = -1;
    this.drums = [];
    try { this.muted = localStorage.getItem('taisho_mute') === '1'; } catch (_) { /* ignore */ }
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.7; this.master.connect(ctx.destination);
    // 버스
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = 0.5;
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = 0.85;
    // 잔향: 두 줄 딜레이
    const mkDelay = (time, fb, cut) => {
      const d = ctx.createDelay(1.5); d.delayTime.value = time;
      const g = ctx.createGain(); g.gain.value = fb;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cut;
      d.connect(f); f.connect(g); g.connect(d);
      return d;
    };
    const d1 = mkDelay(0.31, 0.35, 2600), d2 = mkDelay(0.47, 0.3, 1800);
    const wet = ctx.createGain(); wet.gain.value = 0.32;
    this.musicBus.connect(this.master);
    this.musicBus.connect(d1); this.musicBus.connect(d2); d1.connect(wet); d2.connect(wet); wet.connect(this.master);
    this.sfxBus.connect(this.master); this.sfxBus.connect(d1);
    // 컴프레서로 웅장함 유지
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
    this.master.disconnect(); this.master.connect(comp); comp.connect(ctx.destination);

    const len = ctx.sampleRate * 1.5;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buf;

    this._nextStep = ctx.currentTime + 0.1;
    this._timer = setInterval(() => this._schedule(), 80);
  }

  toggleMute() {
    this.muted = !this.muted;
    try { localStorage.setItem('taisho_mute', this.muted ? '1' : '0'); } catch (_) { /* ignore */ }
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.7, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    if (this.ctx) {
      // 마디 첫 박에 맞춰 리셋되도록 스텝을 마디 경계로
      this._step = Math.ceil(this._step / 8) * 8;
      this._melPos = 0; this._melHold = 0;
      const g = this.musicBus.gain;
      g.setTargetAtTime(mode === 'boss' ? 0.7 : mode === 'dawn' ? 0.42 : mode === 'menu' ? 0.38 : 0.52, this.ctx.currentTime, 1.2);
    }
  }

  get _bpm() { return this.mode === 'boss' ? 118 : this.mode === 'dawn' ? 62 : this.mode === 'menu' ? 76 : 88; }

  // ---------- 악기 ----------
  // 현악 패드: 디튠 톱니파 3겹 + 로우패스, 느린 어택
  _strings(freq, t, dur, vel = 0.05) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + Math.min(0.9, dur * 0.35));
    g.gain.setValueAtTime(vel, t + dur - 0.4);
    g.gain.linearRampToValueAtTime(0, t + dur);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.linearRampToValueAtTime(1600, t + dur * 0.5); f.Q.value = 0.7;
    for (const det of [-7, 0, 6]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq; o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + dur + 0.05);
    }
    f.connect(g); g.connect(this.musicBus);
  }
  // 피리/보컬풍 리드: 사인+삼각, 비브라토, 포르타멘토
  _lead(freq, t, dur, vel = 0.22, prevFreq = null) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.06);
    g.gain.setValueAtTime(vel, t + Math.max(0.06, dur - 0.12));
    g.gain.linearRampToValueAtTime(0, t + dur);
    const o = c.createOscillator(); o.type = 'sine';
    const o2 = c.createOscillator(); o2.type = 'triangle';
    const g2 = c.createGain(); g2.gain.value = 0.35;
    if (prevFreq) { o.frequency.setValueAtTime(prevFreq, t); o.frequency.exponentialRampToValueAtTime(freq, t + 0.05); o2.frequency.setValueAtTime(prevFreq, t); o2.frequency.exponentialRampToValueAtTime(freq, t + 0.05); }
    else { o.frequency.value = freq; o2.frequency.value = freq; }
    const lfo = c.createOscillator(); lfo.frequency.value = 5.5;
    const lg = c.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(freq * 0.014, t + 0.3);
    lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
    const n = c.createBufferSource(); n.buffer = this.noise; n.loop = true;
    const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = freq * 2; nf.Q.value = 14;
    const ng = c.createGain(); ng.gain.value = 0.08;
    n.connect(nf); nf.connect(ng); ng.connect(g);
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(this.musicBus);
    o.start(t); o2.start(t); lfo.start(t); n.start(t);
    o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05); n.stop(t + dur + 0.05);
  }
  _koto(freq, t, vel = 0.3, dur = 1.2) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.006); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const o1 = c.createOscillator(); o1.type = 'triangle'; o1.frequency.setValueAtTime(freq * 1.01, t); o1.frequency.exponentialRampToValueAtTime(freq, t + 0.05);
    const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq * 2;
    const g2 = c.createGain(); g2.gain.setValueAtTime(0.3, t); g2.gain.exponentialRampToValueAtTime(0.01, t + dur * 0.4);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(freq * 6, t); f.frequency.exponentialRampToValueAtTime(freq * 1.5, t + dur);
    o1.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(this.musicBus);
    o1.start(t); o2.start(t); o1.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }
  _bass(freq, t, dur, vel = 0.32) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.02); g.gain.setValueAtTime(vel, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    const o2 = c.createOscillator(); o2.type = 'triangle'; o2.frequency.value = freq;
    const g2 = c.createGain(); g2.gain.value = 0.3;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    o.connect(g); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(this.musicBus);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }
  _taiko(t, vel = 0.9, big = false) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(big ? 95 : 130, t); o.frequency.exponentialRampToValueAtTime(big ? 38 : 52, t + 0.18);
    const g = c.createGain(); g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.001, t + (big ? 0.75 : 0.4));
    o.connect(g); g.connect(this.musicBus); o.start(t); o.stop(t + 0.8);
    const n = c.createBufferSource(); n.buffer = this.noise;
    const nf = c.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 900;
    const ng = c.createGain(); ng.gain.setValueAtTime(vel * 0.5, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    n.connect(nf); nf.connect(ng); ng.connect(this.musicBus); n.start(t); n.stop(t + 0.1);
  }
  _click(t, vel = 0.25) {
    const c = this.ctx;
    const n = c.createBufferSource(); n.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3200; f.Q.value = 6;
    const g = c.createGain(); g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    n.connect(f); f.connect(g); g.connect(this.musicBus); n.start(t); n.stop(t + 0.06);
  }
  // 심벌/바람 스웰 (마디 앞 크레셴도)
  _swell(t, dur = 1.6, vel = 0.18) {
    const c = this.ctx;
    const n = c.createBufferSource(); n.buffer = this.noise; n.loop = true;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.setValueAtTime(800, t); f.frequency.exponentialRampToValueAtTime(5000, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(vel, t + dur); g.gain.exponentialRampToValueAtTime(0.001, t + dur + 0.4);
    n.connect(f); f.connect(g); g.connect(this.musicBus); n.start(t); n.stop(t + dur + 0.5);
  }

  // ---------- 시퀀서 (8분음표 단위) ----------
  _schedule() {
    if (!this.ctx) return;
    const c = this.ctx;
    const eighth = 60 / this._bpm / 2;
    while (this._nextStep < c.currentTime + 0.4) {
      this._playStep(this._nextStep, this._step, eighth);
      this._nextStep += eighth;
      this._step++;
    }
  }

  _playStep(t, step, eighth) {
    const bar = Math.floor(step / 8), pos = step % 8;
    const chord = CHORDS[bar % CHORDS.length];
    const mode = this.mode;
    const boss = mode === 'boss', dawn = mode === 'dawn', menu = mode === 'menu';
    const beat = eighth * 2;
    const barLen = beat * 4;

    // 마디 시작: 패드 + 베이스
    if (pos === 0) {
      const padVel = boss ? 0.075 : dawn ? 0.05 : menu ? 0.04 : 0.058;
      for (const n of chord.notes) this._strings(hz(n + (dawn ? 12 : 0)), t, barLen + 0.2, padVel);
      if (!menu) this._bass(hz(chord.root - 12), t, boss ? beat * 0.9 : barLen * 0.95, dawn ? 0.16 : 0.32);
      if (boss && bar % 4 === 3) this._swell(t + barLen - 1.6, 1.6, 0.16);
      if (!dawn && !menu && bar % 8 === 7) this._swell(t + barLen - 1.2, 1.2, 0.12);
    }
    // 보스: 베이스 8분 리듬
    if (boss && pos > 0 && pos % 2 === 0) this._bass(hz(chord.root - 12), t, beat * 0.8, 0.26);

    // 태고
    if (!dawn && !menu) {
      if (pos === 0) this._taiko(t, boss ? 1.0 : 0.85, true);
      if (pos === 4) this._taiko(t, boss ? 0.85 : 0.55);
      if (boss && (pos === 3 || pos === 6)) this._taiko(t, 0.6);
      if (boss && pos === 7) this._taiko(t, 0.45);
      if (pos % 2 === 1) this._click(t, boss ? 0.28 : 0.14);
    } else if (dawn && pos === 0 && bar % 2 === 0) this._taiko(t, 0.35, true);

    // 고토 아르페지오 (코드 톤)
    if (!boss || pos % 2 === 0) {
      const arpVel = menu ? 0.2 : dawn ? 0.22 : 0.16;
      if (pos % 2 === 0 || menu) {
        const n = chord.notes[(Math.floor(pos / 2) + bar) % chord.notes.length] + 12;
        this._koto(hz(n), t, arpVel, 1.0);
      }
    }

    // 선율 (메뉴에선 생략, 새벽엔 느리게 절반)
    if (!menu) {
      if (this._melHold <= 0) {
        const [semi, len] = MELODY[this._melPos % MELODY.length];
        this._melPos++;
        const holdSteps = dawn ? len * 2 : len;
        this._melHold = holdSteps;
        if (semi !== null) {
          const f = hz(semi + (dawn ? 12 : 0));
          const vel = boss ? 0.26 : dawn ? 0.16 : 0.2;
          this._lead(f, t, holdSteps * eighth * 0.95, vel, this._prevLead);
          if (boss) this._lead(f * 0.5, t, holdSteps * eighth * 0.9, 0.12, null); // 옥타브 아래 더블링
          this._prevLead = f;
        } else this._prevLead = null;
      }
      this._melHold--;
    }
  }

  // ---------- 효과음 ----------
  sfx(name) {
    if (!this.ctx) return;
    const c = this.ctx; const t = c.currentTime; const out = this.sfxBus;
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
      case 'coin': tone('sine', 1500, 1500, 0.08, 0.2); tone('sine', 2200, 2200, 0.25, 0.18, 0.06); break;
      case 'buy': tone('sine', 880, 880, 0.15, 0.25); tone('sine', 1320, 1320, 0.3, 0.2, 0.12); tone('sine', 1760, 1760, 0.4, 0.15, 0.24); break;
      case 'hurt': tone('sine', 110, 50, 0.3, 0.7); noiseBurst(0.2, 600, 150, 0.5, 'lowpass', 1); tone('square', 330, 300, 0.12, 0.08); break;
      case 'dash': noiseBurst(0.22, 300, 2500, 0.3, 'bandpass', 0.7); break;
      case 'special':
        noiseBurst(0.9, 200, 5000, 0.6, 'bandpass', 0.6);
        [0, 4, 7, 12, 16].forEach((d, k) => tone('sine', 440 * Math.pow(2, d / 12), 440 * Math.pow(2, d / 12), 0.6, 0.22, k * 0.07));
        tone('sine', 80, 30, 0.8, 0.6);
        break;
      case 'wave': noiseBurst(0.5, 500, 2500, 0.4, 'bandpass', 0.8); tone('sine', 200, 400, 0.4, 0.2); break;
      case 'fire': noiseBurst(0.3, 3000, 800, 0.3, 'bandpass', 2); tone('sine', 700, 350, 0.25, 0.15); break;
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
