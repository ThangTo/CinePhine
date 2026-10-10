const express = require('express');
const router = express.Router();
const cursorEffectService = require('../services/cursorEffect.service');
const halloweenFortuneService = require('../services/halloweenFortune.service');
const authMiddleware = require('../middleware/auth.middleware');

const getUserId = (req) => {
  if (req.user && req.user._id) return req.user._id;
  throw new Error('User ID required');
};

// GET /api/v1/cursor-effects — Danh sách hiệu ứng kèm trạng thái (cần auth)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = getUserId(req);
    const effects = await cursorEffectService.getEffectsWithOwnership(userId);
    res.status(200).json({ data: effects });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
});

// POST /api/v1/cursor-effects/purchase — Mua hiệu ứng bằng coin
router.post('/purchase', authMiddleware, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { effectId } = req.body;
    if (!effectId) return res.status(400).json({ message: 'effectId là bắt buộc' });

    const result = await cursorEffectService.purchaseEffect(userId, effectId);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
});

// POST /api/v1/cursor-effects/equip — Trang bị hiệu ứng
router.post('/equip', authMiddleware, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { effectId } = req.body;
    if (!effectId) return res.status(400).json({ message: 'effectId là bắt buộc' });

    const result = await cursorEffectService.equipEffect(userId, effectId);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
});

// POST /api/v1/cursor-effects/halloween-hunt/claim — Nhận hiệu ứng khi tìm đủ bí ngô ẩn
router.post('/halloween-hunt/claim', authMiddleware, async (req, res) => {
  try {
    const userId = getUserId(req);
    const result = await cursorEffectService.claimHalloweenHunt(userId, req.body?.spots);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
});

// POST /api/v1/cursor-effects/halloween-fortune — Bốc Kẹo Tiên Tri (1 lần/ngày, có thưởng xu)
// ponytail: lives with the Halloween hunt route, move to its own router if more event endpoints appear.
router.post('/halloween-fortune', authMiddleware, async (req, res) => {
  try {
    const userId = getUserId(req);
    const result = await halloweenFortuneService.drawHalloweenFortune(userId);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
});

module.exports = router;
