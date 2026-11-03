import {app} from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import type {PackageReference, PackageResult} from '../src/studio/model.js';
import type {StudioService} from './studio-service.cjs';
import {publishPackageCache} from './package-cache.cjs';

const cacheRoot = () => path.join(app.getPath('userData'), 'studio-nuget');
const folder = (p: PackageReference) =>
  path.join(cacheRoot(), p.id.toLowerCase(), p.version.toLowerCase());
async function validate(value: unknown) {
  return (await import('../src/studio/model.js')).readPackages(value);
}
async function download(url: string, limit: number) {
  const parsed = new URL(url);
  if (
    parsed.protocol !== 'https:' ||
    !(parsed.hostname === 'nuget.org' || parsed.hostname.endsWith('.nuget.org'))
  )
    throw new Error('Недопустимый источник NuGet');
  const response = await globalThis.fetch(url, {
    signal: AbortSignal.timeout(30000),
    redirect: 'error',
  });
  if (!response.ok || !response.body)
    throw new Error(`NuGet: HTTP ${response.status}`);
  if (Number(response.headers.get('content-length')) > limit)
    throw new Error('Слишком большой ответ NuGet');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > limit) throw new Error('Слишком большой ответ NuGet');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
export async function searchPackages(query: string): Promise<PackageResult[]> {
  const {packageIconUrl} = await import('../src/studio/model.js');
  if (typeof query !== 'string' || query.length > 100)
    throw new Error('Слишком длинный запрос');
  const index = JSON.parse(
    (await download('https://api.nuget.org/v3/index.json', 100000)).toString(),
  );
  const resource = index.resources.find(
    (r: Record<string, string>) =>
      r['@type'] === 'SearchQueryService/3.5.0' ||
      r['@type'] === 'SearchQueryService',
  );
  if (!resource) throw new Error('Поиск NuGet недоступен');
  const url = new URL(resource['@id']);
  url.search = new URLSearchParams({
    q: query,
    take: '12',
    prerelease: 'false',
  }).toString();
  const result = JSON.parse((await download(url.href, 2000000)).toString());
  const packages: PackageResult[] = [];
  for (const p of result.data.slice(0, 12)) {
    const [ref] = await validate([{id: p.id, version: p.version}]);
    const versions: string[] = [];
    for (const entry of (p.versions ?? []).slice(-20).reverse()) {
      try {
        await validate([{id: ref.id, version: entry.version}]);
        versions.push(entry.version);
      } catch {
        /* Ignore nonstandard versions in search results. */
      }
    }
    packages.push({
      ...ref,
      iconUrl: packageIconUrl(p.iconUrl),
      description: String(p.description ?? '').slice(0, 350),
      authors: (Array.isArray(p.authors)
        ? p.authors.join(', ')
        : String(p.authors ?? '')
      ).slice(0, 180),
      downloads:
        Number.isSafeInteger(p.totalDownloads) && p.totalDownloads >= 0
          ? p.totalDownloads
          : 0,
      versions: [...new Set([ref.version, ...versions])],
    });
  }
  return packages;
}
export async function packageReferences(value: unknown): Promise<string[]> {
  const packages = await validate(value ?? []);
  const references: string[] = [],
    names = new Set<string>(),
    visited = new Map<string, string>();
  const visit = async (p: PackageReference) => {
    const key = p.id.toLowerCase();
    if (visited.has(key)) {
      if (visited.get(key) !== p.version)
        throw new Error(
          `Конфликт версий ${p.id}: переустанови пакеты с совместимыми версиями`,
        );
      return;
    }
    if (visited.size >= 60) throw new Error('Слишком много зависимостей NuGet');
    visited.set(key, p.version);
    const directory = folder(p);
    let manifest;
    try {
      manifest = JSON.parse(
        await fs.readFile(path.join(directory, 'manifest.json'), 'utf8'),
      );
    } catch {
      throw new Error(`Восстанови пакет ${p.id} ${p.version} в NuGet`);
    }
    if (
      typeof manifest.id !== 'string' ||
      manifest.id.toLowerCase() !== p.id.toLowerCase() ||
      manifest.version !== p.version ||
      !manifest.hashes ||
      Object.keys(manifest.hashes).length > 100
    )
      throw new Error('Повреждён кэш NuGet');
    if (manifest.requirements?.length && !manifest.dependencies)
      throw new Error(`Восстанови зависимости ${p.id} в NuGet`);
    for (const dependency of await validate(manifest.dependencies ?? []))
      await visit(dependency);
    for (const [name, hash] of Object.entries(manifest.hashes)) {
      if (!/^[A-Za-z0-9_.-]+\.dll$/.test(name) || names.has(name.toLowerCase()))
        throw new Error('Конфликт сборок NuGet');
      const file = path.join(directory, name);
      if (
        (await fs.stat(file)).size > 30_000_000 ||
        createHash('sha256')
          .update(await fs.readFile(file))
          .digest('hex')
          .toUpperCase() !== hash
      )
        throw new Error(`Повреждён пакет ${p.id}; установи его повторно`);
      names.add(name.toLowerCase());
      references.push(file);
    }
  };
  for (const p of packages) await visit(p);
  return references;
}
// Serial installs prevent competing cache renames for shared dependencies.
let installing: Promise<unknown> = Promise.resolve();
export function installPackage(value: unknown, service: StudioService) {
  const next = installing.then(() => restorePackage(value, service));
  installing = next.catch(() => {});
  return next;
}
async function restorePackage(value: unknown, service: StudioService) {
  const [p] = await validate([value]);
  try {
    await packageReferences([p]);
    return;
  } catch {
    /* Restore absent or damaged cache below. */
  }
  await fs.mkdir(cacheRoot(), {recursive: true});
  const temp = await fs.mkdtemp(path.join(cacheRoot(), '.download-'));
  try {
    const staged = new Map<
      string,
      {ref: PackageReference; directory: string}
    >();
    const references: string[] = [];
    let total = 0;
    const restore = async (ref: PackageReference, depth = 0): Promise<void> => {
      const id = ref.id.toLowerCase(),
        version = ref.version.toLowerCase();
      const previous = staged.get(id);
      if (previous) {
        if (previous.ref.version !== ref.version)
          throw new Error(
            `Конфликт зависимостей ${ref.id}: ${previous.ref.version} и ${ref.version}`,
          );
        return;
      }
      if (depth > 12 || staged.size >= 60)
        throw new Error('Слишком большой граф зависимостей NuGet');
      const directory = path.join(temp, String(staged.size));
      staged.set(id, {ref, directory});
      const bytes = await download(
        `https://api.nuget.org/v3-flatcontainer/${id}/${version}/${id}.${version}.nupkg`,
        30_000_000,
      );
      total += bytes.length;
      if (total > 150_000_000)
        throw new Error('Зависимости NuGet слишком велики');
      const archive = directory + '.nupkg';
      await fs.writeFile(archive, bytes);
      const manifest = (await service.request({
        operation: 'package-install',
        archive,
        destination: directory,
        packageId: ref.id,
        version: ref.version,
      })) as {
        hashes: Record<string, string>;
        requirements: {id: string; range: string}[];
        dependencies?: PackageReference[];
      };
      manifest.dependencies = [];
      for (const dependency of manifest.requirements) {
        // Validate IDs before interpolating them into a URL.
        await validate([{id: dependency.id, version: '0.0.0'}]);
        const index = JSON.parse(
          (
            await download(
              `https://api.nuget.org/v3-flatcontainer/${dependency.id.toLowerCase()}/index.json`,
              500_000,
            )
          ).toString(),
        );
        const selected = (await service.request({
          operation: 'package-version',
          range: dependency.range,
          versions: index.versions,
        })) as string;
        const [resolved] = await validate([
          {id: dependency.id, version: selected},
        ]);
        manifest.dependencies.push(resolved);
        await restore(resolved, depth + 1);
      }
      await fs.writeFile(
        path.join(directory, 'manifest.json'),
        JSON.stringify(manifest),
      );
      references.push(
        ...Object.keys(manifest.hashes).map(name => path.join(directory, name)),
      );
    };
    await restore(p);
    await service.request({operation: 'package-validate', references});
    // Publish only after every archive, dependency and assembly has been checked.
    // Dependencies precede their root, so an interrupted restore can be retried.
    for (const {ref, directory} of [...staged.values()].reverse()) {
      await publishPackageCache(directory, folder(ref));
    }
  } finally {
    // Only this operation's temporary download directory, never project files.
    await fs.rm(temp, {recursive: true, force: true});
  }
}
