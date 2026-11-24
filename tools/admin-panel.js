// Atlas Flight Simulator — admin panel. Paste into the browser console while a flight is running.
// Works on `npm run dev`, `npm run preview` and the deployed site. Toggle the panel with the ` key.
(() => {
  if (!window.atlas) { console.error('Admin: window.atlas not found. Open the game page first, then paste this script.'); return; }
  document.getElementById('atlas-admin')?.remove();
  const KT = 1.943844, FT = 3.28084;
  const A = { timeScale: 1, freeze: false, god: false, holdKt: 0, thrustMul: 1 };
  const app = window.atlas;
  const cfg = () => app.session?.physics.config;
  const baseThrust = cfg()?.maxThrustPerEngineN ?? 120000;
  const baseMass = cfg()?.massKg ?? 64000;

  // Wrap the physics step of the current session (re-applied automatically after a new flight starts).
  const patch = () => {
    const p = app.session?.physics;
    if (!p || p.__admin) return;
    p.__admin = true;
    const step = p.step.bind(p);
    p.step = (dt, input) => {
      const s = p.state;
      if (A.freeze) { p.previousPosition.copy(s.position); p.previousQuaternion.copy(s.quaternion); return; }
      step(dt * A.timeScale, input);
      if (A.god) s.crashed = false;
      if (A.holdKt > 0 && s.velocity.lengthSq() > 1) s.velocity.setLength(A.holdKt / KT);
    };
    const emit = p.emit;
    p.emit = (e) => { if (A.god && e.type === 'crash') return; emit(e); };
  };

  const S = () => app.session?.physics.state;
  const vec = (x, y, z) => S().position.clone().set(x, y, z);
  const settle = () => { const p = app.session.physics; p.previousPosition.copy(p.state.position); p.previousQuaternion.copy(p.state.quaternion); };
  const setThrottle = (v) => { app.input.state.throttle = Math.min(1, Math.max(0, v)); };

  const actions = {
    speed(kt) { const s = S(); s.velocity.set(0, 0, -kt / KT).applyQuaternion(s.quaternion); },
    altitude(ft) {
      const s = S(); s.position.y = Math.max(3.3, ft / FT - app.session.frame.originElevationMslM);
      if (s.velocity.length() < 60) actions.speed(220);
      s.angularVelocity.set(0, 0, 0); settle();
    },
    heading(deg) {
      const s = S(); const speed = s.velocity.length();
      s.quaternion.setFromAxisAngle(vec(0, 1, 0), -deg * Math.PI / 180);
      s.angularVelocity.set(0, 0, 0); s.velocity.set(0, 0, -speed).applyQuaternion(s.quaternion); settle();
    },
    levelOff() { const s = S(); actions.heading(s.headingDeg); },
    approach() {
      const f = app.session.frame, rw = f.selectedRunway, i = f.selection.endIndex;
      const dir = i === 0 ? rw.direction.clone() : rw.direction.clone().negate();
      const pos = rw.ends[i].clone().addScaledVector(dir, -10000); pos.y = 10000 * Math.tan(3 * Math.PI / 180) + 15;
      const p = app.session.physics; p.reset({ position: pos, headingDeg: rw.headings[i], airborneSpeedKt: 150 });
      Object.assign(p.state, { gearDown: true, gearPosition: 1, flapIndex: 2, flapPosition: 1 });
      p.state.quaternion.multiply(S().quaternion.clone().setFromAxisAngle(vec(1, 0, 0), -2.5 * Math.PI / 180)); settle();
      setThrottle(0.42);
    },
    runway() { app.session.restart(); setThrottle(0); },
    fixAircraft() { const s = S(); s.crashed = false; app.pendingCrash = null; app.ui.hideAllModals(); if (app.states.state === 'PAUSED') document.querySelector('[data-a=resume]')?.click(); },
  };

  const el = document.createElement('div');
  el.id = 'atlas-admin';
  el.style.cssText = 'position:fixed;left:14px;top:110px;z-index:99999;width:270px;padding:12px;background:rgba(8,14,26,.92);border:1px solid #5fd4ff55;border-radius:12px;color:#e8eef7;font:12px ui-monospace,Menlo,monospace;box-shadow:0 10px 40px #0008;user-select:none';
  const row = (label, html) => `<div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin:5px 0"><span style="color:#8fa1b8">${label}</span>${html}</div>`;
  const num = (id, val, w = 70) => `<input id="adm-${id}" type="number" value="${val}" style="width:${w}px;background:#0d1729;color:#fff;border:1px solid #33445c;border-radius:6px;padding:3px 5px">`;
  const btn = (id, text) => `<button id="adm-${id}" style="background:#1a2a44;color:#fff;border:1px solid #33445c;border-radius:6px;padding:4px 8px;cursor:pointer">${text}</button>`;
  const rng = (id, min, max, step, val) => `<input id="adm-${id}" type="range" min="${min}" max="${max}" step="${step}" value="${val}" style="width:120px">`;
  const chk = (id) => `<input id="adm-${id}" type="checkbox">`;
  el.innerHTML = `
    <div id="adm-drag" style="display:flex;justify-content:space-between;cursor:move;margin-bottom:6px"><b style="color:#5fd4ff;letter-spacing:.15em">ADMIN PANEL</b><span id="adm-x" style="cursor:pointer">✕</span></div>
    <div id="adm-live" style="background:#050b14;border-radius:8px;padding:6px 8px;line-height:1.5;margin-bottom:6px"></div>
    ${row('Speed kt', num('spd', 250) + btn('spd-go', 'Set'))}
    ${row('Altitude ft', num('alt', 5000) + btn('alt-go', 'Set'))}
    ${row('Heading °', num('hdg', 90) + btn('hdg-go', 'Set'))}
    ${row('Hold speed kt (0 = off)', num('hold', 0, 60))}
    ${row('Throttle', rng('thr', 0, 1, 0.01, 0))}
    ${row('Thrust ×<span id="adm-tm">1</span>', rng('thrust', 0.2, 6, 0.1, 1))}
    ${row('Mass t <span id="adm-mv"></span>', rng('mass', 20, 120, 1, Math.round(baseMass / 1000)))}
    ${row('Time ×<span id="adm-ts">1</span>', rng('time', 0.1, 3, 0.1, 1))}
    ${row('Wind kt / from °', num('wspd', 0, 50) + num('wdir', 270, 50))}
    ${row('Flight assist', rng('assist', 0, 1, 0.05, app.session?.physics.assist ?? 0.7))}
    ${row('Camera FOV', rng('fov', 30, 100, 1, 60))}
    ${row('Freeze aircraft', chk('freeze'))}
    ${row('God mode (no crash)', chk('god'))}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px">
      ${btn('appr', 'Final approach')}${btn('rwy', 'Back to runway')}${btn('lvl', 'Wings level')}${btn('fix', 'Repair / uncrash')}
      ${btn('gear', 'Gear')}${btn('flaps', 'Flaps')}
    </div>
    <div style="color:#8fa1b8;margin-top:6px">Toggle: \` key</div>`;
  document.body.appendChild(el);
  const $ = (id) => el.querySelector('#adm-' + id);
  const val = (id) => Number($(id).value);
  const need = (fn) => () => { if (!app.session) return console.warn('Admin: start a flight first'); patch(); fn(); };

  $('spd-go').onclick = need(() => actions.speed(val('spd')));
  $('alt-go').onclick = need(() => actions.altitude(val('alt')));
  $('hdg-go').onclick = need(() => actions.heading(val('hdg')));
  $('hold').oninput = () => { A.holdKt = val('hold'); };
  $('thr').oninput = () => setThrottle(val('thr'));
  $('thrust').oninput = () => { A.thrustMul = val('thrust'); $('tm').textContent = A.thrustMul.toFixed(1); if (cfg()) cfg().maxThrustPerEngineN = baseThrust * A.thrustMul; };
  $('mass').oninput = () => { if (cfg()) cfg().massKg = val('mass') * 1000; };
  $('time').oninput = () => { A.timeScale = val('time'); $('ts').textContent = A.timeScale.toFixed(1); };
  const wind = () => { const p = app.session?.physics; if (!p) return; const v = val('wspd') / KT, d = val('wdir') * Math.PI / 180; p.wind.set(-Math.sin(d) * v, 0, Math.cos(d) * v); };
  $('wspd').oninput = wind; $('wdir').oninput = wind;
  $('assist').oninput = () => { if (app.session) app.session.physics.assist = val('assist'); };
  $('fov').oninput = () => { if (app.session) app.session.camera.fov = val('fov'); };
  $('freeze').onchange = () => { patch(); A.freeze = $('freeze').checked; };
  $('god').onchange = () => { patch(); A.god = $('god').checked; };
  $('appr').onclick = need(actions.approach);
  $('rwy').onclick = need(actions.runway);
  $('lvl').onclick = need(actions.levelOff);
  $('fix').onclick = need(actions.fixAircraft);
  $('gear').onclick = need(() => { const s = S(); s.gearDown = !s.gearDown; });
  $('flaps').onclick = need(() => app.session.physics.cycleFlaps());

  // Dragging and toggle key.
  let drag = null;
  $('drag').onmousedown = (e) => { drag = [e.clientX - el.offsetLeft, e.clientY - el.offsetTop]; };
  const move = (e) => { if (drag) { el.style.left = e.clientX - drag[0] + 'px'; el.style.top = e.clientY - drag[1] + 'px'; } };
  const up = () => { drag = null; };
  const key = (e) => { if (e.key === '`') el.style.display = el.style.display === 'none' ? '' : 'none'; };
  window.addEventListener('mousemove', move); window.addEventListener('mouseup', up); window.addEventListener('keydown', key);

  const timer = setInterval(() => {
    const s = S();
    if (app.session) patch();
    if (A.god) app.pendingCrash = null;
    $('mv').textContent = cfg() ? (cfg().massKg / 1000).toFixed(0) : '';
    $('live').innerHTML = s
      ? `IAS ${(s.indicatedAirspeed * KT).toFixed(0)} kt · GS ${(s.groundSpeed * KT).toFixed(0)}<br>ALT ${(s.altitudeMslM * FT).toFixed(0)} ft · VS ${(s.verticalSpeed * 196.85).toFixed(0)}<br>HDG ${s.headingDeg.toFixed(0)}° · AoA ${(s.alphaRad * 57.3).toFixed(1)}°<br>THR ${(s.throttle * 100).toFixed(0)}% · ${s.onGround ? 'GROUND' : 'AIR'}${s.stalled ? ' · STALL' : ''}${s.crashed ? ' · CRASHED' : ''}`
      : 'No flight running — launch a flight.';
    if (s && document.activeElement !== $('thr')) $('thr').value = app.input.state.throttle;
  }, 150);

  $('x').onclick = () => {
    clearInterval(timer); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); window.removeEventListener('keydown', key);
    if (cfg()) { cfg().maxThrustPerEngineN = baseThrust; cfg().massKg = baseMass; }
    Object.assign(A, { timeScale: 1, freeze: false, god: false, holdKt: 0 });
    el.remove();
  };
  console.log('%cAdmin panel ready — press ` to show/hide', 'color:#5fd4ff;font-weight:bold');
})();
