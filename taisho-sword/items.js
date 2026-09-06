// items.js — 아이템: 회복약, 등급(일반/레어/히든/유니크)별 장비(칼·갑옷·부적) 생성과 능력치 합산
import { rand, pick } from './util.js';

export const RARITIES = {
  common: { id: 'common', name: '일반', color: '#d9d9d9', hex: 0xd9d9d9, mult: 1.0, affixes: 1, weight: 60 },
  rare:   { id: 'rare',   name: '레어', color: '#6ab0ff', hex: 0x6ab0ff, mult: 1.7, affixes: 2, weight: 28 },
  hidden: { id: 'hidden', name: '히든', color: '#c88cff', hex: 0xc88cff, mult: 2.5, affixes: 3, weight: 10 },
  unique: { id: 'unique', name: '유니크', color: '#ffb547', hex: 0xffb547, mult: 3.4, affixes: 4, weight: 2 },
};
export const SLOTS = { weapon: '칼', armor: '갑옷', charm: '부적' };

// 능력치 정의: 표시 이름, 기본 수치(일반 등급 1개 접사 기준), 표시 형식
export const STATS = {
  dmg:     { name: '공격력',        base: 0.06, fmt: (v) => `+${Math.round(v * 100)}%` },
  hp:      { name: '최대 체력',      base: 12,   fmt: (v) => `+${Math.round(v)}` },
  reduce:  { name: '피해 감소',      base: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
  gauge:   { name: '게이지 충전',    base: 0.10, fmt: (v) => `+${Math.round(v * 100)}%` },
  speed:   { name: '이동 속도',      base: 0.04, fmt: (v) => `+${Math.round(v * 100)}%` },
  dash:    { name: '대시 재사용',    base: 0.08, fmt: (v) => `-${Math.round(v * 100)}%` },
  regen:   { name: '초당 회복',      base: 0.3,  fmt: (v) => `+${v.toFixed(1)}` },
  special: { name: '비검 피해',      base: 0.10, fmt: (v) => `+${Math.round(v * 100)}%` },
};
const SLOT_AFFIX = {
  weapon: { primary: 'dmg', extra: ['gauge', 'special', 'speed', 'dmg'] },
  armor:  { primary: 'hp', extra: ['reduce', 'regen', 'dash', 'hp'] },
  charm:  { primary: 'gauge', extra: ['speed', 'dash', 'special', 'regen'] },
};
const BASE_NAMES = {
  weapon: ['장검', '태도', '타도', '대검', '소태도'],
  armor: ['갑옷', '하오리', '흉갑', '전투복', '쇄자갑'],
  charm: ['부적', '염주', '방울', '인장', '수호패'],
};
const PREFIX = {
  common: ['낡은', '평범한', '투박한', '수수한'],
  rare: ['달빛의', '안개의', '청풍의', '서리의', '홍엽의'],
  hidden: ['요괴 사냥꾼의', '흑죽림의', '귀화를 삼킨', '백야의', '천둥의'],
};
const UNIQUE_NAMES = {
  weapon: ['참귀도(斬鬼刀)', '월하무쌍', '새벽을 베는 칼'],
  armor: ['불멸의 하오리', '흑귀의 갑주', '대나무 숲의 수호갑'],
  charm: ['새벽의 인장', '천년 염주', '달의 방울'],
};

let ITEM_SEQ = Date.now() % 100000;

export function rollRarity(boss = false) {
  const table = boss
    ? [['rare', 50], ['hidden', 35], ['unique', 15]]
    : Object.values(RARITIES).map((r) => [r.id, r.weight]);
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

// 장착 장비 능력치 합산
export function sumEquipment(equipped) {
  const out = {};
  for (const it of Object.values(equipped)) {
    if (!it) continue;
    for (const [k, v] of Object.entries(it.stats)) out[k] = (out[k] || 0) + v;
  }
  return out;
}

export const POTION_HEAL = 45;
export const POTION_MAX = 5;
export const BAG_MAX = 24;
