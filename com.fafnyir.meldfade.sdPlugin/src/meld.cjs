'use strict';
const { EventEmitter } = require('node:events');

// Minimal implementation of the documented Qt WebChannel wire protocol.
// Method/property indices are discovered on every connection, never hard-coded.
class MeldClient extends EventEmitter {
  constructor(url, { WebSocketImpl = globalThis.WebSocket, timeout = 4000, retryMs = 1000 } = {}) {
    super();
    this.url = url;
    this.WebSocketImpl = WebSocketImpl;
    this.timeout = timeout;
    this.retryMs = retryMs;
    this.pending = new Map();
    this.methods = new Map();
    this.properties = new Map();
    this.items = {};
    this.ready = false;
    this.stopped = true;
    this.nextId = 1;
    this.version = 1;
    this.status = 'Not connected';
  }
  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
  }
  connect() {
    if (this.stopped) return;
    this.status = 'Connecting to Meld…';
    this.emit('status');
    const socket = this.socket = new this.WebSocketImpl(this.url);
    let ended = false;
    const fail = (message) => {
      if (ended || this.socket !== socket) return;
      ended = true;
      clearTimeout(this.handshakeTimer);
      this.ready = false;
      this.items = {};
      this.methods.clear();
      this.status = message;
      for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error(message)); }
      this.pending.clear();
      try { socket.close(); } catch { /* already closed */ }
      this.emit('disconnected');
      this.emit('status');
      if (!this.stopped) {
        this.retryTimer = setTimeout(() => this.connect(), this.retryMs);
      }
    };
    this.handshakeTimer = setTimeout(() => fail('Meld handshake timed out. Check its WebSocket server.'), this.timeout);
    socket.onopen = () => { if (!ended) this.send({ type: 3, id: 0 }); };
    socket.onerror = () => fail('Meld unavailable. Open Meld and enable Settings → Advanced → WebSocket Server.');
    socket.onclose = () => fail('Meld disconnected. Reconnecting…');
    socket.onmessage = ({ data }) => {
      if (ended || this.socket !== socket) return;
      try {
        const msg = JSON.parse(data);
        if (msg.type === 10 && msg.id === 0 && !this.ready) {
          const meta = msg.data?.meld;
          if (!meta || !Array.isArray(meta.methods) || !Array.isArray(meta.properties)) {
            return fail('The server is not a compatible Meld WebChannel endpoint.');
          }
          this.methods = new Map(meta.methods);
          this.properties = new Map(meta.properties.map(([index, name]) => [String(index), name]));
          const props = Object.fromEntries(meta.properties.map(([, name, , value]) => [name, value]));
          this.version = props.version ?? 1;
          this.items = props.session?.items ?? {};
          if (!this.methods.has('setProperty')) return fail('This Meld version lacks setProperty. Update Meld Studio.');
          clearTimeout(this.handshakeTimer);
          this.ready = true;
          this.status = `Connected · Meld API ${this.version}`;
          this.send({ type: 4 });
          this.emit('ready');
          this.emit('session');
          this.emit('status');
        } else if (msg.type === 10) {
          const request = this.pending.get(msg.id);
          if (request) {
            clearTimeout(request.timer);
            this.pending.delete(msg.id);
            if (msg.error || msg.data === false) request.reject(new Error('Meld rejected the property change.'));
            else request.resolve(msg.data);
          }
        } else if (msg.type === 2) {
          let changed = false;
          for (const update of msg.data ?? []) {
            if (update.object !== 'meld') continue;
            for (const [index, value] of Object.entries(update.properties ?? {})) {
              if (this.properties.get(index) === 'session') {
                this.items = value?.items ?? {};
                changed = true;
              }
            }
          }
          // QWebChannel requires an idle acknowledgement to release future updates.
          this.send({ type: 4 });
          if (changed) this.emit('session');
        }
      } catch { fail('Invalid response from the Meld WebSocket server.'); }
    };
    this.fail = fail;
  }
  send(message) {
    if (this.socket?.readyState !== 1) throw new Error('Meld is not connected.');
    if (this.socket.bufferedAmount > 256 * 1024) throw new Error('Meld connection is too slow. Try 15 fps.');
    this.socket.send(JSON.stringify(message));
  }
  call(method, args) {
    if (!this.ready || !this.methods.has(method)) return Promise.reject(new Error('Meld is not ready.'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Meld stopped responding. Fade cancelled; reconnect and restore the layer.'));
        this.fail('Meld stopped responding. Reconnecting…');
      }, this.timeout);
      this.pending.set(id, { resolve, reject, timer });
      try { this.send({ type: 6, object: 'meld', method: this.methods.get(method), args, id }); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  async setProperty(id, property, value) {
    if (this.items[id]?.type !== 'layer') throw new Error('The selected layer no longer exists.');
    if (!['opacity', 'visible'].includes(property)) throw new Error('Unsupported layer property.');
    if (property === 'opacity' && !(typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1)) {
      throw new Error('Opacity must be between 0 and 1.');
    }
    if (property === 'visible' && typeof value !== 'boolean') throw new Error('Visibility must be a boolean.');
    await this.call('setProperty', [id, property, value]);
  }
  stop() {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    clearTimeout(this.handshakeTimer);
    this.fail?.('Disconnected');
    this.socket?.close();
  }
}
module.exports = { MeldClient };
