import test from 'node:test';
import assert from 'node:assert/strict';
import {selectStudioRuntime} from '../scripts/studio-runtime.mjs';

test('Studio runtime selection ignores previews and other framework versions', () => {
  const selected = selectStudioRuntime(
    [
      'Microsoft.AspNetCore.App 10.0.99 [/sdk/shared/Microsoft.AspNetCore.App]',
      'Microsoft.NETCore.App 10.0.9 [/sdk/shared/Microsoft.NETCore.App]',
      'Microsoft.NETCore.App 10.0.13 [/sdk/shared/Microsoft.NETCore.App]',
      'Microsoft.NETCore.App 11.0.0 [/sdk/shared/Microsoft.NETCore.App]',
      'Microsoft.NETCore.App 10.0.14-preview.1 [/sdk/shared/Microsoft.NETCore.App]',
    ].join('\n'),
  );
  assert.equal(selected.version, '10.0.13');
  assert.equal(selected.directory, '/sdk/shared/Microsoft.NETCore.App');
});

test('Studio runtime selection preserves Windows paths with spaces and CRLF', () => {
  const directory = 'C:\\Program Files\\dotnet\\shared\\Microsoft.NETCore.App';
  assert.equal(
    selectStudioRuntime(`Microsoft.NETCore.App 10.0.3 [${directory}]\r\n`)
      .directory,
    directory,
  );
});

test('Studio build rejects missing or preview-only runtimes instead of copying stale output', () => {
  for (const output of [
    '',
    'Microsoft.NETCore.App 9.0.3 [/sdk]',
    'Microsoft.NETCore.App 10.0.0-preview.1 [/sdk]',
  ]) {
    assert.throws(() => selectStudioRuntime(output), /stable .NET 10/);
  }
});
