// Photo de profil réservée au fondateur : empreinte visuelle (dHash 64 bits) comparée à celle de l'image
// réservée. Elle reconnaît aussi une copie redimensionnée, recompressée, sur fond noir ou blanc, entourée
// de marges ou recadrée au carré. Les empreintes sont envoyées avec la photo et la base les vérifie aussi
// (schema.sql, version 59) : un ancien site resté en cache ne peut plus la laisser passer.
// fond blanc, fond blanc recadré au carré, fond noir, fond noir recadré au carré
export const RESERVED = ['7062f4d6d6b666f4', '70e2f6f2b61766f4', '1c0d171717376616', '1c0d17333717661e'];
// bits différents sur 64 : les copies testées sont à 1 ou 2, les autres images du site à 14 ou plus
export const MAX_DISTANCE = 8;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
    img.src = url;
  });
}

// empreinte d'une zone de l'image : réduite à 9 × 8 en niveaux de gris, chaque bit dit si un pixel
// est plus clair que son voisin de droite
export function imageHash(img, { background = '#fff', square = false, box = null } = {}) {
  let [sx, sy, sw, sh] = box || [0, 0, img.naturalWidth, img.naturalHeight];
  if (square) { const s = Math.min(sw, sh); sx += (sw - s) / 2; sy += (sh - s) / 2; sw = s; sh = s; }
  const big = document.createElement('canvas');
  big.width = 72; big.height = 64;
  const g = big.getContext('2d', { willReadFrequently: true });
  g.fillStyle = background;
  g.fillRect(0, 0, 72, 64);
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, sx, sy, sw, sh, 0, 0, 72, 64);
  const px = g.getImageData(0, 0, 72, 64).data;
  const gray = [];
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 9; x += 1) {
      let sum = 0;
      for (let dy = 0; dy < 8; dy += 1) {
        for (let dx = 0; dx < 8; dx += 1) {
          const i = ((y * 8 + dy) * 72 + x * 8 + dx) * 4;
          sum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        }
      }
      gray.push(sum / 64);
    }
  }
  let bits = '';
  for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) bits += gray[y * 9 + x] > gray[y * 9 + x + 1] ? '1' : '0';
  return BigInt(`0b${bits}`).toString(16).padStart(16, '0');
}

// cadre du sujet : on retire les bords unis (marges, fond d'une capture d'écran)
function contentBox(img) {
  const W = 256;
  const H = Math.max(1, Math.round((W * img.naturalHeight) / img.naturalWidth));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff';
  g.fillRect(0, 0, W, H);
  g.drawImage(img, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H).data;
  const at = (x, y) => (y * W + x) * 4;
  const bg = at(0, 0);
  const differs = (i) => Math.abs(d[i] - d[bg]) + Math.abs(d[i + 1] - d[bg + 1]) + Math.abs(d[i + 2] - d[bg + 2]) > 60;
  let top = H; let left = W; let bottom = -1; let right = -1;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      if (differs(at(x, y))) { top = Math.min(top, y); bottom = Math.max(bottom, y); left = Math.min(left, x); right = Math.max(right, x); }
    }
  }
  if (bottom < 0 || right - left < 16 || bottom - top < 16) return null;
  const k = img.naturalWidth / W;
  return [left * k, top * k, (right - left + 1) * k, (bottom - top + 1) * k];
}

const distance = (a, b) => {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let n = 0;
  while (x) { n += Number(x & 1n); x >>= 1n; }
  return n;
};

// empreintes d'une photo : image entière, sujet sans les marges, et leurs recadrages carrés
export async function avatarHashes(file) {
  if (!file?.type?.startsWith('image/')) return [];
  try {
    const img = await loadImage(file);
    const box = contentBox(img);
    const hashes = [imageHash(img), imageHash(img, { square: true })];
    if (box) hashes.push(imageHash(img, { box }), imageHash(img, { box, square: true }));
    return [...new Set(hashes)];
  } catch {
    return [];
  }
}

export const isReservedHash = (hashes) => hashes.some((h) => RESERVED.some((r) => distance(h, r) <= MAX_DISTANCE));

// true si le fichier est l'image réservée (ou une copie)
export async function isReservedAvatar(file) {
  return isReservedHash(await avatarHashes(file));
}
