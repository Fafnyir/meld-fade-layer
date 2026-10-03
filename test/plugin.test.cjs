'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { Plugin, ACTION } = require('../com.fafnyir.meldfade.sdPlugin/src/plugin.cjs');
const { FadeEngine } = require('../com.fafnyir.meldfade.sdPlugin/src/fade.cjs');
class Client extends EventEmitter {
  constructor() { super(); this.items = { s: { type: 'scene', name: 'Demo' }, l: { type: 'layer', parent: 's', name: 'Layer', visible: false } }; this.status = 'Connected'; }
  start() { this.ready = true; this.emit('status'); }
  stop() { this.ready = false; }
  async setProperty(id, property, value) { this.items[id][property] = value; }
}
class Engine extends FadeEngine {
  constructor(client) { let time = 0; super(client, { now: () => time, wait: async ms => { time += ms; } }); }
}
test('Stream Deck events populate inspector and update key from shared layer state', async () => {
  const messages = [];
  const plugin = new Plugin(m => messages.push(m), { Client, Engine });
  const settings = { sceneId: 's', layerId: 'l' };
  for (const context of ['key1', 'key2']) await plugin.handle({ event: 'willAppear', action: ACTION, context, payload: { settings } });
  await plugin.handle({ event: 'propertyInspectorDidAppear', context: 'key1' });
  assert.equal(messages.find(m => m.event === 'sendToPropertyInspector').payload.layers[0].id, 'l');
  await plugin.handle({ event: 'keyDown', context: 'key1' });
  for (const context of ['key1', 'key2']) assert.equal(messages.filter(m => m.event === 'setState' && m.context === context).at(-1).payload.state, 1);
  assert.equal(plugin.connections.size, 1);
  plugin.stop();
});
test('invalid settings produce an alert without writing to Meld', async () => {
  const messages = [];
  const plugin = new Plugin(m => messages.push(m), { Client, Engine });
  await plugin.handle({ event: 'willAppear', context: 'key', payload: { settings: { url: 'invalid' } } });
  await plugin.handle({ event: 'keyDown', context: 'key' });
  assert.ok(messages.some(m => m.event === 'showAlert')); assert.equal(plugin.connections.size, 0);
});
test('removing a key releases an idle connection', async () => {
  const plugin = new Plugin(() => {}, { Client, Engine });
  await plugin.handle({ event: 'willAppear', context: 'key', payload: { settings: { sceneId: 's', layerId: 'l' } } });
  await plugin.handle({ event: 'willDisappear', context: 'key' });
  assert.equal(plugin.connections.size, 0);
});

test('Stream Deck global settings preserve the group mask across plugin restart', async () => {
  class GroupClient extends Client {
    constructor() { super(); this.items = { s: { type: 'scene', name: 'Scene' }, g: { type: 'layer', name: 'Group', parent: 's', visible: true }, a: { type: 'layer', name: 'Group/A', parent: 's', visible: true }, h: { type: 'layer', name: 'Group/Hidden', parent: 's', visible: false } }; }
  }
  class GroupEngine extends FadeEngine {
    constructor(client, options) { let time = 0; super(client, { ...options, now: () => time, wait: async ms => { time += ms; } }); }
  }
  const messages = [], opts = { Client: GroupClient, Engine: GroupEngine, pluginUUID: 'plugin' };
  const first = new Plugin(m => messages.push(m), opts);
  await first.handle({ event: 'didReceiveGlobalSettings', payload: { settings: {} } });
  const appear = { event: 'willAppear', context: 'key', payload: { settings: { sceneId: 's', layerId: 'g' } } };
  await first.handle(appear);
  await first.handle({ event: 'keyDown', context: 'key' });
  const saved = JSON.parse(JSON.stringify(messages.find(m => m.event === 'setGlobalSettings').payload));
  assert.equal(Object.values(saved.groupMemory)[0].length, 1);
  const second = new Plugin(() => {}, opts);
  await second.handle({ event: 'didReceiveGlobalSettings', payload: { settings: saved } });
  await second.handle(appear);
  const entry = [...second.connections.values()][0]; entry.client.items.a.visible = false;
  await second.handle({ event: 'keyDown', context: 'key' });
  assert.equal(entry.client.items.a.visible, true);
  assert.equal(entry.client.items.h.visible, false);
  first.stop(); second.stop();
});
