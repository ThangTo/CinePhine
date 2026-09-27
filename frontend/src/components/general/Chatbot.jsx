import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSystemInstruction } from "constants/chatbotKnowledge";
import { useTheme } from "contexts/ThemeContext";
import SnowmanLoader from "components/common/SnowmanLoader";

const EMOJI_MART_SCRIPT_URL = "https://cdn.jsdelivr.net/npm/emoji-mart@latest/dist/browser.js";
let emojiMartLoadPromise = null;
const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:5000/api/v1";
const STREAM_PAINT_DELAY_MS = 16;

function loadEmojiMart() {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.EmojiMart) return Promise.resolve();
  if (emojiMartLoadPromise) return emojiMartLoadPromise;

  emojiMartLoadPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[src="${EMOJI_MART_SCRIPT_URL}"]`);

    if (existingScript) {
      existingScript.addEventListener("load", resolve, { once: true });
      existingScript.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = EMOJI_MART_SCRIPT_URL;
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });

  return emojiMartLoadPromise;
}

function appendTokenToMessage(setMessages, messageId, content) {
  setMessages((prev) =>
    prev.map((msg) =>
      msg.id === messageId
        ? { ...msg, content, isThinking: false, isStreaming: true }
        : msg
    )
  );
}

function finalizeBotMessage(setMessages, messageId, content) {
  setMessages((prev) =>
    prev.map((msg) =>
      msg.id === messageId
        ? { ...msg, content, isThinking: false, isStreaming: false }
        : msg
    )
  );
}

function extractPlainText(html) {
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = html;
  return tempDiv.textContent || tempDiv.innerText || "";
}

function waitForStreamPaint() {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, STREAM_PAINT_DELAY_MS);
  });
}

async function sendChatMessageFallback(payload) {
  const res = await fetch(`${API_BASE_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Chat request failed");

  const answerHTML = (data.answer || "").trim();
  return {
    answerHTML,
    plainText: extractPlainText(answerHTML),
  };
}

async function sendChatMessageWithStream(payload, messageId, setMessages) {
  let streamedContent = "";
  let receivedToken = false;
  let finalResult = null;

  try {
    const res = await fetch(`${API_BASE_URL}/chat/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      credentials: "include",
      body: JSON.stringify(payload),
    });

    if (!res.ok || !res.body) {
      throw new Error(`Stream request failed (${res.status})`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() || "";

      for (const frame of frames) {
        const event = parseStreamEvent(frame);
        if (!event) continue;
        if (event.type === "token") {
          receivedToken = true;
          streamedContent += event.content || "";
          appendTokenToMessage(setMessages, messageId, streamedContent);
          await waitForStreamPaint();
          continue;
        }

        if (event.type === "done") {
          finalResult = {
            answerHTML: (event.answer || "").trim(),
            plainText: event.plainText || extractPlainText(event.answer || ""),
          };
          continue;
        }

        if (event.type === "error") {
          throw new Error(event.message || "Chat stream failed");
        }
      }
    }

    if (buffer.trim()) {
      const event = parseStreamEvent(buffer);
      if (event?.type === "done") {
        finalResult = {
          answerHTML: (event.answer || "").trim(),
          plainText: event.plainText || extractPlainText(event.answer || ""),
        };
      }
    }

    if (!finalResult) {
      throw new Error("Chat stream ended before completion");
    }

    return finalResult;
  } catch (error) {
    if (receivedToken) throw error;
    return sendChatMessageFallback(payload);
  }
}

function parseStreamEvent(frame) {
  const data = String(frame || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("");

  if (!data) return null;
  return JSON.parse(data);
}

const Chatbot = () => {
  const navigate = useNavigate();
  const { currentTheme } = useTheme();
  const isChristmas = currentTheme === "christmas";
  const chatBodyRef = useRef(null);
  const messageInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const fileUploadWrapperRef = useRef(null);
  const chatbotTogglerRef = useRef(null);
  const emojiPickerRef = useRef(null);
  const chatFormRef = useRef(null);
  const handleOutgoingMessageRef = useRef(null);

  const [showChatbot, setShowChatbot] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [picker, setPicker] = useState(null);
  const [isSending, setIsSending] = useState(false);

  // === CHUYỂN SANG DÙNG REACT STATE CHO TIN NHẮN ===
  const [messages, setMessages] = useState([
    {
      id: "welcome",
      role: "model",
      content:
        "Xin chào! 👋 <br /> Tôi là trợ lý AI của CinePhine. Tôi có thể giúp bạn tìm phim, gợi ý nội dung hay giải đáp thắc mắc.<br /><br />Bạn đang muốn xem gì hôm nay?",
      isThinking: false,
    },
  ]);

  const userDataRef = useRef({
    file: { data: null, mime_type: null },
  });

  const chatHistoryRef = useRef([]);
  const sessionIdRef = useRef(null);

  useEffect(() => {
    let sessionId = localStorage.getItem("chatbot_sessionId");
    if (!sessionId) {
      sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem("chatbot_sessionId", sessionId);
    }
    sessionIdRef.current = sessionId;
  }, []);

  useEffect(() => {
    const systemInstruction = getSystemInstruction();
    if (systemInstruction && chatHistoryRef.current.length === 0) {
      chatHistoryRef.current.push({ role: "model", parts: [{ text: systemInstruction }] });
    }
  }, []);

  // Xử lý sự kiện click vào link phim bên trong tin nhắn bot (Sử dụng Event Delegation)
  useEffect(() => {
    const chatBody = chatBodyRef.current;
    if (!chatBody) return;

    const handleLinkClick = (e) => {
      const link = e.target.closest(".chatbot-movie-link");
      if (link) {
        e.preventDefault();
        const href = link.getAttribute("href");
        if (href) navigate(href);
      }
    };

    chatBody.addEventListener("click", handleLinkClick);
    return () => chatBody.removeEventListener("click", handleLinkClick);
  }, [navigate]);

  // Cuộn xuống cuối mỗi khi có tin nhắn mới
  useEffect(() => {
    if (chatBodyRef.current) {
      chatBodyRef.current.scrollTo({
        top: chatBodyRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages]);

  const buildChatMetadata = () => {
    const pathname = window.location.pathname;
    const metadata = { page: pathname };
    const movieMatch = pathname.match(/\/(movie|watch)\/([a-f0-9]{24})/i);
    if (movieMatch && movieMatch[2]) {
      metadata.movieId = movieMatch[2];
    }
    return metadata;
  };

  const handleOutgoingMessage = async (e) => {
    e.preventDefault();
    if (isSending) return;

    const messageText = messageInputRef.current.value.trim();
    const fileData = userDataRef.current.file.data ? { ...userDataRef.current.file } : null;

    if (!messageText && !fileData) return;

    setIsSending(true);

    const newUserMessage = {
      id: Date.now(),
      role: "user",
      content: messageText || "Gửi một ảnh",
      file: fileData,
      isThinking: false,
    };

    const newBotMessageId = Date.now() + 1;
    const newBotMessage = {
      id: newBotMessageId,
      role: "model",
      content: "",
      isThinking: true,
    };

    // 1. Cập nhật UI ngay lập tức
    setMessages((prev) => [...prev, newUserMessage, newBotMessage]);

    // 2. Clear input
    messageInputRef.current.value = "";
    messageInputRef.current.style.height = "auto";
    resetFileInput();

    // 3. Đẩy vào history backend
    chatHistoryRef.current.push({
      role: "user",
      parts: [{ text: newUserMessage.content }],
    });

    // 4. Gọi API
    try {
      const historyForBackend = chatHistoryRef.current
        .filter((msg) => msg.role === "user" || msg.role === "model")
        .map((msg) => ({
          role: msg.role === "model" ? "assistant" : "user",
          content: msg.parts?.[0]?.text || msg.content || "",
        }))
        .filter((msg) => msg.content.trim().length > 0);

      const payload = {
        message: newUserMessage.content,
        history: historyForBackend,
        metadata: buildChatMetadata(),
        sessionId: sessionIdRef.current,
      };

      const { answerHTML, plainText } = await sendChatMessageWithStream(
        payload,
        newBotMessageId,
        setMessages
      );
      chatHistoryRef.current.push({ role: "model", parts: [{ text: plainText }] });

      // Cập nhật lại UI tin nhắn của bot
      finalizeBotMessage(setMessages, newBotMessageId, answerHTML);
    } catch (error) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === newBotMessageId
            ? {
                ...msg,
                content: `<span class="text-red-400 font-medium">Lỗi: ${error.message}</span>`,
                isThinking: false,
              }
            : msg
        )
      );
    } finally {
      setIsSending(false);
    }
  };

  handleOutgoingMessageRef.current = handleOutgoingMessage;

  const resetFileInput = useCallback(() => {
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (fileUploadWrapperRef.current) {
      fileUploadWrapperRef.current.classList.remove("file-uploaded");
      const img = fileUploadWrapperRef.current.querySelector("img");
      if (img) img.src = "";
    }
    userDataRef.current.file = { data: null, mime_type: null };
  }, []);

  // --- EVENT LISTENERS (Inputs & Files) ---
  useEffect(() => {
    const textarea = messageInputRef.current;
    if (!textarea) return;
    const handleKeyDown = (e) => {
      const userMessage = e.target.value.trim();
      const hasFile = userDataRef.current.file.data !== null;
      if (e.key === "Enter" && !e.shiftKey && window.innerWidth > 768 && !isSending) {
        if (userMessage || hasFile) {
          handleOutgoingMessageRef.current?.(e);
        } else {
          e.preventDefault();
        }
      }
    };
    const handleInput = () => {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    };

    textarea.addEventListener("keydown", handleKeyDown);
    textarea.addEventListener("input", handleInput);

    return () => {
      textarea.removeEventListener("keydown", handleKeyDown);
      textarea.removeEventListener("input", handleInput);
    };
  }, [isSending]);

  // Handle File change
  useEffect(() => {
    const fileInput = fileInputRef.current;
    if (!fileInput) return;
    const handleFileChange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const validImageTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
      if (!validImageTypes.includes(file.type)) {
        alert("Chỉ chấp nhận file ảnh (JPEG, PNG, GIF, WEBP)");
        resetFileInput();
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        if (fileUploadWrapperRef.current) {
          const img = fileUploadWrapperRef.current.querySelector("img");
          if (img) img.src = e.target.result;
          fileUploadWrapperRef.current.classList.add("file-uploaded");
        }
        const base64String = e.target.result.split(",")[1];
        userDataRef.current.file = { data: base64String, mime_type: file.type };
        if (messageInputRef.current) messageInputRef.current.focus();
      };
      reader.readAsDataURL(file);
    };
    fileInput.addEventListener("change", handleFileChange);
    return () => {
      fileInput.removeEventListener("change", handleFileChange);
    };
  }, [resetFileInput]);

  // Emoji Picker logic (Giữ nguyên)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!showChatbot || !showEmojiPicker) return;

    let isCancelled = false;

    const initEmojiPicker = () => {
      if (!window.EmojiMart || !chatFormRef.current) return;
      try {
        const existingPicker = chatFormRef.current.querySelector("em-emoji-picker");
        if (existingPicker) existingPicker.remove();

        const emojiPicker = new window.EmojiMart.Picker({
          theme: "dark",
          showSkinTones: "none",
          previewPosition: "none",
          navPosition: "bottom",
          perLine: 8,
          onEmojiSelect: (emoji) => {
            if (messageInputRef.current) {
              const { selectionStart: start, selectionEnd: end } = messageInputRef.current;
              messageInputRef.current.setRangeText(emoji.native, start, end, "end");
              messageInputRef.current.focus();
            }
          },
          onClickOutside: (e) => {
            if (e.target && e.target.id === "emoji-picker") return;
            setShowEmojiPicker(false);
          },
        });

        const popup = document.querySelector(".chatbot-popup-container");
        if (popup && emojiPicker) {
          popup.appendChild(emojiPicker);
          setPicker(emojiPicker);
        }
      } catch (error) {
        console.error("Error initializing emoji picker:", error);
      }
    };

    loadEmojiMart()
      .then(() => {
        if (!isCancelled) initEmojiPicker();
      })
      .catch((error) => {
        console.error("Error loading emoji picker:", error);
      });

    return () => {
      isCancelled = true;
    };
  }, [showChatbot, showEmojiPicker]);

  useEffect(() => {
    return () => {
      if (picker)
        try {
          picker.remove();
        } catch (e) {}
    };
  }, [picker]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.body.classList.toggle("show-chatbot", showChatbot);
    }
  }, [showChatbot]);

  return (
    <>
      {/* ====== TOGGLER BUTTON ====== */}
      <button
        id="chatbot-toggler"
        aria-label={showChatbot ? "Đóng trò chuyện" : "Mở trò chuyện"}
        aria-expanded={showChatbot}
        ref={chatbotTogglerRef}
        onClick={() => setShowChatbot(!showChatbot)}
        className={`hidden sm:fixed bottom-4 md:bottom-6 right-5 md:right-8 h-14 w-14 sm:flex items-center justify-center rounded-full shadow-[0_0_20px_rgba(var(--primary-color-rgb),0.4)] transition-all duration-300 z-[100005] hover:-translate-y-1 hover:shadow-[0_10px_25px_rgba(var(--primary-color-rgb),0.5)] ${
          showChatbot ? "rotate-90 bg-bgColor2/90 border border-white/10" : isChristmas ? "chatbot-snowman-toggle" : "bg-primaryColor"
        }`}
      >
        <span
          className={`absolute transition-all duration-300 ${showChatbot ? "opacity-0 scale-0 rotate-180" : "opacity-100 scale-100 rotate-0"}`}
        >
          {isChristmas ? <span className="chatbot-snowman"><SnowmanLoader /></span> : <svg
            className="w-7 h-7 fill-gray-900 drop-shadow-md"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 1024 1024"
          >
            <path d="M738.3 287.6H285.7c-59 0-106.8 47.8-106.8 106.8v303.1c0 59 47.8 106.8 106.8 106.8h81.5v111.1c0 .7.8 1.1 1.4.7l166.9-110.6 41.8-.8h117.4l43.6-.4c59 0 106.8-47.8 106.8-106.8V394.5c0-59-47.8-106.9-106.8-106.9zM351.7 448.2c0-29.5 23.9-53.5 53.5-53.5s53.5 23.9 53.5 53.5-23.9 53.5-53.5 53.5-53.5-23.9-53.5-53.5zm157.9 267.1c-67.8 0-123.8-47.5-132.3-109h264.6c-8.6 61.5-64.5 109-132.3 109zm110-213.7c-29.5 0-53.5-23.9-53.5-53.5s23.9-53.5 53.5-53.5 53.5 23.9 53.5 53.5-23.9 53.5-53.5 53.5zM867.2 644.5V453.1h26.5c19.4 0 35.1 15.7 35.1 35.1v121.1c0 19.4-15.7 35.1-35.1 35.1h-26.5zM95.2 609.4V488.2c0-19.4 15.7-35.1 35.1-35.1h26.5v191.3h-26.5c-19.4 0-35.1-15.7-35.1-35.1zM561.5 149.6c0 23.4-15.6 43.3-36.9 49.7v44.9h-30v-44.9c-21.4-6.5-36.9-26.3-36.9-49.7 0-28.6 23.3-51.9 51.9-51.9s51.9 23.3 51.9 51.9z" />
          </svg>}
        </span>
        <span
          className={`absolute transition-all duration-300 ${showChatbot ? "opacity-100 scale-100 rotate-0" : "opacity-0 scale-0 -rotate-180"}`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-gray-300"
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </span>
      </button>

      {/* ====== CHATBOT POPUP ====== */}
      <div
        className={`chatbot-popup-container fixed right-[35px] bottom-[95px] w-[460px] h-[600px] max-h-[80vh] bg-bgColor2/90 backdrop-blur-2xl rounded-3xl border border-white/10 shadow-2xl shadow-black/80 z-[100005] flex flex-col overflow-hidden transition-all duration-300 origin-bottom-right max-sm:w-full max-sm:h-full max-sm:bottom-0 max-sm:right-0 max-sm:rounded-none
        ${showChatbot ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-90 pointer-events-none"}
        [&_em-emoji-picker]:absolute [&_em-emoji-picker]:bottom-[80px] [&_em-emoji-picker]:left-[15px] [&_em-emoji-picker]:w-[calc(100%-30px)] [&_em-emoji-picker]:max-h-[350px] [&_em-emoji-picker]:z-[10005] [&_em-emoji-picker]:shadow-2xl [&_em-emoji-picker]:rounded-2xl [&_em-emoji-picker]:border [&_em-emoji-picker]:border-white/10 ${
          !showEmojiPicker ? "[&_em-emoji-picker]:hidden" : ""
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-primaryColor/10 border-b border-white/10 relative overflow-hidden shrink-0">
          <div className="absolute -top-10 -left-10 w-32 h-32 bg-primaryColor/20 rounded-full blur-3xl pointer-events-none" />

          <div className="relative flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primaryColor/20 border border-primaryColor/30 flex items-center justify-center p-2 shadow-inner">
              <svg
                className="w-full h-full fill-primaryColor drop-shadow-md"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 1024 1024"
              >
                <path d="M738.3 287.6H285.7c-59 0-106.8 47.8-106.8 106.8v303.1c0 59 47.8 106.8 106.8 106.8h81.5v111.1c0 .7.8 1.1 1.4.7l166.9-110.6 41.8-.8h117.4l43.6-.4c59 0 106.8-47.8 106.8-106.8V394.5c0-59-47.8-106.9-106.8-106.9zM351.7 448.2c0-29.5 23.9-53.5 53.5-53.5s53.5 23.9 53.5 53.5-23.9 53.5-53.5 53.5-53.5-23.9-53.5-53.5zm157.9 267.1c-67.8 0-123.8-47.5-132.3-109h264.6c-8.6 61.5-64.5 109-132.3 109zm110-213.7c-29.5 0-53.5-23.9-53.5-53.5s23.9-53.5 53.5-53.5 53.5 23.9 53.5 53.5-23.9 53.5-53.5 53.5zM867.2 644.5V453.1h26.5c19.4 0 35.1 15.7 35.1 35.1v121.1c0 19.4-15.7 35.1-35.1 35.1h-26.5zM95.2 609.4V488.2c0-19.4 15.7-35.1 35.1-35.1h26.5v191.3h-26.5c-19.4 0-35.1-15.7-35.1-35.1zM561.5 149.6c0 23.4-15.6 43.3-36.9 49.7v44.9h-30v-44.9c-21.4-6.5-36.9-26.3-36.9-49.7 0-28.6 23.3-51.9 51.9-51.9s51.9 23.3 51.9 51.9z" />
              </svg>
            </div>
            <div>
              <h2 className="text-gray-100 font-bold text-base m-0 flex items-center gap-2">
                CinePhine AI <i className="fa-solid fa-sparkles text-primaryColor text-[10px]" />
              </h2>
              <span className="text-gray-400 text-xs flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_5px_#22c55e]" />
                Luôn sẵn sàng hỗ trợ bạn
              </span>
            </div>
          </div>
          <button
            onClick={() => setShowChatbot(false)}
            className="relative text-gray-400 hover:text-white hover:bg-white/10 p-1.5 rounded-full transition-colors z-10 border border-transparent hover:border-white/5"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
        </div>

        {/* ====== CHAT BODY (React Render Mảng Tin Nhắn) ====== */}
        <div
          ref={chatBodyRef}
          className="flex-1 p-5 overflow-y-auto flex flex-col bg-transparent [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/20 scroll-smooth"
        >
          {messages.map((msg, index) => (
            <div
              key={msg.id || index}
              className={`flex gap-3 items-end mb-5 w-full animate-[fadeIn_0.3s_ease-out] ${
                msg.role === "user" ? "flex-row-reverse" : ""
              }`}
            >
              {msg.role === "model" && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primaryColor/15 border border-primaryColor/30 flex items-center justify-center text-primaryColor p-1.5 shadow-sm">
                  <svg
                    className="w-full h-full fill-current drop-shadow-md"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 1024 1024"
                  >
                    <path d="M738.3 287.6H285.7c-59 0-106.8 47.8-106.8 106.8v303.1c0 59 47.8 106.8 106.8 106.8h81.5v111.1c0 .7.8 1.1 1.4.7l166.9-110.6 41.8-.8h117.4l43.6-.4c59 0 106.8-47.8 106.8-106.8V394.5c0-59-47.8-106.9-106.8-106.9zM351.7 448.2c0-29.5 23.9-53.5 53.5-53.5s53.5 23.9 53.5 53.5-23.9 53.5-53.5 53.5-53.5-23.9-53.5-53.5zm157.9 267.1c-67.8 0-123.8-47.5-132.3-109h264.6c-8.6 61.5-64.5 109-132.3 109zm110-213.7c-29.5 0-53.5-23.9-53.5-53.5s23.9-53.5 53.5-53.5 53.5 23.9 53.5 53.5-23.9 53.5-53.5 53.5zM867.2 644.5V453.1h26.5c19.4 0 35.1 15.7 35.1 35.1v121.1c0 19.4-15.7 35.1-35.1 35.1h-26.5zM95.2 609.4V488.2c0-19.4 15.7-35.1 35.1-35.1h26.5v191.3h-26.5c-19.4 0-35.1-15.7-35.1-35.1zM561.5 149.6c0 23.4-15.6 43.3-36.9 49.7v44.9h-30v-44.9c-21.4-6.5-36.9-26.3-36.9-49.7 0-28.6 23.3-51.9 51.9-51.9s51.9 23.3 51.9 51.9z" />
                  </svg>
                </div>
              )}

              <div
                className={`message-text px-4 py-3 rounded-2xl text-sm leading-relaxed max-w-[80%] shadow-md ${
                  msg.role === "user"
                    ? "bg-primaryColor/20 backdrop-blur-sm text-primaryColor border border-primaryColor/30 rounded-br-sm shadow-primaryColor/5"
                    : "bg-bgColor/50 backdrop-blur-md text-gray-200 border border-white/10 rounded-bl-sm"
                }`}
              >
                {msg.isThinking ? (
                  <div className="flex gap-1.5 py-1">
                    <div
                      className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: "-0.32s" }}
                    ></div>
                    <div
                      className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: "-0.16s" }}
                    ></div>
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
                  </div>
                ) : (
                  msg.isStreaming ? (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  ) : (
                    <div dangerouslySetInnerHTML={{ __html: msg.content }} />
                  )
                )}

                {msg.file && (
                  <div className="mt-2 w-full max-w-[200px] rounded-xl overflow-hidden border border-white/20 shadow-lg">
                    <img
                      src={`data:${msg.file.mime_type};base64,${msg.file.data}`}
                      className="w-full block object-cover"
                      alt="attachment"
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Chat Footer */}
        <div className="p-4 bg-bgColor2/80 backdrop-blur-xl border-t border-white/10 relative shrink-0">
          {/* File Upload Preview */}
          <div
            ref={fileUploadWrapperRef}
            className="hidden [&.file-uploaded]:block pb-3 transition-all duration-300"
          >
            <div className="relative w-16 h-16 rounded-xl border border-primaryColor/30 overflow-hidden bg-black shadow-lg">
              <img alt="preview" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  resetFileInput();
                }}
                className="absolute top-1 right-1 bg-black/70 text-white border-none rounded-full w-5 h-5 flex items-center justify-center cursor-pointer hover:bg-red-500 hover:scale-110 transition-all"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>

          <form
            ref={chatFormRef}
            onSubmit={handleOutgoingMessage}
            className="flex items-end gap-2.5 bg-bgColor/50 backdrop-blur-md rounded-3xl px-3 py-2 border border-white/10 focus-within:border-primaryColor/50 focus-within:shadow-[0_0_15px_rgba(var(--primary-color-rgb),0.15)] transition-all duration-300"
          >
            <div className="flex gap-1 items-center pb-1">
              <button
                type="button"
                id="emoji-picker"
                ref={emojiPickerRef}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowEmojiPicker((prev) => !prev);
                }}
                title="Emoji"
                className="p-1.5 text-gray-400 hover:text-primaryColor hover:bg-primaryColor/10 rounded-full transition-colors flex"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10"></circle>
                  <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
                  <line x1="9" y1="9" x2="9.01" y2="9"></line>
                  <line x1="15" y1="9" x2="15.01" y2="9"></line>
                </svg>
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  if (fileInputRef.current) fileInputRef.current.click();
                }}
                title="Gửi ảnh"
                className="p-1.5 text-gray-400 hover:text-primaryColor hover:bg-primaryColor/10 rounded-full transition-colors flex"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <circle cx="8.5" cy="8.5" r="1.5"></circle>
                  <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
              </button>

              <input
                type="file"
                hidden
                ref={fileInputRef}
                accept="image/jpeg,image/png,image/gif,image/webp"
              />
            </div>

            <textarea
              ref={messageInputRef}
              placeholder="Nhập tin nhắn..."
              rows={1}
              disabled={isSending}
              className="flex-1 bg-transparent border-none outline-none text-gray-200 text-sm resize-none max-h-[100px] py-2.5 leading-relaxed placeholder:text-gray-500 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full"
            />

            <button
              type="submit"
              disabled={isSending}
              className="w-9 h-9 rounded-full bg-primaryColor/20 border border-primaryColor/30 text-primaryColor flex items-center justify-center shrink-0 hover:bg-primaryColor hover:text-gray-900 transition-all duration-300 disabled:opacity-50 disabled:bg-white/5 disabled:border-white/10 disabled:text-gray-500 mb-0.5 shadow-sm"
            >
              {isSending ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="ml-[-2px]"
                >
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
              )}
            </button>
          </form>
        </div>
      </div>
    </>
  );
};

export default Chatbot;
