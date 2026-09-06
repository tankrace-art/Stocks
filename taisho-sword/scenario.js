// scenario.js — 귀멸의 칼날 원작 아크 기반 시나리오 8장 (개인 플레이용 팬 게임)
// 각 장: 무대 테마, 이야기, 파도(잡귀 + 보스), 보스 혈귀술, 동료 합류/이탈
// 보스 skills: charge(돌진) slam(내려찍기) firering(원형 탄) fan(부채꼴 탄) beam(직선 브레스) blink(순간이동 베기) field(장판) summon(소환)

const L = (n) => `하현 ${['일', '이', '삼', '사', '오', '육'][n - 1]}`;
const U = (n) => `상현 ${['일', '이', '삼', '사', '오', '육'][n - 1]}`;

export const CHAPTERS = [
  {
    id: 1, title: '제1장', name: '최종 선별', place: '후지카사네 산 · 등나무 꽃이 피는 산',
    story: [
      '숯을 팔고 돌아온 밤, 가족은 몰살당하고 여동생 네즈코만 도깨비가 된 채 살아남았다.',
      '물의 주 토미오카 기유의 권유로 우로코다키 아래에서 2년을 수련했다. 사비토와 마코모의 영혼이 길을 가르쳐 주었다.',
      '최종 선별. 등나무 꽃이 지키는 산에서 7일 밤을 살아남아야 귀살대에 들어갈 수 있다.',
    ],
    theme: 'wisteria', scale: { hp: 1.0, dmg: 1.0 },
    waves: [
      { melee: 2, ranged: 0, title: '첫 번째 밤', sub: '도깨비들이 등나무 꽃 밖에서 기어 나온다' },
      { melee: 3, ranged: 1, title: '둘째 밤', sub: '산속 깊은 곳에서 울음소리' },
      { melee: 3, ranged: 2, title: '셋째 밤', sub: '손이 잔뜩 달린 무언가가 다가온다' },
      { boss: { id: 'tede', name: '손 도깨비 — 우로코다키의 제자들을 먹은 자', body: 0x6a8a4a, loin: 0x3a2a2a, eye: 0xffe040, hp: 420, scale: 2.6, dmg: 14, skills: ['slam', 'charge', 'summon'] }, title: '손 도깨비', sub: '47년 동안 산에 갇혀 있던 도깨비' },
    ],
    clear: ['손 도깨비를 베었다. 우로코다키의 제자들의 원한이 풀렸다.', '최종 선별 합격. 귀살대의 대원이 되었다. 검은 일륜도가 손에 들어왔다.', '까마귀가 첫 임무를 전한다. — 아사쿠사로.'],
  },
  {
    id: 2, title: '제2장', name: '아사쿠사 · 늪 도깨비', place: '도쿄 아사쿠사 · 밤의 거리',
    story: [
      '첫 임무를 마치고 도착한 아사쿠사. 사람 많은 거리에서 시조 키부츠지 무잔과 마주쳤다.',
      '무잔은 사람들 사이로 사라졌다. 그의 배신자, 도깨비 의사 타마요와 유시로를 만났다.',
      '"십이귀월의 피를 모으면 네즈코를 인간으로 되돌릴 수 있다." 목표가 생겼다. 그리고 늪 속에서 세 도깨비가 나타났다.',
    ],
    theme: 'town', scale: { hp: 1.2, dmg: 1.15 },
    waves: [
      { melee: 3, ranged: 1, title: '거리의 도깨비', sub: '골목마다 눈이 빛난다' },
      { melee: 3, ranged: 3, title: '무잔의 부하들', sub: '피를 받은 자들' },
      { boss: { id: 'swamp', name: '늪 도깨비 — 열여섯 살 소녀를 노리는 자', body: 0x2a3a4a, loin: 0x1a2a1a, eye: 0xff60a0, hp: 560, scale: 2.0, dmg: 16, skills: ['blink', 'field', 'charge'] }, title: '늪 도깨비', sub: '늪 속에서 셋이 동시에 솟아오른다' },
    ],
    clear: ['늪 도깨비를 베었다. 소녀는 무사하다.', '타마요의 말대로, 십이귀월의 피가 필요하다. 다음 임무지는 나타구모 산.', '그곳에서 노란 머리의 겁쟁이와 멧돼지 가면을 쓴 검사가 기다리고 있다.'],
  },
  {
    id: 3, title: '제3장', name: '나타구모 산', place: '거미줄로 덮인 산',
    story: [
      '젠이츠(번개의 호흡)와 이노스케(짐승의 호흡)가 합류했다. 셋은 처음으로 함께 싸운다.',
      '산 전체가 거미줄로 덮여 있다. 거미 가족 도깨비들이 "가족"을 흉내 내며 대원들을 조종한다.',
      '산 정상에서 하현 오 루이가 기다린다. 물의 호흡으로는 실을 벨 수 없다 — 아버지가 가르쳐 준 춤을 떠올려라.',
    ],
    theme: 'spider', scale: { hp: 1.4, dmg: 1.3 },
    joinAllyStart: ['tanjiro', 'zenitsu', 'inosuke'],
    waves: [
      { melee: 3, ranged: 2, title: '거미 가족', sub: '조종당한 대원들이 실에 매달려 온다' },
      { melee: 4, ranged: 3, title: '어머니와 형', sub: '실을 끊어라' },
      { boss: { id: 'rui', name: `루이 — ${L(5)}`, body: 0xf0f0f4, loin: 0x3a2a4a, eye: 0xff3030, hp: 780, scale: 2.0, dmg: 18, skills: ['fan', 'field', 'blink'] }, title: '하현 오 · 루이', sub: '"가족의 인연"을 강요하는 소년' },
    ],
    clear: ['루이의 실은 히노카미 카구라 앞에서 끊어졌다. 물의 주 기유와 벌레의 주 시노부가 도착했다.', '도깨비를 데리고 다닌 죄로 주합회의에 회부되었으나, 우부야시키가 허락했다.', '나비저택에서 재활 훈련. 전집중 상중을 익혔다. 카나오와 만났다.'],
    joinAlly: 'giyu',
  },
  {
    id: 4, title: '제4장', name: '무한열차', place: '밤을 달리는 열차',
    story: [
      '불꽃의 주 렌고쿠 쿄쥬로와 함께 무한열차에 올랐다. 승객 40명이 사라졌다.',
      '하현 일 엔무가 열차와 융합했다. 잠들면 꿈에 갇힌다 — 꿈에서 깨려면 스스로 목을 베어라.',
      '엔무를 쓰러뜨린 새벽 직전, 상현 삼 아카자가 나타난다. 렌고쿠가 앞을 막아선다.',
    ],
    theme: 'train', scale: { hp: 1.6, dmg: 1.4 },
    joinAllyStart: ['rengoku'],
    waves: [
      { melee: 4, ranged: 2, title: '꿈에 갇힌 승객들', sub: '열차가 살아 움직인다' },
      { boss: { id: 'enmu', name: `엔무 — ${L(1)}`, body: 0x8a6a9a, loin: 0x2a1a3a, eye: 0x60c0ff, hp: 900, scale: 2.2, dmg: 18, skills: ['field', 'summon', 'fan'] }, title: '하현 일 · 엔무', sub: '열차 전체가 그의 몸이다' },
      { boss: { id: 'akaza1', name: `아카자 — ${U(3)}`, body: 0xffd0b0, loin: 0x2a4a8a, eye: 0xffd040, hp: 1400, scale: 2.4, dmg: 22, skills: ['blink', 'beam', 'charge'] }, title: '상현 삼 · 아카자', sub: '"강한 자여, 도깨비가 되어라"' },
    ],
    clear: ['새벽이 왔다. 아카자는 햇빛을 피해 달아났고, 렌고쿠는 그 자리에서 숨을 거두었다.', '"마음을 불태워라." 렌고쿠의 마지막 말이 가슴에 남았다.', '수개월 뒤, 소리의 주 우즈이 텐겐이 유곽 임무에 세 사람을 데려간다.'],
    leaveAlly: 'rengoku',
  },
  {
    id: 5, title: '제5장', name: '유곽', place: '요시와라 · 밤의 유곽',
    story: [
      '소리의 주 우즈이 텐겐의 세 아내가 유곽에 잠입했다 사라졌다. 셋은 여장을 하고 유곽에 들어간다.',
      '상현 육 다키가 오비(띠)로 사람을 가두고, 오빠 규타로가 피의 낫을 휘두른다. 둘은 한 몸 — 동시에 목을 베어야 한다.',
      '100년 동안 아무도 상현을 베지 못했다.',
    ],
    theme: 'district', scale: { hp: 1.8, dmg: 1.5 },
    joinAllyStart: ['tengen'],
    waves: [
      { melee: 4, ranged: 3, title: '유곽의 밤', sub: '띠 속에 갇힌 사람들' },
      { boss: { id: 'daki', name: `다키 — ${U(6)}`, body: 0xf8e0e8, loin: 0xd04080, eye: 0xff5090, hp: 900, scale: 2.0, dmg: 18, skills: ['fan', 'thread', 'blink'] }, title: '상현 육 · 다키', sub: '오비가 유곽 전체를 휘감는다' },
      { boss: { id: 'gyutaro', name: `규타로 — ${U(6)}`, body: 0x5a7a5a, loin: 0x2a1a1a, eye: 0xa0ff40, hp: 1300, scale: 2.3, dmg: 22, skills: ['fan', 'field', 'charge', 'summon'] }, title: '상현 육 · 규타로', sub: '피의 낫이 독을 뿌린다' },
    ],
    clear: ['다키와 규타로의 목이 동시에 떨어졌다. 100년 만에 상현이 쓰러졌다.', '텐겐은 왼팔과 왼눈을 잃고 은퇴했다. "너희가 다음 세대다."', '일륜도가 부러졌다. 새 검을 받으러 도공 마을로 향한다.'],
    leaveAlly: 'tengen',
  },
  {
    id: 6, title: '제6장', name: '도공 마을', place: '숨겨진 도공 마을',
    story: [
      '안개의 주 토키토 무이치로, 사랑의 주 칸로지 미츠리가 마을에 머물고 있다.',
      '상현 사 한텐구가 마을을 습격했다. 분노·기쁨·슬픔·즐거움 네 몸으로 나뉘어 싸운다.',
      '상현 오 교쿠코는 도공들을 물고기 항아리에 가둔다. 네즈코가 햇빛을 이겨내는 밤.',
    ],
    theme: 'village', scale: { hp: 2.0, dmg: 1.6 },
    joinAllyStart: ['mitsuri'],
    waves: [
      { melee: 4, ranged: 4, title: '마을의 습격', sub: '항아리에서 물고기 도깨비가 쏟아진다' },
      { boss: { id: 'gyokko', name: `교쿠코 — ${U(5)}`, body: 0x8ab0d0, loin: 0x2a3a6a, eye: 0xff8040, hp: 1200, scale: 2.2, dmg: 22, skills: ['fan', 'summon', 'field'] }, title: '상현 오 · 교쿠코', sub: '항아리 속에서 예술을 논한다' },
      { boss: { id: 'hantengu', name: `한텐구 — ${U(4)}`, body: 0x3a2a4a, loin: 0x6a2a2a, eye: 0xffd040, hp: 1500, scale: 2.4, dmg: 24, skills: ['summon', 'beam', 'blink', 'fan'] }, title: '상현 사 · 한텐구', sub: '베어도 베어도 분열한다 — 본체를 찾아라' },
    ],
    clear: ['한텐구의 본체를 벴다. 해가 떴지만 네즈코는 타지 않았다 — 햇빛을 이겨낸 도깨비.', '무잔이 네즈코를 노리기 시작했다. 흔적(痣)이 나타난 대원들이 늘어난다.', '주 합동 훈련 뒤, 무잔이 우부야시키 저택을 급습한다. 우부야시키는 자폭으로 무잔을 유인했고, 전원이 무한성으로 끌려갔다.'],
    leaveAlly: 'mitsuri',
  },
  {
    id: 7, title: '제7장', name: '무한성', place: '위아래가 없는 성',
    story: [
      '타마요의 노화약이 무잔에게 들어갔다. 무한성에서 상현들과의 총력전이 시작된다.',
      '시노부는 도우마에게 목숨을 걸고 독을 심었다. 카나오와 이노스케가 그 뒤를 잇는다.',
      '아카자, 그리고 요리이치의 형 코쿠시보. 이 성을 넘어야 무잔에게 닿는다.',
    ],
    theme: 'labyrinth', scale: { hp: 2.3, dmg: 1.75 },
    joinAllyStart: ['giyu'],
    waves: [
      { melee: 5, ranged: 4, title: '뒤집힌 복도', sub: '무한히 이어지는 성' },
      { boss: { id: 'doma', name: `도우마 — ${U(2)}`, body: 0xf8f0ff, loin: 0xd0a040, eye: 0xffa0c0, hp: 1500, scale: 2.3, dmg: 24, skills: ['field', 'fan', 'blink', 'firering'] }, title: '상현 이 · 도우마', sub: '얼음 연꽃이 피어난다 — 시노부의 독이 퍼지고 있다' },
      { boss: { id: 'akaza2', name: `아카자 — ${U(3)}`, body: 0xffd0b0, loin: 0x2a4a8a, eye: 0xffd040, hp: 1800, scale: 2.4, dmg: 26, skills: ['blink', 'beam', 'charge', 'firering'] }, title: '상현 삼 · 아카자', sub: '투명한 세계 — 투기를 버려라' },
      { boss: { id: 'kokushibo', name: `코쿠시보 — ${U(1)}`, body: 0x3a2a3a, loin: 0x6a2a2a, eye: 0xff4040, hp: 2400, scale: 2.6, dmg: 28, skills: ['beam', 'fan', 'blink', 'summon'] }, title: '상현 일 · 코쿠시보', sub: '달의 호흡 — 여섯 개의 눈' },
    ],
    clear: ['도우마, 아카자, 코쿠시보가 쓰러졌다. 무이치로와 겐야, 시노부가 목숨을 바쳤다.', '무한성이 무너진다. 무잔이 지상으로 끌려나왔다.', '해가 뜰 때까지 버텨야 한다. 이것이 마지막 밤이다.'],
    leaveAlly: 'giyu',
  },
  {
    id: 8, title: '최종장', name: '무잔 결전', place: '지상 · 새벽까지',
    story: [
      '무잔이 지상에 나왔다. 남은 모든 대원과 주가 새벽까지 그를 붙든다.',
      '미츠리와 오바나이, 교메이가 쓰러진다. 무잔은 절대 죽지 않는다 — 다만 햇빛만이 그를 태운다.',
      '살아남아라. 붉은 칼날로 그의 재생을 늦추고, 새벽이 올 때까지.',
    ],
    theme: 'ruins', scale: { hp: 2.6, dmg: 1.9 },
    joinAllyStart: ['giyu', 'sanemi'],
    nightLength: 210, dawnClear: true,
    waves: [
      { melee: 4, ranged: 3, title: '무잔의 부하들', sub: '새벽까지 4분' },
      { boss: { id: 'muzan', name: '키부츠지 무잔 — 도깨비의 시조', body: 0xf0e0f0, loin: 0x1a0a2a, eye: 0xff2040, hp: 6000, scale: 2.8, dmg: 30, skills: ['thread', 'beam', 'blink', 'summon', 'firering', 'charge'], undying: true }, title: '키부츠지 무잔', sub: '베어도 재생한다 — 햇빛이 뜰 때까지 버텨라' },
    ],
    clear: ['해가 떴다. 무잔은 햇빛 속에서 재가 되었다.', '탄지로는 무잔의 저주로 도깨비가 되었지만, 네즈코와 카나오, 동료들이 그를 되돌렸다.', '도깨비의 시대가 끝났다. — 그리고 현대. 그들의 자손들이 평범한 아침을 맞는다. — 끝 —'],
    final: true,
  },
];

export const getChapter = (n) => CHAPTERS[Math.min(Math.max(n, 1), CHAPTERS.length) - 1];

export const THEMES = {
  wisteria: {
    sky: 0x1a1430, fog: 0x2a2048, fogDensity: 0.03, moon: 0xc8b8ff, moonIntensity: 2.5, moonColor: 0xf8f0ff, halo: 0xb090ff,
    hemiSky: 0x6a5aa0, hemiGround: 0x1e2a1a, hemiIntensity: 1.25,
    ground: 0x2a3a28, plaza: 0x40464e, plazaRing: 0x353a41, grass: 0x2c5a2a,
    trunk: { h: 0.08, s: 0.3, l: 0.22 }, leaf: { h: 0.75, s: 0.55, l: 0.62 }, node: 0x8a6a5a,
    lantern: 0xb080ff, lanternPaper: 0xe0d0ff, lanternEmissive: 0xa060ff,
    particles: 'leaf', particleColor: 0xc8a0ff, dawnSky: 0xf1b48c, dawnFog: 0xe7b9a3,
  },
  town: {
    sky: 0x121828, fog: 0x1e2438, fogDensity: 0.03, moon: 0xffd8a0, moonIntensity: 2.3, moonColor: 0xffe8b0, halo: 0xffb060,
    hemiSky: 0x5a5a80, hemiGround: 0x2a2420, hemiIntensity: 1.2,
    ground: 0x2e2a28, plaza: 0x46423e, plazaRing: 0x3a3632, grass: 0x3a3a2a,
    trunk: { h: 0.08, s: 0.2, l: 0.2 }, leaf: { h: 0.2, s: 0.4, l: 0.3 }, node: 0x5a4a44,
    lantern: 0xffa040, lanternPaper: 0xffd9a0, lanternEmissive: 0xff9a40,
    particles: 'firefly', particleColor: 0xffd080, dawnSky: 0xf1b48c, dawnFog: 0xe7b9a3,
  },
  spider: {
    sky: 0x0e1418, fog: 0x1a2428, fogDensity: 0.04, moon: 0xa0c0c0, moonIntensity: 2.2, moonColor: 0xe0f0f0, halo: 0x80b0b0,
    hemiSky: 0x3a5a5a, hemiGround: 0x1a2018, hemiIntensity: 1.15,
    ground: 0x222a22, plaza: 0x3a423a, plazaRing: 0x2e362e, grass: 0x2a4a2a,
    trunk: { h: 0.1, s: 0.2, l: 0.18 }, leaf: { h: 0.3, s: 0.3, l: 0.22 }, node: 0x4a5a4a,
    lantern: 0x80e0e0, lanternPaper: 0xd0ffff, lanternEmissive: 0x60c0c0,
    particles: 'firefly', particleColor: 0xe0ffff, dawnSky: 0xe8b8a0, dawnFog: 0xd8b0a8,
  },
  train: {
    sky: 0x0c0e18, fog: 0x161a2a, fogDensity: 0.028, moon: 0xb0b8ff, moonIntensity: 2.4, moonColor: 0xffffff, halo: 0x8090ff,
    hemiSky: 0x4a4a70, hemiGround: 0x2a2018, hemiIntensity: 1.2,
    ground: 0x1a1a1e, plaza: 0x4a3a2a, plazaRing: 0x3a2e22, grass: 0x2a2a2a,
    trunk: { h: 0.1, s: 0.1, l: 0.14 }, leaf: { h: 0.3, s: 0.2, l: 0.2 }, node: 0x3a3a3a,
    lantern: 0xffb060, lanternPaper: 0xffe0b0, lanternEmissive: 0xffa040,
    particles: 'ember', particleColor: 0xffb070, dawnSky: 0xf1b48c, dawnFog: 0xe7b9a3,
  },
  district: {
    sky: 0x1a0e1c, fog: 0x2e1a2e, fogDensity: 0.03, moon: 0xffc0d0, moonIntensity: 2.3, moonColor: 0xffe0e8, halo: 0xff80a0,
    hemiSky: 0x8a4a6a, hemiGround: 0x2a1a20, hemiIntensity: 1.25,
    ground: 0x2a2024, plaza: 0x4a3a40, plazaRing: 0x3a2e34, grass: 0x3a2a30,
    trunk: { h: 0.05, s: 0.2, l: 0.2 }, leaf: { h: 0.95, s: 0.5, l: 0.4 }, node: 0x5a4a44,
    lantern: 0xff6080, lanternPaper: 0xffc0d0, lanternEmissive: 0xff4070,
    particles: 'leaf', particleColor: 0xffa0c0, dawnSky: 0xf1b48c, dawnFog: 0xe7b9a3,
  },
  village: {
    sky: 0x141c30, fog: 0x1e2a44, fogDensity: 0.03, moon: 0xb8c8ff, moonIntensity: 2.6, moonColor: 0xfff3d0, halo: 0x8fa8ff,
    hemiSky: 0x4a5a90, hemiGround: 0x2a2a1a, hemiIntensity: 1.25,
    ground: 0x30382a, plaza: 0x4a463e, plazaRing: 0x3a3632, grass: 0x3a5a2a,
    trunk: { h: 0.08, s: 0.3, l: 0.24 }, leaf: { h: 0.25, s: 0.5, l: 0.3 }, node: 0x6a5a4a,
    lantern: 0xff9a3c, lanternPaper: 0xffd9a0, lanternEmissive: 0xff9a40,
    particles: 'firefly', particleColor: 0xc8ff70, dawnSky: 0xf1b48c, dawnFog: 0xe7b9a3,
  },
  labyrinth: {
    sky: 0x0e0618, fog: 0x1e1030, fogDensity: 0.028, moon: 0xd080ff, moonIntensity: 2.4, moonColor: 0xe0b0ff, halo: 0xa040ff,
    hemiSky: 0x6a30a0, hemiGround: 0x101018, hemiIntensity: 1.2,
    ground: 0x1a1224, plaza: 0x2e2440, plazaRing: 0x241a34, grass: 0x2a1a3a,
    trunk: { h: 0.75, s: 0.2, l: 0.14 }, leaf: { h: 0.78, s: 0.5, l: 0.3 }, node: 0x5a3a7a,
    lantern: 0xc060ff, lanternPaper: 0xe0c0ff, lanternEmissive: 0xa040ff, floatingLanterns: true,
    particles: 'ember', particleColor: 0xc080ff, dawnSky: 0xf0c0d0, dawnFog: 0xe0b8d0,
  },
  ruins: {
    sky: 0x2a0a10, fog: 0x3a1418, fogDensity: 0.028, moon: 0xff8a70, moonIntensity: 2.6, moonColor: 0xff6a50, halo: 0xff5040,
    hemiSky: 0x8a3030, hemiGround: 0x1a0a0a, hemiIntensity: 1.2,
    ground: 0x2a2020, plaza: 0x3a3030, plazaRing: 0x2a2222, grass: 0x3a2a24,
    trunk: { h: 0.02, s: 0.1, l: 0.12 }, leaf: { h: 0.02, s: 0.4, l: 0.2 }, node: 0x3a2a2a,
    lantern: 0xff5030, lanternPaper: 0xffb090, lanternEmissive: 0xff4020,
    particles: 'ember', particleColor: 0xff8a30, dawnSky: 0xffd090, dawnFog: 0xf0c0a0,
  },
};
