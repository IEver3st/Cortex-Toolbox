import { describe, expect, it } from 'vitest';
import { decodeDds, encodeDdsRgba, inspectImageHeader, validateImagePlan } from './index';

describe('image pipeline contracts', () => {
  it('reads PSD dimensions without decoding untrusted layer data', () => {
    const buffer = new Uint8Array(26);
    buffer.set([0x38, 0x42, 0x50, 0x53]);
    const view = new DataView(buffer.buffer);
    view.setUint16(12, 4);
    view.setUint32(14, 1024);
    view.setUint32(18, 2048);
    expect(inspectImageHeader('paint.psd', buffer)).toMatchObject({
      format: 'psd',
      width: 2048,
      height: 1024,
      channels: 4,
      capability: 'inspect-only',
    });
  });
  it('refuses overwriting the source', () => {
    expect(() =>
      validateImagePlan({
        input: 'a.png',
        output: 'a.png',
        overwriteOriginal: false,
        flipGreenChannel: false,
      }),
    ).toThrow(/new file/);
  });

  it('round-trips an uncompressed RGBA DDS texture', () => {
    const pixels = new Uint8Array([255, 0, 0, 255, 0, 128, 255, 64]);
    const decoded = decodeDds(encodeDdsRgba(pixels, 2, 1));
    expect(decoded).toMatchObject({ width: 2, height: 1, format: 'rgba8' });
    expect(decoded.data).toEqual(pixels);
  });
});
