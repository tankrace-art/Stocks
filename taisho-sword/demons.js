// demons.js — 혈귀(보스) 외형 정의: 사람형 도깨비 모델 옵션 (개인 플레이용 팬 디자인)
// colors: kimono/hakama/haori/scarf/hair/obi/glow/eye/pattern, skin: 피부색
// look: pattern, bangs, longSide, spikyHair, ponytail, bun, headband, kasa, cap, noSword, claws, horns, extraArms, boarMask, face(문양)
export const DEMON_DESIGNS = {
  tede: { // 손 도깨비: 초록 피부, 무수한 팔
    colors: { kimono: 0x3a4a2a, hakama: 0x2a3020, haori: 0x2a3020, scarf: 0x3a4a2a, hair: 0x1a1a10, obi: 0x1a1a10, glow: 0xffe040, eye: 0xffe040, pattern: 0x2a3020 },
    skin: 0x7a9a5a, look: { noSword: true, claws: true, extraArms: 6, bangs: [0.1, 0.1, 0.1, 0.1, 0.1], face: 'rage', browTilt: 0.6 },
  },
  swamp: { // 늪 도깨비: 잿빛 피부, 뿔
    colors: { kimono: 0x2a3a4a, hakama: 0x1a2a2a, haori: 0x1e2e38, scarf: 0x2a3a4a, hair: 0x101820, obi: 0x101820, glow: 0xff60a0, eye: 0xff60a0, pattern: 0x1e2e38 },
    skin: 0x8a9aa0, look: { noSword: true, claws: true, horns: true, bangs: [0.3, 0.2, 0.3, 0.2, 0.3], face: 'slit' },
  },
  rui: { // 루이: 흰 머리, 흰 피부, 붉은 눈, 붉은 점무늬 흰 옷
    colors: { kimono: 0xf4f4f8, hakama: 0xe8e8ee, haori: 0xf4f4f8, scarf: 0xf4f4f8, hair: 0xf0f0f4, obi: 0x3a2a4a, glow: 0xff3030, eye: 0xff3030, pattern: 0xd04040 },
    skin: 0xf6f0f2, look: { noSword: true, claws: true, pattern: 'dots', bangs: [0.28, 0.32, 0.28, 0.32, 0.28], face: 'redlines', browTilt: -0.1 },
  },
  enmu: { // 엔무: 남보라 머리, 창백한 피부, 웃는 눈(손바닥 눈)
    colors: { kimono: 0x2a2440, hakama: 0x1a1830, haori: 0x4a3a6a, scarf: 0x2a2440, hair: 0x6a5a9a, obi: 0x1a1830, glow: 0x60c0ff, eye: 0x60c0ff, pattern: 0x8a7ab0 },
    skin: 0xe8dcea, look: { noSword: true, claws: true, longSide: true, bangs: [0.34, 0.24, 0.34, 0.24, 0.34], face: 'smile' },
  },
  akaza1: { // 아카자: 분홍 머리, 푸른 문신, 상의 탈의(피부색 몸)
    colors: { kimono: 0xffd0b0, hakama: 0x2a4a8a, haori: 0xffd0b0, scarf: 0xffd0b0, hair: 0xff90b0, obi: 0x1a1a2a, glow: 0xffd040, eye: 0xffd040, pattern: 0x3060c0 },
    skin: 0xffd0b0, look: { noSword: true, claws: false, spikyHair: true, pattern: 'lines', bangs: [0.2, 0.3, 0.2, 0.3, 0.2], face: 'tattoo', browTilt: 0.45 },
  },
  daki: { // 다키: 검은 머리, 흰 피부, 분홍 오비, 꽃 무늬
    colors: { kimono: 0xf8e0e8, hakama: 0xf0c0d0, haori: 0xf8f0f4, scarf: 0xf8e0e8, hair: 0x101018, obi: 0xd04080, glow: 0xff5090, eye: 0xff5090, pattern: 0xff80b0 },
    skin: 0xfaf0f0, look: { noSword: true, claws: true, ponytail: true, pattern: 'flowers', bangs: [0.3, 0.26, 0.3, 0.26, 0.3], face: 'makeup', browTilt: 0.2 },
  },
  gyutaro: { // 규타로: 초록빛 피부, 검은 반점, 낫
    colors: { kimono: 0x3a4a3a, hakama: 0x2a2a2a, haori: 0x3a4a3a, scarf: 0x3a4a3a, hair: 0x1a2a1a, obi: 0x1a1a1a, glow: 0xa0ff40, eye: 0xa0ff40, pattern: 0x1a1a1a },
    skin: 0x8aa08a, look: { noSword: true, claws: true, scythes: true, bangs: [0.34, 0.2, 0.34, 0.2, 0.34], face: 'patches', browTilt: 0.5 },
  },
  gyokko: { // 교쿠코: 푸른 피부, 항아리
    colors: { kimono: 0x5a8ab0, hakama: 0x3a5a80, haori: 0x5a8ab0, scarf: 0x5a8ab0, hair: 0x2a3a6a, obi: 0x2a3a6a, glow: 0xff8040, eye: 0xff8040, pattern: 0x8ab0d0 },
    skin: 0x8ab0d0, look: { noSword: true, claws: true, extraArms: 2, bun: true, bangs: [0.1, 0.1, 0.1, 0.1, 0.1], face: 'weird' },
  },
  hantengu: { // 한텐구: 노인, 혹, 회색
    colors: { kimono: 0x3a2a4a, hakama: 0x2a1a3a, haori: 0x3a2a4a, scarf: 0x3a2a4a, hair: 0x9a9aa0, obi: 0x6a2a2a, glow: 0xffd040, eye: 0xffd040, pattern: 0x6a5a7a },
    skin: 0x9a8a8a, look: { noSword: true, claws: true, horns: true, bangs: [0.1, 0.1, 0.1, 0.1, 0.1], face: 'sad', browTilt: -0.4 },
  },
  doma: { // 도우마: 흰 머리(무지개 끝), 무지개 눈, 화려한 하오리
    colors: { kimono: 0xf8f0ff, hakama: 0xe0d0f0, haori: 0xd0a040, scarf: 0xf8f0ff, hair: 0xf0e8e0, obi: 0x8a4a4a, glow: 0xffa0c0, eye: 0xff80c0, pattern: 0xff4040 },
    skin: 0xfaf4f4, look: { noSword: true, claws: true, longSide: true, pattern: 'diamonds', bangs: [0.3, 0.24, 0.3, 0.24, 0.3], face: 'rainbow', horns: true },
  },
  akaza2: { // 아카자 (무한성)
    colors: { kimono: 0xffd0b0, hakama: 0x2a4a8a, haori: 0xffd0b0, scarf: 0xffd0b0, hair: 0xff90b0, obi: 0x1a1a2a, glow: 0xffd040, eye: 0xffd040, pattern: 0x3060c0 },
    skin: 0xffd0b0, look: { noSword: true, spikyHair: true, pattern: 'lines', bangs: [0.2, 0.3, 0.2, 0.3, 0.2], face: 'tattoo', browTilt: 0.45 },
  },
  kokushibo: { // 코쿠시보: 긴 검은 머리, 여섯 눈, 붉은 무늬, 검
    colors: { kimono: 0x3a2a3a, hakama: 0x2a1a2a, haori: 0x2a1a2a, scarf: 0x3a2a3a, hair: 0x101010, obi: 0x6a2a2a, glow: 0xff4040, eye: 0xff4040, pattern: 0xc03030 },
    skin: 0xe8d8d0, look: { claws: false, ponytail: true, longSide: true, bladeScale: 1.2, pattern: 'flames', bangs: [0.22, 0.3, 0.22, 0.3, 0.22], face: 'sixeyes', browTilt: 0.3 },
  },
  muzan: { // 무잔: 검은 머리, 흰 피부, 붉은 눈(세로 동공), 검은 양복(다이쇼 신사)
    colors: { kimono: 0x14141c, hakama: 0x14141c, haori: 0x1a1a24, scarf: 0xf8f8f8, hair: 0x0a0a10, obi: 0x2a2a34, glow: 0xff2040, eye: 0xff2040, pattern: 0x3a3a48 },
    skin: 0xf6f0f0, look: { noSword: true, claws: true, cap: true, pattern: 'stripes', bangs: [0.26, 0.22, 0.26, 0.22, 0.26], face: 'slit', browTilt: 0.3 },
  },
};
export const getDemonDesign = (id) => DEMON_DESIGNS[id] || null;
