/**
 * Blast Ball — 3v3 football where everyone is armed.
 * Score goals; knock out the ball carrier; grab loot and airdrops; throw gloo walls; stay inside the zone.
 * Debug: ?god ?auto (AI plays for you) ?time=30 ?nozone ?gun=rocket ?freelook ?tune
 */
import * as THREE from 'three';
import { bootThree } from '@kit/three/boot';
import { createInput } from '@kit/input';
import { Debris } from '@kit/three/debris';
import { sfx, music, SONGS, audio } from '@kit/audio';
import { clamp, damp, lerp } from '@kit/math';
import { Rng } from '@kit/rng';
import { store } from '@kit/save';
import { action } from '@kit/tune';
import { SLUG, PITCH, MATCH, ZONE, BALL, HEALTH, GLOO, AI } from './config';
import { Stadium, HALF_L, HALF_W, TEAM_COLOR, TEAM_NAME } from './pitch';
import { Player, Ball, aiThink, type AiWorld } from './actors';
import { WEAPONS, LOOT_COLOR, LOOT_LABEL, Tracers, Gloo, Rocket, makeCrate, type WeaponId, type LootKind, type Loot } from './weapons';

const q = new URLSearchParams(location.search);
const save = store(SLUG, { wins: 0, losses: 0, draws: 0, goals: 0, knocks: 0, best: 0 });
const rng = new Rng(Date.now());

// ---------------------------------------------------------------- sounds
sfx.define('pistol', { volume: 0.32, randomness: 0.08, freq: 620, release: 0.08, shape: 2, slide: -22, noise: 0.25, filter: -4000 });
sfx.define('smg', { volume: 0.2, randomness: 0.1, freq: 820, release: 0.05, shape: 2, slide: -30, noise: 0.35, filter: -5000 });
sfx.define('shotgun', { volume: 0.7, randomness: 0.08, freq: 190, sustain: 0.02, release: 0.25, shape: 4, slide: -3, noise: 1, filter: -2500 });
sfx.define('rocketfire', { volume: 0.5, freq: 140, attack: 0.02, sustain: 0.18, release: 0.3, shape: 4, slide: 3, noise: 0.7 });
sfx.define('kick', { volume: 0.8, randomness: 0.1, freq: 120, release: 0.1, shape: 0, slide: -6, noise: 0.35 });
sfx.define('whistle', { volume: 0.45, freq: 2300, sustain: 0.32, release: 0.05, shape: 1, tremolo: 0.3, modulation: 30 });
sfx.define('hitmark', { volume: 0.3, freq: 1900, release: 0.03, shape: 1 });
sfx.define('gloo', { volume: 0.5, freq: 900, attack: 0.01, sustain: 0.1, release: 0.3, shape: 1, slide: 8, pitchJump: 300, pitchJumpTime: 0.05 });
sfx.define('crate', { volume: 0.7, freq: 80, sustain: 0.04, release: 0.25, shape: 4, noise: 0.6, filter: -1000 });

// ---------------------------------------------------------------- scene
await document.fonts.load('16px "Press Start 2P"').catch(() => {});
const { scene, camera, renderer, loop, hud, shake } = bootThree({ background: 0x86bfff, fog: { color: 0xa9d2ff, near: 90, far: 230 }, fov: 70, shadows: true, maxPixelRatio: 1.5 });
camera.far = 500; camera.updateProjectionMatrix();
scene.add(new THREE.HemisphereLight(0xddeeff, 0x3a5a30, 1.1));
const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
sun.position.set(30, 60, 25); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, near: 10, far: 150 });
sun.shadow.camera.updateProjectionMatrix();
scene.add(sun);
const stadium = new Stadium(scene);
const ball = new Ball(scene);
const tracers = new Tracers(scene);
const debris = new Debris(scene, 600, new THREE.MeshBasicMaterial({ color: 0xffffff }));
const input = createInput(renderer.domElement);

// ---------------------------------------------------------------- crowd ambience (continuous)
const crowd = (() => {
  const ctx = audio.ctx, len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  let last = 0; for (let i = 0; i < len; i++) { last = last * 0.97 + (Math.random() * 2 - 1) * 0.03; d[i] = last * 6; }
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.6;
  const g = ctx.createGain(); g.gain.value = 0;
  src.connect(f); f.connect(g); g.connect(audio.output); src.start();
  let level = 0.08;
  return {
    set(v: number) { level = v; },
    update(dt: number, excite: number) { g.gain.setTargetAtTime(level + excite * 0.5, ctx.currentTime, 0.15); void dt; },
  };
})();

// ---------------------------------------------------------------- teams
const human = new Player(scene, 'YOU', 0, 10, 'field', true);
const players = [
  human,
  new Player(scene, 'RICO', 0, 7, 'field'),
  new Player(scene, 'OLA', 0, 1, 'keeper'),
  new Player(scene, 'VIPER', 1, 9, 'field'),
  new Player(scene, 'NOX', 1, 11, 'field'),
  new Player(scene, 'BRICK', 1, 1, 'keeper'),
];
let glooWalls: Gloo[] = [];
let rockets: Rocket[] = [];
let loot: Loot[] = [];

// ---------------------------------------------------------------- HUD
hud.innerHTML = `
  <div id="zoneTint"></div>
  <div class="score"><span class="o" id="s0">0</span><span id="clock">3:00</span><span class="b" id="s1">0</span></div>
  <div id="sub"></div>
  <canvas id="map" width="138" height="210"></canvas>
  <div id="feed"></div>
  <div id="cross"><i></i><i></i><i></i><i></i></div><div id="hitx">✕</div>
  <div id="charge"><div id="chargeFill"></div></div>
  <div id="dmg"></div>
  <div class="status"><div class="bar armor"><div id="ar"></div></div><div class="bar hp"><div id="hp"></div></div><div class="bar st"><div id="st"></div></div></div>
  <div class="weap"><div id="wname">PISTOL</div><div id="ammo">∞</div><div id="gloo">GLOO ×2 [G]</div></div>
  <div id="banner"></div><div id="note"></div><div id="ballhint"></div>
  <div class="ov" id="menu"><h1>BLAST<span>BALL</span></h1><p class="sub">3v3 football. Everyone's armed.</p>
    <p class="keys">WASD move · SHIFT sprint · MOUSE aim · LEFT CLICK shoot<br>HOLD RIGHT CLICK / SPACE to charge a kick (aim up to chip) · G gloo wall · Q swap gun<br>Knock out the ball carrier · grab loot & airdrops · stay out of the blue zone</p>
    <p id="record" class="dim"></p><p class="go">CLICK TO KICK OFF</p></div>
  <div class="ov hidden" id="pause"><h1>PAUSED</h1><p class="go">CLICK TO RESUME</p><p class="dim">M mute</p></div>
  <div class="ov hidden" id="end"><h1 id="endTitle"></h1><p id="endScore" class="big"></p><p id="endStats"></p><p class="go">CLICK OR R FOR A REMATCH</p></div>`;
const $ = (id: string) => hud.querySelector<HTMLElement>('#' + id)!;
const mapCtx = ($('map') as HTMLCanvasElement).getContext('2d')!;
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

let bannerT = 0, noteT = 0, hitT = 0;
function banner(html: string, secs = 2.2) { const b = $('banner'); b.innerHTML = html; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); bannerT = secs; }
function note(text: string, secs = 2.5, color = '#fff') { const n = $('note'); n.textContent = text; n.style.color = color; n.style.opacity = '1'; noteT = secs; }
function feed(html: string) {
  const el = document.createElement('div'); el.innerHTML = html; $('feed').prepend(el);
  setTimeout(() => el.classList.add('fade'), 4000); setTimeout(() => el.remove(), 4600);
  while ($('feed').children.length > 6) $('feed').lastElementChild!.remove();
}
const tagName = (p: Player) => `<b style="color:${hex(TEAM_COLOR[p.team])}">${p.name}</b>`;
const tmpV = new THREE.Vector3();
function damageNumber(x: number, y: number, z: number, text: string, color: string) {
  tmpV.set(x, y, z).project(camera);
  if (tmpV.z > 1) return;
  const el = document.createElement('div'); el.className = 'dn'; el.textContent = text; el.style.color = color;
  el.style.left = `${(tmpV.x * 0.5 + 0.5) * 100}%`; el.style.top = `${(-tmpV.y * 0.5 + 0.5) * 100}%`;
  $('dmg').appendChild(el); setTimeout(() => el.remove(), 700);
}

// ---------------------------------------------------------------- match state
type State = 'menu' | 'kickoff' | 'play' | 'goal' | 'over' | 'paused';
let state: State = 'menu';
let resumeState: State = 'play';
const M = { length: MATCH.seconds, time: MATCH.seconds, score: [0, 0], golden: false, kickoffT: 0, goalT: 0, airdropT: MATCH.airdropEvery, lootT: 4, zoneHalf: HALF_W, excite: 0, slow: 1 };
const cam = { yaw: 0, pitch: -0.12 };
let charge = -1;   // kick charge time, -1 = not charging

function zoneHalfAt(elapsed: number) {
  if (q.has('nozone')) return HALF_W;
  const t = clamp((elapsed / M.length - ZONE.shrinkStart) / (1 - ZONE.shrinkStart), 0, 1);
  return lerp(ZONE.startHalfWidth, ZONE.endHalfWidth, t);
}

function kickoff(teamWithBall: number) {
  state = 'kickoff'; M.kickoffT = MATCH.kickoffDelay;
  const spots: Record<string, [number, number]> = {
    'YOU': [-4, 6], 'RICO': [7, 12], 'OLA': [0, HALF_L - 2], 'VIPER': [4, -6], 'NOX': [-7, -12], 'BRICK': [0, -HALF_L + 2],
  };
  for (const p of players) { const [x, z] = spots[p.name]; p.spawn(x, z); p.special = p.special && p.ammo > 0 ? p.special : null; }
  ball.place(0, 0);
  const taker = players.find((p) => p.team === teamWithBall && p.role === 'field' && (teamWithBall === 0 ? p === human : true))!;
  taker.x = 0; taker.z = teamWithBall === 0 ? 1.4 : -1.4; taker.yaw = teamWithBall === 0 ? 0 : Math.PI;
  if (teamWithBall === 0) cam.yaw = 0;
  glooWalls.forEach((w) => scene.remove(w.mesh)); glooWalls = [];
  banner(M.golden ? 'GOLDEN GOAL<br><small>next goal wins</small>' : `<small>${TEAM_NAME[teamWithBall]} KICK OFF</small>`, MATCH.kickoffDelay);
}

function startMatch() {
  M.time = M.length = Number(q.get('time') ?? MATCH.seconds); M.score = [0, 0]; M.golden = false;
  M.airdropT = MATCH.airdropEvery; M.lootT = 4;
  for (const p of players) { Object.assign(p, { goals: 0, knocks: 0, deaths: 0, armor: 0, gloo: GLOO.carry, special: null, weapon: 'pistol' as WeaponId }); }
  loot.forEach((l) => scene.remove(l.mesh)); loot = [];
  rockets.forEach((r) => scene.remove(r.mesh)); rockets = [];
  if (q.get('gun')) human.equip(q.get('gun') as WeaponId);
  $('menu').classList.add('hidden'); $('end').classList.add('hidden');
  hud.classList.add('playing');
  if (!music.playing) music.play(SONGS.synthwave);
  music.setIntensity(1);
  crowd.set(0.06);
  kickoff(0);
  lockPointer();
}

function endMatch() {
  state = 'over';
  document.exitPointerLock?.();
  hud.classList.remove('playing');
  const [a, b] = M.score, res = a > b ? 'win' : a < b ? 'loss' : 'draw';
  save.set(res === 'win' ? 'wins' : res === 'loss' ? 'losses' : 'draws', save.get(res === 'win' ? 'wins' : res === 'loss' ? 'losses' : 'draws') + 1);
  save.set('goals', save.get('goals') + human.goals); save.set('knocks', save.get('knocks') + human.knocks);
  $('endTitle').textContent = res === 'win' ? 'VICTORY' : res === 'loss' ? 'DEFEAT' : 'DRAW';
  $('endTitle').style.color = res === 'win' ? '#7dff9a' : res === 'loss' ? '#ff5050' : '#ffd060';
  $('endScore').innerHTML = `<span style="color:${hex(TEAM_COLOR[0])}">${a}</span> – <span style="color:${hex(TEAM_COLOR[1])}">${b}</span>`;
  $('endStats').innerHTML = `Your goals ${human.goals} · knocks ${human.knocks} · knocked ${human.deaths}×<br>Record: ${save.get('wins')}W ${save.get('draws')}D ${save.get('losses')}L`;
  $('end').classList.remove('hidden');
  sfx.play('whistle'); setTimeout(() => sfx.play('whistle'), 350); setTimeout(() => sfx.play('whistle', { rate: 0.8 }), 700);
  crowd.set(res === 'win' ? 0.3 : 0.1);
  showRecord();
}
function showRecord() { $('record').textContent = save.get('wins') + save.get('losses') + save.get('draws') ? `Record ${save.get('wins')}W ${save.get('draws')}D ${save.get('losses')}L · ${save.get('goals')} goals · ${save.get('knocks')} knocks` : ''; }

// ---------------------------------------------------------------- combat
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
interface Hit { t: number; player?: Player; head?: boolean; gloo?: Gloo }
function rayHit(o: THREE.Vector3, d: THREE.Vector3, range: number, shooter: Player | null): Hit {
  let best: Hit = { t: range };
  for (const p of players) {
    if (!p.alive || p === shooter || (shooter && p.team === shooter.team)) continue;
    // vertical cylinder r=0.45, y 0..1.95
    const ox = o.x - p.x, oz = o.z - p.z, a = d.x * d.x + d.z * d.z, b = 2 * (ox * d.x + oz * d.z), c = ox * ox + oz * oz - 0.45 * 0.45;
    const disc = b * b - 4 * a * c;
    if (disc < 0 || a < 1e-6) continue;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    if (t < 0 || t >= best.t) continue;
    const y = o.y + d.y * t;
    if (y < 0 || y > 1.95) continue;
    best = { t, player: p, head: y > 1.55 };
  }
  for (const w of glooWalls) { if (!w.alive) continue; const t = w.ray(o, d); if (t < best.t) best = { t, gloo: w }; }
  if (d.y < -1e-3) { const tg = -o.y / d.y; if (tg > 0 && tg < best.t) best = { t: tg }; }
  return best;
}

function knock(victim: Player, by: Player | null, weapon: string, head: boolean) {
  if (by) by.knocks++;
  victim.respawnT = MATCH.respawn;
  feed(`${by ? tagName(by) : '<b>ZONE</b>'} <span class="w">${head ? '⊕ HEADSHOT ' : ''}${weapon}</span> ${tagName(victim)}`);
  debris.burst(victim.x, 1.1, victim.z, [TEAM_COLOR[victim.team], 0xffffff], 18, 4, 4, 0.12);
  if (victim.special && victim.ammo > 0) spawnLoot(victim.special as LootKind, victim.x + 0.8, victim.z, false);   // drop their gun, Free Fire style
  victim.special = null; victim.weapon = 'pistol';
  if (ball.owner === victim) { ball.owner = null; ball.vel.set((Math.random() - 0.5) * 4, 3, (Math.random() - 0.5) * 4); }
  if (by === human) { sfx.play('coin'); note(`KNOCKED ${victim.name}${head ? ' — HEADSHOT' : ''}`, 1.6, '#ffd060'); }
  if (victim === human) { sfx.play('hurt'); shake(0.4); note(`KNOCKED BY ${by?.name ?? 'THE ZONE'} — back in ${MATCH.respawn}s`, MATCH.respawn, '#ff6060'); }
  M.excite = Math.max(M.excite, 0.3);
}

function shoot(p: Player, tx: number, ty: number, tz: number) {
  if (!p.alive || p.fireT > 0 || (state !== 'play' && state !== 'menu')) return;
  const w = WEAPONS[p.weapon];
  p.fireT = 1 / (w.rate * (p.human && !q.has('auto') ? 1 : AI.fireRateMul));
  const o = new THREE.Vector3(); p.muzzle.getWorldPosition(o);
  const base = new THREE.Vector3(tx - o.x, ty - o.y, tz - o.z).normalize();
  const vol = state === 'menu' ? 0.08 : p === human ? 1 : 0.4 * clamp(1 - Math.hypot(p.x - human.x, p.z - human.z) / 50, 0, 1);
  if (p.weapon === 'rocket') {
    rockets.push(new Rocket(scene, o.clone(), base.clone().multiplyScalar(34), p, p.team));
    sfx.play('rocketfire', { volume: vol });
  } else {
    sfx.play(p.weapon === 'shotgun' ? 'shotgun' : p.weapon === 'smg' ? 'smg' : 'pistol', { volume: vol });
    for (let i = 0; i < w.pellets; i++) {
      const d = base.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2 * w.spread, (Math.random() - 0.5) * 2 * w.spread, (Math.random() - 0.5) * 2 * w.spread)).normalize();
      const h = rayHit(o, d, w.range, p);
      const end = o.clone().addScaledVector(d, h.t);
      tracers.add(o, end, p.team === 0 ? 0xffd27a : 0x9fd0ff);
      if (h.player) {
        const aiShooter = p !== human || q.has('auto');
        const dmg = Math.round(w.damage * (h.head ? 1.6 : 1) * (aiShooter ? AI.damageMul : 1) * (q.has('god') && h.player === human ? 0 : 1));
        const knocked = h.player.damage(dmg, p);
        if (p === human) { hitT = 0.15; $('hitx').style.color = h.head ? '#ff4040' : '#fff'; sfx.play('hitmark', { freq: h.head ? 2600 : 1900 }); damageNumber(end.x, end.y + 0.3, end.z, String(dmg), h.head ? '#ff5050' : '#fff'); }
        if (h.player === human) { shake(0.12); }
        debris.burst(end.x, end.y, end.z, [0xff3030], 3, 2, 1, 0.06);
        if (knocked) knock(h.player, p, w.name, !!h.head);
      } else if (h.gloo) { h.gloo.hp -= w.damage; debris.burst(end.x, end.y, end.z, [0xbff4ff], 3, 2, 2, 0.08); }
      else debris.burst(end.x, Math.max(0.05, end.y), end.z, [0x8a7a5a], 2, 1.5, 2, 0.05);
    }
  }
  if (p.special && p.weapon === p.special) { p.ammo--; if (p.ammo <= 0) { p.special = null; p.weapon = 'pistol'; if (p === human) note('Out of ammo — back to pistol', 1.5); } }
}

function explode(pos: THREE.Vector3, owner: Player | null, team: number) {
  sfx.play('bigBoom', { volume: clamp(1.2 - pos.distanceTo(camera.position) / 60, 0.15, 1) });
  shake(clamp(1 - pos.distanceTo(camera.position) / 30, 0.1, 0.8));
  debris.burst(pos.x, pos.y + 0.3, pos.z, [0xff7a20, 0xffd040, 0x444444], 40, 9, 9, 0.22);
  for (const p of players) {
    if (!p.alive) continue;
    const d = Math.hypot(p.x - pos.x, p.z - pos.z);
    if (d < 4.5) {
      p.vx += ((p.x - pos.x) / (d || 1)) * 14; p.vz += ((p.z - pos.z) / (d || 1)) * 14;
      if (p.team !== team && !(q.has('god') && p === human) && p.damage(Math.round(WEAPONS.rocket.damage * (1 - d / 5)), owner)) knock(p, owner, 'ROCKET', false);
    }
  }
  // rockets launch the ball
  const bd = ball.pos.distanceTo(pos);
  if (bd < 5) { if (ball.owner) ball.owner = null; ball.vel.add(ball.pos.clone().sub(pos).normalize().multiplyScalar(26 * (1 - bd / 6))).add(new THREE.Vector3(0, 8, 0)); }
  for (const w of glooWalls) if (w.alive && Math.hypot(w.x - pos.x, w.z - pos.z) < 4) w.hp -= 80;
}

function kickBall(p: Player, dx: number, dz: number, power: number, lift: number) {
  if (state !== 'play' && state !== 'menu') return;
  const near = Math.hypot(ball.pos.x - p.x, ball.pos.z - p.z) < BALL.controlRange * 1.7 && ball.pos.y < 1.6;
  if (ball.owner !== p && !near) return;
  ball.kick(p, dx, dz, power, lift);
  sfx.play('kick', { volume: clamp(power / BALL.kickMax, 0.3, 1) * (p === human ? 1 : 0.6) });
  if (Math.abs(ball.pos.z - p.enemyGoal) < 30) M.excite = Math.max(M.excite, 0.35);
}

function throwGloo(p: Player) {
  if (p.gloo <= 0 || !p.alive) { if (p === human) note('No gloo walls left', 1.2); return; }
  p.gloo--;
  const w = new Gloo(scene, p.x + p.fwdX * 2.4, p.z + p.fwdZ * 2.4, p.yaw, p.team);
  glooWalls.push(w);
  if (glooWalls.filter((g) => g.alive).length > GLOO.max) glooWalls.find((g) => g.alive)!.hp = 0;
  sfx.play('gloo', { volume: p === human ? 1 : 0.5 });
}

// ---------------------------------------------------------------- loot
function spawnLoot(kind: LootKind, x: number, z: number, airdrop: boolean) {
  const { g, chute } = makeCrate(kind, airdrop);
  const y = airdrop ? 38 : 0;
  g.position.set(x, y, z); scene.add(g);
  const l: Loot = { kind, x, z, y, vy: airdrop ? -5 : 0, mesh: g, chute, airdrop, t: 0, alive: true, contents: airdrop ? [rng.pick(['rocket', 'smg', 'shotgun'] as LootKind[]), 'armor', 'gloo'] : undefined };
  loot.push(l);
  return l;
}
function pickup(p: Player, l: Loot) {
  l.alive = false; scene.remove(l.mesh);
  const kinds = l.contents ?? [l.kind];
  for (const k of kinds) {
    if (k === 'medkit') p.hp = Math.min(HEALTH.max, p.hp + HEALTH.medkit);
    else if (k === 'armor') p.armor = Math.min(HEALTH.armorMax, p.armor + HEALTH.armorPickup);
    else if (k === 'gloo') p.gloo = Math.min(GLOO.max, p.gloo + 2);
    else p.equip(k as WeaponId);
  }
  if (p === human) { sfx.play(l.airdrop ? 'powerup' : 'coin'); note(l.airdrop ? `AIRDROP: ${kinds.map((k) => LOOT_LABEL[k]).join(' + ')}` : LOOT_LABEL[l.kind], 2, hex(LOOT_COLOR[kinds[0]])); }
  else if (l.airdrop) feed(`${tagName(p)} grabbed the <span class="w">AIRDROP</span>`);
}

// ---------------------------------------------------------------- input wiring
function lockPointer() { const r = renderer.domElement.requestPointerLock?.() as unknown; if (r instanceof Promise) r.catch(() => {}); }
const locked = () => document.pointerLockElement === renderer.domElement;
document.addEventListener('mousemove', (e) => {
  if (state === 'menu' || state === 'over' || state === 'paused') return;
  if (!locked() && !q.has('freelook')) return;
  cam.yaw -= e.movementX * 0.0023; cam.pitch = clamp(cam.pitch - e.movementY * 0.0023, -0.7, 0.55);
});
document.addEventListener('pointerlockchange', () => { if (!locked() && (state === 'play' || state === 'kickoff')) { resumeState = state; state = 'paused'; $('pause').classList.remove('hidden'); } });
hud.addEventListener('click', () => {
  if (state === 'menu' || state === 'over') startMatch();
  else if (state === 'paused') { state = resumeState; $('pause').classList.add('hidden'); lockPointer(); }
});
renderer.domElement.addEventListener('click', () => { if ((state === 'play' || state === 'kickoff') && !locked()) lockPointer(); });
action('+30s', () => (M.time += 30));
action('Airdrop now', () => (M.airdropT = 0));
action('Give rocket', () => human.equip('rocket'));
action('Score for orange', () => goal(0));

// ---------------------------------------------------------------- goals
function goal(team: number) {
  M.score[team]++;
  const scorer = ball.lastTouch;
  const own = scorer && scorer.team !== team;
  if (scorer && !own) scorer.goals++;
  state = 'goal'; M.goalT = 3.2; M.slow = 0.25;
  banner(`<span style="color:${hex(TEAM_COLOR[team])}">GOAL!</span><br><small>${scorer ? (own ? `own goal — ${scorer.name}` : scorer.name) : TEAM_NAME[team]}</small>`, 3);
  feed(`⚽ ${scorer ? tagName(scorer) : ''} <span class="w">${own ? 'OWN GOAL' : 'GOAL'}</span>`);
  sfx.play('whistle'); sfx.play('bigBoom', { volume: 0.4 }); sfx.notes('select', [0, 4, 7, 12, 16], 0.09);
  M.excite = 1; shake(0.5);
  const gz = team === 0 ? -HALF_L : HALF_L;
  for (let i = 0; i < 6; i++) setTimeout(() => debris.burst((Math.random() - 0.5) * PITCH.goalWidth, 3, gz, [TEAM_COLOR[team], 0xffffff, 0xffe14d], 30, 7, 12, 0.15), i * 120);
  music.setIntensity(3);
}

// ---------------------------------------------------------------- AI world
const aiWorld: AiWorld = {
  ball, players, loot: [], zoneHalf: HALF_W,
  canSee: (a, b) => { const o = new THREE.Vector3(a.x, 1.3, a.z), d = new THREE.Vector3(b.x - a.x, 0, b.z - a.z); const len = d.length(); d.normalize(); for (const w of glooWalls) if (w.alive && w.ray(o, d) < len) return false; return true; },
  shoot, kick: kickBall, throwGloo,
};

// ---------------------------------------------------------------- main loop
const fwd = new THREE.Vector3();
let fps = 60, elapsedTotal = 0;
loop((rawDt, time) => {
  fps = damp(fps, 1 / Math.max(rawDt, 1e-3), 3, rawDt);
  M.slow = damp(M.slow, 1, 1.5, rawDt);
  const dt = rawDt * (state === 'goal' ? M.slow : 1);
  if (input.pressed('KeyM')) audio.toggleMute();
  if (state === 'over' && input.pressed('KeyR')) startMatch();
  const demo = state === 'menu';   // attract mode: the AI plays a match behind the title
  const active = state === 'play' || state === 'kickoff' || state === 'goal' || demo;
  if (state === 'paused') { input.endFrame(); return; }

  if (active) {
    elapsedTotal += dt;
    // timers
    if (state === 'kickoff') { M.kickoffT -= dt; if (M.kickoffT <= 0) { state = 'play'; sfx.play('whistle'); } }
    if (state === 'goal') { M.goalT -= rawDt; if (M.goalT <= 0) { if (M.golden) { endMatch(); input.endFrame(); return; } kickoff(M.score[0] > M.score[1] ? 1 : 0); music.setIntensity(M.time < 60 ? 2 : 1); } }
    if (state === 'play') {
      if (!M.golden) M.time -= dt;
      if (M.time <= 0 && !M.golden) {
        M.time = 0;
        if (M.score[0] === M.score[1]) { M.golden = true; sfx.play('whistle'); banner('GOLDEN GOAL<br><small>next goal wins</small>', 2.5); music.setIntensity(3); }
        else { endMatch(); input.endFrame(); return; }
      }
      // loot + airdrops
      M.lootT -= dt; M.airdropT -= dt;
      if (M.lootT <= 0) { M.lootT = MATCH.lootEvery; if (loot.filter((l) => l.alive && !l.airdrop).length < MATCH.maxLoot) spawnLoot(rng.weighted<LootKind>([['medkit', 4], ['armor', 3], ['gloo', 3], ['smg', 3], ['shotgun', 2], ['rocket', 1]]), rng.range(-M.zoneHalf + 3, M.zoneHalf - 3), rng.range(-HALF_L + 8, HALF_L - 8), false); }
      if (M.airdropT <= 0) { M.airdropT = MATCH.airdropEvery; const l = spawnLoot('rocket', rng.range(-M.zoneHalf + 4, M.zoneHalf - 4), rng.range(-HALF_L * 0.5, HALF_L * 0.5), true); banner('<small>✈ AIRDROP INCOMING</small>', 2); note('Airdrop! Check the red beam', 3, '#ff6a4a'); void l; }
    }
    const playing = state === 'play' || demo;
    M.zoneHalf = zoneHalfAt(M.golden ? M.length : M.length - M.time);
    stadium.setZone(M.zoneHalf, time);
    aiWorld.zoneHalf = M.zoneHalf; aiWorld.loot = loot;

    // human
    const auto = q.has('auto') || demo;
    if (human.alive && playing) {
      if (auto) aiThink(human, aiWorld, dt);
      else {
        const ax = input.axis();
        const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
        human.steer(fx * -ax.y + rx * ax.x, fz * -ax.y + rz * ax.x, input.down('ShiftLeft') || input.down('ShiftRight'), dt);
        human.yaw = cam.yaw;
        // aim: ray from the camera centre to whatever it hits
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        const rh = rayHit(raycaster.ray.origin, raycaster.ray.direction, 80, human);
        const aim = raycaster.ray.at(rh.t, new THREE.Vector3());
        if (input.mouse.down) shoot(human, aim.x, aim.y, aim.z);
        if (input.pressed('KeyG')) throwGloo(human);
        if (input.pressed('KeyQ') && human.special) { human.weapon = human.weapon === 'pistol' ? human.special : 'pistol'; sfx.play('blip'); }
        const kickHeld = input.mouse.right || input.down('Space');
        if (kickHeld && charge < 0) charge = 0;
        if (kickHeld) charge = Math.min(BALL.chargeTime, charge + dt);
        if (!kickHeld && charge >= 0) {
          const k = charge / BALL.chargeTime;
          kickBall(human, fx, fz, lerp(BALL.kickMin, BALL.kickMax, k), BALL.lift * 0.4 + Math.max(0, cam.pitch + 0.12) * 1.2);
          charge = -1;
        }
      }
    } else if (state !== 'play') human.steer(0, 0, false, dt);
    // AI
    for (const p of players) {
      p.fireT -= dt;
      if (p === human) continue;
      if (playing) aiThink(p, aiWorld, dt); else p.steer(0, 0, false, dt);
    }
    // physics + zone + respawn + pickups
    for (const p of players) {
      if (!p.alive) {
        p.vx = damp(p.vx, 0, 6, dt); p.vz = damp(p.vz, 0, 6, dt);
        p.respawnT -= dt;
        if (p.respawnT <= 0 && playing) { p.spawn((Math.random() - 0.5) * 10, p.ownGoal - Math.sign(p.ownGoal) * 12); if (p === human) note('Back in!', 1.2, '#7dff9a'); }
      }
      p.integrate(dt, glooWalls);
      if (p.alive && playing && Math.abs(p.x) > M.zoneHalf && !(q.has('god') && p === human)) {
        if (p.damage(ZONE.damage * dt, null)) knock(p, null, 'ZONE', false);
      }
      if (p.alive) for (const l of loot) if (l.alive && l.y < 0.2 && Math.hypot(l.x - p.x, l.z - p.z) < (l.airdrop ? 1.6 : 1.2)) pickup(p, l);
      p.animate(dt, time);
    }
    // player separation
    for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) {
      const a = players[i], b = players[j]; if (!a.alive || !b.alive) continue;
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      if (d < 0.9 && d > 1e-3) { const push = (0.9 - d) / 2; a.x -= (dx / d) * push; a.z -= (dz / d) * push; b.x += (dx / d) * push; b.z += (dz / d) * push; }
    }
    // ball
    if (state !== 'kickoff') {
      const scored = ball.update(dt, players, glooWalls, (p, hard) => { if (hard > 0.3) sfx.play('kick', { volume: clamp(hard, 0.2, 0.7), rate: 0.8 }); void p; });
      if (scored >= 0 && state === 'play') goal(scored);
      else if (scored >= 0 && demo) ball.place(0, 0);
    } else {
      const taker = players.find((p) => Math.hypot(p.x, p.z) < 2 && p.role === 'field');
      if (taker) { ball.owner = taker; ball.update(0.0001, players, glooWalls, () => {}); }
    }
    // rockets
    for (const r of rockets) {
      if (!r.alive) continue;
      r.life -= dt; r.pos.addScaledVector(r.vel, dt); r.mesh.position.copy(r.pos);
      debris.burst(r.pos.x, r.pos.y, r.pos.z, [0xffa040, 0x888888], 1, 0.5, 0.5, 0.12);
      const hitP = players.some((p) => p.alive && p.team !== r.team && Math.hypot(p.x - r.pos.x, p.z - r.pos.z) < 0.8 && r.pos.y < 2);
      const hitW = glooWalls.some((w) => w.alive && w.dist(r.pos.x, r.pos.z).d < 0.4 && r.pos.y < GLOO.height);
      const hitB = ball.pos.distanceTo(r.pos) < 0.8;
      if (r.life <= 0 || r.pos.y < 0.1 || hitP || hitW || hitB || Math.abs(r.pos.x) > HALF_W || Math.abs(r.pos.z) > HALF_L + 2) {
        r.alive = false; scene.remove(r.mesh); explode(r.pos, r.owner as Player, r.team);
      }
    }
    rockets = rockets.filter((r) => r.alive);
    // gloo walls
    for (const w of glooWalls) { w.update(dt); if (!w.alive) { scene.remove(w.mesh); debris.burst(w.x, 1.2, w.z, [0xbff4ff, 0xffffff], 20, 4, 4, 0.18); } }
    glooWalls = glooWalls.filter((w) => w.alive);
    // falling airdrops
    for (const l of loot) if (l.alive && l.y > 0) {
      l.y = Math.max(0, l.y + l.vy * dt); l.mesh.position.y = l.y;
      if (l.chute) l.chute.rotation.y += dt * 0.5;
      if (l.y === 0) { sfx.play('crate', { volume: 0.8 }); debris.burst(l.x, 0.3, l.z, [0xff4a2a, 0xaaaaaa], 30, 4, 6, 0.2); if (l.chute) l.chute.visible = false; }
    }
    for (const l of loot) if (l.alive && l.y === 0) { l.t += dt; l.mesh.rotation.y = l.t * 0.8; }
  }
  tracers.update(dt);
  debris.update(dt);

  // ---------------------------------------------------------------- camera
  if (state === 'menu') {
    // attract: slow orbit over the stadium
    const a = time * 0.08;
    camera.position.set(Math.sin(a) * 55, 26, Math.cos(a) * 70);
    camera.lookAt(0, 0, 0);
  } else {
    const followYaw = q.has('auto') ? human.yaw : cam.yaw;
    if (q.has('auto')) cam.yaw = followYaw;
    const back = 4.6, side = 0.85, up = 2.3;
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const px = human.x - fx * back * cp + rx * side, pz = human.z - fz * back * cp + rz * side, py = up - sp * back;
    camera.position.set(px, Math.max(0.6, py), pz);
    camera.rotation.set(cam.pitch, cam.yaw, 0, 'YXZ');
    camera.getWorldDirection(fwd);
  }
  // don't let other players fill the screen when they walk into the camera
  for (const p of players) if (p !== human) p.root.visible = state === 'menu' || Math.hypot(p.x - camera.position.x, p.z - camera.position.z) > 1.1;
  M.excite = damp(M.excite, 0, 0.8, rawDt);
  stadium.cheer(M.excite, time);
  crowd.update(rawDt, M.excite);

  // ---------------------------------------------------------------- HUD
  if (state !== 'menu') {
    $('s0').textContent = String(M.score[0]); $('s1').textContent = String(M.score[1]);
    const t = Math.max(0, Math.ceil(M.time));
    $('clock').textContent = M.golden ? 'GG' : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    $('clock').classList.toggle('low', !M.golden && M.time < 30);
    $('hp').style.width = `${(Math.max(0, human.hp) / HEALTH.max) * 100}%`;
    $('ar').style.width = `${(human.armor / HEALTH.armorMax) * 100}%`;
    $('st').style.width = `${(human.stamina / 100) * 100}%`;
    $('wname').textContent = WEAPONS[human.weapon].name + (human.special && human.weapon === 'pistol' ? ` · [Q] ${WEAPONS[human.special].name}` : '');
    $('ammo').textContent = human.weapon === 'pistol' ? '∞' : String(human.ammo);
    $('gloo').textContent = `GLOO ×${human.gloo} [G]`;
    $('charge').style.opacity = charge >= 0 ? '1' : '0';
    $('chargeFill').style.width = `${(Math.max(0, charge) / BALL.chargeTime) * 100}%`;
    const outside = Math.abs(human.x) > M.zoneHalf && human.alive && state === 'play';
    $('zoneTint').style.opacity = outside ? '1' : '0';
    $('sub').textContent = outside ? '⚠ OUTSIDE THE ZONE' : state === 'kickoff' ? String(Math.ceil(M.kickoffT)) : '';
    $('ballhint').textContent = ball.owner === human ? 'YOU HAVE THE BALL — hold RIGHT CLICK to shoot' : '';
    hitT -= rawDt; $('hitx').style.opacity = hitT > 0 ? '1' : '0';
    bannerT -= rawDt; noteT -= rawDt; if (noteT <= 0) $('note').style.opacity = '0';
    drawMap();
  }

  (window as any).__playtest = {
    state, score: M.score.join('-'), time: Math.ceil(M.time), golden: M.golden, zone: +M.zoneHalf.toFixed(1),
    hp: Math.round(human.hp), alive: human.alive, goals: human.goals, knocks: players.reduce((a, p) => a + p.knocks, 0),
    ball: ball.owner?.name ?? 'loose', loot: loot.filter((l) => l.alive).length, walls: glooWalls.length, fps: Math.round(fps),
  };
  input.endFrame();
});

function drawMap() {
  const c = mapCtx, W = 138, H = 210, sx = W / PITCH.width, sz = H / PITCH.length;
  const X = (x: number) => (x + HALF_W) * sx, Z = (z: number) => (z + HALF_L) * sz;
  c.clearRect(0, 0, W, H);
  c.fillStyle = 'rgba(30,90,40,.75)'; c.fillRect(0, 0, W, H);
  c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 1;
  c.strokeRect(0.5, 0.5, W - 1, H - 1); c.beginPath(); c.moveTo(0, H / 2); c.lineTo(W, H / 2); c.stroke();
  c.fillStyle = '#fff'; c.fillRect(X(-PITCH.goalWidth / 2), 0, PITCH.goalWidth * sx, 3); c.fillRect(X(-PITCH.goalWidth / 2), H - 3, PITCH.goalWidth * sx, 3);
  if (M.zoneHalf < HALF_W - 0.5) { c.fillStyle = 'rgba(80,170,255,.4)'; c.fillRect(0, 0, X(-M.zoneHalf), H); c.fillRect(X(M.zoneHalf), 0, W - X(M.zoneHalf), H); }
  for (const l of loot) if (l.alive) { c.fillStyle = l.airdrop ? '#ff4a2a' : hex(LOOT_COLOR[l.kind]); c.fillRect(X(l.x) - 2, Z(l.z) - 2, l.airdrop ? 6 : 4, l.airdrop ? 6 : 4); }
  for (const w of glooWalls) { c.strokeStyle = '#bff4ff'; c.lineWidth = 2; c.beginPath(); c.moveTo(X(w.ax), Z(w.az)); c.lineTo(X(w.bx), Z(w.bz)); c.stroke(); }
  for (const p of players) {
    if (!p.alive) continue;
    c.fillStyle = hex(TEAM_COLOR[p.team]); c.beginPath(); c.arc(X(p.x), Z(p.z), p === human ? 4.5 : 3.5, 0, Math.PI * 2); c.fill();
    if (p === human) { c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.stroke(); c.beginPath(); c.moveTo(X(p.x), Z(p.z)); c.lineTo(X(p.x + p.fwdX * 4), Z(p.z + p.fwdZ * 4)); c.stroke(); }
  }
  c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.beginPath(); c.arc(X(ball.pos.x), Z(ball.pos.z), 2.8, 0, Math.PI * 2); c.fill(); c.stroke();
}

addEventListener('blur', () => { if (state === 'play' || state === 'kickoff') { resumeState = state; state = 'paused'; $('pause').classList.remove('hidden'); } });
showRecord();
for (const p of players) p.spawn((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 50);
ball.place(0, 0);
(window as any).__debug = { human, players, ball, M, cam, get loot() { return loot; }, get glooWalls() { return glooWalls; }, shoot, kickBall, throwGloo, goal, startMatch, spawnLoot };
