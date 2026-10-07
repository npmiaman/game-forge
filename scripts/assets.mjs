#!/usr/bin/env node
/**
 * Asset library manager. Everything it imports is CC0 (public domain).
 *
 *   npm run assets -- add car-kit furniture-kit       # Kenney packs by slug (kenney.nl/assets/<slug>)
 *   npm run assets -- add car-kit --from ./downloads  # use an already-downloaded/unzipped pack dir
 *   npm run assets -- texture wood_floor_worn         # Poly Haven PBR texture (1k: diffuse, normal, rough)
 *   npm run assets -- hdri kloofendal_48d_partly_cloudy_puresky   # Poly Haven HDRI sky (1k)
 *   npm run assets -- catalog                          # rebuild assets/CATALOG.md + assets/catalog.json
 *
 * Layout written:
 *   assets/models/<pack>/<name>.glb      self-contained GLBs (textures embedded → safe for production builds)
 *   assets/models/<pack>/_preview/*.png  thumbnails (asset browser)
 *   assets/sprites/<pack>/...            2D tiles, sheets, UI, icons, particles
 *   assets/sounds/<pack>/*.ogg           sound effects, jingles, voice lines
 *   assets/textures/<id>/{diff,nor,rough}.jpg     assets/hdri/<id>.hdr
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, mkdtempSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const A = join(root, 'assets');
const args = process.argv.slice(2);
const cmd = args[0];
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const names = args.slice(1).filter((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--'));
const walk = (d) => (existsSync(d) ? readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; }) : []);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);   // keep texture transforms, materials etc. intact

async function download(url, dest) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
}
function unzip(zip, dir) {
  mkdirSync(dir, { recursive: true });
  try { execFileSync('unzip', ['-qo', zip, '-d', dir]); } catch { execFileSync('tar', ['-xf', zip, '-C', dir]); }
}

// ---------------------------------------------------------------- Kenney
async function addKenney(slug) {
  let src = opt('from') ? resolve(opt('from'), slug) : null;
  if (!src || !existsSync(src)) {
    const page = await (await fetch(`https://kenney.nl/assets/${slug}`)).text();
    const url = page.match(new RegExp(`https://kenney\\.nl/media/pages/assets/${slug}/[^"]+\\.zip`))?.[0];
    if (!url) throw new Error(`no download found for "${slug}" — check https://kenney.nl/assets/${slug}`);
    const tmp = mkdtempSync(join(tmpdir(), 'kenney-'));
    process.stdout.write(`  ↓ ${slug} … `);
    await download(url, join(tmp, 'pack.zip'));
    unzip(join(tmp, 'pack.zip'), join(tmp, 'x'));
    src = join(tmp, 'x');
  }
  const files = walk(src);
  const glbDir = ['Models/GLB format', 'Models/GLTF format'].map((d) => join(src, d)).find((d) => existsSync(d) && readdirSync(d).some((f) => f.endsWith('.glb')));
  const oggs = files.filter((f) => f.endsWith('.ogg'));
  let summary = '';
  if (glbDir) {
    const out = join(A, 'models', slug); rmSync(out, { recursive: true, force: true }); mkdirSync(join(out, '_preview'), { recursive: true });
    let n = 0;
    for (const f of readdirSync(glbDir).filter((f) => f.endsWith('.glb'))) {
      const doc = await io.read(join(glbDir, f));          // resolves external Textures/colormap.png
      await io.write(join(out, f), doc);                    // writes a GLB with everything embedded
      const name = basename(f, '.glb');
      const prev = [join(src, 'Previews', `${name}.png`), join(src, 'Isometric', `${name}_NE.png`), join(src, 'Isometric', `${name}_SE.png`)].find(existsSync);
      if (prev) cpSync(prev, join(out, '_preview', `${name}.png`));
      n++;
    }
    summary = `${n} models`;
  } else {
    const parts = [];
    // 2D: keep tiles, tilemaps/sheets, PNG folders, fonts; skip engine projects and vector sources
    const keep = files.filter((f) => /\.(png|txt|xml|tmx|tsx|ttf)$/i.test(f) && !/(Construct 3|Unity|Vector|Visit |Isometric|Side|Black background|Spritesheet\/.*black|Preview\.png|Sample)/i.test(relative(src, f)) && !/License/i.test(basename(f)));
    if (keep.some((f) => f.endsWith('.png'))) {
      const out = join(A, 'sprites', slug); rmSync(out, { recursive: true, force: true });
      for (const f of keep) { const d = join(out, relative(src, f).replace(/PNG \(Transparent\)\//, '')); mkdirSync(dirname(d), { recursive: true }); cpSync(f, d); }
      const prev = files.find((f) => /^preview\.png$/i.test(basename(f)));
      if (prev) cpSync(prev, join(out, '_preview.png'));
      parts.push(`${keep.length} sprite files`);
    }
    if (oggs.length) {
      const out = join(A, 'sounds', slug); rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
      for (const f of oggs) cpSync(f, join(out, basename(f).toLowerCase().replace(/\s+/g, '_')));
      parts.push(`${oggs.length} sounds`);
    }
    summary = parts.join(' + ') || 'nothing importable';
  }
  const lic = files.find((f) => /^license\.txt$/i.test(basename(f)));
  writeLicense(`Kenney — ${slug}`, `https://kenney.nl/assets/${slug}`, lic ? readFileSync(lic, 'utf8').match(/License:?\s*\(?([^)\n]+)/i)?.[1]?.trim() ?? 'CC0' : 'CC0');
  console.log(`✔ ${slug}: ${summary}`);
}

// ---------------------------------------------------------------- Poly Haven
async function polyhaven(id, kind) {
  const files = await (await fetch(`https://api.polyhaven.com/files/${id}`)).json();
  if (kind === 'hdri') {
    const url = files.hdri?.['1k']?.hdr?.url;
    if (!url) throw new Error(`no 1k HDRI for ${id}`);
    mkdirSync(join(A, 'hdri'), { recursive: true });
    await download(url, join(A, 'hdri', `${id}.hdr`));
  } else {
    const pick = (k) => files[k]?.['1k']?.jpg?.url;
    const maps = { diff: pick('Diffuse'), nor: pick('nor_gl'), rough: pick('Rough') };
    if (!maps.diff) throw new Error(`no 1k texture for ${id}`);
    const out = join(A, 'textures', id); mkdirSync(out, { recursive: true });
    for (const [k, url] of Object.entries(maps)) if (url) await download(url, join(out, `${k}.jpg`));
  }
  writeLicense(`Poly Haven — ${id}`, `https://polyhaven.com/a/${id}`, 'CC0');
  console.log(`✔ ${kind} ${id}`);
}

// ---------------------------------------------------------------- licenses + catalog
function writeLicense(title, url, license) {
  const p = join(A, 'LICENSES.md');
  const head = '# Asset licenses\n\nEvery asset in this folder is public domain (CC0). Credit is appreciated but not required.\n\n| Asset | Source | License |\n|---|---|---|\n';
  const lines = existsSync(p) ? readFileSync(p, 'utf8').split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Asset') ) : [];
  const row = `| ${title} | ${url} | ${license.includes('CC0') || license.includes('Zero') ? 'CC0' : license} |`;
  const rows = [...new Set([...lines.filter((l) => !l.startsWith(`| ${title} |`)), row])].sort();
  writeFileSync(p, head + rows.join('\n') + '\n');
}

function glbAnimations(file) {
  const b = readFileSync(file);
  const len = b.readUInt32LE(12);
  try { return (JSON.parse(b.subarray(20, 20 + len).toString()).animations ?? []).map((a) => a.name); } catch { return []; }
}

function catalog() {
  const cat = { models: {}, sprites: {}, sounds: {}, textures: [], hdri: [] };
  for (const pack of existsSync(join(A, 'models')) ? readdirSync(join(A, 'models')).sort() : []) {
    const dir = join(A, 'models', pack);
    cat.models[pack] = readdirSync(dir).filter((f) => f.endsWith('.glb')).sort().map((f) => {
      const anims = glbAnimations(join(dir, f));
      return { name: basename(f, '.glb'), preview: existsSync(join(dir, '_preview', basename(f, '.glb') + '.png')), ...(anims.length ? { animations: anims } : {}) };
    });
  }
  for (const pack of existsSync(join(A, 'sprites')) ? readdirSync(join(A, 'sprites')).sort() : []) cat.sprites[pack] = walk(join(A, 'sprites', pack)).filter((f) => f.endsWith('.png') && !f.endsWith('_preview.png')).map((f) => relative(join(A, 'sprites', pack), f)).sort();
  for (const pack of existsSync(join(A, 'sounds')) ? readdirSync(join(A, 'sounds')).sort() : []) cat.sounds[pack] = readdirSync(join(A, 'sounds', pack)).filter((f) => f.endsWith('.ogg')).map((f) => basename(f, '.ogg')).sort();
  cat.textures = existsSync(join(A, 'textures')) ? readdirSync(join(A, 'textures')).sort() : [];
  cat.hdri = existsSync(join(A, 'hdri')) ? readdirSync(join(A, 'hdri')).filter((f) => f.endsWith('.hdr')).map((f) => basename(f, '.hdr')).sort() : [];
  writeFileSync(join(A, 'catalog.json'), JSON.stringify(cat));

  // compact Markdown for agents: names collapse numbered variants (impact_01..05 → impact_0{1..5})
  const collapse = (list) => {
    const groups = new Map();
    for (const n of list) { const m = n.match(/^(.*?)(\d+)$/); const k = m ? m[1] : n; (groups.get(k) ?? groups.set(k, []).get(k)).push(m ? m[2] : null); }
    return [...groups].map(([k, v]) => (v[0] === null || v.length === 1 ? (v[0] === null ? k : k + v[0]) : `${k}{${v[0]}..${v.at(-1)}}`)).join(', ');
  };
  const nModels = Object.values(cat.models).reduce((a, l) => a + l.length, 0);
  const nSounds = Object.values(cat.sounds).reduce((a, l) => a + l.length, 0);
  let md = `# Asset catalog\n\nGenerated by \`npm run assets -- catalog\`. All CC0 (see LICENSES.md). Browse visually at \`/assets.html\` in the dev server.\n\n`;
  md += `**${nModels} 3D models · ${Object.values(cat.sprites).reduce((a, l) => a + l.length, 0)} sprites · ${nSounds} sounds · ${cat.textures.length} PBR textures · ${cat.hdri.length} HDRI skies**\n\n`;
  md += `Load them with \`kit/assets.ts\`: \`await loadModel('car-kit/race')\`, \`await loadTexture('wood_floor_worn')\`, \`await loadHdri(scene, 'stadium_01')\`, \`sound.play('impact-sounds/footstep_wood_*')\`, \`assetUrl('sprites/tiny-dungeon/Tilemap/tilemap_packed.png')\`.\n\n`;
  md += `## 3D models (\`assets/models/<pack>/<name>.glb\`)\n\n`;
  for (const [pack, list] of Object.entries(cat.models)) {
    md += `### ${pack} (${list.length})\n${collapse(list.map((m) => m.name))}\n\n`;
    const animated = list.filter((m) => m.animations);
    if (animated.length) md += `Animated (${animated.map((m) => m.name).join(', ')}): ${animated[0].animations.join(', ')}\n\n`;
  }
  md += `## Sprites (\`assets/sprites/<pack>/…\`)\n\n`;
  for (const [pack, list] of Object.entries(cat.sprites)) {
    const dirs = [...new Set(list.map((f) => dirname(f)))];
    md += `### ${pack} (${list.length})\n${dirs.map((d) => `- \`${d}/\`: ${collapse(list.filter((f) => dirname(f) === d).map((f) => basename(f, '.png')))}`).join('\n')}\n\n`;
  }
  md += `## Sounds (\`assets/sounds/<pack>/<name>.ogg\`)\n\n`;
  for (const [pack, list] of Object.entries(cat.sounds)) md += `### ${pack} (${list.length})\n${collapse(list)}\n\n`;
  md += `## PBR textures (\`assets/textures/<id>/{diff,nor,rough}.jpg\`, 1k, tileable)\n${cat.textures.join(', ')}\n\n## HDRI skies (\`assets/hdri/<id>.hdr\`, 1k)\n${cat.hdri.join(', ')}\n\n`;
  md += `## Adding more\n\`npm run assets -- add <kenney-slug>\` (any pack at kenney.nl/assets), \`npm run assets -- texture <polyhaven-id>\`, \`npm run assets -- hdri <polyhaven-id>\` (polyhaven.com), then \`npm run assets -- catalog\`.\n`;
  writeFileSync(join(A, 'CATALOG.md'), md);
  console.log(`✔ catalog: ${nModels} models, ${nSounds} sounds, ${cat.textures.length} textures, ${cat.hdri.length} hdri`);
}

// ---------------------------------------------------------------- main
mkdirSync(A, { recursive: true });
try {
  // one bad id shouldn't abort a batch
  const each = async (fn) => { let failed = 0; for (const n of names) { try { await fn(n); } catch (e) { failed++; console.error(`✖ ${n}: ${e.message}`); } } catalog(); if (failed) process.exitCode = 1; };
  if (cmd === 'add') await each(addKenney);
  else if (cmd === 'texture') await each((id) => polyhaven(id, 'texture'));
  else if (cmd === 'hdri') await each((id) => polyhaven(id, 'hdri'));
  else if (cmd === 'catalog') catalog();
  else { console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]); process.exit(cmd ? 1 : 0); }
} catch (e) { console.error('✖', e.message); process.exit(1); }
