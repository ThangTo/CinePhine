import React from "react";
import useDragScroll from "hooks/useDragScroll";
import ChatMovieCard from "./ChatMovieCard";

const ROBOT_PATH =
  "M738.3 287.6H285.7c-59 0-106.8 47.8-106.8 106.8v303.1c0 59 47.8 106.8 106.8 106.8h81.5v111.1c0 .7.8 1.1 1.4.7l166.9-110.6 41.8-.8h117.4l43.6-.4c59 0 106.8-47.8 106.8-106.8V394.5c0-59-47.8-106.9-106.8-106.9zM351.7 448.2c0-29.5 23.9-53.5 53.5-53.5s53.5 23.9 53.5 53.5-23.9 53.5-53.5 53.5-53.5-23.9-53.5-53.5zm157.9 267.1c-67.8 0-123.8-47.5-132.3-109h264.6c-8.6 61.5-64.5 109-132.3 109zm110-213.7c-29.5 0-53.5-23.9-53.5-53.5s23.9-53.5 53.5-53.5 53.5 23.9 53.5 53.5-23.9 53.5-53.5 53.5zM867.2 644.5V453.1h26.5c19.4 0 35.1 15.7 35.1 35.1v121.1c0 19.4-15.7 35.1-35.1 35.1h-26.5zM95.2 609.4V488.2c0-19.4 15.7-35.1 35.1-35.1h26.5v191.3h-26.5c-19.4 0-35.1-15.7-35.1-35.1zM561.5 149.6c0 23.4-15.6 43.3-36.9 49.7v44.9h-30v-44.9c-21.4-6.5-36.9-26.3-36.9-49.7 0-28.6 23.3-51.9 51.9-51.9s51.9 23.3 51.9 51.9z";

export const RobotIcon = ({ className = "" }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" aria-hidden="true">
    <path d={ROBOT_PATH} />
  </svg>
);

const LIST_ITEM = /^(?:[-*•]|(\d+)[.)])\s+(.*)$/;

/**
 * Splits plain model text into paragraph / list blocks. Only **bold** and "- " / "1. " lists are
 * understood; everything else stays text, so React escapes it (no HTML from the model ever renders).
 */
export function parseMessageBlocks(text = "") {
  const blocks = [];
  let list = null;
  String(text)
    .split(/\r?\n/)
    .forEach((raw) => {
      const line = raw.trim().replace(/^#{1,6}\s+(.*)$/, "**$1**");
      const item = line.match(LIST_ITEM);
      if (item) {
        const ordered = Boolean(item[1]);
        if (!list || list.ordered !== ordered) {
          list = { type: "list", ordered, items: [] };
          blocks.push(list);
        }
        list.items.push(item[2]);
        return;
      }
      list = null;
      if (line) blocks.push({ type: "paragraph", text: line });
    });
  return blocks;
}

const renderInline = (text) =>
  text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    /^\*\*[^*]+\*\*$/.test(part) ? (
      <strong key={index} className="font-semibold text-white">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    )
  );

export const FormattedText = ({ text }) => (
  <div className="space-y-2">
    {parseMessageBlocks(text).map((block, index) => {
      if (block.type === "paragraph") {
        return (
          <p key={index} className="m-0">
            {renderInline(block.text)}
          </p>
        );
      }
      const List = block.ordered ? "ol" : "ul";
      return (
        <List
          key={index}
          className={`m-0 space-y-1 pl-5 ${block.ordered ? "list-decimal" : "list-disc"} marker:text-primaryColor`}
        >
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item)}</li>
          ))}
        </List>
      );
    })}
  </div>
);

const ThinkingDots = () => (
  <div className="flex gap-1.5 py-1" aria-label="Đang trả lời">
    {["-0.32s", "-0.16s", "0s"].map((delay) => (
      <span key={delay} className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: delay }} />
    ))}
  </div>
);

const ChatMessage = ({ message, onNavigate }) => {
  const isUser = message.role === "user";
  const hasText = Boolean(message.content);
  const cardsDrag = useDragScroll();

  return (
    <div className={`mb-5 flex w-full animate-[fadeIn_0.3s_ease-out] flex-col ${isUser ? "items-end" : "items-start"}`}>
      <div className={`flex w-full items-end gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
        {!isUser && (
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-primaryColor/30 bg-primaryColor/15 p-1.5 text-primaryColor shadow-sm">
            <RobotIcon className="h-full w-full fill-current drop-shadow-md" />
          </div>
        )}

        <div
          className={`max-w-[80%] break-words rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-md ${
            isUser
              ? "rounded-br-sm border border-primaryColor/30 bg-primaryColor/20 text-primaryColor backdrop-blur-sm shadow-primaryColor/5"
              : "rounded-bl-sm border border-white/10 bg-bgColor/50 text-gray-200 backdrop-blur-md"
          }`}
        >
          {message.status && (
            <div className="flex items-center gap-2 text-xs italic text-gray-400" role="status">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-primaryColor border-t-transparent" />
              {message.status}
            </div>
          )}
          {message.pending && !hasText && !message.status && <ThinkingDots />}
          {hasText && (isUser ? <p className="m-0 whitespace-pre-wrap">{message.content}</p> : <FormattedText text={message.content} />)}
          {message.error && <p className="m-0 mt-1 font-medium text-red-400">Lỗi: {message.error}</p>}
          {message.file && (
            <div className="mt-2 w-full max-w-[200px] overflow-hidden rounded-xl border border-white/20 shadow-lg">
              <img src={`data:${message.file.mime_type};base64,${message.file.data}`} className="block w-full object-cover" alt="Ảnh đã gửi" />
            </div>
          )}
        </div>
      </div>

      {message.movies?.length > 0 && (
        <div
          {...cardsDrag}
          className="mt-2 flex w-full cursor-grab snap-x gap-3 overflow-x-auto pb-2 pl-11 pt-1 [scrollbar-color:rgb(255_255_255/0.12)_transparent]"
        >
          {message.movies.map((movie) => (
            <ChatMovieCard key={movie.id} movie={movie} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
};

export default ChatMessage;
