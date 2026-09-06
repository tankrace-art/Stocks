// scenario.js — 시나리오 5장: 무대 테마, 이야기, 파도 구성, 보스, 동료 합류
// 1 대숲의 밤(첫 요괴) → 2 폐사의 안개(검사단 합류) → 3 설산의 사당(하급 장군) → 4 붉은 달의 성(상급 장군) → 5 무한 미궁성(귀왕)
export const CHAPTERS = [
  {
    id: 1, title: '제1장', name: '대숲의 밤', place: '도쿄 외곽 · 대나무 숲',
    story: [
      '다이쇼 12년. 숯을 팔러 산을 내려갔다 돌아온 밤, 마을은 요괴에게 짓밟혀 있었다.',
      '살아남은 것은 검 한 자루와 분노뿐. 요괴가 사라진 대나무 숲으로 검사는 홀로 들어선다.',
      '요괴는 밤에만 움직이고, 새벽이 오면 재가 되어 흩어진다.',
    ],
    theme: 'bamboo', scale: { hp: 1.0, dmg: 1.0 },
    waves: [
      { melee: 2, ranged: 0, title: '첫 번째 파도', sub: '소귀들이 안개 속에서 기어 나온다' },
      { melee: 2, ranged: 2, title: '두 번째 파도', sub: '귀화가 대나무 사이를 떠돈다' },
      { melee: 3, ranged: 2, title: '세 번째 파도', sub: '숲 전체가 술렁인다' },
      { boss: true, title: '흑귀', sub: '마을을 덮친 요괴가 눈을 뜬다' },
    ],
    boss: { id: 'kurooni', name: '흑귀 — 마을을 덮친 요괴', body: 0x1c1620, loin: 0x7a2a2a, eye: 0xff2010, hp: 480, scale: 2.4, dmg: 16, fireFromPhase: 2, chargeSpeed: 15 },
    clear: [
      '흑귀는 재가 되어 흩어졌다. 숲에 새벽이 왔다.',
      '새벽빛 속에서 한 사람이 다가온다. 요괴를 베는 이들의 조직, 검사단(劍士團)의 검사였다.',
      '"혼자서 흑귀를 벴다고? …함께 가자. 산 너머 폐사에 더 큰 놈이 있다."',
    ],
    joinAlly: 1,
  },
  {
    id: 2, title: '제2장', name: '폐사의 안개', place: '산속 · 버려진 신사',
    story: [
      '검사단의 본부에서 대검사(大劍士)들을 만났다. 요괴의 왕 귀왕과 그를 따르는 여섯 장군의 이야기를 들었다.',
      '첫 임무. 단풍이 핏빛으로 물든 산속 폐사에서 사람들이 사라지고 있다.',
      '동료와 함께 도리이가 늘어선 계단을 오른다. 보랏빛 귀화가 등롱마다 켜져 있다.',
    ],
    theme: 'shrine', scale: { hp: 1.25, dmg: 1.15 },
    waves: [
      { melee: 3, ranged: 1, title: '첫 번째 파도', sub: '낙엽 아래에서 소귀들이 솟는다' },
      { melee: 3, ranged: 3, title: '두 번째 파도', sub: '귀화들이 도리이를 맴돈다' },
      { melee: 4, ranged: 3, title: '세 번째 파도', sub: '신사가 요괴로 가득 찬다' },
      { boss: true, title: '백면귀', sub: '하얀 가면의 요괴가 계단을 내려온다' },
    ],
    boss: { id: 'hakumen', name: '백면귀 — 하급 장군 · 여섯째', body: 0xe8e0d0, loin: 0x6a2a8a, eye: 0xb040ff, hp: 700, scale: 2.2, dmg: 18, fireFromPhase: 1, chargeSpeed: 19 },
    clear: [
      '백면귀의 가면이 깨졌다. 그 안은 텅 비어 있었다. — 하급 장군 중 하나였다.',
      '"장군이 여섯이라 했지. 남은 다섯은 이보다 강하다." 대검사의 말이 무겁게 내려앉는다.',
      '북쪽 설산의 사당에서 또 다른 장군의 기척이 전해진다.',
    ],
  },
  {
    id: 3, title: '제3장', name: '설산의 사당', place: '북쪽 산맥 · 눈 덮인 사당',
    story: [
      '눈보라 속에 얼어붙은 사당. 마을 사람들이 얼음 조각처럼 서 있다.',
      '하급 장군 빙귀(氷鬼)는 숨결만으로 사람을 얼린다. 대검사 한 사람이 이미 이곳에서 쓰러졌다.',
      '눈 위에 남은 발자국을 따라 두 검사는 사당 안으로 들어선다.',
    ],
    theme: 'snow', scale: { hp: 1.45, dmg: 1.3 },
    waves: [
      { melee: 3, ranged: 2, title: '첫 번째 파도', sub: '눈 속에서 소귀들이 일어선다' },
      { melee: 4, ranged: 3, title: '두 번째 파도', sub: '얼어붙은 귀화가 떠돈다' },
      { melee: 4, ranged: 4, title: '세 번째 파도', sub: '사당의 문이 열린다' },
      { boss: true, title: '빙귀', sub: '얼음의 장군이 숨을 내쉰다' },
    ],
    boss: { id: 'hyouki', name: '빙귀 — 하급 장군 · 첫째', body: 0x9ad8ff, loin: 0x2a4a8a, eye: 0x60e0ff, hp: 900, scale: 2.5, dmg: 20, fireFromPhase: 1, chargeSpeed: 21 },
    clear: [
      '빙귀가 부서지자 사당의 얼음이 녹아내렸다. 하급 장군의 우두머리였다.',
      '검사단에서 전갈이 온다. 상급 장군이 움직였다. 붉은 달이 뜨는 성에서.',
      '세 번째 검사가 합류한다. "셋이면 상급 장군도 벨 수 있다."',
    ],
    joinAlly: 2,
  },
  {
    id: 4, title: '제4장', name: '붉은 달의 성', place: '산 정상 · 불타는 성',
    story: [
      '붉은 달이 성을 비춘다. 하늘에서 불씨가 내린다.',
      '상급 장군 적안귀(赤眼鬼). 백 년 동안 대검사 열둘을 벤 요괴다.',
      '세 검사는 성문을 밀고 들어선다. 이 싸움에서 살아남으면, 귀왕의 성으로 가는 길이 열린다.',
    ],
    theme: 'castle', scale: { hp: 1.7, dmg: 1.45 },
    waves: [
      { melee: 4, ranged: 2, title: '첫 번째 파도', sub: '성문을 지키는 소귀들' },
      { melee: 4, ranged: 4, title: '두 번째 파도', sub: '불타는 회랑의 귀화들' },
      { melee: 5, ranged: 4, title: '세 번째 파도', sub: '옥좌의 방으로' },
      { boss: true, title: '적안귀', sub: '상급 장군이 옥좌에서 일어선다' },
    ],
    boss: { id: 'sekigan', name: '적안귀 — 상급 장군', body: 0x4a0a14, loin: 0xd9a640, eye: 0xff3020, hp: 1150, scale: 2.8, dmg: 22, fireFromPhase: 1, chargeSpeed: 20, summons: true },
    clear: [
      '적안귀가 쓰러지자 붉은 달이 흔들렸다. 성 뒤편에 검은 문이 열린다.',
      '문 너머는 끝없이 이어지는 미궁 — 귀왕의 거처, 무한 미궁성이다.',
      '"돌아올 수 없을지도 모른다." 세 검사는 서로를 보고 웃었다. "그럼 끝내고 오자."',
    ],
  },
  {
    id: 5, title: '제5장', name: '무한 미궁성', place: '요괴의 왕좌 · 끝없는 미궁',
    story: [
      '위아래가 없는 성. 복도가 뒤집히고 등롱이 허공을 떠다닌다.',
      '남은 장군들이 길목마다 기다리고, 그 끝 옥좌에 귀왕(鬼王)이 앉아 있다.',
      '천 년을 산 요괴의 왕. 이 밤을 넘기면 요괴의 시대는 끝난다.',
    ],
    theme: 'labyrinth', scale: { hp: 2.0, dmg: 1.6 },
    waves: [
      { melee: 4, ranged: 3, title: '첫 번째 파도', sub: '뒤집힌 복도의 요괴들' },
      { melee: 5, ranged: 4, title: '두 번째 파도', sub: '떠도는 등롱 사이로' },
      { melee: 6, ranged: 4, title: '세 번째 파도', sub: '옥좌의 방으로 가는 마지막 길' },
      { boss: true, title: '귀왕', sub: '천 년의 요괴가 일어선다' },
    ],
    boss: { id: 'kio', name: '귀왕 — 요괴의 왕', body: 0x2a0a2a, loin: 0xd9a640, eye: 0xffd040, hp: 1500, scale: 3.1, dmg: 24, fireFromPhase: 1, chargeSpeed: 19, summons: true },
    clear: [
      '귀왕이 재가 되자 미궁성이 무너져 내렸다. 천 년의 밤이 끝났다.',
      '동쪽 하늘이 밝아온다. 세 검사는 무너진 성 위에서 새벽을 맞았다.',
      '요괴의 시대는 끝났다. 검사는 검을 내려놓고, 마을로 돌아간다. — 끝 —',
    ],
    final: true,
  },
];

export const getChapter = (n) => CHAPTERS[Math.min(Math.max(n, 1), CHAPTERS.length) - 1];

export const THEMES = {
  bamboo: {
    sky: 0x141c38, fog: 0x1e2a4a, fogDensity: 0.03, moon: 0xb8c8ff, moonIntensity: 2.6, moonColor: 0xfff3d0, halo: 0x8fa8ff,
    hemiSky: 0x4a5a90, hemiGround: 0x1e2a1a, hemiIntensity: 1.25,
    ground: 0x2a3a28, plaza: 0x40464e, plazaRing: 0x353a41, grass: 0x2c5a2a,
    trunk: { h: 0.24, s: 0.45, l: 0.32 }, leaf: { h: 0.27, s: 0.5, l: 0.28 }, node: 0x8fbf5a,
    lantern: 0xff9a3c, lanternPaper: 0xffd9a0, lanternEmissive: 0xff9a40, torii: 1,
    particles: 'firefly', particleColor: 0xc8ff70, dawnSky: 0xf1b48c, dawnFog: 0xe7b9a3,
  },
  shrine: {
    sky: 0x1a1230, fog: 0x2c2046, fogDensity: 0.034, moon: 0xd0b8ff, moonIntensity: 2.3, moonColor: 0xf0e0ff, halo: 0xb090ff,
    hemiSky: 0x6a4a9a, hemiGround: 0x2a1e2a, hemiIntensity: 1.15,
    ground: 0x33282e, plaza: 0x4a444c, plazaRing: 0x3a3438, grass: 0x5a3a2a,
    trunk: { h: 0.06, s: 0.25, l: 0.22 }, leaf: { h: 0.0, s: 0.75, l: 0.36 }, node: 0x5a4a44,
    lantern: 0xa060ff, lanternPaper: 0xd0b0ff, lanternEmissive: 0x9a50ff, torii: 3,
    particles: 'leaf', particleColor: 0xc83a2a, dawnSky: 0xe8a898, dawnFog: 0xd8a8b0,
  },
  snow: {
    sky: 0x1e2a44, fog: 0x3a4a68, fogDensity: 0.04, moon: 0xd8e8ff, moonIntensity: 2.8, moonColor: 0xffffff, halo: 0xa0c0ff,
    hemiSky: 0x7080b0, hemiGround: 0x4a5060, hemiIntensity: 1.3,
    ground: 0xc8d2e0, plaza: 0x8a94a4, plazaRing: 0x707a8a, grass: 0x9aa4b4,
    trunk: { h: 0.6, s: 0.08, l: 0.2 }, leaf: { h: 0.6, s: 0.15, l: 0.78 }, node: 0xd8e0ea,
    lantern: 0x80c0ff, lanternPaper: 0xd0e8ff, lanternEmissive: 0x60a0ff, torii: 1,
    particles: 'snow', particleColor: 0xffffff, dawnSky: 0xf8d0c0, dawnFog: 0xe8d0d0,
  },
  castle: {
    sky: 0x2a0a10, fog: 0x3a1418, fogDensity: 0.03, moon: 0xff8a70, moonIntensity: 2.6, moonColor: 0xff6a50, halo: 0xff5040,
    hemiSky: 0x8a3030, hemiGround: 0x1a0a0a, hemiIntensity: 1.2,
    ground: 0x2a1a1a, plaza: 0x3a2a2a, plazaRing: 0x2a1c1c, grass: 0x3a1a14,
    trunk: { h: 0.02, s: 0.1, l: 0.12 }, leaf: { h: 0.02, s: 0.6, l: 0.2 }, node: 0x3a2a2a,
    lantern: 0xff5030, lanternPaper: 0xffb090, lanternEmissive: 0xff4020, torii: 0, pillars: true,
    particles: 'ember', particleColor: 0xff8a30, dawnSky: 0xf0b070, dawnFog: 0xe8a890,
  },
  labyrinth: {
    sky: 0x0e0618, fog: 0x1e1030, fogDensity: 0.028, moon: 0xd080ff, moonIntensity: 2.4, moonColor: 0xe0b0ff, halo: 0xa040ff,
    hemiSky: 0x6a30a0, hemiGround: 0x101018, hemiIntensity: 1.2,
    ground: 0x1a1224, plaza: 0x2e2440, plazaRing: 0x241a34, grass: 0x2a1a3a,
    trunk: { h: 0.75, s: 0.2, l: 0.14 }, leaf: { h: 0.78, s: 0.5, l: 0.3 }, node: 0x5a3a7a,
    lantern: 0xc060ff, lanternPaper: 0xe0c0ff, lanternEmissive: 0xa040ff, torii: 2, pillars: true, floatingLanterns: true,
    particles: 'ember', particleColor: 0xc080ff, dawnSky: 0xf0c0d0, dawnFog: 0xe0b8d0,
  },
};
