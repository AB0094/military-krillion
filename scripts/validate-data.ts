import { readFileSync } from 'node:fs';
import { validatePrompts } from '../src/logic/validate';

const file = new URL('../data/prompts.json', import.meta.url);
const data = JSON.parse(readFileSync(file, 'utf8'));
const errors = validatePrompts(data);
if (errors.length) {
  console.error(`✗ ${errors.length} problem(s) in data/prompts.json:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
const answers = (data as { answers: unknown[] }[]).reduce((n, p) => n + p.answers.length, 0);
const modes = (data as { mode: string }[]).reduce<Record<string, number>>((m, p) => ({ ...m, [p.mode]: (m[p.mode] ?? 0) + 1 }), {});
console.log(`✓ data/prompts.json is valid (${data.length} prompts: ${Object.entries(modes).map(([k, v]) => `${v} ${k}`).join(', ')}; ${answers} answers).`);
