import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {generateDataset} from '../../build/packages/practice/src/generator.js';
import {html} from '../../build/packages/ui/services/dom.js';

test('TypeScript migration preserves version-1 datasets and assignments', () => {
  const baseline = {
    retail: '85e2f4b25d7471533863ed95e5e4a994edd8884af4b22ec69065c9e49bf7d0a1',
    library: 'caa3ce8d152fc6f065c0feb81c2e811069e860772d337d9907953d1412e1c4a6',
    courses: 'df57440ffdb891ba4ba1205d0417228bebb78c421d763b9bbdc45f327cef9d25',
  };
  for (const [domain, expected] of Object.entries(baseline)) {
    const data = generateDataset({
      domain,
      seed: 'MIGRATION',
      size: 60,
      difficulty: 'advanced',
      generatorVersion: 1,
    });
    delete data.config.generatorVersion;
    assert.equal(
      createHash('sha256').update(JSON.stringify(data)).digest('hex'),
      expected,
    );
  }
});

test('HTML templates preserve interpolated markup and numbers', () => {
  assert.equal(html`<p>${0}${'<b>text</b>'}</p>`, '<p>0<b>text</b></p>');
});
