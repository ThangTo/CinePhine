const mongoose = require("mongoose");

const ratingSchema = new mongoose.Schema({
  // Tham chiếu đến Movie (ObjId)
  movieId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Movie', 
    required: true
  },
  // Tham chiếu đến User (ObjId)
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  // Rating từ 1-10 (theo schema movies)
  rating: { 
    type: Number, 
    required: true, 
    min: 1, 
    max: 10 
  }, 
}, { 
  timestamps: true // Tự động thêm createdAt và updatedAt
});

// Index: Đảm bảo 1 user chỉ đánh giá 1 phim 1 lần (Unique Compound Index) 
ratingSchema.index({ movieId: 1, userId: 1 }, { unique: true });

// Thêm index riêng cho movieId để tìm kiếm/tính toán nhanh hơn
ratingSchema.index({ movieId: 1 });

// Per-user lookups (getForYou taste profile)
ratingSchema.index({ userId: 1, updatedAt: -1 });

module.exports = mongoose.model("Rating", ratingSchema);
