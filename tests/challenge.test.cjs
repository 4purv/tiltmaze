const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
function harness(saved = '[]', blocked = false) {
  const nodes = new Map();
  function element() {
    const classes = new Set();
    return {value: '', textContent: '', hidden: false, style: {}, children: [], events: {},
      classList: {add: x => classes.add(x), remove: x => classes.delete(x), toggle(x, on) {on ? classes.add(x) : classes.delete(x);}},
      addEventListener(name, fn) {this.events[name] = fn;},
      appendChild(x) {this.children.push(x);}, append(...items) {this.children.push(...items);},
      replaceChildren() {this.children = [];}, setAttribute() {}, focus() {}};
  }
  const get = id => {if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id);};
  get('course-select').value = '0'; get('mode-select').value = 'gentle'; get('player-name').value = 'Tester';
  const vector = () => ({set() {}});
  class Graphic {
    constructor() { this.children = []; this.position = vector(); this.rotation = vector(); this.shadow = {mapSize: vector(), camera: {}}; this.shadowMap = {}; }
    add(x) {this.children.push(x);} remove(x) {this.children = this.children.filter(c => c !== x);}
    setPixelRatio() {} setSize() {} setClearColor() {} lookAt() {} setAttribute() {} render() {} dispose() {}
    clone() {return new Graphic();}
  }
  const events = {};
  let stored = saved;
  const ctx = vm.createContext({console, now: 1000, Math, Date, TextDecoder,
    THREE: new Proxy({}, {get: () => Graphic}),
    document: {getElementById: get, createElement: element, addEventListener: (event, fn) => {events[event] = fn;}, hidden: false},
    navigator: {userAgent: 'Test desktop'},
    window: {innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, matchMedia: () => ({matches: true})},
    performance: {now: () => ctx.now}, requestAnimationFrame() {},
    localStorage: {getItem() {if (blocked) throw Error('blocked'); return stored;}, setItem(k,v) {if (blocked) throw Error('blocked'); stored = v;}}
  });
  vm.runInContext(script, ctx);
  return {ctx, get, events, run: code => vm.runInContext(code, ctx), stored: () => stored,
    advance(ms) {ctx.now += ms; return vm.runInContext('tickChallenge(performance.now())', ctx);}};
}
let h = harness();
assert.equal(h.run('phase'), 'menu');
const first = h.run('JSON.stringify(mazeWalls)');
h.run('startGame()');
assert.equal(h.run('phase'), 'ready');
assert.equal(h.advance(2999), false);
assert.equal(h.run('elapsed'), 0);
assert.equal(h.advance(1), true);
h.advance(12500);
assert.equal(h.run('elapsed'), 12500);
assert.equal(h.get('timer').textContent, '04:48');
h.run('pauseGame()'); h.advance(50000);
assert.equal(h.run('elapsed'), 12500);
h.run('resumeGame()'); h.advance(3000); h.advance(1000);
assert.equal(h.run('elapsed'), 13500);
// Reach checkpoints using actual route positions; visiting twice cannot farm points.
h.run('for (const c of checkpoints) { bx = route[c.step].x; bz = route[c.step].z; updateProgress(); updateProgress(); }');
assert.equal(h.run('checkpointPoints'), 300);
h.run('bx = route.at(-1).x; bz = route.at(-1).z; updateProgress(); if(checkWin()) finishChallenge(true)');
assert.equal(h.run('phase'), 'finished');
assert.equal(h.run('scores.length'), 1);
assert.equal(h.run('scores[0].score'), 1777);
assert.equal(h.get('result-stars').textContent, '★★★');
h.run('finishChallenge(true)');
assert.equal(h.run('scores.length'), 1);
const reloaded = harness(h.stored());
assert.equal(reloaded.run('scores[0].name'), 'Tester');
assert.equal(reloaded.get('leader-list').children.length, 1);
h.run('retryGame()'); assert.equal(h.run('JSON.stringify(mazeWalls)'), first);
h.advance(3000); h.advance(300000);
assert.equal(h.run('phase'), 'timeout'); assert.equal(h.get('timer').textContent, '00:00');
assert.equal(h.run('scores.length'), 1);
h.run('continuePractice()'); h.advance(3000); h.advance(600000);
assert.equal(h.run('phase'), 'running');
h.run('finishChallenge(true)'); assert.equal(h.run('scores.length'), 1);
assert.match(h.get('result-message').textContent, /not ranked/);
h.run('showMenu()'); h.get('mode-select').value = 'practice'; h.run('startGame()');
h.advance(3000); h.advance(1000000);
assert.equal(h.run('phase'), 'running');
h.run('finishChallenge(true)'); assert.equal(h.run('scores.length'), 2);
// New course has another deterministic maze and scores are separated.
h.run('nextCourse()'); assert.notEqual(h.run('JSON.stringify(mazeWalls)'), first);
assert.equal(h.run('scoreGroup(1, "practice", "pointer").length'), 0);
// Hidden tab pauses, including during ready countdown.
h.ctx.document.hidden = true; h.events.visibilitychange();
assert.equal(h.run('phase'), 'paused');
h.ctx.document.hidden = false;
h.run('resumeGame()'); h.advance(3000);
h.run('remoteConnected = true; lastTiltAt = null'); h.advance(10);
assert.equal(h.run('phase'), 'paused');
h.run('resumeGame()'); assert.equal(h.run('phase'), 'paused');
h.run('remoteConnected = false; resumeGame()'); h.advance(3000);
assert.equal(h.run('phase'), 'running');
// Late frames expire the round using real elapsed time rather than clamped physics dt.
h = harness(); h.get('mode-select').value = 'sprint'; h.run('startGame()'); h.advance(3000); h.advance(120001);
assert.equal(h.run('phase'), 'timeout');
// Corrupt / blocked storage must not prevent play.
assert.equal(harness('{broken').run('scores.length'), 0);
assert.equal(harness('[null, {"name":"Bad"}]').run('scores.length'), 0);
h = harness('[]', true); h.run('startGame()'); h.advance(3000); h.run('finishChallenge(true)');
assert.equal(h.run('scores.length'), 1);
assert.match(h.get('result-message').textContent, /page session/);
// Worse scores do not overwrite a personal best; better scores replace it once.
h = harness(); h.run('elapsed = 10000; runName = "A"; saveFinish(1500); elapsed = 20000; saveFinish(1400)');
assert.equal(h.run('scores.length'), 1); assert.equal(h.run('scores[0].score'), 1500);
h.run('saveFinish(1600)'); assert.equal(h.run('scores.length'), 1); assert.equal(h.run('scores[0].score'), 1600);
// Legacy wireless records stay stored; USB results use their own category.
h = harness(JSON.stringify([{name:'Legacy', course:0, mode:'gentle', input:'remote', score:1300, elapsed:20000}]));
h.run('remoteConnected = true');
assert.equal(h.run('inputType()'), 'usb');
assert.equal(h.run('scoreGroup(0, "gentle", "usb").length'), 0);
assert.equal(h.run('scores.length'), 1);

// Integration: actual serial read loop feeds the game, and unplug pauses its clock.
(async () => {
  const game = harness();
  let stream;
  const port = {readable: null, addEventListener() {}, removeEventListener() {},
    async open() {this.readable = new ReadableStream({start(c) {stream = c;}});},
    async close() {assert.equal(this.readable.locked, false); this.readable = null;}};
  game.ctx.window.isSecureContext = true;
  game.ctx.navigator.serial = {requestPort: async () => port};
  await game.run('connectRemote()');
  const sample = async () => {stream.enqueue(new TextEncoder().encode('TILT,0,0\n')); await new Promise(resolve => setImmediate(resolve));};
  await sample(); game.run('startGame()');
  game.ctx.now += 3000; await sample(); game.run('tickChallenge(performance.now())');
  assert.equal(game.run('phase'), 'running');
  game.ctx.now += 100;
  stream.error(new Error('USB unplugged'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(game.run('phase'), 'paused');
  assert.equal(game.run('elapsed'), 100);
  assert.equal(game.run('remoteConnected'), false);
  game.advance(30000);
  assert.equal(game.run('elapsed'), 100);
  console.log('PASS: challenge countdown, expiry, scoring, persistence, practice, pause/resume, legacy/USB score separation, and USB-unplug clock integration.');
})().catch(error => {console.error(error); process.exitCode = 1;});
