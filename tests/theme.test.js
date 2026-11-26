import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

for (const mode of ['light', 'dark']) {
  test(`${mode} theme uses readable text, syntax and tags`, () => {
    const source = readFileSync(
      new URL('../packages/ui/assets/css/theme.css', import.meta.url),
      'utf8',
    );
    const shared = readFileSync(
      new URL('../src/ui.css', import.meta.url),
      'utf8',
    );
    const parts = text => text.split(":root[data-theme='dark']");
    const [light, dark] = parts(source);
    const [lightUi, darkUi] = parts(shared);
    const colors = light + lightUi + (mode === 'dark' ? dark + darkUi : '');
    const tokens = Object.fromEntries(
      [...colors.matchAll(/--([\w-]+):\s*(#[\da-f]{6});/gi)].map(
        ([, name, value]) => [name, value],
      ),
    );
    const luminance = value => {
      const channels = value
        .slice(1)
        .match(/../g)
        .map(v => parseInt(v, 16) / 255)
        .map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    for (const [foreground, background] of [
      ['text', 'panel'],
      ['text', 'bg'],
      ['muted', 'panel'],
      ['muted', 'soft'],
      ['on-accent', 'accent'],
      ['accent-strong', 'accent-soft'],
      ['positive', 'positive-soft'],
      ['negative', 'negative-soft'],
      ['info-text', 'accent-soft'],
      ['text', 'ui-selection'],
      ...['keyword', 'string', 'number', 'comment', 'identifier', 'plain'].map(
        name => [`syntax-${name}`, 'soft'],
      ),
      ...['blue', 'mint', 'peach', 'rose'].map(name => [
        `tag-${name}-text`,
        `tag-${name}-bg`,
      ]),
    ]) {
      const a = luminance(tokens[foreground]);
      const b = luminance(tokens[background]);
      const contrast = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      assert.ok(
        contrast >= 4.5,
        `${foreground} / ${background}: ${contrast.toFixed(2)} must be at least 4.5`,
      );
    }
  });
}
