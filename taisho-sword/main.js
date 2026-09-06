// main.js — 초기화, 입력, 게임 루프, 상태(타이틀/선택/플레이/일시정지/메뉴/결과), 밤→새벽 규칙,
//           경험치·레벨업, 아이템 획득, 오디오 연동
import * as THREE from 'three';
import { Stage } from './stage.js';
import { Player } from './player.js';
import { EnemyManager } from './enemy.js';
import { UI } from './ui.js';
import { Effects } from './effects.js';
import { isTouchDevice, setupTouch } from './touch.js';
import { GameAudio } from './audio.js';
import { CHARACTERS, Progress, XP_REWARD } from './characters.js';
import { RARITIES, POTION_MAX, BAG_MAX } from './items.js';

const TOUCH = isTouchDevice();

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, TOUCH ? 1.5 : 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 260);

const ui = new UI({ touch: TOUCH });
const audio = new GameAudio();
let stage, player, enemies, effects;
let touch = null;
let state = 'title';   // title | select | playing | paused | menu | dying | ended
let wasLocked = false;
let elapsed = 0;
let hitstop = 0;
let dawnEndTimer = 0;
let endKind = null;
let character = CHARACTERS[0];
let progress = null;
const progressCache = {};
const progressOf = (id) => (progressCache[id] = progressCache[id] || new Progress(id));
const stats = { kills: 0, maxCombo: 0, specials: 0, time: 0, xpGained: 0, itemsGained: 0 };
try { const last = localStorage.getItem('taisho_last_char'); if (last) character = CHARACTERS.find((c) => c.id === last) || character; } catch (_) { /* ignore */ }

// ---------- 입력 ----------
const input = { keys: {}, mouseDX: 0, mouseDY: 0, axisX: 0, axisY: 0, light: false, heavy: false, special: false, dash: false, potion: false };
if (TOUCH) {
  touch = setupTouch(input, { onPause: () => pause(), onMenu: () => toggleMenu(), onSound: () => toggleSound() });
  touch.setSound(audio.muted);
  document.body.classList.add('touch');
}

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  input.keys[e.code] = true;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.dash = true;
  if (e.code === 'KeyF' || e.code === 'Space') { input.special = true; e.preventDefault(); }
  if (e.code === 'KeyQ') input.potion = true;
  if (e.code === 'KeyM') toggleSound();
  if (e.code === 'Tab' || e.code === 'KeyT') { e.preventDefault(); toggleMenu(); }
  if (e.code === 'Escape') { if (state === 'playing') pause(); else if (state === 'menu') closeMenu(); }
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
document.getElementById('ui').addEventListener('contextmenu', (e) => { if (!e.target.closest('.item')) e.preventDefault(); });

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (locked) wasLocked = true;
  if (!locked && wasLocked && state === 'playing') pause();
});

ui.screen.addEventListener('click', () => {
  audio.init();
  if (state === 'title') { ui.hideScreen(); showSelect(); }
  else if (state === 'paused') resume();
  else if (state === 'ended') { ui.hideScreen(); showSelect(); }
});
ui.onSelect = (ch) => { audio.init(); character = ch; try { localStorage.setItem('taisho_last_char', ch.id); } catch (_) { /* ignore */ } ui.hideSelect(); resetWorld(); startGame(); };
ui.onMenuClose = () => closeMenu();
ui.onLearn = (id) => { player.applySkills(); audio.sfx('start'); ui.logLine(`<b>스킬 습득</b> ${id}`); };
ui.onResetSkills = () => player.applySkills();
ui.onEquip = () => { player.applySkills(); audio.sfx('parry'); };
ui.onUnequip = () => player.applySkills();

function lockPointer() {
  if (TOUCH) return;
  try {
    const p = canvas.requestPointerLock({ unadjustedMovement: true });
    if (p && p.catch) p.catch(() => { try { canvas.requestPointerLock(); } catch (_) { /* ignore */ } });
  } catch (_) { try { canvas.requestPointerLock(); } catch (__) { /* ignore */ } }
}
function toggleSound() {
  audio.init();
  const muted = audio.toggleMute();
  if (touch) touch.setSound(muted);
  ui.logLine(muted ? '소리 꺼짐' : '소리 켜짐');
}

// ---------- 월드 ----------
function buildWorld() {
  effects = new Effects(scene);
  stage = new Stage(scene, { mobile: TOUCH });
  progress = progressOf(character.id);
  player = new Player(scene, character, progress);
  enemies = new EnemyManager(scene);
  enemies.onMessage = (t, s) => ui.message(t, s);
  enemies.onWave = (i, w) => { audio.sfx('gong'); if (i > 0) gainXp(XP_REWARD.wave, '파도 돌파'); };
  enemies.onBossSpawn = (b) => { ui.showBoss(b.name); effects.addShake(0.6); audio.setMode('boss'); audio.sfx('roar'); };
  enemies.onBossDefeated = () => {
    stage.triggerDawn();
    ui.message('새벽', '새벽이 온다 — 요괴들이 재가 되어 흩어진다', 4);
    endKind = 'victory';
    audio.setMode('dawn'); audio.sfx('bell');
    gainXp(XP_REWARD.night, '밤을 넘김');
  };
  enemies.onKill = (e) => gainXp(XP_REWARD[e.kind] || XP_REWARD.melee, null);
  enemies.onPickup = (k) => onPickup(k);
  elapsed = 0; hitstop = 0; dawnEndTimer = 0; endKind = null;
  stats.kills = 0; stats.maxCombo = 0; stats.specials = 0; stats.time = 0; stats.xpGained = 0; stats.itemsGained = 0;
  ui.hideBoss();
  ui.setHP(player.hp, player.maxHp); ui.setGauge(0, 100); ui.setCombo(0, 0); ui.setProgress(progress);
}

function resetWorld() {
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

function gainXp(amount, label) {
  const ups = progress.addXp(amount);
  stats.xpGained += amount;
  if (label) ui.logLine(`<b>+${amount} 경험치</b> ${label}`);
  if (ups > 0) {
    ui.message(`레벨 ${progress.level}`, `스킬 포인트 +${ups} — ${TOUCH ? '장비·스킬 버튼' : 'Tab'}으로 스킬을 익히세요`, 3);
    audio.sfx('bell');
    effects.burst(player.center, { count: 40, colors: [0xffd9a0, 0xffffff, character.colors.glow], speed: 3, life: 1.0, size: 0.45, gravity: 2, drag: 1, up: 2 });
  }
  ui.setProgress(progress);
}

function onPickup(k) {
  if (k.type === 'potion') {
    if (progress.potions >= POTION_MAX) { return false; }
    progress.addPotion(1, POTION_MAX);
    ui.logLine(`<b>회복약</b> 획득 (${progress.potions}/${POTION_MAX})`, 'potion');
    audio.sfx('parry');
  } else {
    if (!progress.addItem(k.item, BAG_MAX)) { ui.logLine('가방이 가득 찼습니다', 'warn'); return false; }
    const r = RARITIES[k.item.rarity];
    stats.itemsGained++;
    ui.logLine(`<span style="color:${r.color}">[${r.name}] ${k.item.name}</span> 획득`, k.item.rarity);
    audio.sfx(k.item.rarity === 'common' ? 'parry' : 'bell');
    if (k.item.rarity === 'unique' || k.item.rarity === 'hidden') ui.message(`${r.name} 아이템!`, k.item.name, 2.2);
  }
  ui.setProgress(progress);
  return true;
}

function showSelect() { state = 'select'; ui.hideScreen(); ui.hideMenu(); ui.showSelect(progressOf); audio.setMode('menu'); }
function startGame() {
  state = 'playing';
  wasLocked = false;
  ui.hideScreen();
  lockPointer();
  ui.message('대숲의 밤', `${character.name} — ${character.style}. 요괴는 밤에만 움직인다.`, 3.5);
  enemies.waveDelay = 2.5;
  audio.setMode('night'); audio.sfx('start');
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
function toggleMenu() {
  if (state === 'playing' || state === 'paused') openMenu();
  else if (state === 'menu') closeMenu();
}
function openMenu() {
  state = 'menu';
  ui.hideScreen();
  ui.showMenu(character, progress, progress.points > 0 ? 'skills' : ui.menuTab);
  if (document.pointerLockElement === canvas) document.exitPointerLock();
}
function closeMenu() {
  ui.hideMenu();
  if (player.alive) resume(); else state = 'dying';
}
function endGame(kind) {
  state = 'ended';
  stats.time = elapsed;
  ui.hideBoss();
  ui.showScreen(kind, stats);
  audio.setMode('menu');
  if (document.pointerLockElement === canvas) document.exitPointerLock();
}

// ---------- 루프 ----------
const clock = new THREE.Clock();
const ctx = { player: null, stage: null, effects: null, enemies: [], projectiles: [], pickups: [], spawnProjectile: null, sfx: (n) => audio.sfx(n) };

function frame() {
  requestAnimationFrame(frame);
  let dt = Math.min(clock.getDelta(), 0.05);
  const playing = state === 'playing';
  if (hitstop > 0) { hitstop -= dt; dt *= 0.08; }

  ctx.player = player; ctx.stage = stage; ctx.effects = effects;
  ctx.onBossPhase = () => { ui.message('흑귀 · 격앙', '흑귀가 분노한다 — 귀화의 고리를 조심하라', 3); effects.addShake(0.5); };

  if (playing) {
    elapsed += dt;
    player.update(dt, input, ctx);
    enemies.update(dt, ctx);
    for (const ev of player.events) {
      switch (ev.type) {
        case 'damaged': ui.damageFlash(); audio.sfx('hurt'); break;
        case 'special': stats.specials++; ui.message(character.special.name, '', 1.4); audio.sfx('special'); break;
        case 'wave': audio.sfx('wave'); break;
        case 'swing': audio.sfx(ev.heavy ? 'swingHeavy' : ev.special ? 'wave' : 'swing'); break;
        case 'hit': audio.sfx(ev.killed ? 'kill' : ev.heavy || ev.special ? 'hitHeavy' : 'hit'); break;
        case 'parry': audio.sfx('parry'); break;
        case 'dash': audio.sfx('dash'); break;
        case 'potion': audio.sfx('bell'); ui.logLine(`<b>회복약</b> 사용 — 남은 ${progress.potions}개`, 'potion'); ui.setProgress(progress); break;
        case 'potionFail': ui.logLine(progress.potions <= 0 ? '회복약이 없습니다' : '체력이 이미 가득합니다', 'warn'); break;
        case 'dead': audio.sfx('dead'); setTimeout(() => endGame('defeat'), 1400); state = 'dying'; break;
        default: break;
      }
    }
    if (player.hitstop > 0) { hitstop = Math.max(hitstop, player.hitstop); player.hitstop = 0; }
    stats.kills = player.kills;
    stats.maxCombo = Math.max(stats.maxCombo, player.combo);

    if (stage.isDawn) {
      enemies.dissolveAll(effects);
      if (!endKind) { endKind = 'survived'; ui.message('새벽', '새벽이 온다 — 요괴들이 재가 되어 흩어진다', 4); ui.hideBoss(); audio.setMode('dawn'); audio.sfx('bell'); gainXp(XP_REWARD.night, '밤을 버팀'); }
      dawnEndTimer += dt;
      if (dawnEndTimer > 6.5) endGame(endKind);
    }
  } else if (state === 'dying') {
    player.update(dt, input, ctx);
    enemies.update(dt, ctx);
  }

  if (stage) {
    stage.update(dt, playing, player.pos);
    effects.update(dt);
    player.updateCamera(camera, dt, effects.shake);
  }
  input.mouseDX = 0; input.mouseDY = 0;
  input.light = input.heavy = input.special = input.dash = input.potion = false;

  if (touch) { touch.setActive(playing); touch.setSpecialReady(player.specialReady); touch.setPotions(progress.potions); }
  ui.setHP(player.hp, player.maxHp);
  ui.setGauge(player.gauge, player.gaugeMax);
  ui.setCombo(player.combo, player.comboPop);
  ui.setNight(stage.nightProgress, enemies.waveIndex, enemies.totalWaves, player.kills, stage.isDawn);
  ui.setDash(player.dashCooldown / Math.max(0.05, player.skill.dashCooldown));
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
window.__game = {
  get state() { return state; }, get time() { return stage.time; }, get player() { return player; }, get enemies() { return enemies; },
  get stage() { return stage; }, get progress() { return progress; }, get audio() { return audio; }, input, showSelect, openMenu, closeMenu,
};
