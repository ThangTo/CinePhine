const assert = require('assert');
const SettingsModel = require('../models/Settings');

// Stub the settings store in memory so no DB is needed.
let stored = null;
SettingsModel.findOne = async () => (stored ? { value: stored } : null);
SettingsModel.findOneAndUpdate = async (query, update) => {
  stored = update.value;
  return update;
};

const adminService = require('../services/admin.service');

async function main() {
  // Edit keeps the existing sortOrder when none is sent.
  let plans = await adminService.upsertPremiumPlan({
    id: 'plan_monthly', planKey: 'monthly', label: 'Tháng', days: 30, coins: 120,
  });
  const monthly = plans.find((p) => p.id === 'plan_monthly');
  assert.strictEqual(monthly.coins, 120);
  assert.strictEqual(monthly.sortOrder, 2);

  // Defaults are not mutated by the edit.
  stored = null;
  plans = await adminService.getPremiumPlans();
  assert.strictEqual(plans.find((p) => p.id === 'plan_monthly').coins, 100);

  // Duplicate planKey under another id is rejected.
  await assert.rejects(
    adminService.upsertPremiumPlan({ planKey: 'weekly', label: 'Tuần 2', days: 7, coins: 10 }),
    /đã tồn tại/,
  );

  console.log('PASS premium plan upsert');
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
