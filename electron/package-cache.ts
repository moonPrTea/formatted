import fs from 'node:fs/promises';
import path from 'node:path';

async function exists(file: string): Promise<boolean> {
  try {
    await fs.lstat(file);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

/** Publishes checked files. Callers must serialize replacements for this cache. */
export async function publishPackageCache(source: string, destination: string) {
  await fs.mkdir(path.dirname(destination), {recursive: true});
  const backup = destination + '.previous';
  // Recover an interrupted rename, or remove a backup of an already published cache.
  if (await exists(backup)) {
    if (await exists(destination)) await fs.rm(backup, {recursive: true});
    else await fs.rename(backup, destination);
  }
  const replacing = await exists(destination);
  if (replacing) await fs.rename(destination, backup);
  try {
    await fs.rename(source, destination);
  } catch (error) {
    if (replacing) {
      try {
        await fs.rename(backup, destination);
      } catch (recoveryError) {
        // Keep the backup outside the caller's temporary download directory.
        throw new AggregateError(
          [error, recoveryError],
          `NuGet cache backup retained at ${backup}`,
        );
      }
    }
    throw error;
  }
  if (replacing) await fs.rm(backup, {recursive: true});
}
