'use strict';
// Read-only: intentionally never calls setProperty or other mutation methods.
const { MeldClient } = require('../com.fafnyir.meldfade.sdPlugin/src/meld.cjs');
const { settings, catalog } = require('../com.fafnyir.meldfade.sdPlugin/src/config.cjs');
const s = settings({ url: process.argv[2] || 'ws://127.0.0.1:13376' });
const client = new MeldClient(s.url);
let finished = false;
const timer = setTimeout(() => finish(false), 6000);
function finish(success) {
  if (finished) return;
  finished = true;
  clearTimeout(timer);
  if (!success) { console.error(client.status); process.exitCode = 1; }
  client.stop();
}
client.on('ready', () => {
  const data = catalog(client.items);
  console.log(`Connected to Meld API ${client.version}; setProperty is available.`);
  console.log(`Found ${data.scenes.length} scenes and ${data.layers.length} layers.`);
  console.log('Opacity writes use fractional values 0–1. Current Meld may omit opacity from session readback.');
  console.log('No layers were changed.');
  // Defer stop until the connection callback has finished emitting its events.
  setImmediate(() => finish(true));
});
client.start();
