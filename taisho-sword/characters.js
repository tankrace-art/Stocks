// characters.js — 선택 가능한 검사 5명 정의 + 스킬 트리 + 경험치/레벨 진행(로컬 저장)

export const CHARACTERS = [
  {
    id: 'yuki', name: '유키', style: '설월류(雪月流)', role: '균형형',
    desc: '달빛 아래 물결처럼 흐르는 검. 어느 상황에도 흔들리지 않는 정통 검사.',
    colors: { kimono: 0x2d4370, hakama: 0x1b1f33, haori: 0x1c2438, scarf: 0xf1e9d6, hair: 0x1a1a28, obi: 0x8e2b2b, glow: 0x40a0ff, eye: 0x3a80d0, pattern: 0x8fc0ff },
    look: { cap: true, pattern: 'waves', ponytail: true, bangs: [0.22, 0.3, 0.2, 0.32, 0.22] },
    stats: { hp: 120, speed: 6.2, dmg: 1.0, gauge: 1.0, dashCooldown: 0.75 },
    moves: { l3: '설월류 제1형 · 물결 베기', heavy: '설월류 제3형 · 달빛 파도', special: '설월류 오의 · 파염(波炎)' },
    special: { name: '설월류 오의 · 파염', theme: 'wave', c1: 0x6fb6ff, c2: 0xff8a2a, c3: 0xffffff, range: 4.6, dmg: 55, waves: 1 },
    bars: { atk: 3, spd: 3, hp: 3, tec: 3 },
  },
  {
    id: 'rai', name: '라이', style: '뇌명류(雷鳴流)', role: '속도형',
    desc: '번개처럼 파고들어 베고 빠진다. 대시가 빠르고 체력은 낮다.',
    colors: { kimono: 0xe8c23a, hakama: 0x1a1a1a, haori: 0x2a2a30, scarf: 0xffffff, hair: 0xf2dc8a, obi: 0x222222, glow: 0xfff070, eye: 0xd09020, pattern: 0xffd84a },
    look: { cap: false, spikyHair: true, pattern: 'stripes', bangs: [0.3, 0.2, 0.34, 0.2, 0.3], browTilt: 0.35 },
    stats: { hp: 100, speed: 7.3, dmg: 0.9, gauge: 1.1, dashCooldown: 0.45 },
    moves: { l3: '뇌명류 제1형 · 벽력', heavy: '뇌명류 제4형 · 낙뢰', special: '뇌명류 오의 · 뇌명(雷鳴)' },
    special: { name: '뇌명류 오의 · 뇌명', theme: 'lightning', c1: 0xfff27a, c2: 0xffffff, c3: 0x9ad8ff, range: 4.2, dmg: 48, waves: 1, waveSpeed: 24 },
    bars: { atk: 2, spd: 5, hp: 2, tec: 3 },
  },
  {
    id: 'kuma', name: '쿠마', style: '맹수류(猛獸流)', role: '중량형',
    desc: '곰 같은 힘으로 대검을 휘두른다. 느리지만 한 방이 무겁고 튼튼하다.',
    colors: { kimono: 0x5a3a26, hakama: 0x2a1e18, haori: 0x6a2a22, scarf: 0xd9a640, hair: 0x3a2214, obi: 0x1a1a1a, glow: 0xff9040, eye: 0xd06020, pattern: 0xe0b060 },
    look: { cap: false, headband: true, bladeScale: 1.45, pattern: 'diamonds', bangs: [0.16, 0.2, 0.14, 0.2, 0.16], browTilt: 0.45 },
    stats: { hp: 155, speed: 5.3, dmg: 1.35, gauge: 0.85, dashCooldown: 0.9 },
    moves: { l3: '맹수류 제1형 · 곰 발톱', heavy: '맹수류 제3형 · 산 무너뜨리기', special: '맹수류 오의 · 지명(地鳴)' },
    special: { name: '맹수류 오의 · 지명', theme: 'quake', c1: 0xffb060, c2: 0x8a6a40, c3: 0xff5030, range: 5.2, dmg: 70, waves: 1, waveSpeed: 11 },
    bars: { atk: 5, spd: 1, hp: 5, tec: 2 },
  },
  {
    id: 'hino', name: '히노', style: '홍염류(紅炎流)', role: '공격형',
    desc: '타오르는 검기로 요괴를 태운다. 공격력이 높고 공세가 거칠다.',
    colors: { kimono: 0xb8322a, hakama: 0x2a1212, haori: 0x2a1418, scarf: 0xffd9a0, hair: 0x4a1a14, obi: 0xd9a640, glow: 0xff5020, eye: 0xe03020, pattern: 0xff8a30 },
    look: { cap: true, pattern: 'flames', earring: true, longSide: true, bangs: [0.26, 0.2, 0.3, 0.2, 0.26] },
    stats: { hp: 110, speed: 6.0, dmg: 1.18, gauge: 1.0, dashCooldown: 0.75 },
    moves: { l3: '홍염류 제1형 · 불꽃 춤', heavy: '홍염류 제2형 · 타오르는 하늘', special: '홍염류 오의 · 홍련(紅蓮)' },
    special: { name: '홍염류 오의 · 홍련', theme: 'flame', c1: 0xff6a20, c2: 0xffd050, c3: 0xff2a10, range: 4.8, dmg: 62, waves: 1 },
    bars: { atk: 4, spd: 3, hp: 2, tec: 3 },
  },
  {
    id: 'kaze', name: '카제', style: '청풍류(靑風流)', role: '기술형',
    desc: '바람을 타는 삿갓의 검사. 기술 게이지가 빨리 차고 비검의 범위가 넓다.',
    colors: { kimono: 0x2f7a5a, hakama: 0x1a2a24, haori: 0xe8e0cc, scarf: 0x9ad8c0, hair: 0x2a2a30, obi: 0x3a3a3a, glow: 0x80ffc0, eye: 0x30b070, pattern: 0x3a8a60 },
    look: { cap: false, kasa: true, pattern: 'leaves', braid: true, bangs: [0.3, 0.24, 0.18, 0.24, 0.3] },
    stats: { hp: 105, speed: 6.6, dmg: 0.95, gauge: 1.45, dashCooldown: 0.65 },
    moves: { l3: '청풍류 제1형 · 회오리', heavy: '청풍류 제5형 · 산바람', special: '청풍류 오의 · 선풍(旋風)' },
    special: { name: '청풍류 오의 · 선풍', theme: 'wind', c1: 0x9affc8, c2: 0xffffff, c3: 0x60d090, range: 5.6, dmg: 50, waves: 2 },
    bars: { atk: 2, spd: 4, hp: 2, tec: 5 },
  },
];

export const getCharacter = (id) => CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];

// ---------- 스킬 트리 (3계열 × 3단계) ----------
export const SKILL_BRANCHES = [
  { id: 'atk', name: '검술', desc: '베는 힘을 키운다' },
  { id: 'def', name: '체술', desc: '몸을 단련해 오래 버틴다' },
  { id: 'tec', name: '비검', desc: '기를 다스려 비검을 강화한다' },
];
export const SKILLS = [
  { id: 'atk1', branch: 'atk', tier: 1, name: '검격 강화', desc: '모든 공격력 +15%', req: null },
  { id: 'atk2', branch: 'atk', tier: 2, name: '연격의 극', desc: '연타 8 이상일 때 공격력 +25%', req: 'atk1' },
  { id: 'atk3', branch: 'atk', tier: 3, name: '파쇄 강타', desc: '강공격 범위 +40%, 넉백·경직 증가', req: 'atk2' },
  { id: 'def1', branch: 'def', tier: 1, name: '단련된 육체', desc: '최대 체력 +30', req: null },
  { id: 'def2', branch: 'def', tier: 2, name: '질풍 보법', desc: '대시 재사용 40% 단축, 대시 무적 연장', req: 'def1' },
  { id: 'def3', branch: 'def', tier: 3, name: '불굴의 호흡', desc: '초당 체력 0.8 회복', req: 'def2' },
  { id: 'tec1', branch: 'tec', tier: 1, name: '기 수련', desc: '기술 게이지 충전 +50%', req: null },
  { id: 'tec2', branch: 'tec', tier: 2, name: '비검 연마', desc: '비검 피해 +50%, 검기 파동 1발 추가', req: 'tec1' },
  { id: 'tec3', branch: 'tec', tier: 3, name: '회복의 호흡', desc: '비검 발동 시 체력 25 회복, 주변 적 경직', req: 'tec2' },
];
export const getSkill = (id) => SKILLS.find((s) => s.id === id);

// ---------- 진행(경험치·레벨·포인트) — 캐릭터별 로컬 저장 ----------
export const XP_REWARD = { melee: 12, ranged: 15, boss: 260, wave: 30, night: 80 };
export const xpToNext = (level) => 80 + 40 * (level - 1);

export class Progress {
  constructor(charId) {
    this.charId = charId;
    this.level = 1; this.xp = 0; this.points = 0; this.learned = [];
    this.items = []; this.equipped = {}; this.potions = 2; this.gold = 0;
    this.chapter = 1;          // 현재 도전 중인 장
    this.cleared = 0;          // 클리어한 최고 장
    this.allies = [];          // 합류한 동료 캐릭터 id
    this.shop = null;          // 상점 진열 {level, stock}
    this.load();
  }
  get key() { return `taisho_progress_${this.charId}`; }
  load() {
    try {
      const raw = localStorage.getItem(this.key);
      if (raw) {
        const d = JSON.parse(raw);
        const eq = d.equipped || {};
        if (eq.armor) { eq.chest = eq.armor; delete eq.armor; } // 구버전 호환
        Object.assign(this, {
          level: d.level || 1, xp: d.xp || 0, points: d.points || 0, learned: d.learned || [],
          items: (d.items || []).map((it) => (it.slot === 'armor' ? { ...it, slot: 'chest' } : it)), equipped: eq,
          potions: d.potions === undefined ? 2 : d.potions, gold: d.gold || 0,
          chapter: d.chapter || 1, cleared: d.cleared || 0, allies: d.allies || [], shop: d.shop || null,
        });
      }
    } catch (_) { /* 저장소 없음 */ }
  }
  save() {
    try {
      localStorage.setItem(this.key, JSON.stringify({
        level: this.level, xp: this.xp, points: this.points, learned: this.learned,
        items: this.items, equipped: this.equipped, potions: this.potions, gold: this.gold,
        chapter: this.chapter, cleared: this.cleared, allies: this.allies, shop: this.shop,
      }));
    } catch (_) { /* ignore */ }
  }
  // ---- 아이템 ----
  addItem(item, max = 24) {
    if (this.items.length >= max) return false;
    this.items.push(item); this.save(); return true;
  }
  equip(itemId) {
    const idx = this.items.findIndex((i) => i.id === itemId);
    if (idx < 0) return false;
    const it = this.items.splice(idx, 1)[0];
    const prev = this.equipped[it.slot];
    this.equipped[it.slot] = it;
    if (prev) this.items.push(prev);
    this.save(); return true;
  }
  addGold(n) { this.gold += n; this.save(); }
  spendGold(n) { if (this.gold < n) return false; this.gold -= n; this.save(); return true; }
  sell(itemId, price) {
    const idx = this.items.findIndex((i) => i.id === itemId);
    if (idx < 0) return false;
    this.items.splice(idx, 1); this.gold += price; this.save(); return true;
  }
  clearChapter(n, ally = null) {
    this.cleared = Math.max(this.cleared, n);
    this.chapter = Math.min(n + 1, 3);
    if (ally && !this.allies.includes(ally)) this.allies.push(ally);
    this.save();
  }
  restart() { this.chapter = 1; this.cleared = 0; this.allies = []; this.save(); }
  unequip(slot) {
    const it = this.equipped[slot];
    if (!it) return false;
    this.equipped[slot] = null; this.items.push(it); this.save(); return true;
  }
  discard(itemId) {
    const idx = this.items.findIndex((i) => i.id === itemId);
    if (idx < 0) return false;
    this.items.splice(idx, 1); this.save(); return true;
  }
  addPotion(n = 1, max = 5) { const before = this.potions; this.potions = Math.min(max, this.potions + n); this.save(); return this.potions > before; }
  usePotion() { if (this.potions <= 0) return false; this.potions--; this.save(); return true; }
  has(id) { return this.learned.includes(id); }
  canLearn(id) {
    const s = getSkill(id);
    return !!s && !this.has(id) && this.points > 0 && (!s.req || this.has(s.req));
  }
  learn(id) {
    if (!this.canLearn(id)) return false;
    this.learned.push(id); this.points--; this.save(); return true;
  }
  reset() {
    this.points += this.learned.length; this.learned = []; this.save();
  }
  // 경험치 추가. 레벨업 횟수 반환
  addXp(amount) {
    this.xp += amount;
    let ups = 0;
    while (this.xp >= xpToNext(this.level)) { this.xp -= xpToNext(this.level); this.level++; this.points++; ups++; }
    this.save();
    return ups;
  }
}
