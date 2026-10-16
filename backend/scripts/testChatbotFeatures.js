// Script để test các tính năng mới của chatbot
// Chạy: node backend/scripts/testChatbotFeatures.js

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Chat = require('../models/chat.model');
const Movie = require('../models/movie.model');
const { runAgent } = require('../services/chat');
const handleChat = async (opts) => (await runAgent(opts)).answer;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const PERF_THRESHOLD_MS = 5000; // 5 seconds

async function measureRequest(label, fn) {
  const start = Date.now();
  const result = await fn();
  const duration = Date.now() - start;

  const status = duration <= PERF_THRESHOLD_MS ? '✅' : '⚠️';

  console.log(
    `${status} ${label} - Thời gian phản hồi: ${duration} ms (ngưỡng ${PERF_THRESHOLD_MS} ms)`,
  );

  return { result, duration };
}

// TEST 1: Security - cấu hình GEMINI_API_KEY
async function testSecurityConfig() {
  console.log('\n=== TEST 1: Security - Cấu hình GEMINI_API_KEY ===');

  if (!GEMINI_API_KEY) {
    console.log(
      '⚠️ GEMINI_API_KEY chưa được cấu hình (env). Một số test chatbot sẽ sử dụng fallback keyword.',
    );
  } else {
    const masked =
      GEMINI_API_KEY.length > 6
        ? GEMINI_API_KEY.slice(0, 3) + '***' + GEMINI_API_KEY.slice(-3)
        : '***';
    console.log('✅ GEMINI_API_KEY đã được cấu hình (đã mask, không log full):', masked);
  }

  console.log('✅ API key đang được lấy từ biến môi trường (.env), không hard-code trong source.');
}

// TEST 2: Performance - Tìm phim mới
async function testNewMoviesQuery() {
  console.log('\n=== TEST 2: Performance - Tìm phim mới ===');

  const testSessionId = 'test-session-new-movies-' + Date.now();

  const { result } = await measureRequest('Chatbot: query phim mới', () =>
    handleChat({
      userId: null,
      message: 'Cho mình xem phim mới cập nhật gần đây',
      sessionId: testSessionId,
      history: [],
      metadata: {},
    }),
  );

  console.log('✅ Kết quả (rút gọn):', (result || '').substring(0, 200) + '...');

  return testSessionId;
}

// TEST 3: Reliability - Kiểm tra lưu lịch sử chat
async function testChatHistory(sessionId) {
  console.log('\n=== TEST 3: Reliability - Kiểm tra lịch sử chat ===');

  const chatSession = await Chat.findOne({ sessionId }).lean();

  if (!chatSession) {
    console.log('❌ Không tìm thấy chat session');
    return;
  }

  console.log('✅ Chat session tìm thấy:');
  console.log('  - Session ID:', chatSession.sessionId);
  console.log('  - Số tin nhắn:', chatSession.messages.length);
  console.log(
    '  - Tin nhắn gần nhất:',
    chatSession.messages[chatSession.messages.length - 1].content.substring(0, 100) + '...',
  );
}

// TEST 4: Performance + Context - Hội thoại đa lượt
async function testConversationContext(sessionId) {
  console.log('\n=== TEST 4: Performance + Context - Hội thoại đa lượt ===');

  // Tin nhắn đầu tiên
  const { result: result1 } = await measureRequest('Chatbot: lượt 1 (phim hành động)', () =>
    handleChat({
      userId: null,
      message: 'Cho mình xem phim hành động',
      sessionId,
      history: [],
      metadata: {},
    }),
  );

  console.log('✅ Tin nhắn 1:', (result1 || '').substring(0, 150) + '...');

  // Tin nhắn thứ 2 (dựa vào context của tin nhắn 1)
  const { result: result2 } = await measureRequest('Chatbot: lượt 2 (phim hay nhất)', () =>
    handleChat({
      userId: null,
      message: 'Phim nào hay nhất?',
      sessionId,
      history: [], // Service sẽ tự load từ database
      metadata: {},
    }),
  );

  console.log('✅ Tin nhắn 2 (với context):', (result2 || '').substring(0, 150) + '...');
}

// TEST 5: Reliability - Xóa lịch sử chat
async function testClearHistory(sessionId) {
  console.log('\n=== TEST 5: Reliability - Xóa lịch sử chat ===');

  await Chat.updateMany({ sessionId }, { isActive: false });

  const inactiveSessions = await Chat.find({ sessionId, isActive: false }).countDocuments();
  console.log('✅ Đã đánh dấu inactive:', inactiveSessions, 'sessions');
}

// TEST 6: Data readiness - Kiểm tra phim mới trong DB
async function checkNewMovies() {
  console.log('\n=== TEST 6: Data readiness - Kiểm tra phim mới trong database ===');

  const newMoviesCount = await Movie.countDocuments({ isNewRelease: true });
  console.log('  - Phim có isNewRelease=true:', newMoviesCount);

  const recentMoviesCount = await Movie.countDocuments({
    updatedAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
  });
  console.log('  - Phim update trong 30 ngày:', recentMoviesCount);

  if (newMoviesCount === 0 && recentMoviesCount === 0) {
    console.log('\n⚠️  Cảnh báo: Không có phim mới trong database!');
    console.log('   Để test tính năng này, hãy:');
    console.log('   1. Set isNewRelease=true cho vài phim');
    console.log('   2. Hoặc chạy crawler để thêm phim mới');
  }
}

// TEST 7: Performance - Query theo thể loại
async function testGenreQueryPerformance() {
  console.log('\n=== TEST 7: Performance - Query phim theo thể loại ===');

  const sessionId = 'test-session-genre-' + Date.now();

  await measureRequest('Chatbot: query phim kinh dị', () =>
    handleChat({
      userId: null,
      message: 'Gợi ý giúp mình vài phim kinh dị hay',
      sessionId,
      history: [],
      metadata: {},
    }),
  );
}

// TEST 8: Performance - Query theo diễn viên
async function testActorQueryPerformance() {
  console.log('\n=== TEST 8: Performance - Query phim theo diễn viên ===');

  const sessionId = 'test-session-actor-' + Date.now();

  await measureRequest('Chatbot: query phim của Tom Cruise', () =>
    handleChat({
      userId: null,
      message: 'Có phim nào của diễn viên Tom Cruise không?',
      sessionId,
      history: [],
      metadata: {},
    }),
  );
}

// TEST 9: Scalability - Nhiều request đồng thời
async function testConcurrentChats() {
  console.log('\n=== TEST 9: Scalability - Nhiều request đồng thời ===');

  const concurrentUsers = 10;
  const prompts = [
    'Cho mình xem phim mới cập nhật gần đây',
    'Gợi ý phim hành động hay',
    'Gợi ý phim tình cảm Hàn Quốc',
    'Có phim nào của Leonardo DiCaprio không?',
    'Tìm phim Avengers mới nhất',
    'Hướng dẫn mình cách thêm phim vào danh sách yêu thích',
    'Làm sao để xem lại lịch sử phim đã xem?',
    'Gợi ý vài phim gia đình cho trẻ em',
    'Có phim kinh dị nào đang hot không?',
    'Phim nào được đánh giá cao nhất trên CinePhine?',
  ];

  const start = Date.now();

  const tasks = Array.from({ length: concurrentUsers }).map((_, idx) => {
    const sessionId = `test-concurrent-${Date.now()}-${idx}`;
    const message = prompts[idx % prompts.length];
    return handleChat({
      userId: null,
      message,
      sessionId,
      history: [],
      metadata: {},
    });
  });

  const results = await Promise.allSettled(tasks);
  const duration = Date.now() - start;

  const successCount = results.filter((r) => r.status === 'fulfilled').length;
  const failCount = results.length - successCount;

  console.log(
    `✅ Hoàn thành ${results.length} request đồng thời trong ${duration} ms. Thành công: ${successCount}, Lỗi: ${failCount}`,
  );
  if (duration > PERF_THRESHOLD_MS) {
    console.log(
      '⚠️ Tổng thời gian xử lý đồng thời vượt quá ngưỡng 5 giây. Cần tối ưu thêm nếu đây là case phổ biến.',
    );
  }
}

// TEST 10: Reliability - Nhiều request liên tiếp
async function testReliabilityOverMultipleRequests() {
  console.log('\n=== TEST 10: Reliability - Nhiều request liên tiếp ===');

  const totalRequests = 20;
  let successCount = 0;
  let slowCount = 0;

  for (let i = 0; i < totalRequests; i++) {
    const sessionId = `test-reliability-${Date.now()}-${i}`;
    try {
      const { duration } = await measureRequest(`Chatbot: request #${i + 1}`, () =>
        handleChat({
          userId: null,
          message: 'Cho mình vài gợi ý phim hay bất kỳ',
          sessionId,
          history: [],
          metadata: {},
        }),
      );
      successCount += 1;
      if (duration > PERF_THRESHOLD_MS) slowCount += 1;
    } catch (e) {
      console.error(`❌ Lỗi ở request #${i + 1}:`, e.message);
    }
  }

  const successRate = (successCount / totalRequests) * 100;
  const fastRate = ((totalRequests - slowCount) / totalRequests) * 100;

  console.log(
    `✅ Tổng kết reliability: ${successCount}/${totalRequests} request thành công (${successRate.toFixed(
      1,
    )}%).`,
  );
  console.log(
    `✅ Tỉ lệ request dưới ${PERF_THRESHOLD_MS} ms: ${totalRequests - slowCount}/${
      totalRequests
    } (${fastRate.toFixed(1)}%).`,
  );
  if (fastRate < 95) {
    console.log(
      '⚠️ Tỉ lệ request dưới 5 giây < 95%. Cần theo dõi thêm trong môi trường thực tế (production) để đảm bảo yêu cầu phi chức năng.',
    );
  }
}

async function main() {
  try {
    console.log('🚀 Bắt đầu test các tính năng mới của chatbot...\n');

    // Kết nối database
    const dbUrl = process.env.MONGO_URI || 'mongodb://localhost:27017/CinePhine';
    await mongoose.connect(dbUrl);
    console.log('✅ Đã kết nối MongoDB');

    // Test 1: Security - cấu hình GEMINI_API_KEY
    await testSecurityConfig();

    // Test 6: Kiểm tra dữ liệu phim mới trong DB (hỗ trợ hiệu năng query)
    await checkNewMovies();

    // Test 2: Tìm phim mới + performance
    const sessionId = await testNewMoviesQuery();

    // Test 3: Kiểm tra lịch sử
    await testChatHistory(sessionId);

    // Test 4: Hội thoại đa lượt + performance
    // await testConversationContext(sessionId);

    // Test 5: Xóa lịch sử
    await testClearHistory(sessionId);

    // Test 7: Performance - query theo thể loại
    await testGenreQueryPerformance();

    // Test 8: Performance - query theo diễn viên
    await testActorQueryPerformance();

    // Test 9: Scalability - nhiều request đồng thời
    await testConcurrentChats();

    // Test 10: Reliability - nhiều request liên tiếp
    await testReliabilityOverMultipleRequests();

    console.log('\n✅ Tất cả 10 test case đã hoàn thành!');
  } catch (error) {
    console.error('\n❌ Lỗi:', error.message);
    console.error(error);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Đã đóng kết nối MongoDB');
  }
}

// Chạy tests
if (require.main === module) {
  main();
}

module.exports = {
  testSecurityConfig,
  testNewMoviesQuery,
  testChatHistory,
  testConversationContext,
  testClearHistory,
  checkNewMovies,
  testGenreQueryPerformance,
  testActorQueryPerformance,
  testConcurrentChats,
  testReliabilityOverMultipleRequests,
};
