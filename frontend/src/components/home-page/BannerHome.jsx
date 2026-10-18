import React, { useState, useEffect, useRef } from "react";
import { BannerContent, BannerBackground, useBannerConfig } from "components/banner/index";
import movieService from "services/movie.service";
import { PageSpinner } from "components/common/LoadingState";
import { preloadImages } from "utils/imagePreloader";
import OptimizedImage from "components/common/OptimizedImage";
import useToast from "hooks/useToast";
import ToastContainer from "components/common/ToastContainer";
import { useNavigate } from "react-router-dom";

/**
 * Banner Home Component - Main hero banner for homepage
 * @param {Object} props
 * @param {Object} props.movie - Movie data (optional, fetches trending if not provided)
 */
const BannerHome = ({ movie }) => {
  const [movies, setMovies] = useState(movie ? [movie] : []);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(!movie);
  const [randomBackgrounds, setRandomBackgrounds] = useState({});
  const timerRef = useRef(null);
  const { toasts, removeToast, success, warning } = useToast();
  const navigate = useNavigate();

  /**
   * Get random background image from movie's backdrops or backgroundImage
   * Uses sessionStorage to cache the random selection for the session
   * @param {Object} movieData - Movie data
   * @returns {string} Random background URL
   */
  const getRandomBackground = (movieData) => {
    const cacheKey = `banner_bg_${movieData.id}`;

    // Check if we already have a cached random background for this session
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      return cached;
    }

    const availableImages = [];

    // Add backgroundImage if exists
    if (movieData.backgroundImage) {
      availableImages.push(movieData.backgroundImage);
    }

    // Add all backdrops if exists
    if (movieData.images?.backdrops && Array.isArray(movieData.images.backdrops)) {
      availableImages.push(...movieData.images.backdrops);
    }

    // Fallback to poster if no images available
    if (availableImages.length === 0) {
      return movieData.poster || "";
    }

    // Return random image from available images
    const randomIndex = Math.floor(Math.random() * availableImages.length);
    const selectedImage = availableImages[randomIndex];

    // Cache the selection for this session
    sessionStorage.setItem(cacheKey, selectedImage);

    return selectedImage;
  };

  useEffect(() => {
    // If no movie prop provided, fetch up to 5 trending movies
    if (!movie) {
      const fetchBannerMovies = async () => {
        try {
          setLoading(true);
          const response = await movieService.getTrending(6, { featured: true });
          const list = response?.data || [];
          const moviesData = Array.isArray(list) ? list.slice(0, 6) : [];

          if (moviesData.length === 0) {
            setMovies([]);
            return;
          }

          // Generate random backgrounds for each movie (uses sessionStorage cache)
          const backgrounds = {};
          moviesData.forEach((m) => {
            backgrounds[m.id] = getRandomBackground(m);
          });

          // OPTIMIZATION: Start preloading IMMEDIATELY (don't wait for setState)
          const selectedImages = Object.values(backgrounds).filter(Boolean);

          // Start preload in parallel (fire and forget)
          if (selectedImages.length > 0) {
            preloadImages(selectedImages, { batchSize: 5 })
              .then(() => {
                console.log("✅ Priority images loaded");

                // Preload remaining images in background
                const allBackgroundImages = moviesData
                  .flatMap((m) => {
                    const images = [];
                    if (m.backgroundImage) images.push(m.backgroundImage);
                    if (m.images?.backdrops && Array.isArray(m.images.backdrops)) {
                      images.push(...m.images.backdrops);
                    }
                    return images;
                  })
                  .filter(Boolean);

                const remainingImages = allBackgroundImages.filter(
                  (img) => !selectedImages.includes(img)
                );

                if (remainingImages.length > 0) {
                  preloadImages(remainingImages, { batchSize: 3 }).catch((err) => {
                    console.warn("Failed to preload remaining banner images:", err);
                  });
                }
              })
              .catch((err) => {
                console.warn("Failed to preload priority banner images:", err);
              });
          }

          // Update state immediately (parallel with preload)
          setMovies(moviesData);
          setCurrentIndex(0);
          setRandomBackgrounds(backgrounds);
        } catch (error) {
          console.error("Error fetching banner movies:", error);
          setMovies([]);
        } finally {
          setLoading(false);
        }
      };
      fetchBannerMovies();
    } else {
      setMovies([movie]);
      setCurrentIndex(0);
      setLoading(false);
      // Generate random background for single movie (uses sessionStorage cache)
      const backgrounds = {};
      backgrounds[movie.id] = getRandomBackground(movie);
      setRandomBackgrounds(backgrounds);
    }
  }, [movie]);

  // Auto-rotate banner every 15s
  useEffect(() => {
    if (!movies || movies.length <= 1) return;

    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    timerRef.current = setInterval(() => {
      setCurrentIndex((prev) => {
        const next = prev + 1;
        return next >= movies.length ? 0 : next;
      });
    }, 10000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [movies, currentIndex]);

  const handleSelectMovie = (index) => {
    // Chọn phim mới, effect ở trên sẽ reset lại interval dựa trên currentIndex
    setCurrentIndex(index);
  };

  // Generate configuration using custom hook - MUST be called before any early returns
  // Use fallback empty object to ensure hooks are always called
  const currentMovie = movies[currentIndex] || null;
  const { infoBadges, actionButtons } = useBannerConfig(currentMovie || {}, success, warning);

  const handleBannerClick = (e) => {
    // Bỏ qua click nếu người dùng đang bấm vào các nút chức năng (button, link) bên trong
    if (e.target.closest("button") || e.target.closest("a")) {
      return;
    }
    navigate(`/movie/${currentMovie.id}`);
  };

  // Show loading state if no movie data
  if (loading || !currentMovie) {
    return (
      <section className="relative w-full overflow-hidden z-0 mt-[var(--app-header-total-height)] md:mt-0 h-[400px] md:h-[600px] flex items-center justify-center">
        <PageSpinner />
      </section>
    );
  }

  return (
    <section
      className="relative w-full overflow-hidden z-0 mt-[var(--app-header-total-height)] md:mt-0 h-[350px] sm:h-[450px] md:h-[600px] lg:h-[700px] 3xl:h-[950px] cursor-pointer"
      onClick={handleBannerClick}
    >
      {/* Background with gradients */}
      <BannerBackground
        backgroundImage={
          randomBackgrounds[currentMovie.id] || currentMovie.backgroundImage || currentMovie.poster
        }
        fallbackSrcs={[
          currentMovie.backgroundImage,
          currentMovie.poster,
          ...(currentMovie.images?.backdrops || []),
          currentMovie.thumb_url,
          currentMovie.poster_url,
        ]}
        title={currentMovie.title}
      />
      <div className="halloween-flashlight" aria-hidden="true" />

      {/* Main content */}
      <BannerContent
        movieData={currentMovie}
        infoBadges={infoBadges}
        actionButtons={actionButtons}
      />

      {/* Right-bottom poster strip selector (desktop only) */}
      {movies.length > 1 && (
        <div className="hidden md:flex gap-3 absolute right-4 bottom-6 z-20">
          {movies.map((m, index) => {
            const isActive = index === currentIndex;
            return (
              <button
                key={m.id || index}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelectMovie(index);
                }}
                className={`relative rounded-md overflow-hidden transition-transform duration-200 ${
                  isActive ? "scale-105 ring-2 ring-primaryColor" : "hover:scale-105"
                }`}
              >
                <OptimizedImage
                  src={m.poster}
                  fallbackSrcs={[m.backgroundImage, m.thumb_url, m.poster_url]}
                  alt={m.title}
                  className="w-14 h-20 lg:w-16 lg:h-24 object-cover"
                  priority={index === 0}
                  lazy={false}
                  preloadOnHover={false}
                  size="70"
                  quality="80"
                />
                {isActive && <div className="absolute inset-0 bg-black/20 pointer-events-none" />}
              </button>
            );
          })}
        </div>
      )}

      {/* Bottom circular poster selector (mobile only) */}
      {movies.length > 1 && (
        <div className="flex md:hidden gap-3 absolute bottom-6 left-1/2 sm:left-3/4 -translate-x-1/2 z-[100]">
          {movies.map((m, index) => {
            const isActive = index === currentIndex;
            return (
              <button
                key={`mob-${m.id || index}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelectMovie(index);
                }}
                className={`relative w-8 h-8 sm:w-10 sm:h-10 shrink-0 rounded-full overflow-hidden transition-all duration-200 bg-black/50 ${
                  isActive
                    ? "scale-110 ring-2 ring-primaryColor shadow-[0_0_10px_rgba(var(--primary-rgb),0.5)]"
                    : "opacity-60 hover:opacity-100"
                }`}
              >
                <OptimizedImage
                  src={m.poster}
                  fallbackSrcs={[m.poster_url, m.thumb_url, m.backgroundImage]}
                  alt={m.title}
                  className="w-full h-full object-cover rounded-full"
                  priority={index === 0}
                  lazy={false}
                  preloadOnHover={false}
                  size="40"
                  quality="80"
                />
                {isActive && (
                  <div className="absolute inset-0 bg-black/10 pointer-events-none rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      )}

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </section>
  );
};

export default BannerHome;
