import fs from 'node:fs';
import path from 'node:path';
import {randomUUID, createHash} from 'node:crypto';

export const digest = (text: string) =>
  createHash('sha256').update(text).digest('hex');
export function readText(file: string): string {
  const handle = fs.openSync(file, 'r');
  try {
    if (
      !fs.fstatSync(handle).isFile() ||
      fs.fstatSync(handle).size > 8 * 1024 * 1024
    )
      throw new Error('File is too large');
    return fs.readFileSync(handle, 'utf8');
  } finally {
    fs.closeSync(handle);
  }
}
export function atomicWrite(file: string, text: string) {
  const temporary = path.join(path.dirname(file), `.${randomUUID()}.tmp`);
  try {
    const handle = fs.openSync(temporary, 'wx', 0o600);
    try {
      fs.writeFileSync(handle, text, 'utf8');
      fs.fsyncSync(handle);
    } finally {
      fs.closeSync(handle);
    }
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

export async function atomicWriteAsync(file: string, text: string) {
  const temporary = path.join(path.dirname(file), `.${randomUUID()}.tmp`);
  try {
    const handle = await fs.promises.open(temporary, 'wx', 0o600);
    try {
      await handle.writeFile(text, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.promises.rename(temporary, file);
  } finally {
    await fs.promises.unlink(temporary).catch(error => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}
