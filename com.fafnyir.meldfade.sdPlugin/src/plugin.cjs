'use strict';
const { MeldClient } = require('./meld.cjs');
const { FadeEngine } = require('./fade.cjs');
const { settings, catalog, selectedLayer } = require('./config.cjs');
const ACTION = 'com.fafnyir.meldfade.toggle';

class Plugin {
  constructor(send, { Client = MeldClient, Engine = FadeEngine, pluginUUID = '' } = {}) {
    this.send = send;
    this.Client = Client;
    this.Engine = Engine;
    this.pluginUUID = pluginUUID;
    this.groupMemory = {};
    this.persistenceReady = !pluginUUID;
    this.actions = new Map();
    this.connections = new Map();
    this.inspectors = new Set();
  }
  connection(url) {
    if (!this.connections.has(url)) {
      const client = new this.Client(url);
      const engine = new this.Engine(client, { groupMemory: this.groupMemory, memoryKey: url });
      engine.on('memory', () => {
        if (this.pluginUUID) this.send({ event: 'setGlobalSettings', context: this.pluginUUID, payload: { groupMemory: this.groupMemory } });
      });
      const entry = { client, engine };
      this.connections.set(url, entry);
      const refresh = () => {
        for (const [context, action] of this.actions) if (action.s?.url === url) this.refresh(context);
      };
      client.on('status', refresh);
      client.on('session', refresh);
      engine.on('change', refresh);
      client.start();
    }
    return this.connections.get(url);
  }
  configure(context, input) {
    try {
      const s = settings(input);
      this.actions.set(context, { s, error: null });
      this.connection(s.url);
    } catch (error) { this.actions.set(context, { error: error.message }); }
    this.refresh(context);
    this.prune();
  }
  prune() {
    for (const [url, { client, engine }] of this.connections) {
      if (![...this.actions.values()].some(a => a.s?.url === url) && engine.jobs.size === 0) {
        this.connections.delete(url);
        client.stop();
      }
    }
  }
  refresh(context) {
    const action = this.actions.get(context);
    if (!action) return;
    const entry = action.s && this.connections.get(action.s.url);
    let message = action.error || entry?.client.status || 'Not connected';
    let state = 0;
    let title = 'SETUP';
    let selected = false;
    if (entry?.client.ready) {
      try {
        selectedLayer(entry.client.items, action.s);
        selected = true;
        const actual = entry.engine.state(action.s.layerId);
        state = actual.visible ? 1 : 0;
        title = actual.fading ? (actual.targetOn ? 'FADING IN' : 'FADING OUT') : (state ? 'ON' : 'OFF');
        if (action.error) title = 'ERROR';
      } catch (error) { message = error.message; }
    } else if (action.s) title = 'OFFLINE';
    this.send({ event: 'setState', context, payload: { state } });
    this.send({ event: 'setTitle', context, payload: { title, target: 0 } });
    if (this.inspectors.has(context)) {
      this.send({ event: 'sendToPropertyInspector', action: ACTION, context, payload: {
        type: 'status', connected: Boolean(entry?.client.ready), selected, message,
        ...catalog(entry?.client.items ?? {}),
        opacityReadback: typeof entry?.client.items[action.s?.layerId]?.opacity === 'number'
      } });
    }
  }
  async handle(message) {
    const { event, context, payload = {} } = message;
    if (event === 'didReceiveGlobalSettings') {
      Object.assign(this.groupMemory, payload.settings?.groupMemory || {});
      this.persistenceReady = true;
      return;
    }
    if (message.action && message.action !== ACTION) return;
    if (event === 'willAppear' || event === 'didReceiveSettings') {
      this.configure(context, payload.settings);
    } else if (event === 'willDisappear') {
      this.actions.delete(context);
      this.inspectors.delete(context);
      this.prune();
    } else if (event === 'propertyInspectorDidAppear') {
      this.inspectors.add(context);
      this.refresh(context);
    } else if (event === 'propertyInspectorDidDisappear') {
      this.inspectors.delete(context);
    } else if (event === 'sendToPlugin' && payload.type === 'refresh') {
      this.inspectors.add(context);
      this.refresh(context);
    } else if (event === 'keyDown' || (event === 'sendToPlugin' && payload.type === 'restore')) {
      if (!this.actions.has(context)) this.configure(context, payload.settings);
      const action = this.actions.get(context);
      try {
        if (!action.s) throw new Error(action.error);
        if (!this.persistenceReady) throw new Error('Saved group settings are still loading. Press again shortly.');
        action.error = null;
        const { engine } = this.connection(action.s.url);
        if (event === 'keyDown') await engine.toggle(action.s);
        else await engine.restore(action.s);
        action.error = null;
      } catch (error) {
        action.error = error.message;
        this.send({ event: 'showAlert', context });
        // Only an explanatory message; no session dumps, source paths, or secrets.
        console.error(`[Fade Layer] ${error.message}`);
      } finally {
        this.refresh(context);
        this.prune();
      }
    }
  }
  stop() {
    for (const { client } of this.connections.values()) client.stop();
    this.connections.clear();
  }
}
function launch(argv = process.argv.slice(2)) {
  const args = new Map();
  for (let i = 0; i < argv.length - 1; i += 2) args.set(argv[i], argv[i + 1]);
  const port = Number(args.get('-port'));
  const uuid = args.get('-pluginUUID');
  const registerEvent = args.get('-registerEvent');
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !uuid || registerEvent !== 'registerPlugin') {
    throw new Error('Launch this plugin from Stream Deck. For a connection test use tools/diagnose.cjs.');
  }
  const socket = new WebSocket(`ws://127.0.0.1:${port}`);
  const plugin = new Plugin(message => {
    if (socket.readyState === 1) socket.send(JSON.stringify(message));
  }, { pluginUUID: uuid });
  socket.onopen = () => {
    socket.send(JSON.stringify({ event: registerEvent, uuid }));
    socket.send(JSON.stringify({ event: 'getGlobalSettings', context: uuid }));
  };
  socket.onmessage = ({ data }) => {
    try { plugin.handle(JSON.parse(data)).catch(error => console.error(error.message)); }
    catch { console.error('[Fade Layer] Ignored malformed Stream Deck event.'); }
  };
  socket.onerror = () => console.error('[Fade Layer] Stream Deck connection failed.');
  socket.onclose = () => { plugin.stop(); process.exit(0); };
  process.on('SIGTERM', () => { plugin.stop(); socket.close(); });
  process.on('SIGINT', () => { plugin.stop(); socket.close(); });
  return plugin;
}
if (require.main === module) {
  try { launch(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { Plugin, launch, ACTION };
