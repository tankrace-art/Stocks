// stage.js — 안개 낀 대나무 숲 (저폴리곤), 조명, 밤→새벽 진행
import * as THREE from 'three';
import { rand, clamp, lerp, smoothstep } from './util.js';

export const ARENA_RADIUS = 24;      // 전투 가능 반경
export const NIGHT_LENGTH = 300;     // 밤의 길이(초). 이 시간이 지나면 새벽.
const DAWN_DURATION = 9;             // 새벽 전환 시간(초)

const NIGHT = {
  sky: new THREE.Color(0x070a18),
  fog: new THREE.Color(0x0c1226),
  moon: new THREE.Color(0x9fb4ff),
  moonIntensity: 1.6,
  hemiSky: new THREE.Color(0x24305a),
  hemiGround: new THREE.Color(0x0a1208),
  hemiIntensity: 0.55,
  fogDensity: 0.042,
};
const DAWN = {
  sky: new THREE.Color(0xf1b48c),
  fog: new THREE.Color(0xe7b9a3),
  moon: new THREE.Color(0xffd9a6),
  moonIntensity: 2.6,
  hemiSky: new THREE.Color(0xffd2b0),
  hemiGround: new THREE.Color(0x4a5030),
  hemiIntensity: 1.1,
  fogDensity: 0.028,
};

function flatMat(color, extra = {}) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
}

// 소프트 원형 그라데이션 텍스처 (지면 안개용)
function makeRadialTexture(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 원형 점 텍스처 (별/반딧불용)
function makeDotTexture(size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Stage {
  constructor(scene) {
    this.scene = scene;
    this.time = 0;            // 경과 시간
    this.nightTime = 0;       // 밤 진행 시간
    this.dawnT = 0;           // 0(밤) → 1(새벽 완료)
    this.dawnTriggered = false;
    this.obstacles = [];      // {x, z, r} 아레나 내부 대나무 (충돌)
    this.lanterns = [];

    scene.background = NIGHT.sky.clone();
    scene.fog = new THREE.FogExp2(NIGHT.fog.clone(), NIGHT.fogDensity);

    this._buildLights();
    this._buildGround();
    this._buildBamboo();
    this._buildProps();
    this._buildSky();
    this._buildMist();
    this._buildFireflies();
  }

  // ---------- 조명 ----------
  _buildLights() {
    this.hemi = new THREE.HemisphereLight(NIGHT.hemiSky, NIGHT.hemiGround, NIGHT.hemiIntensity);
    this.scene.add(this.hemi);

    this.moonLight = new THREE.DirectionalLight(NIGHT.moon, NIGHT.moonIntensity);
    this.moonLight.position.set(-18, 30, -12);
    this.moonLight.castShadow = true;
    const s = this.moonLight.shadow;
    s.mapSize.set(2048, 2048);
    s.camera.near = 1; s.camera.far = 90;
    s.camera.left = -34; s.camera.right = 34; s.camera.top = 34; s.camera.bottom = -34;
    s.bias = -0.0008;
    s.normalBias = 0.02;
    this.scene.add(this.moonLight);
    this.scene.add(this.moonLight.target);
  }

  // ---------- 지면 ----------
  _buildGround() {
    const geo = new THREE.CircleGeometry(70, 64);
    // 저폴리 요철
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      const d = Math.hypot(x, y);
      const h = d < ARENA_RADIUS - 2 ? 0 : (Math.sin(x * 0.45) * Math.cos(y * 0.37) * 0.35 + rand(-0.12, 0.12)) * smoothstep(ARENA_RADIUS - 2, ARENA_RADIUS + 6, d);
      pos.setZ(i, h);
    }
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, flatMat(0x1d2a1b));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.groundMat = ground.material;

    // 아레나 중앙: 오래된 석판 광장
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(7.5, 10), flatMat(0x3a3f46));
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.y = 0.02;
    plaza.receiveShadow = true;
    this.scene.add(plaza);
    const plaza2 = new THREE.Mesh(new THREE.RingGeometry(7.5, 9, 10), flatMat(0x2e3238));
    plaza2.rotation.x = -Math.PI / 2;
    plaza2.position.y = 0.015;
    plaza2.receiveShadow = true;
    this.scene.add(plaza2);

    // 돌길 (남쪽으로)
    const slabGeo = new THREE.BoxGeometry(1.6, 0.12, 1.1);
    const slabMat = flatMat(0x474b52);
    for (let i = 0; i < 12; i++) {
      const slab = new THREE.Mesh(slabGeo, slabMat);
      slab.position.set(rand(-0.4, 0.4), 0.05, 8.5 + i * 1.45);
      slab.rotation.y = rand(-0.2, 0.2);
      slab.receiveShadow = true;
      slab.castShadow = true;
      this.scene.add(slab);
    }
  }

  // ---------- 대나무 숲 (인스턴싱) ----------
  _buildBamboo() {
    const COUNT = 900;
    const stalkGeo = new THREE.CylinderGeometry(0.16, 0.22, 1, 6, 1);
    stalkGeo.translate(0, 0.5, 0);
    const stalkMat = new THREE.MeshLambertMaterial({ color: 0x5a8a3a, flatShading: true });
    const stalks = new THREE.InstancedMesh(stalkGeo, stalkMat, COUNT);
    stalks.castShadow = true;
    stalks.receiveShadow = true;

    // 잎 뭉치 (사면체 여러 개)
    const leafGeo = new THREE.TetrahedronGeometry(1.1, 0);
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x3e7a35, flatShading: true });
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, COUNT * 2);
    leaves.castShadow = true;

    // 마디 (링)
    const nodeGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.08, 6);
    const nodeMat = new THREE.MeshLambertMaterial({ color: 0x8fbf5a, flatShading: true });
    const nodes = new THREE.InstancedMesh(nodeGeo, nodeMat, COUNT * 3);

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const color = new THREE.Color();
    let li = 0, ni = 0;

    for (let i = 0; i < COUNT; i++) {
      // 분포: 아레나 밖은 조밀, 안쪽은 드문드문
      let r, a;
      if (i < 60) {
        r = rand(9.5, ARENA_RADIUS - 1.5);
      } else {
        r = ARENA_RADIUS + Math.pow(rand(0, 1), 0.7) * 34;
      }
      a = rand(0, Math.PI * 2);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      // 남쪽 돌길은 비워둠
      if (z > 7 && Math.abs(x) < 2.2) { i--; continue; }
      const h = rand(7, 14);
      const tiltX = rand(-0.06, 0.06), tiltZ = rand(-0.06, 0.06);
      const thick = rand(0.75, 1.25);
      e.set(tiltX, rand(0, Math.PI * 2), tiltZ);
      q.setFromEuler(e);
      p.set(x, -0.1, z);
      sc.set(thick, h, thick);
      m.compose(p, q, sc);
      stalks.setMatrixAt(i, m);
      color.setHSL(0.24 + rand(-0.03, 0.03), 0.45, 0.32 + rand(-0.08, 0.08));
      stalks.setColorAt(i, color);

      if (r < ARENA_RADIUS) this.obstacles.push({ x, z, r: 0.28 * thick });

      // 잎
      for (let k = 0; k < 2; k++) {
        const ly = h * rand(0.72, 0.98);
        p.set(x + tiltZ * ly + rand(-0.5, 0.5), ly, z - tiltX * ly + rand(-0.5, 0.5));
        e.set(rand(0, 6), rand(0, 6), rand(0, 6));
        q.setFromEuler(e);
        const ls = rand(0.9, 1.6);
        sc.set(ls * 1.4, ls * 0.5, ls * 1.4);
        m.compose(p, q, sc);
        leaves.setMatrixAt(li, m);
        color.setHSL(0.27 + rand(-0.04, 0.04), 0.5, 0.28 + rand(-0.06, 0.08));
        leaves.setColorAt(li, color);
        li++;
      }
      // 마디
      for (let k = 0; k < 3; k++) {
        const ny = h * (0.18 + k * 0.22);
        p.set(x + tiltZ * ny, ny, z - tiltX * ny);
        q.setFromEuler(e.set(tiltX, 0, tiltZ));
        sc.set(thick, 1, thick);
        m.compose(p, q, sc);
        nodes.setMatrixAt(ni++, m);
      }
    }
    leaves.count = li;
    nodes.count = ni;
    stalks.instanceMatrix.needsUpdate = true;
    leaves.instanceMatrix.needsUpdate = true;
    nodes.instanceMatrix.needsUpdate = true;
    if (stalks.instanceColor) stalks.instanceColor.needsUpdate = true;
    if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
    this.scene.add(stalks, leaves, nodes);
    this.bamboo = { stalks, leaves };

    // 지면 풀/조릿대
    const grassGeo = new THREE.ConeGeometry(0.25, 0.8, 4);
    grassGeo.translate(0, 0.4, 0);
    const grassMat = new THREE.MeshLambertMaterial({ color: 0x2c5a2a, flatShading: true });
    const grass = new THREE.InstancedMesh(grassGeo, grassMat, 500);
    for (let i = 0; i < 500; i++) {
      const r = rand(9, 40), a = rand(0, Math.PI * 2);
      p.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      q.setFromEuler(e.set(rand(-0.3, 0.3), rand(0, 6), rand(-0.3, 0.3)));
      const s = rand(0.7, 1.8);
      sc.set(s, s, s);
      m.compose(p, q, sc);
      grass.setMatrixAt(i, m);
    }
    grass.instanceMatrix.needsUpdate = true;
    this.scene.add(grass);
  }

  // ---------- 소품: 석등, 도리이, 제등 ----------
  _buildProps() {
    const stoneMat = flatMat(0x6a6f75);
    const stoneDark = flatMat(0x4c5056);
    const woodMat = flatMat(0x8a2a22);
    const paperMat = new THREE.MeshLambertMaterial({ color: 0xffd9a0, emissive: 0xff9a40, emissiveIntensity: 0.9 });
    this.flameMats = [];

    // 석등롱 6기 — 아레나 둘레
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const r = 11.5;
      const g = new THREE.Group();
      g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      g.rotation.y = -a;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.35, 6), stoneDark); base.position.y = 0.17;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.5, 6), stoneMat); post.position.y = 1.1;
      const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.25, 0.25, 6), stoneMat); dish.position.y = 1.95;
      const house = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.55, 0.62), stoneDark); house.position.y = 2.35;
      const window1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.66), paperMat); window1.position.y = 2.35;
      const window2 = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.3, 0.3), paperMat); window2.position.y = 2.35;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.5, 6), stoneMat); roof.position.y = 2.85;
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), stoneMat); tip.position.y = 3.15;
      g.add(base, post, dish, house, window1, window2, roof, tip);
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      const light = new THREE.PointLight(0xff9a3c, 14, 12, 2);
      light.position.y = 2.35;
      g.add(light);
      this.lanterns.push({ group: g, light, base: light.intensity, phase: rand(0, 10) });
      this.scene.add(g);
      this.obstacles.push({ x: g.position.x, z: g.position.z, r: 0.7 });
    }

    // 도리이 — 북쪽
    const torii = new THREE.Group();
    torii.position.set(0, 0, -15);
    const pillarGeo = new THREE.CylinderGeometry(0.28, 0.34, 5.2, 8);
    for (const sx of [-2.2, 2.2]) {
      const pl = new THREE.Mesh(pillarGeo, woodMat); pl.position.set(sx, 2.6, 0); torii.add(pl);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.4, 8), stoneDark); foot.position.set(sx, 0.2, 0); torii.add(foot);
    }
    const kasagi = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.42, 0.5), flatMat(0x1a1416)); kasagi.position.y = 5.3; torii.add(kasagi);
    const shimaki = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.3, 0.42), woodMat); shimaki.position.y = 4.95; torii.add(shimaki);
    const nuki = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.28, 0.3), woodMat); nuki.position.y = 4.1; torii.add(nuki);
    const gakuzuka = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.2), woodMat); gakuzuka.position.y = 4.5; torii.add(gakuzuka);
    torii.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.scene.add(torii);
    this.obstacles.push({ x: -2.2, z: -15, r: 0.5 }, { x: 2.2, z: -15, r: 0.5 });

    // 제등(提灯) 기둥 — 돌길 양옆, 다이쇼 시대 분위기
    for (const sx of [-2.6, 2.6]) {
      for (const zz of [10, 16]) {
        const g = new THREE.Group();
        g.position.set(sx, 0, zz);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.6, 6), flatMat(0x3b2a20)); pole.position.y = 1.3;
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.07, 0.07), flatMat(0x3b2a20)); arm.position.set(-sx * 0.15, 2.55, 0);
        const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.55, 8), new THREE.MeshLambertMaterial({ color: 0xffb070, emissive: 0xff6a20, emissiveIntensity: 0.9 }));
        lantern.position.set(-sx * 0.3, 2.15, 0);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.06, 8), flatMat(0x1a1416)); cap.position.set(-sx * 0.3, 2.47, 0);
        g.add(pole, arm, lantern, cap);
        g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        const light = new THREE.PointLight(0xff8a40, 8, 9, 2);
        light.position.copy(lantern.position);
        g.add(light);
        this.lanterns.push({ group: g, light, base: light.intensity, phase: rand(0, 10) });
        this.scene.add(g);
        this.obstacles.push({ x: sx, z: zz, r: 0.2 });
      }
    }

    // 바위 몇 개
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    for (let i = 0; i < 10; i++) {
      const r = rand(13, 21), a = rand(0, Math.PI * 2);
      const rock = new THREE.Mesh(rockGeo, flatMat(0x50565c));
      rock.position.set(Math.cos(a) * r, 0.1, Math.sin(a) * r);
      rock.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
      const s = rand(0.5, 1.3);
      rock.scale.set(s * 1.3, s * 0.7, s);
      rock.castShadow = true; rock.receiveShadow = true;
      this.scene.add(rock);
      this.obstacles.push({ x: rock.position.x, z: rock.position.z, r: s * 0.9 });
    }
  }

  // ---------- 하늘: 달, 별 ----------
  _buildSky() {
    this.moonMat = new THREE.MeshBasicMaterial({ color: 0xfff3d0, fog: false });
    const moon = new THREE.Mesh(new THREE.SphereGeometry(4.5, 16, 12), this.moonMat);
    moon.position.set(-60, 55, -80);
    this.scene.add(moon);
    this.moon = moon;
    const haloMat = new THREE.MeshBasicMaterial({ color: 0x8fa8ff, transparent: true, opacity: 0.18, fog: false, side: THREE.DoubleSide, depthWrite: false });
    const halo = new THREE.Mesh(new THREE.CircleGeometry(9, 24), haloMat);
    halo.position.copy(moon.position);
    halo.lookAt(0, 0, 0);
    this.scene.add(halo);
    this.haloMat = haloMat;

    const N = 700;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const th = rand(0, Math.PI * 2), ph = rand(0.05, Math.PI * 0.48);
      const r = 160;
      pos[i * 3] = Math.cos(th) * Math.cos(ph) * r;
      pos[i * 3 + 1] = Math.sin(ph) * r;
      pos[i * 3 + 2] = Math.sin(th) * Math.cos(ph) * r;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xdde6ff, size: 1.6, sizeAttenuation: true, fog: false, transparent: true, opacity: 0.9, map: makeDotTexture(), depthWrite: false, blending: THREE.AdditiveBlending });
    this.stars = new THREE.Points(g, this.starMat);
    this.scene.add(this.stars);
  }

  // ---------- 지면 안개 ----------
  _buildMist() {
    const tex = makeRadialTexture();
    this.mistMat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity: 0.32, depthWrite: false, color: 0xaebbd8, blending: THREE.NormalBlending,
    });
    this.mistPlanes = [];
    const geo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < 26; i++) {
      const mesh = new THREE.Mesh(geo, this.mistMat);
      const r = rand(2, 34), a = rand(0, Math.PI * 2);
      mesh.position.set(Math.cos(a) * r, rand(0.2, 0.9), Math.sin(a) * r);
      mesh.rotation.x = -Math.PI / 2;
      const s = rand(9, 20);
      mesh.scale.set(s, s, 1);
      mesh.userData = { vx: rand(-0.25, 0.25), vz: rand(-0.25, 0.25), phase: rand(0, 6), s };
      this.scene.add(mesh);
      this.mistPlanes.push(mesh);
    }
  }

  // ---------- 반딧불 ----------
  _buildFireflies() {
    const N = 120;
    this.fireflyData = [];
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = rand(4, 30), a = rand(0, Math.PI * 2);
      const d = { x: Math.cos(a) * r, y: rand(0.5, 3.5), z: Math.sin(a) * r, phase: rand(0, 6), speed: rand(0.3, 0.8) };
      this.fireflyData.push(d);
      pos[i * 3] = d.x; pos[i * 3 + 1] = d.y; pos[i * 3 + 2] = d.z;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.fireflyMat = new THREE.PointsMaterial({ color: 0xc8ff70, size: 0.22, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, map: makeDotTexture() });
    this.fireflies = new THREE.Points(g, this.fireflyMat);
    this.scene.add(this.fireflies);
  }

  // ---------- 상태 ----------
  get nightProgress() { return clamp(this.nightTime / NIGHT_LENGTH, 0, 1); }
  get isDawn() { return this.dawnTriggered; }
  get dawnComplete() { return this.dawnTriggered && this.dawnT >= 1; }

  triggerDawn() {
    if (this.dawnTriggered) return;
    this.dawnTriggered = true;
    this.nightTime = NIGHT_LENGTH;
  }

  // 아레나/장애물 충돌 처리. pos(Vector3)를 직접 보정
  resolveCollisions(pos, radius) {
    const d = Math.hypot(pos.x, pos.z);
    if (d > ARENA_RADIUS - radius) {
      const k = (ARENA_RADIUS - radius) / d;
      pos.x *= k; pos.z *= k;
    }
    for (const o of this.obstacles) {
      const dx = pos.x - o.x, dz = pos.z - o.z;
      const dist = Math.hypot(dx, dz);
      const min = o.r + radius;
      if (dist < min && dist > 1e-4) {
        const k = min / dist;
        pos.x = o.x + dx * k; pos.z = o.z + dz * k;
      }
    }
  }

  update(dt, running = true, focus = null) {
    this.time += dt;
    if (running && !this.dawnTriggered) {
      this.nightTime += dt;
      if (this.nightTime >= NIGHT_LENGTH) this.triggerDawn();
    }
    if (this.dawnTriggered) this.dawnT = clamp(this.dawnT + dt / DAWN_DURATION, 0, 1);
    const t = smoothstep(0, 1, this.dawnT);

    // 색/조명 보간
    this.scene.background.copy(NIGHT.sky).lerp(DAWN.sky, t);
    this.scene.fog.color.copy(NIGHT.fog).lerp(DAWN.fog, t);
    this.scene.fog.density = lerp(NIGHT.fogDensity, DAWN.fogDensity, t);
    this.moonLight.color.copy(NIGHT.moon).lerp(DAWN.moon, t);
    this.moonLight.intensity = lerp(NIGHT.moonIntensity, DAWN.moonIntensity, t);
    // 광원이 달 → 동쪽 태양으로 이동. 그림자 카메라는 플레이어를 따라감
    const fx = focus ? focus.x : 0, fz = focus ? focus.z : 0;
    this.moonLight.position.set(fx + lerp(-18, 30, t), lerp(30, 14, t), fz + lerp(-12, 8, t));
    this.moonLight.target.position.set(fx, 0, fz);
    this.hemi.color.copy(NIGHT.hemiSky).lerp(DAWN.hemiSky, t);
    this.hemi.groundColor.copy(NIGHT.hemiGround).lerp(DAWN.hemiGround, t);
    this.hemi.intensity = lerp(NIGHT.hemiIntensity, DAWN.hemiIntensity, t);
    this.starMat.opacity = 0.9 * (1 - t);
    this.haloMat.opacity = 0.18 * (1 - t);
    this.moonMat.color.setRGB(1, lerp(0.95, 0.85, t), lerp(0.82, 0.6, t));
    this.moon.position.y = lerp(55, 20, t);
    this.mistMat.opacity = lerp(0.32, 0.22, t);
    this.mistMat.color.setHex(0xaebbd8).lerp(new THREE.Color(0xffd6bd), t);
    this.fireflyMat.opacity = 0.9 * (1 - t);

    // 석등 흔들림
    for (const l of this.lanterns) {
      const f = 0.85 + 0.15 * Math.sin(this.time * 9 + l.phase) * Math.sin(this.time * 3.3 + l.phase * 2);
      l.light.intensity = l.base * f * (1 - t * 0.6);
    }

    // 안개 드리프트
    for (const m of this.mistPlanes) {
      const u = m.userData;
      m.position.x += u.vx * dt;
      m.position.z += u.vz * dt;
      const d = Math.hypot(m.position.x, m.position.z);
      if (d > 38) { m.position.x *= -0.9; m.position.z *= -0.9; }
      const s = u.s * (1 + 0.08 * Math.sin(this.time * 0.4 + u.phase));
      m.scale.set(s, s, 1);
    }

    // 반딧불
    const fp = this.fireflies.geometry.attributes.position;
    for (let i = 0; i < this.fireflyData.length; i++) {
      const d = this.fireflyData[i];
      const tt = this.time * d.speed + d.phase;
      fp.setXYZ(i, d.x + Math.sin(tt) * 1.2, d.y + Math.sin(tt * 1.7) * 0.4, d.z + Math.cos(tt * 0.8) * 1.2);
    }
    fp.needsUpdate = true;
    this.fireflyMat.size = 0.18 + 0.08 * Math.sin(this.time * 5);
  }
}
