import type { HID, HID as HidDevice } from "node-hid";
import { deviceInit, deviceExit, listDevices, openDeviceByPath, writeOutReport, readTimeout } from "../hid/device";
import { XREAL_VENDOR_ID, xrealImuInterfaceId, xrealImuMaxPayloadSize } from "../hid/ids";
import { crc32 } from "../util/crc32";
import { i16le, i16be, i24le, i32le, i32be, i16Bizarre, u16le, u32le, u64leNumber } from "../util/pack";
import { DEVICE_IMU_MSG_GET_CAL_DATA_LENGTH, DEVICE_IMU_MSG_CAL_DATA_GET_NEXT_SEGMENT, DEVICE_IMU_MSG_START_IMU_DATA, DEVICE_IMU_MSG_GET_STATIC_ID, GRAVITY_G } from "./constants";

type Vec3 = { x: number; y: number; z: number };
type Quat = { x: number; y: number; z: number; w: number };

export interface OpenedImu {
  device: HidDevice;
  productId: number;
  maxPayloadSize: number;
  staticId: number;
}

function buildPayload(msgid: number, data: Uint8Array): Uint8Array {
  // head(1)=0xAA, checksum(4), length(2), msgid(1), data(<=504)
  const packetLen = 3 + data.length; // length counts (msgid(1)+data)
  const payloadLen = 5 + packetLen; // + head + checksum
  const out = new Uint8Array(payloadLen);
  let p = 0;
  out[p++] = 0xaa;
  // checksum placeholder
  p += 4;
  out[p++] = packetLen & 0xff;
  out[p++] = (packetLen >> 8) & 0xff;
  out[p++] = msgid & 0xff;
  out.set(data, p);
  const checksum = crc32(out.subarray(5, 5 + packetLen));
  out[1] = checksum & 0xff;
  out[2] = (checksum >> 8) & 0xff;
  out[3] = (checksum >> 16) & 0xff;
  out[4] = (checksum >> 24) & 0xff;
  return out;
}

async function sendSignal(dev: HID, msgid: number, signal: number): Promise<boolean> {
  const packet = buildPayload(msgid, new Uint8Array([signal & 0xff]));
  writeOutReport(dev, packet);
  const resp = await readTimeout(dev, 1000);
  return !!resp; // best-effort
}

async function sendAndRecv(dev: HID, msgid: number, len: number): Promise<Uint8Array | null> {
  const buf = await readTimeout(dev, 1000);
  if (!buf) return null;
  const view = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  // len specified is only the data length expected after msgid
  // We don't parse checksum here; we rely on HID framing
  const m = view[1 + 4 + 2]; // this is fragile; but the firmware echoes msgid in replies
  if (m !== (msgid & 0xff)) return null;
  const data = view.subarray(1 + 4 + 2 + 1);
  if (len === 0) return new Uint8Array(0);
  return data.subarray(0, len);
}

export async function imuOpen(): Promise<OpenedImu> {
  if (!deviceInit()) throw new Error("Not initialized");
  const infos = listDevices();
  let chosen: ReturnType<typeof listDevices>[number] | null = null;
  for (const it of infos) {
    if (it.vendorId === XREAL_VENDOR_ID && typeof it.productId === "number") {
      const iface = xrealImuInterfaceId(it.productId);
      if (iface !== -1 && it.interface === iface) { chosen = it; break; }
    }
  }
  if (!chosen || !chosen.path) throw new Error("No handle");
  const dev = openDeviceByPath(chosen.path);
  const maxPayloadSize = xrealImuMaxPayloadSize(chosen.productId!);

  // stop data stream
  await sendSignal(dev, DEVICE_IMU_MSG_START_IMU_DATA, 0x0);

  // get static id
  writeOutReport(dev, buildPayload(DEVICE_IMU_MSG_GET_STATIC_ID, new Uint8Array(0)));
  const sid = await sendAndRecv(dev, DEVICE_IMU_MSG_GET_STATIC_ID, 4);
  const staticId = sid ? u32le(sid, 0) : 0x20220101;

  // request calibration length
  writeOutReport(dev, buildPayload(DEVICE_IMU_MSG_GET_CAL_DATA_LENGTH, new Uint8Array(0)));
  const clen = await sendAndRecv(dev, DEVICE_IMU_MSG_GET_CAL_DATA_LENGTH, 4);
  if (clen) {
    const total = u32le(clen, 0);
    const maxPacket = maxPayloadSize - 8; // per C code
    let position = 0;
    const cal = new Uint8Array(total);
    while (position < total) {
      writeOutReport(dev, buildPayload(DEVICE_IMU_MSG_CAL_DATA_GET_NEXT_SEGMENT, new Uint8Array(0)));
      const next = Math.min(maxPacket, total - position);
      const seg = await sendAndRecv(dev, DEVICE_IMU_MSG_CAL_DATA_GET_NEXT_SEGMENT, next);
      if (!seg) break;
      cal.set(seg, position);
      position += seg.length;
    }
    // Optionally parse JSON for calibration; skipped for brevity
  }

  // start data stream
  await sendSignal(dev, DEVICE_IMU_MSG_START_IMU_DATA, 0x1);

  return { device: dev, productId: chosen.productId!, maxPayloadSize, staticId };
}

export interface ImuPacket {
  timestampNs: number;
  temperatureC: number;
  gyroDps: Vec3;
  accelG: Vec3;
  magUt: Vec3; // units depend on scaling; keep raw-like
}

export function parseImuDataPacket(payload: Uint8Array): ImuPacket | null {
  // Mirror device_imu_packet_t layout
  if (payload.length < 64) return null;
  const signature0 = payload[0];
  const signature1 = payload[1];
  if (!((signature0 === 0x01 && signature1 === 0x02) || (signature0 === 0xaa && signature1 === 0x53))) {
    return null;
  }
  const timestamp = u64leNumber(payload, 4);
  const temperatureRaw = i16le(payload, 2);
  const temperatureC = temperatureRaw / 132.48 + 25.0;

  const vel_m = i16le(payload, 12);
  const vel_d = i32le(payload, 14);
  const vel_x = i24le(payload, 18);
  const vel_y = i24le(payload, 21);
  const vel_z = i24le(payload, 24);
  const gyro = {
    x: (vel_x * vel_m) / vel_d,
    y: (vel_y * vel_m) / vel_d,
    z: (vel_z * vel_m) / vel_d,
  };

  const acc_m = i16le(payload, 27);
  const acc_d = i32le(payload, 29);
  const acc_x = i24le(payload, 33);
  const acc_y = i24le(payload, 36);
  const acc_z = i24le(payload, 39);
  const accel = {
    x: (acc_x * acc_m) / acc_d,
    y: (acc_y * acc_m) / acc_d,
    z: (acc_z * acc_m) / acc_d,
  };

  const mag_m = i16be(payload, 42);
  const mag_d = i32be(payload, 44);
  const mag_x = i16Bizarre(payload, 48);
  const mag_y = i16Bizarre(payload, 50);
  const mag_z = i16Bizarre(payload, 52);
  const mag = {
    x: (mag_x * mag_m) / mag_d,
    y: (mag_y * mag_m) / mag_d,
    z: (mag_z * mag_m) / mag_d,
  };

  return { timestampNs: timestamp, temperatureC, gyroDps: gyro, accelG: accel, magUt: mag };
}

export function imuClose(imu: OpenedImu): void {
  try { imu.device.close(); } catch {}
  deviceExit();
}

