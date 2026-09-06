// stage.js — 무대: 테마(대나무 숲/폐사/귀왕의 성)별 저폴리곤 숲, 조명, 밤→새벽 진행
import * as THREE from 'three';
import { rand, clamp, lerp, smoothstep } from './util.js';
import { THEMES } from './scenario.js';
import { MAPS, inBounds, clampToBounds, boundsExtent } from './maps.js';

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
  constructor(scene, { mobile = false, theme = 'bamboo', nightLength = NIGHT_LENGTH } = {}) {
    this.nightLength = nightLength;
    this.scene = scene;
    this.mobile = mobile;
    this.T = THEMES[theme] || THEMES.bamboo;
    this.map = MAPS[theme] || MAPS.bamboo;
    this.bounds = this.map.bounds;
    this.extent = boundsExtent(this.bounds);
    this.time = 0; this.nightTime = 0; this.dawnT = 0; this.dawnTriggered = false;
    this.obstacles = [];
    this.lanterns = [];
    this.poi = this.map.poi || [];
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
      // CircleGeometry는 XY 평면 → 회전 후 y가 -z가 됨
      const inside = inBounds(this.bounds, x, -y, -3);
      const h = inside ? 0 : (Math.sin(x * 0.45) * Math.cos(y * 0.37) * 0.35 + rand(-0.12, 0.12)) * (inBounds(this.bounds, x, -y, -9) ? 0.4 : 1);
      pos.setZ(i, h);
    }
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, flatMat(T.ground));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
    this.scene.add(ground);
    const M = this.map, b = this.bounds;
    if (M.plaza) {
      const plaza = new THREE.Mesh(new THREE.CircleGeometry(M.plaza.r, 10), flatMat(T.plaza));
      plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.02; plaza.receiveShadow = true; this.scene.add(plaza);
      const plaza2 = new THREE.Mesh(new THREE.RingGeometry(M.plaza.r, M.plaza.r + 1.5, 10), flatMat(T.plazaRing));
      plaza2.rotation.x = -Math.PI / 2; plaza2.position.y = 0.015; plaza2.receiveShadow = true; this.scene.add(plaza2);
    }
    // 사각·십자 맵: 바닥 포장
    if (b.type === 'rect') {
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.h), flatMat(T.plaza));
      floor.rotation.x = -Math.PI / 2; floor.position.y = 0.02; floor.receiveShadow = true; this.scene.add(floor);
      const tileGeo = new THREE.BoxGeometry(3.6, 0.06, 3.6);
      const tileMat = flatMat(T.plazaRing);
      for (let x = -b.w / 2 + 2; x < b.w / 2; x += 4) for (let z = -b.h / 2 + 2; z < b.h / 2; z += 4) {
        if (((x + z) / 4) % 2 !== 0) continue;
        const tile = new THREE.Mesh(tileGeo, tileMat); tile.position.set(x, 0.03, z); tile.receiveShadow = true; this.scene.add(tile);
      }
    } else if (b.type === 'cross') {
      for (const [w, h] of [[b.w, b.len], [b.len, b.w], [b.hall * 2, b.hall * 2]]) {
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, h), flatMat(T.plaza));
        floor.rotation.x = -Math.PI / 2; floor.position.y = 0.02; floor.receiveShadow = true; this.scene.add(floor);
      }
    }
    if (M.stonePath) {
      const slabGeo = new THREE.BoxGeometry(1.6, 0.12, 1.1);
      const slabMat = flatMat(T.plaza);
      for (let i = 0; i < 12; i++) {
        const slab = new THREE.Mesh(slabGeo, slabMat);
        slab.position.set(rand(-0.4, 0.4), 0.05, 8.5 + i * 1.45); slab.rotation.y = rand(-0.2, 0.2);
        slab.receiveShadow = true; slab.castShadow = true; this.scene.add(slab);
      }
    }
    if (M.stairs) {
      // 남쪽 계단(장식): 낮은 단이 이어짐
      const st = M.stairs;
      for (let z = st.from; z < st.to; z += st.step) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(b.w - 2, 0.1, st.step * 0.9), flatMat(T.plazaRing));
        step.position.set(0, 0.04 + ((z - st.from) / (st.to - st.from)) * 0.25, z); step.receiveShadow = true; this.scene.add(step);
      }
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
    const inner = this.bounds.type === 'circle' && this.map.plaza ? 60 : 0; // 원형 공터에만 안쪽 대나무
    let tries = 0;
    for (let i = 0; i < COUNT; i++) {
      if (tries++ > COUNT * 20) break;
      let x, z;
      if (i < inner) { const r = rand(9.5, this.extent - 1.5), a = rand(0, Math.PI * 2); x = Math.cos(a) * r; z = Math.sin(a) * r; if (z > 7 && Math.abs(x) < 2.2) { i--; continue; } }
      else { const r = rand(0, this.extent + 34), a = rand(0, Math.PI * 2); x = Math.cos(a) * r; z = Math.sin(a) * r; if (inBounds(this.bounds, x, z, -1.6)) { i--; continue; } }
      const r = Math.hypot(x, z);
      const h = rand(7, 14);
      const tiltX = rand(-0.06, 0.06), tiltZ = rand(-0.06, 0.06);
      const thick = rand(0.75, 1.25);
      e.set(tiltX, rand(0, Math.PI * 2), tiltZ); q.setFromEuler(e);
      p.set(x, -0.1, z); sc.set(thick, h, thick);
      m.compose(p, q, sc); stalks.setMatrixAt(i, m);
      color.setHSL(T.trunk.h + rand(-0.03, 0.03), T.trunk.s, T.trunk.l + rand(-0.06, 0.06));
      stalks.setColorAt(i, color);
      if (inBounds(this.bounds, x, z, 0)) this.obstacles.push({ x, z, r: 0.28 * thick });
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
      const r = rand(6, this.extent + 18), a = rand(0, Math.PI * 2);
      p.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      if (inBounds(this.bounds, p.x, p.z, 0.5) && this.bounds.type !== 'circle') { p.set(0, -5, 0); }
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
    const addShadow = (g) => g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const addLight = (g, y, intensity = 14, dist = 12) => {
      const light = new THREE.PointLight(T.lantern, intensity, dist, 2); light.position.y = y; g.add(light);
      this.lanterns.push({ light, base: light.intensity, phase: rand(0, 10) });
    };
    // 벽을 원형 장애물 열로 근사
    const wallObstacles = (x, z, w, d, rot) => {
      const long = Math.max(w, d), short = Math.min(w, d);
      const r = short / 2 + 0.25;
      const n = Math.max(1, Math.ceil(long / (r * 1.6)));
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0 : -long / 2 + (i + 0.5) * (long / n);
        const lx = w >= d ? t : 0, lz = w >= d ? 0 : t;
        this.obstacles.push({ x: x + lx * Math.cos(rot) - lz * Math.sin(rot), z: z + lx * Math.sin(rot) + lz * Math.cos(rot), r });
      }
    };

    for (const st of this.map.structures) {
      if (st.kind === 'lantern') {
        const g = new THREE.Group(); g.position.set(st.x, 0, st.z); g.rotation.y = -Math.atan2(st.z, st.x);
        const parts = [
          [new THREE.CylinderGeometry(0.55, 0.7, 0.35, 6), stoneDark, 0.17], [new THREE.CylinderGeometry(0.16, 0.2, 1.5, 6), stoneMat, 1.1],
          [new THREE.CylinderGeometry(0.5, 0.25, 0.25, 6), stoneMat, 1.95], [new THREE.BoxGeometry(0.62, 0.55, 0.62), stoneDark, 2.35],
          [new THREE.BoxGeometry(0.3, 0.3, 0.66), paperMat, 2.35], [new THREE.BoxGeometry(0.66, 0.3, 0.3), paperMat, 2.35],
          [new THREE.ConeGeometry(0.75, 0.5, 6), stoneMat, 2.85], [new THREE.SphereGeometry(0.12, 6, 4), stoneMat, 3.15],
        ];
        for (const [geo, mat, y] of parts) { const mm = new THREE.Mesh(geo, mat); mm.position.y = y; g.add(mm); }
        addShadow(g); addLight(g, 2.35); this.scene.add(g);
        this.obstacles.push({ x: st.x, z: st.z, r: 0.7 });
      } else if (st.kind === 'torii') {
        const torii = new THREE.Group(); torii.position.set(st.x, 0, st.z); torii.rotation.y = st.rot || 0;
        const sc = st.scale || 1; torii.scale.set(sc, sc, sc);
        const pillarGeo = new THREE.CylinderGeometry(0.28, 0.34, 5.2, 8);
        for (const sx of [-2.2, 2.2]) {
          const pl = new THREE.Mesh(pillarGeo, woodMat); pl.position.set(sx, 2.6, 0); torii.add(pl);
          const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.4, 8), stoneDark); foot.position.set(sx, 0.2, 0); torii.add(foot);
          this.obstacles.push({ x: st.x + sx * sc, z: st.z, r: 0.5 * sc });
        }
        const bars = [[6.4, 0.42, 0.5, flatMat(0x1a1416), 5.3], [6.0, 0.3, 0.42, woodMat, 4.95], [5.4, 0.28, 0.3, woodMat, 4.1], [0.5, 0.6, 0.2, woodMat, 4.5]];
        for (const [w, h, d, mat, y] of bars) { const bm = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); bm.position.y = y; torii.add(bm); }
        addShadow(torii); this.scene.add(torii);
      } else if (st.kind === 'wall') {
        const m = new THREE.Mesh(new THREE.BoxGeometry(st.w, st.h, st.d), flatMat(st.color));
        m.position.set(st.x, st.h / 2, st.z); m.rotation.y = st.rot || 0;
        const cap = new THREE.Mesh(new THREE.BoxGeometry(st.w + 0.3, 0.25, st.d + 0.3), flatMat(0x1a1416)); cap.position.set(st.x, st.h + 0.12, st.z); cap.rotation.y = st.rot || 0;
        addShadow(m); addShadow(cap); this.scene.add(m, cap);
        wallObstacles(st.x, st.z, st.w, st.d, st.rot || 0);
      } else if (st.kind === 'box') {
        const m = new THREE.Mesh(new THREE.BoxGeometry(st.w, st.h, st.d), flatMat(st.color)); m.position.set(st.x, st.h / 2, st.z);
        addShadow(m); this.scene.add(m); this.obstacles.push({ x: st.x, z: st.z, r: Math.max(st.w, st.d) / 2 + 0.2 });
      } else if (st.kind === 'pillar') {
        const g = new THREE.Group(); g.position.set(st.x, 0, st.z);
        const col = new THREE.Mesh(new THREE.CylinderGeometry(st.r, st.r * 1.2, st.h, 8), flatMat(st.color)); col.position.y = st.h / 2;
        const cap = new THREE.Mesh(new THREE.BoxGeometry(st.r * 3, 0.5, st.r * 3), flatMat(0x8a1a1a)); cap.position.y = st.h + 0.2;
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.2, 6), new THREE.MeshLambertMaterial({ color: T.lanternPaper, emissive: T.lanternEmissive, emissiveIntensity: 1.2 })); flame.position.y = st.h + 1.1;
        g.add(col, cap, flame); addShadow(g); this.scene.add(g);
        this.obstacles.push({ x: st.x, z: st.z, r: st.r + 0.3 });
      } else if (st.kind === 'rock') {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), flatMat(T.particles === 'snow' ? 0x9aa4b4 : 0x50565c));
        rock.position.set(st.x, 0.1, st.z); rock.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3)); rock.scale.set(st.s * 1.3, st.s * 0.7, st.s);
        addShadow(rock); this.scene.add(rock); this.obstacles.push({ x: st.x, z: st.z, r: st.s * 0.9 });
      } else if (st.kind === 'hut') {
        const g = new THREE.Group(); g.position.set(st.x, 0, st.z);
        const base = new THREE.Mesh(new THREE.BoxGeometry(st.w + 1, 0.5, st.d + 1), stoneDark); base.position.y = 0.25;
        const body = new THREE.Mesh(new THREE.BoxGeometry(st.w, st.h, st.d), flatMat(st.color)); body.position.y = 0.5 + st.h / 2;
        const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(st.w, st.d) * 0.85, 2.2, 4), flatMat(st.roof)); roof.position.y = 0.5 + st.h + 1.1; roof.rotation.y = Math.PI / 4;
        const door = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.2, 0.2), flatMat(0x1a1416)); door.position.set(0, 1.6, st.d / 2 + 0.05);
        g.add(base, body, roof, door); addShadow(g); this.scene.add(g);
        addLight(g, 3.5, 10, 14);
        wallObstacles(st.x, st.z, st.w + 1, st.d + 1, 0);
      } else if (st.kind === 'pond') {
        const pond = new THREE.Mesh(new THREE.CircleGeometry(st.r, 12), new THREE.MeshLambertMaterial({ color: st.color, emissive: 0x203050, emissiveIntensity: 0.3, transparent: true, opacity: 0.9 }));
        pond.rotation.x = -Math.PI / 2; pond.position.set(st.x, 0.03, st.z); this.scene.add(pond);
        const rim = new THREE.Mesh(new THREE.RingGeometry(st.r, st.r + 0.8, 12), flatMat(0x8a94a4)); rim.rotation.x = -Math.PI / 2; rim.position.set(st.x, 0.025, st.z); this.scene.add(rim);
      } else if (st.kind === 'dais') {
        const m = new THREE.Mesh(new THREE.BoxGeometry(st.w, st.h, st.d), flatMat(0x3a2020)); m.position.set(st.x, st.h / 2, st.z); addShadow(m); this.scene.add(m);
      } else if (st.kind === 'throne') {
        const g = new THREE.Group(); g.position.set(st.x, 0.8, st.z);
        const seat = new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 1.4), flatMat(0x5a1a1a)); seat.position.set(0, 0.6, 0);
        const back = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.2, 0.4), flatMat(0x4a1010)); back.position.set(0, 2.0, -0.7);
        g.add(seat, back); addShadow(g); this.scene.add(g); this.obstacles.push({ x: st.x, z: st.z, r: 1.6 });
      } else if (st.kind === 'tower') {
        const g = new THREE.Group(); g.position.set(st.x, 0, st.z);
        const body = new THREE.Mesh(new THREE.BoxGeometry(4, 9, 4), flatMat(0x2a1a1a)); body.position.y = 4.5;
        const roof = new THREE.Mesh(new THREE.ConeGeometry(3.6, 2.4, 4), flatMat(0x8a1a1a)); roof.position.y = 10.2; roof.rotation.y = Math.PI / 4;
        g.add(body, roof); addShadow(g); this.scene.add(g); addLight(g, 8, 10, 16);
        this.obstacles.push({ x: st.x, z: st.z, r: 2.9 });
      } else if (st.kind === 'gate') {
        const g = new THREE.Group(); g.position.set(st.x, 0, st.z);
        for (const sx of [-5, 5]) { const post = new THREE.Mesh(new THREE.BoxGeometry(1.6, 6.5, 1.6), flatMat(0x3a1a1a)); post.position.set(sx, 3.25, 0); g.add(post); this.obstacles.push({ x: st.x + sx, z: st.z, r: 1.2 }); }
        const lintel = new THREE.Mesh(new THREE.BoxGeometry(12.5, 1.0, 2), flatMat(0x8a1a1a)); lintel.position.y = 6.5;
        const roof = new THREE.Mesh(new THREE.BoxGeometry(13.5, 0.5, 3), flatMat(0x1a1416)); roof.position.y = 7.2;
        g.add(lintel, roof); addShadow(g); this.scene.add(g);
      } else if (st.kind === 'brazier') {
        const g = new THREE.Group(); g.position.set(st.x, 0, st.z);
        const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.5, 0.8, 8), flatMat(0x3a2a20)); bowl.position.y = 0.9;
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.6, 6), flatMat(0x2a1a14)); leg.position.y = 0.3;
        const fire = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.6, 6), new THREE.MeshLambertMaterial({ color: 0xff9030, emissive: 0xff5010, emissiveIntensity: 1.3 })); fire.position.y = 1.9;
        g.add(bowl, leg, fire); addShadow(g); this.scene.add(g); addLight(g, 1.8, 12, 12);
        this.obstacles.push({ x: st.x, z: st.z, r: 1.0 });
      } else if (st.kind === 'ring') {
        const ring = new THREE.Mesh(new THREE.RingGeometry(st.r - 0.3, st.r, 32), new THREE.MeshBasicMaterial({ color: st.color, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2; ring.position.set(st.x, 0.05, st.z); this.scene.add(ring);
      }
    }
    // 제등 기둥 (돌길이 있는 맵)
    if (this.map.stonePath) {
      for (const sx of [-2.6, 2.6]) for (const zz of [10, 16]) {
        const g = new THREE.Group(); g.position.set(sx, 0, zz);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.6, 6), flatMat(0x3b2a20)); pole.position.y = 1.3;
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.07, 0.07), flatMat(0x3b2a20)); arm.position.set(-sx * 0.15, 2.55, 0);
        const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.55, 8), new THREE.MeshLambertMaterial({ color: T.lanternPaper, emissive: T.lanternEmissive, emissiveIntensity: 0.9 })); lantern.position.set(-sx * 0.3, 2.15, 0);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.06, 8), flatMat(0x1a1416)); cap.position.set(-sx * 0.3, 2.47, 0);
        g.add(pole, arm, lantern, cap); addShadow(g); addLight(g, 2.15, 8, 9); this.scene.add(g);
        this.obstacles.push({ x: sx, z: zz, r: 0.2 });
      }
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

  get nightProgress() { return clamp(this.nightTime / this.nightLength, 0, 1); }
  get isDawn() { return this.dawnTriggered; }
  triggerDawn() { if (this.dawnTriggered) return; this.dawnTriggered = true; this.nightTime = this.nightLength; }

  inBounds(x, z, margin = 0) { return inBounds(this.bounds, x, z, margin); }
  // 플레이어 주변 스폰 지점 (경계 안)
  randomSpawn(center, min = 10, max = 16, avoid = 6) {
    for (let i = 0; i < 40; i++) {
      const a = rand(0, Math.PI * 2), r = rand(min, max);
      const x = center.x + Math.cos(a) * r, z = center.z + Math.sin(a) * r;
      if (!inBounds(this.bounds, x, z, 1.5)) continue;
      if (Math.hypot(x - center.x, z - center.z) < avoid) continue;
      let blocked = false;
      for (const o of this.obstacles) if (Math.hypot(x - o.x, z - o.z) < o.r + 0.8) { blocked = true; break; }
      if (!blocked) return new THREE.Vector3(x, 0, z);
    }
    const bs = this.map.bossStart; return new THREE.Vector3(bs.x, 0, bs.z);
  }
  resolveCollisions(pos, radius) {
    clampToBounds(this.bounds, pos, radius);
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
    if (running && !this.dawnTriggered) { this.nightTime += dt; if (this.nightTime >= this.nightLength) this.triggerDawn(); }
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
