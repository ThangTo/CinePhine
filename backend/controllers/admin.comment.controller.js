const Comment = require('../models/comment.model');
const commentQuestService = require('../services/commentQuest.service');

/**
 * GET /admin/comments
 * Get all comments with pagination and filters
 */
const getAll = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, search } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const query = {};
    if (status && status !== 'all') {
      query.status = status;
    }
    
    if (search) {
      query.content = { $regex: search, $options: 'i' };
    }

    const skip = (pageNum - 1) * limitNum;

    const [comments, total] = await Promise.all([
      Comment.find(query)
        .select('content flag flagReason status createdAt userId movieId episodeId') // Only fetch needed fields
        .populate('userId', 'username role') // Skip avatar, email
        .populate('movieId', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Comment.countDocuments(query)
    ]);

    // Map to frontend expected format
    const formattedComments = comments.map(c => ({
      id: c._id,
      content: c.content,
      fullContent: c.content,
      flag: c.flag,
      reason: c.flagReason,
      status: c.status || 'allowed',
      createdAt: c.createdAt, 
      user: {
        name: c.userId?.username || 'Unknown',
        role: c.userId?.role || 'User',
        // avatar skipped as requested
      },
      movieName: c.movieId?.name,
      episodeId: c.episodeId ?? null
    }));

    res.json({
      data: formattedComments,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalItems: total,
        totalPages: Math.ceil(total / limitNum)
      }
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * DELETE /admin/comments/:id
 * Delete a comment
 */
const deleteComment = async (req, res) => {
  try {
    const { id } = req.params;
    await Comment.findByIdAndDelete(id);
    res.json({ success: true, message: 'Comment deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * PATCH /admin/comments/:id/status
 * Update comment status
 */
const updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['pending', 'allowed', 'banned', 'dismissed'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const updateData = { status };

    // If allowing the comment, clear flags as they are resolved
    if (status === 'allowed') {
        updateData.flag = null;
        updateData.flagReason = null;
    }

    const comment = await Comment.findByIdAndUpdate(
      id, 
      updateData, 
      { new: true }
    );

    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    if (status === 'allowed') {
      try {
        await commentQuestService.grantCommentQuestProgress(comment._id);
      } catch (error) {
        console.error('[admin comment] Failed to grant quest progress:', error.message);
      }
    }

    res.json(comment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getAll,
  deleteComment,
  updateStatus
};
