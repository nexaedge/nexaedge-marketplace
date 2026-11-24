import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const THEME_COMMAND = fileURLToPath(new URL('../../skills/html-report/scripts/theme.mjs', import.meta.url));
const NEUTRAL_THEME = fileURLToPath(new URL('../../skills/html-report/assets/theme-neutral.css', import.meta.url));
const run = (...args) => spawnSync(process.execPath, [THEME_COMMAND, ...args], { encoding: 'utf8' });

describe('theme.mjs on the command line', () => {
  it('stops with a message when --surface has no value', () => {
    const result = run('check', '#2a78d6,#eb6834', '--surface');
    assert.equal(result.status, 1);
    assert.equal(result.stderr.trim(), '--surface needs a value.');
  });

  it('stops with a message when --surface is not a colour', () => {
    const result = run('check', '#2a78d6,#eb6834', '--surface', 'white');
    assert.equal(result.status, 1);
    assert.equal(result.stderr.trim(), '--surface white is not a hex colour.');
  });

  it('passes the neutral theme', () => {
    const result = run('check', NEUTRAL_THEME);
    assert.equal(result.status, 0, result.stdout);
    assert.match(result.stdout, /→ theme OK/);
  });

  it('names on stderr the tokens derive does not take from the brand colour', () => {
    const result = run('derive', '--brand', '#F5C400');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /^light: --brand is #[0-9a-f]{6}, the step of the brand hue nearest #F5C400 that reaches 3:1/m);
    assert.match(result.stdout, /\/\* THEME \*\//);
  });

  it('refuses a dark page that is too light, with the reason and no stack trace', () => {
    const result = run('derive', '--brand', '#2a78d6', '--surface-dark', '#555555');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /^--surface-dark #555555 has OKLab lightness 0\.\d\d; derive makes the dark mode on a page of 0\.28 or less\.$/m);
    assert.doesNotMatch(result.stderr, /at /);
  });

  it('defaults the text over a falling ramp to the neutral light mode\'s', () => {
    const result = run('ramp', '#e8eef4,#c8d8e6,#9db9d2,#6f95b8,#456f99,#28496e,#12263c');
    assert.equal(result.status, 0);
    assert.match(result.stdout, /--on-flip: 4/);
  });
});
