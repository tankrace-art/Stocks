// player.js — 검사 캐릭터: 이동/카메라/대시/3연타/강공격/비검. 캐릭터 설정과 스킬 트리 효과 반영
import * as THREE from 'three';
import { clamp, lerp, damp, rand, angleLerp, angleDiff, easeOutCubic, easeInCubic, easeOutBack } from './util.js';
import { CHARACTERS } from './characters.js';
import { sumEquipment, POTION_HEAL } from './items.js';

const DASH_SPEED = 21;
const DASH_TIME = 0.2;
const GAUGE_MAX = 100;
const COMBO_WINDOW = 2.4;   // 마지막 타격 후 콤보 유지 시간
const PLAYER_RADIUS = 0.42;

// 공격 정의. windup/end: 오른팔 회전 포즈
const ATTACKS = {
  light1: {
    dur: 0.36, active: [0.10, 0.24], dmg: 12, range: 2.5, arc: 2.3, knock: 3.5, gauge: 7, lunge: 2.6,
    windup: { x: -1.15, y: -1.5, z: 0.2 }, end: { x: -1.05, y: 1.3, z: -0.2 },
    fx: { sweep: 1, tilt: 0.2, roll: 0.1, color: 0xcfe8ff, y: 1.15 }, stagger: 0.25, hitstop: 0.045, shake: 0.12,
    next: 'light2',
  },
  light2: {
    dur: 0.36, active: [0.10, 0.24], dmg: 12, range: 2.5, arc: 2.3, knock: 3.5, gauge: 7, lunge: 2.6,
    windup: { x: -1.15, y: 1.5, z: -0.2 }, end: { x: -1.05, y: -1.3, z: 0.2 },
    fx: { sweep: -1, tilt: -0.2, roll: -0.5, color: 0xcfe8ff, y: 1.0 }, stagger: 0.25, hitstop: 0.045, shake: 0.12,
    next: 'light3',
  },
  light3: {
    dur: 0.52, active: [0.18, 0.34], dmg: 22, range: 2.9, arc: 2.6, knock: 6.5, gauge: 12, lunge: 4.2,
    windup: { x: -2.8, y: 0.1, z: 0.3 }, end: { x: -0.45, y: 0.1, z: 0 },
    fx: { sweep: 0, tilt: -1.35, roll: 0, color: 0xe0f0ff, y: 1.3, rOut: 2.4 }, stagger: 0.45, hitstop: 0.08, shake: 0.28,
    next: null,
  },
  heavy: {
    dur: 0.88, active: [0.42, 0.6], dmg: 40, range: 3.3, arc: 3.0, knock: 10, gauge: 18, lunge: 4.8,
    windup: { x: -2.95, y: 0.9, z: 0.6 }, end: { x: -0.9, y: -1.25, z: -0.3 },
    fx: { sweep: -1, tilt: -0.9, roll: 0.7, color: 0xffd28a, y: 1.2, rOut: 3.1 }, stagger: 0.7, hitstop: 0.11, shake: 0.45,
    next: null, heavy: true,
  },
  rush: {
    dur: 0.55, active: [0.08, 0.36], dmg: 20, range: 2.0, arc: 1.4, knock: 5, gauge: 10, lunge: 16,
    windup: { x: -1.3, y: 1.2, z: 0 }, end: { x: -1.1, y: -1.1, z: 0 },
    fx: { sweep: -1, tilt: 0.1, roll: 0.3, color: 0xffffff, y: 1.0, rOut: 2.2 }, stagger: 0.5, hitstop: 0.05, shake: 0.25,
    next: null, rush: true, cooldown: 3.5,
  },
  special: {
    dur: 1.35, active: [0.28, 0.62], dmg: 55, range: 4.6, arc: Math.PI * 2 + 1, knock: 13, gauge: 0, lunge: 0,
    windup: { x: -1.4, y: -1.2, z: 0 }, end: { x: -1.4, y: -1.2, z: 0 },
    fx: { sweep: 1, tilt: 0, roll: 0, color: 0x9cd0ff, y: 1.1, rOut: 4.4 }, stagger: 1.0, hitstop: 0.14, shake: 0.7,
    next: null, special: true,
  },
};

// 셀 셰이딩용 3단 그라데이션
let GRADIENT = null;
function gradientMap() {
  if (GRADIENT) return GRADIENT;
  const data = new Uint8Array([70, 70, 70, 255, 150, 150, 150, 255, 255, 255, 255, 255]);
  GRADIENT = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  GRADIENT.minFilter = THREE.NearestFilter; GRADIENT.magFilter = THREE.NearestFilter; GRADIENT.needsUpdate = true;
  return GRADIENT;
}
function mat(color, extra = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(), ...extra });
}
const OUTLINE_MAT = new THREE.MeshBasicMaterial({ color: 0x14121c, side: THREE.BackSide });

// 애니메이션풍 얼굴 텍스처 (캔버스): 큰 눈·하이라이트·눈썹·입·볼터치. closed=true면 감은 눈
function makeFaceTexture(ch, closed = false) {
  const W = 512, H = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const hex = (v) => `#${v.toString(16).padStart(6, '0')}`;
  g.fillStyle = hex(SKIN); g.fillRect(0, 0, W, H);
  const cx = W * 0.25, ey = H * 0.47, gap = 30, ew = 26, eh = 22;
  const iris = hex(ch.colors.eye || 0x3060a0), hair = hex(ch.colors.hair);
  const tilt = ch.look && ch.look.browTilt !== undefined ? ch.look.browTilt : 0.15;
  for (const s of [-1, 1]) {
    const x = cx + s * gap;
    if (closed) {
      g.strokeStyle = '#3a2a2a'; g.lineWidth = 4; g.lineCap = 'round';
      g.beginPath(); g.arc(x, ey + 6, ew * 0.9, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
    } else {
      // 흰자 (아몬드형)
      g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(x, ey, ew, eh, 0, 0, Math.PI * 2); g.fill();
      // 홍채 (그라데이션)
      const gr = g.createLinearGradient(x, ey - eh, x, ey + eh);
      gr.addColorStop(0, '#1a1a2a'); gr.addColorStop(0.45, iris); gr.addColorStop(1, '#ffffff');
      g.fillStyle = gr; g.beginPath(); g.ellipse(x, ey + 2, ew * 0.62, eh * 0.86, 0, 0, Math.PI * 2); g.fill();
      // 동공
      g.fillStyle = '#101018'; g.beginPath(); g.ellipse(x, ey + 3, ew * 0.26, eh * 0.42, 0, 0, Math.PI * 2); g.fill();
      // 하이라이트
      g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(x - s * 7, ey - 7, 6, 7, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(x + s * 6, ey + 8, 3, 3.5, 0, 0, Math.PI * 2); g.fill();
      // 위 속눈썹 라인
      g.strokeStyle = '#2a1e22'; g.lineWidth = 5; g.lineCap = 'round';
      g.beginPath(); g.ellipse(x, ey, ew + 1, eh + 1, 0, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
      g.lineWidth = 2.5; g.beginPath(); g.ellipse(x, ey, ew, eh, 0, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
    }
    // 눈썹
    g.strokeStyle = hair; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x - s * 24, ey - 40); g.quadraticCurveTo(x, ey - 48 - tilt * 26, x + s * 24, ey - 40 + tilt * 36); g.stroke();
    // 볼터치
    g.fillStyle = 'rgba(255,140,140,0.32)'; g.beginPath(); g.ellipse(x + s * 22, ey + 38, 18, 8, 0, 0, Math.PI * 2); g.fill();
  }
  // 입
  g.strokeStyle = '#a04848'; g.lineWidth = 3; g.lineCap = 'round';
  g.beginPath(); g.arc(cx, ey + 56, 8, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
  // 흉터 (이마 왼쪽)
  if (ch.look && ch.look.scar) {
    g.fillStyle = 'rgba(170,60,50,0.85)';
    g.beginPath(); g.moveTo(cx - 48, ey - 70); g.quadraticCurveTo(cx - 30, ey - 88, cx - 12, ey - 66); g.quadraticCurveTo(cx - 30, ey - 76, cx - 48, ey - 70); g.fill();
  }
  // 코 (작은 점)
  g.fillStyle = 'rgba(160,100,90,0.5)'; g.beginPath(); g.arc(cx, ey + 32, 2.2, 0, Math.PI * 2); g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}

// ---------- 모델: 머리 큰 귀여운 비율(2.5등신), 표정·앞머리·무늬 하오리·주름 하카마 ----------
const SKIN = 0xf3d3b3;
export function buildModel(ch) {
  const C = ch.colors, L = ch.look || {};
  const g = new THREE.Group();
  const parts = {};
  const light = (hex, k = 0.25) => new THREE.Color(hex).lerp(new THREE.Color(0xffffff), k).getHex();
  const dark = (hex, k = 0.35) => new THREE.Color(hex).lerp(new THREE.Color(0x000000), k).getHex();

  // ---- 발: 짚신 + 흰 버선 ----
  const footGeo = new THREE.BoxGeometry(0.2, 0.09, 0.32);
  for (const sx of [-0.15, 0.15]) {
    const foot = new THREE.Mesh(footGeo, mat(0xf0e8dc)); foot.position.set(sx, 0.06, 0.06);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.34), mat(0x6a4a2a)); sole.position.set(sx, 0.02, 0.06);
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.16), mat(0x8a1f1f)); strap.position.set(sx, 0.11, 0.1);
    g.add(foot, sole, strap);
    parts.feet = parts.feet || []; parts.feet.push(foot, sole, strap);
  }
  // ---- 하카마: 몸통 + 주름 ----
  const hakama = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 0.78, 8), mat(C.hakama));
  hakama.position.y = 0.45;
  g.add(hakama);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const pleat = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.74, 0.07), mat(i % 2 ? light(C.hakama, 0.12) : dark(C.hakama, 0.2)));
    pleat.position.set(Math.sin(a) * 0.42, 0.44, Math.cos(a) * 0.42);
    pleat.rotation.y = a; pleat.rotation.x = Math.cos(a) * 0.18; pleat.rotation.z = -Math.sin(a) * 0.18;
    g.add(pleat);
  }
  // ---- 몸통·오비·깃 ----
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.55, 0.36), mat(C.kimono)); torso.position.y = 1.06;
  const obi = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.15, 0.4), mat(C.obi)); obi.position.y = 0.82;
  const obiKnot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.1), mat(light(C.obi, 0.2))); obiKnot.position.set(0, 0.82, -0.23);
  g.add(torso, obi, obiKnot);
  for (const s of [-1, 1]) {
    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.03), mat(0xf6f0e4));
    collar.position.set(s * 0.1, 1.24, 0.19); collar.rotation.z = -s * 0.7;
    g.add(collar);
  }
  // ---- 하오리: 등판 + 옆판 + 무늬 ----
  const haoriBack = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.64, 0.12), mat(C.haori)); haoriBack.position.set(0, 1.0, -0.2);
  g.add(haoriBack);
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.64, 0.38), mat(C.haori)); side.position.set(s * 0.37, 1.0, -0.02);
    const front = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.62, 0.05), mat(C.haori)); front.position.set(s * 0.22, 1.0, 0.2);
    g.add(side, front);
  }
  const pat = L.pattern || 'plain';
  const patColor = C.pattern !== undefined ? C.pattern : light(C.haori, 0.4);
  if (pat === 'stripes') {
    for (let i = 0; i < 4; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.13), mat(patColor)); st.position.set(0, 0.74 + i * 0.17, -0.2); g.add(st); }
  } else if (pat === 'waves') {
    for (let i = 0; i < 3; i++) for (const s of [-1, 0, 1]) { const w = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.018, 4, 8, Math.PI), mat(patColor)); w.position.set(s * 0.2, 0.74 + i * 0.2, -0.265); g.add(w); }
  } else if (pat === 'diamonds') {
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) { const d = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.02), mat(patColor)); d.position.set(s * 0.17, 0.76 + i * 0.2, -0.265); d.rotation.z = Math.PI / 4; g.add(d); }
  } else if (pat === 'flames') {
    for (let i = 0; i < 5; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 4), mat(patColor)); f.position.set(-0.24 + i * 0.12, 0.76, -0.265); g.add(f); }
  } else if (pat === 'check' || pat === 'halfcheck') {
    // 이치마츠 격자 (전통 문양)
    for (let r = 0; r < 4; r++) for (let col = 0; col < 4; col++) {
      if ((r + col) % 2) continue;
      if (pat === 'halfcheck' && col < 2) continue;
      const sq = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.15, 0.02), mat(patColor));
      sq.position.set(-0.25 + col * 0.165, 0.75 + r * 0.155, -0.265); g.add(sq);
      const sq2 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.15, 0.09), mat(patColor));
      sq2.position.set(col < 2 ? -0.46 : 0.46, 0.75 + r * 0.155, -0.15 + (col % 2) * 0.1); g.add(sq2);
    }
  } else if (pat === 'uroko') {
    // 우로코(비늘) 삼각 문양 (전통 문양)
    for (let r = 0; r < 3; r++) for (let col = 0; col < 4; col++) {
      const tri = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.13, 3), mat(patColor));
      tri.position.set(-0.24 + col * 0.16 + (r % 2) * 0.08, 0.78 + r * 0.17, -0.265); tri.rotation.y = Math.PI / 6; g.add(tri);
    }
  } else if (pat === 'leaves') {
    for (let i = 0; i < 4; i++) { const lf = new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 4), mat(patColor)); lf.scale.set(1, 1.6, 0.4); lf.position.set(-0.2 + i * 0.13, 0.78 + (i % 2) * 0.22, -0.265); lf.rotation.z = 0.5; g.add(lf); }
  }
  // 하오리 옷깃 테두리
  for (const s of [-1, 1]) { const trim = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.62, 0.06), mat(patColor)); trim.position.set(s * 0.14, 1.0, 0.21); g.add(trim); }

  // ---- 목·머리 ----
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.12, 6), mat(SKIN)); neck.position.y = 1.36; g.add(neck);
  const headG = new THREE.Group(); headG.position.y = 1.7; g.add(headG); parts.head = headG;
  const faceOpen = makeFaceTexture(ch, false), faceClosed = makeFaceTexture(ch, true);
  const faceMat = new THREE.MeshToonMaterial({ map: faceOpen, gradientMap: gradientMap() });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 18), faceMat); head.scale.set(1, 0.97, 0.94); headG.add(head);
  parts.faceMat = faceMat; parts.faceOpen = faceOpen; parts.faceClosed = faceClosed; parts.eyes = [];
  if (L.boarMask) {
    // 멧돼지 가면: 주둥이·코·귀·엄니, 가면 아래 얼굴은 가려짐
    const fur = 0xb0a494;
    const mask = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), mat(fur)); mask.scale.set(1, 0.95, 1.0); mask.position.y = 0.02;
    const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.3, 8), mat(0x6a6058)); snout.rotation.x = Math.PI / 2; snout.position.set(0, -0.08, 0.42);
    const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 8), mat(0x3a2a2a)); nose.rotation.x = Math.PI / 2; nose.position.set(0, -0.08, 0.58);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), new THREE.MeshBasicMaterial({ color: 0x101010 })); eye.position.set(s * 0.16, 0.1, 0.36); headG.add(eye);
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.26, 5), mat(fur)); ear.position.set(s * 0.3, 0.36, -0.05); ear.rotation.z = -s * 0.5; headG.add(ear);
      const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 5), mat(0xf0e6c8)); tusk.position.set(s * 0.14, -0.2, 0.42); tusk.rotation.x = -0.6; headG.add(tusk);
    }
    headG.add(mask, snout, nose);
    parts.masked = true;
  }
  // 머리카락: 캡 + 앞머리 + 옆머리
  // 머리카락 캡: 눈 위까지만(적도 위) — 뒤통수는 조금 더 내려옴
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.365, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.44), mat(C.hair)); hairCap.position.y = 0.03; hairCap.scale.set(1, 0.98, 0.96); headG.add(hairCap);
  const hairBack = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 10, Math.PI * 0.55, Math.PI * 0.9, Math.PI * 0.3, Math.PI * 0.4), mat(C.hair)); hairBack.position.y = 0.02; hairBack.scale.set(1, 0.98, 0.96); headG.add(hairBack);
  const bangLens = L.bangs || [0.2, 0.28, 0.24, 0.3, 0.2];
  for (let i = 0; i < bangLens.length; i++) {
    const x = -0.24 + i * (0.48 / (bangLens.length - 1));
    const len = bangLens[i] * 0.75;
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.11, len, 0.09), mat(C.hair));
    b.position.set(x, 0.33 - len / 2, 0.27); b.rotation.x = 0.22; b.rotation.z = (x) * 0.5;
    headG.add(b);
  }
  for (const s of [-1, 1]) { const lock = new THREE.Mesh(new THREE.BoxGeometry(0.09, L.longSide ? 0.5 : 0.3, 0.13), mat(C.hair)); lock.position.set(s * 0.33, L.longSide ? -0.05 : 0.05, -0.02); headG.add(lock); }
  if (L.ponytail) { const pt = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.55, 6), mat(C.hair)); pt.position.set(0, -0.05, -0.36); pt.rotation.x = 0.55; headG.add(pt); parts.ponytail = pt; }
  if (L.braid) { const br = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.7, 6), mat(C.hair)); br.position.set(0.22, -0.2, -0.28); br.rotation.x = 0.35; headG.add(br); for (let i = 0; i < 3; i++) { const bead = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.02, 4, 8), mat(0xd9a640)); bead.position.set(0.22 + Math.sin(0.35) * 0, -0.05 - i * 0.2, -0.32 - i * 0.07); headG.add(bead); } }
  if (L.spikyHair) {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.3, 4), mat(C.hair));
      sp.position.set(Math.cos(a) * 0.24, 0.3, Math.sin(a) * 0.22);
      sp.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
      headG.add(sp);
    }
  }
  if (L.bun) { const bun = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), mat(C.hair)); bun.position.set(0, 0.28, -0.22); headG.add(bun); const tie = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 4, 10), mat(0xd9a640)); tie.position.copy(bun.position); tie.rotation.x = 0.8; headG.add(tie); }
  // 모자류
  if (L.cap) {
    const capBody = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.34, 0.14, 12), mat(0x14172a)); capBody.position.y = 0.3;
    const capBand = new THREE.Mesh(new THREE.CylinderGeometry(0.365, 0.365, 0.04, 12), mat(0xd9a640)); capBand.position.y = 0.25;
    const capVisor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.18), mat(0x0b0c14)); capVisor.position.set(0, 0.24, 0.36); capVisor.rotation.x = 0.15;
    headG.add(capBody, capBand, capVisor);
  }
  if (L.kasa) { const kasa = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.3, 12), mat(0xd2b077)); kasa.position.y = 0.42; const rim = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.02, 4, 16), mat(0x8a6a3a)); rim.position.y = 0.28; rim.rotation.x = Math.PI / 2; headG.add(kasa, rim); }
  if (L.headband) { const band = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.08, 12), mat(0xf0e6d2)); band.position.y = 0.16; const tail1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 0.03), mat(0xf0e6d2)); tail1.position.set(0.08, -0.05, -0.36); tail1.rotation.x = 0.4; tail1.rotation.z = 0.2; const tail2 = tail1.clone(); tail2.position.x = -0.06; tail2.rotation.z = -0.2; headG.add(band, tail1, tail2); }
  if (L.earring) { for (const s of [-1, 1]) { const er = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.02), mat(C.pattern || 0xd9a640)); er.position.set(s * 0.34, -0.1, 0.05); headG.add(er); } }

  // ---- 머플러 ----
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.085, 6, 12), mat(C.scarf)); scarf.position.y = 1.38; scarf.rotation.x = Math.PI / 2; g.add(scarf);
  const scarfTail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.55, 0.05), mat(C.scarf)); scarfTail.position.set(-0.14, 1.12, -0.3); scarfTail.rotation.x = 0.35; g.add(scarfTail);
  parts.scarfTail = scarfTail;

  // ---- 팔 + 넓은 소매 ----
  const armGeo = new THREE.CylinderGeometry(0.075, 0.07, 0.42, 6); armGeo.translate(0, -0.21, 0);
  const makeArm = (s) => {
    const arm = new THREE.Group(); arm.position.set(s * 0.36, 1.27, 0);
    arm.add(new THREE.Mesh(armGeo, mat(C.kimono)));
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.34, 0.24), mat(C.haori)); sleeve.position.set(s * 0.02, -0.14, 0);
    const sleeveTrim = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.05, 0.25), mat(patColor)); sleeveTrim.position.set(s * 0.02, -0.3, 0);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.085, 7, 6), mat(SKIN)); hand.position.y = -0.46;
    arm.add(sleeve, sleeveTrim, hand);
    arm.rotation.order = 'YXZ';
    return arm;
  };
  const leftArm = makeArm(-1); leftArm.rotation.z = 0.2; parts.leftArm = leftArm;
  const rightArm = makeArm(1); parts.rightArm = rightArm;

  // ---- 카타나 ----
  const bs = L.bladeScale || 1;
  const katana = new THREE.Group(); katana.position.set(0, -0.46, 0);
  const tsuka = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.3, 6), mat(0x2a1e1c)); tsuka.rotation.x = Math.PI / 2;
  const wrapC = C.obi === 0x1a1a1a || C.obi === 0x222222 ? 0x8a1f1f : C.obi;
  for (let i = 0; i < 3; i++) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.039, 0.039, 0.04, 6), mat(wrapC)); w.rotation.x = Math.PI / 2; w.position.z = -0.1 + i * 0.08; katana.add(w); }
  const tsuba = new THREE.Mesh(new THREE.CylinderGeometry(0.09 * bs, 0.09 * bs, 0.025, 8), mat(0xb09a4a)); tsuba.rotation.x = Math.PI / 2; tsuba.position.z = 0.16;
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0xe6edf5, metalness: 0.85, roughness: 0.22, emissive: C.glow, emissiveIntensity: 0.15 });
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03 * bs, 0.075 * bs, 1.0 * bs), bladeMat); blade.position.z = 0.68 * bs;
  const edge = new THREE.Mesh(new THREE.BoxGeometry(0.012 * bs, 0.03 * bs, 1.0 * bs), new THREE.MeshBasicMaterial({ color: C.glow })); edge.position.set(0, 0.045 * bs, 0.68 * bs);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.037 * bs, 0.12, 4), bladeMat); tip.rotation.x = Math.PI / 2; tip.position.z = 1.24 * bs; tip.rotation.z = Math.PI / 4;
  const tassel = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.03), mat(wrapC)); tassel.position.set(0, -0.08, -0.16);
  katana.add(tsuka, tsuba, blade, edge, tip, tassel);
  katana.rotation.x = -1.05;
  rightArm.add(katana);
  parts.katana = katana; parts.bladeMat = bladeMat;
  if (L.twinBlades) {
    const k2 = katana.clone(); k2.position.set(0, -0.46, 0); leftArm.add(k2);
  }
  const saya = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 1.05 * bs, 6), mat(0x11111a)); saya.position.set(-0.22, 0.8, -0.16); saya.rotation.set(1.35, 0, 0.25);
  const sayaRing = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.012, 4, 8), mat(0xb09a4a)); sayaRing.position.set(-0.2, 0.9, -0.12); sayaRing.rotation.set(1.35, 0, 0.25);

  g.add(leftArm, rightArm, saya, sayaRing);
  const outlines = [];
  g.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    if (o.material === bladeMat || o.material === edge.material) return;
    const size = o.geometry.boundingSphere ? o.geometry.boundingSphere.radius : (o.geometry.computeBoundingSphere(), o.geometry.boundingSphere.radius);
    const ol = new THREE.Mesh(o.geometry, OUTLINE_MAT);
    ol.scale.setScalar(1 + Math.min(0.12, 0.022 / Math.max(size, 0.05)));
    ol.castShadow = false; ol.receiveShadow = false; ol.isOutline = true;
    outlines.push([o, ol]);
  });
  for (const [o, ol] of outlines) o.add(ol);
  parts.body = g;
  parts.blinkT = rand(2, 5);
  return parts;
}

// 눈 깜빡임 (모델 공용)
export function animateFace(parts, dt) {
  if (parts.masked) return;
  parts.blinkT -= dt;
  const closed = parts.blinkT < 0 && parts.blinkT > -0.14;
  const want = closed ? parts.faceClosed : parts.faceOpen;
  if (parts.faceMat.map !== want) parts.faceMat.map = want;
  if (parts.blinkT < -0.14) parts.blinkT = rand(2.2, 5);
  if (parts.ponytail) parts.ponytail.rotation.x = 0.55 + Math.sin(performance.now() * 0.004) * 0.12;
}

export class Player {
  constructor(scene, character = CHARACTERS[0], progress = null) {
    this.scene = scene;
    this.ch = character;
    this.progress = progress;
    this.parts = buildModel(character);
    this.group = new THREE.Group();
    this.group.add(this.parts.body);
    scene.add(this.group);

    this.pos = this.group.position;
    this.pos.set(0, 0, 4);
    this.yaw = Math.PI;
    this.camYaw = 0;
    this.camYaw = 0;
    this.camPitch = 0.3;
    this.radius = PLAYER_RADIUS;
    this.height = 1.9;

    this.applySkills();
    this.hp = this.maxHp;
    this.gauge = 0; this.gaugeMax = GAUGE_MAX;
    this.combo = 0; this.comboTimer = 0; this.comboPop = 0;
    this.invuln = 0;
    this.alive = true;

    this.attack = null;
    this.queued = null;
    this.comboResetTimer = 0;
    this.nextLight = 'light1';

    this.dashTime = 0; this.dashCooldown = 0; this.dashDir = new THREE.Vector3();
    this.moving = false; this.walkPhase = 0;
    this.knock = new THREE.Vector3();

    this.waves = [];
    this.events = [];
    this.hitstop = 0;
    this.fwd = new THREE.Vector3(0, 0, 1);
    this._tmp = new THREE.Vector3();
    this.blink = 0;
    this.kills = 0;
    this.lookIdle = 10;     // 마지막 수동 시점 조작 후 경과 시간
    this.aim = null;        // 조준 중: { act, t, yaw }
    this.aimMesh = null;
    this.rushCd = 0;
    this.camTarget = null;  // 소프트 록온 대상
    this._camPos = new THREE.Vector3();
    this._camLook = new THREE.Vector3();
  }

  // 스킬 트리 효과 적용 (선택 시/학습 시 호출)
  applySkills() {
    const s = this.ch.stats;
    const has = (id) => this.progress && this.progress.has(id);
    const eq = this.progress ? sumEquipment(this.progress.equipped) : {};
    const g = (k) => eq[k] || 0;
    this.skill = {
      dmgMul: s.dmg * (has('atk1') ? 1.15 : 1) * (1 + g('dmg')),
      comboBonus: has('atk2'),
      heavyPlus: has('atk3'),
      regen: (has('def3') ? 0.8 : 0) + g('regen'),
      dashCooldown: s.dashCooldown * (has('def2') ? 0.6 : 1) * Math.max(0.3, 1 - g('dash')),
      dashInvulnBonus: has('def2') ? 0.3 : 0,
      gaugeMul: s.gauge * (has('tec1') ? 1.5 : 1) * (1 + g('gauge')),
      specialMul: (has('tec2') ? 1.5 : 1) * (1 + g('special')),
      extraWave: has('tec2') ? 1 : 0,
      specialHeal: has('tec3') ? 25 : 0,
      reduce: Math.min(0.6, g('reduce')),
    };
    const prevMax = this.maxHp || 0;
    this.maxHp = Math.round(s.hp + (has('def1') ? 30 : 0) + g('hp'));
    if (prevMax && this.maxHp > prevMax) this.hp = Math.min(this.maxHp, (this.hp || 0) + (this.maxHp - prevMax));
    if (this.hp > this.maxHp) this.hp = this.maxHp;
    this.moveSpeed = s.speed * (1 + g('speed'));
  }

  get forward() { return this.fwd.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  get center() { return this._tmp.set(this.pos.x, this.pos.y + 1.1, this.pos.z); }
  get busy() { return !!this.attack; }
  get specialReady() { return this.gauge >= this.gaugeMax; }

  // ---------- 입력/이동 ----------
  update(dt, input, ctx) {
    this.events.length = 0;
    if (!this.alive) { this._animateDead(dt); return; }

    // 카메라 회전 (수동)
    if (input.mouseDX !== 0 || input.mouseDY !== 0) this.lookIdle = 0; else this.lookIdle += dt;
    this.camYaw -= input.mouseDX * 0.0022;
    this.camPitch = clamp(this.camPitch + input.mouseDY * 0.0018, -0.35, 1.05);

    // 카메라 기준 이동 방향
    const cfx = -Math.sin(this.camYaw), cfz = -Math.cos(this.camYaw);
    const crx = -cfz, crz = cfx;
    let mx = 0, mz = 0;
    if (input.keys.KeyW) { mx += cfx; mz += cfz; }
    if (input.keys.KeyS) { mx -= cfx; mz -= cfz; }
    if (input.keys.KeyD) { mx += crx; mz += crz; }
    if (input.keys.KeyA) { mx -= crx; mz -= crz; }
    if (input.axisX || input.axisY) {
      mx += cfx * input.axisY + crx * input.axisX;
      mz += cfz * input.axisY + crz * input.axisX;
    }
    let ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; ml = 1; }
    this.moving = ml > 0.001;

    // 타이머
    this.invuln = Math.max(0, this.invuln - dt);
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.blink = Math.max(0, this.blink - dt);
    if (this.comboTimer > 0) { this.comboTimer -= dt; if (this.comboTimer <= 0) this.combo = 0; }
    this.comboPop = Math.max(0, this.comboPop - dt * 4);
    if (this.comboResetTimer > 0 && !this.attack) {
      this.comboResetTimer -= dt;
      if (this.comboResetTimer <= 0) this.nextLight = 'light1';
    }
    if (this.skill.regen > 0 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + this.skill.regen * dt);

    // 대시
    if (input.dash && this.dashCooldown <= 0 && this.dashTime <= 0 && !(this.attack && this.attack.def.special)) {
      this.dashTime = DASH_TIME;
      this.dashCooldown = this.skill.dashCooldown;
      if (ml > 0) this.dashDir.set(mx, 0, mz).normalize(); else this.dashDir.copy(this.forward);
      this.yaw = Math.atan2(this.dashDir.x, this.dashDir.z);
      this.attack = null; this.queued = null;
      this.invuln = Math.max(this.invuln, DASH_TIME + 0.05 + this.skill.dashInvulnBonus);
      ctx.effects.burst(this.center, { count: 14, colors: [this.ch.colors.glow, 0xe0f0ff], speed: 2, life: 0.4, size: 0.5, gravity: 0, drag: 2 });
      this.events.push({ type: 'dash' });
    }
    input.dash = false;

    // ---- 공격 입력: 짧게 누르면 즉시, 길게 누르면 조준(부채꼴 표시) 후 떼면 발동 ----
    this.rushCd = Math.max(0, this.rushCd - dt);
    const HOLD = 0.2;
    const acts = ['light', 'heavy', 'tech1', 'tech2'];
    const actToAttack = { light: this.nextLight, heavy: 'heavy', tech1: 'light3', tech2: 'rush' };
    const hold = input.hold || {}, release = input.release || {};
    if (!this.aim) {
      for (const a of acts) if (hold[a] && (hold[a] += dt) >= HOLD && !(this.attack && this.attack.def.special)) {
        this.aim = { act: a, t: 0, yaw: this.camYaw + Math.PI };
        break;
      }
    }
    if (this.aim) {
      const a = this.aim; a.t += dt;
      // 조준 방향: 조이스틱/이동키가 있으면 그 방향, 아니면 카메라 정면 (마우스로 회전)
      if (ml > 0.2) a.yaw = angleLerp(a.yaw, Math.atan2(mx, mz), 1 - Math.exp(-14 * dt)); else a.yaw = angleLerp(a.yaw, this.camYaw + Math.PI, 1 - Math.exp(-10 * dt));
      this.yaw = angleLerp(this.yaw, a.yaw, 1 - Math.exp(-14 * dt));
      this._showAim(ctx, a);
      if (release[a.act] || !hold[a.act]) {
        this._hideAim();
        const name = actToAttack[a.act] || 'light1';
        if (!(name === 'rush' && this.rushCd > 0)) { this.yaw = a.yaw; this._startAttack(name, ctx, { aimed: true }); }
        this.aim = null;
      }
    } else {
      // 짧은 탭
      for (const a of acts) {
        if (!release[a]) continue;
        const name = actToAttack[a];
        if (name === 'rush' && this.rushCd > 0) continue;
        if (!this.attack) this._startAttack(name, ctx);
        else if (!this.attack.def.special && this.attack.t >= this.attack.def.active[0]) {
          if (a === 'light' && this.attack.def.next) this.queued = this.attack.def.next;
          else if (name !== this.attack.name) this.queued = name;
        }
      }
    }
    for (const a of acts) { if (release[a]) hold[a] = 0; release[a] = false; }
    input.light = input.heavy = input.tech1 = input.tech2 = false;
    if (input.special && this.specialReady && !(this.attack && this.attack.def.special)) {
      this.gauge = 0;
      this._startAttack('special', ctx);
      this.invuln = Math.max(this.invuln, ATTACKS.special.dur);
      if (this.skill.specialHeal) {
        this.hp = Math.min(this.maxHp, this.hp + this.skill.specialHeal);
        for (const e of ctx.enemies) if (e.targetable && Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z) < 8) e.stagger = Math.max(e.stagger, 1.2);
      }
      this.events.push({ type: 'special' });
    }
    // 회복약
    if (input.potion) {
      if (this.progress && this.hp < this.maxHp && this.progress.usePotion()) {
        this.heal(POTION_HEAL);
        ctx.effects.burst(this.center, { count: 24, colors: [0xff6080, 0xffb0c0, 0xffffff], speed: 2, life: 0.8, size: 0.4, gravity: 2, drag: 1, up: 2 });
        this.events.push({ type: 'potion' });
      } else this.events.push({ type: 'potionFail' });
    }
    input.special = input.potion = false;

    // 이동
    const move = new THREE.Vector3();
    if (this.dashTime > 0) {
      this.dashTime -= dt;
      move.copy(this.dashDir).multiplyScalar(DASH_SPEED * dt);
      ctx.effects.emit({ pos: this.center, vel: new THREE.Vector3(rand(-1, 1), rand(0, 1), rand(-1, 1)), life: 0.3, size: 0.6, color: this.ch.colors.glow, drag: 2 });
    } else if (this.attack) {
      const a = this.attack; const d = a.def; const w = d.active[0];
      if (a.t < w && ml > 0) this.yaw = angleLerp(this.yaw, Math.atan2(mx, mz), 1 - Math.exp(-14 * dt));
      if (a.t >= w * 0.6 && a.t < d.active[1] && d.lunge) move.copy(this.forward).multiplyScalar(d.lunge * dt);
    } else if (ml > 0 && !this.aim) {
      move.set(mx, 0, mz).multiplyScalar(this.moveSpeed * dt);
      this.yaw = angleLerp(this.yaw, Math.atan2(mx, mz), 1 - Math.exp(-12 * dt));
    } else if (ml > 0 && this.aim) {
      move.set(mx, 0, mz).multiplyScalar(this.moveSpeed * 0.35 * dt);
    }
    move.addScaledVector(this.knock, dt);
    this.knock.multiplyScalar(Math.max(0, 1 - 7 * dt));
    this.pos.add(move);
    ctx.stage.resolveCollisions(this.pos, this.radius);
    this.pos.y = 0;

    if (this.attack) this._updateAttack(dt, ctx);
    this._updateWaves(dt, ctx);
    this._updateCamTarget(ctx);
    this._animate(dt);
    this.group.rotation.y = this.yaw;
  }

  // 소프트 록온 대상: 가까운 적 (10m 이내)
  _updateCamTarget(ctx) {
    let best = null, bestD = 10;
    for (const e of ctx.enemies) {
      if (!e.targetable) continue;
      const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z) - (e.isBoss ? 2 : 0);
      if (d < bestD) { bestD = d; best = e; }
    }
    this.camTarget = best;
  }

  // ---------- 공격 ----------
  _attackDamage(d) {
    let dmg = d.dmg * this.skill.dmgMul;
    if (d.special) dmg = this.ch.special.dmg * this.skill.dmgMul * this.skill.specialMul;
    if (this.skill.comboBonus && this.combo >= 8) dmg *= 1.25;
    return dmg;
  }

  _startAttack(name, ctx, opt = {}) {
    const def = ATTACKS[name];
    if (!def) return;
    this.attack = { name, def, t: 0, hitSet: new Set(), fxDone: false, waveDone: false, waveCount: 0, aimed: !!opt.aimed };
    this.queued = null;
    if (def.rush) this.rushCd = def.cooldown;
    if (name.startsWith('light')) { this.nextLight = def.next || 'light1'; this.comboResetTimer = 0.55; }
    else this.nextLight = 'light1';
    if (!opt.aimed && (!this.moving || def.special)) this.yaw = this.camYaw + Math.PI;
    // 조준 보정: 조준한 공격은 없음. 짧은 탭은 정면 ±25° 안의 가까운 적에게만
    if (!opt.aimed && !def.special && ctx.enemies) {
      let best = null, bestD = def.range + 1.5;
      const limit = 0.45;
      for (const e of ctx.enemies) {
        if (!e.targetable) continue;
        const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > bestD) continue;
        const ang = Math.atan2(dx, dz);
        if (Math.abs(angleDiff(this.yaw, ang)) > limit) continue;
        best = ang; bestD = d;
      }
      if (best !== null) this.yaw = best;
    }
    this.events.push({ type: 'swing', heavy: !!def.heavy, special: !!def.special });
    // 기술명 연출 (유파 형)
    const mv = this.ch.moves || {};
    if (name === 'light3' && mv.l3) this.events.push({ type: 'move', name: mv.l3, tier: 1 });
    if (name === 'heavy' && mv.heavy) this.events.push({ type: 'move', name: mv.heavy, tier: 2 });
    if (name === 'rush') { this.events.push({ type: 'move', name: mv.rush || '돌진 베기', tier: 2 }); this.invuln = Math.max(this.invuln, 0.35); }
    if (def.special) {
      const sp = this.ch.special;
      this.events.push({ type: 'move', name: mv.special || sp.name, tier: 3 });
      ctx.effects.shockwave(this.pos, { color: sp.c1, radius: 3, life: 0.5, y: 0.1 });
      ctx.effects.burst(this.center, { count: 40, colors: [sp.c1, sp.c2, sp.c3], speed: 3, life: 0.8, size: 0.45, gravity: 1.5, drag: 1, up: 2 });
    }
  }

  _updateAttack(dt, ctx) {
    const a = this.attack; const d = a.def;
    a.t += dt;
    const [as, ae] = d.active;
    const sp = this.ch.special;
    const heavyPlus = d.heavy && this.skill.heavyPlus;
    const range = d.special ? sp.range : d.range * (heavyPlus ? 1.4 : 1);

    if (!a.fxDone && a.t >= as) {
      a.fxDone = true;
      const fx = d.fx;
      const rOut = d.special ? sp.range - 0.2 : (fx.rOut || d.range) * (heavyPlus ? 1.4 : 1);
      // 겹 궤적: 테마 색 + 흰색 잔상
      ctx.effects.slashArc(this.pos, this.yaw, { rIn: 0.5, rOut, angle: Math.min(d.arc, Math.PI * 1.1), tilt: fx.tilt, roll: fx.roll, color: sp.c1, life: d.special ? 0.45 : 0.26, sweep: fx.sweep, y: fx.y });
      ctx.effects.slashArc(this.pos, this.yaw, { rIn: 0.5, rOut: rOut * 0.85, angle: Math.min(d.arc, Math.PI * 1.1) * 0.8, tilt: fx.tilt, roll: fx.roll, color: 0xffffff, life: d.special ? 0.35 : 0.18, sweep: fx.sweep, y: fx.y + 0.05, opacity: 0.5 });
      if (d.special) ctx.effects.slashArc(this.pos, this.yaw + Math.PI, { rIn: 0.5, rOut: sp.range - 0.2, angle: Math.PI * 1.1, tilt: 0.15, color: sp.c2, life: 0.45, sweep: 1, y: 0.9 });
      // 호흡 연출: 검격마다 테마 파티클
      this._themeBurst(ctx, d.special ? 3 : d.heavy || a.name === 'light3' ? 2 : 1, fx.sweep, rOut);
    }
    if (a.t >= as && a.t <= ae) {
      this._hitCheck(a, ctx, range, heavyPlus);
      if (d.special) this._specialParticles(ctx, a.t);
    }
    // 비검: 검기 파동 발사 (스킬로 추가 발사)
    if (d.special) {
      const total = sp.waves + this.skill.extraWave;
      if (a.waveCount < total && a.t >= 0.72 + a.waveCount * 0.22) {
        const spread = total > 1 ? (a.waveCount - (total - 1) / 2) * 0.35 : 0;
        this._launchWave(ctx, spread);
        a.waveCount++;
        this.events.push({ type: 'wave' });
      }
    }
    if (this.queued && a.t >= ae + (d.dur - ae) * 0.45) { this._startAttack(this.queued, ctx); return; }
    if (a.t >= d.dur) {
      this.attack = null;
      this.comboResetTimer = 0.55;
      if (d.special) this.parts.body.rotation.y = 0;
    }
  }

  // 조준 부채꼴 표시
  _showAim(ctx, a) {
    const name = { light: this.nextLight, heavy: 'heavy', tech1: 'light3', tech2: 'rush' }[a.act] || 'light1';
    const def = ATTACKS[name];
    const sp = this.ch.special;
    const range = def.rush ? 6.5 : def.range * (def.heavy && this.skill.heavyPlus ? 1.4 : 1) + 0.3;
    const angle = def.rush ? 0.5 : Math.min(def.arc, Math.PI * 1.1);
    if (!this.aimMesh || this.aimMesh.userData.key !== name) {
      this._hideAim();
      const geo = ctx.effects._arcGeo(0.3, range, angle);
      const m = new THREE.MeshBasicMaterial({ color: sp.c1, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true });
      this.aimMesh = new THREE.Mesh(geo, m); this.aimMesh.userData.key = name;
      // 바깥 테두리 선
      const edgeGeo = ctx.effects._arcGeo(range - 0.12, range + 0.08, angle);
      const edge = new THREE.Mesh(edgeGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
      edge.position.y = 0.01; this.aimMesh.add(edge);
      this.scene.add(this.aimMesh);
    }
    const am = this.aimMesh;
    am.position.set(this.pos.x, 0.16, this.pos.z);
    am.rotation.set(0, a.yaw, 0);
    am.material.opacity = 0.6 + 0.25 * Math.sin(performance.now() * 0.01);
    // 조준선 안의 적 강조 표시 (맞을 대상)
    for (const e of ctx.enemies) {
      if (!e.targetable) continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z; const d = Math.hypot(dx, dz);
      const inRange = d <= range + e.radius && Math.abs(angleDiff(a.yaw, Math.atan2(dx, dz))) <= angle / 2 + 0.1;
      e.hitFlash = Math.max(e.hitFlash, inRange ? 0.35 : 0);
    }
  }
  _hideAim() {
    if (this.aimMesh) { this.scene.remove(this.aimMesh); this.aimMesh.material.dispose(); this.aimMesh = null; }
  }

  // 검격 테마 연출 (물결/번개/지진/불꽃/바람) — 강도 1~3
  _themeBurst(ctx, strength, sweep = 1, radius = 2.5) {
    const sp = this.ch.special; const th = strength >= 3 ? sp.theme : (this.ch.attackTheme || sp.theme);
    const c = this.center; const f = this.forward;
    const n = 10 * strength;
    const fx = f.x, fz = f.z;
    for (let i = 0; i < n; i++) {
      const ang = (i / n - 0.5) * 2.2 * (strength >= 3 ? 2.8 : 1);
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const dx = fx * ca - fz * sa, dz = fx * sa + fz * ca;
      const r = rand(0.6, radius);
      const p = new THREE.Vector3(c.x + dx * r, rand(0.4, 1.6), c.z + dz * r);
      let v, color = i % 3 === 0 ? sp.c3 : i % 3 === 1 ? sp.c2 : sp.c1, life = 0.6, size = 0.4, gravity = 0, drag = 1.5;
      if (th === 'wave') { v = new THREE.Vector3(dx * 2, rand(2, 4), dz * 2); gravity = -7; drag = 0.5; size = 0.3; life = 0.7; }
      else if (th === 'lightning') { v = new THREE.Vector3(rand(-7, 7), rand(-2, 8), rand(-7, 7)); life = 0.22; size = 0.28; color = i % 2 ? 0xffffff : sp.c1; }
      else if (th === 'quake') { p.y = 0.2; v = new THREE.Vector3(dx * 1.5, rand(3, 7), dz * 1.5); gravity = -10; size = 0.45; color = i % 2 ? sp.c2 : 0x8a6a40; }
      else if (th === 'flame') { v = new THREE.Vector3(dx * 1.2 + rand(-0.5, 0.5), rand(2.5, 5.5), dz * 1.2 + rand(-0.5, 0.5)); gravity = 2.5; life = 0.8; size = 0.5; }
      else { v = new THREE.Vector3(-dz * 3 * sweep + dx, rand(1, 3), dx * 3 * sweep + dz); drag = 0.8; life = 0.8; size = 0.35; }
      ctx.effects.emit({ pos: p, vel: v, life, size, color, gravity, drag });
    }
    if (strength >= 2) {
      if (th === 'wave') ctx.effects.shockwave(this.pos, { color: sp.c1, radius: radius * 0.9, life: 0.45, y: 0.12, opacity: 0.6 });
      if (th === 'quake') ctx.effects.shockwave(this.pos, { color: sp.c2, radius: radius, life: 0.5, y: 0.08, opacity: 0.7, width: 0.35 });
      if (th === 'lightning') ctx.effects.burst(c, { count: 5, colors: [0xffffff], speed: 0.5, life: 0.12, size: 2.2, gravity: 0, drag: 0 });
      if (th === 'flame') ctx.effects.burst(c, { count: 14, colors: [sp.c1, sp.c2], speed: 2.5, life: 0.9, size: 0.7, gravity: 3, drag: 1, up: 3 });
      if (th === 'wind') ctx.effects.shockwave(this.pos, { color: sp.c1, radius: radius * 1.1, life: 0.5, y: 0.6, opacity: 0.4, width: 0.12 });
    }
  }

  // 캐릭터별 비검 파티클 테마
  _specialParticles(ctx, t) {
    const c = this.center;
    const sp = this.ch.special;
    const theme = sp.theme;
    for (let i = 0; i < 6; i++) {
      const a = rand(0, Math.PI * 2);
      const r = rand(0.6, sp.range - 0.8);
      const p = new THREE.Vector3(c.x + Math.cos(a) * r, 0.2 + rand(0, 0.6), c.z + Math.sin(a) * r);
      let v;
      if (theme === 'lightning') v = new THREE.Vector3(rand(-6, 6), rand(2, 9), rand(-6, 6));
      else if (theme === 'wind') v = new THREE.Vector3(-Math.sin(a), 1.2, Math.cos(a)).multiplyScalar(rand(3, 7));
      else if (theme === 'quake') v = new THREE.Vector3(Math.cos(a) * 0.5, rand(4, 8), Math.sin(a) * 0.5);
      else v = new THREE.Vector3(Math.cos(a), 0.3, Math.sin(a)).multiplyScalar(rand(2, 5));
      ctx.effects.emit({ pos: p, vel: v, life: theme === 'lightning' ? 0.25 : 0.7, size: theme === 'lightning' ? 0.3 : 0.45, color: i % 3 === 0 ? sp.c3 : sp.c1, drag: 1.5, gravity: theme === 'quake' ? -9 : 0 });
    }
    for (let i = 0; i < 5; i++) {
      const a = rand(0, Math.PI * 2);
      const r = rand(0.3, 2.5);
      const p = new THREE.Vector3(c.x + Math.cos(a) * r, rand(0, 1.2), c.z + Math.sin(a) * r);
      const v = theme === 'wind' ? new THREE.Vector3(-Math.sin(a) * 4, rand(2, 5), Math.cos(a) * 4) : new THREE.Vector3(rand(-0.6, 0.6), rand(2.5, 5), rand(-0.6, 0.6));
      ctx.effects.emit({ pos: p, vel: v, life: 0.9, size: 0.55, color: [sp.c2, sp.c3, sp.c1][i % 3], gravity: theme === 'flame' ? 2.5 : 1.5, drag: 1.2 });
    }
    if (theme === 'quake' && Math.random() < 0.15) ctx.effects.shockwave(this.pos, { color: sp.c1, radius: rand(3, 5.5), life: 0.5, y: 0.1, opacity: 0.5 });
    if (theme === 'lightning' && Math.random() < 0.2) ctx.effects.burst(c, { count: 6, colors: [0xffffff], speed: 1, life: 0.1, size: 1.6, gravity: 0, drag: 0 });
  }

  _launchWave(ctx, spread = 0) {
    const sp = this.ch.special;
    const geo = ctx.effects._arcGeo(0.9, 1.9, 2.3);
    const m = new THREE.MeshBasicMaterial({ color: sp.c1, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true });
    const mesh = new THREE.Mesh(geo, m);
    mesh.rotation.order = 'YXZ';
    mesh.rotation.y = this.yaw + spread;
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(this.pos.x, 1.2, this.pos.z);
    this.scene.add(mesh);
    const dir = new THREE.Vector3(Math.sin(this.yaw + spread), 0, Math.cos(this.yaw + spread));
    this.waves.push({ mesh, mat: m, dir, life: 1.4, maxLife: 1.4, hitSet: new Set(), speed: sp.waveSpeed || 15 });
  }

  _updateWaves(dt, ctx) {
    const sp = this.ch.special;
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.life -= dt;
      w.mesh.position.addScaledVector(w.dir, w.speed * dt);
      const s = 1 + (1 - w.life / w.maxLife) * 1.2;
      w.mesh.scale.set(s, s, s);
      w.mat.opacity = 0.9 * Math.min(1, w.life / 0.4);
      for (let k = 0; k < 3; k++) {
        const side = rand(-1.6, 1.6) * s;
        const p = new THREE.Vector3(w.mesh.position.x - w.dir.z * side, rand(0.3, 2.0), w.mesh.position.z + w.dir.x * side);
        ctx.effects.emit({ pos: p, vel: new THREE.Vector3(rand(-1, 1), rand(1, 3), rand(-1, 1)), life: 0.6, size: 0.5, color: k === 0 ? sp.c2 : sp.c1, drag: 1 });
      }
      for (const e of ctx.enemies) {
        if (!e.targetable || w.hitSet.has(e)) continue;
        const dx = e.pos.x - w.mesh.position.x, dz = e.pos.z - w.mesh.position.z;
        const along = dx * w.dir.x + dz * w.dir.z;
        const lateral = Math.abs(-dx * w.dir.z + dz * w.dir.x);
        if (Math.abs(along) < 1.2 + e.radius && lateral < 1.9 * s + e.radius) {
          w.hitSet.add(e);
          const dir = new THREE.Vector3(dx, 0, dz).normalize();
          this._applyHit(e, { dmg: 45 * this.skill.dmgMul * this.skill.specialMul, knock: 10, stagger: 0.8, gauge: 0, hitstop: 0.06, shake: 0.3, special: true }, dir, ctx);
        }
      }
      for (const p of ctx.projectiles) {
        if (p.alive && p.pos.distanceTo(w.mesh.position) < 2.2 * s) p.destroy(ctx.effects);
      }
      if (w.life <= 0 || Math.hypot(w.mesh.position.x, w.mesh.position.z) > 40) {
        this.scene.remove(w.mesh); w.mat.dispose(); this.waves.splice(i, 1);
      }
    }
  }

  _hitCheck(a, ctx, range, heavyPlus) {
    const d = a.def;
    const f = this.forward;
    const dmg = this._attackDamage(d);
    const knock = d.knock * (heavyPlus ? 1.5 : 1);
    const stagger = heavyPlus ? 1.2 : d.stagger;
    for (const e of ctx.enemies) {
      if (!e.targetable || a.hitSet.has(e)) continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > range + e.radius) continue;
      const cosA = clamp((dx * f.x + dz * f.z) / Math.max(dist, 1e-4), -1, 1);
      if (Math.acos(cosA) > d.arc / 2 && dist > e.radius + 0.5) continue;
      a.hitSet.add(e);
      const dir = new THREE.Vector3(dx, 0, dz).normalize();
      this._applyHit(e, { dmg, knock, stagger, gauge: d.gauge, hitstop: d.hitstop, shake: d.shake, heavy: d.heavy, special: d.special }, dir, ctx);
    }
    for (const p of ctx.projectiles) {
      if (!p.alive || a.hitSet.has(p)) continue;
      const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > range + 0.5) continue;
      const cosA = clamp((dx * f.x + dz * f.z) / Math.max(dist, 1e-4), -1, 1);
      if (Math.acos(cosA) > d.arc / 2 + 0.3) continue;
      a.hitSet.add(p);
      p.destroy(ctx.effects);
      this.gauge = Math.min(this.gaugeMax, this.gauge + 3 * this.skill.gaugeMul);
      this.events.push({ type: 'parry' });
    }
  }

  _applyHit(e, d, dir, ctx) {
    const killed = e.takeHit(d.dmg, dir, d.knock, d.stagger, ctx.effects);
    const hitPos = new THREE.Vector3(e.pos.x - dir.x * e.radius * 0.5, e.pos.y + e.height * 0.55, e.pos.z - dir.z * e.radius * 0.5);
    const sp = this.ch.special;
    ctx.effects.sparks(hitPos, dir, [sp.c1, sp.c2, 0xffffff]);
    ctx.effects.burst(hitPos, { count: 6, colors: [sp.c1, sp.c3], speed: 3, life: 0.4, size: 0.35, gravity: sp.theme === 'flame' ? 2 : -3, drag: 1.5 });
    this.gauge = Math.min(this.gaugeMax, this.gauge + (d.gauge || 0) * this.skill.gaugeMul);
    this.combo += 1;
    this.comboTimer = COMBO_WINDOW;
    this.comboPop = 1;
    this.hitstop = Math.max(this.hitstop, d.hitstop || 0.04);
    ctx.effects.addShake(d.shake || 0.1);
    this.events.push({ type: 'hit', enemy: e, dmg: d.dmg, killed, heavy: !!d.heavy });
    if (killed) { this.kills++; this.gauge = Math.min(this.gaugeMax, this.gauge + 6 * this.skill.gaugeMul); }
  }

  heal(v) { if (this.alive) this.hp = Math.min(this.maxHp, this.hp + v); }

  // ---------- 피격 ----------
  takeDamage(dmg, fromPos, effects) {
    if (!this.alive || this.invuln > 0) return false;
    dmg = Math.round(dmg * (1 - (this.skill.reduce || 0)));
    this.hp = Math.max(0, this.hp - dmg);
    this.invuln = 1.0;
    this.blink = 1.0;
    this.combo = 0; this.comboTimer = 0;
    const dir = new THREE.Vector3(this.pos.x - fromPos.x, 0, this.pos.z - fromPos.z).normalize();
    this.knock.copy(dir).multiplyScalar(6);
    effects.burst(this.center, { count: 16, colors: [0xff3040, 0xff8080, 0xffffff], speed: 4, life: 0.5, size: 0.3, gravity: -5, drag: 2 });
    effects.addShake(0.5);
    this.events.push({ type: 'damaged', dmg });
    if (this.attack && !this.attack.def.special) { this.attack = null; this.queued = null; }
    this._hideAim(); this.aim = null;
    if (this.hp <= 0) { this.alive = false; this.deadT = 0; this.events.push({ type: 'dead' }); }
    return true;
  }

  // ---------- 애니메이션 ----------
  _animate(dt) {
    const P = this.parts; const body = P.body; const ra = P.rightArm; const la = P.leftArm;
    const blinkOn = this.blink > 0 && Math.floor(this.blink * 20) % 2 === 0;
    body.visible = !blinkOn;
    const glow = this.specialReady ? 0.6 + 0.4 * Math.sin(performance.now() * 0.008) : 0.15;
    P.bladeMat.emissiveIntensity = damp(P.bladeMat.emissiveIntensity, glow, 8, dt);

    let tx = 0.15, ty = 0, tz = -0.25;
    let lz = 0.2, lx = 0;
    let bodyTilt = 0, bodyYawOff = 0, bob = 0;

    if (this.attack) {
      const a = this.attack; const d = a.def; const [as, ae] = d.active;
      let pose;
      if (a.t < as) {
        const k = easeOutCubic(a.t / as);
        pose = { x: lerp(-0.6, d.windup.x, k), y: lerp(0, d.windup.y, k), z: lerp(-0.2, d.windup.z, k) };
        bodyYawOff = -0.35 * k * (d.fx.sweep || 0);
      } else if (a.t < ae) {
        const k = easeOutCubic((a.t - as) / (ae - as));
        pose = { x: lerp(d.windup.x, d.end.x, k), y: lerp(d.windup.y, d.end.y, k), z: lerp(d.windup.z, d.end.z, k) };
        bodyYawOff = lerp(-0.35, 0.3, k) * (d.fx.sweep || 0);
        bodyTilt = 0.12 * k;
      } else {
        const k = easeInCubic(clamp((a.t - ae) / (d.dur - ae), 0, 1));
        pose = { x: lerp(d.end.x, 0.15, k), y: lerp(d.end.y, 0, k), z: lerp(d.end.z, -0.25, k) };
        bodyYawOff = lerp(0.3, 0, k) * (d.fx.sweep || 0);
        bodyTilt = 0.12 * (1 - k);
      }
      if (d.special) {
        const spinT = clamp((a.t - as * 0.5) / (ae - as * 0.5), 0, 1);
        bodyYawOff = easeOutCubic(spinT) * Math.PI * 4;
        pose = { x: -1.45, y: -1.3, z: 0 };
        bodyTilt = 0.18 * Math.sin(spinT * Math.PI);
        if (a.t > ae) { const k = clamp((a.t - ae) / (d.dur - ae), 0, 1); pose = { x: lerp(-1.45, -2.4, easeOutBack(Math.min(1, k * 2))), y: lerp(-1.3, 0, k), z: 0 }; if (k > 0.6) pose.x = lerp(-2.4, 0.15, (k - 0.6) / 0.4); }
      }
      tx = pose.x; ty = pose.y; tz = pose.z;
      lx = -0.5; lz = 0.6;
      ra.rotation.set(damp(ra.rotation.x, tx, 30, dt), damp(ra.rotation.y, ty, 30, dt), damp(ra.rotation.z, tz, 30, dt));
    } else {
      if (this.dashTime > 0) { tx = -0.8; tz = -0.6; bodyTilt = 0.4; lx = -0.9; }
      else if (this.aim) { tx = -0.9; ty = -0.6; lx = -0.4; bodyTilt = 0.05; }
      else if (this.moving) {
        this.walkPhase += dt * 11;
        lx = Math.sin(this.walkPhase) * 0.55;
        tx = -Math.sin(this.walkPhase) * 0.4 + 0.1;
        bob = Math.abs(Math.sin(this.walkPhase)) * 0.06;
        bodyTilt = 0.08;
      } else {
        const t = performance.now() * 0.0015;
        tx = 0.15 + Math.sin(t) * 0.04;
        bob = Math.sin(t * 1.3) * 0.015;
      }
      ra.rotation.set(damp(ra.rotation.x, tx, 12, dt), damp(ra.rotation.y, ty, 12, dt), damp(ra.rotation.z, tz, 12, dt));
    }
    la.rotation.x = damp(la.rotation.x, lx, 12, dt);
    la.rotation.z = damp(la.rotation.z, lz, 12, dt);
    body.rotation.x = damp(body.rotation.x, bodyTilt, 12, dt);
    body.rotation.y = this.attack && this.attack.def.special ? bodyYawOff : damp(body.rotation.y, bodyYawOff, 20, dt);
    body.position.y = bob;
    for (let i = 0; i < P.feet.length; i++) {
      const f = P.feet[i]; const left = i < 3;
      const base = i % 3 === 2 ? 0.1 : 0.06;
      f.position.z = this.moving && !this.attack ? base + (left ? 1 : -1) * Math.sin(this.walkPhase) * 0.2 : damp(f.position.z, base, 10, dt);
    }
    P.scarfTail.rotation.x = 0.35 + Math.sin(performance.now() * 0.004) * 0.15 + (this.moving ? 0.5 : 0);
    animateFace(P, dt);
  }

  _animateDead(dt) {
    this.deadT += dt;
    const k = clamp(this.deadT / 0.8, 0, 1);
    this.parts.body.rotation.x = lerp(0, -Math.PI / 2 + 0.2, easeOutCubic(k));
    this.parts.body.position.y = lerp(0, 0.25, k);
    this.parts.body.visible = true;
  }

  // ---------- 카메라: 팔로우 + 소프트 록온 + 지연/선행 ----------
  updateCamera(camera, dt, shake) {
    const auto = this.lookIdle > 0.7 && this.alive;
    if (auto) {
      // 1) 이동 방향으로 서서히 돌아감 (카메라 쪽으로 걸어올 때는 제외)
      if (this.moving && this.dashTime <= 0) {
        const behind = this.yaw + Math.PI;
        const diff = angleDiff(this.camYaw, behind);
        // 앞쪽(±70°)으로 걸을 때만 따라 돔. 옆걸음·뒷걸음은 유지 → 끝없이 도는 현상 방지
        if (Math.abs(diff) < 1.22) this.camYaw = angleLerp(this.camYaw, behind, 1 - Math.exp(-1.1 * dt));
      }
      // 2) 가까운 적을 화면에 담도록 살짝 회전 (소프트 록온)
      if (this.camTarget) {
        const e = this.camTarget;
        const toEnemy = Math.atan2(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
        const want = toEnemy + Math.PI;
        const diff = angleDiff(this.camYaw, want);
        if (Math.abs(diff) < 2.6) this.camYaw = angleLerp(this.camYaw, want, 1 - Math.exp(-0.9 * dt));
      }
      // 3) 피치는 기본값으로 천천히 복귀
      this.camPitch = damp(this.camPitch, 0.3, 0.6, dt);
    }

    const dist = 5.8 + (this.dashTime > 0 ? 0.6 : 0);
    const cp = this.camPitch;
    // 시선 목표: 플레이어 + 이동 방향 선행 + 록온 대상 쪽 약간
    const look = this._camLook;
    look.set(this.pos.x, this.pos.y + 1.5, this.pos.z);
    if (this.moving) look.addScaledVector(this.forward, 0.8);
    if (this.camTarget) {
      const e = this.camTarget;
      look.x += (e.pos.x - this.pos.x) * 0.18; look.z += (e.pos.z - this.pos.z) * 0.18;
    }
    if (!this._lookSmooth) this._lookSmooth = look.clone();
    this._lookSmooth.x = damp(this._lookSmooth.x, look.x, 6, dt);
    this._lookSmooth.y = damp(this._lookSmooth.y, look.y, 6, dt);
    this._lookSmooth.z = damp(this._lookSmooth.z, look.z, 6, dt);

    const desired = this._camPos.set(
      this.pos.x + Math.sin(this.camYaw) * Math.cos(cp) * dist,
      this.pos.y + 1.5 + Math.sin(cp) * dist + 0.4,
      this.pos.z + Math.cos(this.camYaw) * Math.cos(cp) * dist,
    );
    desired.y = Math.max(desired.y, 0.6);
    if (!this._camInit) { camera.position.copy(desired); this._camInit = true; }
    const lam = this.lookIdle < 0.7 ? 22 : 9; // 수동 조작 중엔 즉각, 자동일 땐 부드럽게
    camera.position.x = damp(camera.position.x, desired.x, lam, dt);
    camera.position.y = damp(camera.position.y, desired.y, lam, dt);
    camera.position.z = damp(camera.position.z, desired.z, lam, dt);
    if (shake > 0) {
      const s = shake * shake * 0.35;
      camera.position.x += rand(-s, s); camera.position.y += rand(-s, s); camera.position.z += rand(-s, s);
    }
    camera.lookAt(this._lookSmooth);
  }
}
