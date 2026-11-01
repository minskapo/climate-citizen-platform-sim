export const IMAGE_LONG_EDGE = 1280;
export const MAX_BYTES = 1_000_000;

export function fitLongEdge(w: number, h: number, max = IMAGE_LONG_EDGE) {
  const scale = Math.min(1, max / Math.max(w, h));
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

type Drawable = CanvasImageSource & { width: number; height: number; close?: () => void };

async function decode(file: File): Promise<Drawable> {
  if (typeof createImageBitmap === 'function') {
    return (await createImageBitmap(file, { imageOrientation: 'from-image' })) as Drawable;
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return Object.assign(img, { width: img.naturalWidth, height: img.naturalHeight });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('이미지를 바꾸지 못했어요'))), 'image/jpeg', quality),
  );
}

export async function blobToBase64(b: Blob): Promise<string> {
  const bytes = new Uint8Array(await b.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** 긴 변 1280px · JPEG 품질 0.75로 줄인다. 1MB를 넘으면 품질 0.6으로 한 번 더, 그래도 넘으면 실패. */
export async function shrinkImage(file: File): Promise<{ dataBase64: string; bytes: number; mime: 'image/jpeg' }> {
  if (!file.type.startsWith('image/')) throw new Error('이미지 파일만 올릴 수 있어요');
  const src = await decode(file);
  const { width, height } = fitLongEdge(src.width, src.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('이미지를 바꾸지 못했어요');
  ctx.drawImage(src, 0, 0, width, height);
  src.close?.();
  let blob = await toJpeg(canvas, 0.75);
  if (blob.size > MAX_BYTES) blob = await toJpeg(canvas, 0.6);
  if (blob.size > MAX_BYTES) throw new Error('이미지가 1MB를 넘어요. 더 작은 이미지를 골라 주세요');
  return { dataBase64: await blobToBase64(blob), bytes: blob.size, mime: 'image/jpeg' };
}
