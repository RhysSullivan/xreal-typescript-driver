import HIDLib from "node-hid";
import type { HID as HidDevice } from "node-hid";

export type HidDeviceInfo = ReturnType<typeof HIDLib.devices>[number];

export function deviceInit(): boolean {
  // node-hid requires no explicit init
  return true;
}

export function deviceExit(): void {
  // node-hid requires no explicit exit
}

export function listDevices(): HidDeviceInfo[] {
  return HIDLib.devices();
}

export function openDeviceByPath(path: string): HidDevice {
  return new HIDLib.HID(path);
}

export function normalizeInReport(buffer: Buffer | Uint8Array): Uint8Array {
  const arr = buffer instanceof Buffer ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength) : buffer;
  // On some platforms a leading reportId 0x00 is included. If present and length=65, drop it.
  if (arr.length >= 65 && arr[0] === 0x00) {
    return arr.subarray(1);
  }
  return arr;
}

export function writeOutReport(dev: HidDevice, payload: Uint8Array): number {
  // Prepend reportId 0x00 for node-hid write
  const report = new Uint8Array(1 + payload.length);
  report[0] = 0x00;
  report.set(payload, 1);
  return dev.write(Array.from(report));
}

export async function readTimeout(dev: HidDevice, timeoutMs: number): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    try {
      const res = (dev as any).readTimeout?.(timeoutMs);
      if (res && (res as any).length !== undefined) {
        // node-hid returns number[] on some versions
        const buf = Buffer.from(res as number[]);
        resolve(normalizeInReport(buf));
        return;
      }
      // Fallback to event-based read with a timer
      let timer: any;
      const onData = (data: Buffer) => {
        clearTimeout(timer);
        dev.removeListener("data", onData);
        dev.removeListener("error", onError);
        resolve(normalizeInReport(data));
      };
      const onError = (_err: any) => {
        clearTimeout(timer);
        dev.removeListener("data", onData);
        dev.removeListener("error", onError);
        resolve(null);
      };
      dev.on("data", onData);
      dev.on("error", onError);
      timer = setTimeout(() => {
        dev.removeListener("data", onData);
        dev.removeListener("error", onError);
        resolve(null);
      }, Math.max(0, timeoutMs));
    } catch (_e) {
      resolve(null);
    }
  });
}

