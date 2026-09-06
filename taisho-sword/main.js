// main.js — 초기화, 입력, 게임 루프, 상태 전환, 시나리오(장) 진행, 동료, 경험치·금화·아이템·상점, 오디오 연동
import * as THREE from 'three';
import { Stage } from './stage.js';
import { Player } from './player.js';
import { Ally } from './ally.js';
import { EnemyManager } from './enemy.js';
import { UI } from './ui.js';
import { Effects } from './effects.js';
import { isTouchDevice, setupTouch } from './touch.js';
import { GameAudio } from './audio.js';
import { CHARACTERS, Progress, XP_REWARD, getCharacter, getAlly } from './characters.js';
import { RARITIES, POTION_MAX, BAG_MAX, POTION_PRICE, makeShopStock, sellPrice } from './items.js';
import { CHAPTERS, getChapter } from './scenario.js';

const TOUCH = isTouchDevice();
const DIFFICULTIES = { normal: { name: '보통', hp: 0.8, dmg: 0.8 }, hard: { name: '어려움', hp: 1.0, dmg: 1.0 }, hell: { name: '귀살', hp: 1.35, dmg: 1.3 } };
let difficulty = 'hard';
try { difficulty = localStorage.getItem('taisho_diff') || 'hard'; if (!DIFFICULTIES[difficulty]) difficulty = 'hard'; } catch (_) { /* ignore */ }

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
let allies = [];
let touch = null;
let state = 'title';   // title | select | story | playing | paused | menu | dying | ended
let wasLocked = false;
let elapsed = 0, hitstop = 0, dawnEndTimer = 0;
let endKind = null;
let lives = 3;
let reviveT = 0;
let character = CHARACTERS[0];
let progress = null;
let chapter = getChapter(1);
let storyNext = null;
const progressCache = {};
const progressOf = (id) => (progressCache[id] = progressCache[id] || new Progress(id));
const stats = { kills: 0, maxCombo: 0, specials: 0, time: 0, xpGained: 0, goldGained: 0, itemsGained: 0 };
let lastCharId = null;
try { lastCharId = localStorage.getItem('taisho_last_char'); if (lastCharId) character = getCharacter(lastCharId); } catch (_) { /* ignore */ }

// ---------- 입력 ----------
const input = { keys: {}, mouseDX: 0, mouseDY: 0, axisX: 0, axisY: 0, light: false, heavy: false, special: false, dash: false, potion: false, tech1: false, tech2: false, hold: {}, release: {} };
if (TOUCH) {
  touch = setupTouch(input, { onPause: () => pause(), onMenu: () => toggleMenu(), onSound: () => toggleSound() });
  touch.setSound(audio.muted);
  document.body.classList.add('touch');
}
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  input.keys[e.code] = true;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.dash = true;
  if (e.code === 'KeyF' || e.code === 'Space') { input.special = true; if (state === 'playing') e.preventDefault(); }
  if (e.code === 'KeyQ') input.potion = true;
  if (e.code === 'Digit1') input.hold.tech1 = 0.0001;
  if (e.code === 'Digit2') input.hold.tech2 = 0.0001;
  if (e.code === 'Digit3') input.hold.heavy = 0.0001;
  if (e.code === 'Digit4') input.hold.tech4 = 0.0001;
  if (e.code === 'Digit5') input.hold.tech5 = 0.0001;
  if (e.code === 'Digit6') input.hold.tech6 = 0.0001;
  if (e.code === 'Digit7') input.special = true;
  if (e.code === 'KeyM') toggleSound();
  if (e.code === 'Tab' || e.code === 'KeyT') { e.preventDefault(); toggleMenu(); }
  if (e.code === 'Escape') { if (state === 'playing') pause(); else if (state === 'menu') closeMenu(); }
  if ((e.code === 'Enter' || e.code === 'Space') && state === 'story') { e.preventDefault(); storyDone(); }
});
window.addEventListener('keyup', (e) => {
  input.keys[e.code] = false;
  if (e.code === 'Digit1') input.release.tech1 = true;
  if (e.code === 'Digit2') input.release.tech2 = true;
  if (e.code === 'Digit3') input.release.heavy = true;
  if (e.code === 'Digit4') input.release.tech4 = true;
  if (e.code === 'Digit5') input.release.tech5 = true;
  if (e.code === 'Digit6') input.release.tech6 = true;
});
window.addEventListener('blur', () => { for (const k in input.keys) input.keys[k] = false; });
document.addEventListener('mousemove', (e) => { if (state !== 'playing') return; input.mouseDX += e.movementX || 0; input.mouseDY += e.movementY || 0; });
canvas.addEventListener('mousedown', (e) => { if (state !== 'playing') return; if (e.button === 0) input.hold.light = 0.0001; if (e.button === 2) input.hold.heavy = 0.0001; });
window.addEventListener('mouseup', (e) => { if (e.button === 0 && input.hold.light) input.release.light = true; if (e.button === 2 && input.hold.heavy) input.release.heavy = true; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
document.getElementById('ui').addEventListener('contextmenu', (e) => { if (!e.target.closest('.item')) e.preventDefault(); });
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (locked) wasLocked = true;
  if (!locked && wasLocked && state === 'playing') pause();
});

ui.screen.addEventListener('click', () => {
  audio.init();
  if (state === 'paused') resume();
  else if (state === 'ended') {
    if (endKind === 'defeat') { showStory('intro'); }
    else { progress.restart(); showTitle(); }                // 엔딩 → 처음으로
  }
});
ui.onContinue = () => { audio.init(); progress = progressOf(character.id); showStory('intro'); };
ui.onNew = () => { audio.init(); ui.hideScreen(); showSelect(); };
ui.onSelect = (ch) => {
  audio.init(); character = ch; progress = progressOf(ch.id);
  try { localStorage.setItem('taisho_last_char', ch.id); } catch (_) { /* ignore */ }
  ui.hideSelect();
  showStory('intro');
};
ui.onStoryDone = () => storyDone();
ui.onDifficulty = (d) => { if (DIFFICULTIES[d]) { difficulty = d; try { localStorage.setItem('taisho_diff', d); } catch (_) { /* ignore */ } ui.logLine(`난이도: ${DIFFICULTIES[d].name}`); } };
ui.onWorld = () => { audio.init(); progress = progressOf(character.id); state = 'world'; ui.hideScreen(); ui.showWorld(progress); };
ui.onWorldClose = () => { if (state === 'world') showTitle(); };
ui.onChapterPick = (n) => {
  audio.init();
  progress.chapter = n; progress.save();
  ui.hideWorld(); ui.hideMenu();
  showStory('intro');
};
ui.onMenuClose = () => closeMenu();
ui.onLearn = () => { player.applySkills(); audio.sfx('start'); };
ui.onResetSkills = () => player.applySkills();
ui.onEquip = () => { player.applySkills(); audio.sfx('parry'); };
ui.onUnequip = () => player.applySkills();
ui.onBuyPotion = () => { if (progress.potions >= POTION_MAX || !progress.spendGold(POTION_PRICE)) return false; progress.addPotion(1, POTION_MAX); audio.sfx('buy'); ui.setProgress(progress); return true; };
ui.onBuy = (it) => {
  const price = RARITIES[it.rarity].price;
  if (progress.items.length >= BAG_MAX) { ui.logLine('가방이 가득 찼습니다', 'warn'); return false; }
  if (!progress.spendGold(price)) return false;
  progress.shop.stock = progress.shop.stock.filter((s) => s.id !== it.id);
  progress.addItem(it, BAG_MAX); progress.save();
  audio.sfx('buy'); ui.setProgress(progress); return true;
};
ui.onSell = (it) => { const p = sellPrice(it); if (!progress.sell(it.id, p)) return false; audio.sfx('coin'); ui.setProgress(progress); return true; };

function lockPointer() {
  if (TOUCH) return;
  try { const p = canvas.requestPointerLock({ unadjustedMovement: true }); if (p && p.catch) p.catch(() => { try { canvas.requestPointerLock(); } catch (_) { /* ignore */ } }); }
  catch (_) { try { canvas.requestPointerLock(); } catch (__) { /* ignore */ } }
}
function toggleSound() { audio.init(); const muted = audio.toggleMute(); if (touch) touch.setSound(muted); ui.logLine(muted ? '소리 꺼짐' : '소리 켜짐'); }

// ---------- 월드 ----------
function buildWorld() {
  chapter = getChapter(progress ? progress.chapter : 1);
  effects = new Effects(scene);
  stage = new Stage(scene, { mobile: TOUCH, theme: chapter.theme, nightLength: chapter.nightLength || 300 });
  player = new Player(scene, character, progress);
  const ps = stage.map.playerStart; player.pos.set(ps.x, 0, ps.z); player.yaw = Math.PI; player.camYaw = 0; player._camInit = false;
  const D = DIFFICULTIES[difficulty];
  enemies = new EnemyManager(scene, { ...chapter, scale: { hp: chapter.scale.hp * D.hp, dmg: chapter.scale.dmg * D.dmg } });
  enemies.stage = stage;
  // 동료
  allies = [];
  // 동료: 저장된 동료 + 이 장에서 함께하는 주(柱)·대원 (주인공 본인 제외), 최대 3명
  const ids = [...new Set([...(chapter.joinAllyStart || []), ...(progress ? progress.allies : [])])].filter((id) => id !== character.id).slice(0, 3);
  ids.forEach((id, i) => { const def = getAlly(id); if (!def) return; const a = new Ally(scene, def, i); a.pos.set(ps.x - 2 + i * 2, 0, ps.z + 1.5); allies.push(a); });
  enemies.onBossDown = (b) => { ui.message('격파', `${b.name.split(' — ')[0]}을(를) 베었다 — 다음 상대가 온다`, 3.5); ui.hideBoss(); audio.sfx('bell'); gainXp(XP_REWARD.boss, '혈귀 격파'); };
  enemies.onBossRegen = () => { ui.message('재생', '무잔은 죽지 않는다 — 햇빛이 뜰 때까지 버텨라', 2.5); };
  enemies.onMessage = (t, s) => ui.message(t, s);
  enemies.onWave = (i) => { audio.sfx('gong'); if (i > 0) gainXp(XP_REWARD.wave, '파도 돌파'); };
  enemies.onBossSpawn = (b) => { ui.showBoss(b.name); effects.addShake(0.6); audio.setMode('boss'); audio.sfx('roar'); };
  enemies.onBossDefeated = () => {
    stage.triggerDawn();
    ui.message('새벽', '도깨비를 베었다 — 남은 도깨비들이 재가 되어 흩어진다', 4);
    endKind = 'clear';
    audio.setMode('dawn'); audio.sfx('bell');
    gainXp(XP_REWARD.night * chapter.id, '밤을 넘김');
  };
  enemies.onKill = (e) => gainXp(Math.round((XP_REWARD[e.kind] || XP_REWARD.melee) * (1 + (chapter.id - 1) * 0.35)), null);
  enemies.onPickup = (k) => onPickup(k);
  elapsed = 0; hitstop = 0; dawnEndTimer = 0; endKind = null; lives = 3; reviveT = 0;
  Object.assign(stats, { kills: 0, maxCombo: 0, specials: 0, time: 0, xpGained: 0, goldGained: 0, itemsGained: 0 });
  // 상점 진열: 장마다 갱신
  if (progress && (!progress.shop || progress.shop.chapter !== chapter.id)) { progress.shop = { chapter: chapter.id, stock: makeShopStock(progress.level) }; progress.save(); }
  ui.hideBoss();
  ui.setName(`${character.name} · 체력`);
  if (touch) touch.setMoves(character.moves);
  ui.setHP(player.hp, player.maxHp); ui.setGauge(0, 100); ui.setCombo(0, 0); ui.setProgress(progress); ui.setAllies(allies);
}
function resetWorld() {
  while (scene.children.length) {
    const o = scene.children[0]; scene.remove(o);
    o.traverse && o.traverse((c) => { if (c.isMesh || c.isPoints) { c.geometry && c.geometry.dispose(); const ms = Array.isArray(c.material) ? c.material : [c.material]; ms.forEach((m) => m && m.dispose && m.dispose()); } });
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
  if (k.type === 'gold') { progress.addGold(k.amount); stats.goldGained += k.amount; audio.sfx('coin'); ui.setProgress(progress); return true; }
  if (k.type === 'potion') {
    if (progress.potions >= POTION_MAX) return false;
    progress.addPotion(1, POTION_MAX); ui.logLine(`<b>회복약</b> 획득 (${progress.potions}/${POTION_MAX})`, 'potion'); audio.sfx('parry');
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

// ---------- 흐름 ----------
function showTitle() {
  state = 'title';
  ui.hideSelect(); ui.hideStory(); ui.hideMenu();
  const pr = lastCharId ? progressOf(character.id) : null;
  const info = pr && (pr.cleared > 0 || pr.level > 1) ? `${character.name} · 제${pr.chapter}장 · Lv.${pr.level}` : null;
  ui.showScreen('title', { continueInfo: info, difficulty, difficulties: DIFFICULTIES });
  audio.setMode('menu');
}
function showSelect() { state = 'select'; ui.hideScreen(); ui.hideMenu(); ui.showSelect(progressOf); audio.setMode('menu'); }
function showStory(kind) {
  state = 'story';
  ui.hideScreen(); ui.hideSelect(); ui.hideMenu(); ui.hideBoss();
  const ch = kind === 'intro' ? getChapter(progress.chapter) : chapter;
  storyNext = kind;
  const cta = kind === 'intro' ? `밤으로 들어간다 (${ch.title})` : ch.final ? '이야기의 끝으로' : '다음 장으로';
  ui.showStory(ch, kind, cta);
  audio.setMode(kind === 'intro' ? 'menu' : 'dawn');
  if (document.pointerLockElement === canvas) document.exitPointerLock();
}
function storyDone() {
  if (state !== 'story') return;
  ui.hideStory();
  if (storyNext === 'intro') { resetWorld(); startGame(); }
  else if (chapter.final) { state = 'ended'; endKind = 'ending'; ui.showScreen('ending', stats); audio.setMode('menu'); }
  else { showStory('intro'); }
}
function startGame() {
  state = 'playing'; wasLocked = false;
  ui.hideScreen(); lockPointer();
  ui.message(`${chapter.title} · ${chapter.name}`, `${character.name} — ${character.style}${allies.length ? ` · 동료 ${allies.map((a) => a.ch.name).join(', ')}` : ''}`, 3.8);
  enemies.waveDelay = 3;
  audio.setMode('night'); audio.sfx('start');
}
function finishChapter() {
  // 장 클리어: 동료 합류/이탈 + 진행 저장
  const joins = [...(chapter.joinAllyStart || []), ...(chapter.joinAlly ? [chapter.joinAlly] : [])].filter((id) => id !== character.id);
  const leaves = chapter.leaveAlly ? [chapter.leaveAlly] : [];
  progress.clearChapter(chapter.id, joins, leaves);
  state = 'story';
  showStory('clear');
}
function pause() { if (state !== 'playing') return; state = 'paused'; ui.showScreen('pause'); if (document.pointerLockElement === canvas) document.exitPointerLock(); }
function resume() { state = 'playing'; ui.hideScreen(); lockPointer(); }
function toggleMenu() { if (state === 'playing' || state === 'paused') openMenu(); else if (state === 'menu') closeMenu(); }
function openMenu() { state = 'menu'; ui.hideScreen(); ui.showMenu(character, progress, progress.points > 0 ? 'skills' : ui.menuTab); if (document.pointerLockElement === canvas) document.exitPointerLock(); }
function closeMenu() { ui.hideMenu(); if (player.alive) resume(); else state = 'dying'; }
function endGame(kind) {
  state = 'ended'; endKind = kind; stats.time = elapsed; ui.hideBoss();
  ui.showScreen(kind, stats); audio.setMode('menu');
  if (document.pointerLockElement === canvas) document.exitPointerLock();
}

// ---------- 루프 ----------
const clock = new THREE.Clock();
const ctx = { player: null, stage: null, effects: null, enemies: [], projectiles: [], pickups: [], allies: [], spawnProjectile: null, sfx: (n) => audio.sfx(n) };
const MOVE_COLORS = { wave: '#8fc8ff', lightning: '#fff27a', quake: '#ffb060', flame: '#ff7a30', wind: '#9affc8' };

function frame() {
  requestAnimationFrame(frame);
  let dt = Math.min(clock.getDelta(), 0.05);
  const playing = state === 'playing';
  if (hitstop > 0) { hitstop -= dt; dt *= 0.08; }
  ctx.player = player; ctx.stage = stage; ctx.effects = effects; ctx.allies = allies;
  ctx.onBossPhase = (b, ph) => { ui.message(ph >= 3 ? '혈귀술 전개' : '혈귀술 개방', `${b.name.split(' — ')[0]}의 공격이 ${ph >= 3 ? '쉴 새 없이 이어진다' : '거세진다'}`, 3); effects.addShake(0.5); };

  if (playing || state === 'dying') {
    if (playing) elapsed += dt;
    player.update(dt, input, ctx);
    for (const a of allies) a.update(dt, ctx);
    enemies.update(dt, ctx);
    for (const ev of player.events) {
      switch (ev.type) {
        case 'damaged': ui.damageFlash(); audio.sfx('hurt'); break;
        case 'special': stats.specials++; audio.sfx('special'); break;
        case 'move': ui.callout(ev.name, ev.tier, MOVE_COLORS[character.special.theme]); break;
        case 'wave': audio.sfx('wave'); break;
        case 'swing': audio.sfx(ev.heavy ? 'swingHeavy' : ev.special ? 'wave' : 'swing'); break;
        case 'hit': audio.sfx(ev.killed ? 'kill' : ev.heavy || ev.special ? 'hitHeavy' : 'hit'); break;
        case 'parry': audio.sfx('parry'); break;
        case 'dash': audio.sfx('dash'); break;
        case 'potion': audio.sfx('bell'); ui.logLine(`<b>회복약</b> 사용 — 남은 ${progress.potions}개`, 'potion'); ui.setProgress(progress); break;
        case 'potionFail': ui.logLine(progress.potions <= 0 ? '회복약이 없습니다' : '체력이 이미 가득합니다', 'warn'); break;
        case 'dead':
          if (playing) {
            audio.sfx('dead');
            if (lives > 1) { lives--; reviveT = 3.0; state = 'dying'; ui.message('쓰러졌다', `재도전 기회 ${lives}회 — 3초 후 다시 일어난다`, 3); }
            else { lives = 0; setTimeout(() => endGame('defeat'), 1400); state = 'dying'; }
          }
          break;
        default: break;
      }
    }
    if (player.hitstop > 0) { hitstop = Math.max(hitstop, player.hitstop); player.hitstop = 0; }
    stats.kills = player.kills + allies.reduce((s, a) => s + a.kills, 0);
    stats.maxCombo = Math.max(stats.maxCombo, player.combo);
    if (playing && stage.isDawn) {
      enemies.dissolveAll(effects);
      if (!endKind) { endKind = 'clear'; ui.message('새벽', chapter.dawnClear ? '해가 떴다 — 도깨비가 햇빛에 타오른다' : '밤을 버텨냈다 — 도깨비들이 재가 되어 흩어진다', 4); ui.hideBoss(); audio.setMode('dawn'); audio.sfx('bell'); gainXp(XP_REWARD.night * chapter.id, '밤을 버팀'); }
      dawnEndTimer += dt;
      if (dawnEndTimer > 6.5) { stats.time = elapsed; finishChapter(); }
    }
  }

  if (stage) {
    stage.update(dt, playing, player.pos);
    effects.update(dt);
    player.updateCamera(camera, dt, effects.shake);
  }
  input.mouseDX = 0; input.mouseDY = 0;
  input.special = input.dash = input.potion = false;

  if (touch) { touch.setActive(playing); touch.setSpecialReady(player.specialReady); touch.setPotions(progress ? progress.potions : 0); touch.setCooldowns(player.cds); touch.showAimHint(!!player.aim); }
  ui.setHP(player.hp, player.maxHp);
  ui.setGauge(player.gauge, player.gaugeMax);
  ui.setCombo(player.combo, player.comboPop);
  ui.setNight(stage.nightProgress, enemies.waveIndex, enemies.totalWaves, stats.kills, stage.isDawn, chapter);
  ui.setDash(player.dashCooldown / Math.max(0.05, player.skill.dashCooldown));
  if (state === 'dying' && reviveT > 0) {
    reviveT -= dt;
    if (reviveT <= 0) {
      // 재도전: 시작 지점에서 전체 체력으로 부활, 잠시 무적
      const ps = stage.map.playerStart;
      player.alive = true; player.hp = player.maxHp; player.invuln = 3; player.blink = 3; player.knock.set(0, 0, 0);
      player.pos.set(ps.x, 0, ps.z); player.parts.body.rotation.x = 0; player.parts.body.position.y = 0;
      effects.burst(player.center, { count: 50, colors: [0xffd9a0, 0xffffff, character.colors.glow], speed: 3, life: 1.0, size: 0.5, gravity: 1, drag: 1, up: 2 });
      audio.sfx('bell');
      state = 'playing'; lockPointer();
      ui.message('다시 일어선다', `남은 재도전 ${lives}회`, 2.5);
    }
  }
  ui.setLives(lives);
  if (playing || state === 'dying') ui.drawMinimap(stage, player, allies, enemies.list, enemies.pickups, chapter);
  if (allies.length && Math.floor(elapsed * 4) !== Math.floor((elapsed - dt) * 4)) ui.setAllies(allies);
  if (enemies.boss && enemies.boss.alive) ui.setBossHP(enemies.boss.hp, enemies.boss.maxHp);
  else if (enemies.boss && !enemies.boss.alive) ui.hideBoss();
  ui.update(dt);
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });

progress = progressOf(character.id);
buildWorld();
showTitle();
frame();

window.__game = {
  get state() { return state; }, get time() { return stage.time; }, get player() { return player; }, get enemies() { return enemies; }, get allies() { return allies; },
  get stage() { return stage; }, get progress() { return progress; }, get chapter() { return chapter; }, get audio() { return audio; }, input, showSelect, openMenu, closeMenu, storyDone, finishChapter, showStory,
};
