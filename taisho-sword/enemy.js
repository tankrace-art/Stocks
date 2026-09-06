// enemy.js — 요괴: 근접형(小鬼), 원거리형(鬼火), 보스(黒鬼), 투사체, 웨이브/새벽 소멸 관리
import * as THREE from 'three';
import { clamp, lerp, damp, rand, pick, angleLerp, easeOutCubic } from './util.js';
import { ARENA_RADIUS } from './stage.js';

function mat(color, extra = {}) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true, transparent: true, ...extra });
}

// ---------- 투사체 (귀화) ----------
export class Projectile {
  constructor(scene, pos, dir, { speed = 9, dmg = 10, life = 4.5, color = 0x60c0ff, size = 0.28 } = {}) {
    this.scene = scene;
    this.pos = pos.clone();
    this.vel = dir.clone().normalize().multiplyScalar(speed);
    this.dmg = dmg; this.life = life; this.alive = true; this.radius = size + 0.25;
    this.color = color;
    this.mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.glow = new THREE.Mesh(new THREE.IcosahedronGeometry(size * 1.9, 0), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.mesh.add(this.glow);
    this.mesh.position.copy(this.pos);
    scene.add(this.mesh);
  }
  update(dt, ctx) {
    if (!this.alive) return;
    this.life -= dt;
    this.pos.addScaledVector(this.vel, dt);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.x += dt * 6; this.mesh.rotation.y += dt * 4;
    ctx.effects.emit({ pos: this.pos, vel: new THREE.Vector3(rand(-0.5, 0.5), rand(0.5, 1.5), rand(-0.5, 0.5)), life: 0.45, size: 0.45, color: this.color, drag: 2 });
    const p = ctx.player;
    if (p.alive) {
      const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, dy = (p.pos.y + 1.0) - this.pos.y;
      if (Math.hypot(dx, dz) < this.radius + p.radius && Math.abs(dy) < 1.4) {
        p.takeDamage(this.dmg, this.pos, ctx.effects);
        this.destroy(ctx.effects, true);
        return;
      }
    }
    if (this.pos.y < 0.05 || this.life <= 0 || Math.hypot(this.pos.x, this.pos.z) > ARENA_RADIUS + 6) this.destroy(ctx.effects, this.pos.y < 0.05);
  }
  destroy(effects, impact = false) {
    if (!this.alive) return;
    this.alive = false;
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.glow.material.dispose();
    effects.burst(this.pos, { count: impact ? 18 : 12, colors: [this.color, 0xffffff, 0xa0e0ff], speed: impact ? 4 : 3, life: 0.45, size: 0.35, gravity: -3, drag: 2 });
  }
}

// ---------- 적 기본 ----------
let ENEMY_ID = 0;
export class Enemy {
  constructor(scene, pos) {
    this.id = ENEMY_ID++;
    this.scene = scene;
    this.group = new THREE.Group();
    this.pos = this.group.position;
    this.pos.copy(pos); this.pos.y = 0;
    this.yaw = rand(0, Math.PI * 2);
    scene.add(this.group);

    this.hp = 40; this.maxHp = 40;
    this.speed = 3.2;
    this.radius = 0.5;
    this.height = 1.6;
    this.state = 'spawn'; this.stateT = 0;
    this.alive = true;
    this.removed = false;
    this.hitFlash = 0;
    this.stagger = 0;
    this.knock = new THREE.Vector3();
    this.isBoss = false;
    this.attackCooldown = rand(0.5, 1.5);
    this.mats = [];
    this.opacity = 1;
    this.scaleBase = 1;
    this.name = '요괴';
    this.dissolving = false;
  }

  _collectMats() {
    this.group.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true;
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) this.mats.push({ m, emissive: m.emissive ? m.emissive.getHex() : 0, ei: m.emissiveIntensity || 0 });
      }
    });
  }

  get targetable() { return this.alive && this.state !== 'spawn' && !this.dissolving; }
  get center() { return new THREE.Vector3(this.pos.x, this.pos.y + this.height * 0.55, this.pos.z); }

  setState(s) { this.state = s; this.stateT = 0; }

  takeHit(dmg, dir, knock, stagger, effects) {
    if (!this.targetable) return false;
    this.hp -= dmg;
    this.hitFlash = 1;
    const kMul = this.isBoss ? 0.12 : 1;
    this.knock.addScaledVector(dir, knock * kMul);
    // 보스는 경직에 강한 저항
    this.stagger = Math.max(this.stagger, this.isBoss ? stagger * 0.2 : stagger);
    if (this.hp <= 0) { this.die(effects); return true; }
    if (this.stagger > 0 && !this.isBoss) this.setState('hurt');
    return false;
  }

  die(effects) {
    this.alive = false;
    this.setState('dead');
    effects.burst(this.center, { count: 30, colors: [0x6a2a8a, 0x2a1040, 0xff6a3a, 0xffffff], speed: 4, life: 0.8, size: 0.5, gravity: -2, drag: 1.5 });
    effects.mist(this.center, undefined, 12);
  }

  // 새벽 소멸
  dissolve(effects) {
    if (this.dissolving || this.state === 'dead') return;
    this.dissolving = true;
    this.alive = false;
    this.setState('dissolve');
    effects.ashes(this.center, this.isBoss ? 80 : 30);
  }

  // 플레이어 방향/거리
  _toPlayer(player) {
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    return { dx, dz, d, ang: Math.atan2(dx, dz) };
  }

  _faceTo(ang, dt, rate = 8) { this.yaw = angleLerp(this.yaw, ang, 1 - Math.exp(-rate * dt)); }

  _moveTowards(dx, dz, d, dt, speed = this.speed) {
    if (d < 1e-3) return;
    this.pos.x += (dx / d) * speed * dt;
    this.pos.z += (dz / d) * speed * dt;
  }

  update(dt, ctx) {
    this.stateT += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt * 6);
    this.stagger = Math.max(0, this.stagger - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);

    // 넉백
    this.pos.addScaledVector(this.knock, dt);
    this.knock.multiplyScalar(Math.max(0, 1 - 8 * dt));

    switch (this.state) {
      case 'spawn': {
        const k = clamp(this.stateT / 1.1, 0, 1);
        const s = easeOutCubic(k) * this.scaleBase;
        this.group.scale.set(s, s, s);
        this.pos.y = lerp(-this.height * 0.8, 0, easeOutCubic(k));
        if (Math.random() < 0.5) ctx.effects.mist(new THREE.Vector3(this.pos.x, 0.2, this.pos.z), undefined, 2);
        if (k >= 1) { this.pos.y = 0; this.setState('chase'); }
        break;
      }
      case 'dead': {
        const k = clamp(this.stateT / 0.9, 0, 1);
        this.opacity = 1 - k;
        this.group.rotation.x = -easeOutCubic(k) * 1.2;
        const s = this.scaleBase * (1 - k * 0.3);
        this.group.scale.set(s, s, s);
        if (k >= 1) this.remove();
        break;
      }
      case 'dissolve': {
        const k = clamp(this.stateT / 1.8, 0, 1);
        this.opacity = 1 - k;
        this.pos.y = k * 1.5;
        const s = this.scaleBase * (1 - k * 0.6);
        this.group.scale.set(s, s, s);
        this.group.rotation.y += dt * 2;
        if (Math.random() < 0.6) ctx.effects.emit({ pos: this.center, vel: new THREE.Vector3(rand(-1, 1), rand(1, 2.5), rand(-1, 1)), life: 1.2, size: 0.4, color: pick([0xffd9a0, 0xffffff, 0xb090ff]), drag: 0.5 });
        if (k >= 1) this.remove();
        break;
      }
      case 'hurt': {
        if (this.stagger <= 0) this.setState('chase');
        break;
      }
      default:
        if (this.alive) this.behave(dt, ctx);
    }

    if (this.alive && this.state !== 'spawn') {
      ctx.stage.resolveCollisions(this.pos, this.radius);
      // 적끼리 분리
      for (const o of ctx.enemies) {
        if (o === this || !o.alive) continue;
        const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z;
        const d = Math.hypot(dx, dz);
        const min = this.radius + o.radius;
        if (d < min && d > 1e-3) {
          const push = (min - d) * 0.5;
          this.pos.x += (dx / d) * push; this.pos.z += (dz / d) * push;
        }
      }
      if (this.state !== 'dissolve') this.pos.y = 0;
    }

    this.group.rotation.y = this.yaw;
    // 피격 플래시 / 투명도
    for (const e of this.mats) {
      if (e.m.emissive) {
        e.m.emissive.setHex(e.emissive).lerp(new THREE.Color(0xffffff), this.hitFlash * 0.9);
        e.m.emissiveIntensity = lerp(e.ei, 1.2, this.hitFlash);
      }
      e.m.opacity = this.opacity * (this.baseOpacity || 1);
    }
    this.animate(dt);
  }

  behave() {}
  animate() {}

  remove() {
    if (this.removed) return;
    this.removed = true;
    this.scene.remove(this.group);
    this.group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); } });
  }
}

// ---------- 근접형: 小鬼 (소귀) ----------
export class MeleeYokai extends Enemy {
  constructor(scene, pos) {
    super(scene, pos);
    this.name = '小鬼';
    this.hp = this.maxHp = 45;
    this.speed = 3.6;
    this.radius = 0.5; this.height = 1.7;
    this._build(0xb8322a, 0xffe08a);
    this.scaleBase = 1;
    this.group.scale.set(0.01, 0.01, 0.01);
    this.dmg = 12; this.attackRange = 2.0;
  }

  _build(bodyColor, eyeColor) {
    const g = this.group;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.7, 2, 6), mat(bodyColor));
    body.position.y = 0.95;
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.36, 7, 5), mat(bodyColor));
    belly.position.set(0, 0.85, 0.15);
    const loin = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.5, 0.3, 7), mat(0xd9a640));
    loin.position.y = 0.55;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), mat(bodyColor));
    head.position.y = 1.6;
    const hornGeo = new THREE.ConeGeometry(0.08, 0.32, 5);
    const hornL = new THREE.Mesh(hornGeo, mat(0xf0e6c8)); hornL.position.set(-0.18, 1.92, 0); hornL.rotation.z = 0.3;
    const hornR = new THREE.Mesh(hornGeo, mat(0xf0e6c8)); hornR.position.set(0.18, 1.92, 0); hornR.rotation.z = -0.3;
    const eyeMat = new THREE.MeshLambertMaterial({ color: eyeColor, emissive: eyeColor, emissiveIntensity: 0.9, transparent: true });
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 4), eyeMat); eyeL.position.set(-0.13, 1.66, 0.3);
    const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 4), eyeMat); eyeR.position.set(0.13, 1.66, 0.3);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.05), mat(0x2a0a0a)); mouth.position.set(0, 1.48, 0.32);
    const legGeo = new THREE.CylinderGeometry(0.12, 0.1, 0.55, 5);
    const legL = new THREE.Mesh(legGeo, mat(bodyColor)); legL.position.set(-0.2, 0.28, 0);
    const legR = new THREE.Mesh(legGeo, mat(bodyColor)); legR.position.set(0.2, 0.28, 0);
    // 왼팔
    const armGeo = new THREE.CylinderGeometry(0.1, 0.09, 0.6, 5); armGeo.translate(0, -0.3, 0);
    const armL = new THREE.Group(); armL.position.set(-0.5, 1.3, 0);
    armL.add(new THREE.Mesh(armGeo, mat(bodyColor)));
    armL.rotation.z = 0.4;
    // 오른팔 + 몽둥이
    const armR = new THREE.Group(); armR.position.set(0.5, 1.3, 0);
    armR.add(new THREE.Mesh(armGeo, mat(bodyColor)));
    const club = new THREE.Group(); club.position.y = -0.6;
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.9, 5), mat(0x4a3320)); handle.rotation.x = Math.PI / 2; handle.position.z = 0.3;
    const headC = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.5, 6), mat(0x3a2a20)); headC.rotation.x = Math.PI / 2; headC.position.z = 0.85;
    club.add(handle, headC);
    club.rotation.x = -0.9;
    armR.add(club);
    armR.rotation.order = 'YXZ';
    armR.rotation.z = -0.4;
    this.armR = armR; this.armL = armL; this.legs = [legL, legR]; this.eyeMat = eyeMat;
    g.add(body, belly, loin, head, hornL, hornR, eyeL, eyeR, mouth, legL, legR, armL, armR);
    this._collectMats();
  }

  behave(dt, ctx) {
    const p = ctx.player;
    const { dx, dz, d, ang } = this._toPlayer(p);
    if (this.state === 'chase') {
      this._faceTo(ang, dt);
      if (!p.alive) return;
      if (d > this.attackRange) this._moveTowards(dx, dz, d, dt);
      else if (this.attackCooldown <= 0) { this.setState('attack'); this.hit = false; }
      // 살짝 주위를 도는 움직임
      if (d < 4 && this.attackCooldown > 0) {
        const side = (this.id % 2 === 0 ? 1 : -1);
        this.pos.x += (-dz / d) * side * 1.5 * dt; this.pos.z += (dx / d) * side * 1.5 * dt;
      }
    } else if (this.state === 'attack') {
      const t = this.stateT;
      if (t < 0.5) this._faceTo(ang, dt, 5);
      if (t >= 0.5 && !this.hit) {
        this.hit = true;
        ctx.effects.slashArc(this.pos, this.yaw, { rIn: 0.3, rOut: 2.2, angle: 1.6, tilt: -0.6, color: 0xff6a4a, life: 0.2, sweep: 1, y: 1.0, opacity: 0.6 });
        const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
        const cosA = (dx * fx + dz * fz) / Math.max(d, 1e-4);
        if (d < this.attackRange + p.radius + 0.3 && cosA > 0.3) p.takeDamage(this.dmg, this.pos, ctx.effects);
      }
      if (t >= 0.95) { this.setState('chase'); this.attackCooldown = rand(1.0, 1.8); }
    }
  }

  animate(dt) {
    const t = this.stateT;
    let ax = 0.2, ay = 0;
    let lean = 0;
    if (this.state === 'attack') {
      if (t < 0.5) { const k = easeOutCubic(t / 0.5); ax = lerp(0.2, -2.6, k); ay = lerp(0, 0.6, k); lean = -0.15 * k; }
      else { const k = clamp((t - 0.5) / 0.25, 0, 1); ax = lerp(-2.6, -0.4, easeOutCubic(k)); ay = lerp(0.6, -0.4, k); lean = lerp(-0.15, 0.25, k); }
      if (t > 0.75) { const k = (t - 0.75) / 0.2; ax = lerp(-0.4, 0.2, k); ay = lerp(-0.4, 0, k); lean = lerp(0.25, 0, k); }
    } else if (this.state === 'chase') {
      const w = performance.now() * 0.012 + this.id;
      this.legs[0].rotation.x = Math.sin(w) * 0.6; this.legs[1].rotation.x = -Math.sin(w) * 0.6;
      this.armL.rotation.x = -Math.sin(w) * 0.5;
      ax = 0.2 + Math.sin(w) * 0.3;
      lean = 0.15;
    } else if (this.state === 'hurt') {
      lean = -0.3;
    }
    this.armR.rotation.x = damp(this.armR.rotation.x, ax, 25, dt);
    this.armR.rotation.y = damp(this.armR.rotation.y, ay, 25, dt);
    this.group.rotation.x = damp(this.group.rotation.x, this.state === 'dead' ? this.group.rotation.x : lean, 12, dt);
    // 공격 준비 시 눈 붉게
    this.eyeMat.emissive.setHex(this.state === 'attack' && t < 0.5 ? 0xff2020 : 0xffe08a);
  }
}

// ---------- 원거리형: 鬼火 (귀화) — 떠다니는 망령 ----------
export class RangedYokai extends Enemy {
  constructor(scene, pos) {
    super(scene, pos);
    this.name = '鬼火';
    this.hp = this.maxHp = 28;
    this.speed = 2.8;
    this.radius = 0.5; this.height = 1.9;
    this.baseOpacity = 0.85;
    this._build();
    this.group.scale.set(0.01, 0.01, 0.01);
    this.fireCooldown = rand(1.2, 2.2);
    this.preferMin = 7; this.preferMax = 12;
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.strafeT = rand(1, 3);
    this.bobY = 0.35;
  }

  _build() {
    const g = this.group;
    const ghost = 0x9ad8ff;
    const bodyMat = new THREE.MeshLambertMaterial({ color: ghost, emissive: 0x2050a0, emissiveIntensity: 0.5, transparent: true, opacity: 0.85, flatShading: true });
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.3, 7), bodyMat); body.position.y = 1.15;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), bodyMat); head.position.y = 1.95;
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.7, 7), new THREE.MeshLambertMaterial({ color: 0x2a3a6a, emissive: 0x101a40, emissiveIntensity: 0.5, transparent: true, flatShading: true })); hood.position.y = 2.25;
    const eyeMat = new THREE.MeshLambertMaterial({ color: 0x000000, emissive: 0x000000, transparent: true });
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.07, 5, 4), eyeMat); eyeL.position.set(-0.12, 2.0, 0.27);
    const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.07, 5, 4), eyeMat); eyeR.position.set(0.12, 2.0, 0.27);
    const armGeo = new THREE.CylinderGeometry(0.06, 0.05, 0.7, 5); armGeo.translate(0, -0.35, 0);
    const armL = new THREE.Mesh(armGeo, bodyMat); armL.position.set(-0.4, 1.6, 0.1); armL.rotation.set(-0.9, 0, 0.5);
    const armR = new THREE.Mesh(armGeo, bodyMat); armR.position.set(0.4, 1.6, 0.1); armR.rotation.set(-0.9, 0, -0.5);
    // 궤도 도는 귀화 불꽃
    this.flames = [];
    const flameMat = new THREE.MeshBasicMaterial({ color: 0x70d0ff, transparent: true, opacity: 0.95 });
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(new THREE.TetrahedronGeometry(0.16, 0), flameMat);
      g.add(f); this.flames.push(f);
    }
    this.armR = armR;
    g.add(body, head, hood, eyeL, eyeR, armL, armR);
    this._collectMats();
    // 불꽃은 항상 밝게 — 플래시 제외
    this.mats = this.mats.filter((e) => e.m !== flameMat);
    this.flameMat = flameMat;
  }

  behave(dt, ctx) {
    const p = ctx.player;
    const { dx, dz, d, ang } = this._toPlayer(p);
    this._faceTo(ang, dt, 6);
    if (!p.alive) return;
    this.fireCooldown -= dt;
    this.strafeT -= dt;
    if (this.strafeT <= 0) { this.strafe *= -1; this.strafeT = rand(1.5, 3.5); }

    if (this.state === 'chase') {
      // 거리 유지
      if (d < this.preferMin) this._moveTowards(-dx, -dz, d, dt, this.speed * 1.2);
      else if (d > this.preferMax) this._moveTowards(dx, dz, d, dt);
      // 측면 이동
      if (d > 1e-3) { this.pos.x += (-dz / d) * this.strafe * 1.6 * dt; this.pos.z += (dx / d) * this.strafe * 1.6 * dt; }
      if (this.fireCooldown <= 0 && d < 18) { this.setState('cast'); }
    } else if (this.state === 'cast') {
      const t = this.stateT;
      if (t < 0.6) {
        // 집중: 손끝에 불꽃 모임
        const src = this._handPos();
        ctx.effects.emit({ pos: new THREE.Vector3(src.x + rand(-0.6, 0.6), src.y + rand(-0.6, 0.6), src.z + rand(-0.6, 0.6)), vel: new THREE.Vector3(0, 0, 0), life: 0.3, size: 0.3, color: 0x70d0ff });
      }
      if (t >= 0.6 && !this.fired) {
        this.fired = true;
        const src = this._handPos();
        const target = new THREE.Vector3(p.pos.x, p.pos.y + 1.0, p.pos.z);
        // 약간의 리드
        const dir = target.sub(src).normalize();
        ctx.spawnProjectile(src, dir, { speed: 10, dmg: 10, color: 0x60c0ff });
        ctx.effects.burst(src, { count: 8, colors: [0x70d0ff, 0xffffff], speed: 2, life: 0.3, size: 0.3, gravity: 0, drag: 2 });
      }
      if (t >= 1.0) { this.setState('chase'); this.fired = false; this.fireCooldown = rand(2.0, 3.2); }
    }
  }

  _handPos() {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    return new THREE.Vector3(this.pos.x + fx * 0.7 + fz * 0.3, 1.5 + this.bobY, this.pos.z + fz * 0.7 - fx * 0.3);
  }

  animate(dt) {
    const t = performance.now() * 0.001 + this.id;
    this.bobY = Math.sin(t * 2.2) * 0.18 + 0.35;
    if (this.state !== 'dissolve' && this.state !== 'dead' && this.state !== 'spawn') this.pos.y = this.bobY;
    for (let i = 0; i < this.flames.length; i++) {
      const f = this.flames[i];
      const a = t * 2.5 + (i / 3) * Math.PI * 2;
      f.position.set(Math.cos(a) * 0.75, 1.3 + Math.sin(a * 1.7) * 0.3, Math.sin(a) * 0.75);
      f.rotation.set(t * 3, t * 2, 0);
      const s = 0.8 + 0.3 * Math.sin(t * 8 + i);
      f.scale.set(s, s * 1.6, s);
    }
    this.flameMat.opacity = this.opacity * 0.95;
    this.armR.rotation.x = damp(this.armR.rotation.x, this.state === 'cast' ? -1.6 : -0.9, 12, dt);
  }
}

// ---------- 보스: 黒鬼 (흑귀) ----------
export class BossOni extends MeleeYokai {
  constructor(scene, pos) {
    super(scene, pos);
    this.name = '黒鬼 — 대나무 숲의 주인';
    this.isBoss = true;
    this.hp = this.maxHp = 620;
    this.speed = 3.0;
    this.scaleBase = 2.4;
    this.radius = 1.25; this.height = 4.2;
    this.dmg = 24; this.attackRange = 3.6;
    this.attackCooldown = 2;
    this.phase = 1;
    // 색 교체: 검은 몸, 붉은 눈
    for (const e of this.mats) {
      if (e.m.color && e.m.color.getHex() === 0xb8322a) e.m.color.setHex(0x1c1620);
      if (e.m.color && e.m.color.getHex() === 0xd9a640) e.m.color.setHex(0x7a2a2a);
    }
    this.eyeMat.color.setHex(0xff3020); this.eyeMat.emissive.setHex(0xff2010);
    for (const e of this.mats) if (e.m === this.eyeMat) e.emissive = 0xff2010;
    // 가나보 가시
    const spikeGeo = new THREE.ConeGeometry(0.04, 0.12, 4);
    const club = this.armR.children[1];
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Mesh(spikeGeo, mat(0x8a8a90));
      const a = (i / 8) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.15, Math.sin(a) * 0.15, 0.85);
      s.rotation.z = a - Math.PI / 2;
      club.add(s);
    }
    this._collectMats();
    this.mats = this.mats.filter((v, i, arr) => arr.findIndex((w) => w.m === v.m) === i);
    this.group.scale.set(0.01, 0.01, 0.01);
    this.charge = null;
  }

  behave(dt, ctx) {
    const p = ctx.player;
    const { dx, dz, d, ang } = this._toPlayer(p);
    if (this.hp < this.maxHp * 0.5 && this.phase === 1) {
      this.phase = 2;
      ctx.onBossPhase && ctx.onBossPhase(this);
      ctx.effects.shockwave(this.pos, { color: 0xff3020, radius: 9, life: 0.9, y: 0.1 });
      ctx.effects.burst(this.center, { count: 60, colors: [0xff3020, 0x8a1030, 0xffffff], speed: 6, life: 1.0, size: 0.6, gravity: -2, drag: 1 });
    }
    if (this.state === 'chase') {
      this._faceTo(ang, dt, 4);
      if (!p.alive) return;
      if (this.attackCooldown <= 0) {
        // 공격 선택
        const r = Math.random();
        if (d > 7 && r < 0.65) { this.setState('charge'); this.hit = false; this.charge = null; }
        else if (this.phase === 2 && d > 4 && r < 0.45) { this.setState('firering'); this.fired = false; }
        else if (d <= this.attackRange + 0.5) { this.setState('slam'); this.hit = false; }
        else this._moveTowards(dx, dz, d, dt);
      } else {
        if (d > this.attackRange) this._moveTowards(dx, dz, d, dt);
      }
    } else if (this.state === 'slam') {
      const t = this.stateT;
      if (t < 0.85) this._faceTo(ang, dt, 3);
      if (t >= 0.85 && !this.hit) {
        this.hit = true;
        const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
        const impact = new THREE.Vector3(this.pos.x + fx * 2.4, 0, this.pos.z + fz * 2.4);
        ctx.effects.shockwave(impact, { color: 0xffa040, radius: 4.5, life: 0.55, y: 0.1 });
        ctx.effects.burst(impact, { count: 40, colors: [0x6a5a40, 0x9a8a60, 0xff8a30], speed: 6, life: 0.7, size: 0.5, gravity: -9, drag: 1, up: 2 });
        ctx.effects.addShake(0.8);
        const dd = Math.hypot(p.pos.x - impact.x, p.pos.z - impact.z);
        if (dd < 4.2) p.takeDamage(this.dmg, impact, ctx.effects);
      }
      if (t >= 1.5) { this.setState('chase'); this.attackCooldown = rand(1.2, 2.0); }
    } else if (this.state === 'charge') {
      const t = this.stateT;
      if (t < 0.7) {
        this._faceTo(ang, dt, 6);
        if (Math.random() < 0.6) ctx.effects.emit({ pos: new THREE.Vector3(this.pos.x + rand(-1, 1), 0.3, this.pos.z + rand(-1, 1)), vel: new THREE.Vector3(0, 2, 0), life: 0.4, size: 0.5, color: 0xff3020 });
      } else if (t < 1.5) {
        if (!this.charge) this.charge = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
        this.pos.addScaledVector(this.charge, 15 * dt);
        ctx.effects.emit({ pos: new THREE.Vector3(this.pos.x + rand(-1, 1), 0.3, this.pos.z + rand(-1, 1)), vel: new THREE.Vector3(0, 1.5, 0), life: 0.5, size: 0.7, color: 0x5a4a3a });
        if (!this.hit && d < this.radius + p.radius + 0.6) {
          this.hit = true;
          p.takeDamage(18, this.pos, ctx.effects);
          ctx.effects.addShake(0.5);
        }
        // 벽에 부딪히면 정지
        if (Math.hypot(this.pos.x, this.pos.z) > ARENA_RADIUS - this.radius - 0.2) { this.stateT = 1.5; ctx.effects.addShake(0.6); ctx.effects.shockwave(this.pos, { color: 0xffffff, radius: 3, life: 0.4 }); }
      }
      if (t >= 2.1) { this.setState('chase'); this.attackCooldown = rand(1.0, 1.8); }
    } else if (this.state === 'firering') {
      const t = this.stateT;
      if (t < 0.9) {
        ctx.effects.emit({ pos: this.center.add(new THREE.Vector3(rand(-1.5, 1.5), rand(-1, 1), rand(-1.5, 1.5))), vel: new THREE.Vector3(0, 0, 0), life: 0.3, size: 0.5, color: 0xff6030 });
      }
      if (t >= 0.9 && !this.fired) {
        this.fired = true;
        const n = 10;
        const src = this.center;
        for (let i = 0; i < n; i++) {
          const a = ang + (i / n) * Math.PI * 2;
          const dir = new THREE.Vector3(Math.sin(a), -0.08, Math.cos(a));
          ctx.spawnProjectile(src.clone(), dir, { speed: 8, dmg: 12, color: 0xff6030, size: 0.32, life: 5 });
        }
        ctx.effects.shockwave(this.pos, { color: 0xff6030, radius: 5, life: 0.5 });
      }
      if (t >= 1.6) { this.setState('chase'); this.attackCooldown = rand(1.5, 2.5); }
    }
  }

  animate(dt) {
    const t = this.stateT;
    let ax = 0.2, ay = 0, lean = 0;
    if (this.state === 'slam') {
      if (t < 0.85) { const k = easeOutCubic(t / 0.85); ax = lerp(0.2, -3.0, k); lean = -0.2 * k; }
      else { const k = clamp((t - 0.85) / 0.15, 0, 1); ax = lerp(-3.0, -0.3, easeOutCubic(k)); lean = lerp(-0.2, 0.3, k); }
      if (t > 1.1) { const k = clamp((t - 1.1) / 0.4, 0, 1); ax = lerp(-0.3, 0.2, k); lean = lerp(0.3, 0, k); }
    } else if (this.state === 'charge') {
      if (t < 0.7) { lean = -0.25; ax = -0.6; } else { lean = 0.35; ax = -1.2; ay = 0.8; }
    } else if (this.state === 'firering') {
      ax = -2.2; ay = 1.0; lean = -0.1;
    } else if (this.state === 'chase') {
      const w = performance.now() * 0.007 + this.id;
      this.legs[0].rotation.x = Math.sin(w) * 0.5; this.legs[1].rotation.x = -Math.sin(w) * 0.5;
      this.armL.rotation.x = -Math.sin(w) * 0.4;
      ax = 0.2 + Math.sin(w) * 0.2; lean = 0.1;
    }
    this.armR.rotation.x = damp(this.armR.rotation.x, ax, 18, dt);
    this.armR.rotation.y = damp(this.armR.rotation.y, ay, 18, dt);
    if (this.state !== 'dead') this.group.rotation.x = damp(this.group.rotation.x, lean, 10, dt);
    const telegraph = (this.state === 'slam' && t < 0.85) || (this.state === 'charge' && t < 0.7) || (this.state === 'firering' && t < 0.9);
    this.eyeMat.emissive.setHex(telegraph ? 0xffffff : 0xff2010);
    this.eyeMat.emissiveIntensity = telegraph ? 2 : 0.9;
  }
}

// ---------- 웨이브/스폰 관리 ----------
const WAVES = [
  { melee: 3, ranged: 0, title: '第一波', sub: '소귀들이 안개 속에서 기어 나온다' },
  { melee: 3, ranged: 2, title: '第二波', sub: '귀화가 대나무 사이를 떠돈다' },
  { melee: 4, ranged: 3, title: '第三波', sub: '숲 전체가 술렁인다' },
  { boss: true, title: '黒鬼', sub: '대나무 숲의 주인이 눈을 뜬다' },
];

export class EnemyManager {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.projectiles = [];
    this.waveIndex = -1;
    this.waveDelay = 2.5;
    this.boss = null;
    this.bossDefeated = false;
    this.kills = 0;
    this.onMessage = null;
    this.onBossSpawn = null;
    this.onBossDefeated = null;
    this.dissolved = false;
    this.spawnQueue = [];
  }

  get aliveCount() { return this.list.filter((e) => e.alive).length; }
  get totalWaves() { return WAVES.length; }
  get allWavesCleared() { return this.waveIndex >= WAVES.length - 1 && this.aliveCount === 0 && this.spawnQueue.length === 0; }

  _spawnPos(player, min = 10, max = 16) {
    for (let i = 0; i < 20; i++) {
      const a = rand(0, Math.PI * 2);
      const r = rand(min, max);
      const p = new THREE.Vector3(player.pos.x + Math.cos(a) * r, 0, player.pos.z + Math.sin(a) * r);
      const d = Math.hypot(p.x, p.z);
      if (d > ARENA_RADIUS - 2) { const k = (ARENA_RADIUS - 2) / d; p.x *= k; p.z *= k; }
      if (Math.hypot(p.x - player.pos.x, p.z - player.pos.z) > 6) return p;
    }
    return new THREE.Vector3(0, 0, -12);
  }

  startWave(index, player) {
    this.waveIndex = index;
    const w = WAVES[index];
    if (!w) return;
    this.onMessage && this.onMessage(w.title, w.sub);
    if (w.boss) {
      const pos = new THREE.Vector3(0, 0, -12);
      this.boss = new BossOni(this.scene, pos);
      this.list.push(this.boss);
      this.onBossSpawn && this.onBossSpawn(this.boss);
      return;
    }
    let delay = 0;
    for (let i = 0; i < w.melee; i++) { this.spawnQueue.push({ t: delay, type: 'melee' }); delay += 0.35; }
    for (let i = 0; i < w.ranged; i++) { this.spawnQueue.push({ t: delay, type: 'ranged' }); delay += 0.35; }
  }

  spawnProjectile(pos, dir, opts) {
    this.projectiles.push(new Projectile(this.scene, pos, dir, opts));
  }

  dissolveAll(effects) {
    if (this.dissolved) return;
    this.dissolved = true;
    this.spawnQueue.length = 0;
    for (const e of this.list) e.dissolve(effects);
    for (const p of this.projectiles) p.destroy(effects);
  }

  update(dt, ctx) {
    const player = ctx.player;
    ctx.enemies = this.list;
    ctx.projectiles = this.projectiles;
    ctx.spawnProjectile = (p, d, o) => this.spawnProjectile(p, d, o);

    // 스폰 큐
    if (!this.dissolved) {
      for (let i = this.spawnQueue.length - 1; i >= 0; i--) {
        const s = this.spawnQueue[i];
        s.t -= dt;
        if (s.t <= 0) {
          const pos = this._spawnPos(player);
          const e = s.type === 'melee' ? new MeleeYokai(this.scene, pos) : new RangedYokai(this.scene, pos);
          this.list.push(e);
          ctx.effects.mist(new THREE.Vector3(pos.x, 0.5, pos.z), undefined, 25);
          this.spawnQueue.splice(i, 1);
        }
      }
      // 다음 웨이브
      if (this.aliveCount === 0 && this.spawnQueue.length === 0 && this.waveIndex < WAVES.length - 1 && player.alive) {
        this.waveDelay -= dt;
        if (this.waveDelay <= 0) { this.startWave(this.waveIndex + 1, player); this.waveDelay = 3.5; }
      }
      // 보스 2페이즈 시 추가 소환
      if (this.boss && this.boss.alive && this.boss.phase === 2 && !this.boss.addsSpawned) {
        this.boss.addsSpawned = true;
        this.spawnQueue.push({ t: 0.5, type: 'ranged' }, { t: 0.9, type: 'ranged' }, { t: 1.3, type: 'melee' });
      }
    }

    // 적 업데이트
    for (const e of this.list) e.update(dt, ctx);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      if (e.removed) this.list.splice(i, 1);
    }
    // 보스 사망 → 새벽
    if (this.boss && !this.boss.alive && !this.bossDefeated && !this.boss.dissolving) {
      this.bossDefeated = true;
      this.onBossDefeated && this.onBossDefeated(this.boss);
    }

    // 투사체
    for (const p of this.projectiles) p.update(dt, ctx);
    for (let i = this.projectiles.length - 1; i >= 0; i--) if (!this.projectiles[i].alive) this.projectiles.splice(i, 1);
  }
}
