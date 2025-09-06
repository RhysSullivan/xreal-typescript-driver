export function i16le(bytes: Uint8Array, offset = 0): number {
  const b0 = bytes[offset]!;
  const b1 = bytes[offset + 1]!;
  return ((b0 | (b1 << 8)) << 16) >> 16;
}

export function i16be(bytes: Uint8Array, offset = 0): number {
  const b0 = bytes[offset]!;
  const b1 = bytes[offset + 1]!;
  return (((b0 << 8) | b1) << 16) >> 16;
}

export function i24le(bytes: Uint8Array, offset = 0): number {
  const b0 = bytes[offset]!;
  const b1 = bytes[offset + 1]!;
  const b2 = bytes[offset + 2]!;
  let v = b0 | (b1 << 8) | (b2 << 16);
  if (b2 & 0x80) v |= 0xff000000;
  return v | 0;
}

export function i32le(bytes: Uint8Array, offset = 0): number {
  const b0 = bytes[offset]!;
  const b1 = bytes[offset + 1]!;
  const b2 = bytes[offset + 2]!;
  const b3 = bytes[offset + 3]!;
  return (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) | 0;
}

export function i32be(bytes: Uint8Array, offset = 0): number {
  const b0 = bytes[offset]!;
  const b1 = bytes[offset + 1]!;
  const b2 = bytes[offset + 2]!;
  const b3 = bytes[offset + 3]!;
  return ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3) | 0;
}

export function i16Bizarre(bytes: Uint8Array, offset = 0): number {
  const b0 = bytes[offset]!;
  const b1 = bytes[offset + 1]!;
  const v = b0 | ((b1 ^ 0x80) << 8);
  return (v << 16) >> 16;
}

export function u16le(bytes: Uint8Array, offset = 0): number {
  const b0 = bytes[offset]!;
  const b1 = bytes[offset + 1]!;
  return b0 | (b1 << 8);
}

export function u32le(bytes: Uint8Array, offset = 0): number {
  const b0 = bytes[offset]!;
  const b1 = bytes[offset + 1]!;
  const b2 = bytes[offset + 2]!;
  const b3 = bytes[offset + 3]!;
  return (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0;
}

export function u64leNumber(bytes: Uint8Array, offset = 0): number {
  const lo = u32le(bytes, offset);
  const hi = u32le(bytes, offset + 4);
  return lo + hi * 2 ** 32;
}


