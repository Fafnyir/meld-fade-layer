'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { FadeEngine, curve } = require('../com.fafnyir.meldfade.sdPlugin/src/fade.cjs');
const { settings, selectedLayer, sceneFor, catalog } = require('../com.fafnyir.meldfade.sdPlugin/src/config.cjs');

function fixture(visible = true, extra = {}) {
  let time = 0;
  const client = new EventEmitter();
  client.ready = true;
  client.items = { scene: { type: 'scene', name: 'Scene' }, layer: { type: 'layer', name: 'Layer', parent: 'scene', visible, ...extra } };
  client.writes = [];
  client.setProperty = async (id, property, value) => {
    client.writes.push({ property, value, time });
    client.items[id][property] = value;
    client.onWrite?.(property, value);
  };
  const engine = new FadeEngine(client, { now: () => time, wait: async ms => { time += ms; } });
  const s = settings({ sceneId: 'scene', layerId: 'layer' });
  return { client, engine, s, advance: ms => { time += ms; } };
}
test('fade out reaches zero before hiding and restores opacity while hidden', async () => {
  const { client, engine, s } = fixture();
  await engine.toggle(s);
  const writes = client.writes;
  const hide = writes.findIndex(x => x.property === 'visible');
  assert.deepEqual(writes[hide - 1].value, 0);
  assert.deepEqual(writes.slice(-2).map(x => [x.property, x.value]), [['visible', false], ['opacity', 1]]);
  assert.ok(writes.filter(x => x.property === 'opacity').length > 10);
  assert.ok(writes[hide].time >= 500 && writes[hide].time < 535);
  assert.equal(engine.state('layer').visible, false);
});
test('fade in sets zero before visibility and ends at exact configured opacity', async () => {
  const { client, engine, s } = fixture(false);
  s.opacity = 65;
  await engine.toggle(s);
  assert.deepEqual(client.writes.slice(0, 2).map(x => [x.property, x.value]), [['opacity', 0], ['visible', true]]);
  assert.equal(client.writes.at(-1).value, .65);
  assert.equal(client.items.layer.visible, true);
});
test('rapid reverse during fade out starts at current value and never hides', async () => {
  const { client, engine, s } = fixture();
  let reversed = false, at;
  client.onWrite = (property, value) => {
    if (!reversed && property === 'opacity' && value < .7 && value > 0) {
      reversed = true; at = client.writes.length - 1;
      engine.toggle(s);
    }
  };
  await engine.toggle(s);
  assert.ok(reversed);
  assert.equal(client.writes[at + 1].value, client.writes[at].value);
  assert.equal(client.items.layer.opacity, 1);
  assert.equal(client.items.layer.visible, true);
  assert.equal(client.writes.filter(x => x.property === 'visible').length, 0);
});
test('reverse during initial zero write does not flash a hidden layer', async () => {
  const { client, engine, s } = fixture(false);
  let reversed = false;
  client.onWrite = (property, value) => {
    if (!reversed && property === 'opacity' && value === 0) { reversed = true; engine.toggle(s); }
  };
  await engine.toggle(s);
  assert.ok(!client.writes.some(x => x.property === 'visible' && x.value));
  assert.equal(client.items.layer.visible, false);
});
test('reverse during hide acknowledgement safely fades back in', async () => {
  const { client, engine, s } = fixture();
  let reversed = false;
  client.onWrite = (property, value) => {
    if (!reversed && property === 'visible' && !value) { reversed = true; engine.toggle(s); }
  };
  await engine.toggle(s);
  const show = client.writes.findIndex(x => x.property === 'visible' && x.value);
  assert.equal(client.writes[show - 1].value, 0);
  assert.equal(client.items.layer.visible, true);
  assert.equal(client.items.layer.opacity, 1);
});
test('repeated presses share a single worker per layer', async () => {
  const { engine, s } = fixture();
  const first = engine.toggle(s);
  const second = engine.toggle(s);
  const third = engine.toggle(s);
  assert.equal(first, second);
  assert.equal(second, third);
  assert.equal(engine.jobs.size, 1);
  await first;
  assert.equal(engine.jobs.size, 0);
  assert.equal(engine.state('layer').visible, false);
});
test('separate layers can fade independently', async () => {
  const { client, engine, s } = fixture();
  client.items.other = { ...client.items.layer, visible: false };
  await Promise.all([engine.toggle(s), engine.toggle({ ...s, layerId: 'other' })]);
  assert.equal(client.items.layer.visible, false);
  assert.equal(client.items.other.visible, true);
});
test('external visibility changes are respected after session settling', async () => {
  const { client, engine, s, advance } = fixture();
  await engine.toggle(s);
  advance(2000);
  client.items.layer.visible = true;
  await engine.toggle(s);
  assert.equal(client.items.layer.visible, false);
});
test('uses opacity readback when available', async () => {
  const { client, engine, s } = fixture(true, { opacity: .4 });
  await engine.toggle(s);
  assert.equal(client.writes[0].value, .4);
});
test('disconnect cancels without sending a final hide', async () => {
  const { client, engine, s } = fixture();
  client.onWrite = () => { client.ready = false; client.emit('disconnected'); };
  await assert.rejects(engine.toggle(s), /Connection lost/);
  assert.equal(client.writes.length, 1);
  assert.equal(engine.jobs.size, 0);
});
test('deleted layer stops fade and cleans worker', async () => {
  const { client, engine, s } = fixture();
  client.onWrite = () => { delete client.items.layer; };
  await assert.rejects(engine.toggle(s), /missing or moved/);
  assert.equal(engine.jobs.size, 0);
});
test('failed property write rejects and cleans worker', async () => {
  const { client, engine, s } = fixture();
  client.setProperty = async () => { throw new Error('write failed'); };
  await assert.rejects(engine.toggle(s), /write failed/);
  assert.equal(engine.jobs.size, 0);
});
test('recovery sets configured opacity and makes layer visible', async () => {
  const { client, engine, s } = fixture(false);
  await engine.restore({ ...s, opacity: 80 });
  assert.equal(client.items.layer.opacity, .8);
  assert.equal(client.items.layer.visible, true);
});
test('settings clamp invalid values and reject invalid protocols', () => {
  const s = settings({ fadeInMs: -5, fadeOutMs: Infinity, opacity: 900, fps: 100, easing: 'invalid' });
  assert.equal(s.fadeInMs, 50); assert.equal(s.fadeOutMs, 500); assert.equal(s.opacity, 100); assert.equal(s.fps, 30); assert.equal(s.easing, 'smooth');
  assert.throws(() => settings({ url: 'https://example.com' }), /ws:/);
  assert.throws(() => settings({ url: 'ws://user:secret@localhost' }), /credentials/);
});
test('hierarchy supports nested layers and detects parent cycles', () => {
  const items = { scene: { type: 'scene' }, group: { type: 'layer', parent: 'scene' }, layer: { type: 'layer', parent: 'group', visible: true } };
  assert.equal(sceneFor(items, 'layer'), 'scene');
  assert.equal(selectedLayer(items, { sceneId: 'scene', layerId: 'layer' }), items.layer);
  items.group.parent = 'layer';
  assert.equal(sceneFor(items, 'layer'), null);
});
test('catalog excludes private media paths and browser URLs', () => {
  const data = catalog({ scene: { type: 'scene', name: 'Scene' }, layer: { type: 'layer', parent: 'scene', name: 'Layer', url: 'secret', source: 'private' } });
  assert.ok(!JSON.stringify(data).includes('secret'));
  assert.ok(!JSON.stringify(data).includes('private'));
});
test('easing has exact endpoints and stays monotonic', () => {
  for (const easing of ['smooth', 'linear']) {
    assert.equal(curve(0, easing), 0); assert.equal(curve(1, easing), 1);
    for (let i = 1; i <= 100; i++) assert.ok(curve(i / 100, easing) >= curve((i - 1) / 100, easing));
  }
});
