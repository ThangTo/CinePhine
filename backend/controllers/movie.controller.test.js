// Keep the test off real Redis: dotenv does not override it, so require-time queues stay disabled
process.env.REDIS_URL = '';

const test = require('node:test');
const assert = require('node:assert/strict');

const movieService = require('../services/movie.service');
const { getTrending, getTopRated, getNewReleases } = require('./movie.controller');

const fakeRes = () => ({
  status() {
    return this;
  },
  json() {
    return this;
  },
});

// Calls the handler with the given query and returns the args the service received
const callWith = async (t, handler, serviceFn, query) => {
  const original = movieService[serviceFn];
  let args;
  movieService[serviceFn] = async (...a) => {
    args = a;
    return { data: [] };
  };
  t.after(() => {
    movieService[serviceFn] = original;
  });
  await handler({ query }, fakeRes());
  return args;
};

test('ranked lists clamp limit to 1..50 and default to 10', async (t) => {
  const cases = [
    [{}, 10],
    [{ limit: '20' }, 20],
    [{ limit: '0' }, 10],
    [{ limit: 'abc' }, 10],
    [{ limit: '-5' }, 1],
    [{ limit: '7.9' }, 7],
    [{ limit: '1e9' }, 50],
    [{ limit: ['5', '6'] }, 10],
  ];
  for (const [query, expected] of cases) {
    const [limit] = await callWith(t, getTopRated, 'getTopRated', query);
    assert.equal(limit, expected, JSON.stringify(query));
  }
});

test('ranked lists only pass whitelisted types', async (t) => {
  assert.deepEqual((await callWith(t, getNewReleases, 'getNewReleases', { type: 'series' }))[1], { type: 'series' });
  assert.deepEqual((await callWith(t, getNewReleases, 'getNewReleases', { type: 'hoathinh' }))[1], { type: undefined });
  assert.deepEqual((await callWith(t, getTopRated, 'getTopRated', { type: ['single'] }))[1], { type: undefined });
});

test('trending pins featured movies only for featured=true', async (t) => {
  const [, banner] = await callWith(t, getTrending, 'getTrending', { limit: '6', featured: 'true' });
  assert.deepEqual(banner, { type: undefined, featured: true });
  const [, plain] = await callWith(t, getTrending, 'getTrending', { featured: '1', type: 'single' });
  assert.deepEqual(plain, { type: 'single', featured: false });
});
