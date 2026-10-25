# TiltMaze: wired ESP32 + MPU6050 remote

The game now uses **USB serial only** for the ESP32 remote. Upload the updated `firmware/TiltMazeRemote/TiltMazeRemote.ino` sketch: the old Bluetooth sketch will not work with this receiver. Bluetooth and Wi-Fi are not initialized by the new firmware.

## Circuit connections

Target: a standard ESP32 DevKit with an ESP32-WROOM-32 module and a 3.3 V compatible MPU6050 breakout. The sensor wiring is unchanged.

| ESP32 DevKit | MPU6050 breakout | Purpose |
| --- | --- | --- |
| 3V3 | VCC / VIN | Sensor power; verify the breakout accepts 3.3 V |
| GND | GND | Common ground |
| GPIO 21 / D21 | SDA | I2C data |
| GPIO 22 / D22 | SCL | I2C clock |
| GND | AD0 | I2C address 0x68 |
| No connection | INT, XDA, XCL | Not needed |

```text
PC USB port
    |
    | USB DATA cable (power + data)
    v
ESP32 DevKit USB socket
    |
    +-- 3V3 ------ MPU6050 VCC
    +-- GND ------ MPU6050 GND and AD0
    +-- GPIO 21 -- MPU6050 SDA
    +-- GPIO 22 -- MPU6050 SCL

MPU6050 -> I2C -> ESP32 -> onboard USB/UART bridge -> PC -> browser
```

Use the board's USB connector with a **data-capable** cable. A charge-only cable cannot carry tilt readings. The PC supplies power to the DevKit, which supplies the MPU6050 through 3V3. No battery, power bank, external USB-to-serial adapter, or separate power supply is needed for this DevKit setup. Disconnect the previous external supply while using PC USB power.

The pin labels are GPIO numbers, not physical header positions. Do not connect 5 V to ESP32 3V3 or its GPIO signals. Most sensor breakouts have I2C pull-ups; if absent, add approximately 4.7 kΩ from SDA to 3V3 and SCL to 3V3. Check your particular breakout's power requirements.

Mount the sensor rigidly, component side up. The game uses sideways and forward/back tilt; yaw is not a game input. Other ESP32 boards may need different SDA/SCL pins and USB settings. The supplied defaults target the original WROOM-32 DevKit with its onboard USB/UART bridge.

## Flash the new firmware

1. Connect the ESP32 to the PC using the USB data cable.
2. In Arduino IDE install **esp32 by Espressif Systems** using Boards Manager, if needed. The sketch uses only the built-in Arduino, Wire and math functionality; no sensor or Bluetooth library installation is required.
3. Open `firmware/TiltMazeRemote/TiltMazeRemote.ino`. Select **ESP32 Dev Module** for a generic WROOM-32 DevKit (or the correct matching board) and its COM port.
4. Upload. If necessary on a generic DevKit, hold BOOT while upload connects, then release it.
5. Optional diagnostic check: open Serial Monitor at **115200 baud** and press Reset. Leave the board completely still, sensor face up, during the first approximately four seconds. After calibration you should see lines such as:
   ```text
   # READY TiltMaze USB. Close Serial Monitor, connect from the game, then center.
   TILT,10.25,-3.50
   TILT,10.30,-3.48
   ```
6. **Close Serial Monitor and Serial Plotter before connecting the game.** Keep the cable connected. Only one application/tab should hold the COM port.
7. If you moved the sensor during startup calibration, reset and repeat while stationary. Opening the browser serial connection can reset some DevKits, so keep it still when connecting too.

Before uploading again, click **Disconnect** in the game to release the port.

## Open the game and connect

Use **desktop Chrome or Edge** and a localhost or HTTPS page. Web Serial requires a supported browser, a secure context, and a user click to choose the port. Use the full desktop browser if an embedded preview reports the API unavailable.

In PowerShell in this folder:

```powershell
node serve-game.cjs
```

Open [TiltMaze](http://localhost:8080) and reload any previously open game tab.

1. Click **Connect USB remote**.
2. Choose the ESP32's USB serial / COM port. It may appear as **Silicon Labs CP210x**, **USB-SERIAL CH340**, or another USB bridge label, not the old ESP32-TiltMaze Bluetooth name.
3. Wait for **Receiving USB tilt**. The readout should change as you gently tilt the remote.
4. Start a challenge. Open **USB remote**, hold your preferred neutral position, and click **Center remote**. Opening settings pauses the game; click Resume when ready.
5. Use **Swap roll / pitch** or **Reverse** if mounting orientation differs. Lower **Full tilt at** for greater sensitivity.

Mouse/touch control remains available after disconnecting the remote. Existing game modes, points, stars, checkpoints and timers remain. USB scores use a separate input category; old Bluetooth scores are retained in browser storage but are not mixed into the USB scoreboard.

## Responsiveness and recovery

- Firmware reads and filters the MPU6050 at approximately **100 Hz**, sending one record every roughly 10 ms.
- The serial link uses **115200 baud, 8 data bits, no parity, 1 stop bit, no flow control**.
- It skips a sample if the UART transmit buffer lacks room for a complete record. The browser applies the newest complete valid record in each received chunk instead of animating intermediate queued records.
- Sensor filtering, USB drivers, OS scheduling, and display rendering still contribute delay. The wired version removes the radio link; it does not guarantee zero latency or a measured end-to-end latency.
- After streaming has begun, **500 ms without a valid reading** stops control and pauses the game. Startup allows up to eight seconds before reporting missing data, to allow reset and calibration. Trying to play before the first reading pauses until fresh data is available.
- Unplugging or a serial read failure pauses gameplay and releases the reader/port. Reconnect the cable, click Connect USB remote again, then Resume. The game does not silently restart a paused round.
- Sensor errors are printed with `# ERROR`; they do not count as fresh tilt samples.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| No COM port in picker | Use a data cable, try another PC USB port, and check Windows Device Manager. Install the driver for the actual USB bridge from your board/chip vendor if Windows has not installed it. |
| Port busy / access denied | Close Arduino Serial Monitor, Serial Plotter, other terminal applications and other tabs using the ESP32. Disconnect the game before uploading. |
| Port opens but no tilt data | Upload the new USB sketch. Keep still through calibration. Old BLE firmware, a wrong COM port or a wrong baud rate will not produce valid records. |
| MPU6050 not found | Check 3V3, GND, SDA=21, SCL=22, and AD0=GND; then press Reset. If intentionally using AD0 high, change MPU_ADDRESS to 0x69. |
| Remote moves in the wrong direction | Center it, then use Swap or Reverse controls. |
| Serial API unavailable | Use desktop Chrome/Edge directly on localhost or HTTPS. Check site permissions or browser organization policy. |
| Stops after unplugging | Reconnect and explicitly choose Connect USB remote, then Resume. |
| Drift or unstable readings | Reset while stationary, check rigid mounting and short sensor wires, then center. Gentle tilts work best; rapid translation can disturb gravity-based tilt estimation. |

Do not add jumper wires to the ESP32 RX/TX pins for this setup. Its built-in USB bridge already provides that connection.

## Stream format

Each sample is ASCII/UTF-8 with a newline:
```text
TILT,<roll in degrees>,<pitch in degrees>\n
```
Example: `TILT,10.25,-3.50\n`. CRLF is also accepted. Valid roll range is −180 to +180 degrees; pitch is −90 to +90 degrees. The receiver handles records split between USB reads and several records in one read. It ignores startup/debug text and malformed/out-of-range samples and limits partial records to 128 characters.

This replaces the previous four-byte BLE packet and UUID protocol completely.

## Verification and references

Run:
```powershell
node tests/remote.test.cjs
node tests/challenge.test.cjs
```

Tests exercise actual receiver code with simulated serial streams, including arbitrary chunk boundaries, garbage input, unplug events, cancellation, lock cleanup and reconnect. Physical USB operation, actual latency and firmware compilation/upload still require verification with your ESP32; no Arduino compiler or assembled remote was available during this change.

- [Chrome: Web Serial, reading, permissions, and closing ports](https://developer.chrome.com/docs/capabilities/serial)
- [Espressif: Arduino ESP32 installation](https://docs.espressif.com/projects/arduino-esp32/en/latest/installing.html)
- [Espressif: ESP32 DevKitC documentation](https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32/esp32-devkitc/index.html)

