import { imuOpen, imuClose, parseImuDataPacket } from "../src/imu/imu";
import { readTimeout } from "../src/hid/device";

async function main() {
  const imu = await imuOpen();
  console.log("IMU static id:", imu.staticId.toString(16));

  // Clear queue
  await readTimeout(imu.device, 10);

  console.log("Reading IMU stream. Press Ctrl+C to exit.");
  while (true) {
    const buf = await readTimeout(imu.device as any, 1000);
    if (!buf) continue;
    // Strip report ID if present
    const arr = buf[0] === 0x00 ? buf.subarray(1) : buf;
    const pkt = parseImuDataPacket(arr);
    if (!pkt) continue;
    console.log(`t=${(pkt.timestampNs/1e9).toFixed(3)}s gyro=(${pkt.gyroDps.x.toFixed(2)},${pkt.gyroDps.y.toFixed(2)},${pkt.gyroDps.z.toFixed(2)}) accel=(${pkt.accelG.x.toFixed(2)},${pkt.accelG.y.toFixed(2)},${pkt.accelG.z.toFixed(2)}) temp=${pkt.temperatureC.toFixed(2)}C`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


