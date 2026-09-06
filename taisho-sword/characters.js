// characters.js — 선택 가능한 검사 5명 정의 + 스킬 트리 + 경험치/레벨 진행(로컬 저장)

export const CHARACTERS = [
  {
    id: 'tanjiro', name: '탄지로', style: '물의 호흡 / 히노카미 카구라', role: '균형형',
    desc: '가족을 잃고 여동생을 되돌리기 위해 검을 든 소년. 물의 호흡을 쓰고, 궁지에서 아버지의 춤 히노카미 카구라를 펼친다.',
    colors: { kimono: 0x1a2a2a, hakama: 0x1b1f33, haori: 0x1e5a3a, scarf: 0xf1e9d6, hair: 0x4a1a1a, hairTip: 0xc03030, obi: 0xf0e6d2, glow: 0x40a0ff, eye: 0x8a1a1a, pattern: 0x0e0e12 },
    look: { pattern: 'check', earring: true, scar: true, bangs: [0.22, 0.3, 0.2, 0.32, 0.22], browTilt: 0.2, mouth: 'smile', ahoge: true },
    stats: { hp: 125, speed: 6.3, dmg: 1.0, gauge: 1.05, dashCooldown: 0.7 },
    moves: { dive: '물의 호흡 제8형 · 폭포 항아리', l3: '물의 호흡 제1형 · 물면 베기', rush: '물의 호흡 제2형 · 물수레', heavy: '물의 호흡 제4형 · 치는 파도', flurry: '물의 호흡 제3형 · 유류무', sweep: '물의 호흡 제5형 · 간천의 자우', wave: '물의 호흡 제10형 · 생생유전', special: '히노카미 카구라 · 원무' },
    attackTheme: 'wave',
    special: { name: '히노카미 카구라 · 원무', theme: 'flame', c1: 0xff6a20, c2: 0xffd050, c3: 0xff2a10, range: 4.8, dmg: 62, waves: 1 },
    bars: { atk: 3, spd: 3, hp: 3, tec: 4 },
  },
  {
    id: 'zenitsu', name: '젠이츠', style: '번개의 호흡', role: '속도형',
    desc: '겁이 많아 잠들어야 진짜 힘이 나오는 소년. 번개의 호흡 제1형 벽력일섬 하나를 극한까지 갈고닦았다.',
    colors: { kimono: 0x1a1a1a, hakama: 0x1a1a1a, haori: 0xf0c040, scarf: 0xffffff, hair: 0xf8d860, hairTip: 0xf08030, obi: 0x222222, glow: 0xfff070, eye: 0xc08020, pattern: 0xfff4d0 },
    look: { pattern: 'uroko', bangs: [0.3, 0.22, 0.34, 0.22, 0.3], browTilt: 0.5, longSide: true, mouth: 'worry', longBack: true },
    stats: { hp: 100, speed: 7.4, dmg: 0.92, gauge: 1.1, dashCooldown: 0.4 },
    moves: { dive: '번개의 호흡 · 낙뢰', l3: '번개의 호흡 · 육연', rush: '번개의 호흡 제1형 · 벽력일섬', heavy: '번개의 호흡 · 팔연', flurry: '벽력일섬 · 연속', sweep: '번개의 호흡 제7형 · 화뢰신', wave: '번개의 호흡 · 원뢰', special: '벽력일섬 · 신속 (神速)' },
    attackTheme: 'lightning',
    special: { name: '벽력일섬 · 신속', theme: 'lightning', c1: 0xfff27a, c2: 0xffffff, c3: 0x9ad8ff, range: 4.2, dmg: 50, waves: 1, waveSpeed: 26 },
    bars: { atk: 2, spd: 5, hp: 2, tec: 3 },
  },
  {
    id: 'inosuke', name: '이노스케', style: '짐승의 호흡', role: '중량형',
    desc: '멧돼지 가면을 쓴 산의 아이. 톱니 날 두 자루를 휘두르는 스스로 만든 호흡, 짐승의 호흡을 쓴다.',
    colors: { kimono: 0x2a2a3a, hakama: 0x2a2a3a, haori: 0x6a5a48, scarf: 0x6a5a48, hair: 0x1a1a2a, obi: 0x6a5a3a, glow: 0xff9040, eye: 0x30c0a0, pattern: 0x8a7a5a },
    look: { boarMask: true, bladeScale: 1.35, twinBlades: true, serrated: true, bareChest: true, furPelt: true, bangs: [0.3, 0.3, 0.3, 0.3, 0.3] },
    stats: { hp: 150, speed: 5.8, dmg: 1.3, gauge: 0.9, dashCooldown: 0.8 },
    moves: { dive: '짐승의 호흡 · 급강하 엄니', l3: '짐승의 호흡 삼의 엄니 · 물어뜯기', rush: '짐승의 호흡 일의 엄니 · 꿰뚫기', heavy: '짐승의 호흡 오의 엄니 · 미친 베기', flurry: '짐승의 호흡 이의 엄니 · 가르기', sweep: '짐승의 호흡 사의 엄니 · 잘게 찢기', wave: '짐승의 호흡 육의 엄니 · 난잡 물어뜯기', special: '짐승의 호흡 칠의 형 · 공간 식각' },
    attackTheme: 'quake',
    special: { name: '짐승의 호흡 칠의 형 · 공간 식각', theme: 'quake', c1: 0xffb060, c2: 0x8a6a40, c3: 0xff5030, range: 5.2, dmg: 70, waves: 1, waveSpeed: 12 },
    bars: { atk: 5, spd: 2, hp: 5, tec: 2 },
  },
];

// 동료(주·대원) — 플레이 불가, AI 동료로만 등장
export const ALLIES = [
  { id: 'giyu', name: '기유', style: '물의 주', colors: { kimono: 0x2a2a3a, hakama: 0x1a1a24, haori: 0x6a2a2a, scarf: 0xf1e9d6, hair: 0x14141c, obi: 0xf0e6d2, glow: 0x40a0ff, eye: 0x2a4a8a, pattern: 0xc8a840 }, look: { pattern: 'halfcheck', bangs: [0.28, 0.2, 0.3, 0.2, 0.28], browTilt: 0.05 }, stats: { hp: 190, speed: 6.6, dmg: 1.5, gauge: 1, dashCooldown: 0.6 }, special: { theme: 'wave', c1: 0x6fb6ff, c2: 0xffffff, c3: 0x8fd0ff } },
  { id: 'rengoku', name: '렌고쿠', style: '불꽃의 주', colors: { kimono: 0x2a2a3a, hakama: 0x1a1a24, haori: 0xf0d060, scarf: 0xf1e9d6, hair: 0xf0c040, obi: 0xf0e6d2, glow: 0xff5020, eye: 0xd0a020, pattern: 0xff5020 }, look: { pattern: 'flames', spikyHair: true, bangs: [0.2, 0.3, 0.2, 0.3, 0.2], browTilt: 0.3 }, stats: { hp: 210, speed: 6.4, dmg: 1.7, gauge: 1, dashCooldown: 0.6 }, special: { theme: 'flame', c1: 0xff6a20, c2: 0xffd050, c3: 0xff2a10 } },
  { id: 'tengen', name: '텐겐', style: '소리의 주', colors: { kimono: 0x2a2a3a, hakama: 0x1a1a24, haori: 0x4a3a5a, scarf: 0xf1e9d6, hair: 0xf0f0f0, obi: 0xf0e6d2, glow: 0xffb0ff, eye: 0xc04060, pattern: 0xd0a0ff }, look: { pattern: 'diamonds', headband: true, bladeScale: 1.3, bangs: [0.2, 0.2, 0.2, 0.2, 0.2] }, stats: { hp: 200, speed: 6.8, dmg: 1.6, gauge: 1, dashCooldown: 0.5 }, special: { theme: 'quake', c1: 0xffb0ff, c2: 0xffffff, c3: 0xd080ff } },
  { id: 'mitsuri', name: '미츠리', style: '사랑의 주', colors: { kimono: 0x2a2a3a, hakama: 0x1a1a24, haori: 0xf8f0f0, scarf: 0x9ad8c0, hair: 0xff90b0, obi: 0xf0e6d2, glow: 0xff80c0, eye: 0x40a080, pattern: 0xff80c0 }, look: { pattern: 'waves', braid: true, bangs: [0.3, 0.24, 0.2, 0.24, 0.3] }, stats: { hp: 180, speed: 7.0, dmg: 1.5, gauge: 1, dashCooldown: 0.5 }, special: { theme: 'wind', c1: 0xff9ad0, c2: 0xffffff, c3: 0xff60a0 } },
  { id: 'sanemi', name: '사네미', style: '바람의 주', colors: { kimono: 0x2a2a3a, hakama: 0x1a1a24, haori: 0xf0f0f0, scarf: 0xf1e9d6, hair: 0xf0f0f0, obi: 0xf0e6d2, glow: 0x9affc8, eye: 0x7a4a9a, pattern: 0x1a1a1a }, look: { pattern: 'stripes', spikyHair: true, bangs: [0.28, 0.2, 0.3, 0.2, 0.28], browTilt: 0.5 }, stats: { hp: 200, speed: 6.9, dmg: 1.7, gauge: 1, dashCooldown: 0.5 }, special: { theme: 'wind', c1: 0x9affc8, c2: 0xffffff, c3: 0x60d090 } },
];
export const getAlly = (id) => ALLIES.find((a) => a.id === id) || CHARACTERS.find((c) => c.id === id) || null;

// ---------- 스킬 트리 (3계열 × 3단계) ----------
export const SKILL_BRANCHES = [
  { id: 'atk', name: '호흡', desc: '호흡법을 갈고닦아 베는 힘을 키운다' },
  { id: 'def', name: '전집중 상중', desc: '항상 전집중 호흡을 유지해 오래 버틴다' },
  { id: 'tec', name: '흔적 · 붉은 칼날', desc: '흔적을 발현하고 투명한 세계에 닿는다' },
];
export const SKILLS = [
  { id: 'atk1', branch: 'atk', tier: 1, name: '호흡 숙련', desc: '모든 공격력 +15%', req: null },
  { id: 'atk2', branch: 'atk', tier: 2, name: '형(型)의 연계', desc: '연타 8 이상일 때 공격력 +25%', req: 'atk1' },
  { id: 'atk3', branch: 'atk', tier: 3, name: '흔적 발현 · 공격', desc: '강공격 범위 +40%, 넉백·경직 증가', req: 'atk2' },
  { id: 'def1', branch: 'def', tier: 1, name: '전집중 · 상중', desc: '최대 체력 +30', req: null },
  { id: 'def2', branch: 'def', tier: 2, name: '전집중 · 상중 · 심', desc: '대시 재사용 40% 단축, 대시 무적 연장', req: 'def1' },
  { id: 'def3', branch: 'def', tier: 3, name: '흔적 발현 · 신체', desc: '초당 체력 0.8 회복', req: 'def2' },
  { id: 'tec1', branch: 'tec', tier: 1, name: '투명한 세계', desc: '기술 게이지 충전 +50%', req: null },
  { id: 'tec2', branch: 'tec', tier: 2, name: '붉은 칼날', desc: '오의 피해 +50%, 검기 파동 1발 추가', req: 'tec1' },
  { id: 'tec3', branch: 'tec', tier: 3, name: '히노카미 카구라 · 연무', desc: '오의 발동 시 체력 25 회복, 주변 적 경직', req: 'tec2' },
];
export const getSkill = (id) => SKILLS.find((s) => s.id === id);

// ---------- 진행(경험치·레벨·포인트) — 캐릭터별 로컬 저장 ----------
export const XP_REWARD = { melee: 12, ranged: 15, boss: 220, wave: 30, night: 80 };
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
  clearChapter(n, joins = [], leaves = []) {
    this.cleared = Math.max(this.cleared, n);
    this.chapter = Math.min(n + 1, 8);
    for (const a of joins) if (a && !this.allies.includes(a)) this.allies.push(a);
    this.allies = this.allies.filter((a) => !leaves.includes(a));
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
