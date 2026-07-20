export interface DecodedDds {
  width: number;
  height: number;
  data: Uint8Array;
  format: 'rgba8' | 'dxt1' | 'dxt3' | 'dxt5';
}

function assertDds(buffer: Uint8Array): DataView {
  if (
    buffer.byteLength < 128 ||
    buffer[0] !== 0x44 ||
    buffer[1] !== 0x44 ||
    buffer[2] !== 0x53 ||
    buffer[3] !== 0x20
  ) {
    throw new Error('The file is not a complete DDS texture.');
  }
  return new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

function color565(value: number): [number, number, number] {
  const red = (value >> 11) & 0x1f;
  const green = (value >> 5) & 0x3f;
  const blue = value & 0x1f;
  return [
    Math.round((red * 255) / 31),
    Math.round((green * 255) / 63),
    Math.round((blue * 255) / 31),
  ];
}

function colorTable(
  first: number,
  second: number,
  allowTransparent: boolean,
): [number, number, number, number][] {
  const a = color565(first);
  const b = color565(second);
  const rgba = (value: [number, number, number], alpha = 255): [number, number, number, number] => [
    value[0],
    value[1],
    value[2],
    alpha,
  ];
  if (first > second || !allowTransparent) {
    return [
      rgba(a),
      rgba(b),
      rgba([
        Math.round((2 * a[0] + b[0]) / 3),
        Math.round((2 * a[1] + b[1]) / 3),
        Math.round((2 * a[2] + b[2]) / 3),
      ]),
      rgba([
        Math.round((a[0] + 2 * b[0]) / 3),
        Math.round((a[1] + 2 * b[1]) / 3),
        Math.round((a[2] + 2 * b[2]) / 3),
      ]),
    ];
  }
  return [
    rgba(a),
    rgba(b),
    rgba([
      Math.round((a[0] + b[0]) / 2),
      Math.round((a[1] + b[1]) / 2),
      Math.round((a[2] + b[2]) / 2),
    ]),
    [0, 0, 0, 0],
  ];
}

function writePixel(
  output: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  color: readonly number[],
): void {
  if (x >= width || y >= height) return;
  const offset = (y * width + x) * 4;
  output[offset] = color[0] ?? 0;
  output[offset + 1] = color[1] ?? 0;
  output[offset + 2] = color[2] ?? 0;
  output[offset + 3] = color[3] ?? 255;
}

function alphaTable(a0: number, a1: number): number[] {
  if (a0 > a1) {
    return [
      a0,
      a1,
      ...Array.from({ length: 6 }, (_, index) =>
        Math.round(((6 - index) * a0 + (index + 1) * a1) / 7),
      ),
    ];
  }
  return [
    a0,
    a1,
    ...Array.from({ length: 4 }, (_, index) =>
      Math.round(((4 - index) * a0 + (index + 1) * a1) / 5),
    ),
    0,
    255,
  ];
}

function decodeBlocks(
  buffer: Uint8Array,
  width: number,
  height: number,
  format: 'dxt1' | 'dxt3' | 'dxt5',
): Uint8Array {
  const output = new Uint8Array(width * height * 4);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const blockBytes = format === 'dxt1' ? 8 : 16;
  let offset = 128;
  for (let blockY = 0; blockY < Math.ceil(height / 4); blockY += 1) {
    for (let blockX = 0; blockX < Math.ceil(width / 4); blockX += 1) {
      if (offset + blockBytes > buffer.byteLength) throw new Error('DDS block data is truncated.');
      let alphas = Array.from({ length: 16 }, () => 255);
      if (format === 'dxt3') {
        alphas = Array.from({ length: 16 }, (_, pixel) => {
          const byte = buffer[offset + Math.floor(pixel / 2)] ?? 0;
          const nibble = pixel % 2 === 0 ? byte & 0x0f : byte >> 4;
          return nibble * 17;
        });
      } else if (format === 'dxt5') {
        const table = alphaTable(buffer[offset] ?? 0, buffer[offset + 1] ?? 0);
        let bits = 0n;
        for (let index = 0; index < 6; index += 1)
          bits |= BigInt(buffer[offset + 2 + index] ?? 0) << BigInt(index * 8);
        alphas = Array.from(
          { length: 16 },
          (_, pixel) => table[Number((bits >> BigInt(pixel * 3)) & 7n)] ?? 255,
        );
      }
      const colorOffset = offset + (format === 'dxt1' ? 0 : 8);
      const first = view.getUint16(colorOffset, true);
      const second = view.getUint16(colorOffset + 2, true);
      const colors = colorTable(first, second, format === 'dxt1');
      const selectors = view.getUint32(colorOffset + 4, true);
      for (let pixel = 0; pixel < 16; pixel += 1) {
        const selected = colors[(selectors >> (pixel * 2)) & 3] ?? [0, 0, 0, 255];
        writePixel(
          output,
          width,
          height,
          blockX * 4 + (pixel % 4),
          blockY * 4 + Math.floor(pixel / 4),
          [selected[0], selected[1], selected[2], alphas[pixel] ?? selected[3]],
        );
      }
      offset += blockBytes;
    }
  }
  return output;
}

function extractMasked(value: number, mask: number): number {
  if (mask === 0) return 255;
  let shift = 0;
  while (((mask >>> shift) & 1) === 0) shift += 1;
  const normalizedMask = mask >>> shift;
  const channel = (value & mask) >>> shift;
  return Math.round((channel * 255) / normalizedMask);
}

export function decodeDds(buffer: Uint8Array): DecodedDds {
  const view = assertDds(buffer);
  const height = view.getUint32(12, true);
  const width = view.getUint32(16, true);
  if (width < 1 || height < 1 || width > 16_384 || height > 16_384)
    throw new Error('DDS dimensions are outside the supported range.');
  const fourCc = String.fromCharCode(
    buffer[84] ?? 0,
    buffer[85] ?? 0,
    buffer[86] ?? 0,
    buffer[87] ?? 0,
  );
  if (fourCc === 'DXT1' || fourCc === 'DXT3' || fourCc === 'DXT5') {
    const format = fourCc.toLowerCase() as 'dxt1' | 'dxt3' | 'dxt5';
    return { width, height, data: decodeBlocks(buffer, width, height, format), format };
  }
  const bitCount = view.getUint32(88, true);
  if (bitCount !== 32)
    throw new Error(
      `DDS pixel format ${fourCc.trim() || `${bitCount}-bit`} is not supported yet. Use RGBA8, DXT1, DXT3, or DXT5.`,
    );
  const redMask = view.getUint32(92, true);
  const greenMask = view.getUint32(96, true);
  const blueMask = view.getUint32(100, true);
  const alphaMask = view.getUint32(104, true);
  const output = new Uint8Array(width * height * 4);
  let source = 128;
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    if (source + 4 > buffer.byteLength) throw new Error('DDS pixel data is truncated.');
    const value = view.getUint32(source, true);
    const target = pixel * 4;
    output[target] = extractMasked(value, redMask);
    output[target + 1] = extractMasked(value, greenMask);
    output[target + 2] = extractMasked(value, blueMask);
    output[target + 3] = alphaMask ? extractMasked(value, alphaMask) : 255;
    source += 4;
  }
  return { width, height, data: output, format: 'rgba8' };
}

export function encodeDdsRgba(data: Uint8Array, width: number, height: number): Uint8Array {
  if (data.byteLength !== width * height * 4)
    throw new Error('RGBA buffer size does not match the requested DDS dimensions.');
  const output = new Uint8Array(128 + data.byteLength);
  output.set([0x44, 0x44, 0x53, 0x20]);
  const view = new DataView(output.buffer);
  view.setUint32(4, 124, true);
  view.setUint32(8, 0x0002_100f, true);
  view.setUint32(12, height, true);
  view.setUint32(16, width, true);
  view.setUint32(20, width * 4, true);
  view.setUint32(28, 1, true);
  view.setUint32(76, 32, true);
  view.setUint32(80, 0x41, true);
  view.setUint32(88, 32, true);
  view.setUint32(92, 0x00ff_0000, true);
  view.setUint32(96, 0x0000_ff00, true);
  view.setUint32(100, 0x0000_00ff, true);
  view.setUint32(104, 0xff00_0000, true);
  view.setUint32(108, 0x1000, true);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const source = pixel * 4;
    const target = 128 + source;
    output[target] = data[source + 2] ?? 0;
    output[target + 1] = data[source + 1] ?? 0;
    output[target + 2] = data[source] ?? 0;
    output[target + 3] = data[source + 3] ?? 255;
  }
  return output;
}
