'use client';

/**
 * Gruppenbild vor dem Upload clientseitig verkleinern: max. 512×512,
 * WebP wenn der Browser es encodiert, sonst JPEG. Der Server erzwingt
 * zusätzlich ein hartes 300-KB-Limit.
 */
export async function resizeImage(
  file: File,
  maxDim = 512
): Promise<{ blob: Blob; mime: string } | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const encode = (type: string, quality: number) =>
      new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

    // Safari encodiert kein WebP -> toBlob liefert dann PNG/null, also prüfen
    let blob = await encode('image/webp', 0.85);
    if (!blob || blob.type !== 'image/webp') blob = await encode('image/jpeg', 0.85);
    if (!blob) return null;
    if (blob.size > 280 * 1024) {
      const smaller = await encode('image/jpeg', 0.6);
      if (smaller) blob = smaller;
    }
    return { blob, mime: blob.type || 'image/jpeg' };
  } catch {
    return null;
  }
}
