// ui.js — HUD(체력·게이지·콤보·레벨·회복약), 보스 체력, 밤 진행, 메시지, 획득 로그,
//         화면: 타이틀 / 캐릭터 선택 / 일시정지 / 장비·스킬 메뉴 / 결과
import { clamp } from './util.js';
import { CHARACTERS, SKILLS, SKILL_BRANCHES, xpToNext } from './characters.js';
import { RARITIES, SLOTS, STATS, itemScore } from './items.js';

export class UI {
  constructor({ touch = false } = {}) {
    this.touch = touch;
    this.root = document.getElementById('ui');
    this.root.innerHTML = `
      <div id="hud">
        <div id="status">
          <div class="label"><span class="kanji">체력</span><span id="hp-text">100</span></div>
          <div class="bar hp"><div class="fill" id="hp-fill"></div></div>
          <div class="label"><span class="kanji">비검</span><span id="gauge-text">0%</span></div>
          <div class="bar gauge"><div class="fill" id="gauge-fill"></div></div>
          <div class="label small"><span id="level-text">Lv.1</span><span id="xp-text">0 / 80</span></div>
          <div class="bar xp"><div class="fill" id="xp-fill"></div></div>
          <div id="special-hint">F 또는 Space — 비검 발동</div>
          <div id="potion-hud"><span class="pot"></span><span id="potion-text">회복약 ×0</span><span class="key">Q</span></div>
          <div id="log"></div>
        </div>
        <div id="combo"><div id="combo-num">0</div><div id="combo-label">연타</div></div>
        <div id="boss"><div id="boss-name"></div><div class="bar boss"><div class="fill" id="boss-fill"></div></div></div>
        <div id="night">
          <div id="night-track"><div id="night-fill"></div><div id="night-moon">☾</div></div>
          <div id="night-info"><span id="wave-text"></span><span id="kill-text"></span></div>
        </div>
        <div id="crosshair"></div>
        <div id="message"><div id="msg-title"></div><div id="msg-sub"></div></div>
        <div id="vignette"></div>
        <div id="dash-cd"></div>
        <div id="key-hints">Tab 장비·스킬 · Q 회복약 · M 소리 · Esc 일시정지</div>
      </div>
      <div id="screen" class="screen">
        <div class="panel">
          <div class="era">다이쇼 12년 · 대나무 숲</div>
          <h1 id="screen-title">대숲의 밤</h1>
          <div id="screen-sub" class="sub"></div>
          <div id="screen-body" class="body"></div>
          <div id="screen-cta" class="cta"></div>
        </div>
      </div>
      <div id="select" class="screen"><div class="select-wrap"><div class="era">검사를 고르시오</div><div id="select-cards"></div><div class="tip">카드를 고르면 밤이 시작됩니다 · 캐릭터마다 레벨과 장비가 따로 저장됩니다</div></div></div>
      <div id="menu" class="screen">
        <div class="menu-panel">
          <div class="menu-head">
            <div class="menu-tabs"><button class="tab on" data-tab="skills">스킬 트리</button><button class="tab" data-tab="gear">장비</button></div>
            <div id="menu-info"></div>
            <button id="menu-close">닫기 (Tab)</button>
          </div>
          <div id="menu-skills" class="menu-body"></div>
          <div id="menu-gear" class="menu-body" hidden></div>
        </div>
      </div>
    `;
    this.$ = (id) => document.getElementById(id);
    this.hpFill = this.$('hp-fill'); this.hpText = this.$('hp-text');
    this.gaugeFill = this.$('gauge-fill'); this.gaugeText = this.$('gauge-text'); this.specialHint = this.$('special-hint');
    this.levelText = this.$('level-text'); this.xpText = this.$('xp-text'); this.xpFill = this.$('xp-fill');
    this.potionText = this.$('potion-text'); this.potionHud = this.$('potion-hud');
    this.log = this.$('log');
    this.combo = this.$('combo'); this.comboNum = this.$('combo-num');
    this.bossBox = this.$('boss'); this.bossName = this.$('boss-name'); this.bossFill = this.$('boss-fill');
    this.nightFill = this.$('night-fill'); this.nightMoon = this.$('night-moon');
    this.waveText = this.$('wave-text'); this.killText = this.$('kill-text');
    this.msg = this.$('message'); this.msgTitle = this.$('msg-title'); this.msgSub = this.$('msg-sub');
    this.vignette = this.$('vignette');
    this.dashCd = this.$('dash-cd');
    this.screen = this.$('screen');
    this.select = this.$('select');
    this.menu = this.$('menu');
    this.msgTimer = 0; this.vig = 0;
    this.onSelect = null; this.onMenuClose = null; this.onLearn = null; this.onEquip = null; this.onUnequip = null; this.onDiscard = null; this.onResetSkills = null;
    this.menuTab = 'skills';
    this.progress = null; this.character = null;
    if (touch) { this.$('key-hints').hidden = true; this.potionHud.querySelector('.key').hidden = true; }

    for (const b of this.menu.querySelectorAll('.tab')) b.addEventListener('click', () => this.setMenuTab(b.dataset.tab));
    this.$('menu-close').addEventListener('click', () => this.onMenuClose && this.onMenuClose());
  }

  // ---------- HUD ----------
  setHP(cur, max) {
    const p = clamp(cur / max, 0, 1);
    this.hpFill.style.width = `${p * 100}%`;
    this.hpText.textContent = `${Math.ceil(cur)} / ${max}`;
    this.hpFill.classList.toggle('low', p < 0.3);
  }
  setGauge(v, max) {
    const p = clamp(v / max, 0, 1);
    this.gaugeFill.style.width = `${p * 100}%`;
    this.gaugeText.textContent = p >= 1 ? '준비 완료' : `${Math.floor(p * 100)}%`;
    this.gaugeFill.classList.toggle('full', p >= 1);
    this.specialHint.classList.toggle('show', p >= 1 && !this.touch);
  }
  setProgress(pr) {
    if (!pr) return;
    this.levelText.textContent = `Lv.${pr.level}${pr.points > 0 ? ` · 포인트 ${pr.points}` : ''}`;
    this.xpText.textContent = `${Math.floor(pr.xp)} / ${xpToNext(pr.level)}`;
    this.xpFill.style.width = `${clamp(pr.xp / xpToNext(pr.level), 0, 1) * 100}%`;
    this.potionText.textContent = `회복약 ×${pr.potions}`;
    this.potionHud.classList.toggle('empty', pr.potions <= 0);
    this.levelText.classList.toggle('has-points', pr.points > 0);
  }
  setCombo(n, pop) {
    if (n > 0) {
      this.comboNum.textContent = n;
      this.comboNum.style.transform = `scale(${1 + pop * 0.5})`;
      const tier = n >= 30 ? 'tier3' : n >= 15 ? 'tier2' : n >= 6 ? 'tier1' : '';
      this.combo.className = `show ${tier}`;
    } else this.combo.classList.remove('show');
  }
  showBoss(name) { this.bossName.textContent = name; this.bossBox.classList.add('show'); }
  setBossHP(cur, max) { this.bossFill.style.width = `${clamp(cur / max, 0, 1) * 100}%`; }
  hideBoss() { this.bossBox.classList.remove('show'); }
  setNight(progress, waveIndex, totalWaves, kills, dawn) {
    this.nightFill.style.width = `${progress * 100}%`;
    this.nightMoon.style.left = `${progress * 100}%`;
    this.nightMoon.textContent = dawn ? '☀' : '☾';
    this.waveText.textContent = waveIndex < 0 ? '밤이 내린다' : waveIndex >= totalWaves - 1 ? '주인 · 흑귀' : `${waveIndex + 1}번째 파도`;
    this.killText.textContent = `토벌 ${kills}`;
  }
  setDash(cdFrac) {
    this.dashCd.style.opacity = cdFrac > 0 ? 0.8 : 0.25;
    this.dashCd.style.setProperty('--cd', `${(1 - cdFrac) * 100}%`);
  }
  message(title, sub = '', duration = 3.2) {
    this.msgTitle.textContent = title;
    this.msgSub.textContent = sub;
    this.msg.classList.remove('show');
    void this.msg.offsetWidth;
    this.msg.classList.add('show');
    this.msgTimer = duration;
  }
  // 획득 로그 (왼쪽 상태창 아래)
  logLine(html, cls = '') {
    const el = document.createElement('div');
    el.className = `log-line ${cls}`;
    el.innerHTML = html;
    this.log.appendChild(el);
    while (this.log.children.length > 4) this.log.removeChild(this.log.firstChild);
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
      s.textContent = '다이쇼 검극 — 밤을 베어라';
      const controls = this.touch ? `
        <table class="controls">
          <tr><td>왼쪽 화면</td><td>드래그로 이동</td></tr>
          <tr><td>오른쪽 화면</td><td>드래그로 시점 · 탭으로 베기</td></tr>
          <tr><td>베기 / 강공</td><td>기본 3연타 / 강공격</td></tr>
          <tr><td>대시 / 비검</td><td>무적 회피 / 게이지가 차면 필살기</td></tr>
          <tr><td>약 / 장비·스킬</td><td>회복약 사용 / 스킬 트리와 장비</td></tr>
        </table>
        <p class="tip">가로 화면을 권장합니다</p>` : `
        <table class="controls">
          <tr><td>W A S D</td><td>이동</td></tr>
          <tr><td>마우스</td><td>시점</td></tr>
          <tr><td>Shift</td><td>대시 (무적 회피)</td></tr>
          <tr><td>좌클릭 / 우클릭</td><td>기본 3연타 / 강공격</td></tr>
          <tr><td>F / Space</td><td>비검 (게이지가 차면)</td></tr>
          <tr><td>Q / Tab / M</td><td>회복약 / 장비·스킬 / 소리</td></tr>
        </table>`;
      b.innerHTML = `<p>안개 낀 대나무 숲. 요괴는 밤에만 움직이고, 새벽이 오면 재가 되어 흩어진다.<br>새벽까지 살아남거나, 숲의 주인 <b>흑귀</b>를 베어라.<br>요괴가 떨어뜨린 <b>칼·갑옷·부적</b>을 모아 강해지고, 레벨을 올려 <b>스킬</b>을 익혀라.</p>${controls}`;
      c.textContent = `${act} 시작`;
    } else if (kind === 'pause') {
      t.textContent = '일시정지';
      s.textContent = '숨을 고른다';
      b.innerHTML = this.touch ? '' : '<p class="tip">Tab — 장비·스킬 · M — 소리</p>';
      c.textContent = `${act} 계속`;
    } else if (kind === 'victory') {
      t.textContent = '새벽';
      s.textContent = '흑귀를 베었다. 새벽빛이 대나무 숲을 물들인다.';
      b.innerHTML = this._stats(stats);
      c.textContent = `${act} 다시`;
    } else if (kind === 'survived') {
      t.textContent = '새벽';
      s.textContent = '밤을 버텨냈다. 요괴들은 새벽과 함께 사라졌다.';
      b.innerHTML = this._stats(stats);
      c.textContent = `${act} 다시`;
    } else if (kind === 'defeat') {
      t.textContent = '산화';
      s.textContent = '검사는 대나무 숲에 쓰러졌다… 얻은 경험과 장비는 남는다.';
      b.innerHTML = this._stats(stats);
      c.textContent = `${act} 다시`;
    }
  }
  _stats(s) {
    return `<div class="stats">
      <div><span>토벌</span><b>${s.kills ?? 0}</b></div>
      <div><span>최대 연타</span><b>${s.maxCombo ?? 0}</b></div>
      <div><span>비검 발동</span><b>${s.specials ?? 0}</b></div>
      <div><span>경과</span><b>${Math.floor((s.time ?? 0) / 60)}:${String(Math.floor((s.time ?? 0) % 60)).padStart(2, '0')}</b></div>
      <div><span>획득 경험치</span><b>${s.xpGained ?? 0}</b></div>
      <div><span>획득 아이템</span><b>${s.itemsGained ?? 0}</b></div>
    </div>`;
  }
  hideScreen() { this.screen.className = 'screen'; }

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
      const bar = (n) => '●'.repeat(n) + '○'.repeat(5 - n);
      card.innerHTML = `
        <div class="figure"><div class="hat ${ch.look.kasa ? 'kasa' : ch.look.cap ? 'cap' : ch.look.headband ? 'band' : 'hair'}"></div><div class="head"></div><div class="scarf"></div><div class="body"></div><div class="blade"></div></div>
        <div class="name">${ch.name}</div>
        <div class="style">${ch.style} · ${ch.role}</div>
        <div class="desc">${ch.desc}</div>
        <table class="statbars">
          <tr><td>공격</td><td>${bar(ch.bars.atk)}</td></tr>
          <tr><td>속도</td><td>${bar(ch.bars.spd)}</td></tr>
          <tr><td>체력</td><td>${bar(ch.bars.hp)}</td></tr>
          <tr><td>기술</td><td>${bar(ch.bars.tec)}</td></tr>
        </table>
        <div class="special">${ch.special.name}</div>
        <div class="lv">Lv.${pr.level} · 장비 ${Object.values(pr.equipped).filter(Boolean).length}/3${pr.points ? ` · 포인트 ${pr.points}` : ''}</div>
      `;
      card.addEventListener('click', () => this.onSelect && this.onSelect(ch));
      wrap.appendChild(card);
    }
    this.select.className = 'screen show';
  }
  hideSelect() { this.select.className = 'screen'; }

  // ---------- 장비·스킬 메뉴 ----------
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
    this.$('menu-skills').hidden = this.menuTab !== 'skills';
    this.$('menu-gear').hidden = this.menuTab !== 'gear';
    this.$('menu-info').innerHTML = `<b>${ch.name}</b> · Lv.${pr.level} · 경험치 ${Math.floor(pr.xp)}/${xpToNext(pr.level)} · <span class="pts ${pr.points ? 'on' : ''}">스킬 포인트 ${pr.points}</span> · 회복약 ${pr.potions}`;
    if (this.menuTab === 'skills') this._renderSkills(); else this._renderGear();
  }
  _renderSkills() {
    const pr = this.progress;
    const box = this.$('menu-skills');
    box.innerHTML = `<div class="skill-cols">${SKILL_BRANCHES.map((br) => `
      <div class="skill-col">
        <div class="branch"><b>${br.name}</b><span>${br.desc}</span></div>
        ${SKILLS.filter((s) => s.branch === br.id).map((s) => {
          const state = pr.has(s.id) ? 'learned' : pr.canLearn(s.id) ? 'can' : (!s.req || pr.has(s.req)) ? 'open' : 'locked';
          return `<div class="node-link ${pr.has(s.id) ? 'lit' : ''}"></div>
          <button class="node ${state}" data-skill="${s.id}">
            <div class="tier">${s.tier}단</div><div class="nname">${s.name}</div><div class="ndesc">${s.desc}</div>
            <div class="nstate">${state === 'learned' ? '습득' : state === 'can' ? '배우기 (1포인트)' : state === 'open' ? '포인트 필요' : '이전 단계 필요'}</div>
          </button>`; }).join('')}
      </div>`).join('')}</div>
      <div class="menu-foot"><span>요괴를 베어 경험치를 얻고, 레벨이 오를 때마다 스킬 포인트 1을 받습니다.</span><button id="skill-reset">스킬 초기화</button></div>`;
    for (const n of box.querySelectorAll('.node.can')) n.addEventListener('click', () => { if (pr.learn(n.dataset.skill)) { this.onLearn && this.onLearn(n.dataset.skill); this.renderMenu(); } });
    box.querySelector('#skill-reset').addEventListener('click', () => { pr.reset(); this.onResetSkills && this.onResetSkills(); this.renderMenu(); });
  }
  _itemCard(it, action) {
    const r = RARITIES[it.rarity];
    return `<div class="item ${it.rarity}" data-id="${it.id}" data-action="${action}">
      <div class="irow"><span class="irarity" style="color:${r.color}">${r.name}</span><span class="islot">${SLOTS[it.slot]}</span></div>
      <div class="iname" style="color:${r.color}">${it.name}</div>
      <div class="istats">${Object.entries(it.stats).map(([k, v]) => `<span>${STATS[k].name} ${STATS[k].fmt(v)}</span>`).join('')}</div>
      <div class="iact">${action === 'equip' ? '장착' : action === 'unequip' ? '해제' : ''}</div>
    </div>`;
  }
  _renderGear() {
    const pr = this.progress;
    const box = this.$('menu-gear');
    const totals = {};
    for (const it of Object.values(pr.equipped)) if (it) for (const [k, v] of Object.entries(it.stats)) totals[k] = (totals[k] || 0) + v;
    const bag = [...pr.items].sort((a, b) => itemScore(b) - itemScore(a));
    box.innerHTML = `
      <div class="gear-wrap">
        <div class="gear-left">
          <div class="gear-title">장착 중</div>
          ${Object.keys(SLOTS).map((slot) => pr.equipped[slot] ? this._itemCard(pr.equipped[slot], 'unequip') : `<div class="item empty"><div class="islot">${SLOTS[slot]}</div><div class="iname">비어 있음</div></div>`).join('')}
          <div class="gear-title">합계</div>
          <div class="totals">${Object.keys(totals).length ? Object.entries(totals).map(([k, v]) => `<span>${STATS[k].name} ${STATS[k].fmt(v)}</span>`).join('') : '<span>장착한 장비 없음</span>'}</div>
          <div class="legend">${Object.values(RARITIES).map((r) => `<span style="color:${r.color}">■ ${r.name}</span>`).join('')}</div>
        </div>
        <div class="gear-right">
          <div class="gear-title">가방 <span>${bag.length} / 24</span></div>
          <div class="bag">${bag.length ? bag.map((it) => this._itemCard(it, 'equip')).join('') : '<div class="tip">요괴를 베면 아이템을 떨어뜨립니다. 가까이 가면 자동으로 줍습니다.</div>'}</div>
        </div>
      </div>`;
    for (const el of box.querySelectorAll('.item[data-action=equip]')) {
      el.addEventListener('click', () => { pr.equip(el.dataset.id); this.onEquip && this.onEquip(); this.renderMenu(); });
      // 길게 누르거나 우클릭으로 버리기
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); if (confirm('이 아이템을 버릴까요?')) { pr.discard(el.dataset.id); this.renderMenu(); } });
    }
    for (const el of box.querySelectorAll('.item[data-action=unequip]')) {
      el.addEventListener('click', () => { const slot = Object.keys(SLOTS).find((s) => pr.equipped[s] && pr.equipped[s].id === el.dataset.id); pr.unequip(slot); this.onUnequip && this.onUnequip(); this.renderMenu(); });
    }
  }

  update(dt) {
    if (this.msgTimer > 0) { this.msgTimer -= dt; if (this.msgTimer <= 0) this.msg.classList.remove('show'); }
    if (this.vig > 0) { this.vig = Math.max(0, this.vig - dt * 2.5); this.vignette.style.opacity = this.vig; }
  }
}
