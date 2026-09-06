// ui.js — HUD, 화면(타이틀/선택/이야기/일시정지/메뉴: 스킬·장비(종이인형)·상점/결과), 기술명 연출
import { clamp } from './util.js';
import { CHARACTERS, SKILLS, SKILL_BRANCHES, xpToNext, getCharacter } from './characters.js';
import { RARITIES, SLOTS, STATS, ICONS, itemScore, sellPrice, POTION_PRICE, POTION_MAX } from './items.js';
import { CHAPTERS } from './scenario.js';
import { WORLD_NODES } from './maps.js';

const SLOT_ORDER = ['weapon', 'head', 'chest', 'belt', 'arms', 'legs', 'charm'];

export class UI {
  constructor({ touch = false } = {}) {
    this.touch = touch;
    this.root = document.getElementById('ui');
    this.root.innerHTML = `
      <div id="hud">
        <div id="minimap-wrap"><canvas id="minimap" width="180" height="180"></canvas><div id="minimap-label"></div></div>
        <div id="status">
          <div class="label"><span class="kanji" id="hud-name">체력</span><span id="hp-text">100</span></div>
          <div class="bar hp"><div class="fill" id="hp-fill"></div></div>
          <div class="label"><span class="kanji">비검</span><span id="gauge-text">0%</span></div>
          <div class="bar gauge"><div class="fill" id="gauge-fill"></div></div>
          <div class="label small"><span id="level-text">Lv.1</span><span id="xp-text">0 / 80</span></div>
          <div class="bar xp"><div class="fill" id="xp-fill"></div></div>
          <div id="special-hint">F 또는 Space — 비검 발동</div>
          <div id="res-row">
            <span id="potion-hud"><span class="ic">${ICONS.potion}</span><span id="potion-text">×0</span><span class="key">Q</span></span>
            <span id="gold-hud"><span class="ic">${ICONS.gold}</span><span id="gold-text">0</span></span>
            <span id="lives-hud" title="재도전 기회">♥♥♥</span>
          </div>
          <div id="allies"></div>
          <div id="log"></div>
        </div>
        <div id="combo"><div id="combo-num">0</div><div id="combo-label">연타</div></div>
        <div id="move"><div id="move-text"></div></div>
        <div id="boss"><div id="boss-name"></div><div class="bar boss"><div class="fill" id="boss-fill"></div></div></div>
        <div id="night">
          <div id="night-track"><div id="night-fill"></div><div id="night-moon">☾</div></div>
          <div id="night-info"><span id="wave-text"></span><span id="chapter-text"></span><span id="kill-text"></span></div>
        </div>
        <div id="crosshair"></div>
        <div id="message"><div id="msg-title"></div><div id="msg-sub"></div></div>
        <div id="vignette"></div>
        <div id="dash-cd"></div>
        <div id="key-hints">1~6 호흡 형 · 7/F 오의 · Space 점프(공중 공격=낙하 베기) · Tab 메뉴 · Q 회복약 · M 소리</div>
      </div>
      <div id="screen" class="screen">
        <div class="panel">
          <div class="era">다이쇼 시대 · 귀살대</div>
          <h1 id="screen-title">대숲의 밤</h1>
          <div id="screen-sub" class="sub"></div>
          <div id="screen-body" class="body"></div>
          <div id="screen-cta" class="cta"></div>
        </div>
      </div>
      <div id="story" class="screen"><div class="story-panel"><div class="era" id="story-chapter"></div><h1 id="story-title"></h1><div class="sub" id="story-place"></div><div id="story-lines"></div><div class="cta" id="story-cta"></div></div></div>
      <div id="select" class="screen"><div class="select-wrap"><div class="era">주인공을 고르시오</div><div id="select-cards"></div><div class="tip">한 번 고른 주인공으로 1장부터 최종장까지 이야기를 이어 갑니다 · 나머지 둘은 3장부터 동료로 함께 싸웁니다</div></div></div>
      <div id="menu" class="screen">
        <div class="menu-panel">
          <div class="menu-head">
            <div class="menu-tabs"><button class="tab on" data-tab="skills">스킬 트리</button><button class="tab" data-tab="gear">장비</button><button class="tab" data-tab="shop">상점</button><button class="tab" data-tab="world">지도</button></div>
            <div id="menu-info"></div>
            <button id="menu-close">닫기 (Tab)</button>
          </div>
          <div id="menu-skills" class="menu-body"></div>
          <div id="menu-gear" class="menu-body" hidden></div>
          <div id="menu-shop" class="menu-body" hidden></div>
          <div id="menu-world" class="menu-body" hidden></div>
        </div>
      </div>
      <div id="world" class="screen"><div class="menu-panel world-panel"><div class="menu-head"><div class="era">세계 지도 — 도깨비의 밤이 내린 땅</div><button id="world-close">닫기</button></div><div id="world-body"></div></div></div>
    `;
    this.$ = (id) => document.getElementById(id);
    this.mm = this.$('minimap').getContext('2d');
    this.mmLabel = this.$('minimap-label');
    const ids = ['hp-fill', 'hp-text', 'hud-name', 'gauge-fill', 'gauge-text', 'special-hint', 'level-text', 'xp-text', 'xp-fill', 'potion-text', 'potion-hud', 'gold-text', 'allies', 'log',
      'combo', 'combo-num', 'move', 'move-text', 'boss', 'boss-name', 'boss-fill', 'night-fill', 'night-moon', 'wave-text', 'chapter-text', 'kill-text', 'message', 'msg-title', 'msg-sub', 'vignette', 'dash-cd', 'screen', 'story', 'select', 'menu'];
    this.el = {}; for (const id of ids) this.el[id] = this.$(id);
    this.screen = this.el.screen; this.menu = this.el.menu;
    this.msgTimer = 0; this.vig = 0; this.moveTimer = 0;
    this.onSelect = null; this.onMenuClose = null; this.onLearn = null; this.onEquip = null; this.onUnequip = null; this.onResetSkills = null;
    this.onBuy = null; this.onBuyPotion = null; this.onSell = null; this.onContinue = null; this.onNew = null; this.onStoryDone = null;
    this.menuTab = 'skills';
    this.progress = null; this.character = null;
    if (touch) { this.$('key-hints').hidden = true; this.el['potion-hud'].querySelector('.key').hidden = true; }
    for (const b of this.menu.querySelectorAll('.tab')) b.addEventListener('click', () => this.setMenuTab(b.dataset.tab));
    this.$('menu-close').addEventListener('click', () => this.onMenuClose && this.onMenuClose());
    this.$('story-cta').addEventListener('click', () => this.onStoryDone && this.onStoryDone());
    this.$('world-close').addEventListener('click', () => { this.hideWorld(); this.onWorldClose && this.onWorldClose(); });
    this.onChapterPick = null; this.onWorldClose = null; this.onWorld = null; this.onDifficulty = null;
  }

  // ---------- 미니맵 ----------
  drawMinimap(stage, player, allies, enemies, pickups, chapter) {
    const c = this.mm; if (!c || !stage) return;
    const W = 180, cx = 90, cy = 90;
    const s = 78 / (stage.extent + 1.5);
    c.clearRect(0, 0, W, W);
    const b = stage.bounds;
    c.save(); c.translate(cx, cy);
    c.fillStyle = 'rgba(8,10,20,0.55)'; c.strokeStyle = 'rgba(243,233,216,0.55)'; c.lineWidth = 1.2;
    c.beginPath();
    if (b.type === 'circle') c.arc(0, 0, b.r * s, 0, Math.PI * 2);
    else if (b.type === 'rect') c.rect(-b.w / 2 * s, -b.h / 2 * s, b.w * s, b.h * s);
    else { const w = b.w / 2 * s, L = b.len / 2 * s, H = b.hall * s; c.moveTo(-w, -L); c.lineTo(w, -L); c.lineTo(w, -H); c.lineTo(H, -H); c.lineTo(H, -w); c.lineTo(L, -w); c.lineTo(L, w); c.lineTo(H, w); c.lineTo(H, H); c.lineTo(w, H); c.lineTo(w, L); c.lineTo(-w, L); c.lineTo(-w, H); c.lineTo(-H, H); c.lineTo(-H, w); c.lineTo(-L, w); c.lineTo(-L, -w); c.lineTo(-H, -w); c.lineTo(-H, -H); c.lineTo(-w, -H); c.closePath(); }
    c.fill(); c.stroke();
    // 구조물
    c.fillStyle = 'rgba(243,233,216,0.35)';
    for (const o of stage.obstacles) { if (o.r < 0.45) continue; c.beginPath(); c.arc(o.x * s, o.z * s, Math.max(1.2, o.r * s), 0, Math.PI * 2); c.fill(); }
    // 관심 지점
    c.font = '10px serif'; c.textAlign = 'center'; c.fillStyle = '#ffd9a0';
    for (const p of stage.poi) c.fillText({ torii: '⛩', shrine: '⛩', pond: '◯', throne: '♛', gate: '▯', hall: '◈', path: '⋯' }[p.icon] || '•', p.x * s, p.z * s + 3);
    // 아이템
    for (const k of pickups) { c.fillStyle = k.type === 'gold' ? '#ffd040' : k.type === 'potion' ? '#ff6080' : RARITIES[k.item.rarity].color; c.beginPath(); c.arc(k.group.position.x * s, k.group.position.z * s, 2, 0, Math.PI * 2); c.fill(); }
    // 적
    for (const e of enemies) {
      if (!e.alive) continue;
      c.fillStyle = e.isBoss ? '#ff3a2a' : '#ff6a5a';
      c.beginPath(); c.arc(e.pos.x * s, e.pos.z * s, e.isBoss ? 5 : 2.6, 0, Math.PI * 2); c.fill();
      if (e.isBoss) { c.strokeStyle = '#ff3a2a'; c.beginPath(); c.arc(e.pos.x * s, e.pos.z * s, 8 + Math.sin(performance.now() * 0.006) * 2, 0, Math.PI * 2); c.stroke(); }
    }
    // 동료
    for (const a of allies) { c.fillStyle = a.alive ? '#8fc8ff' : '#607080'; c.beginPath(); c.arc(a.pos.x * s, a.pos.z * s, 3, 0, Math.PI * 2); c.fill(); }
    // 플레이어 (화살표)
    c.save(); c.translate(player.pos.x * s, player.pos.z * s); c.rotate(-player.yaw + Math.PI);
    c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(0, -6); c.lineTo(4.5, 5); c.lineTo(0, 2.5); c.lineTo(-4.5, 5); c.closePath(); c.fill();
    c.restore();
    c.restore();
    // 나침반 N
    c.fillStyle = 'rgba(243,233,216,0.7)'; c.font = '11px serif'; c.textAlign = 'center'; c.fillText('N', cx, 12);
    if (chapter) this.mmLabel.textContent = `${chapter.title} · ${chapter.name}`;
  }

  // ---------- 세계 지도 ----------
  worldHtml(progress) {
    const unlockedMax = Math.min(CHAPTERS.length, (progress ? progress.cleared : 0) + 1);
    const nodes = WORLD_NODES.map((n) => {
      const ch = CHAPTERS[n.chapter - 1]; if (!ch) return '';
      const state = n.chapter <= (progress ? progress.cleared : 0) ? 'cleared' : n.chapter === unlockedMax ? 'current' : 'locked';
      return `<button class="wnode ${state}" style="left:${n.x}%;top:${n.y}%" data-ch="${n.chapter}" ${state === 'locked' ? 'disabled' : ''}>
        <span class="wicon">${n.icon}</span><span class="wname">${ch.title}<br>${ch.name}</span><span class="wstate">${state === 'cleared' ? '클리어 · 다시 가기' : state === 'current' ? '지금 여기' : '아직 잠김'}</span></button>`;
    }).join('');
    const path = WORLD_NODES.map((n, i) => `${i ? 'L' : 'M'} ${n.x * 8} ${n.y * 4.6}`).join(' ');
    return `<div class="wmap">
      <svg class="wbg" viewBox="0 0 800 460" preserveAspectRatio="none">
        <defs><linearGradient id="wg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a1c33"/><stop offset="1" stop-color="#0e1020"/></linearGradient></defs>
        <rect width="800" height="460" fill="url(#wg)"/>
        <path d="M0 380 Q120 300 240 360 T480 330 T800 380 V460 H0 Z" fill="#141a2a"/>
        <path d="M0 250 L90 150 L160 230 L240 120 L330 220 L400 90 L470 200 L560 130 L640 210 L720 110 L800 200 V460 H0 Z" fill="#1c2238" opacity="0.8"/>
        <path d="M0 300 L120 210 L200 280 L290 190 L380 270 L450 170 L540 260 L620 190 L700 270 L800 210 V460 H0 Z" fill="#232a44" opacity="0.8"/>
        <path d="M60 460 C 140 380, 200 420, 300 350 S 520 300, 620 250 S 760 190, 800 120" stroke="#3a4a7a" stroke-width="10" fill="none" opacity="0.6"/>
        <path d="${path}" stroke="#ffd9a0" stroke-width="2" stroke-dasharray="6 6" fill="none" opacity="0.7"/>
      </svg>${nodes}</div>
      <div class="menu-foot"><span>클리어한 지역은 다시 도전해 장비·경험치를 모을 수 있습니다. 새 지역은 이전 지역을 클리어하면 열립니다.</span></div>`;
  }
  _bindWorld(box) { for (const n of box.querySelectorAll('.wnode:not([disabled])')) n.addEventListener('click', () => this.onChapterPick && this.onChapterPick(Number(n.dataset.ch))); }
  showWorld(progress) { const box = this.$('world-body'); box.innerHTML = this.worldHtml(progress); this._bindWorld(box); this.$('world').className = 'screen show'; }
  hideWorld() { this.$('world').className = 'screen'; }

  // ---------- HUD ----------
  setHP(cur, max) {
    const p = clamp(cur / max, 0, 1);
    this.el['hp-fill'].style.width = `${p * 100}%`;
    this.el['hp-text'].textContent = `${Math.ceil(cur)} / ${max}`;
    this.el['hp-fill'].classList.toggle('low', p < 0.3);
  }
  setName(name) { this.el['hud-name'].textContent = name; }
  setGauge(v, max) {
    const p = clamp(v / max, 0, 1);
    this.el['gauge-fill'].style.width = `${p * 100}%`;
    this.el['gauge-text'].textContent = p >= 1 ? '준비 완료' : `${Math.floor(p * 100)}%`;
    this.el['gauge-fill'].classList.toggle('full', p >= 1);
    this.el['special-hint'].classList.toggle('show', p >= 1 && !this.touch);
  }
  setProgress(pr) {
    if (!pr) return;
    this.el['level-text'].textContent = `Lv.${pr.level}${pr.points > 0 ? ` · 포인트 ${pr.points}` : ''}`;
    this.el['xp-text'].textContent = `${Math.floor(pr.xp)} / ${xpToNext(pr.level)}`;
    this.el['xp-fill'].style.width = `${clamp(pr.xp / xpToNext(pr.level), 0, 1) * 100}%`;
    this.el['potion-text'].textContent = `×${pr.potions}`;
    this.el['potion-hud'].classList.toggle('empty', pr.potions <= 0);
    this.el['gold-text'].textContent = pr.gold;
    this.el['level-text'].classList.toggle('has-points', pr.points > 0);
  }
  setAllies(allies) {
    if (!allies.length) { this.el.allies.innerHTML = ''; return; }
    this.el.allies.innerHTML = allies.map((a) => `<div class="ally ${a.alive ? '' : 'down'}"><span class="aname" style="color:#${a.ch.colors.glow.toString(16).padStart(6, '0')}">${a.ch.name}</span><span class="abar"><span style="width:${clamp(a.hp / a.maxHp, 0, 1) * 100}%"></span></span>${a.alive ? '' : `<span class="adown">기상까지 ${Math.ceil(a.downT)}</span>`}</div>`).join('');
  }
  setCombo(n, pop) {
    if (n > 0) {
      this.el['combo-num'].textContent = n;
      this.el['combo-num'].style.transform = `scale(${1 + pop * 0.5})`;
      const tier = n >= 30 ? 'tier3' : n >= 15 ? 'tier2' : n >= 6 ? 'tier1' : '';
      this.el.combo.className = `show ${tier}`;
    } else this.el.combo.classList.remove('show');
  }
  // 기술명 연출
  callout(name, tier = 1, color = '#cfe8ff') {
    const m = this.el.move;
    this.el['move-text'].textContent = name;
    m.style.setProperty('--mc', color);
    m.className = '';
    void m.offsetWidth;
    m.className = `show t${tier}`;
    this.moveTimer = tier >= 3 ? 2.2 : 1.3;
  }
  showBoss(name) { this.el['boss-name'].textContent = name; this.el.boss.classList.add('show'); }
  setBossHP(cur, max) { this.el['boss-fill'].style.width = `${clamp(cur / max, 0, 1) * 100}%`; }
  hideBoss() { this.el.boss.classList.remove('show'); }
  setNight(progress, waveIndex, totalWaves, kills, dawn, chapter) {
    this.el['night-fill'].style.width = `${progress * 100}%`;
    this.el['night-moon'].style.left = `${progress * 100}%`;
    this.el['night-moon'].textContent = dawn ? '☀' : '☾';
    this.el['wave-text'].textContent = waveIndex < 0 ? '밤이 내린다' : waveIndex >= totalWaves - 1 ? '보스' : `${waveIndex + 1}번째 파도`;
    this.el['chapter-text'].textContent = chapter ? `${chapter.title} · ${chapter.name}` : '';
    this.el['kill-text'].textContent = `토벌 ${kills}`;
  }
  setLives(n) { const el = this.$('lives-hud'); if (el) el.textContent = '♥'.repeat(Math.max(0, n)) + '♡'.repeat(Math.max(0, 3 - n)); }
  setDash(cdFrac) { this.el['dash-cd'].style.opacity = cdFrac > 0 ? 0.8 : 0.25; this.el['dash-cd'].style.setProperty('--cd', `${(1 - cdFrac) * 100}%`); }
  message(title, sub = '', duration = 3.2) {
    this.el['msg-title'].textContent = title; this.el['msg-sub'].textContent = sub;
    this.el.message.classList.remove('show'); void this.el.message.offsetWidth; this.el.message.classList.add('show');
    this.msgTimer = duration;
  }
  logLine(html, cls = '') {
    const el = document.createElement('div');
    el.className = `log-line ${cls}`; el.innerHTML = html;
    this.el.log.appendChild(el);
    while (this.el.log.children.length > 4) this.el.log.removeChild(this.el.log.firstChild);
    setTimeout(() => { el.classList.add('fade'); setTimeout(() => el.remove(), 600); }, 3200);
  }
  damageFlash() { this.vig = 1; }

  // ---------- 화면 ----------
  showScreen(kind, stats = {}) {
    const t = this.$('screen-title'), s = this.$('screen-sub'), b = this.$('screen-body'), c = this.$('screen-cta');
    this.screen.className = `screen show ${kind}`;
    const act = this.touch ? '터치하여' : '클릭하여';
    if (kind === 'title') {
      t.textContent = '귀살의 밤';
      s.textContent = '다이쇼 검극 — 도깨비의 밤을 베어라';
      const cont = stats.continueInfo;
      b.innerHTML = `
        <p>다이쇼 시대. 가족을 잃고 도깨비가 된 여동생을 되돌리기 위해 검을 든 소년들의 이야기.<br>최종 선별부터 무한열차, 유곽, 무한성, 그리고 새벽의 무잔 결전까지 — 여덟 장의 밤.</p>
        <div class="title-btns">
          ${cont ? `<button id="btn-continue" class="big">이어하기<span>${cont}</span></button>` : ''}
          <button id="btn-new" class="big ${cont ? '' : 'primary'}">새로 시작<span>검사 선택</span></button>
          ${cont ? '<button id="btn-world" class="big">세계 지도<span>지역 고르기</span></button>' : ''}
        </div>
        <div class="diff-row">난이도 ${Object.entries(stats.difficulties || {}).map(([k, v]) => `<button class="diff ${k === stats.difficulty ? 'on' : ''}" data-diff="${k}">${v.name}</button>`).join('')}</div>
        ${this.touch ? `<table class="controls compact">
          <tr><td>왼쪽 화면</td><td>드래그로 이동</td></tr>
          <tr><td>오른쪽 화면</td><td>드래그로 시점 · 탭으로 베기</td></tr>
          <tr><td>베기 / 강공 / 대시 / 비검 / 약</td><td>우하단 버튼</td></tr>
        </table><p class="tip">가로 화면을 권장합니다</p>` : `<table class="controls compact">
          <tr><td>W A S D · 마우스</td><td>이동 · 시점</td></tr>
          <tr><td>좌클릭 / 우클릭 / Shift / Space</td><td>3연타 / 강공격 / 대시 / 점프</td></tr>
          <tr><td>1~6 · 7/F</td><td>호흡 제1형~제6형 · 제7형(오의)</td></tr>
          <tr><td>Q · Tab · M</td><td>회복약 · 장비/스킬/상점/지도 · 소리</td></tr>
        </table>`}`;
      c.textContent = '';
      const bc = this.$('btn-continue'); if (bc) bc.addEventListener('click', (e) => { e.stopPropagation(); this.onContinue && this.onContinue(); });
      this.$('btn-new').addEventListener('click', (e) => { e.stopPropagation(); this.onNew && this.onNew(); });
      const bw = this.$('btn-world'); if (bw) bw.addEventListener('click', (e) => { e.stopPropagation(); this.onWorld && this.onWorld(); });
      for (const d of this.screen.querySelectorAll('.diff')) d.addEventListener('click', (e) => { e.stopPropagation(); this.onDifficulty && this.onDifficulty(d.dataset.diff); for (const x of this.screen.querySelectorAll('.diff')) x.classList.toggle('on', x === d); });
    } else if (kind === 'pause') {
      t.textContent = '일시정지'; s.textContent = '숨을 고른다';
      b.innerHTML = this.touch ? '' : '<p class="tip">Tab — 장비·스킬·상점 · M — 소리</p>';
      c.textContent = `${act} 계속`;
    } else if (kind === 'defeat') {
      t.textContent = '산화'; s.textContent = '검사는 쓰러졌다… 얻은 경험과 장비, 금화는 남는다.';
      b.innerHTML = this._stats(stats); c.textContent = `${act} 다시 도전`;
    } else if (kind === 'ending') {
      t.textContent = '새벽'; s.textContent = '도깨비의 시대가 끝났다. 여덟 밤을 모두 넘긴 검사에게 경의를.';
      b.innerHTML = this._stats(stats); c.textContent = `${act} 처음으로`;
    }
  }
  _stats(s) {
    return `<div class="stats">
      <div><span>토벌</span><b>${s.kills ?? 0}</b></div><div><span>최대 연타</span><b>${s.maxCombo ?? 0}</b></div>
      <div><span>비검 발동</span><b>${s.specials ?? 0}</b></div><div><span>경과</span><b>${Math.floor((s.time ?? 0) / 60)}:${String(Math.floor((s.time ?? 0) % 60)).padStart(2, '0')}</b></div>
      <div><span>획득 경험치</span><b>${s.xpGained ?? 0}</b></div><div><span>획득 금화</span><b>${s.goldGained ?? 0}</b></div>
    </div>`;
  }
  hideScreen() { this.screen.className = 'screen'; }

  // ---------- 이야기 화면 ----------
  showStory(chapter, kind, ctaText) {
    this.$('story-chapter').textContent = `${chapter.title} · ${chapter.place}`;
    this.$('story-title').textContent = kind === 'intro' ? chapter.name : (chapter.final ? '새벽 — 끝' : '새벽');
    this.$('story-place').textContent = kind === 'intro' ? '' : `${chapter.name} — 클리어`;
    const lines = kind === 'intro' ? chapter.story : chapter.clear;
    const box = this.$('story-lines');
    box.innerHTML = lines.map((l, i) => `<p style="animation-delay:${0.3 + i * 0.9}s">${l}</p>`).join('');
    this.$('story-cta').textContent = ctaText;
    this.$('story-cta').style.animationDelay = `${0.3 + lines.length * 0.9}s`;
    this.el.story.className = `screen show ${kind}`;
  }
  hideStory() { this.el.story.className = 'screen'; }

  // ---------- 캐릭터 선택 ----------
  showSelect(progressOf) {
    const wrap = this.$('select-cards');
    wrap.innerHTML = '';
    for (const ch of CHARACTERS) {
      const pr = progressOf(ch.id);
      const card = document.createElement('div');
      card.className = 'card';
      card.style.setProperty('--c1', `#${ch.colors.kimono.toString(16).padStart(6, '0')}`);
      card.style.setProperty('--c2', `#${ch.colors.glow.toString(16).padStart(6, '0')}`);
      card.style.setProperty('--c3', `#${ch.colors.scarf.toString(16).padStart(6, '0')}`);
      card.style.setProperty('--c4', `#${ch.colors.hair.toString(16).padStart(6, '0')}`);
      const bar = (n) => '●'.repeat(n) + '○'.repeat(5 - n);
      card.innerHTML = `
        <div class="figure"><div class="hat ${ch.look.kasa ? 'kasa' : ch.look.cap ? 'cap' : ch.look.headband ? 'band' : 'hair'}"></div><div class="head"><span class="eye l"></span><span class="eye r"></span></div><div class="scarf"></div><div class="body"></div><div class="blade"></div></div>
        <div class="name">${ch.name}</div>
        <div class="style">${ch.style} · ${ch.role}</div>
        <div class="desc">${ch.desc}</div>
        <table class="statbars"><tr><td>공격</td><td>${bar(ch.bars.atk)}</td></tr><tr><td>속도</td><td>${bar(ch.bars.spd)}</td></tr><tr><td>체력</td><td>${bar(ch.bars.hp)}</td></tr><tr><td>기술</td><td>${bar(ch.bars.tec)}</td></tr></table>
        <div class="special">${ch.special.name}</div>
        <div class="lv">Lv.${pr.level} · ${pr.cleared ? `제${pr.cleared}장 클리어` : '새 이야기'}${pr.points ? ` · 포인트 ${pr.points}` : ''}</div>`;
      card.addEventListener('click', () => this.onSelect && this.onSelect(ch));
      wrap.appendChild(card);
    }
    this.el.select.className = 'screen show';
  }
  hideSelect() { this.el.select.className = 'screen'; }

  // ---------- 메뉴 ----------
  showMenu(character, progress, tab = null) {
    this.character = character; this.progress = progress;
    if (tab) this.menuTab = tab;
    this.menu.className = 'screen show';
    this.renderMenu();
  }
  hideMenu() { this.menu.className = 'screen'; }
  setMenuTab(tab) { this.menuTab = tab; this.renderMenu(); }
  renderMenu() {
    const pr = this.progress, ch = this.character;
    if (!pr) return;
    for (const b of this.menu.querySelectorAll('.tab')) b.classList.toggle('on', b.dataset.tab === this.menuTab);
    for (const k of ['skills', 'gear', 'shop', 'world']) this.$(`menu-${k}`).hidden = this.menuTab !== k;
    this.$('menu-info').innerHTML = `<b>${ch.name}</b> · Lv.${pr.level} · 경험치 ${Math.floor(pr.xp)}/${xpToNext(pr.level)} · <span class="pts ${pr.points ? 'on' : ''}">스킬 포인트 ${pr.points}</span> · 회복약 ${pr.potions} · <span class="gold">${ICONS.gold} ${pr.gold}</span>`;
    if (this.menuTab === 'skills') this._renderSkills(); else if (this.menuTab === 'gear') this._renderGear(); else if (this.menuTab === 'shop') this._renderShop();
    else { const box = this.$('menu-world'); box.innerHTML = this.worldHtml(pr); this._bindWorld(box); }
  }
  _renderSkills() {
    const pr = this.progress;
    const box = this.$('menu-skills');
    box.innerHTML = `<div class="skill-cols">${SKILL_BRANCHES.map((br) => `
      <div class="skill-col"><div class="branch"><b>${br.name}</b><span>${br.desc}</span></div>
        ${SKILLS.filter((s) => s.branch === br.id).map((s) => {
          const state = pr.has(s.id) ? 'learned' : pr.canLearn(s.id) ? 'can' : (!s.req || pr.has(s.req)) ? 'open' : 'locked';
          return `<div class="node-link ${pr.has(s.id) ? 'lit' : ''}"></div>
          <button class="node ${state}" data-skill="${s.id}"><div class="tier">${s.tier}단</div><div class="nname">${s.name}</div><div class="ndesc">${s.desc}</div>
            <div class="nstate">${state === 'learned' ? '습득' : state === 'can' ? '배우기 (1포인트)' : state === 'open' ? '포인트 필요' : '이전 단계 필요'}</div></button>`; }).join('')}
      </div>`).join('')}</div>
      <div class="menu-foot"><span>요괴를 베어 경험치를 얻고, 레벨이 오를 때마다 스킬 포인트 1을 받습니다.</span><button id="skill-reset">스킬 초기화</button></div>`;
    for (const n of box.querySelectorAll('.node.can')) n.addEventListener('click', () => { if (pr.learn(n.dataset.skill)) { this.onLearn && this.onLearn(n.dataset.skill); this.renderMenu(); } });
    box.querySelector('#skill-reset').addEventListener('click', () => { pr.reset(); this.onResetSkills && this.onResetSkills(); this.renderMenu(); });
  }
  _itemCard(it, action, extra = '') {
    const r = RARITIES[it.rarity];
    const label = { equip: '장착', unequip: '해제', buy: `구입 ${r.price}G`, sell: `판매 ${sellPrice(it)}G` }[action] || '';
    return `<div class="item ${it.rarity}" data-id="${it.id}" data-action="${action}" style="--rc:${r.color}">
      <div class="icon">${ICONS[it.slot]}</div>
      <div class="ibody">
        <div class="irow"><span class="irarity">${r.name}</span><span class="islot">${SLOTS[it.slot]}</span></div>
        <div class="iname">${it.name}</div>
        <div class="istats">${Object.entries(it.stats).map(([k, v]) => `<span>${STATS[k].name} ${STATS[k].fmt(v)}</span>`).join('')}</div>
      </div>
      <div class="iact">${label}${extra}</div>
    </div>`;
  }
  _renderGear() {
    const pr = this.progress;
    const box = this.$('menu-gear');
    const totals = {};
    for (const it of Object.values(pr.equipped)) if (it) for (const [k, v] of Object.entries(it.stats)) totals[k] = (totals[k] || 0) + v;
    const bag = [...pr.items].sort((a, b) => itemScore(b) - itemScore(a));
    const slotBox = (slot) => {
      const it = pr.equipped[slot];
      const r = it ? RARITIES[it.rarity] : null;
      return `<div class="doll-slot ${slot} ${it ? it.rarity : 'empty'}" data-slot="${slot}" style="--rc:${r ? r.color : '#777'}" title="${it ? it.name : SLOTS[slot]}">
        <div class="icon">${ICONS[slot]}</div><div class="dname">${it ? it.name : SLOTS[slot]}</div></div>`;
    };
    box.innerHTML = `
      <div class="gear-wrap">
        <div class="gear-left">
          <div class="gear-title">장착 중 <span>슬롯을 누르면 해제</span></div>
          <div class="doll">
            <svg class="silhouette" viewBox="0 0 120 220"><circle cx="60" cy="30" r="20"/><path d="M40 55 h40 l10 30 -8 6 v70 h-44 v-70 l-8 -6 z"/><path d="M28 62 l-14 50 10 4 12 -44 z M92 62 l14 50 -10 4 -12 -44 z"/><path d="M40 160 l-4 55 h18 l6 -55 z M80 160 l4 55 h-18 l-6 -55 z"/></svg>
            ${SLOT_ORDER.map(slotBox).join('')}
          </div>
          <div class="gear-title">합계</div>
          <div class="totals">${Object.keys(totals).length ? Object.entries(totals).map(([k, v]) => `<span>${STATS[k].name} ${STATS[k].fmt(v)}</span>`).join('') : '<span>장착한 장비 없음</span>'}</div>
          <div class="legend">${Object.values(RARITIES).map((r) => `<span style="color:${r.color}">■ ${r.name}</span>`).join('')}</div>
        </div>
        <div class="gear-right">
          <div class="gear-title">가방 <span>${bag.length} / 30 · 우클릭(길게 누르기): 버리기</span></div>
          <div class="bag">${bag.length ? bag.map((it) => this._itemCard(it, 'equip')).join('') : '<div class="tip">요괴를 베면 아이템을 떨어뜨립니다. 가까이 가면 자동으로 줍습니다. 상점에서 살 수도 있습니다.</div>'}</div>
        </div>
      </div>`;
    for (const el of box.querySelectorAll('.item[data-action=equip]')) {
      el.addEventListener('click', () => { pr.equip(el.dataset.id); this.onEquip && this.onEquip(); this.renderMenu(); });
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); if (confirm('이 아이템을 버릴까요?')) { pr.discard(el.dataset.id); this.renderMenu(); } });
      let pressT = null;
      el.addEventListener('touchstart', () => { pressT = setTimeout(() => { if (confirm('이 아이템을 버릴까요?')) { pr.discard(el.dataset.id); this.renderMenu(); } }, 700); }, { passive: true });
      el.addEventListener('touchend', () => clearTimeout(pressT)); el.addEventListener('touchmove', () => clearTimeout(pressT));
    }
    for (const el of box.querySelectorAll('.doll-slot:not(.empty)')) {
      el.addEventListener('click', () => { pr.unequip(el.dataset.slot); this.onUnequip && this.onUnequip(); this.renderMenu(); });
    }
  }
  _renderShop() {
    const pr = this.progress;
    const box = this.$('menu-shop');
    const stock = (pr.shop && pr.shop.stock) || [];
    const bag = [...pr.items].sort((a, b) => itemScore(b) - itemScore(a));
    box.innerHTML = `
      <div class="gear-wrap">
        <div class="gear-left shop-left">
          <div class="gear-title">떠돌이 상인 <span>금화 ${pr.gold}G</span></div>
          <div class="shop-potion"><div class="icon" style="color:#ff6080">${ICONS.potion}</div><div class="ibody"><div class="iname">회복약</div><div class="istats"><span>체력 45 회복 · 보유 ${pr.potions}/${POTION_MAX}</span></div></div><button id="buy-potion" class="shop-btn" ${pr.gold < POTION_PRICE || pr.potions >= POTION_MAX ? 'disabled' : ''}>${POTION_PRICE}G</button></div>
          <div class="gear-title">진열 장비 <span>장이 바뀌면 새 물건이 들어옵니다</span></div>
          <div class="bag shop-stock">${stock.length ? stock.map((it) => this._itemCard(it, 'buy', pr.gold < RARITIES[it.rarity].price ? '<em>금화 부족</em>' : '')).join('') : '<div class="tip">진열된 물건이 없습니다.</div>'}</div>
        </div>
        <div class="gear-right">
          <div class="gear-title">판매 <span>가방의 장비를 팔아 금화를 얻습니다</span></div>
          <div class="bag">${bag.length ? bag.map((it) => this._itemCard(it, 'sell')).join('') : '<div class="tip">팔 수 있는 장비가 없습니다.</div>'}</div>
        </div>
      </div>`;
    box.querySelector('#buy-potion').addEventListener('click', () => { if (this.onBuyPotion && this.onBuyPotion()) this.renderMenu(); });
    for (const el of box.querySelectorAll('.item[data-action=buy]')) {
      el.addEventListener('click', () => { const it = stock.find((i) => i.id === el.dataset.id); if (it && this.onBuy && this.onBuy(it)) this.renderMenu(); });
    }
    for (const el of box.querySelectorAll('.item[data-action=sell]')) {
      el.addEventListener('click', () => { const it = pr.items.find((i) => i.id === el.dataset.id); if (it && this.onSell && this.onSell(it)) this.renderMenu(); });
    }
  }

  update(dt) {
    if (this.msgTimer > 0) { this.msgTimer -= dt; if (this.msgTimer <= 0) this.el.message.classList.remove('show'); }
    if (this.moveTimer > 0) { this.moveTimer -= dt; if (this.moveTimer <= 0) this.el.move.className = ''; }
    if (this.vig > 0) { this.vig = Math.max(0, this.vig - dt * 2.5); this.el.vignette.style.opacity = this.vig; }
  }
}
