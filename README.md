# XREAL Mac Driver (TypeScript, Bun)

This is a TypeScript rewrite of the IMU/MCU drivers for XREAL devices, targeting the Bun runtime and using `node-hid` for USB HID access.

## Prerequisites

- Install Bun: https://bun.sh
- Install libusb / HIDAPI drivers as required by node-hid (macOS ships with IOKit HID). On macOS, ensure you have permissions to access HID devices.

## Install

```bash
bun install
```

## Usage

Run the MCU debug tool:

```bash
bun run examples/debugMcu.ts
```

Run the IMU debug tool:

```bash
bun run examples/debugImu.ts
```

Type-check:

```bash
bun run typecheck
```

## Notes

- Report ID handling: `node-hid` expects a leading 0x00 report ID in writes; reads may include a 0x00 prefix which is stripped automatically.
- IMU sensor fusion (AHRS) from Fusion library is not ported; the IMU example parses raw kinematic data analogous to the C struct layout.

