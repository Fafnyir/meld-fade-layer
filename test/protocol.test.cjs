'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { MeldClient } = require('../com.fafnyir.meldfade.sdPlugin/src/meld.cjs');

class Socket {
  constructor() { this.readyState = 0; this.bufferedAmount = 0; this.sent = []; Socket.last = this; }
  open() { this.readyState = 1; this.onopen?.(); }
  send(data) { this.sent.push(JSON.parse(data)); }
  receive(data) { this.onmessage?.({ data: JSON.stringify(data) }); }
  close() { this.readyState = 3; this.onclose?.(); }
}
function connect(t, overrides = {}) {
  const client = new MeldClient('ws://127.0.0.1:13376', { WebSocketImpl: Socket, timeout: 200, retryMs: 1000, ...overrides });
  t.after(() => client.stop());
  client.start();
  const socket = Socket.last;
  socket.open();
  socket.receive({ type: 10, id: 0, data: { meld: {
    methods: [['setProperty', 42]], properties: [[7, 'version', [1, 5], 3], [9, 'session', [1, 6], { items: { layer: { type: 'layer', visible: true } } }]]
  } } });
  return { client, socket };
}
test('discovers server indices and acknowledges initialization', t => {
  const { client, socket } = connect(t);
  assert.deepEqual(socket.sent, [{ type: 3, id: 0 }, { type: 4 }]);
  assert.equal(client.version, 3); assert.equal(client.ready, true);
});
test('invokes setProperty using the discovered index, with request ID and fractional opacity', async t => {
  const { client, socket } = connect(t);
  const pending = client.setProperty('layer', 'opacity', .5);
  const request = socket.sent.at(-1);
  assert.deepEqual(request, { type: 6, object: 'meld', method: 42, args: ['layer', 'opacity', .5], id: 1 });
  socket.receive({ type: 10, id: request.id, data: null });
  await pending;
  assert.equal(client.pending.size, 0);
});
test('session updates replace state and emit idle acknowledgement', t => {
  const { client, socket } = connect(t);
  let updates = 0; client.on('session', () => updates++);
  socket.receive({ type: 2, data: [{ object: 'meld', properties: { 9: { items: { replacement: { type: 'layer', visible: false } } } } }] });
  assert.equal(client.items.layer, undefined);
  assert.equal(client.items.replacement.visible, false);
  assert.equal(updates, 1);
  assert.deepEqual(socket.sent.at(-1), { type: 4 });
});
test('disconnect rejects outstanding calls and discards old session', async t => {
  const { client, socket } = connect(t);
  const pending = client.setProperty('layer', 'visible', false);
  socket.close();
  await assert.rejects(pending, /disconnected/);
  assert.equal(client.pending.size, 0); assert.deepEqual(client.items, {});
});
test('timeout rejects, cancels connection, and leaves no pending request', async t => {
  const { client } = connect(t, { timeout: 15 });
  await assert.rejects(client.setProperty('layer', 'opacity', .5), /stopped responding/);
  assert.equal(client.ready, false); assert.equal(client.pending.size, 0);
});
test('unsupported Meld API fails explicitly', t => {
  const client = new MeldClient('ws://localhost', { WebSocketImpl: Socket });
  t.after(() => client.stop()); client.start(); const socket = Socket.last; socket.open();
  socket.receive({ type: 10, id: 0, data: { meld: { methods: [], properties: [] } } });
  assert.match(client.status, /lacks setProperty/); assert.equal(client.ready, false);
});
test('out-of-range opacity and stale layer are rejected before sending', async t => {
  const { client, socket } = connect(t);
  await assert.rejects(client.setProperty('layer', 'opacity', 50), /between 0 and 1/);
  await assert.rejects(client.setProperty('missing', 'visible', true), /no longer exists/);
  assert.equal(socket.sent.length, 2);
});
test('reconnect re-discovers indices and rejects stale socket traffic', async t => {
  const { client, socket } = connect(t, { retryMs: 5 });
  socket.close();
  await new Promise(resolve => setTimeout(resolve, 15));
  const replacement = Socket.last;
  assert.notEqual(replacement, socket);
  replacement.open();
  replacement.receive({ type: 10, id: 0, data: { meld: { methods: [['setProperty', 99]], properties: [[0, 'session', [], { items: {} }]] } } });
  socket.receive({ type: 2, data: [{ object: 'meld', properties: { 9: { items: { stale: {} } } } }] });
  assert.equal(client.methods.get('setProperty'), 99); assert.deepEqual(client.items, {});
});
