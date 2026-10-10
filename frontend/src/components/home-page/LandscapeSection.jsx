import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import SectionHeader from "components/common/SectionHeader";
import ScrollContainer from "components/common/ScrollContainer";
import MovieViewsTag from "components/common/MovieViewsTag";
import OptimizedImage from "components/common/OptimizedImage";
import movieService from "services/movie.service";
import { BarSpinner } from "components/common/LoadingState";
import { preloadCriticalImages } from "utils/imagePreloader";
import { groupSeriesMovies } from "utils/seriesGrouping";
import { slugify } from "utils/slugify";
import EmptyState from "components/common/EmptyState";

/**
 * Landscape Section — Thẻ phim nằm ngang (backdrop 16:9)
 * Hiển thị backdrop image + title, rating, genres
 * Dùng cho section "Phim Mới Cập Nhật"
 */
const LandscapeSection = ({
  title,
  subtitle,
  sectionType = "newReleases",
  linkHref = "#",
  typeMovies = null,
  genre = null,
}) => {
  const navigate = useNavigate();
  const [allMovies, setAllMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const normalizedGenre = genre ? slugify(genre) : null;

  const filterMovies = useCallback(
    (moviesList) => {
      let filtered = moviesList;
      if (typeMovies === "single") {
        filtered = filtered.filter((m) => m.totalEpisodes === 1);
      } else if (typeMovies === "series") {
        filtered = filtered.filter((m) => m.totalEpisodes > 1);
      }
      if (normalizedGenre) {
        filtered = filtered.filter((m) => {
          const genres = m.genres || m.categories || [];
          return genres.some((g) => {
            const name = typeof g === "string" ? g : g.name || g.label || "";
            return slugify(name) === normalizedGenre;
          });
        });
      }
      return groupSeriesMovies(filtered);
    },
    [typeMovies, normalizedGenre]
  );

  const isMountedRef = React.useRef(true);

  const fetchMovies = useCallback(async () => {
    try {
      if (isMountedRef.current) {
        setLoading(true);
        setError(false);
      }
      const hasFilters = typeMovies || normalizedGenre;
      const fetchLimit = hasFilters ? 100 : 30;
        let response;

        if (normalizedGenre) {
          response = await movieService.getByGenre(normalizedGenre, { limit: fetchLimit });
        } else {
          switch (sectionType) {
            case "trending":
              response = await movieService.getTrending(fetchLimit);
              break;
            case "newReleases":
              response = await movieService.getNewReleases(fetchLimit);
              break;
            default:
              response = await movieService.getAll({ limit: fetchLimit });
          }
        }

        let data = response.data || [];
        data = filterMovies(data);

        if (isMountedRef.current) {
          setAllMovies(data);
          if (data.length > 0) {
            preloadCriticalImages(data).catch(() => {});
          }
        }
      } catch (err) {
        console.error(`Error fetching ${sectionType} movies:`, err);
        if (isMountedRef.current) {
          setAllMovies([]);
          setError(true);
        }
      } finally {
        if (isMountedRef.current) setLoading(false);
      }
  }, [sectionType, typeMovies, normalizedGenre, filterMovies]);

  useEffect(() => {
    isMountedRef.current = true;
    fetchMovies();
    return () => { isMountedRef.current = false; };
  }, [fetchMovies]);

  if (loading) {
    return (
      <section className="w-full py-2 sm:py-6 overflow-visible">
        <div className="px-4">
          <SectionHeader title={title} subtitle={subtitle} linkHref={linkHref} />
        </div>
        <BarSpinner className="w-full py-4" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="w-full py-2 sm:py-6 overflow-visible">
        <div className="px-6">
          <SectionHeader title={title} subtitle={subtitle} linkHref={linkHref} />
        </div>
        <div className="mt-4">
          <EmptyState
            title="Lỗi kết nối"
            message="Không thể tải dữ liệu ở mục này do lỗi mạng. Vui lòng thử lại."
            iconClassName="fa-wifi"
            actionLabel="Thử lại"
            onAction={fetchMovies}
          />
        </div>
      </section>
    );
  }

  if (allMovies.length === 0) return null;

  return (
    <section className="w-full py-2 sm:py-6 overflow-visible">
      <div className="px-6">
        <SectionHeader title={title} subtitle={subtitle} linkHref={linkHref} />
      </div>

      {/* Mobile: 2-column grid */}
      <div className="lg:hidden px-4">
        <div className="grid grid-cols-2 gap-2">
          {allMovies.slice(0, 6).map((movie) => (
            <LandscapeCard key={movie.id} movie={movie} onClick={() => navigate(`/movie/${movie.id}`)} />
          ))}
        </div>
      </div>

      {/* Desktop: Horizontal scroll with arrows */}
      <div className="hidden lg:block lg:-mt-2">
        <div className="max-w-[1920px] mx-auto">
          <div className="relative px-4">
            <ScrollContainer gap="gap-4" showArrows={true}>
              {allMovies.map((movie) => (
                <div
                  key={movie.id}
                  className="flex-shrink-0"
                  style={{
                    width: "calc((100% - 48px) / 4)",
                    maxWidth: "450px",
                    minWidth: "300px",
                  }}
                >
                  <LandscapeCard movie={movie} onClick={() => navigate(`/movie/${movie.id}`)} />
                </div>
              ))}
            </ScrollContainer>
          </div>
        </div>
      </div>
    </section>
  );
};

/**
 * Individual landscape movie card (16:9 backdrop)
 */
const LandscapeCard = ({ movie, onClick }) => {
  const genres = Array.isArray(movie.genres) ? movie.genres.slice(0, 2) : [];

  return (
    <div
      className="group relative rounded-xl overflow-hidden cursor-pointer border border-white/5 hover:border-primaryColor/50 transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-primaryColor/5"
      onClick={onClick}
    >
      {/* Backdrop Image */}
      <div className="relative">
        <OptimizedImage
          src={movie.backgroundImage || movie.poster}
          fallbackSrcs={[movie.poster, movie.thumb_url, movie.poster_url]}
          alt={movie.title}
          className="w-full aspect-video object-cover transition-transform duration-500 group-hover:scale-105"
          sizeKey="DETAIL"
          lazy={true}
        />
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

        {/* Quality badge */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5">
          <span className="px-1.5 py-0.5 text-[10px] font-bold bg-cyan-500 text-white rounded shadow-sm">
            {movie.quality || "HD"}
          </span>
          <MovieViewsTag movie={movie} compact className="pointer-events-none" />
        </div>

        {/* Episode badge */}
        {movie.totalEpisodes === 1 && (movie.currentEpisode === 1 || movie.currentEpisode === "1" || movie.currentEpisode === "Full") ? (
          <div className="absolute top-2 right-2">
            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-orange-500 text-white rounded shadow-sm">
              Full
            </span>
          </div>
        ) : movie.totalEpisodes > 1 && movie.currentEpisode ? (
          <div className="absolute top-2 right-2">
            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-orange-500 text-white rounded shadow-sm">
              Tập {movie.currentEpisode}/{movie.totalEpisodes}
            </span>
          </div>
        ) : null}
      </div>

      {/* Info overlay at bottom */}
      <div className="absolute bottom-0 left-0 right-0 p-3">
        <h4 className="text-sm font-bold text-white line-clamp-1 group-hover:text-primaryColor transition-colors">
          {movie.title}
        </h4>
        <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-400">
          {movie.rating > 0 && (
            <span className="flex items-center gap-0.5 text-yellow-400 font-semibold">
              <svg className="w-3 h-3 fill-current" viewBox="0 0 20 20">
                <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
              </svg>
              {movie.rating.toFixed(1)}
            </span>
          )}
          {movie.year && <span>{movie.year}</span>}
          {genres.length > 0 && (
            <span className="hidden sm:inline truncate">
              {genres.map((g) => (typeof g === "string" ? g : g.name || "")).join(", ")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default LandscapeSection;
