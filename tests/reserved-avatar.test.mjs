// Photo de profil réservée : l'image et ses copies (réduite, JPEG sur fond noir, recadrée) sont reconnues,
// les autres images non. Usage : node tests/reserved-avatar.test.mjs
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../src/lib/reservedAvatar.js', import.meta.url), 'utf8').replace(/^export /gm, '');
const reserved = fs.readFileSync(new URL('./fixtures/reserved-avatar.webp', import.meta.url)).toString('base64');
const logo = fs.readFileSync(new URL('../public/logo.webp', import.meta.url)).toString('base64');
const og = fs.readFileSync(new URL('../public/og-image.png', import.meta.url)).toString('base64');

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage();
await page.setContent('<!doctype html><body></body>');
await page.addScriptTag({ content: `${src}\nwindow.isReservedAvatar = isReservedAvatar;` });
const result = await page.evaluate(async ({ reserved, logo, og }) => {
  const file = async (b64, type, name) => new File([await (await fetch(`data:${type};base64,${b64}`)).blob()], name, { type });
  const load = (f) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = URL.createObjectURL(f); });
  // copie : réduite, sur fond noir, en JPEG ; recadrage carré sur fond blanc
  const original = await file(reserved, 'image/webp', 'a.webp');
  const img = await load(original);
  const variant = async (w, h, bg, square, pad = 0) => {
    const c = document.createElement('canvas'); c.width = w + 2 * pad; c.height = h + 2 * pad * 2;
    const g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
    g.translate(pad, pad * 2);
    if (square) { const s = Math.min(img.naturalWidth, img.naturalHeight); g.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, w, h); } else g.drawImage(img, 0, 0, w, h);
    return new File([await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.6))], 'b.jpg', { type: 'image/jpeg' });
  };
  return {
    original: await window.isReservedAvatar(original),
    smallBlack: await window.isReservedAvatar(await variant(240, 219, '#000', false)),
    square: await window.isReservedAvatar(await variant(512, 512, '#fff', true)),
    // capture d'écran : image au milieu de larges marges noires
    padded: await window.isReservedAvatar(await variant(400, 365, '#000', false, 150)),
    logo: await window.isReservedAvatar(await file(logo, 'image/webp', 'logo.webp')),
    og: await window.isReservedAvatar(await file(og, 'image/png', 'og.png')),
  };
}, { reserved, logo, og });
await browser.close();
assert.deepEqual(result, { original: true, smallBlack: true, square: true, padded: true, logo: false, og: false });
console.log('✅ photo de profil réservée : copies reconnues, autres images acceptées');
