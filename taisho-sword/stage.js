// stage.js — 무대: 테마(대나무 숲/폐사/귀왕의 성)별 저폴리곤 숲, 조명, 밤→새벽 진행
import * as THREE from 'three';
import { rand, clamp, lerp, smoothstep } from './util.js';
import { THEMES } from './scenario.js';

export const ARENA_RADIUS = 24;      // 전투 가능 반경
export const NIGHT_LENGTH = 300;     // 밤의 길이(초)
const DAWN_DURATION = 9;

const DAWN = {
  moon: new THREE.Color(0xffd9a6), moonIntensity: 2.6,
  hemiSky: new THREE.Color(0xffd2b0), hemiGround: new THREE.Color(0x4a5030), hemiIntensity: 1.1,
  fogDensity: 0.028,
};

function flatMat(color, extra = {}) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
}
function makeRadialTexture(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}
function makeDotTexture(size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}

export class Stage {
  constructor(scene, { mobile = false, theme = 'bamboo' } = {}) {
    this.scene = scene;
    this.mobile = mobile;
    this.T = THEMES[theme] || THEMES.bamboo;
    this.time = 0; this.nightTime = 0; this.dawnT = 0; this.dawnTriggered = false;
    this.obstacles = [];
    this.lanterns = [];
    const T = this.T;
    this.night = {
      sky: new THREE.Color(T.sky), fog: new THREE.Color(T.fog), moon: new THREE.Color(T.moon),
      hemiSky: new THREE.Color(T.hemiSky), hemiGround: new THREE.Color(T.hemiGround),
    };
    this.dawn = { sky: new THREE.Color(T.dawnSky), fog: new THREE.Color(T.dawnFog) };
    scene.background = this.night.sky.clone();
    scene.fog = new THREE.FogExp2(this.night.fog.clone(), T.fogDensity);
    this._buildLights();
    this._buildGround();
    this._buildTrees();
    this._buildProps();
    this._buildSky();
    this._buildMist();
    this._buildParticles();
  }

  _buildLights() {
    const T = this.T;
    this.hemi = new THREE.HemisphereLight(this.night.hemiSky, this.night.hemiGround, T.hemiIntensity);
    this.scene.add(this.hemi);
    this.moonLight = new THREE.DirectionalLight(this.night.moon, T.moonIntensity);
    this.moonLight.position.set(-18, 30, -12);
    this.moonLight.castShadow = true;
    const s = this.moonLight.shadow;
    const ms = this.mobile ? 1024 : 2048;
    s.mapSize.set(ms, ms);
    s.camera.near = 1; s.camera.far = 90;
    s.camera.left = -34; s.camera.right = 34; s.camera.top = 34; s.camera.bottom = -34;
    s.bias = -0.0008; s.normalBias = 0.02;
    this.scene.add(this.moonLight); this.scene.add(this.moonLight.target);
  }

  _buildGround() {
    const T = this.T;
    const geo = new THREE.CircleGeometry(70, 64);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      const d = Math.hypot(x, y);
      const h = d < ARENA_RADIUS - 2 ? 0 : (Math.sin(x * 0.45) * Math.cos(y * 0.37) * 0.35 + rand(-0.12, 0.12)) * smoothstep(ARENA_RADIUS - 2, ARENA_RADIUS + 6, d);
      pos.setZ(i, h);
    }
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, flatMat(T.ground));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
    this.scene.add(ground);
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(7.5, 10), flatMat(T.plaza));
    plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.02; plaza.receiveShadow = true;
    this.scene.add(plaza);
    const plaza2 = new THREE.Mesh(new THREE.RingGeometry(7.5, 9, 10), flatMat(T.plazaRing));
    plaza2.rotation.x = -Math.PI / 2; plaza2.position.y = 0.015; plaza2.receiveShadow = true;
    this.scene.add(plaza2);
    const slabGeo = new THREE.BoxGeometry(1.6, 0.12, 1.1);
    const slabMat = flatMat(T.plaza);
    for (let i = 0; i < 12; i++) {
      const slab = new THREE.Mesh(slabGeo, slabMat);
      slab.position.set(rand(-0.4, 0.4), 0.05, 8.5 + i * 1.45);
      slab.rotation.y = rand(-0.2, 0.2);
      slab.receiveShadow = true; slab.castShadow = true;
      this.scene.add(slab);
    }
  }

  _buildTrees() {
    const T = this.T;
    const COUNT = this.mobile ? 600 : 900;
    const stalkGeo = new THREE.CylinderGeometry(0.16, 0.22, 1, 6, 1);
    stalkGeo.translate(0, 0.5, 0);
    const stalks = new THREE.InstancedMesh(stalkGeo, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), COUNT);
    stalks.castShadow = true; stalks.receiveShadow = true;
    const leaves = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(1.1, 0), new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), COUNT * 2);
    leaves.castShadow = true;
    const nodes = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 6), new THREE.MeshLambertMaterial({ color: T.node, flatShading: true }), COUNT * 3);

    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3(), color = new THREE.Color();
    let li = 0, ni = 0;
    for (let i = 0; i < COUNT; i++) {
      let r;
      if (i < 60) r = rand(9.5, ARENA_RADIUS - 1.5); else r = ARENA_RADIUS + Math.pow(rand(0, 1), 0.7) * 34;
      const a = rand(0, Math.PI * 2);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (z > 7 && Math.abs(x) < 2.2) { i--; continue; }
      const h = rand(7, 14);
      const tiltX = rand(-0.06, 0.06), tiltZ = rand(-0.06, 0.06);
      const thick = rand(0.75, 1.25);
      e.set(tiltX, rand(0, Math.PI * 2), tiltZ); q.setFromEuler(e);
      p.set(x, -0.1, z); sc.set(thick, h, thick);
      m.compose(p, q, sc); stalks.setMatrixAt(i, m);
      color.setHSL(T.trunk.h + rand(-0.03, 0.03), T.trunk.s, T.trunk.l + rand(-0.06, 0.06));
      stalks.setColorAt(i, color);
      if (r < ARENA_RADIUS) this.obstacles.push({ x, z, r: 0.28 * thick });
      for (let k = 0; k < 2; k++) {
        const ly = h * rand(0.72, 0.98);
        p.set(x + tiltZ * ly + rand(-0.5, 0.5), ly, z - tiltX * ly + rand(-0.5, 0.5));
        e.set(rand(0, 6), rand(0, 6), rand(0, 6)); q.setFromEuler(e);
        const ls = rand(0.9, 1.6); sc.set(ls * 1.4, ls * 0.5, ls * 1.4);
        m.compose(p, q, sc); leaves.setMatrixAt(li, m);
        color.setHSL(T.leaf.h + rand(-0.03, 0.03), T.leaf.s, T.leaf.l + rand(-0.06, 0.08));
        leaves.setColorAt(li, color); li++;
      }
      for (let k = 0; k < 3; k++) {
        const ny = h * (0.18 + k * 0.22);
        p.set(x + tiltZ * ny, ny, z - tiltX * ny);
        q.setFromEuler(e.set(tiltX, 0, tiltZ)); sc.set(thick, 1, thick);
        m.compose(p, q, sc); nodes.setMatrixAt(ni++, m);
      }
    }
    leaves.count = li; nodes.count = ni;
    stalks.instanceMatrix.needsUpdate = true; leaves.instanceMatrix.needsUpdate = true; nodes.instanceMatrix.needsUpdate = true;
    if (stalks.instanceColor) stalks.instanceColor.needsUpdate = true;
    if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
    this.scene.add(stalks, leaves, nodes);

    const grassGeo = new THREE.ConeGeometry(0.25, 0.8, 4); grassGeo.translate(0, 0.4, 0);
    const grass = new THREE.InstancedMesh(grassGeo, new THREE.MeshLambertMaterial({ color: T.grass, flatShading: true }), 500);
    for (let i = 0; i < 500; i++) {
      const r = rand(9, 40), a = rand(0, Math.PI * 2);
      p.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      q.setFromEuler(e.set(rand(-0.3, 0.3), rand(0, 6), rand(-0.3, 0.3)));
      const s = rand(0.7, 1.8); sc.set(s, s, s);
      m.compose(p, q, sc); grass.setMatrixAt(i, m);
    }
    grass.instanceMatrix.needsUpdate = true;
    this.scene.add(grass);
  }

  _buildProps() {
    const T = this.T;
    const stoneMat = flatMat(0x6a6f75), stoneDark = flatMat(0x4c5056), woodMat = flatMat(0x8a2a22);
    const paperMat = new THREE.MeshLambertMaterial({ color: T.lanternPaper, emissive: T.lanternEmissive, emissiveIntensity: 0.9 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6, r = 11.5;
      const g = new THREE.Group();
      g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); g.rotation.y = -a;
      const parts = [
        [new THREE.CylinderGeometry(0.55, 0.7, 0.35, 6), stoneDark, 0.17], [new THREE.CylinderGeometry(0.16, 0.2, 1.5, 6), stoneMat, 1.1],
        [new THREE.CylinderGeometry(0.5, 0.25, 0.25, 6), stoneMat, 1.95], [new THREE.BoxGeometry(0.62, 0.55, 0.62), stoneDark, 2.35],
        [new THREE.BoxGeometry(0.3, 0.3, 0.66), paperMat, 2.35], [new THREE.BoxGeometry(0.66, 0.3, 0.3), paperMat, 2.35],
        [new THREE.ConeGeometry(0.75, 0.5, 6), stoneMat, 2.85], [new THREE.SphereGeometry(0.12, 6, 4), stoneMat, 3.15],
      ];
      for (const [geo, mat, y] of parts) { const mm = new THREE.Mesh(geo, mat); mm.position.y = y; g.add(mm); }
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      const light = new THREE.PointLight(T.lantern, 14, 12, 2); light.position.y = 2.35; g.add(light);
      this.lanterns.push({ light, base: light.intensity, phase: rand(0, 10) });
      this.scene.add(g);
      this.obstacles.push({ x: g.position.x, z: g.position.z, r: 0.7 });
    }
    // 도리이 (테마별 개수, 북쪽으로 줄지어)
    for (let t = 0; t < T.torii; t++) {
      const torii = new THREE.Group();
      torii.position.set(0, 0, -15 - t * 4.5);
      const s = 1 - t * 0.12;
      torii.scale.set(s, s, s);
      const pillarGeo = new THREE.CylinderGeometry(0.28, 0.34, 5.2, 8);
      for (const sx of [-2.2, 2.2]) {
        const pl = new THREE.Mesh(pillarGeo, woodMat); pl.position.set(sx, 2.6, 0); torii.add(pl);
        const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.4, 8), stoneDark); foot.position.set(sx, 0.2, 0); torii.add(foot);
      }
      const bars = [[6.4, 0.42, 0.5, flatMat(0x1a1416), 5.3], [6.0, 0.3, 0.42, woodMat, 4.95], [5.4, 0.28, 0.3, woodMat, 4.1], [0.5, 0.6, 0.2, woodMat, 4.5]];
      for (const [w, h, d, mat, y] of bars) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); b.position.y = y; torii.add(b); }
      torii.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.scene.add(torii);
      if (t === 0) this.obstacles.push({ x: -2.2, z: -15, r: 0.5 }, { x: 2.2, z: -15, r: 0.5 });
    }
    // 성 기둥·성벽 (귀왕의 성)
    if (T.pillars) {
      const pillarMat = flatMat(0x2a1a1a);
      const capMat = flatMat(0x8a1a1a);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const r = 20;
        const g = new THREE.Group();
        g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 9, 8), pillarMat); col.position.y = 4.5;
        const cap = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 2.2), capMat); cap.position.y = 9.2;
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.2, 6), new THREE.MeshLambertMaterial({ color: 0xff8030, emissive: 0xff4010, emissiveIntensity: 1.2 })); flame.position.y = 10.1;
        g.add(col, cap, flame);
        g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        this.scene.add(g);
        this.obstacles.push({ x: g.position.x, z: g.position.z, r: 1.0 });
      }
      // 옥좌 (북쪽)
      const throne = new THREE.Group(); throne.position.set(0, 0, -17);
      const base = new THREE.Mesh(new THREE.BoxGeometry(5, 0.6, 3), flatMat(0x3a2020)); base.position.y = 0.3;
      const seat = new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 1.4), flatMat(0x5a1a1a)); seat.position.set(0, 1.2, -0.4);
      const back = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.2, 0.4), flatMat(0x4a1010)); back.position.set(0, 2.6, -1.1);
      throne.add(base, seat, back);
      throne.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.scene.add(throne);
      this.obstacles.push({ x: 0, z: -17, r: 2.2 });
    }
    // 제등 기둥 (돌길 양옆)
    for (const sx of [-2.6, 2.6]) {
      for (const zz of [10, 16]) {
        const g = new THREE.Group(); g.position.set(sx, 0, zz);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.6, 6), flatMat(0x3b2a20)); pole.position.y = 1.3;
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.07, 0.07), flatMat(0x3b2a20)); arm.position.set(-sx * 0.15, 2.55, 0);
        const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.55, 8), new THREE.MeshLambertMaterial({ color: T.lanternPaper, emissive: T.lanternEmissive, emissiveIntensity: 0.9 }));
        lantern.position.set(-sx * 0.3, 2.15, 0);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.06, 8), flatMat(0x1a1416)); cap.position.set(-sx * 0.3, 2.47, 0);
        g.add(pole, arm, lantern, cap);
        g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        const light = new THREE.PointLight(T.lantern, 8, 9, 2); light.position.copy(lantern.position); g.add(light);
        this.lanterns.push({ light, base: light.intensity, phase: rand(0, 10) });
        this.scene.add(g);
        this.obstacles.push({ x: sx, z: zz, r: 0.2 });
      }
    }
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    for (let i = 0; i < 10; i++) {
      const r = rand(13, 21), a = rand(0, Math.PI * 2);
      const rock = new THREE.Mesh(rockGeo, flatMat(0x50565c));
      rock.position.set(Math.cos(a) * r, 0.1, Math.sin(a) * r);
      rock.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
      const s = rand(0.5, 1.3); rock.scale.set(s * 1.3, s * 0.7, s);
      rock.castShadow = true; rock.receiveShadow = true;
      this.scene.add(rock);
      this.obstacles.push({ x: rock.position.x, z: rock.position.z, r: s * 0.9 });
    }
  }

  _buildSky() {
    const T = this.T;
    this.moonMat = new THREE.MeshBasicMaterial({ color: T.moonColor, fog: false });
    const moon = new THREE.Mesh(new THREE.SphereGeometry(T.particles === 'ember' ? 6.5 : 4.5, 16, 12), this.moonMat);
    moon.position.set(-60, 55, -80);
    this.scene.add(moon); this.moon = moon;
    const haloMat = new THREE.MeshBasicMaterial({ color: T.halo, transparent: true, opacity: 0.18, fog: false, side: THREE.DoubleSide, depthWrite: false });
    const halo = new THREE.Mesh(new THREE.CircleGeometry(9, 24), haloMat);
    halo.position.copy(moon.position); halo.lookAt(0, 0, 0);
    this.scene.add(halo); this.haloMat = haloMat;
    const N = 700; const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const th = rand(0, Math.PI * 2), ph = rand(0.05, Math.PI * 0.48), r = 160;
      pos[i * 3] = Math.cos(th) * Math.cos(ph) * r; pos[i * 3 + 1] = Math.sin(ph) * r; pos[i * 3 + 2] = Math.sin(th) * Math.cos(ph) * r;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xdde6ff, size: 1.6, sizeAttenuation: true, fog: false, transparent: true, opacity: 0.9, map: makeDotTexture(), depthWrite: false, blending: THREE.AdditiveBlending });
    this.stars = new THREE.Points(g, this.starMat); this.scene.add(this.stars);
  }

  _buildMist() {
    this.mistMat = new THREE.MeshBasicMaterial({ map: makeRadialTexture(), transparent: true, opacity: 0.28, depthWrite: false, color: 0xc0cce8 });
    this.mistPlanes = [];
    const geo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < (this.mobile ? 16 : 26); i++) {
      const mesh = new THREE.Mesh(geo, this.mistMat);
      const r = rand(2, 34), a = rand(0, Math.PI * 2);
      mesh.position.set(Math.cos(a) * r, rand(0.2, 0.9), Math.sin(a) * r);
      mesh.rotation.x = -Math.PI / 2;
      const s = rand(9, 20); mesh.scale.set(s, s, 1);
      mesh.userData = { vx: rand(-0.25, 0.25), vz: rand(-0.25, 0.25), phase: rand(0, 6), s };
      this.scene.add(mesh); this.mistPlanes.push(mesh);
    }
  }

  // 반딧불 / 낙엽 / 불씨
  _buildParticles() {
    const T = this.T;
    if (T.floatingLanterns) {
      this.floaters = [];
      for (let i = 0; i < 14; i++) {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.6, 8), new THREE.MeshLambertMaterial({ color: T.lanternPaper, emissive: T.lanternEmissive, emissiveIntensity: 1.0 }));
        const r = rand(6, 22), a = rand(0, Math.PI * 2);
        mesh.position.set(Math.cos(a) * r, rand(3, 7), Math.sin(a) * r);
        this.scene.add(mesh);
        this.floaters.push({ mesh, y: mesh.position.y, sp: rand(0.4, 0.9), ph: rand(0, 6) });
      }
    }
    const N = 140;
    this.pData = [];
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = rand(3, 32), a = rand(0, Math.PI * 2);
      const d = { x: Math.cos(a) * r, y: rand(0.5, T.particles === 'firefly' ? 3.5 : 12), z: Math.sin(a) * r, phase: rand(0, 6), speed: rand(0.3, 0.8) };
      this.pData.push(d);
      pos[i * 3] = d.x; pos[i * 3 + 1] = d.y; pos[i * 3 + 2] = d.z;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    const soft = T.particles === 'leaf' || T.particles === 'snow';
    this.pMat = new THREE.PointsMaterial({ color: T.particleColor, size: T.particles === 'leaf' ? 0.34 : T.particles === 'snow' ? 0.28 : 0.22, transparent: true, opacity: 0.9, depthWrite: false, blending: soft ? THREE.NormalBlending : THREE.AdditiveBlending, map: makeDotTexture() });
    this.particles = new THREE.Points(g, this.pMat);
    this.scene.add(this.particles);
  }

  get nightProgress() { return clamp(this.nightTime / NIGHT_LENGTH, 0, 1); }
  get isDawn() { return this.dawnTriggered; }
  triggerDawn() { if (this.dawnTriggered) return; this.dawnTriggered = true; this.nightTime = NIGHT_LENGTH; }

  resolveCollisions(pos, radius) {
    const d = Math.hypot(pos.x, pos.z);
    if (d > ARENA_RADIUS - radius) { const k = (ARENA_RADIUS - radius) / d; pos.x *= k; pos.z *= k; }
    for (const o of this.obstacles) {
      const dx = pos.x - o.x, dz = pos.z - o.z;
      const dist = Math.hypot(dx, dz);
      const min = o.r + radius;
      if (dist < min && dist > 1e-4) { const k = min / dist; pos.x = o.x + dx * k; pos.z = o.z + dz * k; }
    }
  }

  update(dt, running = true, focus = null) {
    const T = this.T;
    this.time += dt;
    if (running && !this.dawnTriggered) { this.nightTime += dt; if (this.nightTime >= NIGHT_LENGTH) this.triggerDawn(); }
    if (this.dawnTriggered) this.dawnT = clamp(this.dawnT + dt / DAWN_DURATION, 0, 1);
    const t = smoothstep(0, 1, this.dawnT);
    this.scene.background.copy(this.night.sky).lerp(this.dawn.sky, t);
    this.scene.fog.color.copy(this.night.fog).lerp(this.dawn.fog, t);
    this.scene.fog.density = lerp(T.fogDensity, DAWN.fogDensity, t);
    this.moonLight.color.copy(this.night.moon).lerp(DAWN.moon, t);
    this.moonLight.intensity = lerp(T.moonIntensity, DAWN.moonIntensity, t);
    const fx = focus ? focus.x : 0, fz = focus ? focus.z : 0;
    this.moonLight.position.set(fx + lerp(-18, 30, t), lerp(30, 14, t), fz + lerp(-12, 8, t));
    this.moonLight.target.position.set(fx, 0, fz);
    this.hemi.color.copy(this.night.hemiSky).lerp(DAWN.hemiSky, t);
    this.hemi.groundColor.copy(this.night.hemiGround).lerp(DAWN.hemiGround, t);
    this.hemi.intensity = lerp(T.hemiIntensity, DAWN.hemiIntensity, t);
    this.starMat.opacity = 0.9 * (1 - t);
    this.haloMat.opacity = 0.18 * (1 - t);
    this.moon.position.y = lerp(55, 20, t);
    this.mistMat.opacity = lerp(0.28, 0.22, t);
    this.mistMat.color.setHex(0xc0cce8).lerp(new THREE.Color(0xffd6bd), t);
    this.pMat.opacity = 0.9 * (1 - t * 0.7);

    for (const l of this.lanterns) {
      const f = 0.85 + 0.15 * Math.sin(this.time * 9 + l.phase) * Math.sin(this.time * 3.3 + l.phase * 2);
      l.light.intensity = l.base * f * (1 - t * 0.6);
    }
    for (const m of this.mistPlanes) {
      const u = m.userData;
      m.position.x += u.vx * dt; m.position.z += u.vz * dt;
      if (Math.hypot(m.position.x, m.position.z) > 38) { m.position.x *= -0.9; m.position.z *= -0.9; }
      const s = u.s * (1 + 0.08 * Math.sin(this.time * 0.4 + u.phase)); m.scale.set(s, s, 1);
    }
    const fp = this.particles.geometry.attributes.position;
    for (let i = 0; i < this.pData.length; i++) {
      const d = this.pData[i];
      const tt = this.time * d.speed + d.phase;
      if (T.particles === 'firefly') {
        fp.setXYZ(i, d.x + Math.sin(tt) * 1.2, d.y + Math.sin(tt * 1.7) * 0.4, d.z + Math.cos(tt * 0.8) * 1.2);
      } else if (T.particles === 'snow') {
        d.y -= dt * (0.9 + d.speed * 0.8); if (d.y < 0.1) d.y = rand(9, 14);
        fp.setXYZ(i, d.x + Math.sin(tt * 0.9) * 0.9, d.y, d.z + Math.cos(tt * 0.7) * 0.9);
      } else if (T.particles === 'leaf') {
        d.y -= dt * (0.6 + d.speed * 0.6); if (d.y < 0.2) d.y = rand(8, 13);
        fp.setXYZ(i, d.x + Math.sin(tt * 1.3) * 1.5, d.y, d.z + Math.cos(tt) * 1.5);
      } else {
        d.y += dt * (1.2 + d.speed); if (d.y > 14) d.y = rand(0.2, 1.5);
        fp.setXYZ(i, d.x + Math.sin(tt * 2) * 0.6, d.y, d.z + Math.cos(tt * 1.5) * 0.6);
      }
    }
    fp.needsUpdate = true;
    if (T.particles === 'firefly' || T.particles === 'ember') this.pMat.size = 0.18 + 0.08 * Math.sin(this.time * 5);
    // 떠다니는 등롱 (무한 미궁성)
    if (this.floaters) for (const f of this.floaters) { f.mesh.position.y = f.y + Math.sin(this.time * f.sp + f.ph) * 0.8; f.mesh.rotation.y += dt * 0.5; }
  }
}
