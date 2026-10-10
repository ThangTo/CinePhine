const mongoose = require('mongoose');
// 1. Import thư viện này (QUAN TRỌNG)
const passportLocalMongoose = require('passport-local-mongoose');
const { normalizeAvatarForOutput } = require('../utils/avatarUtils');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    // Lưu ý: Khi dùng passport-local-mongoose, nó sẽ tự động quản lý password (hash/salt)
    // nên ta có thể không cần khai báo trường password ở đây, hoặc giữ lại cũng không sao.
    password: {
      type: String,
    },
    avatar: {
      type: String,
      default: '',
    },
    avatarStorageKey: {
      type: String,
      default: null,
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'other'],
      default: 'other',
    },
    role: {
      type: String,
      enum: ['user', 'premium', 'admin'],
      default: 'user',
    },
    premiumPlan: {
      type: String,
      enum: ['weekly', 'monthly', 'yearly'],
      default: null,
    },
    premiumExpiresAt: {
      type: Date,
      default: null,
    },
    coin: {
      type: Number,
      default: 0,
      min: 0,
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },
    // Watch Streak
    watchStreak: {
      type: Number,
      default: 0,
      min: 0,
    },
    longestStreak: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastQualifiedWatchDate: {
      type: Date,
      default: null,
    },
    lastWatchDate: {
      type: Date,
      default: null,
    },
    // Accumulated seconds watched today (persisted for accurate todayProgress in getStreak)
    todayWatchSeconds: {
      type: Number,
      default: 0,
      min: 0,
    },
    todayWatchDate: {
      type: Date,
      default: null,
    },
    // Cursor effect
    cursorEffectId: {
      type: String,
      default: 'none',
    },
    ownedCursorEffects: {
      type: [String],
      default: ['none'],
    },
    // Halloween fortune candy: last draw, one per Vietnam day
    halloweenFortune: {
      dateKey: String,
      tier: String,
      coins: Number,
      charmed: Boolean,
      pick: Number,
    },
  },
  {
    timestamps: true,
  },
);

const transformAvatarForOutput = (_doc, ret) => {
  ret.avatar = normalizeAvatarForOutput(
    ret.avatar,
    ret.username || ret.email || ret._id?.toString(),
  );
  delete ret.avatarStorageKey;
  return ret;
};

userSchema.set('toJSON', {
  transform: transformAvatarForOutput,
});

userSchema.set('toObject', {
  transform: transformAvatarForOutput,
});

userSchema.index({ role: 1, premiumExpiresAt: 1 });


// 2. Kích hoạt Plugin (QUAN TRỌNG)
// Dòng này sẽ tự động thêm các hàm: authenticate(), serializeUser(), ... vào User model
// usernameField: "email" nghĩa là ta dùng email để đăng nhập thay vì username
userSchema.plugin(passportLocalMongoose, { usernameField: 'email' });

module.exports = mongoose.model('User', userSchema);
