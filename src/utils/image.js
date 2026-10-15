// Réduit une photo avant l'envoi (1600 px max, WebP ou JPEG) : ~10 à 20 fois plus légère.
const MAX_DIM = 1600;
const QUALITY = 0.82;
export const MAX_INPUT_BYTES = 25 * 1024 * 1024;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible. Essaie une photo JPEG ou PNG.')); };
    img.src = url;
  });
}

const toBlob = (canvas, type) => new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY));

export async function compressImage(file) {
  if (!file.type.startsWith('image/')) throw new Error('Le fichier doit être une image.');
  if (file.size > MAX_INPUT_BYTES) throw new Error('Image trop lourde (25 Mo maximum).');
  // Les GIF animés perdraient leur animation : on les garde tels quels s'ils sont raisonnables.
  if (file.type === 'image/gif') return file;

  const img = await loadImage(file);
  const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);

  // WebP si le navigateur sait l'encoder, sinon JPEG.
  let blob = await toBlob(canvas, 'image/webp');
  if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg');
  if (!blob) return file;
  // Si l'original était déjà plus léger (petite image), on le garde.
  if (blob.size >= file.size && file.size <= 5 * 1024 * 1024) return file;
  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
  return new File([blob], `photo.${ext}`, { type: blob.type });
}
