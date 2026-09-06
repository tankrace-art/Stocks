// enemy.js — 요괴: 근접형(小鬼), 원거리형(鬼火), 보스(黒鬼), 투사체, 웨이브/새벽 소멸 관리
import * as THREE from 'three';
import { clamp, lerp, damp, rand, pick, angleLerp, easeOutCubic } from './util.js';
import { ARENA_RADIUS } from './stage.js';
import { generateItem, rollRarity, RARITIES } from './items.js';
import { buildModel, animateFace } from './player.js';
import { getDemonDesign } from './demons.js';

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
    for (const p of [ctx.player, ...(ctx.allies || [])]) {
      if (!p.alive) continue;
      if (p.airborne && p.pos.y > 0.3) continue; // 점프로 회피
      const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, dy = (p.pos.y + 1.0) - this.pos.y;
      if (Math.hypot(dx, dz) < this.radius + p.radius && Math.abs(dy) < 1.4) {
        p.takeDamage(this.dmg, this.pos, ctx.effects);
        this.destroy(ctx.effects, true);
        return;
      }
    }
    if (this.pos.y < 0.05 || this.life <= 0 || !ctx.stage.inBounds(this.pos.x, this.pos.z, -6)) this.destroy(ctx.effects, this.pos.y < 0.05);
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
  constructor(scene, pos, mul = { hp: 1, dmg: 1 }) {
    this.id = ENEMY_ID++;
    this.mul = mul;
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
    this.name = '요괴'; this.kind = 'melee';
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
    this.sinceHit = 0;
    const kMul = this.isBoss ? 0.12 : 1;
    this.knock.addScaledVector(dir, knock * kMul);
    // 보스는 경직에 강한 저항
    this.stagger = Math.max(this.stagger, this.isBoss ? stagger * 0.2 : stagger);
    if (this.hp <= 0) { this.die(effects); return true; }
    if (this.stagger > 0 && !this.isBoss) this.setState('hurt');
    return false;
  }

  die(effects) {
    if (this.cfg && this.cfg.undying && !this.dissolving) {
      // 무잔: 죽지 않고 재생. 새벽(햇빛)만이 소멸시킨다
      this.hp = this.maxHp; this.regenT = 0; this.stagger = 1.5;
      effects.burst(this.center, { count: 60, colors: [0xff2040, 0xffffff, 0x8a1030], speed: 6, life: 1.0, size: 0.6, gravity: -2, drag: 1 });
      effects.shockwave(this.pos, { color: 0xff2040, radius: 8, life: 0.8 });
      this.onRegen && this.onRegen(this);
      return;
    }
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

  // 표적: 플레이어와 동료 중 가장 가까운 대상 (0.8초마다 갱신)
  _target(ctx) {
    this._retarget = (this._retarget || 0) - (ctx.dt || 0.016);
    if (!this.target || !this.target.alive || this._retarget <= 0) {
      this._retarget = 0.8;
      let best = ctx.player, bestD = Infinity;
      const cands = [ctx.player, ...(ctx.allies || [])];
      for (const c of cands) {
        if (!c.alive) continue;
        const d = Math.hypot(c.pos.x - this.pos.x, c.pos.z - this.pos.z) - (c === ctx.player ? 1.5 : 0); // 플레이어 약간 우선
        if (d < bestD) { bestD = d; best = c; }
      }
      this.target = best;
    }
    return this.target;
  }

  // 표적 방향/거리
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
    // 도깨비의 재생: 잠시 안 맞으면 체력이 차오른다 (원작처럼 빨리 베어야 함)
    this.sinceHit = (this.sinceHit || 0) + dt;
    if (this.alive && this.state !== 'spawn' && this.sinceHit > 2.5 && this.hp < this.maxHp) {
      const rate = this.isBoss ? (this.muzan ? 0.03 : this.upper ? 0.02 : 0.012) : 0.02;
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * rate * dt);
      if (Math.random() < 0.08) ctx.effects.emit({ pos: this.center, vel: new THREE.Vector3(rand(-0.5, 0.5), rand(0.5, 1.5), rand(-0.5, 0.5)), life: 0.5, size: 0.3, color: 0xff3050, drag: 1 });
    }
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
  constructor(scene, pos, mul) {
    super(scene, pos, mul);
    this.name = '소귀'; this.kind = 'melee';
    this.hp = this.maxHp = Math.round(40 * this.mul.hp);
    this.speed = 3.6;
    this.radius = 0.5; this.height = 1.7;
    this._build(0xb8322a, 0xffe08a);
    this.scaleBase = 1;
    this.group.scale.set(0.01, 0.01, 0.01);
    this.dmg = Math.round(8 * this.mul.dmg); this.attackRange = 2.0;
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
    const p = this._target(ctx);
    const { dx, dz, d, ang } = this._toPlayer(p);
    if (this.state === 'chase') {
      this._faceTo(ang, dt);
      if (!p.alive) return;
      // 혈귀술: 도약 베기(중거리) / 회전 베기(근접, 확률)
      if (!this.isBoss && this.attackCooldown <= 0 && d > 3.2 && d < 7.5 && Math.random() < 0.6) { this.setState('lunge'); this.hit = false; this.lungeDir = new THREE.Vector3(dx / d, 0, dz / d); return; }
      if (!this.isBoss && this.attackCooldown <= 0 && d <= this.attackRange + 0.5 && Math.random() < 0.3) { this.setState('spin'); this.hit = false; return; }
      if (d > this.attackRange) this._moveTowards(dx, dz, d, dt);
      else if (this.attackCooldown <= 0) { this.setState('attack'); this.hit = false; }
      // 살짝 주위를 도는 움직임
      if (d < 4 && this.attackCooldown > 0) {
        const side = (this.id % 2 === 0 ? 1 : -1);
        this.pos.x += (-dz / d) * side * 1.5 * dt; this.pos.z += (dx / d) * side * 1.5 * dt;
      }
    } else if (this.state === 'attack') {
      const t = this.stateT;
      if (t < 0.65) this._faceTo(ang, dt, 5);
      if (t >= 0.65 && !this.hit) {
        this.hit = true;
        ctx.effects.slashArc(this.pos, this.yaw, { rIn: 0.3, rOut: 2.2, angle: 1.6, tilt: -0.6, color: 0xff6a4a, life: 0.2, sweep: 1, y: 1.0, opacity: 0.6 });
        const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
        const cosA = (dx * fx + dz * fz) / Math.max(d, 1e-4);
        if (d < this.attackRange + p.radius + 0.3 && cosA > 0.3) p.takeDamage(this.dmg, this.pos, ctx.effects);
      }
      if (t >= 1.05) { this.setState('chase'); this.attackCooldown = rand(1.1, 1.9); }
    } else if (this.state === 'lunge') {
      const t = this.stateT;
      if (t < 0.4) { this._faceTo(ang, dt, 8); if (Math.random() < 0.5) ctx.effects.emit({ pos: this.center, vel: new THREE.Vector3(0, 1.5, 0), life: 0.3, size: 0.4, color: 0xff3050 }); }
      else if (t < 0.75) {
        this.pos.addScaledVector(this.lungeDir, 15 * dt);
        if (!this.hit) {
          for (const tg of [p, ...(ctx.allies || [])]) {
            if (tg.alive && Math.hypot(tg.pos.x - this.pos.x, tg.pos.z - this.pos.z) < this.radius + tg.radius + 0.5) {
              this.hit = true; tg.takeDamage(Math.round(this.dmg * 1.2), this.pos, ctx.effects);
              ctx.effects.slashArc(this.pos, this.yaw, { rIn: 0.3, rOut: 2.0, angle: 1.4, tilt: -0.4, color: 0xff3050, life: 0.2, sweep: 1, y: 1.0, opacity: 0.6 });
              break;
            }
          }
        }
      }
      if (t >= 1.0) { this.setState('chase'); this.attackCooldown = rand(1.6, 2.6); }
    } else if (this.state === 'spin') {
      const t = this.stateT;
      if (t >= 0.45 && !this.hit) {
        this.hit = true;
        ctx.effects.slashArc(this.pos, this.yaw, { rIn: 0.3, rOut: 2.6, angle: Math.PI * 1.1, tilt: 0.1, color: 0xff3050, life: 0.25, sweep: 1, y: 1.0, opacity: 0.6 });
        ctx.effects.slashArc(this.pos, this.yaw + Math.PI, { rIn: 0.3, rOut: 2.6, angle: Math.PI * 1.1, tilt: 0.1, color: 0xff3050, life: 0.25, sweep: 1, y: 1.0, opacity: 0.6 });
        ctx.sfx && ctx.sfx('swingHeavy');
        for (const tg of [p, ...(ctx.allies || [])]) if (tg.alive && Math.hypot(tg.pos.x - this.pos.x, tg.pos.z - this.pos.z) < 2.7 + tg.radius) tg.takeDamage(Math.round(this.dmg * 1.3), this.pos, ctx.effects);
      }
      if (t >= 0.9) { this.setState('chase'); this.attackCooldown = rand(1.8, 2.8); }
    }
  }

  animate(dt) {
    const t = this.stateT;
    let ax = 0.2, ay = 0;
    let lean = 0;
    if (this.state === 'attack') {
      if (t < 0.65) { const k = easeOutCubic(t / 0.65); ax = lerp(0.2, -2.6, k); ay = lerp(0, 0.6, k); lean = -0.15 * k; }
      else { const k = clamp((t - 0.65) / 0.25, 0, 1); ax = lerp(-2.6, -0.4, easeOutCubic(k)); ay = lerp(0.6, -0.4, k); lean = lerp(-0.15, 0.25, k); }
      if (t > 0.9) { const k = (t - 0.9) / 0.15; ax = lerp(-0.4, 0.2, k); ay = lerp(-0.4, 0, k); lean = lerp(0.25, 0, k); }
    } else if (this.state === 'chase') {
      const w = performance.now() * 0.012 + this.id;
      this.legs[0].rotation.x = Math.sin(w) * 0.6; this.legs[1].rotation.x = -Math.sin(w) * 0.6;
      this.armL.rotation.x = -Math.sin(w) * 0.5;
      ax = 0.2 + Math.sin(w) * 0.3;
      lean = 0.15;
    } else if (this.state === 'hurt') {
      lean = -0.3;
    } else if (this.state === 'lunge') {
      ax = t < 0.4 ? -2.4 : -0.6; lean = t < 0.4 ? -0.2 : 0.35;
    } else if (this.state === 'spin') {
      ax = -1.2; ay = Math.sin(t * 14) * 1.2; lean = 0.15;
    }
    this.armR.rotation.x = damp(this.armR.rotation.x, ax, 25, dt);
    this.armR.rotation.y = damp(this.armR.rotation.y, ay, 25, dt);
    this.group.rotation.x = damp(this.group.rotation.x, this.state === 'dead' ? this.group.rotation.x : lean, 12, dt);
    // 공격 준비 시 눈 붉게
    this.eyeMat.emissive.setHex((this.state === 'attack' && t < 0.65) || (this.state === 'lunge' && t < 0.4) || (this.state === 'spin' && t < 0.45) ? 0xff2020 : 0xffe08a);
  }
}

// ---------- 거구 도깨비: 크고 느리지만 내려찍기·돌진 ----------
export class BruteYokai extends MeleeYokai {
  constructor(scene, pos, mul) {
    super(scene, pos, mul);
    this.name = '거구 도깨비'; this.kind = 'brute';
    this.hp = this.maxHp = Math.round(120 * this.mul.hp);
    this.speed = 2.9; this.scaleBase = 1.7; this.radius = 0.85; this.height = 2.9;
    this.dmg = Math.round(14 * this.mul.dmg); this.attackRange = 2.8;
    for (const m of this.mats) if (m.m.color && m.m.color.getHex() === 0xb8322a) m.m.color.setHex(0x5a2a5a);
  }
  behave(dt, ctx) {
    const p = this._target(ctx);
    const { dx, dz, d, ang } = this._toPlayer(p);
    if (this.state === 'chase') {
      this._faceTo(ang, dt, 5);
      if (!p.alive) return;
      if (this.attackCooldown <= 0 && d > 6 && Math.random() < 0.5) { this.setState('charge'); this.hit = false; this.charge = null; return; }
      if (d > this.attackRange) this._moveTowards(dx, dz, d, dt); else if (this.attackCooldown <= 0) { this.setState('slam'); this.hit = false; }
    } else if (this.state === 'slam') {
      const t = this.stateT;
      if (t < 0.8) this._faceTo(ang, dt, 3);
      if (t >= 0.8 && !this.hit) {
        this.hit = true;
        const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
        const impact = new THREE.Vector3(this.pos.x + fx * 2, 0, this.pos.z + fz * 2);
        ctx.effects.shockwave(impact, { color: 0xff6060, radius: 3.5, life: 0.5, y: 0.1 }); ctx.effects.addShake(0.5); ctx.sfx && ctx.sfx('slam');
        for (const tg of [p, ...(ctx.allies || [])]) if (tg.alive && Math.hypot(tg.pos.x - impact.x, tg.pos.z - impact.z) < 3.3) tg.takeDamage(this.dmg, impact, ctx.effects);
      }
      if (t >= 1.4) { this.setState('chase'); this.attackCooldown = rand(1.4, 2.2); }
    } else if (this.state === 'charge') {
      const t = this.stateT;
      if (t < 0.6) this._faceTo(ang, dt, 6);
      else if (t < 1.3) {
        if (!this.charge) this.charge = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
        this.pos.addScaledVector(this.charge, 12 * dt);
        if (!this.hit) for (const tg of [p, ...(ctx.allies || [])]) if (tg.alive && Math.hypot(tg.pos.x - this.pos.x, tg.pos.z - this.pos.z) < this.radius + tg.radius + 0.5) { this.hit = true; tg.takeDamage(Math.round(this.dmg * 0.9), this.pos, ctx.effects); }
        if (!ctx.stage.inBounds(this.pos.x, this.pos.z, this.radius + 0.3)) this.stateT = 1.3;
      }
      if (t >= 1.8) { this.setState('chase'); this.attackCooldown = rand(1.6, 2.4); }
    }
  }
  animate(dt) {
    const t = this.stateT; let ax = 0.2, lean = 0;
    if (this.state === 'slam') { ax = t < 0.8 ? -2.8 : -0.4; lean = t < 0.8 ? -0.2 : 0.3; }
    else if (this.state === 'charge') { ax = -1.0; lean = t < 0.6 ? -0.2 : 0.35; }
    else if (this.state === 'chase') { const w = performance.now() * 0.008 + this.id; this.legs[0].rotation.x = Math.sin(w) * 0.5; this.legs[1].rotation.x = -Math.sin(w) * 0.5; ax = 0.2 + Math.sin(w) * 0.2; lean = 0.1; }
    this.armR.rotation.x = damp(this.armR.rotation.x, ax, 18, dt);
    if (this.state !== 'dead') this.group.rotation.x = damp(this.group.rotation.x, lean, 10, dt);
    this.eyeMat.emissive.setHex((this.state === 'slam' && t < 0.8) || (this.state === 'charge' && t < 0.6) ? 0xff2020 : 0xffe08a);
  }
}

// ---------- 원거리형: 鬼火 (귀화) — 떠다니는 망령 ----------
export class RangedYokai extends Enemy {
  constructor(scene, pos, mul) {
    super(scene, pos, mul);
    this.name = '귀화'; this.kind = 'ranged';
    this.hp = this.maxHp = Math.round(26 * this.mul.hp);
    this.speed = 2.8;
    this.radius = 0.5; this.height = 1.9;
    this.baseOpacity = 0.85;
    this._build();
    this.group.scale.set(0.01, 0.01, 0.01);
    this.fireCooldown = rand(1.8, 2.8);
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
    const p = this._target(ctx);
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
      if (d < 3 && this.attackCooldown <= 0) {
        // 혈귀술: 순간이동 후퇴
        this.attackCooldown = 4;
        ctx.effects.mist(this.center, [0x70d0ff, 0xffffff], 14);
        const nx = this.pos.x - dx / d * 6, nz = this.pos.z - dz / d * 6;
        this.pos.set(nx, this.pos.y, nz); ctx.stage.resolveCollisions(this.pos, this.radius);
        ctx.effects.mist(this.center, [0x70d0ff, 0xffffff], 14); ctx.sfx && ctx.sfx('dash');
      }
      if (this.fireCooldown <= 0 && d < 18) { this.setState('cast'); this.castFan = Math.random() < 0.45; }
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
        if (this.castFan) {
          const base = Math.atan2(dir.x, dir.z);
          for (const off of [-0.25, 0, 0.25]) ctx.spawnProjectile(src.clone(), new THREE.Vector3(Math.sin(base + off), dir.y, Math.cos(base + off)), { speed: 10, dmg: Math.round(6 * this.mul.dmg), color: 0xa0e0ff, size: 0.24 });
        } else ctx.spawnProjectile(src, dir, { speed: 10, dmg: Math.round(8 * this.mul.dmg), color: 0x60c0ff });
        ctx.sfx && ctx.sfx('fire');
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
const DEFAULT_BOSS = { name: '도깨비', body: 0x1c1620, loin: 0x7a2a2a, eye: 0xff2010, hp: 480, scale: 2.4, dmg: 16, skills: ['slam', 'charge', 'firering'], chargeSpeed: 15 };
export class BossOni extends MeleeYokai {
  constructor(scene, pos, cfg = DEFAULT_BOSS, mul) {
    super(scene, pos, mul);
    this.cfg = cfg;
    this.name = cfg.name; this.kind = 'boss';
    this.isBoss = true;
    this.hp = this.maxHp = Math.round(cfg.hp * (this.mul.hp > 1 ? 1 + (this.mul.hp - 1) * 0.4 : 1));
    this.speed = 3.0;
    this.scaleBase = cfg.scale;
    this.radius = 0.52 * cfg.scale; this.height = 1.75 * cfg.scale;
    this.dmg = Math.round(cfg.dmg * this.mul.dmg); this.attackRange = 1.5 * cfg.scale;
    this.attackCooldown = 2;
    this.phase = 1;
    this.summonTimer = 12;
    this.skills = cfg.skills || ['slam', 'charge'];
    this.cfg.chargeSpeed = cfg.chargeSpeed || 16;
    this.regenT = 0; this.lastHitT = 0;
    // 등급: 하현 = 어려움, 상현 = 매우 어려움, 무잔 = 매우 어려움+
    this.muzan = /무잔/.test(cfg.name);
    this.upper = /상현/.test(cfg.name) || this.muzan;
    this.lower = /하현/.test(cfg.name);
    const tier = this.muzan ? { hp: 1.6, dmg: 1.6, spd: 4.0 } : this.upper ? { hp: 1.45, dmg: 1.4, spd: 3.8 } : this.lower ? { hp: 1.15, dmg: 1.15, spd: 3.3 } : { hp: 1, dmg: 1, spd: 3.0 };
    this.hp = this.maxHp = Math.round(this.maxHp * tier.hp); this.dmg = Math.round(this.dmg * tier.dmg); this.speed = tier.spd;
    this.tierName = this.muzan ? '무잔' : this.upper ? '상현' : this.lower ? '하현' : '도깨비';
    // 혈귀 외형: 사람형 도깨비 모델로 교체
    const design = getDemonDesign(cfg.id);
    if (design) {
      while (this.group.children.length) this.group.remove(this.group.children[0]);
      this.mats = [];
      const parts = buildModel({ colors: design.colors, look: design.look, skin: design.skin, special: { c1: cfg.eye } });
      this.group.add(parts.body);
      this.humanParts = parts;
      this.armR = parts.rightArm; this.armL = parts.leftArm;
      this.legs = [new THREE.Object3D(), new THREE.Object3D()];
      // 텔레그래프용 오라 (눈 대신 몸 전체가 붉게 빛남)
      const auraMat = new THREE.MeshBasicMaterial({ color: cfg.eye, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide });
      const aura = new THREE.Mesh(new THREE.SphereGeometry(0.75, 10, 8), auraMat); aura.position.y = 1.1; aura.scale.set(1, 1.6, 1); parts.body.add(aura);
      this.aura = auraMat;
      this.eyeMat = new THREE.MeshLambertMaterial({ color: cfg.eye, emissive: cfg.eye }); // animate 호환용 더미
      this._collectMats();
      this.mats = this.mats.filter((v) => v.m !== auraMat && !(v.m.side === THREE.BackSide));
      this.scaleBase = Math.max(1.2, cfg.scale * 0.62);
      this.radius = 0.48 * this.scaleBase; this.height = 2.0 * this.scaleBase; this.attackRange = 1.6 * this.scaleBase;
    }
    this.chain = 0;
    for (const e of this.mats) {
      if (e.m.color && e.m.color.getHex() === 0xb8322a) e.m.color.setHex(cfg.body);
      if (e.m.color && e.m.color.getHex() === 0xd9a640) e.m.color.setHex(cfg.loin);
    }
    this.eyeMat.color.setHex(cfg.eye); this.eyeMat.emissive.setHex(cfg.eye);
    for (const e of this.mats) if (e.m === this.eyeMat) e.emissive = cfg.eye;
    this.eyeColor = cfg.eye;
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
    const p = this._target(ctx);
    const { dx, dz, d, ang } = this._toPlayer(p);
    // 불사 재생
    if (this.cfg.undying && this.regenT > 0) { this.regenT -= dt; this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.12 * dt); }
    const frac = this.hp / this.maxHp;
    if ((frac < 0.65 && this.phase === 1) || (frac < 0.3 && this.phase === 2)) {
      this.phase++;
      ctx.onBossPhase && ctx.onBossPhase(this, this.phase);
      ctx.sfx && ctx.sfx('roar');
      ctx.effects.shockwave(this.pos, { color: this.eyeColor, radius: 9, life: 0.9, y: 0.1 });
      ctx.effects.burst(this.center, { count: 60, colors: [this.eyeColor, 0x8a1030, 0xffffff], speed: 6, life: 1.0, size: 0.6, gravity: -2, drag: 1 });
      this.stagger = 0; this.attackCooldown = 0.3;
      this._transform(this.phase, ctx);
    }
    const t = this.stateT;
    if (this.state === 'chase') {
      this._faceTo(ang, dt, 4);
      if (!p.alive) return;
      if (this.attackCooldown <= 0) {
        // 거리에 맞는 혈귀술 선택 (2페이즈는 더 자주)
        const options = this.skills.filter((s) => {
          if (s === 'charge') return d > 6;
          if (s === 'slam') return d <= this.attackRange + 0.8;
          if (s === 'firering' || s === 'thread') return d > 3.5;
          if (s === 'fan') return d > 3;
          if (s === 'beam') return d > 4 && d < 20;
          if (s === 'blink') return d > 2.5;
          if (s === 'field') return d > 2;
          if (s === 'summon') return ctx.enemies.filter((x) => x.alive && !x.isBoss).length < 4;
          return false;
        });
        if (options.length) {
          const s = pick(options);
          this.hit = false; this.fired = false; this.charge = null;
          this.setState(s);
          if (s === 'beam') { this.beamYaw = ang; this._beamTelegraph(ctx); }
          if (s === 'summon') { ctx.summon && ctx.summon(2); ctx.effects.shockwave(this.pos, { color: this.eyeColor, radius: 6, life: 0.6 }); ctx.sfx && ctx.sfx('roar'); }
        } else this._moveTowards(dx, dz, d, dt);
      } else if (d > this.attackRange) this._moveTowards(dx, dz, d, dt);
    } else if (this.state === 'slam') {
      if (t < 0.85) this._faceTo(ang, dt, 3);
      if (t >= 0.85 && !this.hit) {
        this.hit = true;
        const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
        const impact = new THREE.Vector3(this.pos.x + fx * 2.4, 0, this.pos.z + fz * 2.4);
        ctx.effects.shockwave(impact, { color: 0xffa040, radius: 4.5, life: 0.55, y: 0.1 });
        ctx.effects.burst(impact, { count: 40, colors: [0x6a5a40, 0x9a8a60, 0xff8a30], speed: 6, life: 0.7, size: 0.5, gravity: -9, drag: 1, up: 2 });
        ctx.effects.addShake(0.8);
        ctx.sfx && ctx.sfx('slam');
        this._hitTargets(ctx, (tg) => Math.hypot(tg.pos.x - impact.x, tg.pos.z - impact.z) < 4.2, this.dmg, impact);
      }
      if (t >= 1.5) this._endSkill(1.4, 2.2);
    } else if (this.state === 'charge') {
      if (t < 0.7) {
        if (t < 0.05 && !this.roared) { this.roared = true; ctx.sfx && ctx.sfx('roar'); }
        this._faceTo(ang, dt, 6);
        if (Math.random() < 0.6) ctx.effects.emit({ pos: new THREE.Vector3(this.pos.x + rand(-1, 1), 0.3, this.pos.z + rand(-1, 1)), vel: new THREE.Vector3(0, 2, 0), life: 0.4, size: 0.5, color: this.eyeColor });
      } else if (t < 1.5) {
        if (!this.charge) this.charge = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
        this.pos.addScaledVector(this.charge, this.cfg.chargeSpeed * dt);
        ctx.effects.emit({ pos: new THREE.Vector3(this.pos.x + rand(-1, 1), 0.3, this.pos.z + rand(-1, 1)), vel: new THREE.Vector3(0, 1.5, 0), life: 0.5, size: 0.7, color: 0x5a4a3a });
        if (!this.hit) this._hitTargets(ctx, (tg) => Math.hypot(tg.pos.x - this.pos.x, tg.pos.z - this.pos.z) < this.radius + tg.radius + 0.6, Math.round(this.dmg * 0.8), this.pos, () => { this.hit = true; ctx.effects.addShake(0.5); });
        if (!ctx.stage.inBounds(this.pos.x, this.pos.z, this.radius + 0.3)) { this.stateT = 1.5; ctx.effects.addShake(0.6); ctx.effects.shockwave(this.pos, { color: 0xffffff, radius: 3, life: 0.4 }); }
      }
      if (t >= 2.1) { this.roared = false; this._endSkill(1.2, 2.0); }
    } else if (this.state === 'firering' || this.state === 'thread') {
      const thread = this.state === 'thread';
      if (t < 0.9) ctx.effects.emit({ pos: this.center.add(new THREE.Vector3(rand(-1.5, 1.5), rand(-1, 1), rand(-1.5, 1.5))), vel: new THREE.Vector3(0, 0, 0), life: 0.3, size: 0.5, color: this.eyeColor });
      if (t >= 0.9 && !this.fired) {
        this.fired = true;
        const n = thread ? 16 : 10;
        const src = this.center;
        for (let i = 0; i < n; i++) {
          const a = ang + (i / n) * Math.PI * 2;
          ctx.spawnProjectile(src.clone(), new THREE.Vector3(Math.sin(a), -0.08, Math.cos(a)), { speed: thread ? 11 : 7.5, dmg: Math.round((thread ? 7 : 8) * this.mul.dmg), color: this.eyeColor, size: thread ? 0.22 : 0.32, life: 5 });
        }
        if (thread) setTimeout(() => { if (this.alive) for (let i = 0; i < n; i++) { const a = ang + ((i + 0.5) / n) * Math.PI * 2; ctx.spawnProjectile(this.center.clone(), new THREE.Vector3(Math.sin(a), -0.08, Math.cos(a)), { speed: 9, dmg: Math.round(7 * this.mul.dmg), color: 0xffffff, size: 0.2, life: 5 }); } }, 350);
        ctx.effects.shockwave(this.pos, { color: this.eyeColor, radius: 5, life: 0.5 });
        ctx.sfx && ctx.sfx('fire');
      }
      if (t >= 1.6) this._endSkill(1.6, 2.6);
    } else if (this.state === 'fan') {
      if (t < 0.6) this._faceTo(ang, dt, 6);
      if (t >= 0.6 && !this.fired) {
        this.fired = true;
        const src = this.center;
        for (let i = -2; i <= 2; i++) {
          const a = this.yaw + i * 0.22;
          ctx.spawnProjectile(src.clone(), new THREE.Vector3(Math.sin(a), -0.05, Math.cos(a)), { speed: 12, dmg: Math.round(9 * this.mul.dmg), color: this.eyeColor, size: 0.26, life: 3.5 });
        }
        ctx.sfx && ctx.sfx('fire');
      }
      if (t >= 1.1) this._endSkill(1.0, 1.8);
    } else if (this.state === 'beam') {
      if (t < 0.6) { this.beamYaw = angleLerp(this.beamYaw, ang, 1 - Math.exp(-5 * dt)); this.yaw = this.beamYaw; if (this.beamMesh) this.beamMesh.rotation.y = this.beamYaw; }
      if (t >= 1.0 && !this.fired) {
        this.fired = true;
        const fx = Math.sin(this.beamYaw), fz = Math.cos(this.beamYaw);
        for (let i = 0; i < 24; i++) ctx.effects.burst(new THREE.Vector3(this.pos.x + fx * i * 0.8, 1.2, this.pos.z + fz * i * 0.8), { count: 6, colors: [this.eyeColor, 0xffffff], speed: 3, life: 0.5, size: 0.6, gravity: 0, drag: 2 });
        ctx.effects.addShake(0.7); ctx.sfx && ctx.sfx('slam');
        this._hitTargets(ctx, (tg) => { if (tg.airborne && tg.pos.y > 0.3) return false; const rx = tg.pos.x - this.pos.x, rz = tg.pos.z - this.pos.z; const along = rx * fx + rz * fz; const lat = Math.abs(-rx * fz + rz * fx); return along > 0 && along < 20 && lat < 1.4 + tg.radius; }, Math.round(this.dmg * 1.1), this.pos);
        if (this.beamMesh) { this.beamMesh.material.color.setHex(0xffffff); this.beamMesh.material.opacity = 0.9; }
      }
      if (t >= 1.5) { this._endSkill(1.5, 2.4); }
    } else if (this.state === 'blink') {
      if (t < 0.35) { this.opacity = 1 - t / 0.35; if (Math.random() < 0.5) ctx.effects.mist(this.center, [this.eyeColor, 0x201020], 3); }
      if (t >= 0.35 && !this.fired) {
        this.fired = true;
        // 표적 뒤로 순간이동
        const bx = p.pos.x + (p.pos.x - this.pos.x) / Math.max(d, 0.01) * 2.6, bz = p.pos.z + (p.pos.z - this.pos.z) / Math.max(d, 0.01) * 2.6;
        this.pos.set(bx, 0, bz); ctx.stage.resolveCollisions(this.pos, this.radius);
        ctx.effects.mist(this.center, [this.eyeColor, 0xffffff], 20); ctx.sfx && ctx.sfx('dash');
      }
      if (t >= 0.35) { this.opacity = Math.min(1, (t - 0.35) / 0.2); this._faceTo(ang, dt, 12); }
      if (t >= 0.95 && !this.hit) {
        this.hit = true;
        const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
        ctx.effects.slashArc(this.pos, this.yaw, { rIn: 0.5, rOut: 3.2, angle: 1.8, tilt: -0.5, color: this.eyeColor, life: 0.25, sweep: 1, y: 1.2 });
        ctx.sfx && ctx.sfx('swingHeavy');
        this._hitTargets(ctx, (tg) => { const rx = tg.pos.x - this.pos.x, rz = tg.pos.z - this.pos.z; const dd = Math.hypot(rx, rz); return dd < 3.4 + tg.radius && (rx * fx + rz * fz) / Math.max(dd, 0.01) > 0.2; }, Math.round(this.dmg * 0.9), this.pos);
      }
      if (t >= 1.4) this._endSkill(1.2, 2.0);
    } else if (this.state === 'field') {
      if (t < 0.5) this._faceTo(ang, dt, 6);
      if (t >= 0.5 && !this.fired) {
        this.fired = true;
        ctx.addField && ctx.addField(p.pos.x, p.pos.z, 3.6, 6, Math.round(4 * this.mul.dmg), this.eyeColor);
        ctx.sfx && ctx.sfx('fire');
      }
      if (t >= 1.0) this._endSkill(1.2, 2.0);
    } else if (this.state === 'summon') {
      if (t >= 0.8) this._endSkill(3.0, 4.0);
    }
  }

  // 페이즈 변신: 커지고, 뿔이 돋고, 오라가 짙어지고, 빨라진다
  _transform(ph, ctx) {
    this.scaleBase *= 1.14;
    this.radius *= 1.14; this.height *= 1.14; this.attackRange *= 1.1; this.speed *= 1.15;
    if (this.humanParts) {
      const head = this.humanParts.head;
      for (const s of [-1, 1]) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05 + ph * 0.02, 0.22 + ph * 0.12, 5), new THREE.MeshToonMaterial({ color: 0xe8e0d0 }));
        horn.position.set(s * (0.14 + ph * 0.06), 0.34, 0.02 - ph * 0.04); horn.rotation.z = -s * (0.3 + ph * 0.15); head.add(horn);
      }
      // 핏줄: 붉게 물드는 피부·의상
      for (const m of this.mats) if (m.m.color) m.m.color.lerp(new THREE.Color(this.eyeColor), 0.18);
      if (this.aura) this.aura.opacity = 0.08 * ph;
    }
    ctx.effects.burst(this.center, { count: 80, colors: [this.eyeColor, 0xffffff, 0x200010], speed: 7, life: 1.2, size: 0.7, gravity: -1, drag: 1 });
    ctx.sfx && ctx.sfx('roar');
  }

  _endSkill(a, b) {
    this.setState('chase');
    const mul = (this.phase === 3 ? 0.5 : this.phase === 2 ? 0.7 : 1) * (this.muzan ? 0.65 : this.upper ? 0.75 : this.lower ? 0.9 : 1);
    this.attackCooldown = rand(a, b) * mul;
    // 3페이즈(또는 상현 2페이즈): 기술을 연달아 쓴다
    if ((this.phase === 3 || (this.upper && this.phase >= 2)) && this.chain < 1 && Math.random() < 0.6) { this.chain++; this.attackCooldown = 0.15; } else this.chain = 0;
    if (this.beamMesh) { this.beamMesh.userData.dead = true; this.beamMesh = null; }
  }

  _hitTargets(ctx, test, dmg, from, onHit) {
    for (const tg of [ctx.player, ...(ctx.allies || [])]) {
      if (!tg.alive || !test(tg)) continue;
      if (tg.takeDamage(dmg, from, ctx.effects) && onHit) onHit(tg);
    }
  }

  _beamTelegraph(ctx) {
    const geo = new THREE.BoxGeometry(2.8, 0.06, 20); geo.translate(0, 0, 10);
    const mat = new THREE.MeshBasicMaterial({ color: this.eyeColor, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(this.pos.x, 0.12, this.pos.z); mesh.rotation.y = this.beamYaw;
    this.beamMesh = mesh;
    ctx.effects.track(mesh, 1.6, (t) => { if (mesh.userData.dead) mat.opacity = 0; else { mesh.position.set(this.pos.x, 0.12, this.pos.z); mat.opacity = t < 0.62 ? 0.25 + 0.2 * Math.sin(t * 40) : 0.9 * (1 - (t - 0.62) / 0.38); } });
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
    } else if (this.state === 'firering' || this.state === 'thread' || this.state === 'field' || this.state === 'summon') {
      ax = -2.2; ay = 1.0; lean = -0.1;
    } else if (this.state === 'fan' || this.state === 'beam') {
      ax = t < 0.6 ? -2.6 : -0.8; ay = 0.4; lean = t < 0.6 ? -0.2 : 0.25;
    } else if (this.state === 'blink') {
      ax = t < 0.95 ? -2.8 : -0.4; lean = t < 0.95 ? -0.2 : 0.3;
    } else if (this.state === 'chase') {
      const w = performance.now() * 0.007 + this.id;
      this.legs[0].rotation.x = Math.sin(w) * 0.5; this.legs[1].rotation.x = -Math.sin(w) * 0.5;
      this.armL.rotation.x = -Math.sin(w) * 0.4;
      ax = 0.2 + Math.sin(w) * 0.2; lean = 0.1;
    }
    this.armR.rotation.x = damp(this.armR.rotation.x, ax, 18, dt);
    this.armR.rotation.y = damp(this.armR.rotation.y, ay, 18, dt);
    if (this.state !== 'dead') this.group.rotation.x = damp(this.group.rotation.x, lean, 10, dt);
    const telegraph = (this.state === 'slam' && t < 0.85) || (this.state === 'charge' && t < 0.7) || ((this.state === 'firering' || this.state === 'thread') && t < 0.9) || (this.state === 'beam' && t < 1.0) || (this.state === 'fan' && t < 0.6) || (this.state === 'blink' && t < 0.95);
    this.eyeMat.emissive.setHex(telegraph ? 0xffffff : this.eyeColor);
    this.eyeMat.emissiveIntensity = telegraph ? 2 : 0.9;
    if (this.aura) { this.aura.opacity = telegraph ? 0.35 + 0.15 * Math.sin(performance.now() * 0.02) : (this.phase >= 2 ? 0.08 : 0); }
    if (this.alive && this.state !== 'spawn' && this.state !== 'dead') { const s = damp(this.group.scale.x, this.scaleBase, 4, dt); this.group.scale.set(s, s, s); }
    if (this.humanParts) {
      animateFace(this.humanParts, dt);
      const P = this.humanParts;
      P.leftArm.rotation.x = damp(P.leftArm.rotation.x, this.state === 'chase' ? Math.sin(performance.now() * 0.007 + this.id) * 0.4 : -0.6, 12, dt);
      for (let i = 0; i < P.extraArms.length; i++) P.extraArms[i].rotation.x = -0.4 + Math.sin(performance.now() * 0.004 + i) * 0.3;
      P.body.position.y = this.state === 'chase' ? Math.abs(Math.sin(performance.now() * 0.008)) * 0.05 : 0;
    }
  }
}

// ---------- 웨이브/스폰 관리 ----------
const WAVES = [
  { melee: 2, ranged: 0, title: '첫 번째 파도', sub: '소귀들이 안개 속에서 기어 나온다' },
  { melee: 2, ranged: 2, title: '두 번째 파도', sub: '귀화가 대나무 사이를 떠돈다' },
  { melee: 3, ranged: 2, title: '세 번째 파도', sub: '숲 전체가 술렁인다' },
  { boss: true, title: '흑귀', sub: '대나무 숲의 주인이 눈을 뜬다' },
];

export class EnemyManager {
  constructor(scene, chapter = null) {
    this.scene = scene;
    this.waves = (chapter && chapter.waves) || WAVES;
    this.scale = (chapter && chapter.scale) || { hp: 1, dmg: 1 };
    this.bossCfg = (chapter && chapter.boss) || DEFAULT_BOSS;
    this.chapterId = (chapter && chapter.id) || 1;
    this.diff = (chapter && chapter.diff) || 1;
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
    this.pickups = [];
    this.onKill = null;
    this.onPickup = null;
    this.onWave = null;
    this.onBossDown = null;
    this.onBossRegen = null;
    this.fields = [];
  }

  get aliveCount() { return this.list.filter((e) => e.alive).length; }
  get totalWaves() { return this.waves.length; }
  get allWavesCleared() { return this.waveIndex >= this.waves.length - 1 && this.aliveCount === 0 && this.spawnQueue.length === 0; }

  _spawnPos(player, min = 10, max = 16) {
    return this.stage ? this.stage.randomSpawn(player.pos, min, max) : new THREE.Vector3(0, 0, -12);
  }

  startWave(index, player) {
    this.waveIndex = index;
    const w = this.waves[index];
    if (!w) return;
    this.onMessage && this.onMessage(w.title, w.sub);
    this.onWave && this.onWave(index, w);
    if (w.boss) {
      const bs = (this.stage && this.stage.map.bossStart) || { x: 0, z: -12 };
      const pos = new THREE.Vector3(bs.x, 0, bs.z);
      const cfg = typeof w.boss === 'object' ? w.boss : this.bossCfg;
      this.boss = new BossOni(this.scene, pos, cfg, this.scale);
      const b = this.boss;
      if (this._ctx) this._normalize(b, b.muzan ? 90 : b.upper ? 180 : b.lower ? 120 : 60, this._ctx);
      b.dmg = Math.round((b.muzan ? 70 : b.upper ? 50 : b.lower ? 35 : 25) * (this.diff || 1));
      this.boss.onRegen = (b) => this.onBossRegen && this.onBossRegen(b);
      this.list.push(this.boss);
      this.onBossSpawn && this.onBossSpawn(this.boss);
      // 보스와 함께 잡귀 소수
      if (w.melee) for (let i = 0; i < w.melee; i++) this.spawnQueue.push({ t: 1 + i * 0.4, type: 'melee' });
      if (this.chapterId >= 5) this.spawnQueue.push({ t: 6, type: 'ranged' }, { t: 6.5, type: 'ranged' });
      return;
    }
    let delay = 0;
    for (let i = 0; i < w.melee; i++) { this.spawnQueue.push({ t: delay, type: 'melee' }); delay += 0.35; }
    for (let i = 0; i < w.ranged; i++) { this.spawnQueue.push({ t: delay, type: 'ranged' }); delay += 0.35; }
    const brutes = w.brute !== undefined ? w.brute : (this.chapterId >= 3 ? 1 + Math.floor((this.chapterId - 3) / 2) : 0);
    for (let i = 0; i < brutes; i++) { this.spawnQueue.push({ t: delay, type: 'brute' }); delay += 0.5; }
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

  // 플레이어의 평균 한 타 피해 (체력 정규화 기준)
  playerHit(ctx) { const p = ctx.player; return 15 * ((p && p.skill && p.skill.dmgMul) || 1); }
  _normalize(e, hits, ctx) {
    e.maxHp = Math.max(10, Math.round(hits * this.playerHit(ctx)));
    e.hp = e.maxHp; e.hitsToKill = hits;
  }

  update(dt, ctx) {
    const player = ctx.player;
    this.stage = ctx.stage;
    this._ctx = ctx;
    ctx.enemies = this.list;
    ctx.pickups = this.pickups;
    ctx.projectiles = this.projectiles;
    ctx.spawnProjectile = (p, d, o) => this.spawnProjectile(p, d, o);
    ctx.summon = (n) => { for (let i = 0; i < n; i++) this.spawnQueue.push({ t: i * 0.4, type: 'melee' }); };
    ctx.dt = dt;

    // 스폰 큐
    if (!this.dissolved) {
      for (let i = this.spawnQueue.length - 1; i >= 0; i--) {
        const s = this.spawnQueue[i];
        s.t -= dt;
        if (s.t <= 0) {
          const pos = this._spawnPos(player);
          const ms = this.minionScale || (this.minionScale = { hp: this.scale.hp * 0.7, dmg: this.scale.dmg * 0.65 });
          const e = s.type === 'melee' ? new MeleeYokai(this.scene, pos, ms) : s.type === 'brute' ? new BruteYokai(this.scene, pos, ms) : new RangedYokai(this.scene, pos, ms);
          this._normalize(e, s.type === 'brute' ? 8 : s.type === 'ranged' ? 3 : 4, ctx);
          this.list.push(e);
          ctx.effects.mist(new THREE.Vector3(pos.x, 0.5, pos.z), undefined, 25);
          ctx.sfx && ctx.sfx('spawn');
          this.spawnQueue.splice(i, 1);
        }
      }
      // 다음 웨이브
      if (this.aliveCount === 0 && this.spawnQueue.length === 0 && this.waveIndex < this.waves.length - 1 && player.alive) {
        this.waveDelay -= dt;
        if (this.waveDelay <= 0) { this.startWave(this.waveIndex + 1, player); this.waveDelay = 3.5; }
      }
      // 보스 2페이즈 시 추가 소환
      if (this.boss && this.boss.alive && this.boss.phase === 2 && !this.boss.addsSpawned) {
        this.boss.addsSpawned = true;
        this.spawnQueue.push({ t: 0.5, type: 'ranged' }, { t: 1.3, type: 'melee' });
      }
    }

    // 적 업데이트
    for (const e of this.list) e.update(dt, ctx);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      if (!e.alive && !e.dissolving && !e.dropped) { e.dropped = true; this._onDeath(e, ctx); }
      if (e.removed) this.list.splice(i, 1);
    }
    this._updatePickups(dt, ctx);
    // 보스 사망 → 마지막 파도면 새벽, 아니면 다음 파도
    if (this.boss && !this.boss.alive && !this.boss.reported && !this.boss.dissolving) {
      this.boss.reported = true;
      if (this.waveIndex >= this.waves.length - 1) { this.bossDefeated = true; this.onBossDefeated && this.onBossDefeated(this.boss); }
      else { this.onBossDown && this.onBossDown(this.boss); this.waveDelay = 4; }
    }
    // 장판
    ctx.addField = (x, z, r, life, dmg, color) => {
      const ring = new THREE.Mesh(new THREE.CircleGeometry(r, 24), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.08, z); this.scene.add(ring);
      this.fields.push({ mesh: ring, x, z, r, life, dmg, tick: 0.6, color });
    };
    for (let i = this.fields.length - 1; i >= 0; i--) {
      const f = this.fields[i];
      f.life -= dt; f.tick -= dt;
      f.mesh.material.opacity = 0.2 + 0.12 * Math.sin(f.life * 6);
      if (Math.random() < 0.3) ctx.effects.emit({ pos: new THREE.Vector3(f.x + rand(-f.r, f.r) * 0.8, 0.2, f.z + rand(-f.r, f.r) * 0.8), vel: new THREE.Vector3(0, rand(0.5, 1.5), 0), life: 0.8, size: 0.4, color: f.color, drag: 1 });
      if (f.tick <= 0) {
        f.tick = 0.6;
        for (const tg of [player, ...(ctx.allies || [])]) if (tg.alive && !(tg.airborne && tg.pos.y > 0.3) && Math.hypot(tg.pos.x - f.x, tg.pos.z - f.z) < f.r) tg.takeDamage(f.dmg, new THREE.Vector3(f.x, 0, f.z), ctx.effects);
      }
      if (f.life <= 0 || this.dissolved) { this.scene.remove(f.mesh); f.mesh.material.dispose(); this.fields.splice(i, 1); }
    }

    // 투사체
    for (const p of this.projectiles) p.update(dt, ctx);
    for (let i = this.projectiles.length - 1; i >= 0; i--) if (!this.projectiles[i].alive) this.projectiles.splice(i, 1);
  }

  // 사망: 경험치 콜백 + 아이템 드롭
  _onDeath(e, ctx) {
    this.kills++;
    this.onKill && this.onKill(e);
    const boss = e.isBoss;
    // 금화
    const gold = boss ? 120 + Math.round(rand(0, 60)) : Math.round(rand(4, 12) * (e.kind === 'ranged' ? 1.3 : 1));
    this._spawnPickup({ type: 'gold', amount: gold }, e.pos, ctx);
    const potionChance = boss ? 1 : 0.22;
    if (Math.random() < potionChance) this._spawnPickup({ type: 'potion' }, e.pos, ctx);
    const itemChance = boss ? 1 : e.kind === 'ranged' ? 0.3 : 0.24;
    if (Math.random() < itemChance) {
      const level = (ctx.player.progress && ctx.player.progress.level) || 1;
      this._spawnPickup({ type: 'item', item: generateItem(rollRarity(boss), null, level) }, e.pos, ctx);
      if (boss) this._spawnPickup({ type: 'item', item: generateItem(rollRarity(true), null, level) }, e.pos, ctx);
    }
  }

  _spawnPickup(data, pos, ctx) {
    const g = new THREE.Group();
    let color;
    if (data.type === 'gold') {
      color = 0xffd040;
      const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 10), new THREE.MeshLambertMaterial({ color: 0xffd040, emissive: 0xc08010, emissiveIntensity: 0.7 }));
      coin.rotation.x = Math.PI / 2;
      g.add(coin);
    } else if (data.type === 'potion') {
      color = 0xff5070;
      const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.36, 7), new THREE.MeshLambertMaterial({ color: 0xff4060, emissive: 0xff2040, emissiveIntensity: 0.8, transparent: true, opacity: 0.9 }));
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.14, 6), new THREE.MeshLambertMaterial({ color: 0x3a2a20 }));
      neck.position.y = 0.25;
      g.add(bottle, neck);
    } else {
      color = RARITIES[data.item.rarity].hex;
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.9 }));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.03, 6, 20), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 }));
      ring.rotation.x = Math.PI / 2;
      g.add(gem, ring);
    }
    const a = rand(0, Math.PI * 2), r = rand(0.4, 1.4);
    g.position.set(pos.x + Math.cos(a) * r, 0.5, pos.z + Math.sin(a) * r);
    ctx.stage.resolveCollisions(g.position, 0.3);
    this.scene.add(g);
    this.pickups.push({ ...data, group: g, color, life: 45, t: rand(0, 6), vy: 3 });
    ctx.effects.burst(g.position, { count: 12, colors: [color, 0xffffff], speed: 2, life: 0.6, size: 0.35, gravity: 0, drag: 2 });
  }

  _updatePickups(dt, ctx) {
    const p = ctx.player;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const k = this.pickups[i];
      k.t += dt; k.life -= dt;
      // 낙하 후 둥실
      if (k.vy > 0) { k.vy -= 8 * dt; k.group.position.y += k.vy * dt; if (k.group.position.y < 0.5) { k.group.position.y = 0.5; k.vy = 0; } }
      else k.group.position.y = 0.5 + Math.sin(k.t * 3) * 0.12;
      k.group.rotation.y += dt * 2;
      if (k.type === 'gold') k.group.rotation.y += dt * 4;
      if (Math.random() < (k.type === 'gold' ? 0.05 : 0.15)) ctx.effects.emit({ pos: k.group.position, vel: new THREE.Vector3(rand(-0.3, 0.3), rand(0.5, 1.2), rand(-0.3, 0.3)), life: 0.7, size: 0.25, color: k.color, drag: 1 });
      const d = Math.hypot(p.pos.x - k.group.position.x, p.pos.z - k.group.position.z);
      // 가까우면 끌려옴
      if (p.alive && d < 3.2) {
        const pull = Math.min(1, (3.2 - d) / 3.2) * 9 * dt;
        k.group.position.x += (p.pos.x - k.group.position.x) / Math.max(d, 0.01) * pull;
        k.group.position.z += (p.pos.z - k.group.position.z) / Math.max(d, 0.01) * pull;
      }
      const taken = p.alive && d < 0.9 && this.onPickup && this.onPickup(k);
      if (taken || k.life <= 0) {
        if (taken) ctx.effects.burst(k.group.position, { count: 16, colors: [k.color, 0xffffff], speed: 3, life: 0.5, size: 0.35, gravity: 1, drag: 1.5, up: 2 });
        this.scene.remove(k.group);
        k.group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
        this.pickups.splice(i, 1);
      }
    }
  }
}
