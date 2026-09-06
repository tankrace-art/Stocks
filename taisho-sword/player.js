// player.js — 검사 캐릭터: 이동/카메라/대시/3연타/강공격/특수기(비검·파염)
import * as THREE from 'three';
import { clamp, lerp, damp, rand, angleLerp, easeOutCubic, easeInCubic, easeOutBack } from './util.js';

const MOVE_SPEED = 6.2;
const DASH_SPEED = 21;
const DASH_TIME = 0.2;
const DASH_COOLDOWN = 0.75;
const GAUGE_MAX = 100;
const COMBO_WINDOW = 2.4;   // 마지막 타격 후 콤보 유지 시간
const PLAYER_RADIUS = 0.42;

// 공격 정의. pose: 오른팔 회전 (x,y,z), t는 0~1 정규화 시간
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
  special: {
    dur: 1.35, active: [0.28, 0.62], dmg: 55, range: 4.6, arc: Math.PI * 2 + 1, knock: 13, gauge: 0, lunge: 0,
    windup: { x: -1.4, y: -1.2, z: 0 }, end: { x: -1.4, y: -1.2, z: 0 },
    fx: { sweep: 1, tilt: 0, roll: 0, color: 0x9cd0ff, y: 1.1, rOut: 4.4 }, stagger: 1.0, hitstop: 0.14, shake: 0.7,
    next: null, special: true,
  },
};

function mat(color, extra = {}) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
}

// ---------- 모델 ----------
function buildModel() {
  const g = new THREE.Group();
  const parts = {};

  const kimono = 0x2d4370;   // 남색 기모노
  const hakamaC = 0x1b1f33;  // 짙은 남색 하카마
  const skin = 0xe9c7a4;

  // 하카마 (치마 형태)
  const hakama = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.46, 0.9, 7), mat(hakamaC));
  hakama.position.y = 0.47;
  // 발
  const footGeo = new THREE.BoxGeometry(0.16, 0.08, 0.28);
  const footL = new THREE.Mesh(footGeo, mat(0x201a16)); footL.position.set(-0.14, 0.04, 0.05);
  const footR = new THREE.Mesh(footGeo, mat(0x201a16)); footR.position.set(0.14, 0.04, 0.05);
  // 몸통
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.34), mat(kimono));
  torso.position.y = 1.2;
  // 하오리 (겉옷, 등 쪽)
  const haori = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.16), mat(0x1c1c24));
  haori.position.set(0, 1.15, -0.14);
  // 오비
  const obi = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.13, 0.38), mat(0x8e2b2b));
  obi.position.y = 0.9;
  // 목/머리
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.12, 6), mat(skin));
  neck.position.y = 1.55;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 9, 7), mat(skin));
  head.position.y = 1.74;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.235, 9, 7, 0, Math.PI * 2, 0, Math.PI * 0.52), mat(0x15111a));
  hair.position.y = 1.76;
  // 다이쇼풍 학생모
  const capBody = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.22, 0.1, 9), mat(0x0f1220));
  capBody.position.y = 1.95;
  const capVisor = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.03, 0.14), mat(0x0b0c14));
  capVisor.position.set(0, 1.91, 0.24);
  // 목도리 (흰 머플러)
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.075, 6, 10), mat(0xf1e9d6));
  scarf.position.y = 1.52; scarf.rotation.x = Math.PI / 2;
  const scarfTail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.05), mat(0xf1e9d6));
  scarfTail.position.set(-0.12, 1.25, -0.25); scarfTail.rotation.x = 0.35;
  parts.scarfTail = scarfTail;

  // 왼팔
  const armGeo = new THREE.CylinderGeometry(0.075, 0.065, 0.56, 6);
  armGeo.translate(0, -0.28, 0);
  const leftArm = new THREE.Group(); leftArm.position.set(-0.34, 1.45, 0);
  const leftArmMesh = new THREE.Mesh(armGeo, mat(kimono));
  const leftHand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), mat(skin)); leftHand.position.y = -0.58;
  leftArm.add(leftArmMesh, leftHand);
  leftArm.rotation.z = 0.2;
  parts.leftArm = leftArm;

  // 오른팔 + 카타나
  const rightArm = new THREE.Group(); rightArm.position.set(0.34, 1.45, 0);
  const rightArmMesh = new THREE.Mesh(armGeo, mat(kimono));
  const rightHand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), mat(skin)); rightHand.position.y = -0.58;
  rightArm.add(rightArmMesh, rightHand);
  rightArm.rotation.order = 'YXZ';

  const katana = new THREE.Group();
  katana.position.set(0, -0.58, 0);
  const tsuka = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.3, 6), mat(0x2a1e1c)); tsuka.rotation.x = Math.PI / 2;
  const tsukaWrap = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.12, 6), mat(0x8a1f1f)); tsukaWrap.rotation.x = Math.PI / 2; tsukaWrap.position.z = -0.02;
  const tsuba = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.022, 8), mat(0x9a8a45)); tsuba.rotation.x = Math.PI / 2; tsuba.position.z = 0.16;
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0xe6edf5, metalness: 0.85, roughness: 0.22, emissive: 0x3060a0, emissiveIntensity: 0.15 });
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.07, 1.0), bladeMat); blade.position.z = 0.68;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 4), bladeMat); tip.rotation.x = Math.PI / 2; tip.position.z = 1.24; tip.rotation.z = Math.PI / 4;
  katana.add(tsuka, tsukaWrap, tsuba, blade, tip);
  katana.rotation.x = -1.05; // 손에서 앞-위로 뻗음
  rightArm.add(katana);
  parts.rightArm = rightArm;
  parts.katana = katana;
  parts.bladeMat = bladeMat;

  // 칼집 (왼쪽 허리)
  const saya = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 1.05, 6), mat(0x11111a));
  saya.position.set(-0.2, 0.85, -0.15);
  saya.rotation.set(1.35, 0, 0.25);

  g.add(hakama, footL, footR, torso, haori, obi, neck, head, hair, capBody, capVisor, scarf, scarfTail, leftArm, rightArm, saya);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  parts.body = g;
  parts.feet = [footL, footR];
  return parts;
}

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.parts = buildModel();
    this.group = new THREE.Group();
    this.group.add(this.parts.body);
    scene.add(this.group);

    this.pos = this.group.position;
    this.pos.set(0, 0, 4);
    this.vel = new THREE.Vector3();
    this.yaw = Math.PI;         // 모델 정면 각도 (+Z 기준)
    this.camYaw = 0;
    this.camPitch = 0.28;
    this.radius = PLAYER_RADIUS;
    this.height = 1.9;

    this.hp = 100; this.maxHp = 100;
    this.gauge = 0; this.gaugeMax = GAUGE_MAX;
    this.combo = 0; this.comboTimer = 0; this.comboPop = 0;
    this.invuln = 0;
    this.alive = true;

    this.attack = null;          // {def, t, hitSet, name}
    this.queued = null;          // 다음 공격 예약
    this.comboResetTimer = 0;    // 연타 단계 초기화 타이머
    this.nextLight = 'light1';

    this.dashTime = 0; this.dashCooldown = 0; this.dashDir = new THREE.Vector3();
    this.moving = false; this.walkPhase = 0;
    this.knock = new THREE.Vector3();

    this.waves = [];             // 특수기 검기 파동
    this.events = [];            // 이번 프레임 이벤트 (hit, damaged, special...)
    this.hitstop = 0;
    this.fwd = new THREE.Vector3(0, 0, 1);
    this._tmp = new THREE.Vector3();
    this.blink = 0;
    this.kills = 0;
  }

  get forward() {
    return this.fwd.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }
  get center() { return this._tmp.set(this.pos.x, this.pos.y + 1.1, this.pos.z); }
  get busy() { return !!this.attack; }
  get specialReady() { return this.gauge >= this.gaugeMax; }

  // ---------- 입력/이동 ----------
  update(dt, input, ctx) {
    this.events.length = 0;
    if (!this.alive) { this._animateDead(dt); return; }

    // 카메라 회전
    this.camYaw -= input.mouseDX * 0.0022;
    this.camPitch = clamp(this.camPitch + input.mouseDY * 0.0018, -0.35, 1.05);

    // 카메라 기준 방향
    const cfx = -Math.sin(this.camYaw), cfz = -Math.cos(this.camYaw);
    const crx = -cfz, crz = cfx;
    let mx = 0, mz = 0;
    if (input.keys.KeyW) { mx += cfx; mz += cfz; }
    if (input.keys.KeyS) { mx -= cfx; mz -= cfz; }
    if (input.keys.KeyD) { mx += crx; mz += crz; }
    if (input.keys.KeyA) { mx -= crx; mz -= crz; }
    const ml = Math.hypot(mx, mz);
    if (ml > 0) { mx /= ml; mz /= ml; }
    this.moving = ml > 0;

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

    // 대시
    if (input.dash && this.dashCooldown <= 0 && this.dashTime <= 0 && !(this.attack && this.attack.def.special)) {
      this.dashTime = DASH_TIME;
      this.dashCooldown = DASH_COOLDOWN;
      if (ml > 0) this.dashDir.set(mx, 0, mz); else this.dashDir.copy(this.forward);
      this.yaw = Math.atan2(this.dashDir.x, this.dashDir.z);
      this.attack = null; this.queued = null;
      this.invuln = Math.max(this.invuln, DASH_TIME + 0.05);
      ctx.effects.burst(this.center, { count: 14, colors: [0x9cc8ff, 0xe0f0ff], speed: 2, life: 0.4, size: 0.5, gravity: 0, drag: 2 });
      this.events.push({ type: 'dash' });
    }
    input.dash = false;

    // 공격 입력
    if (input.light) {
      if (!this.attack) this._startAttack(this.nextLight, ctx);
      else if (this.attack.def.next && this.attack.t >= this.attack.def.active[0]) this.queued = this.attack.def.next;
    }
    if (input.heavy) {
      if (!this.attack) this._startAttack('heavy', ctx);
      else if (!this.attack.def.heavy && !this.attack.def.special && this.attack.t >= this.attack.def.active[0]) this.queued = 'heavy';
    }
    if (input.special && this.specialReady && !(this.attack && this.attack.def.special)) {
      this.gauge = 0;
      this._startAttack('special', ctx);
      this.invuln = Math.max(this.invuln, ATTACKS.special.dur);
      this.events.push({ type: 'special' });
    }
    input.light = input.heavy = input.special = false;

    // 이동 처리
    const move = new THREE.Vector3();
    if (this.dashTime > 0) {
      this.dashTime -= dt;
      move.copy(this.dashDir).multiplyScalar(DASH_SPEED * dt);
      // 잔상 파티클
      ctx.effects.emit({ pos: this.center, vel: new THREE.Vector3(rand(-1, 1), rand(0, 1), rand(-1, 1)), life: 0.3, size: 0.6, color: 0x8ab8ff, drag: 2 });
    } else if (this.attack) {
      // 공격 중엔 정면 유지 + 런지
      const a = this.attack;
      const d = a.def;
      const w = d.active[0];
      if (a.t < w) {
        // 준비 단계에서 이동 입력 방향으로 살짝 조준 회전 허용
        if (ml > 0) this.yaw = angleLerp(this.yaw, Math.atan2(mx, mz), 1 - Math.exp(-14 * dt));
      }
      if (a.t >= w * 0.6 && a.t < d.active[1] && d.lunge) {
        const f = this.forward;
        move.copy(f).multiplyScalar(d.lunge * dt);
      }
    } else if (ml > 0) {
      move.set(mx, 0, mz).multiplyScalar(MOVE_SPEED * dt);
      this.yaw = angleLerp(this.yaw, Math.atan2(mx, mz), 1 - Math.exp(-12 * dt));
    }
    // 넉백
    move.addScaledVector(this.knock, dt);
    this.knock.multiplyScalar(Math.max(0, 1 - 7 * dt));
    this.pos.add(move);
    ctx.stage.resolveCollisions(this.pos, this.radius);
    this.pos.y = 0;

    // 공격 진행
    if (this.attack) this._updateAttack(dt, ctx);

    // 검기 파동
    this._updateWaves(dt, ctx);

    // 애니메이션
    this._animate(dt);
    this.group.rotation.y = this.yaw;
  }

  // ---------- 공격 ----------
  _startAttack(name, ctx) {
    const def = ATTACKS[name];
    this.attack = { name, def, t: 0, hitSet: new Set(), fxDone: false, dmgDone: false, waveDone: false };
    this.queued = null;
    if (name.startsWith('light')) {
      this.nextLight = def.next || 'light1';
      this.comboResetTimer = 0.55;
    } else {
      this.nextLight = 'light1';
    }
    // 공격 시작 시 카메라 정면으로 조준 (이동 입력 없으면)
    if (!this.moving || def.special) this.yaw = this.camYaw + Math.PI;
    if (def.special) {
      ctx.effects.shockwave(this.pos, { color: 0x6aa8ff, radius: 3, life: 0.5, y: 0.1 });
      ctx.effects.burst(this.center, { count: 40, colors: [0x7fb8ff, 0xffffff, 0xffa040], speed: 3, life: 0.8, size: 0.45, gravity: 1.5, drag: 1, up: 2 });
    }
  }

  _updateAttack(dt, ctx) {
    const a = this.attack;
    const d = a.def;
    a.t += dt;
    const [as, ae] = d.active;

    // 궤적 이펙트
    if (!a.fxDone && a.t >= as) {
      a.fxDone = true;
      const fx = d.fx;
      ctx.effects.slashArc(this.pos, this.yaw, {
        rIn: 0.5, rOut: fx.rOut || d.range, angle: Math.min(d.arc, Math.PI * 1.1), tilt: fx.tilt, roll: fx.roll,
        color: fx.color, life: d.special ? 0.45 : 0.22, sweep: fx.sweep, y: fx.y,
      });
      if (d.special) {
        ctx.effects.slashArc(this.pos, this.yaw + Math.PI, { rIn: 0.5, rOut: fx.rOut, angle: Math.PI * 1.1, tilt: 0.15, color: 0xffb060, life: 0.45, sweep: 1, y: 0.9 });
      }
    }

    // 판정
    if (a.t >= as && a.t <= ae) {
      this._hitCheck(a, ctx);
      if (d.special) this._specialParticles(ctx, a.t);
    }

    // 특수기: 검기 파동 발사
    if (d.special && !a.waveDone && a.t >= 0.72) {
      a.waveDone = true;
      this._launchWave(ctx);
    }

    // 연타 캔슬 (회복 단계 일부 생략)
    if (this.queued && a.t >= ae + (d.dur - ae) * 0.45) {
      const n = this.queued;
      this._startAttack(n, ctx);
      return;
    }
    if (a.t >= d.dur) {
      this.attack = null;
      this.comboResetTimer = 0.55;
      if (d.special) this.parts.body.rotation.y = 0;
    }
  }

  _specialParticles(ctx, t) {
    // 물결(푸른 링 파동) + 불꽃(주황 상승)
    const c = this.center;
    for (let i = 0; i < 6; i++) {
      const a = rand(0, Math.PI * 2);
      const r = rand(0.6, 3.8);
      const p = new THREE.Vector3(c.x + Math.cos(a) * r, 0.2 + rand(0, 0.6), c.z + Math.sin(a) * r);
      const v = new THREE.Vector3(Math.cos(a), 0.3, Math.sin(a)).multiplyScalar(rand(2, 5));
      ctx.effects.emit({ pos: p, vel: v, life: 0.7, size: 0.45, color: i % 3 === 0 ? 0xffffff : 0x6fb6ff, drag: 1.5 });
    }
    for (let i = 0; i < 5; i++) {
      const a = rand(0, Math.PI * 2);
      const r = rand(0.3, 2.5);
      const p = new THREE.Vector3(c.x + Math.cos(a) * r, rand(0, 1.2), c.z + Math.sin(a) * r);
      const v = new THREE.Vector3(rand(-0.6, 0.6), rand(2.5, 5), rand(-0.6, 0.6));
      ctx.effects.emit({ pos: p, vel: v, life: 0.9, size: 0.55, color: [0xff8a2a, 0xffc050, 0xff4a20][i % 3], gravity: 1.5, drag: 1.2 });
    }
  }

  _launchWave(ctx) {
    const geo = ctx.effects._arcGeo(0.9, 1.9, 2.3);
    const m = new THREE.MeshBasicMaterial({ color: 0x9fd4ff, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true });
    const mesh = new THREE.Mesh(geo, m);
    mesh.rotation.order = 'YXZ';
    mesh.rotation.y = this.yaw;
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(this.pos.x, 1.2, this.pos.z);
    this.scene.add(mesh);
    const dir = this.forward.clone();
    this.waves.push({ mesh, mat: m, dir, life: 1.4, maxLife: 1.4, hitSet: new Set(), speed: 15 });
  }

  _updateWaves(dt, ctx) {
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.life -= dt;
      w.mesh.position.addScaledVector(w.dir, w.speed * dt);
      const s = 1 + (1 - w.life / w.maxLife) * 1.2;
      w.mesh.scale.set(s, s, s);
      w.mat.opacity = 0.9 * Math.min(1, w.life / 0.4);
      // 궤적 파티클: 푸른 물결 + 불꽃
      for (let k = 0; k < 3; k++) {
        const side = rand(-1.6, 1.6) * s;
        const p = new THREE.Vector3(w.mesh.position.x - w.dir.z * side, rand(0.3, 2.0), w.mesh.position.z + w.dir.x * side);
        ctx.effects.emit({ pos: p, vel: new THREE.Vector3(rand(-1, 1), rand(1, 3), rand(-1, 1)), life: 0.6, size: 0.5, color: k === 0 ? 0xff8a30 : 0x8cc8ff, drag: 1 });
      }
      // 판정
      for (const e of ctx.enemies) {
        if (!e.targetable || w.hitSet.has(e)) continue;
        const dx = e.pos.x - w.mesh.position.x, dz = e.pos.z - w.mesh.position.z;
        const along = dx * w.dir.x + dz * w.dir.z;
        const lateral = Math.abs(-dx * w.dir.z + dz * w.dir.x);
        if (Math.abs(along) < 1.2 + e.radius && lateral < 1.9 * s + e.radius) {
          w.hitSet.add(e);
          const dir = new THREE.Vector3(dx, 0, dz).normalize();
          this._applyHit(e, { dmg: 45, knock: 10, stagger: 0.8, gauge: 0, hitstop: 0.06, shake: 0.3 }, dir, ctx);
        }
      }
      for (const p of ctx.projectiles) {
        if (!p.alive) continue;
        if (p.pos.distanceTo(w.mesh.position) < 2.2 * s) p.destroy(ctx.effects);
      }
      if (w.life <= 0 || Math.hypot(w.mesh.position.x, w.mesh.position.z) > 40) {
        this.scene.remove(w.mesh);
        w.mat.dispose();
        this.waves.splice(i, 1);
      }
    }
  }

  _hitCheck(a, ctx) {
    const d = a.def;
    const f = this.forward;
    for (const e of ctx.enemies) {
      if (!e.targetable || a.hitSet.has(e)) continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > d.range + e.radius) continue;
      const cosA = clamp((dx * f.x + dz * f.z) / Math.max(dist, 1e-4), -1, 1);
      const ang = Math.acos(cosA);
      if (ang > d.arc / 2 && dist > e.radius + 0.5) continue;
      a.hitSet.add(e);
      const dir = new THREE.Vector3(dx, 0, dz).normalize();
      this._applyHit(e, d, dir, ctx);
    }
    // 투사체 베어내기
    for (const p of ctx.projectiles) {
      if (!p.alive || a.hitSet.has(p)) continue;
      const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > d.range + 0.5) continue;
      const cosA = clamp((dx * f.x + dz * f.z) / Math.max(dist, 1e-4), -1, 1);
      if (Math.acos(cosA) > d.arc / 2 + 0.3) continue;
      a.hitSet.add(p);
      p.destroy(ctx.effects);
      this.gauge = Math.min(this.gaugeMax, this.gauge + 3);
      this.events.push({ type: 'parry' });
    }
  }

  _applyHit(e, d, dir, ctx) {
    const killed = e.takeHit(d.dmg, dir, d.knock, d.stagger, ctx.effects);
    const hitPos = new THREE.Vector3(e.pos.x - dir.x * e.radius * 0.5, e.pos.y + e.height * 0.55, e.pos.z - dir.z * e.radius * 0.5);
    ctx.effects.sparks(hitPos, dir, d.special ? [0x9cd0ff, 0xffffff, 0xff9a40] : undefined);
    this.gauge = Math.min(this.gaugeMax, this.gauge + (d.gauge || 0));
    this.combo += 1;
    this.comboTimer = COMBO_WINDOW;
    this.comboPop = 1;
    this.hitstop = Math.max(this.hitstop, d.hitstop || 0.04);
    ctx.effects.addShake(d.shake || 0.1);
    this.events.push({ type: 'hit', enemy: e, dmg: d.dmg, killed });
    if (killed) { this.kills++; this.gauge = Math.min(this.gaugeMax, this.gauge + 6); }
  }

  // ---------- 피격 ----------
  takeDamage(dmg, fromPos, effects) {
    if (!this.alive || this.invuln > 0) return false;
    this.hp = Math.max(0, this.hp - dmg);
    this.invuln = 0.75;
    this.blink = 0.75;
    this.combo = 0; this.comboTimer = 0;
    const dir = new THREE.Vector3(this.pos.x - fromPos.x, 0, this.pos.z - fromPos.z).normalize();
    this.knock.copy(dir).multiplyScalar(6);
    effects.burst(this.center, { count: 16, colors: [0xff3040, 0xff8080, 0xffffff], speed: 4, life: 0.5, size: 0.3, gravity: -5, drag: 2 });
    effects.addShake(0.5);
    this.events.push({ type: 'damaged', dmg });
    if (this.attack && !this.attack.def.special) { this.attack = null; this.queued = null; }
    if (this.hp <= 0) {
      this.alive = false;
      this.deadT = 0;
      this.events.push({ type: 'dead' });
    }
    return true;
  }

  // ---------- 애니메이션 ----------
  _animate(dt) {
    const P = this.parts;
    const body = P.body;
    const ra = P.rightArm;
    const la = P.leftArm;

    // 피격 점멸
    const blinkOn = this.blink > 0 && Math.floor(this.blink * 20) % 2 === 0;
    body.visible = !blinkOn;

    // 게이지 충전 시 검신 발광
    const glow = this.specialReady ? 0.6 + 0.4 * Math.sin(performance.now() * 0.008) : 0.15;
    P.bladeMat.emissiveIntensity = damp(P.bladeMat.emissiveIntensity, glow, 8, dt);
    P.bladeMat.emissive.setHex(this.specialReady ? 0x40a0ff : 0x3060a0);

    let tx = 0.15, ty = 0, tz = -0.25;  // 오른팔 목표
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
        // 회전 베기
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
    // 걷기 발 애니메이션
    const [fl, fr] = P.feet;
    if (this.moving && !this.attack) {
      fl.position.z = 0.05 + Math.sin(this.walkPhase) * 0.2;
      fr.position.z = 0.05 - Math.sin(this.walkPhase) * 0.2;
    } else {
      fl.position.z = damp(fl.position.z, 0.05, 10, dt);
      fr.position.z = damp(fr.position.z, 0.05, 10, dt);
    }
    // 머플러 흔들림
    P.scarfTail.rotation.x = 0.35 + Math.sin(performance.now() * 0.004) * 0.15 + (this.moving ? 0.5 : 0);
  }

  _animateDead(dt) {
    this.deadT += dt;
    const k = clamp(this.deadT / 0.8, 0, 1);
    this.parts.body.rotation.x = lerp(0, -Math.PI / 2 + 0.2, easeOutCubic(k));
    this.parts.body.position.y = lerp(0, 0.25, k);
    this.parts.body.visible = true;
  }

  // 카메라 위치 계산 (main에서 호출)
  updateCamera(camera, dt, shake) {
    const dist = 5.6;
    const cp = this.camPitch;
    const target = new THREE.Vector3(this.pos.x, this.pos.y + 1.5, this.pos.z);
    const off = new THREE.Vector3(
      Math.sin(this.camYaw) * Math.cos(cp) * dist,
      Math.sin(cp) * dist + 0.4,
      Math.cos(this.camYaw) * Math.cos(cp) * dist,
    );
    const desired = target.clone().add(off);
    desired.y = Math.max(desired.y, 0.5);
    if (!this._camInit) { camera.position.copy(desired); this._camInit = true; }
    camera.position.x = damp(camera.position.x, desired.x, 22, dt);
    camera.position.y = damp(camera.position.y, desired.y, 22, dt);
    camera.position.z = damp(camera.position.z, desired.z, 22, dt);
    if (shake > 0) {
      const s = shake * shake * 0.35;
      camera.position.x += rand(-s, s); camera.position.y += rand(-s, s); camera.position.z += rand(-s, s);
    }
    camera.lookAt(target);
  }
}
