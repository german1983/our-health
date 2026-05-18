// Reads an image File, draws it onto a canvas downscaled so the longest
// edge is <= maxEdge, and exports as JPEG at the given quality. Returns a
// base64 data URL. Keeps phone-shot receipts under Vercel's 4.5 MB body
// cap (typical output ~600-900 KB).
export async function compressImageToDataUrl(
  file: File,
  maxEdge = 1600,
  quality = 0.82,
): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  return canvas.toDataURL('image/jpeg', quality);
}
