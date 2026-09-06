// touch.js — 모바일/아이패드 터치 컨트롤: 가상 조이스틱(왼쪽), 시점 드래그·탭 공격(오른쪽), 액션 버튼
export const isTouchDevice = () =>
  ('ontouchstart' in window) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);

const STICK_RADIUS = 58;   // 조이스틱 최대 반경(px)
const LOOK_SENS = 2.4;     // 드래그 → 시점 회전 배율
const TAP_TIME = 220;      // 탭 판정 시간(ms)
const TAP_MOVE = 12;       // 탭 판정 이동 허용(px)

export function setupTouch(input, { onPause } = {}) {
  const layer = document.createElement('div');
  layer.id = 'touch';
  layer.innerHTML = `
    <div id="stick"><div id="stick-base"></div><div id="stick-knob"></div></div>
    <div id="btns">
      <button class="tb tb-special" data-act="special">秘剣</button>
      <button class="tb tb-heavy" data-act="heavy">強</button>
      <button class="tb tb-dash" data-act="dash">閃</button>
      <button class="tb tb-light" data-act="light">斬</button>
    </div>
    <button id="tb-pause" aria-label="일시정지">❚❚</button>
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
      if (target.closest && target.closest('.tb, #tb-pause')) continue;
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
  const pauseBtn = layer.querySelector('#tb-pause');
  pauseBtn.addEventListener('touchstart', (e) => { if (e.cancelable) e.preventDefault(); e.stopPropagation(); onPause && onPause(); }, opts);
  pauseBtn.addEventListener('click', (e) => { e.preventDefault(); onPause && onPause(); });

  const api = {
    layer,
    setActive(on) {
      layer.classList.toggle('active', !!on);
      if (!on) { stickId = null; lookId = null; input.axisX = 0; input.axisY = 0; stick.style.display = 'none'; }
      else if (!hintTimer) { hint.classList.add('show'); hintTimer = setTimeout(() => hint.classList.remove('show'), 5000); }
    },
    setSpecialReady(ready) { layer.querySelector('.tb-special').classList.toggle('ready', !!ready); },
  };
  return api;
}
