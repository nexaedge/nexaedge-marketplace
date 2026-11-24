#!/usr/bin/env node
// theme.mjs: the theme toolkit of html-report. No dependencies, Node 18+. Run it with no
// command for the usage; references/themes.md says when to use each command.

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { neutralTheme } from './skill-assets.mjs';
import {
  THEME_BLOCK, DARK_SURFACE, ThemeError, blocksByMode, checkRamp, checkSeries, checkTheme, deriveTheme, fillTheme,
  isHex, newFindings, oklab, themeBlock,
} from './theme-rules.mjs';

const ARGS = process.argv.slice(2);
const COMMAND = ARGS[0];
// This script by its absolute path, for the commands it prints to run next.
const THEME_COMMAND = `node "${fileURLToPath(import.meta.url)}"`;

function exitWith(message) {
  console.error(message);
  process.exit(1);
}

// The value after `name`, or `fallback` when the option is absent; a missing value stops the command.
function option(name, fallback) {
  const i = ARGS.indexOf(name);
  if (i === -1) return fallback;
  const value = ARGS[i + 1];
  if (value === undefined || value.startsWith('--')) exitWith(`${name} needs a value.`);
  return value;
}

function colorOption(name, fallback) {
  const value = option(name, fallback);
  if (value !== undefined && !isHex(value)) exitWith(`${name} ${value} is not a hex colour.`);
  return value;
}

function printFindings(findings) {
  for (const { heading, items } of findings.sections) {
    console.log(`\n${heading}`);
    for (const item of items) {
      console.log(item.text !== undefined ? `  ${item.text}` : `  [${item.state}] ${item.label.padEnd(26)} ${item.detail}`);
    }
  }
}

function themeBlockOf(path) {
  if (!fs.existsSync(path)) exitWith(`No file at ${path}.`);
  const match = fs.readFileSync(path, 'utf8').match(THEME_BLOCK);
  if (!match) {
    exitWith(`No /* THEME */ … /* /THEME */ block in ${path}.\n` +
      'The file was not written with this skill, or the markers are gone.');
  }
  return match[1];
}

const colorList = (list) => list.split(',').map((color) => color.trim()).filter(Boolean);

function cmdExtract(path) {
  console.log('/* THEME */' + themeBlockOf(path) + '/* /THEME */');
}

function cmdCheck(target) {
  if (!target) exitWith('usage: check <file> | check "#hex,#hex,…" [--surface #hex]');
  const findings = newFindings();
  if (target.includes('#') && !fs.existsSync(target)) {
    const colors = colorList(target);
    const passes = checkSeries(findings, colors, colorOption('--surface', '#ffffff'));
    printFindings(findings);
    process.exit(passes ? 0 : 1);
  }
  console.log(`Theme of ${target}`);
  const passes = checkTheme(findings, themeBlockOf(target));
  printFindings(findings);
  console.log(passes ? '\n→ theme OK' : '\n→ fix what is marked FAIL');
  process.exit(passes ? 0 : 1);
}

// A ramp that rises is a dark mode's, one that falls a light mode's; the text over it defaults
// to the neutral theme's --on-lo and --on-hi of that mode.
function cmdRamp(list) {
  if (!list) exitWith('usage: ramp "#hex,#hex,…" [--on-lo #hex] [--on-hi #hex]');
  const colors = colorList(list);
  if (!colors.every(isHex)) exitWith(`Not a list of colours: ${list}`);
  const rises = oklab(colors[0]).L < oklab(colors[colors.length - 1]).L;
  const [neutralMode] = neutralTheme()[rises ? 'dark' : 'light'];
  const onLo = colorOption('--on-lo', neutralMode['--on-lo']);
  const onHi = colorOption('--on-hi', neutralMode['--on-hi']);
  const findings = newFindings();
  const passes = checkRamp(findings, colors, rises, onLo, onHi);
  printFindings(findings);
  process.exit(passes ? 0 : 1);
}

function cmdDerive() {
  const brand = colorOption('--brand');
  if (!brand) exitWith(`usage: derive --brand #hex [--ink #hex] [--surface #ffffff] [--surface-dark ${DARK_SURFACE}]`);
  const surface = colorOption('--surface', '#ffffff');
  const surfaceDark = colorOption('--surface-dark', DARK_SURFACE);
  let derived;
  try {
    derived = deriveTheme({ brand, ink: colorOption('--ink'), surface, surfaceDark, neutral: neutralTheme() });
  } catch (error) {
    if (error instanceof ThemeError) exitWith(error.message);
    throw error;
  }
  const { light: lightMode, dark: darkMode, notes } = derived;
  for (const note of notes) console.error(note);

  console.log(themeBlock(lightMode, darkMode));
  console.log(`
Still to choose: --c2..--c6 in both modes, hues that separate from --c1, each mode
validated against its own page. Propose them and run
  ${THEME_COMMAND} check "${lightMode['--c1']},#hex,#hex,…" --surface ${surface}
  ${THEME_COMMAND} check "${darkMode['--c1']},#hex,#hex,…" --surface ${surfaceDark}
until they pass; slot order is the mechanism, so the same colours in another order can
fail. Then write them in the three rules (the dark values go in both dark rules, with the
same content), save the block to a file and run
  ${THEME_COMMAND} check <file>`);
}

function cmdFill(path) {
  try {
    const { light: lightMode, dark: darkMode, added } = fillTheme(blocksByMode(themeBlockOf(path)));
    console.log(themeBlock(lightMode, darkMode));
    console.error(added.length ? added.join('\n') : 'Nothing to fill: the theme has every token.');
  } catch (error) {
    if (error instanceof ThemeError) exitWith(error.message);
    throw error;
  }
}

switch (COMMAND) {
  case 'extract': cmdExtract(ARGS[1]); break;
  case 'check':   cmdCheck(ARGS[1]); break;
  case 'ramp':    cmdRamp(ARGS[1]); break;
  case 'derive':  cmdDerive(); break;
  case 'fill':    cmdFill(ARGS[1]); break;
  default:
    console.log(`theme.mjs: the theme toolkit of html-report

  extract <file>                     print the /* THEME */ block (light and dark) of a report or a theme file
  check   <file>                     check the three rules and both modes of the theme in a report or a theme file
  check   "#hex,#hex,…" [--surface #hex]  check a candidate series palette (light or dark, by the surface)
  ramp    "#hex,…" [--on-lo #hex] [--on-hi #hex]  check a ramp, in either direction, and measure its --on-flip;
                                     the text over it defaults to the neutral theme's of that direction's mode
  derive  --brand #hex [--ink #hex] [--surface #hex] [--surface-dark #hex]   propose both modes from a brand colour;
                                     stderr names each of --brand, --accent and --c1 that is not the brand colour, and why
  fill    <file>                     print the theme with the tokens it lacks added, both modes;
                                     each added value is named on stderr, and no value is changed

It does not simulate colour-vision deficiency: for that, and for the choice of chart
form, use the dataviz skill.`);
}
