import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Download, PlusSquare, Share2, Smartphone, Sparkles, X } from "lucide-react";
import usePwaInstallPrompt from "hooks/usePwaInstallPrompt";

const IconTile = ({ children }) => (
  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-primaryColor shadow-inner shadow-white/5">
    {children}
  </span>
);

const InstallGuide = ({ onClose }) => {
  return createPortal(
    <div className="fixed inset-0 z-[10000020] flex items-end justify-center safe-modal-padding sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/75 backdrop-blur-md"
        onClick={onClose}
        aria-label="Đóng hướng dẫn cài app"
      />

      <section className="relative w-full max-w-md overflow-hidden rounded-t-[28px] border border-white/10 bg-[#101014]/95 text-white shadow-[0_-28px_80px_rgba(0,0,0,0.6)] backdrop-blur-2xl sm:rounded-[28px]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primaryColor/70 to-transparent" />
        <div className="pointer-events-none absolute -right-20 -top-24 h-48 w-48 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-20 bottom-0 h-48 w-48 rounded-full bg-primaryColor/10 blur-3xl" />

        <div className="relative p-5 pb-[calc(1.25rem+var(--safe-bottom))]">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primaryColor to-[#fff1b8] text-[#17110a] shadow-[0_18px_40px_rgb(var(--ui-primary)/0.22)]">
                <Smartphone size={22} strokeWidth={2.2} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-primaryColor/75">
                  CinePhine PWA
                </p>
                <h2 className="mt-1 text-lg font-black leading-tight">Cài CinePhine</h2>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white/70 transition-colors hover:bg-white/12 hover:text-white"
              aria-label="Đóng hướng dẫn cài app"
            >
              <X size={16} strokeWidth={2.2} />
            </button>
          </div>

          <p className="text-sm leading-relaxed text-gray-300">
            Trình duyệt chưa mở hộp thoại cài đặt tự động. Bạn vẫn có thể cài CinePhine từ
            menu của trình duyệt.
          </p>

          <div className="mt-5 grid gap-3">
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
              <IconTile>
                <Share2 size={18} strokeWidth={2.1} />
              </IconTile>
              <div>
                <p className="text-sm font-semibold">Mở menu trình duyệt</p>
                <p className="text-xs text-gray-400">Dùng menu ba chấm hoặc nút Chia sẻ.</p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-primaryColor/20 bg-primaryColor/[0.07] p-3">
              <IconTile>
                <PlusSquare size={18} strokeWidth={2.1} />
              </IconTile>
              <div>
                <p className="text-sm font-semibold">Chọn Cài app</p>
                <p className="text-xs text-gray-400">
                  Hoặc chọn Thêm vào Màn hình chính nếu trình duyệt hiển thị tùy chọn đó.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>,
    document.body
  );
};

const PwaInstallButton = ({ variant = "desktop", className = "" }) => {
  const { canPrompt, promptInstall, shouldShowInstall } = usePwaInstallPrompt();
  const [showInstallGuide, setShowInstallGuide] = useState(false);

  if (!shouldShowInstall) return null;

  const handleInstall = async () => {
    if (!canPrompt) {
      setShowInstallGuide(true);
      return;
    }

    const choice = await promptInstall();
    if (choice?.outcome === "manual") {
      setShowInstallGuide(true);
    }
  };

  if (variant === "menu") {
    return (
      <>
        <button
          type="button"
          onClick={handleInstall}
          className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-primaryColor/25 bg-gradient-to-r from-primaryColor/[0.16] via-white/[0.05] to-cyan-400/[0.08] px-3 py-3 text-left text-white shadow-[0_14px_34px_rgba(0,0,0,0.22)] transition-all hover:border-primaryColor/45 hover:from-primaryColor/[0.22] hover:to-cyan-400/[0.12] ${className}`}
        >
          <span className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-primaryColor/80 to-transparent opacity-70" />
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primaryColor text-[#17110a] shadow-[0_10px_26px_rgb(var(--ui-primary)/0.25)] transition-transform group-hover:-translate-y-0.5">
            <Download size={18} strokeWidth={2.25} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-black leading-tight text-white">Cài app</span>
            {/* <span className="mt-0.5 block text-xs text-gray-300">Mở nhanh như ứng dụng riêng</span> */}
          </span>
          <Sparkles
            size={16}
            strokeWidth={2.1}
            className="shrink-0 text-primaryColor/80 transition-transform group-hover:rotate-12"
          />
        </button>
        {showInstallGuide && <InstallGuide onClose={() => setShowInstallGuide(false)} />}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={handleInstall}
        className={`group relative inline-flex h-10 items-center gap-2 overflow-hidden rounded-full border border-primaryColor/25 bg-white/[0.06] laptop-sm:px-1 laptop-sm:h-8 px-3 text-sm font-bold text-white shadow-[0_10px_28px_rgba(0,0,0,0.24)] backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-primaryColor/55 hover:bg-primaryColor/[0.14] hover:shadow-[0_16px_36px_rgb(var(--ui-primary)/0.16)] ${className}`}
        aria-label="Cài CinePhine"
        title="Cài app"
      >
        <span className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-primaryColor/80 to-transparent opacity-80" />
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primaryColor text-[#17110a] transition-transform group-hover:scale-105">
          <Download size={14} strokeWidth={2.4} />
        </span>
        <span className="hidden xl:inline">Cài app</span>
      </button>
      {showInstallGuide && <InstallGuide onClose={() => setShowInstallGuide(false)} />}
    </>
  );
};

export default PwaInstallButton;
