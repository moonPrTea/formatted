import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Module, {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {packageArchive} from './nuget-fixture.js';

const require = createRequire(import.meta.url);
const {StudioService} = require('../build/electron/studio-service.cjs');
const executable = path.resolve(
  'build/studio-runtime',
  process.platform === 'win32' ? 'dotnet.exe' : 'dotnet',
);
const backend = path.resolve('build/studio-backend/Studio.Service.dll');

test(
  'NuGet restores managed dependency graphs without executing package tools',
  {
    skip:
      !existsSync(executable) && process.env.STUDIO_SERVICE_REQUIRED !== '1',
    timeout: 180000,
  },
  async t => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'studio-nuget-test-'),
    );
    const service = new StudioService(executable, [backend]);
    const originalLoad = Module._load,
      originalFetch = globalThis.fetch;
    Module._load = function (id, ...args) {
      if (id === 'electron') return {app: {getPath: () => directory}};
      return originalLoad.call(this, id, ...args);
    };
    let packageApi;
    try {
      packageApi = require('../build/electron/studio-packages.cjs');
    } finally {
      Module._load = originalLoad;
    }
    const {installPackage, packageReferences, searchPackages} = packageApi;
    t.after(async () => {
      globalThis.fetch = originalFetch;
      service.stop();
      await fs.rm(directory, {recursive: true, force: true});
    });
    const version = async (range, versions) =>
      service.request({operation: 'package-version', range, versions});
    assert.equal(
      await version('[1.0.0,2.0.0)', ['2.0.0', '1.5.0', '1.0.0']),
      '1.0.0',
    );
    assert.equal(
      await version('(1.0.0,2.0.0]', ['1.0.0', '1.0.1-preview', '2.0.0']),
      '2.0.0',
    );
    await assert.rejects(version('[3.0.0]', ['2.0.0']), /Нет стабильной/);

    async function archive(id, assembly, dependency = '', extra = '') {
      return packageArchive([
        [
          `lib/net10.0/${assembly}`,
          await fs.readFile(path.resolve('build/studio-backend', assembly)),
        ],
        [
          `${id}.nuspec`,
          `<package><metadata><id>${id}</id><version>1.0.0</version><dependencies><group targetFramework="net10.0">${dependency}</group></dependencies></metadata></package>`,
        ],
        ...(extra ? [[extra, 'must not execute']] : []),
      ]);
    }
    const dep = await archive(
      'Dependency',
      'NuGet.Versioning.dll',
      '',
      'build/ignored.targets',
    );
    // Roslyn's immutable collections reference is supplied by the framework.
    const root = await archive(
      'Root',
      'Microsoft.CodeAnalysis.dll',
      '<dependency id="Dependency" version="[1.0.0]"/>',
    );
    const native = await archive(
      'Native',
      'NuGet.Versioning.dll',
      '',
      'runtimes/osx-arm64/native/example.dylib',
    );
    const archives = new Map([
      ['dependency', dep],
      ['root', root],
      ['native', native],
    ]);
    let downloads = 0;
    globalThis.fetch = async url => {
      downloads++;
      const location = new URL(url);
      assert.equal(location.hostname, 'api.nuget.org');
      if (location.pathname.endsWith('/index.json'))
        return Response.json({versions: ['1.0.0']});
      const bytes = archives.get(location.pathname.split('/')[2]);
      assert.ok(bytes, String(url));
      return new Response(bytes);
    };
    const rootRef = {id: 'Root', version: '1.0.0'};
    await installPackage(rootRef, service);
    const refs = await packageReferences([
      rootRef,
      {id: 'Dependency', version: '1.0.0'},
    ]);
    assert.equal(refs.length, 2, 'shared dependencies appear once');
    assert.ok(refs.some(file => file.endsWith('NuGet.Versioning.dll')));
    const count = downloads;
    await installPackage(rootRef, service);
    assert.equal(downloads, count, 'validated cache works offline');
    await fs.writeFile(refs[0], 'corrupt');
    await assert.rejects(packageReferences([rootRef]), /Повреждён пакет/);
    await installPackage(rootRef, service);
    assert.equal((await packageReferences([rootRef])).length, 2);
    for (const id of ['root', 'dependency']) {
      assert.deepEqual(
        await fs.readdir(path.join(directory, 'studio-nuget', id)),
        ['1.0.0'],
      );
    }
    await assert.rejects(
      installPackage({id: 'Native', version: '1.0.0'}, service),
      /runtime assets/,
    );
    await assert.rejects(
      packageReferences([rootRef, {id: 'Dependency', version: '2.0.0'}]),
      /Конфликт версий/,
    );

    if (process.env.STUDIO_NUGET_NETWORK === '1') {
      globalThis.fetch = originalFetch;
      const catalog = await searchPackages('packageid:Npgsql');
      assert.ok(
        catalog.some(p => p.id === 'Npgsql'),
        'PostgreSQL shortcut finds the actual driver',
      );
      const npgsql = {id: 'Npgsql', version: '10.0.3'};
      await installPackage(npgsql, service);
      const references = await packageReferences([npgsql]);
      for (const name of [
        'Npgsql',
        'Microsoft.Extensions.Logging.Abstractions',
        'Microsoft.Extensions.DependencyInjection.Abstractions',
      ])
        assert.ok(
          references.some(file => path.basename(file) === name + '.dll'),
          name,
        );
      const compiled = await service.request({
        operation: 'compile',
        references,
        files: {
          'LoginForm.cs': '',
          'LoginForm.Designer.cs': '',
          'Program.cs': `using System; using Npgsql; using NpgsqlTypes;
        class Program { static void Main() {
          using var source = NpgsqlDataSource.Create("Host=localhost;Database=studio_test;Username=studio_test;Timeout=1");
          using var command = source.CreateCommand("select $1::integer");
          command.Parameters.Add(new NpgsqlParameter<int> { TypedValue = 42, NpgsqlDbType = NpgsqlDbType.Integer });
          Console.WriteLine("NPGSQL_READY:" + command.Parameters[0].Value);
        } }`,
        },
      });
      const run = path.join(directory, 'run');
      await fs.mkdir(run);
      const binary = path.join(run, 'StudioUser.dll');
      await fs.writeFile(binary, Buffer.from(compiled.assembly, 'base64'));
      for (const reference of references)
        await fs.copyFile(reference, path.join(run, path.basename(reference)));
      const result = await new Promise((resolve, reject) => {
        const child = spawn(executable, [backend, '--run', binary], {
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 20000,
        });
        let output = '';
        child.stderr.on('data', data => (output += data));
        child.on('error', reject);
        child.on('close', code => resolve({code, output}));
      });
      assert.equal(result.code, 0, result.output);
      assert.match(result.output, /NPGSQL_READY:42/);
    }
  },
);
