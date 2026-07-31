// Browser-side downscale, run before a memorial's subject photo is uploaded.
//
// It is not an optimisation. A photo straight off a phone is 3–12MB, which is
// larger than a serverless function will accept as a request body — and the
// photo is the first thing on a memorial page, opened from a text message by
// someone with one bar of signal. 1600px is more than the app can show (the
// column is max-w-md and the photo is a square inside it) and small enough
// that it arrives.
//
// `imageOrientation: 'from-image'` is load-bearing: phone cameras record the
// rotation in EXIF rather than in the pixels, and a canvas redraw without it
// bakes in the wrong one — the classic sideways portrait.

const MAX_EDGE = 1600;
const QUALITY = 0.85;

export interface PreparedImage {
  blob: Blob;
  filename: string;
  width: number;
  height: number;
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser could not read that image.');

  // JPEG has no alpha, so a transparent PNG would composite onto black.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>(resolve =>
    canvas.toBlob(resolve, 'image/jpeg', QUALITY),
  );
  if (!blob) throw new Error('This browser could not re-encode that image.');

  const base = file.name.replace(/\.[^.]+$/, '') || 'photo';
  return { blob, filename: `${base}.jpg`, width, height };
}
