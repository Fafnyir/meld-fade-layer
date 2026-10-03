'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const root = path.join(__dirname, '..', 'com.fafnyir.meldfade.sdPlugin');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
assert.equal(manifest.UUID, 'com.fafnyir.meldfade');
assert.equal(manifest.Nodejs.Version, '24');
assert.equal(manifest.Actions[0].DisableAutomaticStates, true);
for (const file of [manifest.CodePath, manifest.Actions[0].PropertyInspectorPath]) assert.ok(fs.existsSync(path.join(root, file)), file);
for (const name of [manifest.Icon, manifest.CategoryIcon, manifest.Actions[0].Icon, ...manifest.Actions[0].States.map(s => s.Image)]) {
  assert.ok(fs.existsSync(path.join(root, name + '.png')), name);
  assert.ok(fs.existsSync(path.join(root, name + '@2x.png')), name + '@2x');
}
for (const folder of ['src', 'ui']) {
  for (const file of fs.readdirSync(path.join(root, folder))) if (/\.(cjs|js)$/.test(file)) {
    const result = spawnSync(process.execPath, ['--check', path.join(root, folder, file)], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
}
console.log('Manifest references, icons, and JavaScript syntax passed.');
