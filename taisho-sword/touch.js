// touch.js — 모바일/아이패드 터치 컨트롤: 가상 조이스틱(왼쪽), 시점 드래그·탭 공격(오른쪽), 액션 버튼
export const isTouchDevice = () =>
  ('ontouchstart' in window) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);

const STICK_RADIUS = 58;   // 조이스틱 최대 반경(px)
const LOOK_SENS = 2.4;     // 드래그 → 시점 회전 배율
const TAP_TIME = 220;      // 탭 판정 시간(ms)
const TAP_MOVE = 12;       // 탭 판정 이동 허용(px)

export function setupTouch(input, { onPause, onMenu, onSound } = {}) {
  const layer = document.createElement('div');
  layer.id = 'touch';
  layer.innerHTML = `
    <div id="stick"><div id="stick-base"></div><div id="stick-knob"></div></div>
    <div id="btns">
      <button class="tb tb-heavy" data-act="heavy">강공</button>
      <button class="tb tb-dash" data-act="dash">대시</button>
      <button class="tb tb-light" data-act="light">베기</button>
      <button class="tb tb-potion" data-act="potion">약<span id="tb-potion-n">0</span></button>
    </div>
    <div id="tech-row">
      <button class="tb tech" data-act="tech1"><small>기술</small><span id="tech1-label">제1형</span></button>
      <button class="tb tech" data-act="tech2"><small>기술</small><span id="tech2-label">제3형</span></button>
      <button class="tb tech tb-special" data-act="special"><small>오의</small><span id="tech3-label">비검</span></button>
    </div>
    <div id="top-btns">
      <button id="tb-menu" aria-label="장비/스킬">장비·스킬</button>
      <button id="tb-sound" aria-label="소리">소리</button>
      <button id="tb-pause" aria-label="일시정지">❚❚</button>
    </div>
    <div id="touch-hint">왼쪽: 이동 · 오른쪽: 드래그 시점 / 탭 공격</div>
  `;
  document.body.appendChild(layer);

  const stick = layer.querySelector('#stick');
  const knob = layer.querySelector('#stick-knob');
  const hint = layer.querySelector('#touch-hint');
  let stickId = null, stickX = 0, stickY = 0;
  let lookId = null, lookX = 0, lookY = 0, lookStart = 0, lookMoved = 0;
  let hintTimer = null;

  const setAxis = (dx, dy) => {
    const len = Math.hypot(dx, dy);
    const k = len > STICK_RADIUS ? STICK_RADIUS / len : 1;
    const nx = (dx * k) / STICK_RADIUS, ny = (dy * k) / STICK_RADIUS;
    knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    const dead = 0.12;
    const mag = Math.hypot(nx, ny);
    if (mag < dead) { input.axisX = 0; input.axisY = 0; return; }
    const scale = Math.min(1, (mag - dead) / (1 - dead)) / mag;
    input.axisX = nx * scale;
    input.axisY = -ny * scale; // 화면 위쪽 = 전진
  };

  const onStart = (e) => {
    for (const t of e.changedTouches) {
      const target = t.target;
      if (target.closest && target.closest('.tb, #top-btns')) continue;
      const leftHalf = t.clientX < window.innerWidth * 0.5;
      if (leftHalf && stickId === null) {
        stickId = t.identifier; stickX = t.clientX; stickY = t.clientY;
        stick.style.left = `${stickX}px`; stick.style.top = `${stickY}px`;
        stick.style.display = 'block';
        setAxis(0, 0);
      } else if (lookId === null) {
        lookId = t.identifier; lookX = t.clientX; lookY = t.clientY;
        lookStart = performance.now(); lookMoved = 0;
      }
    }
    if (e.cancelable) e.preventDefault();
  };
  const onMove = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) {
        setAxis(t.clientX - stickX, t.clientY - stickY);
      } else if (t.identifier === lookId) {
        const dx = t.clientX - lookX, dy = t.clientY - lookY;
        lookX = t.clientX; lookY = t.clientY;
        lookMoved += Math.hypot(dx, dy);
        input.mouseDX += dx * LOOK_SENS;
        input.mouseDY += dy * LOOK_SENS;
      }
    }
    if (e.cancelable) e.preventDefault();
  };
  const onEnd = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) {
        stickId = null; input.axisX = 0; input.axisY = 0;
        stick.style.display = 'none';
      } else if (t.identifier === lookId) {
        if (performance.now() - lookStart < TAP_TIME && lookMoved < TAP_MOVE) input.light = true;
        lookId = null;
      }
    }
    if (e.cancelable) e.preventDefault();
  };
  const opts = { passive: false };
  layer.addEventListener('touchstart', onStart, opts);
  layer.addEventListener('touchmove', onMove, opts);
  layer.addEventListener('touchend', onEnd, opts);
  layer.addEventListener('touchcancel', onEnd, opts);

  // 액션 버튼
  for (const b of layer.querySelectorAll('.tb')) {
    const act = b.dataset.act;
    b.addEventListener('touchstart', (e) => { input[act] = true; b.classList.add('on'); if (e.cancelable) e.preventDefault(); e.stopPropagation(); }, opts);
    const off = (e) => { b.classList.remove('on'); if (e.cancelable) e.preventDefault(); e.stopPropagation(); };
    b.addEventListener('touchend', off, opts);
    b.addEventListener('touchcancel', off, opts);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  const bindTop = (id, fn) => {
    const b = layer.querySelector(id);
    b.addEventListener('touchstart', (e) => { if (e.cancelable) e.preventDefault(); e.stopPropagation(); fn && fn(); }, opts);
    b.addEventListener('click', (e) => { e.preventDefault(); fn && fn(); });
  };
  bindTop('#tb-pause', onPause);
  bindTop('#tb-menu', onMenu);
  bindTop('#tb-sound', onSound);

  const api = {
    layer,
    setActive(on) {
      layer.classList.toggle('active', !!on);
      if (!on) { stickId = null; lookId = null; input.axisX = 0; input.axisY = 0; stick.style.display = 'none'; }
      else if (!hintTimer) { hint.classList.add('show'); hintTimer = setTimeout(() => hint.classList.remove('show'), 5000); }
    },
    setSpecialReady(ready) { layer.querySelector('.tb-special').classList.toggle('ready', !!ready); },
    setMoves(moves) {
      const short = (s, d) => (s ? s.split('·').pop().trim() : d);
      layer.querySelector('#tech1-label').textContent = short(moves && moves.l3, '마무리');
      layer.querySelector('#tech2-label').textContent = short(moves && moves.heavy, '강공');
      layer.querySelector('#tech3-label').textContent = short(moves && moves.special, '비검');
    },
    setPotions(n) { layer.querySelector('#tb-potion-n').textContent = n; layer.querySelector('.tb-potion').classList.toggle('empty', n <= 0); },
    setSound(muted) { layer.querySelector('#tb-sound').textContent = muted ? '소리 꺼짐' : '소리 켜짐'; },
  };
  return api;
}
