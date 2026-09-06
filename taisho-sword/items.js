// items.js — 아이템: 회복약, 금화, 등급(일반/레어/히든/유니크)별 장비 7부위 생성, 아이콘, 능력치 합산, 상점 가격
import { rand, pick } from './util.js';

export const RARITIES = {
  common: { id: 'common', name: '일반', color: '#d9d9d9', hex: 0xd9d9d9, mult: 1.0, affixes: 1, weight: 60, price: 60, sell: 12 },
  rare:   { id: 'rare',   name: '레어', color: '#6ab0ff', hex: 0x6ab0ff, mult: 1.7, affixes: 2, weight: 28, price: 220, sell: 45 },
  hidden: { id: 'hidden', name: '히든', color: '#c88cff', hex: 0xc88cff, mult: 2.5, affixes: 3, weight: 10, price: 650, sell: 130 },
  unique: { id: 'unique', name: '유니크', color: '#ffb547', hex: 0xffb547, mult: 3.4, affixes: 4, weight: 2, price: 1800, sell: 360 },
};
// 장비 부위 (디아블로식)
export const SLOTS = { weapon: '칼', head: '머리', chest: '가슴', belt: '허리', arms: '팔', legs: '다리', charm: '부적' };

export const STATS = {
  dmg:     { name: '공격력',     base: 0.06, fmt: (v) => `+${Math.round(v * 100)}%` },
  hp:      { name: '최대 체력',   base: 12,   fmt: (v) => `+${Math.round(v)}` },
  reduce:  { name: '피해 감소',   base: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
  gauge:   { name: '게이지 충전', base: 0.10, fmt: (v) => `+${Math.round(v * 100)}%` },
  speed:   { name: '이동 속도',   base: 0.04, fmt: (v) => `+${Math.round(v * 100)}%` },
  dash:    { name: '대시 재사용', base: 0.08, fmt: (v) => `-${Math.round(v * 100)}%` },
  regen:   { name: '초당 회복',   base: 0.3,  fmt: (v) => `+${v.toFixed(1)}` },
  special: { name: '비검 피해',   base: 0.10, fmt: (v) => `+${Math.round(v * 100)}%` },
};
const SLOT_AFFIX = {
  weapon: { primary: 'dmg', extra: ['gauge', 'special', 'dmg', 'speed'] },
  head:   { primary: 'gauge', extra: ['reduce', 'special', 'hp'] },
  chest:  { primary: 'hp', extra: ['reduce', 'regen', 'hp'] },
  belt:   { primary: 'regen', extra: ['hp', 'dash', 'reduce'] },
  arms:   { primary: 'dmg', extra: ['gauge', 'special', 'reduce'] },
  legs:   { primary: 'speed', extra: ['dash', 'hp', 'reduce'] },
  charm:  { primary: 'gauge', extra: ['speed', 'dash', 'special', 'regen', 'dmg'] },
};
const BASE_NAMES = {
  weapon: ['장검', '태도', '타도', '대검', '소태도'],
  head: ['투구', '두건', '삿갓', '이마 보호대', '학생모'],
  chest: ['갑옷', '흉갑', '하오리', '쇄자갑', '전투복'],
  belt: ['오비', '허리띠', '요대', '전대'],
  arms: ['완갑', '토시', '팔 보호대', '장갑'],
  legs: ['각반', '정강이 보호대', '하카마', '짚신'],
  charm: ['부적', '염주', '방울', '인장', '수호패'],
};
const PREFIX = {
  common: ['낡은', '평범한', '투박한', '수수한'],
  rare: ['달빛의', '안개의', '청풍의', '서리의', '홍엽의'],
  hidden: ['요괴 사냥꾼의', '흑죽림의', '귀화를 삼킨', '백야의', '천둥의'],
};
const UNIQUE_NAMES = {
  weapon: ['참귀도(斬鬼刀)', '월하무쌍', '새벽을 베는 칼'],
  head: ['귀왕의 뿔투구', '달빛 삿갓', '불굴의 두건'],
  chest: ['불멸의 하오리', '흑귀의 갑주', '대나무 숲의 수호갑'],
  belt: ['천년 요대', '새벽의 오비'],
  arms: ['뇌명의 완갑', '흑죽 토시'],
  legs: ['질풍 각반', '구름 짚신'],
  charm: ['새벽의 인장', '천년 염주', '달의 방울'],
};

// 부위별 아이콘 (SVG, currentColor)
export const ICONS = {
  weapon: '<svg viewBox="0 0 32 32"><path d="M6 26 L22 10 M20 8 l4 4 M4 24 l4 4 M8 22 l2 2" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M22 10 L27 5" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
  head: '<svg viewBox="0 0 32 32"><path d="M7 20 a9 9 0 0 1 18 0 v4 H7 z" fill="currentColor" opacity="0.85"/><rect x="5" y="23" width="22" height="3" rx="1" fill="currentColor"/><path d="M16 4 v6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  chest: '<svg viewBox="0 0 32 32"><path d="M9 6 l4 3 h6 l4 -3 4 4 -3 5 v11 H8 V15 L5 10 z" fill="currentColor" opacity="0.85"/><path d="M16 9 v17" stroke="#0008" stroke-width="1.5"/></svg>',
  belt: '<svg viewBox="0 0 32 32"><rect x="4" y="12" width="24" height="8" rx="2" fill="currentColor" opacity="0.85"/><rect x="13" y="10" width="6" height="12" rx="1" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  arms: '<svg viewBox="0 0 32 32"><path d="M8 6 h8 v9 l4 3 v9 H8 z" fill="currentColor" opacity="0.85"/><path d="M11 9 v12 M14 9 v10" stroke="#0008" stroke-width="1.3"/></svg>',
  legs: '<svg viewBox="0 0 32 32"><path d="M9 4 h14 l-1 12 -2 12 h-8 l-2 -12 z" fill="currentColor" opacity="0.85"/><path d="M16 6 v20" stroke="#0008" stroke-width="1.5"/></svg>',
  charm: '<svg viewBox="0 0 32 32"><path d="M11 3 h10 v18 l-5 8 -5 -8 z" fill="currentColor" opacity="0.85"/><path d="M16 8 v9" stroke="#0008" stroke-width="2"/></svg>',
  potion: '<svg viewBox="0 0 32 32"><path d="M13 3 h6 v6 l5 6 v11 a3 3 0 0 1 -3 3 H11 a3 3 0 0 1 -3 -3 V15 l5 -6 z" fill="currentColor" opacity="0.9"/><rect x="12" y="2" width="8" height="3" fill="#0008"/></svg>',
  gold: '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="11" fill="currentColor" opacity="0.9"/><circle cx="16" cy="16" r="7" fill="none" stroke="#0008" stroke-width="2"/></svg>',
};

let ITEM_SEQ = Date.now() % 100000;

export function rollRarity(boss = false) {
  const table = boss ? [['rare', 50], ['hidden', 35], ['unique', 15]] : Object.values(RARITIES).map((r) => [r.id, r.weight]);
  const total = table.reduce((s, [, w]) => s + w, 0);
  let x = Math.random() * total;
  for (const [id, w] of table) { x -= w; if (x <= 0) return id; }
  return table[table.length - 1][0];
}

export function generateItem(rarityId = 'common', slot = null, level = 1) {
  const rarity = RARITIES[rarityId] || RARITIES.common;
  slot = slot || pick(Object.keys(SLOTS));
  const def = SLOT_AFFIX[slot];
  const lvMul = 1 + (level - 1) * 0.06;
  const stats = {};
  const add = (key, scale) => { stats[key] = (stats[key] || 0) + STATS[key].base * scale * rarity.mult * lvMul * rand(0.85, 1.2); };
  add(def.primary, 1.2);
  const pool = [...def.extra];
  for (let i = 1; i < rarity.affixes; i++) {
    const k = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    add(k, 0.9);
  }
  const name = rarityId === 'unique' ? pick(UNIQUE_NAMES[slot]) : `${pick(PREFIX[rarityId])} ${pick(BASE_NAMES[slot])}`;
  return { id: `it${ITEM_SEQ++}`, slot, rarity: rarityId, name, level, stats };
}

export const itemScore = (it) => Object.entries(it.stats).reduce((s, [k, v]) => s + v / STATS[k].base, 0);
export const sellPrice = (it) => RARITIES[it.rarity].sell + Math.round(itemScore(it) * 3);

export function sumEquipment(equipped) {
  const out = {};
  for (const it of Object.values(equipped)) {
    if (!it) continue;
    for (const [k, v] of Object.entries(it.stats)) out[k] = (out[k] || 0) + v;
  }
  return out;
}

export const POTION_HEAL = 45;
export const POTION_MAX = 6;
export const BAG_MAX = 30;
export const POTION_PRICE = 40;

// 상점 진열 (등급별 무작위 장비 + 회복약)
export function makeShopStock(level = 1) {
  const stock = [];
  const plan = [['common', 3], ['rare', 3], ['hidden', 2], ['unique', 1]];
  for (const [r, n] of plan) for (let i = 0; i < n; i++) stock.push(generateItem(r, null, level));
  return stock;
}
