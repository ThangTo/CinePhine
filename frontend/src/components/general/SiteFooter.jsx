import React from "react";
import logoMainTrans from "assets/images/logo_main_trans.png";

// const menuLinks = ["Hỏi-Đáp", "Chính sách bảo mật", "Điều khoản sử dụng", "Giới thiệu", "Liên hệ"];
// const topicTags = ["Dongphim", "Ghienphim", "Motphim", "Subnhanh"];

const SiteFooter = () => {
  return (
    <footer className="bg-bgColor4 relative isolate overflow-hidden">
      {/* Halloween theme paints its night landscape into this slot */}
      <div className="halloween-nightscape" aria-hidden="true" />
      <div className="w-full px-4 py-10 mx-auto">
        {/* Footer Element - Main Content */}
        <div className="footer-element flex flex-col lg:flex-row items-center justify-center gap-8 mx-auto">
          {/* Footer Side Left - Brand + Social Icons + Links */}
          <div className="footer-sideleft flex justify-center flex-col items-center">
            {/* Brand Section */}
            <div className="flex items-start gap-4 mb-6">
              <div className="flex-shrink-0">
                <img
                  src={logoMainTrans}
                  alt="CinePhine"
                  className="site-header-logo w-16 h-16 object-cover object-center"
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <div>
                <h3 className="text-2xl font-extrabold text-white mb-1">
                  <span className="text-white">Cine</span>
                  <span className="site-brand-accent text-cyan-400">Phine</span>
                </h3>
                <p className="text-sm text-gray-400">Phim hay có rồi</p>
              </div>
            </div>

            {/* Social Icons - Horizontal */}
            <div className="mb-6">
              <div className="flex flex-wrap justify-center gap-3">
                <a
                  href="/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-9 w-9 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-all duration-200"
                  title="Telegram"
                >
                  <i className="fa-brands fa-telegram text-base"></i>
                </a>
                <a
                  href="/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-9 w-9 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-all duration-200"
                  title="Discord"
                >
                  <i className="fa-brands fa-discord text-base"></i>
                </a>
                <a
                  href="/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-9 w-9 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-all duration-200"
                  title="Twitter/X"
                >
                  <i className="fa-brands fa-x-twitter text-base"></i>
                </a>
                <a
                  href="/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-9 w-9 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-all duration-200"
                  title="Facebook"
                >
                  <i className="fa-brands fa-facebook text-base"></i>
                </a>
                <a
                  href="/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-9 w-9 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-all duration-200"
                  title="TikTok"
                >
                  <i className="fa-brands fa-tiktok text-base"></i>
                </a>
                <a
                  href="/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-9 w-9 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-all duration-200"
                  title="YouTube"
                >
                  <i className="fa-brands fa-youtube text-base"></i>
                </a>
                <a
                  href="/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-9 w-9 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-all duration-200"
                  title="Threads"
                >
                  <i className="fa-brands fa-threads text-base"></i>
                </a>
                <a
                  href="/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden sm:flex h-9 w-9 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 items-center justify-center text-gray-400 hover:text-white transition-all duration-200"
                  title="Instagram"
                >
                  <i className="fa-brands fa-instagram text-base"></i>
                </a>
              </div>
            </div>

            {/* Navigation Links */}
            {/* <div className="mb-6">
              <nav className="flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm">
                {menuLinks.map((link) => (
                  <a
                    key={link}
                    href="/"
                    className="text-gray-300 hover:text-white transition-colors duration-200"
                  >
                    {link}
                  </a>
                ))}
              </nav>
            </div> */}

            {/* Topic Tags */}
            {/* <div className="mb-6">
              <div className="flex flex-wrap gap-3">
                {topicTags.map((tag) => (
                  <a
                    key={tag}
                    href="/"
                    className="text-xs text-gray-400 hover:text-gray-300 transition-colors duration-200"
                  >
                    {tag}
                  </a>
                ))}
              </div>
            </div> */}

            {/* Description */}
            <div className="mb-2">
              <p className="text-sm font-normal text-[#AAAAAA] line-height-[1.6] text-center max-w-3xl mx-auto">
                CinePhine - Phim hay có rồi - Trang xem phim online chất lượng cao miễn phí Vietsub,
                thuyết minh, lồng tiếng full HD. Kho phim mới khổng lồ, phim chiếu rạp, phim bộ,
                phim lẻ từ nhiều quốc gia như Việt Nam, Hàn Quốc, Trung Quốc, Thái Lan, Nhật Bản, Âu
                Mỹ… đa dạng thể loại. Khám phá nền tảng phim trực tuyến hay nhất 2025 chất lượng 4K!
              </p>
            </div>

            {/* Copyright */}
            <div className="text-xs text-gray-600">© 2025 CinePhine</div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default SiteFooter;
