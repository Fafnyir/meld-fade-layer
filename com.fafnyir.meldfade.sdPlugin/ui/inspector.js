'use strict';
(() => {
  const fields = ['url', 'sceneId', 'layerId', 'fadeInMs', 'fadeOutMs', 'opacity', 'fps', 'easing'];
  const defaults = { url: 'ws://127.0.0.1:13376', sceneId: '', layerId: '', fadeInMs: 500, fadeOutMs: 500, opacity: 100, fps: 30, easing: 'smooth' };
  let socket, uuid, action, saved = { ...defaults }, scenes = [], layers = [];
  const $ = id => document.getElementById(id);
  const send = (event, payload) => {
    if (socket?.readyState === 1) socket.send(JSON.stringify({ event, context: uuid, action, payload }));
  };
  function options(id, list, value, placeholder) {
    const select = $(id);
    select.replaceChildren(new Option(placeholder, ''));
    for (const item of list) select.add(new Option(item.name, item.id));
    if (value && !list.some(item => item.id === value)) select.add(new Option('Saved selection unavailable — choose again', value));
    select.value = value || '';
  }
  function render() {
    options('sceneId', scenes, saved.sceneId, 'Choose a scene…');
    options('layerId', layers.filter(item => item.sceneId === saved.sceneId), saved.layerId, 'Choose a layer…');
    for (const key of fields.filter(x => !['sceneId', 'layerId'].includes(x))) $(key).value = saved[key];
  }
  function save() {
    if (!$('settings').reportValidity()) return;
    for (const key of fields) saved[key] = ['fadeInMs', 'fadeOutMs', 'opacity', 'fps'].includes(key) ? Number($(key).value) : $(key).value;
    send('setSettings', saved);
  }
  window.connectElgatoStreamDeckSocket = (port, inUUID, registerEvent, info, actionInfo) => {
    uuid = inUUID;
    const data = JSON.parse(actionInfo);
    action = data.action;
    saved = { ...defaults, ...data.payload.settings };
    render();
    socket = new WebSocket(`ws://127.0.0.1:${port}`);
    socket.onopen = () => {
      socket.send(JSON.stringify({ event: registerEvent, uuid }));
      send('sendToPlugin', { type: 'refresh' });
    };
    socket.onmessage = ({ data }) => {
      const msg = JSON.parse(data);
      if (msg.event === 'didReceiveSettings') { saved = { ...defaults, ...msg.payload.settings }; render(); }
      if (msg.event !== 'sendToPropertyInspector' || msg.payload?.type !== 'status') return;
      const p = msg.payload;
      $('status').textContent = p.message;
      $('status').dataset.connected = String(p.connected);
      $('restore').disabled = !p.connected || !p.selected;
      scenes = p.scenes;
      layers = p.layers;
      // Session updates should not overwrite a number/address while the user is editing it.
      options('sceneId', scenes, saved.sceneId, 'Choose a scene…');
      options('layerId', layers.filter(item => item.sceneId === saved.sceneId), saved.layerId, 'Choose a layer…');
    };
    socket.onclose = () => { $('status').textContent = 'Stream Deck disconnected. Select the action again.'; $('restore').disabled = true; };
    socket.onerror = () => { $('status').textContent = 'Could not connect to Stream Deck.'; };
  };
  for (const key of fields) $(key).addEventListener('change', () => {
    if (key === 'sceneId') {
      saved.sceneId = $('sceneId').value;
      saved.layerId = '';
      options('layerId', layers.filter(item => item.sceneId === saved.sceneId), '', 'Choose a layer…');
    }
    save();
  });
  $('settings').addEventListener('submit', event => event.preventDefault());
  $('refresh').addEventListener('click', () => send('sendToPlugin', { type: 'refresh' }));
  $('restore').addEventListener('click', () => send('sendToPlugin', { type: 'restore' }));
})();
