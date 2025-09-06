import type { HID as HidDevice } from "node-hid";
import { crc32 } from "../util/crc32";
import { u16le, u32le, u64leNumber } from "../util/pack";
import { deviceInit, deviceExit, listDevices, openDeviceByPath, writeOutReport, readTimeout } from "../hid/device";
import { XREAL_VENDOR_ID, xrealMcuInterfaceId } from "../hid/ids";
import {
  DEVICE_MCU_MSG_R_ACTIVATION_TIME,
  DEVICE_MCU_MSG_R_MCU_APP_FW_VERSION,
  DEVICE_MCU_MSG_R_DP7911_FW_VERSION,
  DEVICE_MCU_MSG_R_DSP_APP_FW_VERSION,
  DEVICE_MCU_MSG_R_BRIGHTNESS,
  DEVICE_MCU_MSG_R_DISP_MODE,
  DEVICE_MCU_MSG_W_DISP_MODE,
  DEVICE_MCU_MSG_P_START_HEARTBEAT,
  DEVICE_MCU_MSG_P_DISPLAY_TOGGLED,
  DEVICE_MCU_MSG_P_BUTTON_PRESSED,
  DEVICE_MCU_MSG_P_ASYNC_TEXT_LOG,
  DEVICE_MCU_MSG_P_END_HEARTBEAT,
  PACKET_HEAD,
  MAX_PACKET_SIZE,
} from "./constants";

export type McuEvent =
  | { type: "SCREEN_ON"; timestamp: number; brightness: number }
  | { type: "SCREEN_OFF"; timestamp: number; brightness: number }
  | { type: "BRIGHTNESS_UP"; timestamp: number; brightness: number }
  | { type: "BRIGHTNESS_DOWN"; timestamp: number; brightness: number }
  | { type: "MESSAGE"; timestamp: number; message: string; brightness: number }
  | { type: "DISPLAY_MODE_2D"; timestamp: number; brightness: number }
  | { type: "DISPLAY_MODE_3D"; timestamp: number; brightness: number }
  | { type: "BLEND_CYCLE"; timestamp: number; brightness: number }
  | { type: "CONTROL_TOGGLE"; timestamp: number; brightness: number }
  | { type: "VOLUME_UP"; timestamp: number; brightness: number }
  | { type: "VOLUME_DOWN"; timestamp: number; brightness: number }
  | { type: "UNKNOWN"; timestamp: number; brightness: number };

export interface OpenedMcu {
  device: HidDevice;
  productId: number;
  brightness: number;
  dispMode: number;
  active: boolean;
  versions: { mcu: string; dp: string; dsp: string };
}

function buildPacket(msgid: number, data: Uint8Array): Uint8Array {
  // struct device_mcu_packet: head(1) checksum(4) length(2) timestamp(8) msgid(2) reserved(5) data(<=42)
  const packetLen = 17 + data.length; // from length field to end
  const payloadLen = 5 + packetLen; // + head + checksum
  const out = new Uint8Array(payloadLen);
  let p = 0;
  out[p++] = PACKET_HEAD;
  // checksum placeholder
  p += 4;
  // length (LE)
  out[p++] = packetLen & 0xff;
  out[p++] = (packetLen >> 8) & 0xff;
  // timestamp (u64 le) -> 0
  for (let i = 0; i < 8; i++) out[p++] = 0;
  // msgid (u16 le)
  out[p++] = msgid & 0xff;
  out[p++] = (msgid >> 8) & 0xff;
  // reserved 5 bytes
  for (let i = 0; i < 5; i++) out[p++] = 0;
  // data
  out.set(data, p);

  const checksum = crc32(out.subarray(5, 5 + packetLen));
  out[1] = checksum & 0xff;
  out[2] = (checksum >> 8) & 0xff;
  out[3] = (checksum >> 16) & 0xff;
  out[4] = (checksum >> 24) & 0xff;

  return out;
}

async function recvMessage(dev: HidDevice, expectedMsgId: number, expectedDataLength: number): Promise<Uint8Array | null> {
  const buf = await readTimeout(dev, 1000);
  if (!buf) return null;
  const view = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  if (view[0] !== PACKET_HEAD) return null;
  const msgid = u16le(view, 1 + 4 + 2 + 8); // head(1)+checksum(4)+length(2)+timestamp(8)
  if (msgid !== expectedMsgId) return null;
  const dataStart = 1 + 4 + 2 + 8 + 2 + 5; // after head, checksum, length, timestamp, msgid, reserved
  const status = view[dataStart];
  if (status !== 0) return null;
  const data = view.subarray(dataStart + 1, dataStart + 1 + expectedDataLength);
  return data.length === expectedDataLength ? data : null;
}

export async function mcuOpen(onEvent?: (e: McuEvent) => void): Promise<OpenedMcu> {
  if (!deviceInit()) throw new Error("Not initialized");
  const infos = listDevices();
  let chosen: ReturnType<typeof listDevices>[number] | null = null;
  for (const it of infos) {
    if (it.vendorId === XREAL_VENDOR_ID && typeof it.productId === "number") {
      const iface = xrealMcuInterfaceId(it.productId);
      if (iface !== -1 && it.interface === iface) {
        chosen = it; break;
      }
    }
  }
  if (!chosen || !chosen.path) throw new Error("No handle");
  const dev = openDeviceByPath(chosen.path);

  // helper to do action: write then wait for ack with 0 data
  async function doAction(msgid: number, data: Uint8Array = new Uint8Array(0)): Promise<boolean> {
    const out = buildPacket(msgid, data);
    writeOutReport(dev, out);
    const ack = await recvMessage(dev, msgid, 0);
    return !!ack;
  }

  // Clear (read once with small timeout)
  await readTimeout(dev, 10);

  // Activation
  {
    const out = buildPacket(DEVICE_MCU_MSG_R_ACTIVATION_TIME, new Uint8Array(0));
    writeOutReport(dev, out);
    const resp = await recvMessage(dev, DEVICE_MCU_MSG_R_ACTIVATION_TIME, 1);
    if (!resp) throw new Error("Activation time read failed");
  }

  const versions = { mcu: "", dp: "", dsp: "" };
  // MCU FW
  {
    writeOutReport(dev, buildPacket(DEVICE_MCU_MSG_R_MCU_APP_FW_VERSION, new Uint8Array(0)));
    const d = await recvMessage(dev, DEVICE_MCU_MSG_R_MCU_APP_FW_VERSION, 41);
    if (!d) throw new Error("MCU FW version failed");
    versions.mcu = new TextDecoder().decode(d).replace(/\0+.*/, "");
  }
  // DP FW
  {
    writeOutReport(dev, buildPacket(DEVICE_MCU_MSG_R_DP7911_FW_VERSION, new Uint8Array(0)));
    const d = await recvMessage(dev, DEVICE_MCU_MSG_R_DP7911_FW_VERSION, 41);
    if (!d) throw new Error("DP FW version failed");
    versions.dp = new TextDecoder().decode(d).replace(/\0+.*/, "");
  }
  // DSP FW
  {
    writeOutReport(dev, buildPacket(DEVICE_MCU_MSG_R_DSP_APP_FW_VERSION, new Uint8Array(0)));
    const d = await recvMessage(dev, DEVICE_MCU_MSG_R_DSP_APP_FW_VERSION, 41);
    if (!d) throw new Error("DSP FW version failed");
    versions.dsp = new TextDecoder().decode(d).replace(/\0+.*/, "");
  }

  // Brightness
  writeOutReport(dev, buildPacket(DEVICE_MCU_MSG_R_BRIGHTNESS, new Uint8Array(0)));
  const b = await recvMessage(dev, DEVICE_MCU_MSG_R_BRIGHTNESS, 1);
  if (!b) throw new Error("Read brightness failed");
  let brightness = b[0];

  // Display mode
  writeOutReport(dev, buildPacket(DEVICE_MCU_MSG_R_DISP_MODE, new Uint8Array(0)));
  const dmode = await recvMessage(dev, DEVICE_MCU_MSG_R_DISP_MODE, 1);
  if (!dmode) throw new Error("Read display mode failed");
  let dispMode = dmode[0];

  let active = false;

  // Event loop support
  if (onEvent) {
    dev.on("data", (data: Buffer) => {
      const buf = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      const arr = buf[0] === 0x00 ? buf.subarray(1) : buf;
      if (arr.length < MAX_PACKET_SIZE) return;
      if (arr[0] !== PACKET_HEAD) return;
      const timestamp = u32le(arr, 1 + 4 + 2); // note: C treats as 32-bit in read
      const msgid = u16le(arr, 1 + 4 + 2 + 8);
      const length = u16le(arr, 1 + 4);
      const dataOffset = 1 + 4 + 2 + 8 + 2 + 5; // head+checksum+length+timestamp+msgid+reserved
      const d = arr.subarray(dataOffset);
      switch (msgid) {
        case DEVICE_MCU_MSG_P_START_HEARTBEAT:
          break;
        case DEVICE_MCU_MSG_P_DISPLAY_TOGGLED: {
          const value = d[0];
          active = !!value;
          onEvent({ type: active ? "SCREEN_ON" : "SCREEN_OFF", timestamp, brightness });
          break;
        }
        case DEVICE_MCU_MSG_P_BUTTON_PRESSED: {
          const virt = d[4];
          const value = d[8];
          // Map subset used by examples
          if (virt === 0x1) { // DISPLAY_TOGGLE
            active = !!value;
            onEvent({ type: active ? "SCREEN_ON" : "SCREEN_OFF", timestamp, brightness });
          } else if (virt === 0x6) { // BRIGHTNESS_UP
            brightness = value; onEvent({ type: "BRIGHTNESS_UP", timestamp, brightness });
          } else if (virt === 0x7) { // BRIGHTNESS_DOWN
            brightness = value; onEvent({ type: "BRIGHTNESS_DOWN", timestamp, brightness });
          } else if (virt === 0xa) {
            onEvent({ type: "DISPLAY_MODE_2D", timestamp, brightness });
          } else if (virt === 0xb) {
            onEvent({ type: "DISPLAY_MODE_3D", timestamp, brightness });
          } else if (virt === 0xc) {
            onEvent({ type: "BLEND_CYCLE", timestamp, brightness });
          } else if (virt === 0xf) {
            onEvent({ type: "CONTROL_TOGGLE", timestamp, brightness });
          } else if (virt === 0x8) {
            onEvent({ type: "VOLUME_UP", timestamp, brightness });
          } else if (virt === 0x9) {
            onEvent({ type: "VOLUME_DOWN", timestamp, brightness });
          } else {
            onEvent({ type: "UNKNOWN", timestamp, brightness });
          }
          break;
        }
        case DEVICE_MCU_MSG_P_ASYNC_TEXT_LOG: {
          const textRaw = Buffer.from(d).toString("utf8");
          const text = textRaw.replace(/\0+.*/, "");
          onEvent({ type: "MESSAGE", timestamp, message: text, brightness });
          break;
        }
        case DEVICE_MCU_MSG_P_END_HEARTBEAT:
          break;
        default:
          onEvent({ type: "UNKNOWN", timestamp, brightness });
      }
    });
  }

  return { device: dev, productId: chosen.productId!, brightness, dispMode, active, versions };
}

export async function mcuPollDisplayMode(mcu: OpenedMcu): Promise<number> {
  writeOutReport(mcu.device, buildPacket(DEVICE_MCU_MSG_R_DISP_MODE, new Uint8Array(0)));
  const d = await recvMessage(mcu.device, DEVICE_MCU_MSG_R_DISP_MODE, 1);
  if (!d) throw new Error("Receiving display mode failed");
  mcu.dispMode = d[0];
  return mcu.dispMode;
}

export async function mcuUpdateDisplayMode(mcu: OpenedMcu): Promise<void> {
  const ok = await (async () => {
    const out = buildPacket(DEVICE_MCU_MSG_W_DISP_MODE, new Uint8Array([mcu.dispMode]));
    writeOutReport(mcu.device, out);
    const ack = await recvMessage(mcu.device, DEVICE_MCU_MSG_W_DISP_MODE, 0);
    return !!ack;
  })();
  if (!ok) throw new Error("Sending display mode failed");
}

export function mcuClose(mcu: OpenedMcu): void {
  try { mcu.device.close(); } catch {}
  deviceExit();
}

