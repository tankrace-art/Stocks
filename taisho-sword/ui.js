// ui.js — HUD, 화면(타이틀/선택/이야기/일시정지/메뉴: 스킬·장비(종이인형)·상점/결과), 기술명 연출
import { clamp } from './util.js';
import { CHARACTERS, SKILLS, SKILL_BRANCHES, xpToNext, getCharacter } from './characters.js';
import { RARITIES, SLOTS, STATS, ICONS, itemScore, sellPrice, POTION_PRICE, POTION_MAX } from './items.js';

const SLOT_ORDER = ['weapon', 'head', 'chest', 'belt', 'arms', 'legs', 'charm'];

export class UI {
  constructor({ touch = false } = {}) {
    this.touch = touch;
    this.root = document.getElementById('ui');
    this.root.innerHTML = `
      <div id="hud">
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
        <div id="key-hints">Tab 장비·스킬·상점 · Q 회복약 · M 소리 · Esc 일시정지</div>
      </div>
      <div id="screen" class="screen">
        <div class="panel">
          <div class="era">다이쇼 12년 · 검사단</div>
          <h1 id="screen-title">대숲의 밤</h1>
          <div id="screen-sub" class="sub"></div>
          <div id="screen-body" class="body"></div>
          <div id="screen-cta" class="cta"></div>
        </div>
      </div>
      <div id="story" class="screen"><div class="story-panel"><div class="era" id="story-chapter"></div><h1 id="story-title"></h1><div class="sub" id="story-place"></div><div id="story-lines"></div><div class="cta" id="story-cta"></div></div></div>
      <div id="select" class="screen"><div class="select-wrap"><div class="era">검사를 고르시오</div><div id="select-cards"></div><div class="tip">한 번 고른 검사로 1장부터 5장까지 이야기를 이어 갑니다 · 캐릭터마다 진행이 따로 저장됩니다</div></div></div>
      <div id="menu" class="screen">
        <div class="menu-panel">
          <div class="menu-head">
            <div class="menu-tabs"><button class="tab on" data-tab="skills">스킬 트리</button><button class="tab" data-tab="gear">장비</button><button class="tab" data-tab="shop">상점</button></div>
            <div id="menu-info"></div>
            <button id="menu-close">닫기 (Tab)</button>
          </div>
          <div id="menu-skills" class="menu-body"></div>
          <div id="menu-gear" class="menu-body" hidden></div>
          <div id="menu-shop" class="menu-body" hidden></div>
        </div>
      </div>
    `;
    this.$ = (id) => document.getElementById(id);
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
  }

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
      t.textContent = '대숲의 밤';
      s.textContent = '다이쇼 검극 — 요괴의 밤을 베어라';
      const cont = stats.continueInfo;
      b.innerHTML = `
        <p>다이쇼 12년. 마을을 덮친 요괴를 쫓아 검을 든 검사의 이야기.<br>첫 요괴부터 검사단, 여섯 장군, 그리고 무한 미궁성의 귀왕까지 — 다섯 장의 밤.</p>
        <div class="title-btns">
          ${cont ? `<button id="btn-continue" class="big">이어하기<span>${cont}</span></button>` : ''}
          <button id="btn-new" class="big ${cont ? '' : 'primary'}">새로 시작<span>검사 선택</span></button>
        </div>
        ${this.touch ? `<table class="controls compact">
          <tr><td>왼쪽 화면</td><td>드래그로 이동</td></tr>
          <tr><td>오른쪽 화면</td><td>드래그로 시점 · 탭으로 베기</td></tr>
          <tr><td>베기 / 강공 / 대시 / 비검 / 약</td><td>우하단 버튼</td></tr>
        </table><p class="tip">가로 화면을 권장합니다</p>` : `<table class="controls compact">
          <tr><td>W A S D · 마우스</td><td>이동 · 시점</td></tr>
          <tr><td>좌클릭 / 우클릭 / Shift</td><td>3연타 / 강공격 / 대시</td></tr>
          <tr><td>F · Q · Tab · M</td><td>비검 · 회복약 · 장비/스킬/상점 · 소리</td></tr>
        </table>`}`;
      c.textContent = '';
      const bc = this.$('btn-continue'); if (bc) bc.addEventListener('click', (e) => { e.stopPropagation(); this.onContinue && this.onContinue(); });
      this.$('btn-new').addEventListener('click', (e) => { e.stopPropagation(); this.onNew && this.onNew(); });
    } else if (kind === 'pause') {
      t.textContent = '일시정지'; s.textContent = '숨을 고른다';
      b.innerHTML = this.touch ? '' : '<p class="tip">Tab — 장비·스킬·상점 · M — 소리</p>';
      c.textContent = `${act} 계속`;
    } else if (kind === 'defeat') {
      t.textContent = '산화'; s.textContent = '검사는 쓰러졌다… 얻은 경험과 장비, 금화는 남는다.';
      b.innerHTML = this._stats(stats); c.textContent = `${act} 다시 도전`;
    } else if (kind === 'ending') {
      t.textContent = '새벽'; s.textContent = '요괴의 시대가 끝났다. 다섯 밤을 모두 넘긴 검사에게 경의를.';
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
    for (const k of ['skills', 'gear', 'shop']) this.$(`menu-${k}`).hidden = this.menuTab !== k;
    this.$('menu-info').innerHTML = `<b>${ch.name}</b> · Lv.${pr.level} · 경험치 ${Math.floor(pr.xp)}/${xpToNext(pr.level)} · <span class="pts ${pr.points ? 'on' : ''}">스킬 포인트 ${pr.points}</span> · 회복약 ${pr.potions} · <span class="gold">${ICONS.gold} ${pr.gold}</span>`;
    if (this.menuTab === 'skills') this._renderSkills(); else if (this.menuTab === 'gear') this._renderGear(); else this._renderShop();
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
