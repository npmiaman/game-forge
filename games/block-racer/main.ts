/**
 * Block Racer — drift through an endless voxel world against the clock.
 * Debug params: ?god (timer frozen) ?auto (autopilot) ?cp=3 (start at checkpoint 3) ?tune (sliders)
 */
import * as THREE from 'three';
import { bootThree } from '@kit/three/boot';
import { createInput } from '@kit/input';
import { sfx, music, SONGS, audio } from '@kit/audio';
import { damp, clamp, angleDiff } from '@kit/math';
import { store } from '@kit/save';
import { action } from '@kit/tune';
import { CAR, DRIFT, RACE, TRACK, PHYS, CAM, SLUG } from './config';
import { makeBlocks, BLOCK_COLOR } from './blocks';
import { World, xc, trackAngle, biomeAt, BIOMES, checkpointIndex, type Obstacle } from './world';
import { makeCar } from './car';
import { Debris, EngineSound } from './fx';

const q = new URLSearchParams(location.search);
const save = store(SLUG, { best: 0, bestDist: 0, runs: 0 });

// ------------------------------------------------------------------ setup
await document.fonts.load('16px "Press Start 2P"').catch(() => {});
const { scene, camera, loop, hud, shake } = bootThree({ background: BIOMES[0].sky, fog: { color: BIOMES[0].fog, near: 70, far: 200 }, fov: CAM.baseFov, maxPixelRatio: 1.5 });
camera.far = 400; camera.updateProjectionMatrix();
const input = createInput(document.body);
const B = makeBlocks();
const world = new World(B, scene);
const debris = new Debris(scene);
const car = makeCar();
scene.add(car.root);
const hemi = new THREE.HemisphereLight(0xffffff, 0x445533, 1.3);
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(30, 60, 20);
scene.add(hemi, sun, sun.target);
const skyColor = new THREE.Color(BIOMES[0].sky), fogColor = new THREE.Color(BIOMES[0].fog);
const skyTarget = new THREE.Color(), fogTarget = new THREE.Color(), WHITE = new THREE.Color(0xffffff);
let engine: EngineSound | null = null;

// ------------------------------------------------------------------ HUD
hud.innerHTML = `
  <div class="stat tl"><div class="lbl">DIST</div><div id="dist">0m</div><div class="lbl" style="margin-top:10px">SCORE</div><div id="score">0</div></div>
  <div class="stat tc"><div class="lbl">TIME</div><div id="time" class="big">35</div><div id="cp" class="lbl"></div></div>
  <div class="stat tr"><div class="lbl">COINS</div><div id="coins">0</div></div>
  <div class="stat br"><div id="speed" class="big">0</div><div class="lbl">KM/H</div><div class="boostbar"><div id="charge"></div></div></div>
  <div id="banner" class="banner"></div>
  <div id="popups"></div>
  <div id="flash" class="flash"></div>
  <div class="overlay" id="menu"><h1>BLOCK<br>RACER</h1><p>DRIFT THROUGH A VOXEL WORLD · BEAT THE CLOCK</p>
    <p class="keys">W / ↑ GAS &nbsp; S / ↓ BRAKE + REVERSE &nbsp; A D STEER<br>HOLD SPACE OR SHIFT WHILE TURNING TO DRIFT → RELEASE FOR BOOST<br>SMASH CRATES · GRAB GOLD · AVOID STONE · HIT CHECKPOINTS FOR TIME</p>
    <p id="best"></p><p class="go">PRESS SPACE OR CLICK</p></div>
  <div class="overlay hidden" id="over"><h1 id="overTitle">TIME UP!</h1><p id="final"></p><p id="finalBest"></p><p class="go">SPACE / R TO RACE AGAIN</p></div>
  <div class="overlay hidden" id="pause"><h1>PAUSED</h1><p>ESC RESUME · M MUTE</p></div>`;
const $ = (id: string) => hud.querySelector<HTMLElement>('#' + id)!;
const showBest = () => ($('best').textContent = save.get('best') ? `BEST ${save.get('best').toLocaleString()} · ${save.get('bestDist')}m` : '');
showBest();

function popup(text: string, color = '#fff', big = false) {
  const el = document.createElement('div');
  el.className = 'popup' + (big ? ' bigpop' : '');
  el.textContent = text; el.style.color = color;
  el.style.left = `${45 + Math.random() * 10}%`;
  $('popups').appendChild(el);
  setTimeout(() => el.remove(), 1000);
}
function banner(text: string, sub = '', color = '#ffe14d') {
  const b = $('banner');
  b.innerHTML = `<div style="color:${color}">${text}</div><small>${sub}</small>`;
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
}
function flash(color: string) { const f = $('flash'); f.style.background = color; f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); }

// ------------------------------------------------------------------ state
type State = 'menu' | 'play' | 'over';
let state: State = 'menu';
let paused = false;
const C = { x: 0, t: 0, y: 0, vy: 0, heading: 0, velAngle: 0, speed: 0, grounded: true, ramp: null as Obstacle | null,
  drifting: false, driftDir: 0, charge: 0, boostT: 0, boostLv: 0, invuln: 0, scrapeT: 0, sparkT: 0, air: 0, steerVis: 0, squash: 0 };
const R = { time: RACE.startTime, bonus: 0, coins: 0, smashes: 0, cp: 0, lastBeep: 0, coinChain: 0, coinT: 0, overT: 0 };
let fov = CAM.baseFov;
let fps = 60;

function reset(startT = 0) {
  world.reset();
  Object.assign(C, { x: xc(startT), t: startT, y: 0, vy: 0, heading: trackAngle(startT), velAngle: trackAngle(startT), speed: 0, grounded: true, ramp: null, drifting: false, charge: 0, boostT: 0, invuln: 0, air: 0 });
  Object.assign(R, { time: RACE.startTime, bonus: 0, coins: 0, smashes: 0, cp: checkpointIndex(startT), lastBeep: 0, coinChain: 0, overT: 0 });
  world.update(C.t);
  while (world.update(C.t)) { /* build all chunks up front */ }
  const b = biomeAt(C.t); skyColor.set(b.sky); fogColor.set(b.fog);
}

function start() {
  const cp = Number(q.get('cp') ?? 0);
  reset(cp > 0 ? cp * RACE.checkpointEvery - 40 : 0);
  if (q.has('speed')) C.speed = Number(q.get('speed'));
  state = 'play';
  $('menu').classList.add('hidden'); $('over').classList.add('hidden');
  engine ??= new EngineSound(audio.ctx, audio.output);
  if (!music.playing) music.play(SONGS.chiptune);
  music.setIntensity(1);
  sfx.play('select');
  banner('GO!', biomeAt(C.t).name, '#5dffa0');
}

function gameOver() {
  state = 'over';
  R.overT = 0;
  const dist = Math.floor(C.t), score = dist + R.bonus;
  save.set('runs', save.get('runs') + 1);
  const nb = save.best('best', score); save.best('bestDist', dist);
  sfx.play('bigBoom', { volume: 0.4 }); music.setIntensity(0);
  $('overTitle').textContent = 'TIME UP!';
  $('final').innerHTML = `SCORE ${score.toLocaleString()}<br><small>${dist}m · ${R.coins} COINS · ${R.smashes} SMASHED · CHECKPOINT ${R.cp}</small>`;
  $('finalBest').textContent = nb ? '★ NEW BEST! ★' : `BEST ${save.get('best').toLocaleString()}`;
  setTimeout(() => state === 'over' && $('over').classList.remove('hidden'), 900);
  showBest();
}

action('+30s', () => (R.time += 30));
action('Next checkpoint', () => { const nt = (checkpointIndex(C.t) + 1) * RACE.checkpointEvery - 30; C.t = nt; C.x = xc(nt); C.heading = C.velAngle = trackAngle(nt); });

// ------------------------------------------------------------------ driving

function autopilot() {
  const look = 10 + Math.max(0, C.speed) * 0.35;
  let tx = xc(C.t + look);
  // dodge stone walls: aim for the nearest open lane at the next wall
  let wallDist = Infinity, gapX = tx;
  const walls: Obstacle[] = [];
  for (const o of world.near(C.t + 14, 15)) if (o.kind === 'stone' && o.t > C.t - 0.5) walls.push(o);
  if (walls.length) {
    const wt = Math.min(...walls.map((w) => w.t)), row = walls.filter((w) => Math.abs(w.t - wt) < 1);
    let bd = Infinity;
    for (let off = -TRACK.roadHalf + 1.2; off <= TRACK.roadHalf - 1.2; off += 0.25) {
      const x = xc(wt) + off;
      if (row.some((w) => Math.abs(w.x - x) < 1.8)) continue;
      const d = Math.abs(x - C.x);
      if (d < bd) { bd = d; gapX = x; }
    }
    wallDist = wt - C.t;
    if (wallDist < 25) tx = gapX;
  }
  // judge alignment by where we'll be when we reach the wall, not where we are now
  const projX = C.x + Math.tan(clamp(C.heading, -1.2, 1.2)) * Math.max(0, wallDist);
  const misaligned = Math.abs(projX - gapX) > 1.0;
  const toGap = clamp(angleDiff(C.heading, Math.atan2(gapX - C.x, Math.max(2, wallDist))) * 3, -1, 1);
  // blocked by a wall: reverse (swinging the nose toward the gap) until there's room, then go again
  if (wallDist < 2.8 && misaligned) backing = true;
  if (backing && (wallDist > 8 || !misaligned)) backing = false;
  if (backing) return { steer: -toGap, throttle: 0, brake: true, drift: false };
  const lookT = clamp(wallDist < 25 ? wallDist : look, 3, look);
  const steer = wallDist < 25 ? toGap : clamp(angleDiff(C.heading, Math.atan2(tx - C.x, lookT)) * 3, -1, 1);
  const careful = wallDist < 14 && misaligned;
  return { steer, throttle: careful ? (C.speed < 12 ? 0.6 : 0) : 1, brake: careful && C.speed > 18, drift: false };
}
let backing = false;

function drive(dt: number, ctl: { steer: number; throttle: number; brake: boolean; drift: boolean }) {
  const cp = checkpointIndex(C.t);
  let top = Math.min(CAR.maxSpeedCap, CAR.maxSpeed + cp * CAR.speedPerCheckpoint);
  const off = C.x - xc(C.t), offAbs = Math.abs(off);
  const onShoulder = offAbs > TRACK.roadHalf && C.grounded;
  if (onShoulder) top *= 0.68;
  if (C.boostT > 0) top += CAR.boostSpeed;

  // speed
  if (C.boostT > 0) { C.speed = Math.min(top, C.speed + CAR.boostAccel * dt); C.boostT -= dt; if (C.boostT <= 0) C.boostLv = 0; }
  else if (ctl.throttle > 0) C.speed += CAR.accel * ctl.throttle * dt * (C.speed < 10 ? 1.5 : 1);
  else C.speed -= CAR.coast * dt;
  if (ctl.brake) C.speed -= (C.speed > 0.5 ? CAR.brake : 14) * dt;   // S brakes, then reverses
  else if (C.speed < 0) C.speed = Math.min(0, C.speed + 20 * dt);
  if (C.speed > top) C.speed = damp(C.speed, top, 2.5, dt);
  C.speed = Math.max(-10, C.speed);

  // drift: hold drift while steering at speed → charge; release → boost by tier
  const wantDrift = ctl.drift && C.grounded && C.speed > 16 && (C.drifting || Math.abs(ctl.steer) > 0.3);
  if (wantDrift && !C.drifting) { C.drifting = true; C.driftDir = Math.sign(ctl.steer) || 1; C.charge = 0; C.squash = 0.6; }
  if (C.drifting) {
    if (!wantDrift) {
      const lv = C.charge >= DRIFT.tier3 ? 3 : C.charge >= DRIFT.tier2 ? 2 : C.charge >= DRIFT.tier1 ? 1 : 0;
      if (lv) boost(lv === 3 ? DRIFT.boost3 : lv === 2 ? DRIFT.boost2 : DRIFT.boost1, lv);
      C.drifting = false; C.charge = 0;
    } else C.charge += dt * DRIFT.chargeRate * (0.4 + Math.abs(ctl.steer) * 0.8 + (Math.sign(ctl.steer) === C.driftDir ? 0.3 : 0));
  }

  // steering
  const grip = clamp(C.speed / 12, -1, 1);   // negative when reversing → steering flips like a real car
  let rate = (C.drifting ? CAR.driftTurn : CAR.turnRate) * ctl.steer * grip;
  if (C.drifting) rate += C.driftDir * 0.9 * grip;
  if (!C.grounded) rate *= 0.25;
  C.heading += rate * dt;
  C.velAngle += angleDiff(C.velAngle, C.heading) * Math.min(1, (C.drifting ? CAR.driftGrip : CAR.grip) * dt);
  C.steerVis = damp(C.steerVis, ctl.steer, 10, dt);

  // move
  C.x += Math.sin(C.velAngle) * C.speed * dt;
  C.t += Math.cos(C.velAngle) * C.speed * dt;
  if (C.t < 0) { C.t = 0; C.speed = Math.max(0, C.speed); }   // can't reverse behind the start line

  // track walls (where the hills start)
  const wall = TRACK.roadHalf + TRACK.shoulder - 1.1;
  const nOff = C.x - xc(C.t);
  if (Math.abs(nOff) > wall) {
    C.x = xc(C.t) + Math.sign(nOff) * wall;
    C.speed *= 1 - 1.8 * dt;
    const ta = trackAngle(C.t);
    C.heading += angleDiff(C.heading, ta) * Math.min(1, 6 * dt);
    C.velAngle += angleDiff(C.velAngle, ta) * Math.min(1, 10 * dt);
    C.scrapeT -= dt;
    if (C.scrapeT <= 0) { C.scrapeT = 0.12; sfx.play('hit', { volume: 0.5 }); shake(0.08); debris.burst(C.x + Math.sign(nOff) * 1, 0.6, -C.t, [0xffe14d, 0xffffff], 4, 5, 3, 0.15); }
  }

  // ramps & air
  if (C.grounded) {
    if (C.ramp) {
      const p = (C.t - C.ramp.t) / C.ramp.hd;
      if (Math.abs(C.x - C.ramp.x) > C.ramp.hw + 0.5 || p < 0) C.ramp = null, C.y = 0;
      else if (p >= 1) { C.grounded = false; C.vy = C.speed * PHYS.rampLaunch + PHYS.rampLift; C.y = C.ramp.h; C.ramp = null; C.air = 0; sfx.play('jump', { rate: 0.7 }); }
      else C.y = p * C.ramp.h;
    }
  } else {
    C.air += dt;
    C.vy -= PHYS.gravity * dt;
    C.y += C.vy * dt;
    if (C.y <= 0) {
      const impact = -C.vy;
      C.y = 0; C.vy = 0; C.grounded = true;
      C.squash = Math.min(1, impact / 20);
      shake(Math.min(0.35, impact / 60));
      sfx.play('thud', { volume: Math.min(1, impact / 15) });
      debris.burst(C.x, 0.2, -C.t, [BLOCK_COLOR.road, 0x999999], 10, 6, 2, 0.2);
      if (C.air > 0.6) { const pts = Math.round(C.air * 100); R.bonus += pts; popup(`AIR ${C.air.toFixed(1)}s +${pts}`, '#9effe8'); }
    }
  }

  // dust on the shoulder
  if (onShoulder && C.speed > 8 && Math.random() < 0.5) debris.burst(C.x, 0.2, -C.t + 1.5, [BLOCK_COLOR[biomeAt(C.t).surface]], 1, 2, 3, 0.2);
  // drift sparks, coloured by charge tier
  C.sparkT -= dt;
  if (C.drifting && C.sparkT <= 0) {
    C.sparkT = 0.03;
    const col = C.charge >= DRIFT.tier3 ? 0xd070ff : C.charge >= DRIFT.tier2 ? 0xffa030 : C.charge >= DRIFT.tier1 ? 0x5ff0ff : 0xdddddd;
    const back = 1.6, side = 1.1;
    for (const s of [-1, 1]) debris.burst(C.x - Math.sin(C.heading) * back + Math.cos(C.heading) * side * s, 0.2, -(C.t - Math.cos(C.heading) * back) + Math.sin(C.heading) * side * s, [col], 1, 3, 3, 0.16);
  }
}

function boost(dur: number, lv: number) {
  C.boostT = Math.max(C.boostT, dur); C.boostLv = Math.max(C.boostLv, lv);
  C.speed += 6;
  sfx.play('powerup', { volume: 0.7 }); sfx.play('dash');
  const names = ['', 'BOOST', 'SUPER BOOST', 'ULTRA BOOST'];
  if (lv) popup(names[lv] + '!', lv === 3 ? '#d070ff' : lv === 2 ? '#ffa030' : '#5ff0ff', lv === 3);
  R.bonus += lv * 50;
}

function smash(o: Obstacle, colors: number[], n: number) {
  o.alive = false; o.mesh.visible = false;
  debris.burst(o.x, o.h / 2, -o.t, colors, n, 7 + C.speed * 0.15, 7, 0.32, Math.sin(C.velAngle) * C.speed * 0.4, -Math.cos(C.velAngle) * C.speed * 0.4);
}

function collide() {
  const r = 1.1;
  for (const o of world.near(C.t, 6)) {
    if (o.kind === 'ramp') {
      if (C.grounded && !C.ramp && Math.abs(C.x - o.x) < o.hw && C.t >= o.t && C.t < o.t + 1.5) C.ramp = o;
      continue;
    }
    const dx = Math.abs(C.x - o.x) - o.hw, dt = Math.abs(C.t - o.t) - o.hd;
    if (dx > r || dt > r) continue;
    if (o.kind !== 'coin' && C.y > o.h) continue;
    if (o.kind === 'coin') {
      const airY = (o as any).airY as number | undefined;
      if (airY !== undefined && Math.abs(C.y + 1 - airY) > 2) continue;
      smash(o, [0xf8d23c, 0xfff6a0], 8);
      R.coins++; R.bonus += 100; R.time += RACE.coinTime;
      R.coinChain = R.coinT > 0 ? R.coinChain + 1 : 0; R.coinT = 0.8;
      sfx.play('coin', { freq: 1400 * 2 ** (Math.min(R.coinChain, 12) / 12) });
      popup('+100', '#ffe14d');
    } else if (o.kind === 'boost') {
      if (C.grounded && C.boostT < 1) { boost(1.2, 1); flash('rgba(95,240,255,.25)'); }
    } else if (o.kind === 'crate') {
      smash(o, [BLOCK_COLOR.planks, 0x6e5632, 0xc9a66b], 22);
      C.speed *= RACE.crateKeep; R.smashes++; R.bonus += 50;
      sfx.play('hit'); sfx.play('explode', { volume: 0.35 }); shake(0.18);
      popup('SMASH +50', '#c9a66b');
    } else if (o.kind === 'tnt') {
      smash(o, [0xc83228, 0xffffff, 0x333333, 0xffa030], 40);
      for (const n of world.near(o.t, 7)) if (n.alive && (n.kind === 'crate' || n.kind === 'stone' || n.kind === 'tnt') && Math.hypot(n.x - o.x, n.t - o.t) < 6) { smash(n, [BLOCK_COLOR[n.kind === 'stone' ? 'cobble' : 'planks']], 14); R.bonus += 30; }
      C.grounded = false; C.ramp = null; C.vy = 13; C.air = 0; C.y = Math.max(C.y, 0.1);
      boost(1.0, 2);
      sfx.play('bigBoom'); shake(0.9); flash('rgba(255,160,60,.45)');
      R.bonus += 150; popup('KABOOM +150', '#ffa030', true);
    } else if (o.kind === 'stone') {
      if (C.boostT > 0 && C.boostLv >= 2) {
        // super boost smashes stone
        smash(o, [BLOCK_COLOR.cobble, 0x5a5a5a], 18);
        R.smashes++; R.bonus += 75; sfx.play('explode'); shake(0.3); popup('BREAKTHROUGH +75', '#d070ff');
      } else if (C.invuln <= 0) {
        C.speed *= RACE.crashKeep; C.invuln = 0.5;
        C.t = Math.min(C.t, o.t - o.hd - r - 1.2);
        C.drifting = false; C.charge = 0; C.boostT = 0;
        sfx.play('hurt'); sfx.play('thud'); shake(1); flash('rgba(255,40,40,.4)');
        debris.burst(C.x, 1, -C.t - 1, [BLOCK_COLOR.cobble, 0xe0392b], 16, 6, 6, 0.25);
        music.duck(0.3, 400);
        popup('CRASH!', '#ff4d4d', true);
      }
    }
  }
  // checkpoints
  for (const g of world.gates()) if (!g.passed && C.t >= g.t) {
    g.passed = true;
    if (g.index <= R.cp) continue;   // chunks rebuilt behind the car (after reversing) must not re-award
    R.cp = g.index;
    const top = Math.min(CAR.maxSpeedCap, CAR.maxSpeed + g.index * CAR.speedPerCheckpoint);
    const factor = Math.max(RACE.bonusFactorMin, RACE.bonusFactor - (g.index - 1) * RACE.bonusFactorDecay);
    const bonus = Math.round((RACE.checkpointEvery / top) * factor);
    R.time += bonus; R.bonus += 500;
    const b = biomeAt(C.t);
    banner(`+${bonus}s`, `CHECKPOINT ${g.index} · ${b.name}`, '#5dffa0');
    sfx.notes('select', [0, 4, 7, 12], 0.08);
    music.setIntensity(Math.min(3, 1 + g.index));
    debris.burst(C.x, 4, -C.t, [0xf0c070, 0xffe14d, 0x5dffa0, 0xffffff], 50, 10, 10, 0.3);
  }
}

// ------------------------------------------------------------------ loop

const tmp = new THREE.Vector3();
loop((dt, time) => {
  fps = damp(fps, 1 / Math.max(dt, 1e-3), 3, dt);
  // input
  if (input.pressed('KeyM')) audio.toggleMute();
  if (input.pressed('Escape') && state === 'play') { paused = !paused; $('pause').classList.toggle('hidden', !paused); }
  if (state === 'menu' && (input.pressed('Space') || input.pressed('Enter') || input.mouse.pressed)) start();
  else if (state === 'over' && R.overT > 0.8 && (input.pressed('Space') || input.pressed('KeyR') || input.pressed('Enter') || input.mouse.pressed)) start();
  else if (state === 'play' && input.pressed('KeyR')) start();
  if (paused) { input.endFrame(); return; }

  const ax = input.axis();
  let ctl = { steer: ax.x, throttle: input.down('KeyW') || input.down('ArrowUp') ? 1 : 0, brake: input.down('KeyS') || input.down('ArrowDown'), drift: input.down('Space') || input.down('ShiftLeft') || input.down('ShiftRight') };
  const pad = input.gamepad();
  if (pad) { ctl.throttle = Math.max(ctl.throttle, pad.buttons[7]?.value ?? 0, pad.buttons[0]?.pressed ? 1 : 0); ctl.brake ||= (pad.buttons[6]?.value ?? 0) > 0.3; ctl.drift ||= !!(pad.buttons[5]?.pressed || pad.buttons[2]?.pressed); }
  if (state === 'menu' || q.has('auto')) ctl = autopilot();
  if (state === 'over') ctl = { steer: 0, throttle: 0, brake: true, drift: false };

  drive(dt, ctl);
  if (state === 'over') C.speed = Math.max(0, C.speed);   // roll to a stop, don't reverse
  if (state !== 'over') collide();
  C.invuln -= dt; R.coinT -= dt;
  if (state === 'play') {
    if (!q.has('god')) R.time -= dt;
    const s = Math.ceil(R.time);
    if (R.time < 5.5 && s !== R.lastBeep && s > 0) { R.lastBeep = s; sfx.play('blip', { freq: 880 }); }
    if (R.time <= 0) { R.time = 0; gameOver(); }
  } else if (state === 'over') R.overT += dt;
  if (state === 'menu' && C.t > 2000) reset(0);

  world.update(C.t);
  debris.update(dt);
  for (const o of world.near(C.t, 60)) if (o.spin) {
    o.mesh.rotation.y = time * 2.5 + o.t;
    const baseY = (o as any).airY ?? 1.3;
    o.mesh.position.y = baseY + Math.sin(time * 4 + o.t) * 0.2;
  }

  // car visuals
  const cp = car.root;
  cp.position.set(C.x, C.y, -C.t);
  cp.rotation.y = -C.heading;
  const rampPitch = C.ramp ? Math.atan2(C.ramp.h, C.ramp.hd) : 0;
  car.body.rotation.x = C.grounded ? rampPitch : clamp(C.vy * 0.025, -0.4, 0.4);
  car.body.rotation.z = damp(car.body.rotation.z, -C.steerVis * 0.06 * Math.min(1, C.speed / 20) + (C.drifting ? C.driftDir * 0.08 : 0), 8, dt);
  C.squash = damp(C.squash, 0, 8, dt);
  car.body.scale.set(1 + C.squash * 0.15, 1 - C.squash * 0.2, 1 + C.squash * 0.1);
  car.body.position.y = C.grounded ? Math.sin(time * 30) * 0.02 * Math.min(1, C.speed / 30) : 0;
  car.wheels.forEach((w, i) => { w.rotation.x -= C.speed * dt * 1.2; if (i < 2) w.rotation.y = C.steerVis * 0.4; });
  car.shadow.position.y = 0.03 - C.y; car.shadow.scale.setScalar(Math.max(0.4, 1 - C.y * 0.08));
  const fcol = C.boostLv === 3 ? 0xd070ff : C.boostLv === 2 ? 0xffa030 : 0x5ff0ff;
  car.flames.forEach((f) => { f.visible = C.boostT > 0; (f.material as THREE.MeshBasicMaterial).color.setHex(fcol); f.scale.z = 0.7 + Math.random() * 0.8; });
  if (C.invuln > 0) car.body.visible = Math.floor(C.invuln * 20) % 2 === 0; else car.body.visible = true;

  // camera: chase from behind the direction of travel
  const cd = CAM.distance + C.speed * 0.03, ch = CAM.height + C.y * 0.5;
  const camAng = C.velAngle * 0.7 + C.heading * 0.3;
  tmp.set(C.x - Math.sin(camAng) * cd, ch + C.y * 0.4, -C.t + Math.cos(camAng) * cd);
  // move the camera with the car first (no lag along the track), then smooth the remainder
  camera.position.x += Math.sin(C.velAngle) * C.speed * dt;
  camera.position.z -= Math.cos(C.velAngle) * C.speed * dt;
  camera.position.x = damp(camera.position.x, tmp.x, 6, dt);
  camera.position.y = damp(camera.position.y, tmp.y, 6, dt);
  camera.position.z = damp(camera.position.z, tmp.z, 6, dt);
  camera.lookAt(C.x + Math.sin(C.heading) * 6, 1 + C.y * 0.8, -C.t - Math.cos(C.heading) * 6);
  fov = damp(fov, CAM.baseFov + C.speed * CAM.fovPerSpeed + (C.boostT > 0 ? CAM.boostFov : 0), 4, dt);
  camera.fov = fov; camera.updateProjectionMatrix();
  sun.position.set(C.x + 30, 60, -C.t + 20); sun.target.position.set(C.x, 0, -C.t);

  // biome sky
  const b = biomeAt(C.t);
  skyColor.lerp(skyTarget.set(b.sky), Math.min(1, dt * 1.5));
  fogColor.lerp(fogTarget.set(b.fog), Math.min(1, dt * 1.5));
  (scene.background as THREE.Color).copy(skyColor);
  (scene.fog as THREE.Fog).color.copy(fogColor);
  hemi.color.copy(skyColor).lerp(WHITE, 0.5);
  hemi.groundColor.set(b.name === 'THE NETHER' ? 0x662211 : 0x445533);

  engine?.set(C.speed / CAR.maxSpeed, ctl.throttle, C.drifting, state !== 'menu');

  // HUD
  if (state !== 'menu') {
    $('dist').textContent = `${Math.floor(C.t)}m`;
    $('score').textContent = (Math.floor(C.t) + R.bonus).toLocaleString();
    $('coins').textContent = String(R.coins);
    const te = $('time');
    te.textContent = String(Math.ceil(R.time));
    te.classList.toggle('low', R.time < 6);
    $('cp').textContent = `NEXT CHECKPOINT ${Math.max(0, Math.ceil(((checkpointIndex(C.t) + 1) * RACE.checkpointEvery - C.t)))}m`;
  }
  $('speed').textContent = String(Math.round(Math.abs(C.speed) * 4));
  const ch01 = clamp(C.charge / DRIFT.tier3, 0, 1);
  const cb = $('charge');
  cb.style.width = `${(C.drifting ? ch01 : C.boostT > 0 ? 1 : 0) * 100}%`;
  cb.style.background = C.charge >= DRIFT.tier3 || C.boostLv === 3 ? '#d070ff' : C.charge >= DRIFT.tier2 || C.boostLv === 2 ? '#ffa030' : C.charge >= DRIFT.tier1 || C.boostLv === 1 ? '#5ff0ff' : '#888';
  hud.classList.toggle('playing', state !== 'menu');

  (window as any).__playtest = { state, dist: Math.floor(C.t), score: Math.floor(C.t) + R.bonus, time: +R.time.toFixed(1), cp: R.cp, speed: Math.round(C.speed * 4), coins: R.coins, smashes: R.smashes, biome: b.name, chunks: world.chunks.size, fps: Math.round(fps), drifting: C.drifting, charge: +C.charge.toFixed(2), boost: +C.boostT.toFixed(2) };
  input.endFrame();
});

addEventListener('blur', () => { if (state === 'play' && !paused) { paused = true; $('pause').classList.remove('hidden'); } });
reset(0);
(window as any).__debug = { world, xc, C };
