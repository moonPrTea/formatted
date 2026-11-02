import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {cp, mkdir, mkdtemp, readdir, rename, rm} from 'node:fs/promises';
import path from 'node:path';
import {selectStudioRuntime} from './studio-runtime.mjs';

const platforms = {darwin: 'osx', win32: 'win', linux: 'linux'};
if (!platforms[process.platform] || !['arm64', 'x64'].includes(process.arch)) {
  throw new Error(
    `Unsupported Studio target: ${process.platform}/${process.arch}`,
  );
}
const hostName = process.platform === 'win32' ? 'dotnet.exe' : 'dotnet';
const localHost = path.resolve('.tools/dotnet', hostName);
const sdk =
  process.env.STUDIO_DOTNET || (existsSync(localHost) ? localHost : 'dotnet');
const environment = {
  ...process.env,
  DOTNET_CLI_HOME: path.resolve('.tools/dotnet-home'),
  NUGET_PACKAGES: path.resolve('.nuget/packages'),
  DOTNET_CLI_TELEMETRY_OPTOUT: '1',
  DOTNET_NOLOGO: '1',
};
const runtime = selectStudioRuntime(
  execFileSync(sdk, ['--list-runtimes'], {
    encoding: 'utf8',
    env: environment,
  }),
);
const installation = path.resolve(runtime.directory, '../..');
const resolverDirectory = path.join(installation, 'host/fxr');
const resolvers = (await readdir(resolverDirectory))
  .filter(version => /^10\.0\.\d+$/.test(version))
  .sort(
    (first, second) =>
      Number(second.split('.')[2]) - Number(first.split('.')[2]),
  );
if (!resolvers.length) {
  throw new Error(
    'The selected .NET installation has no stable .NET 10 host resolver.',
  );
}

// Finish publishing and copying in staging before replacing build outputs.
await mkdir('build', {recursive: true});
const staging = await mkdtemp(path.resolve('build/.studio-service-'));
try {
  const backend = path.join(staging, 'studio-backend');
  const privateRuntime = path.join(staging, 'studio-runtime');
  execFileSync(
    sdk,
    [
      'publish',
      'studio-service/Studio.Service.csproj',
      '-c',
      'Release',
      '--self-contained',
      'false',
      '-p:UseAppHost=false',
      `-p:RuntimeFrameworkVersion=${runtime.version}`,
      '-r',
      `${platforms[process.platform]}-${process.arch}`,
      '-o',
      backend,
    ],
    {stdio: 'inherit', env: environment},
  );
  await mkdir(privateRuntime, {recursive: true});
  await cp(
    path.join(installation, hostName),
    path.join(privateRuntime, hostName),
  );
  await cp(
    path.join(resolverDirectory, resolvers[0]),
    path.join(privateRuntime, 'host/fxr', resolvers[0]),
    {recursive: true},
  );
  await cp(
    path.join(runtime.directory, runtime.version),
    path.join(privateRuntime, 'shared/Microsoft.NETCore.App', runtime.version),
    {recursive: true},
  );
  for (const name of ['LICENSE.txt', 'ThirdPartyNotices.txt']) {
    if (existsSync(path.join(installation, name))) {
      await cp(path.join(installation, name), path.join(privateRuntime, name));
    }
  }
  // Verify the copied host can resolve its own runtime before publishing it.
  execFileSync(path.join(privateRuntime, hostName), ['--list-runtimes'], {
    env: environment,
    stdio: 'inherit',
  });
  for (const name of ['studio-backend', 'studio-runtime']) {
    const destination = path.resolve('build', name);
    await rm(destination, {recursive: true, force: true});
    await rename(path.join(staging, name), destination);
  }
  console.log(
    `Studio backend ready: ${process.platform}/${process.arch}, .NET ${runtime.version}`,
  );
} finally {
  await rm(staging, {recursive: true, force: true});
}
