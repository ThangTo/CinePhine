import React from "react";
import { Link } from "react-router-dom";
import OptimizedImage from "components/common/OptimizedImage";

/** Compact poster card for movies returned by chat tools. */
const ChatMovieCard = ({ movie, onNavigate }) => {
  const progress = Math.min(Math.max(Number(movie.progress) || 0, 0), 100);
  const rating = Number(movie.rating) || 0;
  const meta = [movie.year, movie.genres?.[0]].filter(Boolean).join(" · ");

  return (
    <Link
      to={`/movie/${movie.id}`}
      onClick={onNavigate}
      title={movie.title}
      className="group w-[116px] shrink-0 snap-start rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primaryColor"
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl border border-white/10 bg-black/40 shadow-lg transition-all duration-300 group-hover:-translate-y-1 group-hover:border-primaryColor/50 group-hover:shadow-[0_8px_20px_rgba(var(--primary-color-rgb),0.25)]">
        {movie.poster || movie.thumb ? (
          <OptimizedImage
            src={movie.poster || movie.thumb}
            fallbackSrcs={movie.poster && movie.thumb ? [movie.thumb] : []}
            alt={movie.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            sizeKey="THUMBNAIL"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-gray-500">CinePhine</div>
        )}
        {movie.quality && (
          <span className="absolute left-1.5 top-1.5 rounded-md bg-primaryColor px-1.5 py-0.5 text-[9px] font-bold uppercase text-gray-900">
            {movie.quality}
          </span>
        )}
        {rating > 0 && (
          <span className="absolute right-1.5 top-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold text-yellow-300">
            ★ {rating.toFixed(1)}
          </span>
        )}
        {progress > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20" aria-label={`Đã xem ${Math.round(progress)}%`}>
            <div className="h-full bg-primaryColor" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
      <p className="mt-1.5 line-clamp-2 text-xs font-semibold leading-snug text-gray-100 group-hover:text-primaryColor">
        {movie.title}
      </p>
      {meta && <p className="mt-0.5 truncate text-[10px] text-gray-400">{meta}</p>}
    </Link>
  );
};

export default ChatMovieCard;
