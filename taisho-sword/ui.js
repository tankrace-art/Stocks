// ui.js — HUD(체력바, 기술 게이지, 콤보), 보스 체력, 밤 진행, 메시지, 화면 전환
import { clamp } from './util.js';

export class UI {
  constructor({ touch = false } = {}) {
    this.touch = touch;
    this.root = document.getElementById('ui');
    this.root.innerHTML = `
      <div id="hud">
        <div id="status">
          <div class="label"><span class="kanji">体力</span><span id="hp-text">100</span></div>
          <div class="bar hp"><div class="fill" id="hp-fill"></div><div class="ghost" id="hp-ghost"></div></div>
          <div class="label"><span class="kanji">秘剣</span><span id="gauge-text">0%</span></div>
          <div class="bar gauge"><div class="fill" id="gauge-fill"></div></div>
          <div id="special-hint">F 또는 Space — 秘剣・波焔</div>
        </div>
        <div id="combo"><div id="combo-num">0</div><div id="combo-label">連撃</div></div>
        <div id="boss"><div id="boss-name"></div><div class="bar boss"><div class="fill" id="boss-fill"></div></div></div>
        <div id="night">
          <div id="night-track"><div id="night-fill"></div><div id="night-moon">☾</div></div>
          <div id="night-info"><span id="wave-text"></span><span id="kill-text"></span></div>
        </div>
        <div id="crosshair"></div>
        <div id="message"><div id="msg-title"></div><div id="msg-sub"></div></div>
        <div id="vignette"></div>
        <div id="dash-cd"></div>
      </div>
      <div id="screen" class="screen">
        <div class="panel">
          <div class="era">大正十二年 · 竹林</div>
          <h1 id="screen-title">竹林の夜</h1>
          <div id="screen-sub" class="sub">다이쇼 검극 — 밤을 베어라</div>
          <div id="screen-body" class="body"></div>
          <div id="screen-cta" class="cta">클릭하여 시작</div>
        </div>
      </div>
    `;
    this.$ = (id) => document.getElementById(id);
    this.hpFill = this.$('hp-fill'); this.hpGhost = this.$('hp-ghost'); this.hpText = this.$('hp-text');
    this.gaugeFill = this.$('gauge-fill'); this.gaugeText = this.$('gauge-text'); this.specialHint = this.$('special-hint');
    this.combo = this.$('combo'); this.comboNum = this.$('combo-num');
    this.bossBox = this.$('boss'); this.bossName = this.$('boss-name'); this.bossFill = this.$('boss-fill');
    this.nightFill = this.$('night-fill'); this.nightMoon = this.$('night-moon');
    this.waveText = this.$('wave-text'); this.killText = this.$('kill-text');
    this.msg = this.$('message'); this.msgTitle = this.$('msg-title'); this.msgSub = this.$('msg-sub');
    this.vignette = this.$('vignette');
    this.dashCd = this.$('dash-cd');
    this.screen = this.$('screen');
    this.msgTimer = 0;
    this.ghostHp = 100;
    this.lastCombo = 0;
    this.vig = 0;
  }

  setHP(cur, max) {
    const p = clamp(cur / max, 0, 1);
    this.hpFill.style.width = `${p * 100}%`;
    this.hpText.textContent = `${Math.ceil(cur)} / ${max}`;
    this.hpFill.classList.toggle('low', p < 0.3);
  }

  setGauge(v, max) {
    const p = clamp(v / max, 0, 1);
    this.gaugeFill.style.width = `${p * 100}%`;
    this.gaugeText.textContent = p >= 1 ? '準備完了' : `${Math.floor(p * 100)}%`;
    this.gaugeFill.classList.toggle('full', p >= 1);
    this.specialHint.classList.toggle('show', p >= 1);
  }

  setCombo(n, pop) {
    if (n > 0) {
      this.combo.classList.add('show');
      this.comboNum.textContent = n;
      this.comboNum.style.transform = `scale(${1 + pop * 0.5})`;
      const tier = n >= 30 ? 'tier3' : n >= 15 ? 'tier2' : n >= 6 ? 'tier1' : '';
      this.combo.className = `show ${tier}`;
    } else {
      this.combo.classList.remove('show');
    }
  }

  showBoss(name) { this.bossName.textContent = name; this.bossBox.classList.add('show'); }
  setBossHP(cur, max) { this.bossFill.style.width = `${clamp(cur / max, 0, 1) * 100}%`; }
  hideBoss() { this.bossBox.classList.remove('show'); }

  setNight(progress, waveIndex, totalWaves, kills, dawn) {
    this.nightFill.style.width = `${progress * 100}%`;
    this.nightMoon.style.left = `${progress * 100}%`;
    this.nightMoon.textContent = dawn ? '☀' : '☾';
    this.waveText.textContent = waveIndex < 0 ? '밤이 내린다' : waveIndex >= totalWaves - 1 ? '主 · 黒鬼' : `第${['一', '二', '三', '四'][waveIndex] || waveIndex + 1}波`;
    this.killText.textContent = `討伐 ${kills}`;
  }

  setDash(cdFrac) {
    this.dashCd.style.opacity = cdFrac > 0 ? 0.8 : 0.25;
    this.dashCd.style.setProperty('--cd', `${(1 - cdFrac) * 100}%`);
  }

  message(title, sub = '', duration = 3.2) {
    this.msgTitle.textContent = title;
    this.msgSub.textContent = sub;
    this.msg.classList.remove('show');
    void this.msg.offsetWidth; // 애니메이션 재시작
    this.msg.classList.add('show');
    this.msgTimer = duration;
  }

  damageFlash() { this.vig = 1; }

  showScreen(kind, stats = {}) {
    const t = this.$('screen-title'), s = this.$('screen-sub'), b = this.$('screen-body'), c = this.$('screen-cta');
    this.screen.className = `screen show ${kind}`;
    const act = this.touch ? '터치하여' : '클릭하여';
    if (kind === 'title') {
      t.textContent = '竹林の夜';
      s.textContent = '다이쇼 검극 — 밤을 베어라';
      const controls = this.touch ? `
        <table class="controls">
          <tr><td>왼쪽 화면</td><td>드래그로 이동 (가상 조이스틱)</td></tr>
          <tr><td>오른쪽 화면</td><td>드래그로 시점 · 탭으로 베기</td></tr>
          <tr><td>斬</td><td>기본 3연타</td></tr>
          <tr><td>強</td><td>강공격</td></tr>
          <tr><td>閃</td><td>대시 (무적 회피)</td></tr>
          <tr><td>秘剣</td><td>秘剣・波焔 (게이지 충전 시)</td></tr>
        </table>
        <p class="tip">가로 화면을 권장합니다</p>` : `
        <table class="controls">
          <tr><td>W A S D</td><td>이동</td></tr>
          <tr><td>마우스</td><td>시점</td></tr>
          <tr><td>Shift</td><td>대시 (무적 회피)</td></tr>
          <tr><td>좌클릭</td><td>기본 3연타</td></tr>
          <tr><td>우클릭</td><td>강공격</td></tr>
          <tr><td>F / Space</td><td>秘剣・波焔 (게이지 충전 시)</td></tr>
        </table>`;
      b.innerHTML = `
        <p>안개 낀 대나무 숲. 요괴는 밤에만 움직이고, 새벽이 오면 재가 되어 흩어진다.<br>새벽까지 살아남거나, 숲의 주인 <b>黒鬼</b>를 베어라.</p>${controls}`;
      c.textContent = `${act} 시작`;
    } else if (kind === 'pause') {
      t.textContent = '一時停止';
      s.textContent = '숨을 고른다';
      b.innerHTML = '';
      c.textContent = `${act} 계속`;
    } else if (kind === 'victory') {
      t.textContent = '夜明け';
      s.textContent = '黒鬼를 베었다. 새벽빛이 대나무 숲을 물들인다.';
      b.innerHTML = this._stats(stats);
      c.textContent = `${act} 다시`;
    } else if (kind === 'survived') {
      t.textContent = '夜明け';
      s.textContent = '밤을 버텨냈다. 요괴들은 새벽과 함께 사라졌다.';
      b.innerHTML = this._stats(stats);
      c.textContent = `${act} 다시`;
    } else if (kind === 'defeat') {
      t.textContent = '散華';
      s.textContent = '검사는 대나무 숲에 쓰러졌다…';
      b.innerHTML = this._stats(stats);
      c.textContent = `${act} 다시`;
    }
  }
  _stats(s) {
    return `<div class="stats">
      <div><span>討伐</span><b>${s.kills ?? 0}</b></div>
      <div><span>最大連撃</span><b>${s.maxCombo ?? 0}</b></div>
      <div><span>秘剣 발동</span><b>${s.specials ?? 0}</b></div>
      <div><span>경과</span><b>${Math.floor((s.time ?? 0) / 60)}:${String(Math.floor((s.time ?? 0) % 60)).padStart(2, '0')}</b></div>
    </div>`;
  }
  hideScreen() { this.screen.className = 'screen'; }

  update(dt) {
    if (this.msgTimer > 0) {
      this.msgTimer -= dt;
      if (this.msgTimer <= 0) this.msg.classList.remove('show');
    }
    if (this.vig > 0) {
      this.vig = Math.max(0, this.vig - dt * 2.5);
      this.vignette.style.opacity = this.vig;
    }
  }
}
