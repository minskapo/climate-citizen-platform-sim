import { afterEach, describe, expect, test, vi } from 'vitest';
import { fitLongEdge, shrinkImage } from './image';

function stubImage(width: number, height: number, sizeFor: (q: number) => number) {
  const draws: number[][] = [];
  const qualities: number[] = [];
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width, height, close() {} })));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function () {
    return { drawImage: (_img: unknown, ...a: number[]) => draws.push(a) } as never;
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, cb, type, q) {
    qualities.push(q as number);
    cb(new Blob([new Uint8Array(sizeFor(q as number))], { type }));
  });
  return { draws, qualities };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('shrinkImage', () => {
  test('fitLongEdge keeps aspect and never upscales', () => {
    expect(fitLongEdge(4000, 3000)).toEqual({ width: 1280, height: 960 });
    expect(fitLongEdge(3000, 4000)).toEqual({ width: 960, height: 1280 });
    expect(fitLongEdge(800, 600)).toEqual({ width: 800, height: 600 });
  });

  test('image is resized before upload', async () => {
    const { draws, qualities } = stubImage(4000, 3000, () => 300_000);
    const out = await shrinkImage(new File([new Uint8Array(10)], 'a.jpg', { type: 'image/jpeg' }));
    expect(draws[0]).toEqual([0, 0, 1280, 960]);
    expect(qualities).toEqual([0.75]);
    expect(out.mime).toBe('image/jpeg');
    expect(out.bytes).toBeLessThanOrEqual(1_000_000);
    expect(out.bytes).toBe(300_000);
    expect(atob(out.dataBase64).length).toBe(300_000);
  });

  test('retries at quality 0.6 when over 1MB', async () => {
    const { qualities } = stubImage(4000, 3000, (q) => (q > 0.7 ? 1_200_000 : 900_000));
    const out = await shrinkImage(new File([new Uint8Array(10)], 'a.png', { type: 'image/png' }));
    expect(qualities).toEqual([0.75, 0.6]);
    expect(out.bytes).toBe(900_000);
  });

  test('fails when still over 1MB', async () => {
    stubImage(4000, 3000, () => 1_100_000);
    await expect(shrinkImage(new File([new Uint8Array(10)], 'a.png', { type: 'image/png' }))).rejects.toThrow('1MB');
  });

  test('rejects non-images', async () => {
    await expect(shrinkImage(new File(['x'], 'a.txt', { type: 'text/plain' }))).rejects.toThrow();
  });
});
