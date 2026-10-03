'use strict';

const DEFAULTS = Object.freeze({
  url: 'ws://127.0.0.1:13376', sceneId: '', layerId: '',
  fadeInMs: 500, fadeOutMs: 500, opacity: 100, fps: 30, easing: 'smooth'
});
function number(value, fallback, min, max) {
  if (value === '' || value == null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}
function settings(input = {}) {
  const s = { ...DEFAULTS, ...input };
  let url;
  try { url = new URL(s.url); } catch { throw new Error('Enter a valid Meld WebSocket address.'); }
  if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error('Use a ws:// or wss:// address without credentials or a fragment.');
  }
  return {
    url: url.href, sceneId: typeof s.sceneId === 'string' ? s.sceneId : '',
    layerId: typeof s.layerId === 'string' ? s.layerId : '',
    fadeInMs: Math.round(number(s.fadeInMs, 500, 50, 10000)),
    fadeOutMs: Math.round(number(s.fadeOutMs, 500, 50, 10000)),
    opacity: number(s.opacity, 100, 1, 100),
    fps: [15, 30, 60].includes(Number(s.fps)) ? Number(s.fps) : 30,
    easing: s.easing === 'linear' ? 'linear' : 'smooth'
  };
}
function sceneFor(items, id) {
  const visited = new Set();
  while (id && items[id] && !visited.has(id)) {
    visited.add(id);
    if (items[id].type === 'scene') return id;
    id = items[id].parent;
  }
  return null;
}
function selectedLayer(items, s) {
  if (!s.sceneId || !s.layerId) throw new Error('Choose a scene and a layer in the action settings.');
  if (items[s.sceneId]?.type !== 'scene') throw new Error('The saved scene is missing. Choose a scene again.');
  const layer = items[s.layerId];
  if (layer?.type !== 'layer' || sceneFor(items, s.layerId) !== s.sceneId) {
    throw new Error('The saved layer is missing or moved. Choose a layer again.');
  }
  if (typeof layer.visible !== 'boolean') throw new Error('Meld did not report this layer’s visibility.');
  return layer;
}
function catalog(items) {
  // Send only names, IDs and hierarchy to the inspector, never media paths or overlay URLs.
  const order = (a, b) => (a.index ?? 0) - (b.index ?? 0) || a.name.localeCompare(b.name);
  const scenes = [], layers = [];
  for (const [id, item] of Object.entries(items)) {
    const entry = { id, name: String(item.name || id), index: item.index ?? 0 };
    if (item.type === 'scene') scenes.push(entry);
    if (item.type === 'layer') layers.push({ ...entry, name: entry.name + (groupLeaves(items, id).length ? ' (group)' : ''), sceneId: sceneFor(items, id) });
  }
  return { scenes: scenes.sort(order), layers: layers.sort(order) };
}
// Meld 0.10.6.9 flattens groups: children retain the scene parent and use
// slash-separated full names. Also accept real ancestry if future versions expose it.
function groupLeaves(items, id) {
  const root = items[id];
  if (!root || root.type !== 'layer') return [];
  const beneath = (childId, parentId) => {
    let at = items[childId]?.parent;
    const seen = new Set();
    while (at && !seen.has(at)) {
      if (at === parentId) return true;
      seen.add(at); at = items[at]?.parent;
    }
    return sceneFor(items, childId) === sceneFor(items, parentId) &&
      typeof items[parentId]?.name === 'string' &&
      items[childId]?.name?.startsWith(items[parentId].name + '/');
  };
  const children = Object.keys(items).filter(child => child !== id && items[child].type === 'layer' && beneath(child, id));
  return children.filter(child => !children.some(other => other !== child && beneath(other, child)));
}
module.exports = { DEFAULTS, settings, sceneFor, selectedLayer, catalog, groupLeaves };
