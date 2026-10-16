import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "contexts/ThemeContext";
import SnowmanLoader from "components/common/SnowmanLoader";
import HalloweenCat from "components/common/HalloweenCat";
import useChatStream from "hooks/useChatStream";
import useDragScroll from "hooks/useDragScroll";
import ChatMessage, { RobotIcon } from "./ChatMessage";

const EMOJI_MART_SCRIPT_URL = "https://cdn.jsdelivr.net/npm/emoji-mart@latest/dist/browser.js";
const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MOVIE_PAGE = /\/(movie|watch)\/([a-f0-9]{24})/i;
// Only in-app movie routes may be opened by the assistant.
const SAFE_ACTION_PATH = /^\/(movie|watch)\/[\w-]+$/;

const MOVIE_PAGE_CHIPS = ["Phim này nói về gì?", "Gợi ý phim tương tự", "Thêm phim này vào xem sau"];
const DEFAULT_CHIPS = ["Chọn giúp tôi 1 phim", "Gợi ý phim hợp gu tôi", "Phim đang hot", "Phim tôi đang xem dở"];

let emojiMartLoadPromise = null;

function loadEmojiMart() {
  if (window.EmojiMart) return Promise.resolve();
  if (!emojiMartLoadPromise) {
    emojiMartLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = EMOJI_MART_SCRIPT_URL;
      script.async = true;
      script.onload = resolve;
      script.onerror = (error) => {
        emojiMartLoadPromise = null;
        reject(error);
      };
      document.head.appendChild(script);
    });
  }
  return emojiMartLoadPromise;
}

const isMobileViewport = () => window.matchMedia("(max-width: 639px)").matches;

const Icon = ({ children, size = 20, strokeWidth = 2, className = "" }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    {children}
  </svg>
);

const iconButton =
  "flex rounded-full p-1.5 text-gray-400 transition-colors hover:bg-primaryColor/10 hover:text-primaryColor focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primaryColor/60 disabled:opacity-40";

const Chatbot = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { currentTheme } = useTheme();
  const isChristmas = currentTheme === "christmas";
  const isHalloween = currentTheme === "halloween";

  const [showChatbot, setShowChatbot] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [input, setInput] = useState("");
  const [attachment, setAttachment] = useState(null);

  const popupRef = useRef(null);
  const chatBodyRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  const closeOnMobile = useCallback(() => {
    if (isMobileViewport()) setShowChatbot(false);
  }, []);

  const handleAction = useCallback(
    (action) => {
      if (action?.type !== "navigate" || !SAFE_ACTION_PATH.test(action.path || "")) return;
      navigate(action.path);
      closeOnMobile();
    },
    [navigate, closeOnMobile]
  );

  const { messages, isSending, send, stop, reset } = useChatStream({ onAction: handleAction, active: showChatbot });

  const movieId = pathname.match(MOVIE_PAGE)?.[2];
  // Quick replies the bot attached to its latest answer win over the static chips.
  const botSuggestions = messages[messages.length - 1]?.suggestions;
  const chips = botSuggestions?.length ? botSuggestions : movieId ? MOVIE_PAGE_CHIPS : DEFAULT_CHIPS;
  const chipsDrag = useDragScroll();
  const metadata = useMemo(() => ({ page: pathname, ...(movieId ? { movieId } : {}) }), [pathname, movieId]);

  const resizeInput = () => {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  };

  const submit = (text) => {
    const message = text.trim();
    if (isSending || (!message && !attachment)) return;
    send({ text: message, file: attachment && { data: attachment.data, mime_type: attachment.mime_type }, metadata });
    setInput("");
    setAttachment(null);
    setShowEmojiPicker(false);
    requestAnimationFrame(resizeInput);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.innerWidth > 768) {
      e.preventDefault();
      submit(input);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) {
      alert("Chỉ chấp nhận file ảnh (JPEG, PNG, GIF, WEBP)");
      return;
    }
    if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
      alert("Ảnh phải nhỏ hơn hoặc bằng 5MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      setAttachment({ preview: dataUrl, data: dataUrl.split(",")[1], mime_type: file.type });
      inputRef.current?.focus();
    };
    reader.readAsDataURL(file);
  };

  // Keep the newest message in view.
  useEffect(() => {
    chatBodyRef.current?.scrollTo({ top: chatBodyRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (showChatbot && !isMobileViewport()) inputRef.current?.focus();
  }, [showChatbot]);

  useEffect(() => {
    if (!showChatbot) return undefined;
    const handleEscape = (e) => {
      if (e.key === "Escape") setShowChatbot(false);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [showChatbot]);

  // emoji-mart is loaded from CDN on first use and mounted as a web component inside the popup.
  useEffect(() => {
    if (!showChatbot || !showEmojiPicker) return undefined;
    let picker = null;
    let cancelled = false;

    loadEmojiMart()
      .then(() => {
        if (cancelled || !popupRef.current) return;
        picker = new window.EmojiMart.Picker({
          theme: "dark",
          showSkinTones: "none",
          previewPosition: "none",
          navPosition: "bottom",
          perLine: 8,
          onEmojiSelect: (emoji) => {
            const textarea = inputRef.current;
            if (!textarea) return;
            textarea.setRangeText(emoji.native, textarea.selectionStart, textarea.selectionEnd, "end");
            setInput(textarea.value);
            textarea.focus();
          },
          onClickOutside: (e) => {
            if (!e.target?.closest?.("#emoji-picker")) setShowEmojiPicker(false);
          },
        });
        popupRef.current.appendChild(picker);
      })
      .catch((error) => {
        console.error("Error loading emoji picker:", error);
        setShowEmojiPicker(false);
      });

    return () => {
      cancelled = true;
      picker?.remove();
    };
  }, [showChatbot, showEmojiPicker]);

  const togglerSkin = showChatbot
    ? "rotate-90 bg-bgColor2/90 border border-white/10 hidden sm:flex"
    : isChristmas
      ? "chatbot-snowman-toggle"
      : isHalloween
        ? "chatbot-cat-toggle"
        : "bg-primaryColor";

  return (
    <>
      {/* ====== TOGGLER BUTTON ====== */}
      <button
        id="chatbot-toggler"
        type="button"
        aria-label={showChatbot ? "Đóng trò chuyện" : "Mở trò chuyện với CinePhine AI"}
        aria-expanded={showChatbot}
        onClick={() => setShowChatbot((open) => !open)}
        className={`fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-[100005] flex h-14 w-14 items-center justify-center rounded-full shadow-[0_0_20px_rgba(var(--primary-color-rgb),0.4)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_10px_25px_rgba(var(--primary-color-rgb),0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primaryColor md:bottom-6 md:right-8 ${togglerSkin}`}
      >
        <span className={`absolute transition-all duration-300 ${showChatbot ? "scale-0 rotate-180 opacity-0" : "scale-100 rotate-0 opacity-100"}`}>
          {isChristmas ? (
            <span className="chatbot-snowman">
              <SnowmanLoader />
            </span>
          ) : isHalloween ? (
            <HalloweenCat />
          ) : (
            <RobotIcon className="h-7 w-7 fill-gray-900 drop-shadow-md" />
          )}
        </span>
        <span className={`absolute transition-all duration-300 ${showChatbot ? "scale-100 rotate-0 opacity-100" : "scale-0 -rotate-180 opacity-0"}`}>
          <Icon size={28} className="text-gray-300">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </Icon>
        </span>
      </button>

      {/* ====== CHATBOT POPUP ====== */}
      {/* Mobile-first on purpose: max-sm:* is disabled because tailwind.config.js has object-form screens. */}
      <section
        ref={popupRef}
        role="dialog"
        aria-label="CinePhine AI"
        aria-hidden={!showChatbot}
        inert={!showChatbot}
        className={`chatbot-popup-container fixed inset-0 z-[100005] flex h-dvh w-full origin-bottom-right flex-col overflow-hidden bg-bgColor2/90 shadow-2xl shadow-black/80 backdrop-blur-2xl transition-all duration-300 sm:inset-auto sm:bottom-[95px] sm:right-[35px] sm:h-[600px] sm:max-h-[80vh] sm:w-[460px] sm:rounded-3xl sm:border sm:border-white/10
        ${showChatbot ? "pointer-events-auto scale-100 opacity-100" : "pointer-events-none scale-90 opacity-0"}
        [&_em-emoji-picker]:absolute [&_em-emoji-picker]:bottom-[80px] [&_em-emoji-picker]:left-[15px] [&_em-emoji-picker]:z-[10005] [&_em-emoji-picker]:max-h-[350px] [&_em-emoji-picker]:w-[calc(100%-30px)] [&_em-emoji-picker]:rounded-2xl [&_em-emoji-picker]:border [&_em-emoji-picker]:border-white/10 [&_em-emoji-picker]:shadow-2xl`}
      >
        {/* Header */}
        <header className="relative flex shrink-0 items-center justify-between overflow-hidden border-b border-white/10 bg-primaryColor/10 px-5 py-4 pt-[calc(1rem+env(safe-area-inset-top))] sm:pt-4">
          <div className="pointer-events-none absolute -left-10 -top-10 h-32 w-32 rounded-full bg-primaryColor/20 blur-3xl" />
          <div className="relative flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-primaryColor/30 bg-primaryColor/20 p-2 shadow-inner">
              <RobotIcon className="h-full w-full fill-primaryColor drop-shadow-md" />
            </div>
            <div>
              <h2 className="m-0 flex items-center gap-2 text-base font-bold text-gray-100">CinePhine AI</h2>
              <span className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-400">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 shadow-[0_0_5px_#22c55e]" />
                {isSending ? "Đang trả lời..." : "Luôn sẵn sàng hỗ trợ bạn"}
              </span>
            </div>
          </div>
          <div className="relative z-10 flex items-center gap-1">
            <button type="button" onClick={reset} disabled={isSending} title="Cuộc trò chuyện mới" aria-label="Cuộc trò chuyện mới" className={iconButton}>
              <Icon>
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </Icon>
            </button>
            <button type="button" onClick={() => setShowChatbot(false)} title="Thu nhỏ" aria-label="Thu nhỏ trò chuyện" className={iconButton}>
              <Icon>
                <polyline points="6 9 12 15 18 9" />
              </Icon>
            </button>
          </div>
        </header>

        {/* Messages */}
        <div
          ref={chatBodyRef}
          aria-live="polite"
          className="flex flex-1 flex-col overflow-y-auto overscroll-contain bg-transparent p-5 [scrollbar-color:rgb(255_255_255/0.12)_transparent]"
        >
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} onNavigate={closeOnMobile} />
          ))}
        </div>

        {/* Footer */}
        <div className="relative shrink-0 border-t border-white/10 bg-bgColor2/80 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur-xl sm:pb-4">
          {/* py-1: room for the hover lift and focus ring, overflow-x-auto clips vertically too. */}
          {!isSending && (
            <div {...chipsDrag} className="scrollbar-hide -mx-1 -mt-1 mb-3 flex cursor-grab gap-2 overflow-x-auto px-1 py-1">
              {chips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => submit(chip)}
                  className="shrink-0 cursor-[inherit] rounded-full border border-primaryColor/30 bg-primaryColor/10 px-3 py-1.5 text-xs font-medium text-primaryColor transition-all hover:-translate-y-0.5 hover:bg-primaryColor hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primaryColor/60 active:translate-y-0"
                >
                  {chip}
                </button>
              ))}
            </div>
          )}

          {attachment && (
            <div className="pb-3">
              <div className="relative h-16 w-16 overflow-hidden rounded-xl border border-primaryColor/30 bg-black shadow-lg">
                <img src={attachment.preview} alt="Ảnh sắp gửi" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setAttachment(null)}
                  aria-label="Bỏ ảnh"
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white transition-all hover:scale-110 hover:bg-red-500"
                >
                  <Icon size={12} strokeWidth={3}>
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </Icon>
                </button>
              </div>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(input);
            }}
            className="flex items-end gap-2.5 rounded-3xl border border-white/10 bg-bgColor/50 px-3 py-2 backdrop-blur-md transition-all duration-300 focus-within:border-primaryColor/50 focus-within:shadow-[0_0_15px_rgba(var(--primary-color-rgb),0.15)]"
          >
            <div className="flex items-center gap-1 pb-1">
              <button
                type="button"
                id="emoji-picker"
                onClick={() => setShowEmojiPicker((open) => !open)}
                title="Emoji"
                aria-label="Chọn emoji"
                className={iconButton}
              >
                <Icon>
                  <circle cx="12" cy="12" r="10" />
                  <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                  <line x1="9" y1="9" x2="9.01" y2="9" />
                  <line x1="15" y1="9" x2="15.01" y2="9" />
                </Icon>
              </button>
              <button type="button" onClick={() => fileInputRef.current?.click()} title="Gửi ảnh" aria-label="Gửi ảnh" className={iconButton}>
                <Icon>
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </Icon>
              </button>
              <input type="file" hidden ref={fileInputRef} accept={IMAGE_TYPES.join(",")} onChange={handleFileChange} />
            </div>

            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                resizeInput();
              }}
              onKeyDown={handleKeyDown}
              placeholder={movieId ? "Hỏi về phim này..." : "Nhập tin nhắn..."}
              aria-label="Tin nhắn"
              rows={1}
              maxLength={2000}
              className="max-h-[120px] flex-1 resize-none border-none bg-transparent py-2.5 text-sm leading-relaxed text-gray-200 outline-none placeholder:text-gray-500 [scrollbar-color:rgb(255_255_255/0.12)_transparent]"
            />

            {isSending ? (
              <button
                type="button"
                onClick={stop}
                title="Dừng trả lời"
                aria-label="Dừng trả lời"
                className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-red-400/40 bg-red-500/15 text-red-300 shadow-sm transition-all duration-300 hover:bg-red-500 hover:text-white"
              >
                <span className="h-3 w-3 rounded-[3px] bg-current" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim() && !attachment}
                title="Gửi"
                aria-label="Gửi tin nhắn"
                className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primaryColor/30 bg-primaryColor/20 text-primaryColor shadow-sm transition-all duration-300 hover:bg-primaryColor hover:text-gray-900 disabled:border-white/10 disabled:bg-white/5 disabled:text-gray-500"
              >
                <Icon size={18} className="ml-[-2px]">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </Icon>
              </button>
            )}
          </form>
        </div>
      </section>
    </>
  );
};

export default Chatbot;
