import React, { useState, useEffect } from "react";
import SectionHeader from "components/common/SectionHeader";
import ScrollContainer from "components/common/ScrollContainer";
import Top10Card from "components/top-movie/Top10Card";
import movieService from "services/movie.service";
import { BarSpinner } from "components/common/LoadingState";
import { preloadMovieImages } from "utils/imagePreloader";
import { groupSeriesMovies } from "utils/seriesGrouping";

/**
 * Top 10 Movies Section - most watched right now (server trending, filtered by type)
 * Always displays in horizontal scroll layout for all screen sizes
 * @param {string} title - Section title
 * @param {string} linkHref - Link href
 * @param {'single'|'series'|null} type - Filter by movie type: 'single' for phim lẻ, 'series' for phim bộ
 */
const Top10Movie = ({ title, linkHref, type = null }) => {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTop10 = async () => {
      try {
        setLoading(true);
        // Over-fetch so seasons of one show can collapse into a single slot
        const response = await movieService.getTrending(30, { type: type || undefined });
        // totalEpisodes is 0 when no episode is playable right now
        const playable = (response.data || []).filter((movie) => movie.totalEpisodes > 0);
        const moviesData = groupSeriesMovies(playable).slice(0, 10);
        setMovies(moviesData);

        // Preload all top 10 images immediately (they're always visible)
        if (moviesData.length > 0) {
          preloadMovieImages(moviesData, { batchSize: 3 }).catch((err) => {
            console.warn("Failed to preload some images:", err);
          });
        }
      } catch (error) {
        console.error("Error fetching top 10 movies:", error);
        setMovies([]);
      } finally {
        setLoading(false);
      }
    };
    fetchTop10();
  }, [type]);

  if (loading) {
    return (
      <section className="w-full py-2 sm:py-6">
        <SectionHeader title={title} linkHref={linkHref} className="px-6" />
        <BarSpinner className="w-full py-2" />
      </section>
    );
  }

  return (
    <section className="w-full py-2 sm:py-6">
      <SectionHeader title={title} linkHref={linkHref} className="px-6" />

      {/* Horizontal Scroll for ALL screen sizes */}
      <div className="pl-4 sm:px-4 py-1 ">
        <ScrollContainer gap="gap-1 sm:gap-3" showArrows={false}>
          {movies.map((movie, idx) => (
            <Top10Card key={movie.id} movie={movie} rank={idx + 1} />
          ))}
        </ScrollContainer>
      </div>
    </section>
  );
};

export default Top10Movie;
