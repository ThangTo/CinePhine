import React from "react";
import { Link } from "react-router-dom";
import { useTheme } from "contexts/ThemeContext";
import { PageSpinner, InlineSpinner } from "components/common/LoadingState";

const COPY = {
  christmas: { background: "bg-[#111b19]", title: "Một chút mùa đông", link: "Về trang chủ xem quà Giáng Sinh" },
  halloween: { background: "bg-[#0e0a12]", title: "Đêm Halloween dễ thương", link: "Về trang chủ đi dạo cùng bé ma" },
};

export default function ThemePreview() {
  const { currentTheme, serverTheme, toggleTheme, isThemeEnabled } = useTheme();
  const copy = COPY[serverTheme] || COPY.christmas;
  return (
    <div className={`min-h-dvh ${copy.background} text-white px-6 pt-48 pb-40 md:py-24`}>
      <div className="max-w-3xl mx-auto">
        <div className="flex flex-wrap justify-between items-center gap-4 mb-8">
          <h1 className="text-2xl font-semibold">{copy.title}</h1>
          <button onClick={toggleTheme} className="text-primaryColor underline underline-offset-4">{isThemeEnabled ? "Tắt theme để so sánh" : "Bật theme"}</button>
        </div>
        <div className="min-h-[340px] flex items-center justify-center border-y border-white/10">
          <PageSpinner />
        </div>
        <div className="flex flex-wrap gap-5 items-center py-8">
          <button className="bg-primaryColor hover:bg-hoverPrimaryColor text-primaryColorButtonText px-6 py-3 rounded-full font-semibold">Xem phim</button>
          <button className="bg-primaryColor/15 text-primaryColor border border-primaryColor/40 px-6 py-3 rounded-full">Thêm vào danh sách</button>
          <InlineSpinner message="Đang xử lý…" />
        </div>
        {/* Same DOM shape as MovieCard so card-level theme effects can be checked here. */}
        <div data-movie-id="theme-preview" className="group w-40 mb-8 bg-bgColor4 rounded-2xl p-2 border border-white/5 cursor-pointer hover:border-primaryColor/60">
          <div className="relative rounded-2xl overflow-hidden aspect-[2/3] bg-gradient-to-b from-[#3a2a3f] via-[#1a1320] to-[#ff7a1a]/40" />
          <p className="text-sm text-gray-300 mt-2 text-center">Rê chuột thử thẻ phim</p>
        </div>
        <p className="text-sm text-gray-400 mb-6">Bản xem thử: {currentTheme}. Loading thực tế tự kết thúc khi trang tải xong.</p>
        <Link to={`/?themePreview=${serverTheme}`} className="text-primaryColor hover:text-hoverPrimaryColor underline underline-offset-4">{copy.link}</Link>
      </div>
    </div>
  );
}
