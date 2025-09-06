export function i16le(bytes: Uint8Array, offset = 0): number {
  return (bytes[offset] | (bytes[offset + 1] << 8)) << 16 >> 16;
}

export function i16be(bytes: Uint8Array, offset = 0): number {
  return ((bytes[offset] << 8) | bytes[offset + 1]) << 16 >> 16;
}

export function i24le(bytes: Uint8Array, offset = 0): number {
  let v = bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
  if (bytes[offset + 2] & 0x80) v |= 0xff000000;
  return v | 0;
}

export function i32le(bytes: Uint8Array, offset = 0): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) | 0;
}

export function i32be(bytes: Uint8Array, offset = 0): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) | 0;
}

export function i16Bizarre(bytes: Uint8Array, offset = 0): number {
  const v = bytes[offset] | ((bytes[offset + 1] ^ 0x80) << 8);
  return (v << 16) >> 16;
}

export function u16le(bytes: Uint8Array, offset = 0): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

export function u32le(bytes: Uint8Array, offset = 0): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

export function u64leNumber(bytes: Uint8Array, offset = 0): number {
  const lo = u32le(bytes, offset);
  const hi = u32le(bytes, offset + 4);
  return lo + hi * 2 ** 32;
}


