import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "contexts/AuthContext";
import SectionHeader from "components/common/SectionHeader";
import ScrollContainer from "components/common/ScrollContainer";
import MovieCard from "components/home-page/MovieCard";
import movieService from "services/movie.service";
import { BarSpinner } from "components/common/LoadingState";
import { preloadCriticalImages } from "utils/imagePreloader";
import { groupSeriesMovies } from "utils/seriesGrouping";
import { slugify } from "utils/slugify";
import EmptyState from "components/common/EmptyState";

/**
 * Movie section with horizontal scrolling for ALL screen sizes
 * @param {Object} props
 * @param {string} props.title - Section title
 * @param {string} props.subtitle - Section subtitle (optional)
 * @param {Array} props.movies - Array of movie objects (optional, fetches from API if not provided)
 * @param {string} props.sectionType - Type of section: 'trending' | 'topRated' | 'newReleases' | 'forYou'
 * @param {string} props.linkHref - Optional "View all" link
 * @param {'single'|'series'|null} typeMovies - Filter by movie type: 'single' for phim lẻ, 'series' for phim bộ
 * @param {string|null} genre - Filter by genre name (e.g., 'Hành Động', 'Tình Cảm')
 */
const SectionRow = ({
  title,
  subtitle,
  movies,
  sectionType = "trending",
  linkHref = "#",
  typeMovies = null,
  genre = null,
  isActive = false,
}) => {
  const { user } = useAuth();
  const [allMovies, setAllMovies] = useState(movies || []);
  const [loading, setLoading] = useState(!movies);
  const [error, setError] = useState(false);
  const normalizedGenre = genre ? slugify(genre) : null;
  
  // Đưa useRef ra ngoài block useEffect
  const isMountedRef = React.useRef(true);

  // Helper function to filter movies (memoized with useCallback)
  const filterMovies = useCallback(
    (moviesList) => {
      let filtered = moviesList;

      // Filter by type if specified
      if (typeMovies === "single") {
        filtered = filtered.filter((movie) => movie.totalEpisodes === 1);
      } else if (typeMovies === "series") {
        filtered = filtered.filter((movie) => movie.totalEpisodes > 1);
      }

      // Filter by genre if specified
      if (normalizedGenre) {
        filtered = filtered.filter((movie) => {
          const genres = movie.genres || movie.categories || [];
          // Normalize genre labels to slug for comparison
          const normalizedMovieGenres = genres
            .map((g) => {
              if (typeof g === "string") return slugify(g);
              if (typeof g === "object") return slugify(g.name || g.label || "");
              return "";
            })
            .filter(Boolean);

          return normalizedMovieGenres.includes(normalizedGenre);
        });
      }

      // Group multi-part series into single card with parts metadata
      filtered = groupSeriesMovies(filtered);

      return filtered;
    },
    [typeMovies, normalizedGenre]
  );

  // Đưa fetchMovies ra ngoài useEffect
  const fetchMovies = useCallback(async () => {
    try {
      if (isMountedRef.current) {
        setLoading(true);
        setError(false);
      }
      let response;
      // Ranked lists filter by type on the server; genre rows still filter client-side
      const fetchLimit = normalizedGenre ? 100 : 30;
      const typeParams = { type: typeMovies || undefined };

      // If genre is specified, use getByGenre API for better performance
      if (normalizedGenre) {
        response = await movieService.getByGenre(normalizedGenre, { limit: fetchLimit });
      } else {
        switch (sectionType) {
          case "trending":
            response = await movieService.getTrending(fetchLimit, typeParams);
            break;
          case "topRated":
            response = await movieService.getTopRated(fetchLimit, typeParams);
            break;
          case "newReleases":
            response = await movieService.getNewReleases(fetchLimit, typeParams);
            break;
          case "forYou":
            response = await movieService.getForYou(fetchLimit);
            break;
          default:
            response = await movieService.getAll({ limit: fetchLimit });
        }
      }

      let moviesData = response.data || [];

      // Apply filters
      moviesData = filterMovies(moviesData);

      if (isMountedRef.current) {
        setAllMovies(moviesData);

        // Preload critical images (first 15 movies) in background
        if (moviesData.length > 0) {
          preloadCriticalImages(moviesData).catch((err) => {
            console.warn("Failed to preload some images:", err);
          });
        }
      }
    } catch (err) {
      console.error(`Error fetching ${sectionType} movies:`, err);
      if (isMountedRef.current) {
        setAllMovies([]);
        setError(true);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [sectionType, typeMovies, normalizedGenre, filterMovies]);

  useEffect(() => {
    isMountedRef.current = true; // Track if component is mounted

    // If movies prop is provided, use it directly (but still filter if needed)
    if (movies) {
      const filteredMovies = filterMovies(movies);
      if (isMountedRef.current) {
        setAllMovies(filteredMovies);
        setLoading(false);
        setError(false);
      }
      return;
    }

    fetchMovies();

    // Cleanup function
    return () => {
      isMountedRef.current = false;
    };
  }, [movies, filterMovies, fetchMovies]);

  const displayMovies = allMovies;

  // Don't render forYou section if user is not logged in (check AFTER all hooks)
  if (sectionType === "forYou" && !user) {
    return null;
  }

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
          <SectionHeader title={title} subtitle={subtitle} linkHref={linkHref} isActive={isActive} />
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

  // Don't render if no movies (for forYou section)
  if (sectionType === "forYou" && displayMovies.length === 0) {
    return null;
  }

  return (
    <section className="w-full py-2 sm:py-6 overflow-visible">
      <div className="px-6">
        <SectionHeader title={title} subtitle={subtitle} linkHref={linkHref} isActive={isActive} />
      </div>

      {/* Mobile: Horizontal Scroll */}
      <div className="lg:hidden pl-4">
        <ScrollContainer gap="gap-2" showArrows={false}>
          {displayMovies.map((movie) => (
            <div key={movie.id} className="flex-shrink-0 w-[150px] sm:w-[160px]">
              <MovieCard movie={movie} />
            </div>
          ))}
        </ScrollContainer>
      </div>

      {/* Desktop: Horizontal scroll with arrows - 6 movies visible at once */}
      <div className="hidden lg:block lg:-mt-4">
        <div className="max-w-[1920px] mx-auto">
          <div className="relative px-4">
            <ScrollContainer gap="gap-3" showArrows={true}>
              {displayMovies.map((movie, index) => (
                <div
                  key={movie.id}
                  className="flex-shrink-0"
                  style={{
                    // 6 cards with 5 gaps (gap-3 = 0.75rem = 12px each)
                    // (100% - 5 * 12px) / 6 = width per card
                    width: "calc((100% - 60px) / 6)",
                    maxWidth: "300px",
                  }}
                >
                  <MovieCard movie={movie} />
                </div>
              ))}
            </ScrollContainer>
          </div>
        </div>
      </div>
    </section>
  );
};

export default SectionRow;