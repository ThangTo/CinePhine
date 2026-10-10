const test = require('node:test');
const assert = require('node:assert/strict');
const { FORTUNE_TIERS, pickFortuneTier } = require('./halloweenFortune.service');

test('tier chances add up to 100 and expected value stays near 20 coins', () => {
  assert.equal(FORTUNE_TIERS.reduce((sum, item) => sum + item.chance, 0), 100);
  const expected = FORTUNE_TIERS.reduce((sum, item) => sum + (item.chance * item.coins) / 100, 0);
  assert.ok(expected >= 15 && expected <= 25, `expected value ${expected}`);
  assert.ok(FORTUNE_TIERS.every((item) => item.coins >= 1), 'every tier pays at least 1 coin');
});

test('random number maps onto tier bands', () => {
  assert.equal(pickFortuneTier(0).tier, 'dai-cat');
  assert.equal(pickFortuneTier(0.049).tier, 'dai-cat');
  assert.equal(pickFortuneTier(0.05).tier, 'cat');
  assert.equal(pickFortuneTier(0.3).tier, 'binh');
  assert.equal(pickFortuneTier(0.8).tier, 'hung');
  assert.equal(pickFortuneTier(0.9999).tier, 'hung');
});

test('charm after a Hung day never lands on Binh or Hung', () => {
  for (let random = 0; random < 1; random += 0.01) {
    assert.ok(['dai-cat', 'cat'].includes(pickFortuneTier(random, true).tier));
  }
});
