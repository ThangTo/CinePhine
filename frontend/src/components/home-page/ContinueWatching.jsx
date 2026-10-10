import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "hooks/useAuth";
import userService from "services/user.service";
import { BarSpinner } from "components/common/LoadingState";
import OptimizedImage from "components/common/OptimizedImage";

/**
 * Continue Watching Component
 * Shows user's recently watched movies with progress
 * Only visible when user is authenticated
 */
const ContinueWatching = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [continueWatchingData, setContinueWatchingData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showViewMore, setShowViewMore] = useState(false);

  useEffect(() => {
    let isMounted = true; // Track if component is mounted

    if (!isAuthenticated) {
      if (isMounted) {
        setContinueWatchingData([]);
        setLoading(false);
      }
      return;
    }

    const fetchContinueWatching = async () => {
      try {
        if (isMounted) {
          setLoading(true);
        }
        const response = await userService.getContinueWatching({ limit: 6 });
        const historyData = response?.data || [];

        // Format data để hiển thị
        const formattedData = historyData.map((item) => {
          const movie = item.movieId || {};
          const episode = item.episodeId || {};

          const episodeNumber = episode.episodeId || episode.episode || 1;
          const audioType = episode.audioType || null;

          return {
            id: item._id || item.id,
            movieId: movie._id || movie.id || item.movieId,
            title: movie.name || movie.title,
            englishTitle: movie.englishTitle,
            poster: movie.poster_url || movie.poster || movie.thumb_url,
            progress: item.progress || 0,
            watchTime: item.watchTime || 0,
            duration: item.duration || 0,
            durationMinutes: movie.durationMinutes || Math.floor((item.duration || 0) / 60),
            lastWatchedEpisode: episodeNumber,
            lastWatchedAudioType: audioType,
            lastWatchedAt: item.lastWatchedAt,
            movie: movie,
            episode: episode,
          };
        });

        if (isMounted) {
          setContinueWatchingData(formattedData);
        }
      } catch (error) {
        console.error("Error fetching continue watching data:", error);
        if (isMounted) {
          setContinueWatchingData([]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchContinueWatching();

    // Cleanup function
    return () => {
      isMounted = false;
    };
  }, [isAuthenticated]);

  const handleMovieClick = (movie) => {
    const targetMovieId = movie.movieId || movie.id;
    if (!targetMovieId) {
      return;
    }

    // Navigate to watch page with the episode and audioType where user left off
    const episodeToWatch = movie.lastWatchedEpisode || 1;
    const audioType = movie.lastWatchedAudioType;
    const audioQuery = audioType ? `&audio=${encodeURIComponent(audioType)}` : "";
    const watchTime = movie.watchTime || null;

    // Navigate với resumeTime trong location.state
    navigate(`/watch/${targetMovieId}?ep=${episodeToWatch}${audioQuery}`, {
      state: { resumeTime: watchTime },
    });
  };

  const handleDeleteProgress = async (e, movie) => {
    e.stopPropagation(); // Ngăn chặn click event bubble lên parent div

    const targetMovieId = movie.movieId || movie.id;
    if (!targetMovieId) {
      return;
    }

    try {
      await userService.deleteProgress(targetMovieId);

      // Remove item from local state
      setContinueWatchingData((prev) =>
        prev.filter((item) => (item.movieId || item.id) !== targetMovieId)
      );
    } catch (error) {
      console.error("Error deleting progress:", error);
      // Có thể thêm toast notification ở đây
    }
  };

  const handleViewMoreClick = () => {
    navigate("account?tabs=continue-watching");
  };

  // Don't render if user is not authenticated
  if (!isAuthenticated) {
    return null;
  }

  // Don't render if no continue watching data
  if (!loading && continueWatchingData.length === 0) {
    return null;
  }

  if (loading) {
    return (
      <section className="w-full py-2 sm:py-6 overflow-visible">
        <div className="px-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl sm:text-2xl font-bold text-white">Xem tiếp của bạn</h2>
          </div>
        </div>
        <BarSpinner className="w-full py-4" />
      </section>
    );
  }

  return (
    <section className="w-full py-2 sm:py-6 overflow-visible">
      <div className="px-4">
        <div className="flex items-center justify-start gap-4 mb-4">
          <h2 className="text-xl sm:text-2xl font-bold text-white">Xem tiếp của bạn</h2>

          {/* View More Button with Hover Effect */}
          <button
            onClick={handleViewMoreClick}
            onMouseEnter={() => setShowViewMore(true)}
            onMouseLeave={() => setShowViewMore(false)}
            className="flex items-center gap-2 text-gray-400 hover:text-primaryColor transition-all duration-200 px-3 py-1 rounded-full border border-transparent hover:border-primaryColor/60"
            aria-label="Xem thêm phim đã xem"
          >
            {showViewMore ? (
              <>
                <span className="text-sm font-medium">Xem thêm</span>
                <i className="fa-solid fa-chevron-right text-xs" />
              </>
            ) : (
              <span className="inline-flex items-center justify-center w-6 h-6 border border-primaryColor/60 rounded-full">
                <i className="fa-solid fa-chevron-right text-xs text-primaryColor" />
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Movies List */}
      <div className="px-4">
        <div className="flex md:grid md:grid-cols-3 lg:grid-cols-6 gap-3 lg:gap-4 overflow-x-auto md:overflow-x-visible scrollbar-hide md:scrollbar-default pb-2 md:pb-0">
          {continueWatchingData.map((item) => {
            const title = item.title || item.movie?.name || item.movie?.title || "Không có tiêu đề";
            const engTitle = item.englishTitle || item.movie?.englishTitle;
            const duration = item.durationMinutes || Math.floor((item.duration || 0) / 60) || 0;
            const progressMinutes = Math.round(((item.progress || 0) / 100) * duration);
            const poster = item.poster || item.movie?.poster_url || item.movie?.thumb_url || "";

            return (
              <div
                key={`${item.movieId || item.id}-${item.lastWatchedEpisode || 0}`}
                className="bg-[#10121b] rounded-2xl p-1 sm:p-3 shadow-lg border border-white/5 cursor-pointer hover:border-primaryColor/60 hover:opacity-60 transition-all duration-300 flex-shrink-0 w-[140px] md:w-auto md:flex-shrink"
                onClick={() => handleMovieClick(item)}
              >
                <div className="relative rounded-2xl overflow-hidden">
                  {poster ? (
                    <OptimizedImage
                      src={poster}
                      alt={title}
                      className="w-full aspect-[2/3] object-cover"
                      sizeKey="CARD_DETAIL"
                    />
                  ) : (
                    <div className="w-full aspect-[2/3] bg-gray-800 flex items-center justify-center">
                      <i className="fa-solid fa-image text-gray-600 text-4xl" />
                    </div>
                  )}
                  <button
                    onClick={(e) => handleDeleteProgress(e, item)}
                    className="absolute top-3 right-3 bg-black/60 hover:bg-red-600 text-white text-[10px] px-2 py-1 rounded-full transition-colors z-10"
                    aria-label="Xóa khỏi danh sách xem tiếp"
                    title="Xóa khỏi danh sách xem tiếp"
                  >
                    <i className="fa-solid fa-xmark" />
                  </button>
                  <div className="absolute bottom-0 left-4 right-4 h-1.5 bg-white/15 rounded-full">
                    <div
                      className="h-full bg-primaryColor rounded-full"
                      style={{ width: `${Math.min(Math.max(item.progress || 0, 0), 100)}%` }}
                    />
                  </div>
                </div>
                <div className="mt-3 text-center">
                  <p className="text-[10px] text-gray-400 mb-1">
                    Tập {item.lastWatchedEpisode || 1} · {progressMinutes}m / {duration}m
                  </p>
                  <h3 className="text-white text-sm font-semibold line-clamp-2">{title}</h3>
                  {engTitle && <p className="text-gray-400 text-xs line-clamp-1">{engTitle}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default ContinueWatching;
