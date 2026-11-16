import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {StudioService} from '../build/electron/studio-service.cjs';
import {initialProject} from '../build/src/studio/model.js';

const executable = path.resolve(
  'build/studio-runtime',
  process.platform === 'win32' ? 'dotnet.exe' : 'dotnet',
);

test(
  'a rejected Studio request does not cache unapplied package references',
  {
    skip:
      !existsSync(executable) && process.env.STUDIO_SERVICE_REQUIRED !== '1',
  },
  async t => {
    const backendDirectory = path.resolve('build/studio-backend');
    const service = new StudioService(executable, [
      path.join(backendDirectory, 'Studio.Service.dll'),
    ]);
    t.after(() => service.stop());

    const references = [path.join(backendDirectory, 'NuGet.Versioning.dll')];
    const files = {
      ...initialProject.files,
      'Program.cs': `${initialProject.files['Program.cs']}
internal static class ReferenceProbe
{
    internal static NuGet.Versioning.NuGetVersion Version = new(1, 0, 0);
}`,
    };
    const oversizedFiles = {...files, 'Program.cs': 'x'.repeat(100001)};

    for (const requestedReferences of [references, []]) {
      await assert.rejects(
        service.request({
          operation: 'analyze',
          files: oversizedFiles,
          references: requestedReferences,
        }),
        /File too large/,
      );

      const result = await service.request({
        operation: 'analyze',
        files,
        references: requestedReferences,
      });
      const errors = result.diagnostics.filter(
        diagnostic => diagnostic.severity === 'error',
      );

      if (requestedReferences.length) {
        assert.deepEqual(errors, []);
      } else {
        assert.ok(errors.some(diagnostic => diagnostic.code === 'CS0246'));
      }
    }
  },
);
