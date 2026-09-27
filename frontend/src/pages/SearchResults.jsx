import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import MovieCard from "components/home-page/MovieCard";
import Pagination from "components/common/Pagination";
import MovieFilter from "components/common/MovieFilter";
import { PageSpinner } from "components/common/LoadingState";
import EmptyState from "components/common/EmptyState";
import ErrorState from "components/common/ErrorState";
import movieService from "services/movie.service";
import { groupSeriesMovies } from "utils/seriesGrouping";
import useScrollToTop from "hooks/useScrollToTop";

const PAGE_SIZE = 25;

const SearchResults = () => {
  const [searchParams] = useSearchParams();
  const query = (searchParams.get("q") || "").trim();

  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({});
  const [pagination, setPagination] = useState({
    page: 1,
    totalPages: 1,
    total: 0,
  });
  const [error, setError] = useState(null);

  useEffect(() => {
    setPage(1);
    setFilters({}); // Reset filters when query changes
  }, [query]);

  // Scroll to top when page changes (not on pathname change, skip initial mount)
  useScrollToTop({
    scrollOnPathname: false,
    dependencies: [page],
    skipInitialMount: true,
  });

  useEffect(() => {
    const fetchResults = async () => {
      if (!query) {
        setMovies([]);
        setPagination({ page: 1, totalPages: 1, total: 0 });
        return;
      }

      setLoading(true);
      setError(null);
      // Don't clear movies here - keep previous data while loading new page

      try {
        // Build params with filters
        const params = {
          page,
          limit: PAGE_SIZE,
          ...(filters.genres?.length && { genres: filters.genres.join(",") }),
          ...(filters.countries?.length && { countries: filters.countries.join(",") }),
          ...(filters.year && { year: filters.year }),
          ...(filters.yearFrom && { yearFrom: filters.yearFrom }),
          ...(filters.yearTo && { yearTo: filters.yearTo }),
          ...(filters.quality && { quality: filters.quality }),
          ...(filters.type && { type: filters.type }),
          ...(filters.ageRating && { ageRating: filters.ageRating }),
          ...(filters.status && { status: filters.status }),
          ...(filters.ratingMin && { ratingMin: filters.ratingMin }),
          ...(filters.ratingMax && { ratingMax: filters.ratingMax }),
          ...(filters.sort && { sort: filters.sort }),
          ...(filters.lang && { lang: filters.lang }),
        };
        const response = await movieService.search(query, params);

        // Validate response format
        if (!response || typeof response !== "object") {
          throw new Error("Invalid response format");
        }

        let moviesData = response?.data;

        // Ensure moviesData is an array
        if (!Array.isArray(moviesData)) {
          moviesData = [];
        }

        const paginationData = response?.pagination || {
          page,
          totalPages: 1,
          total: moviesData.length,
          limit: PAGE_SIZE,
        };

        // Group multi-part series into single card with parts metadata
        moviesData = groupSeriesMovies(moviesData);

        // Ensure groupSeriesMovies returns an array
        if (!Array.isArray(moviesData)) {
          moviesData = [];
        }

        setMovies(moviesData);
        setPagination({
          page: paginationData.page || page,
          totalPages: paginationData.totalPages || 1,
          total: paginationData.total || moviesData.length,
        });
      } catch (err) {
        setError("Không thể tải kết quả tìm kiếm. Vui lòng thử lại sau.");
        // Only clear movies on error if we're on page 1
        if (page === 1) {
          setMovies([]);
          setPagination({ page: 1, totalPages: 1, total: 0 });
        }
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [query, page, filters]);

  const handlePageChange = (newPage) => {
    setPage(newPage);
    // Scroll to top is handled by useEffect when page state changes
  };

  if (!query) {
    return (
      <div className="min-h-dvh bg-bgColor text-white flex items-center justify-center">
        <p className="text-gray-300 text-sm md:text-base">
          Vui lòng nhập từ khóa tìm kiếm ở thanh tìm kiếm phía trên.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-dvh bg-bgColor text-white flex items-center justify-center">
        <PageSpinner />
      </div>
    );
  }

  return (
    <div className="bg-bgColor">
      <main className="w-full mx-auto px-4 pb-20 pt-[calc(var(--app-header-total-height)+1rem)]">
        <h1 className="text-fluid-2xl leading-fluid-tight font-bold text-white mb-6 pl-4">
          Toàn bộ kết quả cho từ khóa <span className="text-primaryColor">&quot;{query}&quot;</span>
        </h1>

        {/* Movie Filter */}
        <div className="mb-6">
          <MovieFilter
            filters={filters}
            onFilterChange={(newFilters) => {
              setFilters(newFilters);
              setPage(1); // Reset to page 1 when filters change
            }}
            options={{
              showAdvanced: true,
              compact: false,
              pageType: "search",
              navigateOnApply: true,
              searchQuery: query,
              defaultCollapsed: true,
            }}
          />
        </div>

        {error ? (
          <ErrorState message={error} />
        ) : movies.length === 0 && !loading && page === 1 ? (
          <EmptyState
            className="min-h-[500px]"
            title="Không tìm thấy kết quả phù hợp"
            message={`Chúng mình không tìm thấy phim nào khớp với từ khóa "${query}". Hãy thử dùng từ khóa khác ngắn gọn hơn, hoặc kiểm tra lại chính tả nhé.`}
            iconClassName="fa-film"
          />
        ) : movies.length === 0 && !loading && page > 1 ? (
          <EmptyState
            className="min-h-[500px]"
            title="Không có dữ liệu"
            message="Trang này không có dữ liệu. Vui lòng quay lại trang trước."
            iconClassName="fa-film"
          />
        ) : (
          <>
            {pagination.totalPages > 1 && (
              <div className="md:hidden">
                <Pagination
                  page={pagination.page}
                  totalPages={pagination.totalPages}
                  onPageChange={handlePageChange}
                  className="mb-6"
                />
              </div>
            )}
            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-1 sm:gap-2 md:gap-4">
              {movies.map((movie) => (
                <MovieCard
                  key={movie.id}
                  movie={movie}
                  hoverVisibleAt="md"
                  hoverCardClass="w-[400px] max-h-[400px] overflow-hidden"
                  compact
                />
              ))}
            </div>
            {pagination.totalPages > 1 && (
              <Pagination
                page={pagination.page}
                totalPages={pagination.totalPages}
                onPageChange={handlePageChange}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default SearchResults;
