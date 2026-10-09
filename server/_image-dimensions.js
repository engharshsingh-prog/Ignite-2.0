function parseDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mime: match[1].toLowerCase(),
    buffer: Buffer.from(match[2], 'base64'),
  };
}

function parsePngDimensions(buffer) {
  if (buffer.length < 24) return null;
  const signature = buffer.subarray(0, 8);
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!signature.equals(pngSignature)) return null;

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

function parseJpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;

  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    let marker = buffer[offset + 1];
    while (marker === 0xff) {
      offset += 1;
      marker = buffer[offset + 1];
    }

    const markerOffset = offset + 2;
    if (marker === 0xd9 || marker === 0xda) break;
    if (markerOffset + 1 >= buffer.length) break;

    const segmentLength = buffer.readUInt16BE(markerOffset);
    if (segmentLength < 2) return null;

    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (markerOffset + 7 >= buffer.length) return null;
      const height = buffer.readUInt16BE(markerOffset + 3);
      const width = buffer.readUInt16BE(markerOffset + 5);
      return { width, height };
    }

    offset = markerOffset + segmentLength;
  }

  return null;
}

function parseWebpDimensions(buffer) {
  if (buffer.length < 30) return null;
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') return null;

  const chunkType = buffer.toString('ascii', 12, 16);

  if (chunkType === 'VP8 ') {
    const width = buffer.readUInt16LE(26) & 0x3fff;
    const height = buffer.readUInt16LE(28) & 0x3fff;
    return { width, height };
  }

  if (chunkType === 'VP8L') {
    const b0 = buffer[21];
    const b1 = buffer[22];
    const b2 = buffer[23];
    const b3 = buffer[24];
    const width = 1 + (((b1 & 0x3f) << 8) | b0);
    const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
    return { width, height };
  }

  if (chunkType === 'VP8X') {
    const width = 1 + buffer.readUIntLE(24, 3);
    const height = 1 + buffer.readUIntLE(27, 3);
    return { width, height };
  }

  return null;
}

export function getDataUrlImageDimensions(dataUrl) {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) throw new Error('Invalid image format');

  const { mime, buffer } = parsed;
  let dims = null;

  if (mime === 'image/png') dims = parsePngDimensions(buffer);
  if (mime === 'image/jpeg' || mime === 'image/jpg') dims = parseJpegDimensions(buffer);
  if (mime === 'image/webp') dims = parseWebpDimensions(buffer);

  if (!dims || !dims.width || !dims.height) {
    throw new Error('Unsupported or invalid image data');
  }

  return dims;
}
