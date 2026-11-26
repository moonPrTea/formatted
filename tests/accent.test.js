import test from 'node:test';
import assert from 'node:assert/strict';
import {
  accents,
  readAccent,
  accentTokens,
  contrast,
} from '../build/packages/ui/services/accent.js';

test('Accent preferences reject injected CSS and retain valid custom colors', () => {
  for (const value of [null, {}, '#fff', 'red;display:none', '#ffffff;'])
    assert.equal(readAccent(value), 'default');
  assert.equal(readAccent('#A0B1C2'), '#a0b1c2');
  assert.deepEqual(accentTokens('default', false), {});
});
test('Preset and custom accents keep text, selection and focus readable in both themes', () => {
  for (const dark of [false, true]) {
    for (const color of [
      ...accents.slice(1).map(item => item.id),
      '#000000',
      '#ffffff',
      '#ff0000',
      '#123456',
      '#777777',
    ]) {
      const t = accentTokens(color, dark);
      assert.ok(contrast(t['--accent'], t['--on-accent']) >= 4.5, color);
      assert.ok(
        contrast(t['--accent-strong'], t['--accent-soft']) >= 4.5,
        color,
      );
      assert.ok(
        contrast(dark ? '#e9e9e9' : '#171a23', t['--ui-selection']) >= 4.5,
        color,
      );
      assert.ok(
        contrast(dark ? '#202020' : '#ffffff', t['--ui-focus']) >= 3,
        color,
      );
    }
  }
});
