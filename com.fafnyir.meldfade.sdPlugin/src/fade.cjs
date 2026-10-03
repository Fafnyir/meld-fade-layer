'use strict';
const { EventEmitter } = require('node:events');
const { selectedLayer, groupLeaves } = require('./config.cjs');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const curve = (t, easing) => easing === 'linear' ? t : t * t * (3 - 2 * t);

class FadeEngine extends EventEmitter {
  constructor(client, { now = () => performance.now(), wait = sleep, groupMemory = {}, memoryKey = '' } = {}) {
    super();
    this.client = client;
    this.now = now;
    this.wait = wait;
    this.groupMemory = groupMemory;
    this.memoryKey = memoryKey;
    this.jobs = new Map();
    this.settled = new Map();
    client.on('disconnected', () => {
      for (const job of this.jobs.values()) job.cancelled = true;
      this.settled.clear();
    });
  }
  state(id) {
    const job = this.jobs.get(id);
    if (job) return { visible: job.visible, fading: true, targetOn: job.targetOn };
    const recent = this.settled.get(id);
    if (recent && this.now() - recent.at < 1500) return { visible: recent.visible, fading: false };
    const children = groupLeaves(this.client.items, id);
    return { visible: children.length ? children.some(child => this.client.items[child].visible) : this.client.items[id]?.visible, fading: false };
  }
  members(s, visible, recover = false) {
    const leaves = groupLeaves(this.client.items, s.layerId);
    if (!leaves.length) return null;
    if (!this.client.items[s.layerId].visible) throw new Error('Show the group folder in Meld first. Fade Layer controls its contents.');
    const key = JSON.stringify([this.memoryKey, s.layerId]);
    const saved = this.groupMemory[key];
    const reuse = (!visible || recover) && Array.isArray(saved);
    const ids = reuse ? saved.map(x => x?.id).filter(id => leaves.includes(id)) :
      visible ? leaves.filter(id => this.client.items[id].visible && this.client.items[id].isEffectivelyVisible !== false) : [];
    if (!ids.length) throw new Error('No visible group members to remember. Show the desired children in Meld, then fade the group out once.');
    const members = ids.map(id => {
      const read = this.client.items[id].opacity;
      const stored = reuse ? saved?.find(x => x?.id === id)?.opacity : undefined;
      const base = typeof stored === 'number' ? stored : read;
      return { id, opacity: typeof base === 'number' && Number.isFinite(base) && base >= 0 && base <= 1 ? base : s.opacity / 100 };
    });
    this.groupMemory[key] = members;
    this.emit('memory');
    return members;
  }
  checkOverlap(ids, ownId) {
    for (const [id, job] of this.jobs) {
      if (id !== ownId && (job.members?.map(m => m.id) || [id]).some(member => ids.includes(member))) {
        throw new Error('A group or child using these layers is already fading. Wait for it to finish.');
      }
    }
  }
  toggle(s) {
    if (!this.client.ready) return Promise.reject(new Error('Meld is not connected.'));
    let layer;
    try { layer = selectedLayer(this.client.items, s); } catch (e) { return Promise.reject(e); }
    const running = this.jobs.get(s.layerId);
    if (running) {
      running.targetOn = !running.targetOn;
      running.s = s;
      running.revision++;
      this.emit('change', s.layerId);
      return running.promise;
    }
    const visible = this.state(s.layerId).visible;
    let members;
    try {
      members = this.members(s, visible);
      this.checkOverlap(members?.map(m => m.id) || [s.layerId], s.layerId);
    } catch (error) { return Promise.reject(error); }
    // Current Meld omits opacity in session. Use the explicitly configured visible level.
    const reported = members ? s.opacity / 100 : layer.opacity;
    const opacity = typeof reported === 'number' && reported >= 0 && reported <= 1 ? reported : s.opacity / 100;
    const job = { s, visible, opacity, members, scale: s.opacity / 100, targetOn: !visible, revision: 0, cancelled: false };
    this.jobs.set(s.layerId, job);
    job.promise = this.run(job).then(() => {
      this.settled.set(s.layerId, { visible: job.visible, at: this.now() });
    }).finally(() => {
      this.jobs.delete(s.layerId);
      this.emit('change', s.layerId);
    });
    this.emit('change', s.layerId);
    return job.promise;
  }
  check(job) {
    if (job.cancelled || !this.client.ready) throw new Error('Connection lost during the fade. Restore the layer after reconnecting.');
    selectedLayer(this.client.items, job.s);
    if (job.members) {
      const leaves = groupLeaves(this.client.items, job.s.layerId);
      if (job.members.some(m => !leaves.includes(m.id))) throw new Error('Group contents changed during the fade. Restore the group before retrying.');
    }
  }
  async write(job, property, value) {
    this.check(job);
    if (job.members) {
      // All leaves receive the same frame before the next frame begins. No writes
      // to folder objects: Meld acknowledges those but does not apply them.
      await Promise.all(job.members.map(member => this.client.setProperty(member.id, property,
        property === 'opacity' ? Math.min(1, member.opacity * value / job.scale) : value)));
    } else await this.client.setProperty(job.s.layerId, property, value);
    if (property === 'visible') job.visible = value;
    else job.opacity = value;
  }
  async run(job) {
    while (true) {
      this.check(job);
      const revision = job.revision;
      const s = job.s;
      const targetOn = job.targetOn;
      const goal = targetOn ? s.opacity / 100 : 0;
      if (targetOn && !job.visible) {
        // Both writes are acknowledged in order: never reveal at full opacity first.
        await this.write(job, 'opacity', 0);
        if (revision !== job.revision) continue;
        await this.write(job, 'visible', true);
      }
      if (revision !== job.revision) continue;
      const startOpacity = job.visible ? job.opacity : 0;
      const startTime = this.now();
      const fullDuration = targetOn ? s.fadeInMs : s.fadeOutMs;
      // A reversal travels only the remaining distance at the configured average speed.
      const duration = fullDuration * Math.min(1, Math.abs(goal - startOpacity) / (s.opacity / 100));
      while (revision === job.revision) {
        this.check(job);
        const frameStart = this.now();
        const progress = duration === 0 ? 1 : Math.min(1, (frameStart - startTime) / duration);
        const value = startOpacity + (goal - startOpacity) * curve(progress, s.easing);
        await this.write(job, 'opacity', progress === 1 ? goal : value);
        if (progress === 1 || revision !== job.revision) break;
        await this.wait(Math.max(0, 1000 / s.fps - (this.now() - frameStart)));
      }
      if (revision !== job.revision) continue;
      if (!targetOn) {
        await this.write(job, 'visible', false);
        // Restore the visible level while hidden, so manual visibility changes work normally.
        await this.write(job, 'opacity', s.opacity / 100);
      }
      if (revision === job.revision) return;
    }
  }
  async restore(s) {
    const active = this.jobs.get(s.layerId);
    if (active) { active.cancelled = true; await active.promise.catch(() => {}); }
    selectedLayer(this.client.items, s);
    const members = this.members(s, this.state(s.layerId).visible, true);
    this.checkOverlap(members?.map(m => m.id) || [s.layerId], s.layerId);
    const job = { s, members, scale: s.opacity / 100, cancelled: false };
    await this.write(job, 'opacity', s.opacity / 100);
    await this.write(job, 'visible', true);
    this.settled.set(s.layerId, { visible: true, at: this.now() });
    this.emit('change', s.layerId);
  }
}
module.exports = { FadeEngine, curve };
