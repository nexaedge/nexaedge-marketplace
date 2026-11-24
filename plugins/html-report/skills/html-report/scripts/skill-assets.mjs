// Where the skill's shared assets live, and the neutral theme among them.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { THEME_BLOCK, blocksByMode } from './theme-rules.mjs';

export const SKILL_ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets');

// The neutral theme by mode, as blocksByMode reads it.
export function neutralTheme() {
  const css = fs.readFileSync(path.join(SKILL_ASSETS, 'theme-neutral.css'), 'utf8');
  return blocksByMode(css.match(THEME_BLOCK)[1]);
}
