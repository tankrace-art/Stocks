// ally.js — 동료 검사 AI: 플레이어를 따라다니며 근처 요괴를 베고, 쓰러지면 잠시 후 일어난다
import * as THREE from 'three';
import { clamp, lerp, damp, rand, angleLerp, angleDiff, easeOutCubic } from './util.js';
import { buildModel, animateFace } from './player.js';

export class Ally {
  constructor(scene, character, index = 0) {
    this.scene = scene;
    this.ch = character;
    this.index = index;
    this.parts = buildModel(character);
    this.group = new THREE.Group();
    this.group.add(this.parts.body);
    scene.add(this.group);
    this.pos = this.group.position;
    this.pos.set(-1.5 + index * 3, 0, 5.5);
    this.yaw = Math.PI;
    this.radius = 0.42; this.height = 1.9;
    this.maxHp = Math.round(character.stats.hp * 0.9);
    this.hp = this.maxHp;
    this.alive = true;
    this.downT = 0;
    this.invuln = 0; this.blink = 0;
    this.attackT = 0; this.attackCd = rand(0.3, 0.9);
    this.walkPhase = 0; this.moving = false;
    this.knock = new THREE.Vector3();
    this.target = null;
    this.speed = character.stats.speed * 0.95;
    this.dmg = 14 * character.stats.dmg;
    this.kills = 0;
    this.isAlly = true;
  }

  get center() { return new THREE.Vector3(this.pos.x, this.pos.y + 1.1, this.pos.z); }
  get forward() { return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }

  takeDamage(dmg, fromPos, effects) {
    if (!this.alive || this.invuln > 0) return false;
    this.hp = Math.max(0, this.hp - Math.round(dmg * 0.8));
    this.invuln = 1.0; this.blink = 1.0;
    const dir = new THREE.Vector3(this.pos.x - fromPos.x, 0, this.pos.z - fromPos.z).normalize();
    this.knock.copy(dir).multiplyScalar(5);
    effects.burst(this.center, { count: 12, colors: [0xff3040, 0xff8080], speed: 3, life: 0.4, size: 0.3, gravity: -5, drag: 2 });
    if (this.hp <= 0) { this.alive = false; this.downT = 12; this.attackT = 0; }
    return true;
  }

  update(dt, ctx) {
    const player = ctx.player;
    this.invuln = Math.max(0, this.invuln - dt);
    this.blink = Math.max(0, this.blink - dt);
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.pos.addScaledVector(this.knock, dt);
    this.knock.multiplyScalar(Math.max(0, 1 - 7 * dt));

    if (!this.alive) {
      // 쓰러짐 → 일정 시간 후 기상
      this.downT -= dt;
      const P = this.parts.body;
      P.rotation.x = damp(P.rotation.x, -Math.PI / 2 + 0.2, 6, dt);
      P.position.y = damp(P.position.y, 0.25, 6, dt);
      P.visible = true;
      if (this.downT <= 0) {
        this.alive = true; this.hp = Math.round(this.maxHp * 0.5); this.invuln = 2;
        ctx.effects.burst(this.center, { count: 30, colors: [this.ch.colors.glow, 0xffffff], speed: 3, life: 0.8, size: 0.4, gravity: 1, drag: 1, up: 2 });
        ctx.sfx && ctx.sfx('bell');
      }
      return;
    }
    this.parts.body.rotation.x = damp(this.parts.body.rotation.x, 0, 8, dt);
    this.parts.body.position.y = damp(this.parts.body.position.y, 0, 8, dt);

    // 표적: 플레이어 주변 9m 안의 가장 가까운 적
    let best = null, bestD = 9;
    for (const e of ctx.enemies) {
      if (!e.targetable) continue;
      const dp = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
      const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
      if (dp > 12) continue;
      if (d < bestD) { bestD = d; best = e; }
    }
    this.target = best;

    const move = new THREE.Vector3();
    this.moving = false;
    if (this.attackT > 0) {
      // 공격 중
      const prev = this.attackT;
      this.attackT -= dt;
      if (prev > 0.18 && this.attackT <= 0.18 && this.target && this.target.targetable) {
        const e = this.target;
        const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 2.6 + e.radius) {
          const dir = new THREE.Vector3(dx, 0, dz).normalize();
          const killed = e.takeHit(this.dmg, dir, 3, 0.25, ctx.effects);
          ctx.effects.sparks(new THREE.Vector3(e.pos.x, e.pos.y + e.height * 0.55, e.pos.z), dir, [this.ch.colors.glow, 0xffffff]);
          ctx.sfx && ctx.sfx(killed ? 'kill' : 'hit');
          if (killed) this.kills++;
        }
      }
      if (this.attackT <= 0) this.attackCd = rand(0.55, 1.0);
    } else if (this.target) {
      const e = this.target;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      const ang = Math.atan2(dx, dz);
      this.yaw = angleLerp(this.yaw, ang, 1 - Math.exp(-10 * dt));
      if (d > 2.0 + e.radius) { move.set(dx / d, 0, dz / d).multiplyScalar(this.speed * dt); this.moving = true; }
      else if (this.attackCd <= 0) {
        this.attackT = 0.38; this.attackSide = (this.attackSide || 1) * -1;
        ctx.effects.slashArc(this.pos, this.yaw, { rIn: 0.5, rOut: 2.4, angle: 2.2, tilt: 0.2 * this.attackSide, roll: 0.2, color: this.ch.colors.glow, life: 0.2, sweep: this.attackSide, y: 1.1 });
        ctx.sfx && ctx.sfx('swing');
      }
    } else {
      // 플레이어 따라가기 (대형 위치)
      const a = this.index === 0 ? 2.3 : -2.3;
      const behind = player.yaw + Math.PI;
      const tx = player.pos.x + Math.sin(behind + a * 0.35) * 2.4, tz = player.pos.z + Math.cos(behind + a * 0.35) * 2.4;
      const dx = tx - this.pos.x, dz = tz - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 1.2) {
        const sp = d > 6 ? this.speed * 1.4 : this.speed;
        move.set(dx / d, 0, dz / d).multiplyScalar(Math.min(sp * dt, d));
        this.yaw = angleLerp(this.yaw, Math.atan2(dx, dz), 1 - Math.exp(-8 * dt));
        this.moving = true;
      } else {
        this.yaw = angleLerp(this.yaw, player.yaw, 1 - Math.exp(-3 * dt));
      }
      // 너무 멀면 순간이동 (안개 속에서 나타남)
      if (d > 18) { this.pos.set(tx, 0, tz); ctx.effects.mist(this.center, [0x8fc0ff, 0xffffff], 12); }
    }
    this.pos.add(move);
    ctx.stage.resolveCollisions(this.pos, this.radius);
    // 플레이어와 겹치지 않게
    const pdx = this.pos.x - player.pos.x, pdz = this.pos.z - player.pos.z, pd = Math.hypot(pdx, pdz);
    if (pd < 0.9 && pd > 1e-3) { this.pos.x += (pdx / pd) * (0.9 - pd); this.pos.z += (pdz / pd) * (0.9 - pd); }
    this.pos.y = 0;
    this.group.rotation.y = this.yaw;
    this._animate(dt);
  }

  _animate(dt) {
    const P = this.parts;
    const blinkOn = this.blink > 0 && Math.floor(this.blink * 20) % 2 === 0;
    P.body.visible = !blinkOn;
    let tx = 0.15, ty = 0, lean = 0, bob = 0, lx = 0;
    if (this.attackT > 0) {
      const k = 1 - clamp(this.attackT / 0.38, 0, 1);
      tx = -1.1; ty = lerp(-1.4, 1.3, easeOutCubic(Math.min(1, k * 1.6))) * this.attackSide;
      lean = 0.12; lx = -0.5;
    } else if (this.moving) {
      this.walkPhase += dt * 11;
      lx = Math.sin(this.walkPhase) * 0.55; tx = -Math.sin(this.walkPhase) * 0.4 + 0.1;
      bob = Math.abs(Math.sin(this.walkPhase)) * 0.06; lean = 0.08;
    } else {
      const t = performance.now() * 0.0015 + this.index;
      tx = 0.15 + Math.sin(t) * 0.04; bob = Math.sin(t * 1.3) * 0.015;
    }
    P.rightArm.rotation.x = damp(P.rightArm.rotation.x, tx, 22, dt);
    P.rightArm.rotation.y = damp(P.rightArm.rotation.y, ty, 22, dt);
    P.leftArm.rotation.x = damp(P.leftArm.rotation.x, lx, 12, dt);
    P.body.rotation.x = damp(P.body.rotation.x, lean, 12, dt);
    P.body.position.y = bob;
    for (let i = 0; i < P.feet.length; i++) {
      const f = P.feet[i]; const left = i < 3; const base = i % 3 === 2 ? 0.1 : 0.06;
      f.position.z = this.moving ? base + (left ? 1 : -1) * Math.sin(this.walkPhase) * 0.2 : damp(f.position.z, base, 10, dt);
    }
    P.scarfTail.rotation.x = 0.35 + Math.sin(performance.now() * 0.004 + this.index) * 0.15 + (this.moving ? 0.5 : 0);
    animateFace(P, dt);
  }

  remove() { this.scene.remove(this.group); }
}
