import test from 'node:test';
import assert from 'node:assert/strict';
import {packageIconUrl} from '../../build/studio/app/services/model.js';

test('NuGet icons accept only HTTPS hosted package icons', () => {
  const valid =
    'https://api.nuget.org/v3-flatcontainer/newtonsoft.json/13.0.3/icon';
  assert.equal(packageIconUrl(valid), valid);
  for (const value of [
    undefined,
    {},
    'javascript:alert(1)',
    'data:image/svg+xml,test',
    valid.replace('https:', 'http:'),
    valid.replace('api.nuget.org', 'api.nuget.org.evil.test'),
    valid + '?tracking=1',
    valid.replace('/icon', '/../index.json'),
  ]) {
    assert.equal(packageIconUrl(value), undefined);
  }
});
