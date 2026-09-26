const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function loadService(settings, clearCache) {
  const sandbox = {
    module: { exports: {} },
    require: (name) => {
      if (name === '../models/Settings') return settings;
      if (name === '../middleware/cache.middleware') return { clearCache };
      return {};
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'admin.service.js'), 'utf8'), sandbox);
  return sandbox.module.exports;
}

test('saving theme clears public theme cache variants after persistence', async () => {
  const events = [];
  const setting = { value: 'christmas' };
  const service = loadService({
    findOneAndUpdate: async (query, update) => {
      assert.equal(query.key, 'theme');
      assert.equal(update.value, 'christmas');
      events.push('saved');
      return setting;
    },
  }, async (key) => {
    events.push(key);
  });
  assert.equal(await service.setTheme('christmas'), setting);
  assert.deepEqual(events, ['saved', 'cache:/api/v1/movies/meta/theme*']);
});

test('failed persistence does not invalidate the existing theme cache', async () => {
  let invalidated = false;
  const service = loadService({
    findOneAndUpdate: async () => { throw new Error('DB unavailable'); },
  }, async () => { invalidated = true; });
  await assert.rejects(service.setTheme('christmas'), /DB unavailable/);
  assert.equal(invalidated, false);
});
