// Run: ./node_modules/.bin/electron scripts/render-icon.js
// Renders menubar-icon.svg to PNGs using Electron's browser engine.
const { app, BrowserWindow, ipcMain, nativeImage } = require('electron');
const path = require('path');
const fs   = require('fs');

const SVG_PATH  = path.join(__dirname, '../public/brand/menubar-icon.svg');
const OUT_DIR   = path.join(__dirname, '../public/brand');
const RENDER_SIZE = 512;

const svgContent = fs.readFileSync(SVG_PATH, 'utf8');

// Inline HTML: draws the SVG onto a canvas at RENDER_SIZE, sends back PNG data URL
const html = `<!DOCTYPE html><html><body style="margin:0;background:transparent">
<canvas id="c" width="${RENDER_SIZE}" height="${RENDER_SIZE}"></canvas>
<script>
  const svg = ${JSON.stringify(svgContent)};
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url  = URL.createObjectURL(blob);
  const img  = new Image();
  img.onload = () => {
    const c = document.getElementById('c');
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, ${RENDER_SIZE}, ${RENDER_SIZE});
    ctx.drawImage(img, 0, 0, ${RENDER_SIZE}, ${RENDER_SIZE});
    require('electron').ipcRenderer.send('icon-rendered', c.toDataURL('image/png'));
  };
  img.src = url;
</script></body></html>`;

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: RENDER_SIZE,
    height: RENDER_SIZE,
    show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });

  ipcMain.once('icon-rendered', (_, dataUrl) => {
    const buf = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
    const full = nativeImage.createFromBuffer(buf);

    const img2x = full.resize({ width: 44, height: 44, quality: 'best' });
    const img1x = full.resize({ width: 18, height: 18, quality: 'best' });

    fs.writeFileSync(path.join(OUT_DIR, 'menubar-icon@2x.png'), img2x.toPNG());
    fs.writeFileSync(path.join(OUT_DIR, 'menubar-icon.png'),    img1x.toPNG());

    console.log('Written: menubar-icon.png (18px) and menubar-icon@2x.png (44px)');
    app.quit();
  });

  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
});
