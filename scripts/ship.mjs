#!/usr/bin/env node
/**
 * npm run ship -- <slug>
 * Builds one game as a standalone static site in ship/<slug>/ and zips it to ship/<slug>.zip,
 * ready to upload to itch.io ("HTML" project, "This file will be played in the browser"),
 * Netlify Drop, GitHub Pages, or any static host.
 */
import { build } from 'vite';
import { existsSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const slug = process.argv[2];
if (!slug || !existsSync(resolve(root, 'games', slug, 'index.html'))) { console.error('usage: npm run ship -- <slug>   (a folder in games/)'); process.exit(1); }
process.env.GAME = slug;
await build({ root, configFile: resolve(root, 'vite.config.ts'), logLevel: 'warn' });
const out = resolve(root, 'ship', slug);
// hosts expect index.html at the zip root → redirect into the game
writeFileSync(resolve(out, 'index.html'), `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=games/${slug}/"><script>location.replace('games/${slug}/')</script>`);
const zip = resolve(root, 'ship', `${slug}.zip`);
rmSync(zip, { force: true });
if (process.platform === 'win32') execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${out}\\*' -DestinationPath '${zip}'`]);
else execFileSync('zip', ['-qr', zip, '.'], { cwd: out });
console.log(`✔ ship/${slug}/  (static site)\n✔ ship/${slug}.zip  (upload to itch.io as an HTML game)`);
