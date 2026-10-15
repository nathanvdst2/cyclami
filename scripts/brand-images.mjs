// Génère les images de l'identité Cyclami (icônes PNG, logos WebP, image de partage) à partir
// des fichiers SVG de public/ (logo-mark.svg, logo.svg, illustrations/bienvenue.svg).
// À relancer après une retouche du logo :
//   node scripts/brand-images.mjs
//   (Chromium de Playwright requis ; sinon CHROMIUM_PATH=/chemin/vers/chrome node scripts/brand-images.mjs)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const PUB = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'public');
const read = (f) => fs.readFileSync(path.join(PUB, f), 'utf8');
const dataUrl = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

const mark = read('logo-mark.svg');
const logo = read('logo.svg');
const scene = read('illustrations/bienvenue.svg');
const wordmark = logo.match(/<g id="wordmark">[\s\S]*?<\/g>/)?.[0];
const logoWidth = Number(logo.match(/viewBox="0 0 (\d+) 128"/)?.[1]);
if (!wordmark || !logoWidth) throw new Error('logo.svg : groupe « wordmark » ou viewBox introuvable');

// Emblème « plein cadre » (sans coins arrondis), vélo réduit : icônes iOS et Android (zone de sécurité)
function fullBleed(scale) {
  const out = mark
    .replace('rx="28"', 'rx="0"')
    .replace(/<g transform="translate\(([-\d.]+) ([-\d.]+)\) scale\(1\)">/, () => {
      const off = (128 - 128 * scale) / 2;
      return `<g transform="translate(${off} ${off - 6 * scale}) scale(${scale})">`;
    });
  if (out === mark) throw new Error('logo-mark.svg : structure inattendue');
  return out;
}

// Slogan : « Roule avec des cyclistes de ton niveau, près de chez toi »
const FONT = "'Inter', 'Helvetica Neue', Arial, sans-serif";
// Logo vertical : emblème au-dessus du nom (720 × 624), avec slogan (720 × 711)
const vertical = (withSlogan) => `<div style="width:720px;height:${withSlogan ? 711 : 624}px;display:flex;flex-direction:column;align-items:center;justify-content:flex-start">
  <img src="${dataUrl(mark)}" style="width:340px;height:340px;margin-top:24px">
  <svg viewBox="152 0 ${logoWidth - 152} 128" style="width:600px;margin-top:20px">${wordmark}</svg>
  ${withSlogan ? `<div style="margin-top:20px;font:600 30px/1.25 ${FONT};color:#115e59;text-align:center;width:680px">Roule avec des cyclistes de ton niveau,<br>près de chez toi</div>` : ''}
</div>`;

const og = `<div style="width:1200px;height:630px;position:relative;overflow:hidden;background:linear-gradient(135deg,#ecfdf5 0%,#ccfbf1 100%);font-family:${FONT}">
  <div style="position:absolute;right:-60px;top:40px;width:560px;height:560px;opacity:.95"><img src="${dataUrl(scene)}" style="width:100%;height:100%"></div>
  <div style="position:absolute;left:80px;top:78px;display:flex;align-items:center;gap:28px">
    <img src="${dataUrl(logo)}" style="height:116px">
  </div>
  <div style="position:absolute;left:84px;top:240px;width:660px;font-weight:800;font-size:54px;line-height:1.14;color:#134e4a;letter-spacing:-.5px">Roule avec des cyclistes<br>de ton niveau,<br>près de chez toi</div>
  <div style="position:absolute;left:84px;bottom:66px;display:flex;gap:14px;font-weight:700;font-size:26px">
    <span style="background:#0f766e;color:#fff;padding:10px 22px;border-radius:999px">Route</span>
    <span style="background:#10b981;color:#fff;padding:10px 22px;border-radius:999px">VTT / gravel</span>
    <span style="background:#fff;color:#0f766e;padding:10px 22px;border-radius:999px;border:3px solid #0f766e">Loisir</span>
  </div>
  <div style="position:absolute;right:56px;bottom:40px;font-weight:700;font-size:24px;color:#0f766e">Gratuit · Belgique &amp; France</div>
</div>`;

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ deviceScaleFactor: 1 });

async function render(html, w, h, { transparent = true } = {}) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<!doctype html><html><head><style>html,body{margin:0;padding:0;background:transparent}img,svg{display:block}</style></head><body>${html}</body></html>`);
  await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
  await page.evaluate(() => document.fonts.ready);
  return page.screenshot({ omitBackground: transparent, clip: { x: 0, y: 0, width: w, height: h } });
}
const img = (svg, w, h = w) => `<img src="${dataUrl(svg)}" style="width:${w}px;height:${h}px">`;

async function toWebp(png, quality = 0.92) {
  const b64 = await page.evaluate(async ({ src, quality }) => {
    const i = new Image();
    i.src = src;
    await i.decode();
    const c = document.createElement('canvas');
    c.width = i.naturalWidth; c.height = i.naturalHeight;
    c.getContext('2d').drawImage(i, 0, 0);
    return c.toDataURL('image/webp', quality).split(',')[1];
  }, { src: `data:image/png;base64,${png.toString('base64')}`, quality });
  return Buffer.from(b64, 'base64');
}

const out = (name, buf) => { fs.writeFileSync(path.join(PUB, name), buf); console.log(`${name.padEnd(28)} ${buf.length} octets`); };

out('favicon.png', await render(img(mark, 64), 64, 64));
out('icon-192.png', await render(img(mark, 192), 192, 192));
out('icon-512.png', await render(img(mark, 512), 512, 512));
out('apple-touch-icon.png', await render(img(fullBleed(0.86), 180), 180, 180, { transparent: false }));
out('icon-maskable-512.png', await render(img(fullBleed(0.68), 512), 512, 512, { transparent: false }));
out('logo-mark.webp', await toWebp(await render(img(mark, 160), 160, 160)));
out('logo-mark-96.webp', await toWebp(await render(img(mark, 96), 96, 96)));
const sans = await render(vertical(false), 720, 624);
out('logo-sans-slogan.webp', await toWebp(sans));
out('logo-sans-slogan-360.webp', await toWebp(await render(`<div style="transform:scale(.5);transform-origin:0 0">${vertical(false)}</div>`, 360, 312)));
out('logo.webp', await toWebp(await render(vertical(true), 720, 711)));
out('og-image.png', await render(og, 1200, 630, { transparent: false }));

await browser.close();
