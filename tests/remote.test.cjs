// Test the real inline USB controller using Web Streams and a simulated serial port.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../TiltMaze 3D (1).html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script);
const controller = script.slice(script.indexOf('const SERIAL_BAUD_RATE'), script.indexOf('// ── Gyroscope'));
const settle = () => new Promise(resolve => setImmediate(resolve));
function harness() {
  const elements = new Map(), listeners = new Map(), browserListeners = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {textContent: '', disabled: false, checked: false,
      classList: {toggle() {}, add() {}, remove() {}}, addEventListener() {}});
    return elements.get(id);
  };
  let stream, requestCount = 0, closes = 0, cancels = 0;
  const port = {
    readable: null,
    addEventListener(name, fn) { listeners.set(name, fn); },
    removeEventListener(name) { listeners.delete(name); },
    async open(options) {
      assert.equal(options.baudRate, 115200);
      this.readable = new ReadableStream({start(c) {stream = c;}, cancel() {cancels++;}});
    },
    async close() {
      assert.equal(this.readable.locked, false, 'reader lock must release before closing port');
      closes++; this.readable = null;
    }
  };
  const context = vm.createContext({
    document: {getElementById: element},
    window: {isSecureContext: true, innerWidth: 1000, innerHeight: 800,
      addEventListener: (name, fn) => browserListeners.set(name, fn)},
    navigator: {serial: {requestPort: async () => { requestCount++; return port; }}},
    TextDecoder, performance: {now: () => context.now}, now: 100,
    MAX_TILT: .28, tRoll: 0, tPitch: 0, pRoll: 0, pPitch: 0, bvx: 0, bvz: 0,
    pauseGame(message) { context.pauseReason = message; }
  });
  vm.runInContext(controller, context);
  const run = code => vm.runInContext(code, context);
  return {context, run, element, port, listeners, browserListeners,
    async send(text) {stream.enqueue(new TextEncoder().encode(text)); await settle();},
    error() {stream.error(new Error('Cable removed'));},
    end() {stream.close();},
    stats: () => ({requestCount, closes, cancels})
  };
}
(async () => {
  let h = harness();
  await h.run('connectRemote()');
  await h.run('connectRemote()');
  assert.equal(h.stats().requestCount, 1);
  assert.equal(h.run('remoteConnected && !serialConnecting'), true);
  assert.equal(h.element('calibrate-btn').disabled, true);
  h.context.now = 5000;
  h.run('checkRemoteSignal(performance.now())');
  assert.equal(h.run('remoteStale'), false); // Boot-calibration grace period.
  await h.send('# READY\r\nboot log\r\nTILT,10,');
  assert.equal(h.run('latestTilt'), null);
  await h.send('-5\r\n');
  assert.equal(h.context.tRoll, 0); // First complete sample auto-centres.
  assert.equal(Math.abs(h.context.tPitch), 0);
  await h.send('TILT,40,-5\n');
  assert.equal(h.context.tRoll, .28);
  assert.equal(h.context.tPitch, -.28);
  h.run('calibrateRemote()');
  await h.send('TILT,40.5,-5.5\n');
  assert.equal(Math.abs(h.context.tRoll), 0);
  await h.send('TILT,10,-5\n');
  assert.equal(h.context.tRoll, -.28);
  h.run('invertRoll = true; applyRemoteTilt()');
  assert.equal(h.context.tRoll, .28);
  h.run('swapAxes = true; applyRemoteTilt()');
  assert.equal(h.context.tPitch, .28);
  // Coalesce multiple samples, keeping the newest in a delivered chunk.
  await h.send('TILT,1,2\nTILT,3,4\nTILT,5,6\n');
  assert.equal(h.run('latestTilt.roll'), 5);
  assert.equal(h.run('latestTilt.pitch'), 6);
  const before = h.run('lastTiltAt');
  h.context.now = 5100;
  await h.send('TILT,NaN,1\nTILT,Infinity,0\nTILT,200,0\nTILT,0,91\nTILT,,0\n10,20\nTILT,1,2,3\n');
  assert.equal(h.run('lastTiltAt'), before);
  await h.send('x'.repeat(10000) + 'TILT,80,10\n');
  assert.equal(h.run('lastTiltAt'), before);
  assert.equal(h.run('serialConnection.line.length'), 0);
  await h.send('# ERROR MPU6050 read failed\n');
  assert.match(h.element('remote-status').textContent, /MPU6050/);
  await h.send('TILT,5,6\n');
  assert.match(h.element('remote-status').textContent, /Receiving USB tilt/);
  h.context.now = 5601;
  h.run('checkRemoteSignal(performance.now())');
  assert.equal(h.run('remoteStale'), true);
  assert.equal(h.context.tRoll, 0); assert.equal(h.context.bvx, 0);
  assert.match(h.context.pauseReason, /signal stopped/);
  await h.send('TILT,-12.34,56.78\n');
  assert.equal(h.run('remoteStale'), false);
  assert.equal(h.run('latestTilt.roll'), -12.34);
  await h.run('disconnectRemote()');
  assert.equal(h.run('remoteConnected'), false);
  assert.equal(h.run('serialConnection'), null);
  assert.equal(h.stats().closes, 1);
  assert.equal(h.stats().cancels, 1);
  assert.equal(h.listeners.size, 0);
  h.browserListeners.get('mousemove')({clientX: 1000, clientY: 400, target: {}});
  assert.equal(h.context.tRoll, .28);
  await h.run('connectRemote()');
  await h.send('TILT,179,0\n');
  await h.send('TILT,-179,0\n');
  assert.ok(Math.abs(h.context.tRoll) < .02);
  h.error(); await settle();
  assert.equal(h.run('serialConnection'), null);
  assert.match(h.element('remote-status').textContent, /Cable removed/);
  await h.run('connectRemote()');
  h.listeners.get('disconnect')(); await settle();
  assert.equal(h.run('remoteConnected'), false);
  assert.match(h.element('remote-status').textContent, /USB cable disconnected/);
  await h.run('connectRemote()'); h.end(); await settle();
  assert.equal(h.run('serialConnection'), null);

  h = harness();
  h.context.navigator.serial = undefined;
  await h.run('connectRemote()');
  assert.match(h.element('remote-status').textContent, /unavailable/);
  h.context.window.isSecureContext = false;
  await h.run('connectRemote()');
  assert.match(h.element('remote-status').textContent, /HTTPS or localhost/);

  h = harness();
  h.context.navigator.serial.requestPort = async () => {throw Object.assign(new Error('Cancelled'), {name: 'NotFoundError'});};
  await h.run('connectRemote()');
  assert.equal(h.run('serialConnection'), null);
  assert.match(h.element('remote-status').textContent, /No USB port selected/);

  h = harness();
  h.port.open = async () => {throw new Error('Port busy');};
  await h.run('connectRemote()');
  assert.equal(h.run('serialConnection'), null);
  assert.equal(h.stats().closes, 0);
  assert.match(h.element('remote-status').textContent, /Port busy/);

  // Cancelling while open is pending must close the late-opened port, never start reading.
  h = harness();
  let finishOpen;
  const originalOpen = h.port.open.bind(h.port);
  h.port.open = async options => {await new Promise(resolve => {finishOpen = resolve;}); await originalOpen(options);};
  const pending = h.run('connectRemote()'); await settle();
  const closing = h.run('disconnectRemote()');
  await h.run('connectRemote()'); // Closing blocks new connections.
  assert.equal(h.stats().requestCount, 1);
  finishOpen(); await pending; await closing;
  assert.equal(h.run('serialConnection'), null);
  assert.equal(h.stats().closes, 1);

  h = harness();
  let choosePort;
  h.context.navigator.serial.requestPort = () => new Promise(resolve => {choosePort = resolve;});
  const selecting = h.run('connectRemote()');
  await h.run('disconnectRemote()');
  choosePort(h.port); await selecting;
  assert.equal(h.port.readable, null);
  assert.equal(h.run('remoteConnected'), false);

  h = harness();
  await h.run('connectRemote()');
  h.context.now = 9000; h.run('checkRemoteSignal(performance.now())');
  assert.equal(h.run('remoteStale'), true); // No data even after boot allowance.
  await h.run('disconnectRemote()');
  const firmware = fs.readFileSync(path.join(__dirname, '../firmware/TiltMazeRemote/TiltMazeRemote.ino'), 'utf8');
  assert.match(firmware, /SERIAL_BAUD_RATE = 115200/);
  assert.ok(firmware.includes('TILT,%.2f,%.2f\\n'));
  assert.ok(!firmware.includes('BLEDevice'));
  console.log('PASS: USB lifecycle, stream framing/coalescing, validation, bounded buffers, centering, mapping, watchdog, startup grace, cancellation, reconnect, unplug, reader release, cursor fallback, firmware protocol.');
})().catch(error => {console.error(error); process.exitCode = 1;});

