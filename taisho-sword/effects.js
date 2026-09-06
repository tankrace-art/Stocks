// effects.js — 파티클(검기 물결/불꽃), 검격 궤적, 충격파, 카메라 흔들림
import * as THREE from 'three';
import { rand, pick, clamp } from './util.js';

const MAX_PARTICLES = 6000;

const VERT = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (320.0 / max(0.1, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAG = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.05, d) * vAlpha;
    gl_FragColor = vec4(vColor * (0.6 + 0.8 * (1.0 - d * 2.0)), a);
  }
`;

// 부채꼴 판 지오메트리 (XZ 평면, +Z 가 정면)
// 정점 색: 안쪽 가장자리와 양 끝은 어둡게(가산 혼합 시 투명) → 초승달 궤적
export function makeArcGeometry(rIn, rOut, angle, segments = 24, radialSteps = 4) {
  const pos = [];
  const col = [];
  const idx = [];
  const cols = radialSteps + 1;
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const a = -angle / 2 + angle * u;
    const s = Math.sin(a), c = Math.cos(a);
    const ang = 1 - Math.pow(Math.abs(u * 2 - 1), 2.2);
    for (let j = 0; j <= radialSteps; j++) {
      const v = j / radialSteps;
      const r = rIn + (rOut - rIn) * v;
      pos.push(s * r, 0, c * r);
      const b = Math.pow(v, 1.6) * ang * (v > 0.85 ? (1 - v) / 0.15 * 0.7 + 0.3 : 1);
      col.push(b, b, b);
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radialSteps; j++) {
      const a0 = i * cols + j, a1 = a0 + 1, b0 = (i + 1) * cols + j, b1 = b0 + 1;
      idx.push(a0, a1, b0, a1, b1, b0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.active = [];
    this.pool = [];
    this.meshes = []; // {mesh, life, maxLife, update}
    this.shake = 0;
    this.time = 0;

    const geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
    this.sizes = new Float32Array(MAX_PARTICLES);
    this.alphas = new Float32Array(MAX_PARTICLES);
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);

    this._c = new THREE.Color();
    this.arcGeoCache = new Map();
  }

  // ---------- 파티클 ----------
  emit({ pos, vel, life = 0.6, size = 0.25, color = 0xffffff, gravity = 0, drag = 0, shrink = true, fadeIn = 0 }) {
    if (this.active.length >= MAX_PARTICLES) return;
    const p = this.pool.pop() || { pos: new THREE.Vector3(), vel: new THREE.Vector3() };
    p.pos.copy(pos);
    p.vel.copy(vel);
    p.life = life; p.maxLife = life; p.size = size; p.size0 = size;
    p.gravity = gravity; p.drag = drag; p.shrink = shrink; p.fadeIn = fadeIn;
    this._c.set(color);
    p.r = this._c.r; p.g = this._c.g; p.b = this._c.b;
    this.active.push(p);
  }

  burst(pos, {
    count = 20, colors = [0xffffff], speed = 4, speedVar = 0.5, life = 0.6, lifeVar = 0.4,
    size = 0.25, sizeVar = 0.5, gravity = -4, drag = 1.5, dir = null, spread = 1, up = 0.5,
  } = {}) {
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      if (dir) {
        v.set(rand(-1, 1) * spread, rand(-1, 1) * spread, rand(-1, 1) * spread).add(dir).normalize();
      } else {
        v.set(rand(-1, 1), rand(-1, 1) * up + up * 0.5, rand(-1, 1)).normalize();
      }
      v.multiplyScalar(speed * (1 + rand(-speedVar, speedVar)));
      this.emit({
        pos, vel: v, life: life * (1 + rand(-lifeVar, lifeVar)), size: size * (1 + rand(-sizeVar, sizeVar)),
        color: pick(colors), gravity, drag,
      });
    }
  }

  // 타격 스파크 (흰/주황)
  sparks(pos, dir, colors = [0xfff4d6, 0xffc060, 0xff8040]) {
    this.burst(pos, { count: 18, colors, speed: 7, life: 0.35, size: 0.18, gravity: -8, drag: 3, dir, spread: 1.4 });
    this.burst(pos, { count: 6, colors: [0xffffff], speed: 1, life: 0.15, size: 0.9, gravity: 0, drag: 0 });
  }

  // 요괴 등장/소멸용 검은 안개
  mist(pos, colors = [0x2a1040, 0x120820, 0x4a2060], count = 20) {
    this.burst(pos, { count, colors, speed: 1.5, life: 1.2, size: 0.9, sizeVar: 0.4, gravity: 0.8, drag: 1, up: 1.5 });
  }

  // 새벽 소멸 — 재가 되어 흩날림
  ashes(pos, count = 30) {
    this.burst(pos, { count, colors: [0xffd9a0, 0xffb070, 0xffffff, 0x9a70ff], speed: 1.2, life: 1.8, size: 0.35, gravity: 1.2, drag: 0.5, up: 2 });
  }

  // ---------- 메쉬 이펙트 ----------
  _arcGeo(rIn, rOut, angle) {
    const key = `${rIn.toFixed(2)}_${rOut.toFixed(2)}_${angle.toFixed(2)}`;
    if (!this.arcGeoCache.has(key)) this.arcGeoCache.set(key, makeArcGeometry(rIn, rOut, angle, 28));
    return this.arcGeoCache.get(key);
  }

  // 검격 궤적: 부채꼴 판이 회전하며 사라짐
  slashArc(pos, yaw, {
    rIn = 0.5, rOut = 2.2, angle = Math.PI * 0.9, tilt = 0, roll = 0, color = 0xcfe8ff,
    life = 0.22, sweep = 1, y = 1.1, opacity = 0.6,
  } = {}) {
    const geo = this._arcGeo(Math.max(rIn, rOut * 0.42), rOut, angle);
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos); mesh.position.y += y;
    mesh.rotation.order = 'YXZ';
    mesh.rotation.y = yaw;
    mesh.rotation.x = tilt;
    mesh.rotation.z = roll;
    this.scene.add(mesh);
    const startYaw = yaw - sweep * angle * 0.35;
    this.meshes.push({
      mesh, life, maxLife: life,
      update: (t) => {
        // t: 0→1
        mesh.rotation.y = startYaw + sweep * angle * 0.7 * Math.min(1, t * 2.2);
        const s = 0.85 + t * 0.35;
        mesh.scale.set(s, 1, s);
        mat.opacity = opacity * (1 - t) * (1 - t);
      },
    });
    return mesh;
  }

  // 충격파 링
  shockwave(pos, { color = 0xffffff, radius = 4, life = 0.5, y = 0.08, width = 0.25, opacity = 0.9 } = {}) {
    const geo = new THREE.RingGeometry(1 - width, 1, 48);
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(pos); mesh.position.y = y;
    this.scene.add(mesh);
    this.meshes.push({
      mesh, life, maxLife: life,
      update: (t) => {
        const r = 0.2 + radius * (1 - Math.pow(1 - t, 3));
        mesh.scale.set(r, r, r);
        mat.opacity = opacity * (1 - t);
      },
    });
    return mesh;
  }

  // 임의 메쉬를 수명 동안 관리
  track(mesh, life, update, onEnd) {
    this.scene.add(mesh);
    this.meshes.push({ mesh, life, maxLife: life, update, onEnd });
  }

  addShake(v) { this.shake = Math.min(1.2, this.shake + v); }

  // ---------- 업데이트 ----------
  update(dt) {
    this.time += dt;
    // particles
    const act = this.active;
    let n = 0;
    for (let i = act.length - 1; i >= 0; i--) {
      const p = act[i];
      p.life -= dt;
      if (p.life <= 0) {
        act[i] = act[act.length - 1];
        act.pop();
        this.pool.push(p);
        continue;
      }
      p.vel.y += p.gravity * dt;
      if (p.drag) {
        const k = Math.max(0, 1 - p.drag * dt);
        p.vel.multiplyScalar(k);
      }
      p.pos.addScaledVector(p.vel, dt);
    }
    for (let i = 0; i < act.length; i++) {
      const p = act[i];
      const t = p.life / p.maxLife; // 1→0
      const age = p.maxLife - p.life;
      let a = t < 0.5 ? t * 2 : 1;
      if (p.fadeIn > 0 && age < p.fadeIn) a *= age / p.fadeIn;
      this.positions[n * 3] = p.pos.x; this.positions[n * 3 + 1] = p.pos.y; this.positions[n * 3 + 2] = p.pos.z;
      this.colors[n * 3] = p.r; this.colors[n * 3 + 1] = p.g; this.colors[n * 3 + 2] = p.b;
      this.sizes[n] = p.shrink ? p.size0 * (0.3 + 0.7 * t) : p.size0;
      this.alphas[n] = clamp(a, 0, 1);
      n++;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aColor.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
    g.setDrawRange(0, n);

    // meshes
    for (let i = this.meshes.length - 1; i >= 0; i--) {
      const m = this.meshes[i];
      m.life -= dt;
      if (m.life <= 0) {
        this.scene.remove(m.mesh);
        if (m.mesh.material && m.mesh.material.dispose && !m.keepMaterial) m.mesh.material.dispose();
        if (m.onEnd) m.onEnd();
        this.meshes.splice(i, 1);
        continue;
      }
      m.update && m.update(1 - m.life / m.maxLife, dt);
    }

    this.shake = Math.max(0, this.shake - dt * 3);
  }
}
