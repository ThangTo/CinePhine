const assert = require('assert');
const path = require('path');
const Module = require('module');

function loadModuleWithMocks(modulePath, mocks) {
  delete require.cache[modulePath];

  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }
    return originalLoad(request, parent, isMain);
  };

  try {
    return require(modulePath);
  } finally {
    Module._load = originalLoad;
  }
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

const expectedLeaderboardScore = ({ totalWatchTime, currentStreak, maxStreak }) => Math.round(
  (Number(totalWatchTime) || 0) / 60
  + 500 * Math.log2((Number(currentStreak) || 0) + 1)
  + 150 * Math.log2((Number(maxStreak) || 0) + 1),
);

async function main() {
  await runTest('leaderboard ranks active streaks first, then by weighted score, with 1 hour day-scoped cache', async () => {
    const state = {
      users: [
        {
          _id: 'user-stale',
          username: 'stale',
          avatar: '',
          watchStreak: 7,
          longestStreak: 9,
          role: 'user',
        },
        {
          _id: 'user-active',
          username: 'active',
          avatar: '',
          watchStreak: 4,
          longestStreak: 6,
          role: 'premium',
          premiumPlan: 'monthly',
          premiumExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ],
      watchStats: [
        // Stale user out-scores the active one but must still rank below.
        { _id: 'user-stale', totalWatchTime: 120000 },
        { _id: 'user-active', totalWatchTime: 1800 },
      ],
      redisGets: [],
      redisSets: [],
      redisPatterns: [],
      streakCalls: [],
    };

    const servicePath = path.resolve(__dirname, '../services/leaderboard.service.js');
    const leaderboardService = loadModuleWithMocks(servicePath, {
      mongoose: {
        model(name) {
          if (name === 'User') {
            return {
              find(query) {
                state.userQuery = query;
                return {
                  select() {
                    return {
                      lean: async () => state.users.map((user) => ({ ...user })),
                    };
                  },
                };
              },
            };
          }

          if (name === 'ViewHistory') {
            return {
              aggregate: async (pipeline) => {
                state.watchStatsPipeline = pipeline;
                return state.watchStats.map((item) => ({ ...item }));
              },
            };
          }

          throw new Error(`Unexpected model request: ${name}`);
        },
      },
      './redis.service': {
        async get(key) {
          state.redisGets.push(key);
          return null;
        },
        async set(key, value, ttl) {
          state.redisSets.push({ key, value, ttl });
          return true;
        },
        async delByPattern(pattern) {
          state.redisPatterns.push(pattern);
          return 2;
        },
      },
      './watchStreak.service': {
        getCurrentStreakValue(user) {
          state.streakCalls.push(user._id);
          if (user._id === 'user-stale') return 0;
          if (user._id === 'user-active') return 4;
          return 0;
        },
      },
      './premium.service': {
        normalizePremiumSnapshot(user) {
          const isPremium = user.role === 'premium';
          return {
            role: isPremium ? 'premium' : 'user',
            isPremium,
            premiumPlan: isPremium ? user.premiumPlan : null,
            premiumExpiresAt: isPremium ? user.premiumExpiresAt : null,
          };
        },
      },
      '../utils/avatarUtils': {
        normalizeAvatarForOutput(avatar, username) {
          return avatar || `avatar:${username}`;
        },
      },
    });

    const rows = await leaderboardService.getTopUsersLeaderboard();

    assert.deepStrictEqual(state.userQuery, {
      role: { $in: ['user', 'premium'] },
    });
    assert.deepStrictEqual(state.streakCalls, ['user-stale', 'user-active']);
    assert.equal(rows[0].id, 'user-active');
    assert.equal(rows[0].currentStreak, 4);
    assert.equal(rows[0].maxStreak, 6);
    assert.equal(rows[0].score, expectedLeaderboardScore({
      totalWatchTime: 1800,
      currentStreak: 4,
      maxStreak: 6,
    }));
    assert.equal(rows[0].avatar, 'avatar:active');
    assert.equal(rows[0].role, 'premium');
    assert.equal(rows[0].isPremium, true);
    assert.equal(rows[0].premiumPlan, 'monthly');
    assert.equal(rows[1].id, 'user-stale');
    assert.equal(rows[1].currentStreak, 0);
    assert.equal(rows[1].maxStreak, 9);
    assert.equal(rows[1].score, expectedLeaderboardScore({
      totalWatchTime: 120000,
      currentStreak: 0,
      maxStreak: 9,
    }));
    assert.ok(rows[1].score > rows[0].score);
    assert.equal(rows[1].isPremium, false);
    assert.equal(state.redisGets.length, 1);
    assert.match(state.redisGets[0], /^leaderboard:topUsers:v6:\d{4}-\d{2}-\d{2}$/);
    assert.equal(state.redisSets.length, 1);
    assert.equal(state.redisSets[0].ttl, 3600);

    const invalidated = await leaderboardService.invalidateLeaderboardCache();
    assert.equal(invalidated, true);
    assert.deepStrictEqual(state.redisPatterns, ['leaderboard:topUsers*']);
  });
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
