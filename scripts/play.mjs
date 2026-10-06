#!/usr/bin/env node
/** npm run play -- <slug> [query]   → starts the dev server and opens that game in your browser. */
import { createServer } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const [slug, query] = process.argv.slice(2);
const path = slug ? `/games/${slug}/${query ? `?${query.replace(/^\?/, '')}` : ''}` : '/';
const server = await createServer({ root, configFile: resolve(root, 'vite.config.ts'), server: { open: path } });
await server.listen();
server.printUrls();
console.log(`\n  ▶ ${path}   (edit any file — the game hot-reloads)\n`);
