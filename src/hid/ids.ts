export const XREAL_VENDOR_ID = 0x3318;

export const XREAL_PRODUCT_IDS = [
  0x0424, // XREAL Air
  0x0428, // XREAL Air 2
  0x0432, // XREAL Air 2 Pro
  0x0426, // XREAL Air 2 Ultra
] as const;

export type XrealProductId = typeof XREAL_PRODUCT_IDS[number];

export const XREAL_IMU_INTERFACE_IDS: Record<XrealProductId, number> = {
  0x0424: 3,
  0x0428: 3,
  0x0432: 3,
  0x0426: 2,
};

export const XREAL_MCU_INTERFACE_IDS: Record<XrealProductId, number> = {
  0x0424: 4,
  0x0428: 4,
  0x0432: 4,
  0x0426: 0,
};

export const XREAL_IMU_MAX_PAYLOAD_SIZES: Record<XrealProductId, number> = {
  0x0424: 64,
  0x0428: 64,
  0x0432: 64,
  0x0426: 512,
};

export function isXrealProductId(productId: number): productId is XrealProductId {
  return (XREAL_PRODUCT_IDS as readonly number[]).includes(productId);
}

export function xrealImuInterfaceId(productId: number): number {
  return isXrealProductId(productId) ? XREAL_IMU_INTERFACE_IDS[productId] : -1;
}

export function xrealMcuInterfaceId(productId: number): number {
  return isXrealProductId(productId) ? XREAL_MCU_INTERFACE_IDS[productId] : -1;
}

export function xrealImuMaxPayloadSize(productId: number): number {
  return isXrealProductId(productId) ? XREAL_IMU_MAX_PAYLOAD_SIZES[productId] : 0;
}


