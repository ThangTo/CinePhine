const { PayOS } = require('@payos/node');
const User = require('../models/user.model');
const Transaction = require('../models/transaction.model');
const adminService = require('./admin.service');
const coinLedgerService = require('./coinLedger.service');

const payOS = new PayOS({
  clientId: process.env.PAYOS_CLIENT_ID,
  apiKey: process.env.PAYOS_API_KEY,
  checksumKey: process.env.PAYOS_CHECKSUM_KEY,
});

const parsePositiveInteger = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const parseNonNegativeInteger = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
};

const normalizeCoinPackage = (pkg) => ({
  packageId: pkg.id || null,
  amount: parsePositiveInteger(pkg.price),
  coinAmount: parsePositiveInteger(pkg.amount),
  bonusCoin: parseNonNegativeInteger(pkg.bonus),
  label: pkg.label || 'Coin package',
});

const findPackageByPrice = (packages, money, bonusCoin = 0) => {
  const samePricePackages = packages.filter(
    (pkg) => parsePositiveInteger(pkg.price) === money,
  );

  if (samePricePackages.length === 1) {
    return samePricePackages[0];
  }

  return samePricePackages.find(
    (pkg) => parseNonNegativeInteger(pkg.bonus) === bonusCoin,
  );
};

const resolveCoinPackageSelection = async ({ packageId }) => {
  const packages = await adminService.getCoinPackages();

  const selectedPackage = packages.find((pkg) => pkg.id === packageId);
  if (!selectedPackage) {
    throw new Error('Coin package not found');
  }

  return normalizeCoinPackage(selectedPackage);
};

const resolveTransactionAward = async (transaction) => {
  const packages = await adminService.getCoinPackages();

  if (transaction.packageId) {
    const packageById = packages.find((pkg) => pkg.id === transaction.packageId);
    if (packageById) {
      return normalizeCoinPackage(packageById);
    }
  }

  const matchedPackage = findPackageByPrice(
    packages,
    parsePositiveInteger(transaction.amount),
    parseNonNegativeInteger(transaction.bonusCoin),
  );

  if (matchedPackage) {
    return normalizeCoinPackage(matchedPackage);
  }

  throw new Error('Unable to resolve coin package for transaction');
};

const createPaymentLink = async ({ userId, packageId }) => {
  const YOUR_DOMAIN =
    process.env.CLIENT_URL_LOCAL ||
    process.env.CLIENT_URL ||
    'https://decent-normally-bedbug.ngrok-free.app';

  if (!userId || !packageId) {
    throw new Error('Missing userId or payment package');
  }

  const paymentEnabled = await adminService.getSetting('payment_enabled');
  if (paymentEnabled === false) {
    const error = new Error('Chức năng nạp tiền đang tạm khóa. Vui lòng quay lại sau.');
    error.statusCode = 403;
    throw error;
  }

  const selectedPackage = await resolveCoinPackageSelection({ packageId });

  // PayOS only accepts a numeric orderCode.
  const timestamp = Date.now().toString();
  const randomSuffix = Math.floor(Math.random() * 100)
    .toString()
    .padStart(2, '0');
  const orderCode = Number(timestamp + randomSuffix);

  const body = {
    orderCode,
    amount: selectedPackage.amount,
    description: 'Thanh toan don hang',
    returnUrl: `${YOUR_DOMAIN}/account?tabs=coin-history&success=true`,
    cancelUrl: `${YOUR_DOMAIN}/account?tabs=coin-history&canceled=true`,
  };

  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  await Transaction.create({
    user: userId,
    orderCode: orderCode.toString(),
    amount: selectedPackage.amount,
    coinAmount: selectedPackage.coinAmount,
    bonusCoin: selectedPackage.bonusCoin,
    packageId: selectedPackage.packageId,
    provider: 'PAYOS',
    status: 'PENDING',
  });

  const paymentLinkResponse = await payOS.paymentRequests.create(body);

  return {
    checkoutUrl: paymentLinkResponse.checkoutUrl,
  };
};

const handleWebhook = async (webhook) => {
  const verifiedData = await payOS.webhooks.verify(webhook);
  const orderCode = verifiedData.orderCode?.toString();

  if (!orderCode) {
    throw new Error('Missing PayOS orderCode');
  }

  if (webhook.code !== '00' || webhook.success !== true) {
    await Transaction.findOneAndUpdate(
      { orderCode, status: 'PENDING' },
      { $set: { status: 'FAILED', webhookData: webhook } },
    );
    return { success: true, message: 'Webhook ignored because payment was not successful' };
  }

  const transaction = await Transaction.findOneAndUpdate(
    { orderCode, status: 'PENDING' },
    { $set: { status: 'PROCESSING', webhookData: webhook } },
    { new: true },
  );

  if (!transaction) {
    console.warn(`[Webhook] Order ${orderCode} already processed or not found.`);
    return { success: true, message: 'Webhook already processed' };
  }

  try {
    console.log(`[Webhook] Processing success payment for Order ${orderCode}`);

    const resolvedAward = await resolveTransactionAward(transaction);
    if (!resolvedAward.amount || !resolvedAward.coinAmount) {
      throw new Error(`Invalid coin package resolution for order ${orderCode}`);
    }

    const totalCoins =
      parseNonNegativeInteger(resolvedAward.coinAmount) +
      parseNonNegativeInteger(resolvedAward.bonusCoin);

    await coinLedgerService.applyCoinChange({
      userId: transaction.user,
      delta: totalCoins,
      reason: 'payment_success',
      sourceType: 'payment',
      sourceId: transaction._id,
      note: `Nạp coin thành công từ đơn hàng ${transaction.orderCode}`,
      metadata: {
        orderCode: transaction.orderCode,
        packageId: resolvedAward.packageId || transaction.packageId || null,
        coinAmount: parseNonNegativeInteger(resolvedAward.coinAmount),
        bonusCoin: parseNonNegativeInteger(resolvedAward.bonusCoin),
        provider: transaction.provider,
      },
    });

    transaction.coinAmount = parseNonNegativeInteger(resolvedAward.coinAmount);
    transaction.bonusCoin = parseNonNegativeInteger(resolvedAward.bonusCoin);
    transaction.packageId = resolvedAward.packageId || transaction.packageId || null;
    transaction.status = 'SUCCESS';
    transaction.webhookData = webhook;
    await transaction.save();
  } catch (error) {
    transaction.status = 'FAILED';
    transaction.webhookData = webhook;
    await transaction.save();
    throw error;
  }

  return { success: true, message: 'Webhook processed' };
};

module.exports = {
  createPaymentLink,
  handleWebhook,
};
