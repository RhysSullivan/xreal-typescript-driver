import { mcuOpen, mcuPollDisplayMode, mcuUpdateDisplayMode, mcuClose } from "../src/mcu/mcu";

async function main() {
  const mcu = await mcuOpen((e) => {
    console.log("MCU Event:", e);
  });
  console.log("MCU versions:", mcu.versions);
  console.log("Brightness:", mcu.brightness, "DispMode:", mcu.dispMode);

  await mcuPollDisplayMode(mcu);
  console.log("Polled DispMode:", mcu.dispMode);

  // Example: write back same mode (no-op)
  await mcuUpdateDisplayMode(mcu);

  // Keep process alive to receive events
  console.log("Listening for MCU events. Press Ctrl+C to exit.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


