// maps.js — 장별 전용 맵: 경계 모양, 구조물, 관심 지점(미니맵 표시), 세계 지도 좌표
// 구조물 종류: wall(벽) box(상자) pillar(기둥) torii(도리이) lantern(석등) hut(사당) pond(연못) dais(단) throne(옥좌) tower(탑) stairs(계단) plaza(광장)

const wall = (x, z, w, d, rot = 0, h = 2.4, color = 0x555a62) => ({ kind: 'wall', x, z, w, d, rot, h, color });
const lantern = (x, z) => ({ kind: 'lantern', x, z });
const torii = (x, z, scale = 1, rot = 0) => ({ kind: 'torii', x, z, scale, rot });
const pillar = (x, z, h = 9, r = 0.8, color = 0x2a1a1a) => ({ kind: 'pillar', x, z, h, r, color });
const rock = (x, z, s = 1) => ({ kind: 'rock', x, z, s });

const building = (x, z, w, d, h, color = 0x3a2a24, roof = 0x1a1416) => ({ kind: 'hut', x, z, w, d, h, color, roof });
const ringLanterns = (n, r, off = 0) => [...Array(n)].map((_, i) => lantern(Math.cos((i / n) * Math.PI * 2 + off) * r, Math.sin((i / n) * Math.PI * 2 + off) * r));

export const MAPS = {
  // 1장 후지카사네 산: 원형 공터, 등나무 꽃(도리이 자리엔 등나무 시렁), 바위
  wisteria: {
    bounds: { type: 'circle', r: 24 }, plaza: { r: 7.5 }, stonePath: true,
    structures: [torii(0, -15), ...ringLanterns(6, 11.5, Math.PI / 6), rock(14, 8, 1.2), rock(-16, 4, 1.0), rock(9, -18, 0.9), rock(-12, -14, 1.3), rock(18, -6, 0.8), rock(-19, -8, 1.1), rock(5, 19, 0.9), rock(-8, 17, 1.0)],
    poi: [{ x: 0, z: -15, icon: 'torii', name: '등나무 시렁' }, { x: 0, z: 17, icon: 'path', name: '산길' }],
    playerStart: { x: 0, z: 6 }, bossStart: { x: 0, z: -12 },
  },
  // 2장 아사쿠사: 사각 거리, 양옆 목조 건물, 가운데 큰길
  town: {
    bounds: { type: 'rect', w: 30, h: 50 },
    structures: [
      ...[-20, -10, 0, 10, 20].flatMap((z) => [building(-12, z, 5, 8, 4.5, 0x4a3a2a, 0x2a2020), building(12, z, 5, 8, 4.5, 0x3a2e28, 0x201a18)]),
      ...[-18, -6, 6, 18].flatMap((z) => [lantern(-8, z), lantern(8, z)]),
      { kind: 'box', x: 0, z: -22, w: 6, d: 2, h: 1.2, color: 0x5a4a3a }, { kind: 'brazier', x: -4, z: 22 }, { kind: 'brazier', x: 4, z: 22 },
    ],
    poi: [{ x: 0, z: -22, icon: 'gate', name: '카미나리몬' }, { x: 0, z: 22, icon: 'path', name: '큰길' }],
    playerStart: { x: 0, z: 18 }, bossStart: { x: 0, z: -14 },
  },
  // 3장 나타구모 산: 넓은 숲, 거미줄(링), 바위
  spider: {
    bounds: { type: 'circle', r: 27 },
    structures: [
      { kind: 'ring', x: 0, z: 0, r: 8, color: 0xc0e0e0 }, { kind: 'ring', x: 12, z: -10, r: 4, color: 0xc0e0e0 }, { kind: 'ring', x: -12, z: 8, r: 4, color: 0xc0e0e0 },
      ...ringLanterns(5, 16, 0.3), rock(18, 6, 1.4), rock(-16, -16, 1.2), rock(8, 18, 1.0), rock(-6, -22, 1.1), rock(22, -10, 0.9), rock(-20, 10, 1.2),
      { kind: 'hut', x: 0, z: -20, w: 6, d: 5, h: 3, color: 0x3a3a3a, roof: 0x2a2a2a },
    ],
    poi: [{ x: 0, z: -20, icon: 'shrine', name: '거미의 집' }, { x: 0, z: 0, icon: 'hall', name: '거미줄' }],
    playerStart: { x: 0, z: 16 }, bossStart: { x: 0, z: -12 },
  },
  // 4장 무한열차: 길고 좁은 객차, 양옆 좌석, 중앙 통로
  train: {
    bounds: { type: 'rect', w: 12, h: 64 },
    structures: [
      wall(-6.4, 0, 0.8, 64, 0, 3.2, 0x3a2a1e), wall(6.4, 0, 0.8, 64, 0, 3.2, 0x3a2a1e),
      ...[-26, -20, -14, -8, -2, 4, 10, 16, 22].flatMap((z) => [{ kind: 'box', x: -4.2, z, w: 2.6, d: 2.2, h: 1.1, color: 0x6a3a2a }, { kind: 'box', x: 4.2, z, w: 2.6, d: 2.2, h: 1.1, color: 0x6a3a2a }]),
      ...[-24, -12, 0, 12, 24].flatMap((z) => [lantern(-5.2, z), lantern(5.2, z)]),
      wall(0, -31.5, 12, 1, 0, 3.2, 0x2a1e18), { kind: 'box', x: 0, z: 30, w: 6, d: 1.5, h: 2, color: 0x2a1e18 },
    ],
    poi: [{ x: 0, z: -30, icon: 'gate', name: '기관차' }, { x: 0, z: 30, icon: 'path', name: '뒤칸' }],
    playerStart: { x: 0, z: 26 }, bossStart: { x: 0, z: -22 },
  },
  // 5장 유곽: 사각 거리, 붉은 건물, 다리
  district: {
    bounds: { type: 'rect', w: 36, h: 44 },
    structures: [
      ...[-16, -4, 8, 18].flatMap((z) => [building(-15, z, 6, 9, 6, 0x5a2a2a, 0x2a1416), building(15, z, 6, 9, 6, 0x4a2020, 0x1a1012)]),
      ...[-18, -9, 0, 9, 18].flatMap((z) => [lantern(-10, z), lantern(10, z)]),
      { kind: 'box', x: 0, z: 0, w: 8, d: 2, h: 0.6, color: 0x6a4a3a }, { kind: 'brazier', x: -5, z: -19 }, { kind: 'brazier', x: 5, z: -19 },
      { kind: 'gate', x: 0, z: 21.5 },
    ],
    poi: [{ x: 0, z: 21, icon: 'gate', name: '대문' }, { x: 0, z: 0, icon: 'hall', name: '다리' }],
    playerStart: { x: 0, z: 16 }, bossStart: { x: 0, z: -12 },
  },
  // 6장 도공 마을: 원형 마을, 오두막 여러 채, 우물
  village: {
    bounds: { type: 'circle', r: 26 }, plaza: { r: 6 },
    structures: [
      building(-14, -10, 6, 5, 3.4, 0x5a4a3a, 0x8a7a5a), building(13, -12, 6, 5, 3.4, 0x5a4a3a, 0x8a7a5a), building(-16, 8, 6, 5, 3.4, 0x5a4a3a, 0x8a7a5a), building(15, 9, 6, 5, 3.4, 0x5a4a3a, 0x8a7a5a), building(0, -20, 8, 6, 4, 0x6a4a3a, 0x3a2a2a),
      ...ringLanterns(6, 11, Math.PI / 6), { kind: 'box', x: 0, z: 10, w: 1.6, d: 1.6, h: 1.0, color: 0x6a6a70 }, rock(20, -2, 1.1), rock(-21, -2, 1.2), rock(6, 20, 0.9),
    ],
    poi: [{ x: 0, z: -20, icon: 'shrine', name: '대장간' }, { x: 0, z: 10, icon: 'pond', name: '우물' }],
    playerStart: { x: 0, z: 14 }, bossStart: { x: 0, z: -10 },
  },
  // 7장 무한성: 십자 회랑 + 중앙 홀
  labyrinth: {
    bounds: { type: 'cross', w: 14, len: 58, hall: 13 },
    structures: [
      ...[-1, 1].flatMap((s) => [wall(s * 7.6, -18, 1.2, 22, 0, 6, 0x1e1428), wall(s * 7.6, 18, 1.2, 22, 0, 6, 0x1e1428), wall(-18, s * 7.6, 22, 1.2, 0, 6, 0x1e1428), wall(18, s * 7.6, 22, 1.2, 0, 6, 0x1e1428)]),
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => pillar(sx * 10.5, sz * 10.5, 10, 1.0, 0x2a1a3a))),
      pillar(0, -28, 8, 0.9, 0x2a1a3a), pillar(0, 28, 8, 0.9, 0x2a1a3a), pillar(-28, 0, 8, 0.9, 0x2a1a3a), pillar(28, 0, 8, 0.9, 0x2a1a3a),
      ...[-22, -14, 14, 22].flatMap((v) => [lantern(5.5, v), lantern(-5.5, v), lantern(v, 5.5), lantern(v, -5.5)]),
      { kind: 'ring', x: 0, z: 0, r: 6, color: 0x6a30a0 },
    ],
    poi: [{ x: 0, z: -26, icon: 'throne', name: '깊은 곳' }, { x: 0, z: 0, icon: 'hall', name: '중앙 홀' }],
    playerStart: { x: 0, z: 24 }, bossStart: { x: 0, z: -18 },
  },
  // 최종장 지상 폐허: 넓은 사각, 무너진 벽, 화로
  ruins: {
    bounds: { type: 'rect', w: 44, h: 44 },
    structures: [
      wall(-16, -18, 10, 1.4, 0.2, 3, 0x2a1a1a), wall(14, -19, 12, 1.4, -0.15, 2.5, 0x2a1a1a), wall(-19, 10, 1.4, 12, 0.1, 3, 0x2a1a1a), wall(18, 12, 1.4, 10, 0, 2, 0x2a1a1a),
      { kind: 'tower', x: -19, z: -19 }, { kind: 'tower', x: 19, z: 19 },
      ...[-12, 0, 12].flatMap((x) => [pillar(x, -8, 7, 0.8), pillar(x, 8, 7, 0.8)]),
      { kind: 'brazier', x: -14, z: 0 }, { kind: 'brazier', x: 14, z: 0 }, { kind: 'brazier', x: 0, z: -16 }, { kind: 'brazier', x: 0, z: 16 },
      rock(-8, -14, 1.4), rock(9, 15, 1.2), rock(16, -5, 1.0),
    ],
    poi: [{ x: 0, z: 0, icon: 'hall', name: '결전장' }],
    playerStart: { x: 0, z: 14 }, bossStart: { x: 0, z: -10 },
  },
};

// 경계 판정
export function inBounds(b, x, z, margin = 0) {
  if (b.type === 'circle') return Math.hypot(x, z) <= b.r - margin;
  if (b.type === 'rect') return Math.abs(x) <= b.w / 2 - margin && Math.abs(z) <= b.h / 2 - margin;
  if (b.type === 'cross') {
    const half = b.w / 2 - margin, L = b.len / 2 - margin, H = b.hall - margin;
    return (Math.abs(x) <= half && Math.abs(z) <= L) || (Math.abs(z) <= half && Math.abs(x) <= L) || (Math.abs(x) <= H && Math.abs(z) <= H);
  }
  return true;
}
// 경계 안으로 되밀기
export function clampToBounds(b, pos, radius) {
  if (inBounds(b, pos.x, pos.z, radius)) return;
  if (b.type === 'circle') { const d = Math.hypot(pos.x, pos.z); const k = (b.r - radius) / d; pos.x *= k; pos.z *= k; return; }
  if (b.type === 'rect') { pos.x = Math.max(-b.w / 2 + radius, Math.min(b.w / 2 - radius, pos.x)); pos.z = Math.max(-b.h / 2 + radius, Math.min(b.h / 2 - radius, pos.z)); return; }
  if (b.type === 'cross') {
    // 가장 가까운 허용 영역(세로 회랑 / 가로 회랑 / 홀)으로 투영
    const cands = [
      { x: Math.max(-b.w / 2 + radius, Math.min(b.w / 2 - radius, pos.x)), z: Math.max(-b.len / 2 + radius, Math.min(b.len / 2 - radius, pos.z)) },
      { x: Math.max(-b.len / 2 + radius, Math.min(b.len / 2 - radius, pos.x)), z: Math.max(-b.w / 2 + radius, Math.min(b.w / 2 - radius, pos.z)) },
      { x: Math.max(-b.hall + radius, Math.min(b.hall - radius, pos.x)), z: Math.max(-b.hall + radius, Math.min(b.hall - radius, pos.z)) },
    ];
    let best = cands[0], bd = Infinity;
    for (const c of cands) { const d = Math.hypot(c.x - pos.x, c.z - pos.z); if (d < bd) { bd = d; best = c; } }
    pos.x = best.x; pos.z = best.z;
  }
}
// 경계 외접 반경 (나무 배치·미니맵 축척용)
export function boundsExtent(b) {
  if (b.type === 'circle') return b.r;
  if (b.type === 'rect') return Math.max(b.w, b.h) / 2;
  return b.len / 2;
}

// 세계 지도: 지역 위치(%) — 새 장을 추가하면 여기에 좌표만 더하면 지도에 붙음
export const WORLD_NODES = [
  { chapter: 1, x: 10, y: 74, icon: '🌸' },
  { chapter: 2, x: 24, y: 56, icon: '🏮' },
  { chapter: 3, x: 36, y: 32, icon: '🕸' },
  { chapter: 4, x: 50, y: 58, icon: '🚂' },
  { chapter: 5, x: 62, y: 34, icon: '🎎' },
  { chapter: 6, x: 74, y: 60, icon: '⚒' },
  { chapter: 7, x: 84, y: 36, icon: '🌀' },
  { chapter: 8, x: 92, y: 14, icon: '🌅' },
];
