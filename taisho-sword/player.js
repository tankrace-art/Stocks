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

// ---------- 모델 (프리미티브 조합, 캐릭터별 색·장식) ----------
function buildModel(ch) {
  const C = ch.colors, L = ch.look || {};
  const g = new THREE.Group();
  const parts = {};
  const skin = 0xe9c7a4;

  const hakama = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.46, 0.9, 7), mat(C.hakama));
  hakama.position.y = 0.47;
  const footGeo = new THREE.BoxGeometry(0.16, 0.08, 0.28);
  const footL = new THREE.Mesh(footGeo, mat(0x201a16)); footL.position.set(-0.14, 0.04, 0.05);
  const footR = new THREE.Mesh(footGeo, mat(0x201a16)); footR.position.set(0.14, 0.04, 0.05);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.34), mat(C.kimono));
  torso.position.y = 1.2;
  const haori = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.16), mat(C.haori));
  haori.position.set(0, 1.15, -0.14);
  const obi = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.13, 0.38), mat(C.obi));
  obi.position.y = 0.9;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.12, 6), mat(skin));
  neck.position.y = 1.55;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 9, 7), mat(skin));
  head.position.y = 1.74;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.235, 9, 7, 0, Math.PI * 2, 0, Math.PI * 0.52), mat(C.hair));
  hair.position.y = 1.76;
  g.add(hakama, footL, footR, torso, haori, obi, neck, head, hair);

  if (L.spikyHair) {
    for (let i = 0; i < 6; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 4), mat(C.hair));
      const a = (i / 6) * Math.PI * 2;
      spike.position.set(Math.cos(a) * 0.15, 1.95, Math.sin(a) * 0.15);
      spike.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
      g.add(spike);
    }
  }
  if (L.cap) {
    const capBody = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.22, 0.1, 9), mat(0x0f1220));
    capBody.position.y = 1.95;
    const capVisor = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.03, 0.14), mat(0x0b0c14));
    capVisor.position.set(0, 1.91, 0.24);
    g.add(capBody, capVisor);
  }
  if (L.kasa) {
    const kasa = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.22, 10), mat(0xc9a86a));
    kasa.position.y = 2.0;
    g.add(kasa);
  }
  if (L.headband) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.07, 9), mat(0xf0e6d2));
    band.position.y = 1.84;
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 0.03), mat(0xf0e6d2));
    tail.position.set(0.05, 1.7, -0.25); tail.rotation.x = 0.4;
    g.add(band, tail);
  }
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.075, 6, 10), mat(C.scarf));
  scarf.position.y = 1.52; scarf.rotation.x = Math.PI / 2;
  const scarfTail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.05), mat(C.scarf));
  scarfTail.position.set(-0.12, 1.25, -0.25); scarfTail.rotation.x = 0.35;
  parts.scarfTail = scarfTail;
  g.add(scarf, scarfTail);

  const armGeo = new THREE.CylinderGeometry(0.075, 0.065, 0.56, 6);
  armGeo.translate(0, -0.28, 0);
  const leftArm = new THREE.Group(); leftArm.position.set(-0.34, 1.45, 0);
  leftArm.add(new THREE.Mesh(armGeo, mat(C.kimono)));
  const leftHand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), mat(skin)); leftHand.position.y = -0.58;
  leftArm.add(leftHand);
  leftArm.rotation.z = 0.2;
  parts.leftArm = leftArm;

  const rightArm = new THREE.Group(); rightArm.position.set(0.34, 1.45, 0);
  rightArm.add(new THREE.Mesh(armGeo, mat(C.kimono)));
  const rightHand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), mat(skin)); rightHand.position.y = -0.58;
  rightArm.add(rightHand);
  rightArm.rotation.order = 'YXZ';

  const bs = L.bladeScale || 1;
  const katana = new THREE.Group();
  katana.position.set(0, -0.58, 0);
  const tsuka = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.3, 6), mat(0x2a1e1c)); tsuka.rotation.x = Math.PI / 2;
  const tsukaWrap = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.12, 6), mat(C.obi === 0x1a1a1a ? 0x8a1f1f : C.obi)); tsukaWrap.rotation.x = Math.PI / 2; tsukaWrap.position.z = -0.02;
  const tsuba = new THREE.Mesh(new THREE.CylinderGeometry(0.085 * bs, 0.085 * bs, 0.022, 8), mat(0x9a8a45)); tsuba.rotation.x = Math.PI / 2; tsuba.position.z = 0.16;
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0xe6edf5, metalness: 0.85, roughness: 0.22, emissive: C.glow, emissiveIntensity: 0.15 });
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.028 * bs, 0.07 * bs, 1.0 * bs), bladeMat); blade.position.z = 0.68 * bs;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.035 * bs, 0.12, 4), bladeMat); tip.rotation.x = Math.PI / 2; tip.position.z = 1.24 * bs; tip.rotation.z = Math.PI / 4;
  katana.add(tsuka, tsukaWrap, tsuba, blade, tip);
  katana.rotation.x = -1.05;
  rightArm.add(katana);
  parts.rightArm = rightArm; parts.katana = katana; parts.bladeMat = bladeMat;

  const saya = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 1.05 * bs, 6), mat(0x11111a));
  saya.position.set(-0.2, 0.85, -0.15);
  saya.rotation.set(1.35, 0, 0.25);

  g.add(leftArm, rightArm, saya);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  parts.body = g;
  parts.feet = [footL, footR];
  return parts;
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
    input.light = input.heavy = input.special = input.potion = false;

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
    } else if (ml > 0) {
      move.set(mx, 0, mz).multiplyScalar(this.moveSpeed * dt);
      this.yaw = angleLerp(this.yaw, Math.atan2(mx, mz), 1 - Math.exp(-12 * dt));
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

  _startAttack(name, ctx) {
    const def = ATTACKS[name];
    this.attack = { name, def, t: 0, hitSet: new Set(), fxDone: false, waveDone: false, waveCount: 0 };
    this.queued = null;
    if (name.startsWith('light')) { this.nextLight = def.next || 'light1'; this.comboResetTimer = 0.55; }
    else this.nextLight = 'light1';
    const wasMoving = this.moving;
    if (!this.moving || def.special) this.yaw = this.camYaw + Math.PI;
    // 조준 보정: 이동 중엔 정면 ±65°, 정지 시엔 전방향에서 가장 가까운 적 쪽으로
    if (!def.special && ctx.enemies) {
      let best = null, bestD = def.range + 1.8;
      const limit = wasMoving ? 1.15 : Math.PI;
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
    if (def.special) {
      const sp = this.ch.special;
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
      ctx.effects.slashArc(this.pos, this.yaw, {
        rIn: 0.5, rOut: d.special ? sp.range - 0.2 : (fx.rOut || d.range) * (heavyPlus ? 1.4 : 1), angle: Math.min(d.arc, Math.PI * 1.1), tilt: fx.tilt, roll: fx.roll,
        color: d.special ? sp.c1 : fx.color, life: d.special ? 0.45 : 0.22, sweep: fx.sweep, y: fx.y,
      });
      if (d.special) ctx.effects.slashArc(this.pos, this.yaw + Math.PI, { rIn: 0.5, rOut: sp.range - 0.2, angle: Math.PI * 1.1, tilt: 0.15, color: sp.c2, life: 0.45, sweep: 1, y: 0.9 });
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
    ctx.effects.sparks(hitPos, dir, d.special ? [sp.c1, sp.c2, 0xffffff] : undefined);
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
    const [fl, fr] = P.feet;
    if (this.moving && !this.attack) {
      fl.position.z = 0.05 + Math.sin(this.walkPhase) * 0.2;
      fr.position.z = 0.05 - Math.sin(this.walkPhase) * 0.2;
    } else {
      fl.position.z = damp(fl.position.z, 0.05, 10, dt);
      fr.position.z = damp(fr.position.z, 0.05, 10, dt);
    }
    P.scarfTail.rotation.x = 0.35 + Math.sin(performance.now() * 0.004) * 0.15 + (this.moving ? 0.5 : 0);
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
