import {app, BrowserWindow} from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';

async function run() {
  const assets = path.resolve(__dirname, '../../packages/ui/assets');
  const svg = await fs.readFile(path.join(assets, 'forma.svg'), 'utf8');
  await app.whenReady();
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await window.loadURL('data:text/html,<html><body></body></html>');
  const pngs = new Map<number, Buffer>();
  for (const size of [16, 32, 64, 128, 256, 512, 1024]) {
    const data = await window.webContents.executeJavaScript(`(async () => {
      const image = new Image();
      image.src = ${JSON.stringify('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'))};
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = ${size};
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(${size * 0.06}, ${size * 0.06}, ${size * 0.88}, ${size * 0.88}, ${size * 0.18});
      ctx.fill();
      ctx.drawImage(image, ${size * 0.16}, ${size * 0.16}, ${size * 0.68}, ${size * 0.68});
      return canvas.toDataURL('image/png').split(',')[1];
    })()`);
    pngs.set(size, Buffer.from(data, 'base64'));
  }
  await fs.writeFile(path.join(assets, 'forma.png'), pngs.get(512)!);
  // Windows ICO supports a PNG payload for its 256px image.
  const png = pngs.get(256)!;
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);
  await fs.writeFile(
    path.join(assets, 'forma.ico'),
    Buffer.concat([header, png]),
  );
  if (process.platform === 'darwin') {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'forma-icons-'));
    const iconset = path.join(temp, 'forma.iconset');
    await fs.mkdir(iconset);
    for (const size of [16, 32, 128, 256, 512]) {
      await fs.writeFile(
        path.join(iconset, `icon_${size}x${size}.png`),
        pngs.get(size)!,
      );
      await fs.writeFile(
        path.join(iconset, `icon_${size}x${size}@2x.png`),
        pngs.get(size * 2)!,
      );
    }
    execFileSync('/usr/bin/iconutil', [
      '-c',
      'icns',
      '-o',
      path.join(assets, 'forma.icns'),
      iconset,
    ]);
  }
  console.log('Desktop icons generated from packages/ui/assets/forma.svg');
  app.quit();
}
run().catch(error => {
  console.error(error);
  app.exit(1);
});
