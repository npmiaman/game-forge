/** Asset Library browser: search, preview (3D + animations), listen, copy ids. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { catalog, loadModel, loadHdri, animate, sound, assetUrl, sizeOf } from '../kit/assets';

type Tab = 'models' | 'sounds' | 'sprites' | 'textures' | 'hdri';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const cat = await catalog() as Awaited<ReturnType<typeof catalog>> & { sprites: Record<string, string[]> };
const counts = {
  models: Object.values(cat.models).reduce((a, l) => a + l.length, 0),
  sounds: Object.values(cat.sounds).reduce((a, l) => a + l.length, 0),
  sprites: Object.values(cat.sprites).reduce((a, l) => a + l.length, 0),
  textures: cat.textures.length, hdri: cat.hdri.length,
};
$('counts').textContent = `${counts.models} models · ${counts.sprites} sprites · ${counts.sounds} sounds · ${counts.textures} textures · ${counts.hdri} skies`;
let tab: Tab = (new URLSearchParams(location.search).get('tab') as Tab) || 'models';
const LIMIT = 240;

function toast(t: string) { const el = $('toast'); el.textContent = t; el.classList.add('on'); setTimeout(() => el.classList.remove('on'), 1200); }
function copy(t: string) { navigator.clipboard?.writeText(t); toast(`copied "${t}"`); }

function renderTabs() {
  $('tabs').innerHTML = (['models', 'sprites', 'sounds', 'textures', 'hdri'] as Tab[]).map((t) => `<button data-t="${t}" class="${t === tab ? 'on' : ''}">${t === 'hdri' ? 'skies' : t} (${counts[t]})</button>`).join('');
  $('tabs').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.t as Tab; ($('q') as HTMLInputElement).value = ''; render(); renderTabs(); }));
  const packs = tab === 'models' ? Object.keys(cat.models) : tab === 'sounds' ? Object.keys(cat.sounds) : tab === 'sprites' ? Object.keys(cat.sprites) : [];
  $<HTMLSelectElement>('pack').innerHTML = `<option value="">all packs</option>` + packs.map((p) => `<option>${p}</option>`).join('');
  $('pack').classList.toggle('hidden', !packs.length);
}

function render() {
  const q = $<HTMLInputElement>('q').value.toLowerCase().trim(), pack = $<HTMLSelectElement>('pack').value;
  const match = (s: string) => !q || q.split(/\s+/).every((w) => s.toLowerCase().includes(w));
  const list = $('list');
  list.classList.toggle('rows', tab === 'sounds');
  let html = '', n = 0, total = 0;
  if (tab === 'models') {
    for (const [p, items] of Object.entries(cat.models)) if (!pack || pack === p) for (const m of items) {
      const id = `${p}/${m.name}`; if (!match(id)) continue; total++; if (n++ >= LIMIT) continue;
      html += `<div class="tile" data-model="${id}"><div class="img" style="background-image:url('${assetUrl(`models/${p}/_preview/${m.name}.png`)}')"></div><div class="name">${m.name}</div><div class="meta"><span>${p}${m.animations ? ' · 🎞' : ''}</span><span class="copy" data-copy="${id}">⧉</span></div></div>`;
    }
  } else if (tab === 'sprites') {
    for (const [p, items] of Object.entries(cat.sprites)) if (!pack || pack === p) for (const f of items) {
      const path = `sprites/${p}/${f}`; if (!match(path)) continue; total++; if (n++ >= LIMIT) continue;
      html += `<div class="tile ${/tiny|pixel/.test(p) ? 'pixel' : ''}" data-copyurl="${path}"><div class="img" style="background-image:url('${assetUrl(path)}')"></div><div class="name">${f.split('/').pop()}</div><div class="meta"><span>${p}</span><span class="copy" data-copy="${path}">⧉</span></div></div>`;
    }
  } else if (tab === 'sounds') {
    for (const [p, items] of Object.entries(cat.sounds)) if (!pack || pack === p) for (const s of items) {
      const id = `${p}/${s}`; if (!match(id)) continue; total++; if (n++ >= LIMIT) continue;
      html += `<div class="row"><button data-sound="${id}">▶</button><span class="n">${s}<br><small style="color:var(--muted)">${p}</small></span><span class="copy" data-copy="${id}">⧉</span></div>`;
    }
  } else if (tab === 'textures') {
    for (const t of cat.textures) { if (!match(t)) continue; total++; html += `<div class="tile" data-copy="${t}"><div class="img" style="background-size:cover;background-image:url('${assetUrl(`textures/${t}/diff.jpg`)}')"></div><div class="name">${t}</div><div class="meta"><span>PBR 1k</span><span class="copy" data-copy="${t}">⧉</span></div></div>`; }
  } else {
    for (const h of cat.hdri) { if (!match(h)) continue; total++; html += `<div class="tile" data-hdri="${h}"><div class="img" style="background:linear-gradient(#4a8bd8,#c9e2ff 60%,#6a7a5a)"></div><div class="name">${h}</div><div class="meta"><span>HDRI · click</span><span class="copy" data-copy="${h}">⧉</span></div></div>`; }
  }
  if (total > LIMIT) html += `<div class="more">showing ${LIMIT} of ${total} — refine your search</div>`;
  if (!total) html = `<div class="more">nothing matches "${q}"</div>`;
  list.innerHTML = html;
}

$('list').addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const c = t.closest<HTMLElement>('[data-copy]'); if (c && t.classList.contains('copy')) { copy(c.dataset.copy!); return; }
  const s = t.closest<HTMLElement>('[data-sound]'); if (s) { audioUnlock(); sound.play(s.dataset.sound!, { minGap: 0 }); return; }
  const m = t.closest<HTMLElement>('[data-model]'); if (m) { openModel(m.dataset.model!); return; }
  const h = t.closest<HTMLElement>('[data-hdri]'); if (h) { openHdri(h.dataset.hdri!); return; }
  const u = t.closest<HTMLElement>('[data-copyurl]'); if (u) { copy(u.dataset.copyurl!); return; }
  if (c) copy(c.dataset.copy!);
});
$('q').addEventListener('input', render);
$('pack').addEventListener('change', render);
function audioUnlock() { import('../kit/audio').then(({ audio }) => audio.ctx.resume()); }

// ---------------------------------------------------------------- 3D viewer
let renderer: THREE.WebGLRenderer | null = null, controls: OrbitControls, vscene: THREE.Scene, vcam: THREE.PerspectiveCamera;
let current: THREE.Object3D | null = null, anim: ReturnType<typeof animate> | null = null;
const clock = new THREE.Timer();
function ensureViewer() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
  $('vcanvas').appendChild(renderer.domElement);
  vscene = new THREE.Scene(); vscene.background = new THREE.Color(0x1a1d2a);
  vscene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.6));
  const d = new THREE.DirectionalLight(0xffffff, 2); d.position.set(3, 5, 4); vscene.add(d);
  const grid = new THREE.GridHelper(10, 20, 0x335577, 0x223344); vscene.add(grid);
  vcam = new THREE.PerspectiveCamera(40, 1, 0.01, 200);
  controls = new OrbitControls(vcam, renderer.domElement); controls.enableDamping = true; controls.autoRotate = true;
  renderer.setAnimationLoop((t) => {
    clock.update(t); anim?.update(clock.getDelta()); controls.update();
    const el = $('vcanvas'); const w = el.clientWidth, h = el.clientHeight;
    if (renderer!.domElement.width !== w || renderer!.domElement.height !== h) { renderer!.setSize(w, h, false); vcam.aspect = w / h; vcam.updateProjectionMatrix(); }
    if (!$('viewer').classList.contains('hidden')) renderer!.render(vscene, vcam);
  });
}
async function openModel(id: string) {
  ensureViewer();
  $('viewer').classList.remove('hidden');
  $('vtitle').innerHTML = `${id} <span class="copy" style="cursor:copy" data-c="${id}">⧉</span>`;
  $('vtitle').querySelector('.copy')!.addEventListener('click', () => copy(`loadModel('${id}')`));
  if (current) vscene.remove(current);
  vscene.background = new THREE.Color(0x1a1d2a); vscene.environment = null;
  current = await loadModel(id);
  vscene.add(current);
  const size = sizeOf(current), r = Math.max(size.x, size.y, size.z);
  vcam.position.set(r * 1.6, r * 1.1, r * 1.8); controls.target.set(0, size.y / 2, 0);
  anim = animate(current);
  $('vanims').innerHTML = anim.names.map((n) => `<button data-a="${n}">${n}</button>`).join('');
  $('vanims').querySelectorAll<HTMLElement>('button').forEach((b) => b.addEventListener('click', () => { anim!.play(b.dataset.a!); $('vanims').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); }));
  if (anim.names.includes('idle')) anim.play('idle');
}
async function openHdri(id: string) {
  ensureViewer();
  $('viewer').classList.remove('hidden');
  $('vtitle').textContent = `${id} — loadHdri(scene, '${id}', { background: true })`;
  if (current) vscene.remove(current);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.8, 48, 32), new THREE.MeshStandardMaterial({ metalness: 1, roughness: 0.05 }));
  ball.position.y = 1; current = ball; vscene.add(ball); anim = null; $('vanims').innerHTML = '';
  await loadHdri(vscene, id, { background: true });
  vcam.position.set(0, 1.2, 3.2); controls.target.set(0, 1, 0);
}
$('vclose').addEventListener('click', () => $('viewer').classList.add('hidden'));
$('viewer').addEventListener('click', (e) => { if (e.target === $('viewer')) $('viewer').classList.add('hidden'); });

renderTabs(); render();
(window as any).__playtest = { counts };
