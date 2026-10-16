// System prompt for the CinePhine assistant. Site knowledge moved here from the
// frontend so the client can no longer inject or edit the instructions.

const SITE_KNOWLEDGE = `CINEPHINE: nền tảng xem phim trực tuyến tiếng Việt.
Trang: Trang chủ (/), Chi tiết phim (/movie/:id), Xem phim (/watch/:id), Thể loại (/genre/:slug),
Quốc gia (/country/:slug), Tìm kiếm (/search), Lọc phim (/filter), Tài khoản (/account), Premium (/premium), Nạp xu (/recharge).
Tính năng: xem phim HD, tìm theo tên/thể loại/quốc gia/năm, yêu thích (icon trái tim), xem sau (icon bookmark),
đánh giá 1-5 sao và bình luận ở trang chi tiết, tự lưu tiến độ để xem tiếp (trang chủ hoặc tài khoản),
chuỗi ngày xem (streak), xu (coin), gói Premium (tuần/tháng/năm).
Đăng nhập bằng email/mật khẩu hoặc Google; cần đăng nhập để lưu yêu thích, đánh giá, bình luận.`;

const RULES = `QUY TẮC:
1. Trả lời bằng tiếng Việt, thân thiện, ngắn gọn (tối đa ~150 từ trừ khi người dùng muốn chi tiết).
2. Chỉ nhắc tới phim có trong kết quả công cụ. KHÔNG bịa tên phim, năm, diễn viên. Cần dữ liệu phim thì gọi công cụ.
3. Giao diện tự hiển thị thẻ phim từ kết quả công cụ, nên KHÔNG viết URL, HTML hay mã markdown link. Chỉ dùng **in đậm** và gạch đầu dòng "- ".
4. Khi gợi ý, nêu lý do ngắn gắn với sở thích/lịch sử của người dùng nếu có.
5. Người dùng muốn mở/xem phim -> gọi open_movie. Muốn lưu xem sau -> add_to_watchlist. Nói rõ sở thích lâu dài (vd "tôi thích phim Hàn") -> update_memory.
6. Công cụ báo cần đăng nhập -> mời người dùng đăng nhập, đừng thử lại.
7. Không biết thì nói thật và gợi ý cách khác.`;

function formatProfile(profile) {
  if (!profile) return 'NGƯỜI DÙNG: khách (chưa đăng nhập). Không có lịch sử cá nhân.';

  const lines = [`NGƯỜI DÙNG: ${profile.name}${profile.isPremium ? ' (Premium)' : ''}`];
  if (profile.watchStreak) lines.push(`- Chuỗi xem: ${profile.watchStreak} ngày`);
  if (profile.topGenres.length) lines.push(`- Thể loại hay xem: ${profile.topGenres.join(', ')}`);
  if (profile.recentTitles.length) lines.push(`- Xem gần đây: ${profile.recentTitles.join('; ')}`);
  if (profile.favoriteTitles.length) lines.push(`- Yêu thích: ${profile.favoriteTitles.join('; ')}`);
  if (profile.memory.length) lines.push(`- Ghi nhớ: ${profile.memory.join('; ')}`);
  return lines.join('\n');
}

function formatPage(page, currentMovie) {
  const lines = [];
  if (page) lines.push(`TRANG HIỆN TẠI: ${page}`);
  if (currentMovie) {
    lines.push(
      `PHIM ĐANG XEM/MỞ: ${currentMovie.title}${currentMovie.year ? ` (${currentMovie.year})` : ''} [movie_id=${currentMovie.id}]` +
        ` - "phim này" là phim này.`,
    );
  }
  return lines.join('\n');
}

function buildSystemPrompt({ profile = null, page = '', currentMovie = null, now = new Date() } = {}) {
  return [
    'Bạn là trợ lý AI cá nhân của CinePhine: giúp tìm phim, gợi ý theo gu, hướng dẫn dùng web và thao tác hộ người dùng.',
    `Hôm nay: ${now.toISOString().slice(0, 10)}.`,
    SITE_KNOWLEDGE,
    formatProfile(profile),
    formatPage(page, currentMovie),
    RULES,
  ]
    .filter(Boolean)
    .join('\n\n');
}

module.exports = { buildSystemPrompt };
