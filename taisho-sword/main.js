// main.js — 초기화, 입력, 게임 루프, 상태(타이틀/플레이/일시정지/결과), 밤→새벽 규칙
import * as THREE from 'three';
import { Stage } from './stage.js';
import { Player } from './player.js';
import { EnemyManager } from './enemy.js';
import { UI } from './ui.js';
import { Effects } from './effects.js';
import { isTouchDevice, setupTouch } from './touch.js';

const TOUCH = isTouchDevice();

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, TOUCH ? 1.5 : 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 260);

const ui = new UI({ touch: TOUCH });
let stage, player, enemies, effects;
let touch = null;
let state = 'title';   // title | playing | paused | ended
let wasLocked = false;
let elapsed = 0;
let hitstop = 0;
let dawnEndTimer = 0;
let endKind = null;
const stats = { kills: 0, maxCombo: 0, specials: 0, time: 0 };

// ---------- 입력 ----------
const input = { keys: {}, mouseDX: 0, mouseDY: 0, axisX: 0, axisY: 0, light: false, heavy: false, special: false, dash: false };
if (TOUCH) {
  touch = setupTouch(input, { onPause: () => pause() });
  document.body.classList.add('touch');
}

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  input.keys[e.code] = true;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.dash = true;
  if (e.code === 'KeyF' || e.code === 'Space') { input.special = true; e.preventDefault(); }
  if (e.code === 'Escape' && state === 'playing') pause();
});
window.addEventListener('keyup', (e) => { input.keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in input.keys) input.keys[k] = false; });
document.addEventListener('mousemove', (e) => {
  if (state !== 'playing') return;
  input.mouseDX += e.movementX || 0;
  input.mouseDY += e.movementY || 0;
});
canvas.addEventListener('mousedown', (e) => {
  if (state !== 'playing') return;
  if (e.button === 0) input.light = true;
  if (e.button === 2) input.heavy = true;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
document.getElementById('ui').addEventListener('contextmenu', (e) => e.preventDefault());

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (locked) wasLocked = true;
  if (!locked && wasLocked && state === 'playing') pause();
});

ui.screen.addEventListener('click', () => {
  if (state === 'title') startGame();
  else if (state === 'paused') resume();
  else if (state === 'ended') { resetWorld(); startGame(); }
});

function lockPointer() {
  if (TOUCH) return;
  try {
    const p = canvas.requestPointerLock({ unadjustedMovement: true });
    if (p && p.catch) p.catch(() => { try { canvas.requestPointerLock(); } catch (_) { /* 잠금 불가 환경 */ } });
  } catch (_) {
    try { canvas.requestPointerLock(); } catch (__) { /* ignore */ }
  }
}

// ---------- 월드 ----------
function buildWorld() {
  effects = new Effects(scene);
  stage = new Stage(scene, { mobile: TOUCH });
  player = new Player(scene);
  enemies = new EnemyManager(scene);
  enemies.onMessage = (t, s) => ui.message(t, s);
  enemies.onBossSpawn = (b) => { ui.showBoss(b.name); effects.addShake(0.6); };
  enemies.onBossDefeated = () => {
    stage.triggerDawn();
    ui.message('夜明け', '새벽이 온다 — 요괴들이 재가 되어 흩어진다', 4);
    endKind = 'victory';
  };
  elapsed = 0; hitstop = 0; dawnEndTimer = 0; endKind = null;
  stats.kills = 0; stats.maxCombo = 0; stats.specials = 0; stats.time = 0;
  ui.hideBoss();
  ui.setHP(100, 100); ui.setGauge(0, 100); ui.setCombo(0, 0);
}

function resetWorld() {
  // 씬 전체 정리 후 재생성
  while (scene.children.length) {
    const o = scene.children[0];
    scene.remove(o);
    o.traverse && o.traverse((c) => {
      if (c.isMesh || c.isPoints) {
        c.geometry && c.geometry.dispose();
        const ms = Array.isArray(c.material) ? c.material : [c.material];
        ms.forEach((m) => m && m.dispose && m.dispose());
      }
    });
  }
  scene.fog = null;
  buildWorld();
}

function startGame() {
  state = 'playing';
  wasLocked = false;
  ui.hideScreen();
  lockPointer();
  ui.message('竹林の夜', '요괴는 밤에만 움직인다. 새벽이 오면 사라진다.', 3.5);
  enemies.waveDelay = 2.5;
}
function pause() {
  if (state !== 'playing') return;
  state = 'paused';
  ui.showScreen('pause');
  if (document.pointerLockElement === canvas) document.exitPointerLock();
}
function resume() {
  state = 'playing';
  ui.hideScreen();
  lockPointer();
}
function endGame(kind) {
  state = 'ended';
  stats.time = elapsed;
  ui.hideBoss();
  ui.showScreen(kind, stats);
  if (document.pointerLockElement === canvas) document.exitPointerLock();
}

// ---------- 루프 ----------
const clock = new THREE.Clock();
const ctx = { player: null, stage: null, effects: null, enemies: [], projectiles: [], spawnProjectile: null };

function frame() {
  requestAnimationFrame(frame);
  let dt = Math.min(clock.getDelta(), 0.05);
  const playing = state === 'playing';

  // 히트스톱: 시간 거의 정지
  if (hitstop > 0) { hitstop -= dt; dt *= 0.08; }

  ctx.player = player; ctx.stage = stage; ctx.effects = effects;
  ctx.onBossPhase = () => { ui.message('黒鬼 · 激昂', '흑귀가 분노한다 — 귀화의 고리를 조심하라', 3); effects.addShake(0.5); };

  if (playing) {
    elapsed += dt;
    player.update(dt, input, ctx);
    enemies.update(dt, ctx);
    // 플레이어 이벤트
    for (const ev of player.events) {
      if (ev.type === 'damaged') ui.damageFlash();
      if (ev.type === 'special') { stats.specials++; ui.message('秘剣・波焔', '', 1.4); }
      if (ev.type === 'dead') { setTimeout(() => endGame('defeat'), 1400); state = 'dying'; }
    }
    if (player.hitstop > 0) { hitstop = Math.max(hitstop, player.hitstop); player.hitstop = 0; }
    stats.kills = player.kills;
    stats.maxCombo = Math.max(stats.maxCombo, player.combo);

    // 밤 → 새벽 규칙
    if (stage.isDawn) {
      enemies.dissolveAll(effects);
      if (!endKind) { endKind = 'survived'; ui.message('夜明け', '새벽이 온다 — 요괴들이 재가 되어 흩어진다', 4); ui.hideBoss(); }
      dawnEndTimer += dt;
      if (dawnEndTimer > 6.5) endGame(endKind);
    }
  } else if (state === 'dying') {
    player.update(dt, input, ctx);
    enemies.update(dt, ctx);
  }

  stage.update(dt, playing, player.pos);
  effects.update(dt);
  player.updateCamera(camera, dt, effects.shake);
  input.mouseDX = 0; input.mouseDY = 0;
  input.light = input.heavy = input.special = input.dash = false;

  // HUD
  if (touch) { touch.setActive(playing); touch.setSpecialReady(player.specialReady); }
  ui.setHP(player.hp, player.maxHp);
  ui.setGauge(player.gauge, player.gaugeMax);
  ui.setCombo(player.combo, player.comboPop);
  ui.setNight(stage.nightProgress, enemies.waveIndex, enemies.totalWaves, player.kills, stage.isDawn);
  ui.setDash(player.dashCooldown / 0.75);
  if (enemies.boss && enemies.boss.alive) ui.setBossHP(enemies.boss.hp, enemies.boss.maxHp);
  else if (enemies.boss && !enemies.boss.alive) ui.hideBoss();
  ui.update(dt);

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

buildWorld();
ui.showScreen('title');
frame();

// 디버그/테스트용 노출
window.__game = { get state() { return state; }, get time() { return stage.time; }, get player() { return player; }, get enemies() { return enemies; }, get stage() { return stage; }, startGame, input };
