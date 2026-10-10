const assert = require('assert');
const path = require('path');
const Module = require('module');

function createHarness() {
  const users = new Map();
  const entries = [];

  const clone = (value) => JSON.parse(JSON.stringify(value));

  const User = {
    async findOneAndUpdate(query, update, options = {}) {
      const user = users.get(query._id);
      if (!user) {
        return null;
      }

      if (query.coin && typeof query.coin.$gte === 'number' && user.coin < query.coin.$gte) {
        return null;
      }

      if (update.$inc && typeof update.$inc.coin === 'number') {
        user.coin += update.$inc.coin;
      }

      return options.new ? { ...user } : null;
    },
    async findById(id) {
      const user = users.get(id);
      return user ? { ...user } : null;
    },
  };

  const CoinLedger = {
    async create(doc) {
      const created = {
        _id: `entry-${entries.length + 1}`,
        createdAt: doc.createdAt || new Date(),
        ...clone(doc),
      };
      entries.push(created);
      return created;
    },
    find(query = {}) {
      // Like MongoDB: insertion order unless the caller asks for .sort().
      let result = entries.filter((entry) => !query.userId || entry.userId === query.userId);

      return {
        sort(spec) {
          if (spec.createdAt === -1) result = [...result].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
          return this;
        },
        skip(count) {
          this._skip = count;
          return this;
        },
        limit(count) {
          this._limit = count;
          return Promise.resolve(
            result.slice(this._skip || 0, (this._skip || 0) + count).map((item) => ({ ...item })),
          );
        },
      };
    },
    async countDocuments(query = {}) {
      return entries.filter((entry) => !query.userId || entry.userId === query.userId).length;
    },
  };

  const servicePath = path.resolve(__dirname, '../services/coinLedger.service.js');
  delete require.cache[servicePath];

  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '../models/user.model') return User;
    if (request === '../models/coin_ledger.model') return CoinLedger;
    return originalLoad(request, parent, isMain);
  };

  const service = require(servicePath);
  Module._load = originalLoad;

  return { users, entries, service };
}

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

async function expectReject(promiseFactory, pattern) {
  let threw = false;
  try {
    await promiseFactory();
  } catch (error) {
    threw = true;
    assert.match(error.message, pattern);
  }

  if (!threw) {
    throw new Error(`Expected rejection matching ${pattern}`);
  }
}

async function main() {
  await runTest('applyCoinChange records before and after balances for rewards', async () => {
    const harness = createHarness();
    harness.users.set('user-1', { _id: 'user-1', coin: 25 });

    const result = await harness.service.applyCoinChange({
      userId: 'user-1',
      delta: 15,
      reason: 'quest_reward',
      sourceType: 'quest',
      sourceId: 'progress-1',
      note: 'Daily quest reward',
      metadata: { questId: 'daily_watch_10min' },
    });

    assert.equal(result.balanceBefore, 25);
    assert.equal(result.balanceAfter, 40);
    assert.equal(result.user.coin, 40);
    assert.equal(harness.entries.length, 1);
    assert.equal(harness.entries[0].delta, 15);
    assert.equal(harness.entries[0].balanceBefore, 25);
    assert.equal(harness.entries[0].balanceAfter, 40);
  });

  await runTest('applyCoinChange blocks overspending for deductions', async () => {
    const harness = createHarness();
    harness.users.set('user-2', { _id: 'user-2', coin: 10 });

    await expectReject(
      () =>
        harness.service.applyCoinChange({
          userId: 'user-2',
          delta: -30,
          reason: 'premium_upgrade',
          sourceType: 'premium',
          sourceId: 'monthly',
        }),
      /khong du coin|insufficient/i,
    );

    assert.equal(harness.users.get('user-2').coin, 10);
    assert.equal(harness.entries.length, 0);
  });

  await runTest('getCoinHistory returns newest entries first with pagination metadata', async () => {
    const harness = createHarness();
    harness.users.set('user-3', { _id: 'user-3', coin: 100 });

    await harness.service.applyCoinChange({
      userId: 'user-3',
      delta: 20,
      reason: 'payment_success',
      sourceType: 'payment',
      sourceId: 'tx-1',
      createdAt: new Date('2026-04-05T08:00:00.000Z'),
    });
    await harness.service.applyCoinChange({
      userId: 'user-3',
      delta: -30,
      reason: 'cursor_purchase',
      sourceType: 'cursor_effect',
      sourceId: 'galaxy',
      createdAt: new Date('2026-04-06T08:00:00.000Z'),
    });

    const result = await harness.service.getCoinHistory('user-3', { page: 1, limit: 1 });

    assert.equal(result.total, 2);
    assert.equal(result.totalPages, 2);
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].reason, 'cursor_purchase');
    assert.equal(result.entries[0].delta, -30);
  });
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
