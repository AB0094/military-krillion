import { normalize } from './normalize';
import { DAILY_SIZE } from './seed';

/** Returns a list of human-readable problems; empty means the data is valid. */
export function validatePrompts(data: unknown): string[] {
  const errors: string[] = [];
  if (!Array.isArray(data)) return ['Root must be an array of prompts.'];

  const ids = new Set<string>();
  const texts = new Set<string>();
  const perMode: Record<string, number> = { Ground: 0, Air: 0 };

  data.forEach((raw, i) => {
    const where = `prompt[${i}]${raw && typeof raw === 'object' && 'id' in raw ? ` (${String((raw as { id: unknown }).id)})` : ''}`;
    if (!raw || typeof raw !== 'object') return void errors.push(`${where}: must be an object.`);
    const p = raw as Record<string, unknown>;

    if (typeof p.id !== 'string' || !p.id.trim()) errors.push(`${where}: missing id.`);
    else if (ids.has(p.id)) errors.push(`${where}: duplicate id.`);
    else ids.add(p.id);

    if (p.mode !== 'Ground' && p.mode !== 'Air') errors.push(`${where}: mode must be "Ground" or "Air".`);
    else perMode[p.mode]++;

    if (typeof p.text !== 'string' || !p.text.trim()) errors.push(`${where}: missing text.`);
    else {
      const t = normalize(p.text);
      if (texts.has(t)) errors.push(`${where}: duplicate prompt text.`);
      texts.add(t);
    }

    if (p.detail !== undefined && (typeof p.detail !== 'string' || !p.detail.trim())) errors.push(`${where}: detail must be a non-empty string when present.`);
    if (p.fact !== undefined && (typeof p.fact !== 'string' || !p.fact.trim())) errors.push(`${where}: fact must be a non-empty string when present.`);

    if (!Array.isArray(p.answers) || p.answers.length === 0) return void errors.push(`${where}: needs at least one answer.`);

    const seen = new Map<string, string>(); // normalized form -> owning answer name
    p.answers.forEach((a: unknown, j: number) => {
      const aw = `${where} answer[${j}]`;
      if (!a || typeof a !== 'object') return void errors.push(`${aw}: must be an object.`);
      const ans = a as Record<string, unknown>;
      if (typeof ans.name !== 'string' || !ans.name.trim()) return void errors.push(`${aw}: missing name.`);
      if (!Array.isArray(ans.aliases) || ans.aliases.some((x) => typeof x !== 'string')) errors.push(`${aw} "${ans.name}": aliases must be an array of strings.`);
      if (typeof ans.weight !== 'number' || !(ans.weight > 0 && ans.weight <= 1)) errors.push(`${aw} "${ans.name}": weight must be a number in (0, 1].`);

      const forms = [ans.name, ...(Array.isArray(ans.aliases) ? ans.aliases.filter((x): x is string => typeof x === 'string') : [])];
      const own = new Set<string>();
      for (const f of forms) {
        const key = normalize(f);
        if (!key) { errors.push(`${aw} "${ans.name}": empty name/alias "${f}".`); continue; }
        if (own.has(key)) continue; // an alias repeating its own answer is harmless
        own.add(key);
        const owner = seen.get(key);
        if (owner !== undefined) errors.push(`${where}: "${f}" duplicates an answer/alias of "${owner}".`);
        else seen.set(key, ans.name as string);
      }
    });
  });

  for (const m of ['Ground', 'Air']) {
    if (perMode[m] < DAILY_SIZE) errors.push(`Need at least ${DAILY_SIZE} ${m} prompts for a full daily set (found ${perMode[m]}).`);
  }
  return errors;
}
