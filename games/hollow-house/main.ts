/**
 * Hollow House — first-person horror survival RPG.
 * Find 3 keys and escape. Grandma hunts you by sight and sound; zombies roam and fight back.
 * Debug: ?god ?nogranny ?keys=3 ?freelook ?level=3 ?tune
 */
import * as THREE from 'three';
import { bootThree } from '@kit/three/boot';
import { createInput } from '@kit/input';
import { Debris } from '@kit/three/debris';
import { sfx, music, SONGS, audio } from '@kit/audio';
import { clamp, damp, angleDiff } from '@kit/math';
import { Rng } from '@kit/rng';
import { store } from '@kit/save';
import { Upgrades } from '@kit/upgrades';
import { action } from '@kit/tune';
import { PLAYER, GRANNY, ZOMBIE, RPG, NOISE, SLUG, CELL } from './config';
import { House, toWorld, toCell, type HideSpot, type Door } from './house';
import { Grandma, Zombie, type ActorEvents, type Senses } from './actors';

const q = new URLSearchParams(location.search);
const god = q.has('god');
const save = store(SLUG, { bestTime: 0, escapes: 0, runs: 0, mostKills: 0 });

// ---------------------------------------------------------------- sounds
sfx.define('step', { volume: 0.18, randomness: 0.2, freq: 90, release: 0.07, shape: 4, noise: 0.6, filter: -900 });
sfx.define('gstep', { volume: 0.9, randomness: 0.1, freq: 48, sustain: 0.02, release: 0.22, shape: 0, slide: -2, noise: 0.25, filter: -600 });
sfx.define('creak', { volume: 0.45, randomness: 0.1, freq: 260, attack: 0.08, sustain: 0.35, release: 0.25, shape: 2, slide: -2, tremolo: 0.7, modulation: 2.5, filter: -1400 });
sfx.define('groan', { volume: 0.55, randomness: 0.15, freq: 105, attack: 0.15, sustain: 0.45, release: 0.4, shape: 2, slide: -1, tremolo: 0.35, modulation: 4, filter: -900 });
sfx.define('heart', { volume: 0.8, freq: 52, release: 0.13, shape: 0, slide: -3 });
sfx.define('scream', { volume: 1, randomness: 0.05, freq: 820, attack: 0.02, sustain: 0.7, release: 0.6, shape: 2, slide: -6, noise: 0.7, tremolo: 0.4, bitCrush: 0.15 });
sfx.define('sting', { volume: 0.7, freq: 180, attack: 0.01, sustain: 0.35, release: 0.5, shape: 2, slide: 14, tremolo: 0.5, modulation: 7 });
sfx.define('swing', { volume: 0.35, randomness: 0.1, freq: 500, attack: 0.02, release: 0.12, shape: 4, slide: -10, noise: 1, filter: 900 });
sfx.define('bonk', { volume: 0.9, randomness: 0.1, freq: 320, release: 0.18, shape: 1, slide: -8, pitchJump: -100, pitchJumpTime: 0.03, noise: 0.2 });
sfx.define('splat', { volume: 0.6, randomness: 0.2, freq: 140, release: 0.15, shape: 4, slide: -4, noise: 0.9, filter: -1600 });
sfx.define('bang', { volume: 0.8, randomness: 0.2, freq: 70, sustain: 0.03, release: 0.2, shape: 4, noise: 0.6, filter: -900 });

// ---------------------------------------------------------------- scene
await document.fonts.load('16px "Press Start 2P"').catch(() => {});
const { scene, camera, renderer, loop, hud, shake } = bootThree({ background: 0x000000, fog: { color: 0x030303, near: 3, far: 26 }, fov: 75, shadows: true, maxPixelRatio: 1.5 });
renderer.toneMappingExposure = 1.15;
camera.near = 0.05; camera.updateProjectionMatrix();
scene.add(camera);
scene.add(new THREE.HemisphereLight(0x8090b0, 0x201810, 0.22));
const house = new House(scene);
const debris = new Debris(scene, 400);
const input = createInput(renderer.domElement);
let rng = new Rng(Date.now());
const rand = () => rng.next();

// flashlight + frying pan viewmodel, both children of the camera
const torch = new THREE.SpotLight(0xfff0d8, 26, 22, 0.48, 0.55, 1.4);
torch.castShadow = true; torch.shadow.mapSize.set(1024, 1024); torch.shadow.camera.near = 0.2; torch.shadow.bias = -0.002;
torch.position.set(0.25, -0.15, 0);
torch.target.position.set(0, 0, -5);
camera.add(torch, torch.target);
const fill = new THREE.PointLight(0xfff0d8, 0.5, 4, 2); fill.position.set(0, 0, -1.5); camera.add(fill);
const pan = new THREE.Group();
{
  const metal = new THREE.MeshStandardMaterial({ color: 0x1c1c20, roughness: 0.55, metalness: 0.35 });
  const inner = new THREE.MeshStandardMaterial({ color: 0x0e0e10, roughness: 0.7 });
  const handle = new THREE.MeshStandardMaterial({ color: 0x2a1a0e, roughness: 0.85 });
  const head = new THREE.Group(); head.position.set(0, 0.3, 0); head.rotation.x = -0.35;
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.045, 20), metal);
  const bottom = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.01, 20), inner); bottom.position.y = 0.024;
  head.add(dish, bottom);
  const h = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.3, 0.03), handle); h.position.set(0, 0.06, 0);
  pan.add(head, h);
  pan.position.set(0.34, -0.38, -0.6);
  pan.rotation.z = -0.25;
  camera.add(pan);
}
pan.visible = false;

// ---------------------------------------------------------------- HUD
hud.innerHTML = `
  <div id="vignette"></div><div id="hurt"></div><div id="hideview"></div>
  <div class="tl"><div id="day">DAY 1 / 5</div><div id="room" class="dim"></div></div>
  <div class="tc"><div id="objective">Find 3 keys · unlock the front door</div><div id="msg"></div></div>
  <div class="tr"><div class="dim">KEYS</div><div id="keys"><span class="k r"></span><span class="k b"></span><span class="k g"></span></div><div id="sense"></div></div>
  <div class="bl"><div class="bar"><div id="hp"></div></div><div class="bar thin"><div id="st"></div></div><div id="battery" class="dim">🔦 100%</div></div>
  <div class="br"><div id="lvl">LV 1</div><div class="bar thin"><div id="xp"></div></div><div id="kills" class="dim">0 ZOMBIES</div></div>
  <div id="cross">·</div><div id="prompt"></div>
  <div id="scare"></div><div id="fade"><div id="fadeText"></div></div>
  <div class="ov" id="menu"><h1>HOLLOW HOUSE</h1><p class="sub">Grandma knows you're in her house.</p>
    <p class="keys">WASD move · MOUSE look · SHIFT sprint (loud) · C crouch (quiet)<br>LEFT CLICK swing frying pan · E interact / hide · F flashlight<br>Find the 3 keys · kill zombies to level up · don't let her catch you</p>
    <p id="best" class="dim"></p><p class="go">CLICK TO ENTER</p></div>
  <div class="ov hidden" id="pause"><h1>PAUSED</h1><p class="go">CLICK TO RESUME</p><p class="dim">M mute</p></div>
  <div class="ov hidden" id="cards"><h2 id="cardTitle">LEVEL UP</h2><div id="cardRow"></div><p class="dim">1 / 2 / 3 or click</p></div>
  <div class="ov hidden" id="end"><h1 id="endTitle"></h1><p id="endStats"></p><p class="go">CLICK OR PRESS R TO TRY AGAIN</p></div>`;
const $ = (id: string) => hud.querySelector<HTMLElement>('#' + id)!;

let msgTimer = 0;
function message(text: string, secs = 2.5, color = '#ddd') { const m = $('msg'); m.textContent = text; m.style.color = color; m.style.opacity = '1'; msgTimer = secs; }

// ---------------------------------------------------------------- perks (RPG)
const perkStats = { damageMul: 1, staminaMul: 1, stepMul: 1, lifesteal: 0, sprintMul: 1, sense: false, stun: GRANNY.stun, batteryMul: 1, regenMul: 1, maxHp: PLAYER.maxHp };
type PS = typeof perkStats;
const PERKS = () => new Upgrades<PS>([
  { id: 'dmg', name: 'Heavy Swing', desc: '+40% frying pan damage', max: 3, weight: 10, apply: (s) => (s.damageMul *= 1.4) },
  { id: 'lungs', name: 'Iron Lungs', desc: '+40% stamina', max: 2, weight: 8, apply: (s) => (s.staminaMul *= 1.4) },
  { id: 'quiet', name: 'Light Feet', desc: 'Footsteps 50% quieter', max: 2, weight: 8, apply: (s) => (s.stepMul *= 0.5) },
  { id: 'hp', name: 'Thick Skin', desc: '+30 max HP and heal 30', max: 3, weight: 8, apply: (s) => (s.maxHp += 30) },
  { id: 'vamp', name: 'Second Helping', desc: 'Heal 10 HP per zombie kill', max: 2, weight: 7, apply: (s) => (s.lifesteal += 10) },
  { id: 'sprint', name: 'Sprinter', desc: '+15% sprint speed', max: 2, weight: 7, apply: (s) => (s.sprintMul *= 1.15) },
  { id: 'sense', name: 'Grandma Sense', desc: 'Always know which way she is (when within 18m)', max: 1, weight: 6, apply: (s) => (s.sense = true) },
  { id: 'stun', name: 'Cast Iron', desc: 'Hitting Grandma stuns her for 6s', max: 1, weight: 6, apply: (s) => (s.stun = GRANNY.stunPerk) },
  { id: 'battery', name: 'Battery Saver', desc: 'Flashlight drains 50% slower', max: 1, weight: 5, apply: (s) => (s.batteryMul *= 0.5) },
  { id: 'regen', name: 'Second Wind', desc: '+50% stamina regeneration', max: 2, weight: 6, apply: (s) => (s.regenMul *= 1.5) },
]);

// ---------------------------------------------------------------- state
type State = 'menu' | 'play' | 'paused' | 'cards' | 'caught' | 'fade' | 'end';
let state: State = 'menu';
const P = {
  x: 0, z: 0, yaw: 0, pitch: 0, hp: 100, stamina: 100, battery: 100, torch: true, crouch: false, sprinting: false,
  hidden: null as HideSpot | null, prev: { x: 0, z: 0 }, keys: new Set<string>(), xp: 0, level: 1, kills: 0, day: 1,
  swingT: 0, swingAnim: 0, hitPending: -1, bob: 0, stepT: 0, hurtT: 0, eye: PLAYER.eye, time: 0, heartT: 0,
};
let perks = { ...perkStats };
let ups = PERKS();
let grandma: Grandma;
let zombies: Zombie[] = [];
interface Item { kind: 'key' | 'medkit' | 'battery'; color?: string; hex?: number; x: number; z: number; mesh: THREE.Object3D; taken: boolean }
let items: Item[] = [];
let spawnT = ZOMBIE.respawnEvery;
let caughtT = 0, fadeT = 0, fadeReason = '';
const xpNeed = (lvl: number) => Math.round(RPG.xpBase * Math.pow(RPG.xpGrowth, lvl - 1));

// spatial sound: quieter with distance, muffled through walls, panned left/right
function play3d(name: string, x: number, z: number, vol = 1, maxDist = 22) {
  const dx = x - P.x, dz = z - P.z, d = Math.hypot(dx, dz);
  if (d > maxDist) return;
  const wallMul = house.los(P.x, P.z, x, z) ? 1 : 0.45;
  const v = vol * Math.pow(1 - d / maxDist, 1.6) * wallMul;
  const rel = angleDiff(-P.yaw, Math.atan2(dx, -dz));
  sfx.play(name, { volume: v, pan: Math.sin(rel) * 0.8 });
}
function noise(x: number, z: number, r: number) {
  if (r <= 0) return;
  if (!q.has('nogranny')) grandma.hear(x, z, r);
  for (const zb of zombies) zb.hear(x, z, r * 0.8);
}

const events: ActorEvents = {
  step: (x, z, heavy) => play3d(heavy ? 'gstep' : 'step', x, z, heavy ? 1 : 0.6, heavy ? 26 : 14),
  spotted: () => { sfx.play('sting'); message('SHE SEES YOU — RUN', 2.5, '#ff4040'); music.setIntensity(1); shake(0.15); },
  caught: () => { if (!god && state === 'play') startCaught('caught'); },
  door: (x, z) => play3d('creak', x, z, 1, 20),
  bang: (x, z) => { play3d('bang', x, z, 1, 22); noise(x, z, NOISE.zombieBang); },
  attack: (dmg) => hurt(dmg),
  groan: (x, z) => play3d('groan', x, z, 0.9, 16),
};

function spawnItems() {
  items.forEach((i) => scene.remove(i.mesh));
  items = [];
  const keySpots = rng.shuffle([...house.spots.K]).slice(0, 3);
  const keyDefs: [string, number][] = [['red', 0xff3333], ['blue', 0x3399ff], ['gold', 0xffcc33]];
  keySpots.forEach((c, i) => {
    const g = new THREE.Group();
    const m = new THREE.MeshBasicMaterial({ color: keyDefs[i][1] });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.025, 6, 12), m);
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.22), m); shaft.position.z = 0.15;
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.03), m); tooth.position.set(0, -0.04, 0.24);
    g.add(ring, shaft, tooth);
    const glow = new THREE.PointLight(keyDefs[i][1], 0.8, 2.5, 2); g.add(glow);
    addItem({ kind: 'key', color: keyDefs[i][0], hex: keyDefs[i][1] }, c, g);
  });
  for (const c of house.spots.H) {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.22), new THREE.MeshStandardMaterial({ color: 0xeeeeee, emissive: 0x222222 }));
    const cr1 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.01), new THREE.MeshBasicMaterial({ color: 0xdd2222 })); cr1.position.z = 0.115;
    const cr2 = cr1.clone(); cr2.rotation.z = Math.PI / 2;
    g.add(b, cr1, cr2);
    addItem({ kind: 'medkit' }, c, g);
  }
  for (const c of house.spots.A) {
    const g = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 10), new THREE.MeshStandardMaterial({ color: 0x44aa44, emissive: 0x113311 }));
    addItem({ kind: 'battery' }, c, g);
  }
}
function addItem(base: Pick<Item, 'kind' | 'color' | 'hex'>, c: { x: number; y: number }, mesh: THREE.Object3D) {
  const w = toWorld(c);
  const x = w.x + (rand() - 0.5) * 0.8, z = w.z + (rand() - 0.5) * 0.8;
  mesh.position.set(x, 0.9, z);
  scene.add(mesh);
  items.push({ ...base, x, z, mesh, taken: false });
}

function spawnZombie(at?: { x: number; y: number }) {
  const c = at ?? rng.pick(house.spots.S.filter((s) => { const w = toWorld(s); return Math.hypot(w.x - P.x, w.z - P.z) > 8; }).concat(house.spots.S).slice(0, 3));
  const z = new Zombie(house, events, scene, ZOMBIE.hp + (P.day - 1) * ZOMBIE.hpPerDay);
  z.place(c);
  zombies.push(z);
}

function respawnPlayer() {
  const w = toWorld(house.spots.P[0]);
  Object.assign(P, { x: w.x, z: w.z, yaw: Math.PI, pitch: 0, hidden: null, crouch: false, hp: perks.maxHp, stamina: PLAYER.maxStamina * perks.staminaMul });
  grandma.place(house.spots.G[0]);
  grandma.state = 'patrol'; grandma.sawHide = false; grandma.waitT = 2;
  grandma.speedMul = 1 + (P.day - 1) * GRANNY.speedPerDay;
  if (q.has('nogranny')) grandma.place({ x: 27, y: 15 });
}

function newGame() {
  rng = new Rng(Date.now());
  perks = { ...perkStats }; ups = PERKS();
  Object.assign(P, { battery: PLAYER.battery, torch: true, keys: new Set<string>(), xp: 0, level: 1, kills: 0, day: 1, time: 0, swingT: 0 });
  zombies.forEach((z) => scene.remove(z.root)); zombies = [];
  grandma ??= new Grandma(house, events, scene);
  for (const d of house.doors.values()) { d.target = d.exit ? 0 : 0; d.open = d.target; }
  spawnItems();
  respawnPlayer();
  // start zombies away from the bedroom: living room spawn + random far floor cells
  for (let i = 0; i < ZOMBIE.start; i++) {
    let c = house.randomFloor(rand), tries = 0;
    while (tries++ < 30 && (Math.hypot(toWorld(c).x - P.x, toWorld(c).z - P.z) < 16 || house.roomAt(c) === 'Hallway')) c = house.randomFloor(rand);
    spawnZombie(c);
  }
  const k = Number(q.get('keys') ?? 0);
  ['red', 'blue', 'gold'].slice(0, k).forEach((c) => { P.keys.add(c); items.find((i) => i.color === c)!.taken = true; items.find((i) => i.color === c)!.mesh.visible = false; });
  spawnT = ZOMBIE.respawnEvery;
  const lv = Number(q.get('level') ?? 1);
  if (lv > 1) P.xp = xpNeed(1);
  save.set('runs', save.get('runs') + 1);
}

function lockPointer() { const r = renderer.domElement.requestPointerLock?.() as unknown; if (r instanceof Promise) r.catch(() => {}); }
const locked = () => document.pointerLockElement === renderer.domElement;

function startPlay() {
  newGame();
  state = 'play';
  $('menu').classList.add('hidden'); $('end').classList.add('hidden');
  hud.classList.add('playing');
  if (!music.playing) music.play(SONGS.ambient);
  music.setIntensity(0);
  lockPointer();
  message(`DAY 1 — ${house.roomAt(toCell(P.x, P.z)).toUpperCase()}`, 3);
}

// ---------------------------------------------------------------- damage / caught / days
function hurt(dmg: number) {
  if (god || state !== 'play') return;
  P.hp -= dmg; P.hurtT = 0.4;
  sfx.play('hurt', { volume: 0.6 }); shake(0.2);
  if (P.hp <= 0) startCaught('blackout');
}
function startCaught(reason: 'caught' | 'blackout') {
  state = 'caught'; caughtT = 0; fadeReason = reason;
  if (reason === 'caught') {
    sfx.play('scream'); sfx.play('bigBoom', { volume: 0.5 }); music.duck(0.1, 2000);
    $('scare').classList.add('on');
  } else sfx.play('heart', { rate: 0.6 });
  P.hidden = null;
}
function loseDay() {
  P.day++;
  if (P.day > RPG.days) { endGame(false); return; }
  state = 'fade'; fadeT = 0;
  $('fadeText').innerHTML = `${fadeReason === 'caught' ? 'She caught you.' : 'You blacked out.'}<br><br><b>DAY ${P.day}</b><br><small>${RPG.days - P.day + 1} left</small>`;
  $('fade').classList.add('on');
  respawnPlayer();
}
function endGame(won: boolean) {
  state = 'end';
  document.exitPointerLock?.();
  hud.classList.remove('playing');
  const mins = `${Math.floor(P.time / 60)}:${String(Math.floor(P.time % 60)).padStart(2, '0')}`;
  let extra = '';
  if (won) { save.set('escapes', save.get('escapes') + 1); if (!save.get('bestTime') || P.time < save.get('bestTime')) { save.set('bestTime', Math.floor(P.time)); extra = '<br><b style="color:#ffcc33">NEW BEST TIME!</b>'; } }
  save.best('mostKills', P.kills);
  $('endTitle').textContent = won ? 'YOU ESCAPED' : 'SHE GOT YOU';
  $('endTitle').style.color = won ? '#7dff9a' : '#ff3333';
  $('endStats').innerHTML = `${won ? `Escaped on day ${P.day} in ${mins}` : `You lasted ${RPG.days} days`}<br>Zombies killed: ${P.kills} · Level ${P.level} · Keys ${P.keys.size}/3${extra}`;
  $('end').classList.remove('hidden');
  $('fade').classList.remove('on'); $('scare').classList.remove('on');
  if (won) sfx.notes('select', [0, 4, 7, 12, 16], 0.1); else sfx.play('scream', { volume: 0.5 });
}

// ---------------------------------------------------------------- level-up cards
let cardChoices: ReturnType<typeof ups.offer> = [];
function openCards() {
  state = 'cards';
  cardChoices = ups.offer(3);
  $('cardTitle').textContent = `LEVEL ${P.level} — CHOOSE A PERK`;
  $('cardRow').innerHTML = cardChoices.map((u, i) => `<div class="card" data-i="${i}"><b>${u.name}</b><span>${u.desc}</span><em>[${i + 1}]${ups.level(u.id) ? ` · owned ${ups.level(u.id)}` : ''}</em></div>`).join('');
  $('cardRow').querySelectorAll<HTMLElement>('.card').forEach((el) => el.addEventListener('click', () => pickCard(Number(el.dataset.i))));
  $('cards').classList.remove('hidden');
  document.exitPointerLock?.();
  sfx.notes('blip', [0, 4, 7, 12], 0.07);
}
function pickCard(i: number) {
  if (state !== 'cards' || !cardChoices[i]) return;
  const u = ups.take(cardChoices[i].id, perks);
  if (u.id === 'hp') P.hp = Math.min(perks.maxHp, P.hp + 30);
  $('cards').classList.add('hidden');
  state = 'play'; sfx.play('powerup');
  message(`${u.name.toUpperCase()}!`, 2, '#7dff9a');
  lockPointer();
}

// ---------------------------------------------------------------- input wiring
document.addEventListener('mousemove', (e) => {
  if (state !== 'play' || (!locked() && !q.has('freelook'))) return;
  P.yaw -= e.movementX * PLAYER.mouseSens; P.pitch = clamp(P.pitch - e.movementY * PLAYER.mouseSens, -1.4, 1.4);
});
document.addEventListener('pointerlockchange', () => { if (!locked() && state === 'play') { state = 'paused'; $('pause').classList.remove('hidden'); } });
hud.addEventListener('click', () => {
  if (state === 'menu') startPlay();
  else if (state === 'paused') { state = 'play'; $('pause').classList.add('hidden'); lockPointer(); }
  else if (state === 'end') startPlay();
});
renderer.domElement.addEventListener('click', () => { if (state === 'play' && !locked()) lockPointer(); });
action('Level up', () => (P.xp = xpNeed(P.level)));
action('Give all keys', () => ['red', 'blue', 'gold'].forEach((k) => P.keys.add(k)));
action('Grandma: chase me', () => { grandma.state = 'chase'; grandma.lastSeen = { x: P.x, z: P.z }; });
action('Spawn zombie', () => spawnZombie());

// ---------------------------------------------------------------- interaction
type Target = { kind: 'door'; door: Door } | { kind: 'hide'; spot: HideSpot } | { kind: 'item'; item: Item } | { kind: 'unhide' } | null;
function findTarget(): Target {
  if (P.hidden) return { kind: 'unhide' };
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
  let best: Target = null, bestScore = -Infinity;
  const consider = (x: number, z: number, range: number, t: Target) => {
    const dx = x - P.x, dz = z - P.z, d = Math.hypot(dx, dz);
    if (d > range) return;
    const dot = (dx * fx + dz * fz) / (d || 1);
    if (dot < 0.55 && d > 0.7) return;
    const score = dot * 2 - d;
    if (score > bestScore) { bestScore = score; best = t; }
  };
  for (const it of items) if (!it.taken) consider(it.x, it.z, 1.9, { kind: 'item', item: it });
  for (const d of house.doors.values()) { const w = toWorld(d.cell); consider(w.x, w.z, 2.8, { kind: 'door', door: d }); }
  for (const s of house.hides) { const w = toWorld(s.cell); consider(w.x, w.z, 2.2, { kind: 'hide', spot: s }); }
  return best;
}
function promptFor(t: Target) {
  if (!t) return '';
  if (t.kind === 'unhide') return '[E] Get out';
  if (t.kind === 'item') return `[E] Take ${t.item.kind === 'key' ? `${t.item.color} key` : t.item.kind}`;
  if (t.kind === 'hide') return t.spot.kind === 'wardrobe' ? '[E] Hide in wardrobe' : '[E] Hide under bed';
  if (t.door.exit) return P.keys.size >= 3 ? '[E] UNLOCK AND ESCAPE' : `Front door — locked (${P.keys.size}/3 keys)`;
  return t.door.target > 0.5 ? '[E] Close door' : '[E] Open door';
}
function interact(t: Target) {
  if (!t) return;
  if (t.kind === 'unhide') {
    const s = P.hidden!; P.hidden = null;
    const w = toWorld(s.front); P.x = w.x; P.z = w.z;
    $('hideview').className = ''; sfx.play('creak', { volume: 0.4 }); noise(P.x, P.z, 3);
    return;
  }
  if (t.kind === 'item') {
    const it = t.item; it.taken = true; it.mesh.visible = false;
    if (it.kind === 'key') { P.keys.add(it.color!); sfx.play('powerup'); message(`${it.color!.toUpperCase()} KEY (${P.keys.size}/3)`, 3, '#' + it.hex!.toString(16).padStart(6, '0')); if (P.keys.size === 3) setTimeout(() => message('ALL KEYS — GET TO THE FRONT DOOR (LIVING ROOM)', 4, '#7dff9a'), 1500); }
    else if (it.kind === 'medkit') { P.hp = Math.min(perks.maxHp, P.hp + RPG.medkit); sfx.play('coin'); message(`+${RPG.medkit} HP`, 2, '#ff6666'); }
    else { P.battery = Math.min(100, P.battery + RPG.batteryPickup); sfx.play('coin'); message('BATTERY +50%', 2, '#7dff9a'); }
    return;
  }
  if (t.kind === 'hide') {
    P.prev = { x: P.x, z: P.z };
    // if she's chasing and can see you climb in, she knows where you are
    grandma.sawHide = grandma.state === 'chase' && grandma.canSee({ px: P.x, pz: P.z, hiding: false, flashlight: P.torch, crouching: P.crouch }) && Math.hypot(grandma.x - P.x, grandma.z - P.z) < 7;
    P.hidden = t.spot;
    const w = toWorld(t.spot.cell); P.x = w.x; P.z = w.z;
    $('hideview').className = t.spot.kind;
    sfx.play('creak', { volume: 0.4 });
    message(grandma.sawHide ? 'SHE SAW YOU HIDE...' : 'Hidden. Stay quiet.', 2, grandma.sawHide ? '#ff4040' : '#aaa');
    return;
  }
  const d = t.door;
  if (d.exit) {
    if (P.keys.size >= 3) { d.target = 1; sfx.play('creak'); sfx.play('powerup'); setTimeout(() => state === 'play' && endGame(true), 1200); }
    else { sfx.play('denied'); const missing = ['red', 'blue', 'gold'].filter((k) => !P.keys.has(k)); message(`Locked. Missing: ${missing.join(', ')} key`, 2.5); }
    return;
  }
  d.target = d.target > 0.5 ? 0 : 1;
  sfx.play('creak', { volume: 0.6 }); noise(P.x, P.z, NOISE.door);
}

// ---------------------------------------------------------------- combat
function swing() {
  if (P.hidden || P.swingT > 0 || P.stamina < PLAYER.swingCost) { if (P.stamina < PLAYER.swingCost) message('Too tired...', 1); return; }
  P.swingT = PLAYER.swingCooldown; P.swingAnim = 1; P.hitPending = 0.12;
  P.stamina -= PLAYER.swingCost;
  sfx.play('swing'); noise(P.x, P.z, NOISE.swing);
}
function resolveHit() {
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
  const inArc = (x: number, z: number) => { const dx = x - P.x, dz = z - P.z, d = Math.hypot(dx, dz); return d < PLAYER.reach && (dx * fx + dz * fz) / (d || 1) > 0.6; };
  let hitAny = false;
  for (const zb of zombies) if (zb.alive && inArc(zb.x, zb.z)) {
    hitAny = true;
    const killed = zb.hit(PLAYER.damage * perks.damageMul, P.x, P.z); zb.windT = -1;   // a hit interrupts their attack
    debris.burst(zb.x, 1.4, zb.z, [0x6b0a0a, 0x9a1010, 0x3a5a2a], killed ? 30 : 10, killed ? 4 : 2.5, 3, 0.07);
    if (killed) {
      P.kills++; P.xp += ZOMBIE.xp;
      if (perks.lifesteal) P.hp = Math.min(perks.maxHp, P.hp + perks.lifesteal);
      sfx.play('splat'); sfx.play('thud'); message(`+${ZOMBIE.xp} XP`, 1.2, '#7dff9a'); shake(0.25);
    } else { sfx.play('bonk'); shake(0.12); }
  }
  if (inArc(grandma.x, grandma.z) && grandma.state !== 'stunned') {
    hitAny = true;
    grandma.stun(perks.stun);
    sfx.play('bonk', { rate: 0.7 }); sfx.play('groan', { rate: 1.6 }); shake(0.35);
    message(`GRANDMA STUNNED — ${perks.stun}s, GO!`, 2.5, '#ffcc33');
  }
  if (hitAny) noise(P.x, P.z, NOISE.hit);
}

// ---------------------------------------------------------------- main loop
const fwd = new THREE.Vector3();
let fps = 60;
loop((dt) => {
  fps = damp(fps, 1 / Math.max(dt, 1e-3), 3, dt);
  if (input.pressed('KeyM')) audio.toggleMute();
  if (state === 'end' && input.pressed('KeyR')) startPlay();
  if (state === 'cards') { (['Digit1', 'Digit2', 'Digit3'] as const).forEach((k, i) => input.pressed(k) && pickCard(i)); }
  house.update(dt, P.time);
  debris.update(dt);
  msgTimer -= dt; if (msgTimer <= 0) $('msg').style.opacity = '0';

  if (state === 'play') {
    P.time += dt;
    // movement
    const ax = input.axis();
    P.crouch = input.down('KeyC') || input.down('ControlLeft');
    const moving = (ax.x !== 0 || ax.y !== 0) && !P.hidden;
    P.sprinting = moving && (input.down('ShiftLeft') || input.down('ShiftRight')) && !P.crouch && P.stamina > 1;
    const speed = P.crouch ? PLAYER.crouch : P.sprinting ? PLAYER.sprint * perks.sprintMul : PLAYER.walk;
    if (moving) {
      const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
      const mx = fx * -ax.y + rx * ax.x, mz = fz * -ax.y + rz * ax.x, ml = Math.hypot(mx, mz) || 1;
      const p = house.collide(P.x + (mx / ml) * speed * dt, P.z + (mz / ml) * speed * dt, PLAYER.radius);
      P.x = p.x; P.z = p.z;
      P.bob += dt * speed * 2.6;
      P.stepT -= dt * speed;
      if (P.stepT <= 0) {
        P.stepT = 1.5;
        sfx.play('step', { volume: P.crouch ? 0.3 : P.sprinting ? 1 : 0.6 });
        noise(P.x, P.z, (P.crouch ? NOISE.crouchStep : P.sprinting ? NOISE.sprintStep : NOISE.walkStep) * perks.stepMul);
      }
    }
    const maxSt = PLAYER.maxStamina * perks.staminaMul;
    if (P.sprinting) P.stamina -= PLAYER.sprintCost * dt; else P.stamina = Math.min(maxSt, P.stamina + PLAYER.staminaRegen * perks.regenMul * dt * (moving ? 0.6 : 1));
    // actions
    if (input.pressed('KeyF')) { if (P.battery > 0) { P.torch = !P.torch; sfx.play('blip', { volume: 0.4 }); } else message('Battery dead', 1.5); }
    const target = findTarget();
    if (input.pressed('KeyE')) interact(target);
    if (input.mouse.pressed || input.pressed('KeyQ')) swing();
    P.swingT -= dt;
    if (P.hitPending >= 0) { P.hitPending -= dt; if (P.hitPending < 0) resolveHit(); }
    if (P.torch) { P.battery -= PLAYER.batteryDrain * perks.batteryMul * dt; if (P.battery <= 0) { P.battery = 0; P.torch = false; message('Your flashlight died', 2); } }
    // level up
    if (P.xp >= xpNeed(P.level)) { P.xp -= xpNeed(P.level); P.level++; openCards(); }
    // actors
    const senses: Senses = { px: P.x, pz: P.z, hiding: !!P.hidden, flashlight: P.torch, crouching: P.crouch };
    if (!q.has('nogranny')) grandma.update(dt, senses, rand);
    for (const zb of zombies) zb.update(dt, senses, rand);
    zombies = zombies.filter((zb) => { if (!zb.alive && !zb.root.visible) { scene.remove(zb.root); return false; } return true; });
    spawnT -= dt;
    if (spawnT <= 0) { spawnT = ZOMBIE.respawnEvery; if (zombies.filter((z) => z.alive).length < ZOMBIE.max + P.day) spawnZombie(); }
    $('prompt').textContent = promptFor(target);
  } else if (state === 'caught') {
    caughtT += dt;
    // jump scare: her face right in yours
    if (fadeReason === 'caught') {
      camera.getWorldDirection(fwd);
      grandma.root.position.set(camera.position.x + fwd.x * 0.75, camera.position.y - 2.0, camera.position.z + fwd.z * 0.75);
      grandma.root.rotation.y = Math.atan2(-fwd.x, -fwd.z);
      grandma.face.scale.setScalar(1 + caughtT * 0.6);
      shake(0.3);
    }
    if (caughtT > 1.6) { $('scare').classList.remove('on'); grandma.face.scale.setScalar(1); loseDay(); }
  } else if (state === 'fade') {
    fadeT += dt;
    if (fadeT > 2.8) { $('fade').classList.remove('on'); state = 'play'; message(`DAY ${P.day} — she's faster now`, 3, '#ff8080'); }
  }

  // ---------------------------------------------------------------- camera & viewmodel
  const targetEye = P.hidden ? (P.hidden.kind === 'bed' ? 0.35 : 1.5) : P.crouch ? PLAYER.crouchEye : PLAYER.eye;
  P.eye = damp(P.eye, targetEye, 10, dt);
  const bob = state === 'play' && !P.hidden ? Math.sin(P.bob) * 0.04 : 0;
  camera.position.set(P.x, P.eye + bob, P.z);
  camera.rotation.set(P.pitch, P.yaw, 0, 'YXZ');
  if (P.hidden && state === 'play') {
    // look out through the wardrobe door / from under the bed toward the room
    const f = toWorld(P.hidden.front), w = toWorld(P.hidden.cell);
    const look = Math.atan2(-(f.x - w.x), -(f.z - w.z));
    P.yaw = look + clamp(angleDiff(look, P.yaw), -0.6, 0.6);
    P.pitch = clamp(P.pitch, -0.3, 0.3);
  }
  P.swingAnim = damp(P.swingAnim, 0, 9, dt);
  pan.rotation.set(-0.15 - P.swingAnim * 1.7, P.swingAnim * 0.9, -0.25 - P.swingAnim * 0.5);
  pan.position.set(0.34 - P.swingAnim * 0.25, -0.38 + Math.abs(Math.sin(P.bob)) * 0.02, -0.6);
  pan.visible = !P.hidden && (state === 'play' || state === 'paused' || state === 'cards');
  const flicker = P.battery < 15 && Math.random() < 0.08 ? 0.2 : 1;
  torch.intensity = P.torch ? 26 * flicker * (0.6 + 0.4 * Math.min(1, P.battery / 30)) : 0;
  fill.intensity = P.torch ? 0.6 : 0.15;

  // ---------------------------------------------------------------- dread: heartbeat + red vignette
  const gd = Math.hypot(grandma?.x - P.x, grandma?.z - P.z);
  const chasing = grandma?.state === 'chase' || grandma?.state === 'grab';
  const dread = state === 'play' ? clamp(chasing ? 1 : (12 - gd) / 10, 0, 1) : 0;
  // soft edge darkening when safe; closes in and turns red as Grandma gets near
  const vClear = 72 - dread * 22, vAlpha = 0.3 + dread * 0.45;
  $('vignette').style.background = `radial-gradient(ellipse at center, transparent ${vClear}%, rgba(${Math.round(dread * 110)},0,0,${vAlpha}) 100%)`;
  if (dread > 0.05 && state === 'play') { P.heartT -= dt; if (P.heartT <= 0) { P.heartT = 1.1 - dread * 0.65; sfx.play('heart', { volume: 0.3 + dread * 0.7 }); setTimeout(() => sfx.play('heart', { volume: 0.2 + dread * 0.5, rate: 0.9 }), 180); } }
  if (!chasing && music.intensity > 0) music.setIntensity(0);
  P.hurtT -= dt; $('hurt').style.opacity = String(Math.max(0, P.hurtT * 1.5));

  // items bob/spin
  for (const it of items) if (!it.taken) { it.mesh.rotation.y += dt * 1.5; it.mesh.position.y = 0.9 + Math.sin(P.time * 2 + it.x) * 0.06; }

  // ---------------------------------------------------------------- HUD
  if (state !== 'menu') {
    $('day').textContent = `DAY ${Math.min(P.day, RPG.days)} / ${RPG.days}`;
    $('room').textContent = house.roomAt(toCell(P.x, P.z));
    $('hp').style.width = `${(Math.max(0, P.hp) / perks.maxHp) * 100}%`;
    $('st').style.width = `${(P.stamina / (PLAYER.maxStamina * perks.staminaMul)) * 100}%`;
    $('battery').textContent = `🔦 ${Math.ceil(P.battery)}%${P.torch ? '' : ' (off)'}`;
    $('lvl').textContent = `LV ${P.level}`;
    $('xp').style.width = `${(P.xp / xpNeed(P.level)) * 100}%`;
    $('kills').textContent = `${P.kills} ZOMBIE${P.kills === 1 ? '' : 'S'}`;
    $('keys').querySelectorAll<HTMLElement>('.k').forEach((el, i) => el.classList.toggle('got', P.keys.has(['red', 'blue', 'gold'][i])));
    $('objective').textContent = P.keys.size >= 3 ? 'Unlock the front door (living room)' : `Find the keys (${P.keys.size}/3) · unlock the front door`;
    if (perks.sense && gd < 18 && state === 'play') {
      const rel = angleDiff(-P.yaw, Math.atan2(grandma.x - P.x, -(grandma.z - P.z)));
      $('sense').innerHTML = `<span style="display:inline-block;transform:rotate(${rel}rad)">▲</span> GRANDMA ${Math.round(gd)}m`;
    } else $('sense').textContent = '';
  }

  (window as any).__playtest = {
    state, day: P.day, hp: Math.round(P.hp), stamina: Math.round(P.stamina), level: P.level, xp: P.xp, kills: P.kills, keys: P.keys.size,
    hidden: !!P.hidden, granny: grandma?.state, grannyDist: Math.round(gd * 10) / 10, zombies: zombies.filter((z) => z.alive).length,
    room: house.roomAt(toCell(P.x, P.z)), fps: Math.round(fps),
  };
  input.endFrame();
});

addEventListener('blur', () => { if (state === 'play') { state = 'paused'; $('pause').classList.remove('hidden'); } });
const best = save.get('bestTime');
$('best').textContent = best ? `Best escape: ${Math.floor(best / 60)}:${String(best % 60).padStart(2, '0')} · ${save.get('escapes')} escapes` : '';
// attract: a dim hallway view behind the menu
grandma = new Grandma(house, events, scene);
grandma.place(house.spots.G[0]);
{ const w = toWorld({ x: 14, y: 7 }); P.x = w.x; P.z = w.z; P.yaw = Math.PI / 2; }
(window as any).__debug = { P, house, get grandma() { return grandma; }, get zombies() { return zombies; }, interact, findTarget, swing, startPlay, CELL };
