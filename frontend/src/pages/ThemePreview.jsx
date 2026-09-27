import React from "react";
import { Link } from "react-router-dom";
import { useTheme } from "contexts/ThemeContext";
import { PageSpinner, InlineSpinner } from "components/common/LoadingState";

export default function ThemePreview() {
  const { currentTheme, toggleTheme, isThemeEnabled } = useTheme();
  return (
    <div className="min-h-dvh bg-[#111b19] text-white px-6 pt-48 pb-40 md:py-24">
      <div className="max-w-3xl mx-auto">
        <div className="flex flex-wrap justify-between items-center gap-4 mb-8">
          <h1 className="text-2xl font-semibold">Một chút mùa đông</h1>
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
        <p className="text-sm text-gray-400 mb-6">Bản xem thử: {currentTheme}. Loading thực tế tự kết thúc khi trang tải xong.</p>
        <Link to="/?themePreview=christmas" className="text-primaryColor hover:text-hoverPrimaryColor underline underline-offset-4">Về trang chủ xem quà Giáng Sinh</Link>
      </div>
    </div>
  );
}
