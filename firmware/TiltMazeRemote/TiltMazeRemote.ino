// ESP32 DevKit / WROOM-32 + MPU6050. See ../../REMOTE_SETUP.md.
// Wired USB/UART version. Uses only libraries included with Espressif's core.
// A USB data cable supplies power and tilt data; no radio is initialized.
#include <Arduino.h>
#include <Wire.h>
#include <math.h>

constexpr int SDA_PIN = 21;
constexpr int SCL_PIN = 22;
constexpr uint8_t MPU_ADDRESS = 0x68; // AD0 tied to GND; use 0x69 if AD0 is high.
constexpr uint32_t SERIAL_BAUD_RATE = 115200;
constexpr float TO_DEG = 57.2957795f;

float biasX = 0, biasY = 0, biasZ = 0;
float roll = 0, pitch = 0;
uint32_t lastSampleUs = 0;
bool filterReady = false;

struct Sample { float ax, ay, az, gx, gy, gz; };
bool readSample(Sample &s); // Keep Arduino's generated prototypes after this type.

bool writeRegister(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(MPU_ADDRESS);
  Wire.write(reg);
  Wire.write(value);
  return Wire.endTransmission() == 0;
}

bool readRegisters(uint8_t reg, uint8_t *buffer, size_t length) {
  Wire.beginTransmission(MPU_ADDRESS);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom(MPU_ADDRESS, length, true) != length) return false;
  for (size_t i = 0; i < length; ++i) buffer[i] = Wire.read();
  return true;
}

int16_t readSigned(const uint8_t *bytes) {
  return static_cast<int16_t>((static_cast<uint16_t>(bytes[0]) << 8) | bytes[1]);
}

bool readSample(Sample &s) {
  uint8_t b[14];
  if (!readRegisters(0x3B, b, sizeof(b))) return false;
  // +/-2 g: 16384 counts/g. +/-250 degrees/s: 131 counts/(degree/s).
  s.ax = readSigned(b) / 16384.0f;
  s.ay = readSigned(b + 2) / 16384.0f;
  s.az = readSigned(b + 4) / 16384.0f;
  // Bytes 6..7 contain temperature.
  s.gx = readSigned(b + 8) / 131.0f;
  s.gy = readSigned(b + 10) / 131.0f;
  s.gz = readSigned(b + 12) / 131.0f;
  return true;
}

void haltWithMessage(const char *message) {
  // Repeat so a browser connected after startup can still show the failure.
  while (true) { Serial.print("# ERROR "); Serial.println(message); delay(1000); }
}

float wrapDegrees(float angle) {
  while (angle > 180) angle -= 360;
  while (angle < -180) angle += 360;
  return angle;
}

void setup() {
  Serial.begin(SERIAL_BAUD_RATE);
  delay(500);
  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(100000);
  Wire.setTimeOut(50);
  uint8_t identity = 0;
  if (!readRegisters(0x75, &identity, 1) || identity != 0x68)
    haltWithMessage("MPU6050 not found. Check 3V3/GND/SDA=21/SCL=22/AD0=GND, then reset.");
  if (!writeRegister(0x6B, 0x80)) haltWithMessage("MPU6050 reset failed.");
  delay(100);
  // Wake using X gyro PLL; enable all axes; 44 Hz filter; 100 Hz samples.
  if (!writeRegister(0x6B, 0x01) || !writeRegister(0x6C, 0x00) ||
      !writeRegister(0x1A, 0x03) || !writeRegister(0x19, 0x09) ||
      !writeRegister(0x1B, 0x00) || !writeRegister(0x1C, 0x00))
    haltWithMessage("MPU6050 configuration failed. Check wiring and reset.");
  delay(300);

  Serial.println("# CALIBRATING Keep remote STILL, sensor face up, for 3 seconds.");
  Sample s{};
  for (int i = 0; i < 300; ++i) {
    if (!readSample(s)) haltWithMessage("Sensor read failed during calibration. Check wiring and reset.");
    biasX += s.gx; biasY += s.gy; biasZ += s.gz;
    delay(10);
  }
  biasX /= 300; biasY /= 300; biasZ /= 300;

  Serial.println("# READY TiltMaze USB. Close Serial Monitor, connect from the game, then center.");
}

void loop() {
  const uint32_t nowUs = micros();
  if (static_cast<uint32_t>(nowUs - lastSampleUs) < 10000) { delay(1); return; }
  float dt = static_cast<uint32_t>(nowUs - lastSampleUs) / 1000000.0f;
  lastSampleUs = nowUs;
  Sample s{};
  if (!readSample(s)) {
    // Do not send old angles as fresh data. Browser watchdog stops the board.
    filterReady = false;
    static uint32_t lastErrorMs = 0;
    if (millis() - lastErrorMs > 1000) {
      Serial.println("# ERROR MPU6050 read failed; tilt stream paused. Check wiring.");
      lastErrorMs = millis();
    }
    return;
  }
  const float accRoll = atan2f(s.ay, s.az) * TO_DEG;
  const float accPitch = atan2f(-s.ax, sqrtf(s.ay * s.ay + s.az * s.az)) * TO_DEG;
  if (!filterReady || dt > 0.1f) {
    roll = accRoll; pitch = accPitch; filterReady = true;
  } else {
    // Euler rates account for coupled axes during ordinary handheld tilt.
    // Reinitialize near vertical, where Euler pitch becomes singular.
    if (fabsf(pitch) > 80) {
      roll = accRoll; pitch = accPitch;
    } else {
      const float r = roll / TO_DEG, p = pitch / TO_DEG;
      const float gx = s.gx - biasX, gy = s.gy - biasY, gz = s.gz - biasZ;
      const float rollRate = gx + sinf(r) * tanf(p) * gy + cosf(r) * tanf(p) * gz;
      const float pitchRate = cosf(r) * gy - sinf(r) * gz;
      const float predictedRoll = wrapDegrees(roll + rollRate * dt);
      const float alpha = 0.35f / (0.35f + dt);
      roll = wrapDegrees(predictedRoll + (1 - alpha) * wrapDegrees(accRoll - predictedRoll));
      pitch = alpha * (pitch + pitchRate * dt) + (1 - alpha) * accPitch;
      pitch = constrain(pitch, -90.0f, 90.0f);
    }
  }
  // One complete ASCII record per sample (~100 Hz). No flush or radio delays.
  // Skip a record if the UART buffer is full instead of queueing old positions.
  char packet[48];
  const int length = snprintf(packet, sizeof(packet), "TILT,%.2f,%.2f\n", roll, pitch);
  if (length > 0 && length < static_cast<int>(sizeof(packet)) && Serial.availableForWrite() >= length) {
    Serial.write(reinterpret_cast<const uint8_t *>(packet), length);
  }
}
