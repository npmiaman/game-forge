#!/usr/bin/env node
// Claude Code PostToolUse hook: after an edit to a .ts file, type-check the project.
// Exit 2 + stderr feeds the errors straight back to Claude so it fixes them immediately.
// Pure Node (no jq/bash) so it works on macOS, Linux and Windows.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

let raw = '';
for await (const chunk of process.stdin) raw += chunk;
let file = '';
try { const j = JSON.parse(raw || '{}'); file = j.tool_input?.file_path ?? j.tool_response?.filePath ?? ''; } catch {}
if (!file.endsWith('.ts')) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR ?? resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const tsc = resolve(root, 'node_modules/typescript/bin/tsc');
if (!existsSync(tsc)) process.exit(0);   // deps not installed yet — don't block
try {
  execFileSync(process.execPath, [tsc, '--noEmit', '-p', root], { cwd: root, stdio: 'pipe' });
} catch (e) {
  const out = `${e.stdout ?? ''}${e.stderr ?? ''}`.split('\n').slice(0, 25).join('\n');
  process.stderr.write(`TypeScript errors after editing ${file} (fix before continuing):\n${out}\n`);
  process.exit(2);
}
