const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const authMiddleware = require('../middleware/auth.middleware');
const watchStreakController = require('../controllers/watchStreak.controller');
const avatarUploadMiddleware = require('../middleware/avatarUpload.middleware');

// GET /api/v1/users/:id - Get user profile
router.get('/', authMiddleware, userController.getProfile);

// PUT /api/v1/users/:id - Update user profile
router.put('/', authMiddleware, avatarUploadMiddleware, userController.updateProfile);

// POST /api/v1/users/favorites - Add to favorites
router.post('/favorites', authMiddleware, userController.addToFavorites);

// DELETE /api/v1/users/favorites/:movieId - Remove from favorites
router.delete('/favorites/:movieId', authMiddleware, userController.removeFromFavorites);

// GET /api/v1/users/favorites - Get favorites list
router.get('/favorites', authMiddleware, userController.getFavorites);

// POST /api/v1/users/watchlist - Add to watchlist
router.post('/watchlist', authMiddleware, userController.addToWatchlist);

// DELETE /api/v1/users/watchlist/:movieId - Remove from watchlist
router.delete('/watchlist/:movieId', authMiddleware, userController.removeFromWatchlist);

// GET /api/v1/users/watchlist - Get watchlist
router.get('/watchlist', authMiddleware, userController.getWatchlist);

// POST /api/v1/users/disliked - Hide a movie from recommendations ("not for me")
router.post('/disliked', authMiddleware, userController.dislikeMovie);

// GET /api/v1/users/history - Get watch history
router.get('/history', authMiddleware, userController.getHistory);

// GET /api/v1/users/coin-history - Get coin ledger history
router.get('/coin-history', authMiddleware, userController.getCoinHistory);

// GET /api/v1/users/continue-watching - Get continue watching list
router.get('/continue-watching', authMiddleware, userController.getContinueWatching);

// GET /api/v1/users/progress/:movieId - Get watch progress for a specific movie
router.get('/progress/:movieId', authMiddleware, userController.getProgress);

// POST /api/v1/users/progress - Save/Update watch progress
router.post('/progress', authMiddleware, userController.saveProgress);

// DELETE /api/v1/users/progress/:movieId - Delete watch progress
router.delete('/progress/:movieId', authMiddleware, userController.deleteProgress);

// POST /api/v1/users/upgrade-premium - Upgrade to premium using coins
router.post('/upgrade-premium', authMiddleware, userController.upgradePremium);

// GET /api/v1/users/streak - Get watch streak
router.get('/streak', authMiddleware, watchStreakController.getStreak);

// POST /api/v1/users/streak - Record watch session
router.post('/streak', authMiddleware, watchStreakController.recordStreak);

module.exports = router;
