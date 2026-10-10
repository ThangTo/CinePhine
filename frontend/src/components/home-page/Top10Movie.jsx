import React, { useState, useEffect } from "react";
import SectionHeader from "components/common/SectionHeader";
import ScrollContainer from "components/common/ScrollContainer";
import Top10Card from "components/top-movie/Top10Card";
import movieService from "services/movie.service";
import { BarSpinner } from "components/common/LoadingState";
import { preloadMovieImages } from "utils/imagePreloader";

/**
 * Top 10 Movies Section
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
        // Fetch more movies to ensure we have enough after filtering
        const response = await movieService.getTopRated(100);
        let moviesData = response.data || [];

        // Filter by type if specified
        if (type === "single") {
          // Phim lẻ: totalEpisodes = 1
          moviesData = moviesData.filter((movie) => movie.totalEpisodes === 1);
        } else if (type === "series") {
          // Phim bộ: totalEpisodes > 1
          moviesData = moviesData.filter((movie) => movie.totalEpisodes > 1);
        }

        // Limit to top 10 after filtering
        moviesData = moviesData.slice(0, 10);
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
