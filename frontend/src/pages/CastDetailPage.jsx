import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { PageSpinner } from "components/common/LoadingState";
import ErrorState from "components/common/ErrorState";
import OptimizedImage from "components/common/OptimizedImage";
import MovieCard from "components/home-page/MovieCard";
import PaginationV2 from "components/common/PaginationV2";
import { Select } from "components/common";
import castService from "services/cast.service";
import { formatDate, isLatinName } from "utils/ultils";

const CastDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [cast, setCast] = useState(null);
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({
    page: 1,
    totalPages: 1,
    total: 0,
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [sort, setSort] = useState("year");

  useEffect(() => {
    const fetchCastDetails = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await castService.getCastDetails(id, {
          page: currentPage,
          limit: 20,
          sort,
        });

        setCast(response.cast);
        setMovies(response.movies || []);
        setPagination(response.pagination || { page: 1, totalPages: 1, total: 0 });
      } catch (err) {
        console.error("Error fetching cast details:", err);
        setError(err.message || "Không thể tải thông tin diễn viên");
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchCastDetails();
    }
  }, [id, currentPage, sort]);

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSortChange = (newSort) => {
    setSort(newSort);
    setCurrentPage(1);
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-dvh bg-bgColor text-white flex items-center justify-center">
        <PageSpinner />
      </div>
    );
  }

  // Error state
  if (error || !cast) {
    return <ErrorState message={error || "Không tìm thấy diễn viên"} />;
  }

  // Hiển thị tên: ưu tiên nameLatin nếu name không phải Latin
  const displayName = isLatinName(cast.name) ? cast.name : cast.nameLatin || cast.name;

  // Component hiển thị thông tin nhỏ (Label - Value) để tái sử dụng
  const InfoItem = ({ label, value }) => (
    <div className="pb-3 border-b border-white/5 last:border-0 last:pb-0">
      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">{label}</h3>
      <p className="text-sm text-gray-200 font-medium">{value}</p>
    </div>
  );

  return (
    <div className="min-h-dvh bg-bgColor text-white pb-12 pt-[calc(var(--app-header-total-height)+1rem)] lg:pt-20">
      {/* Background decoration (optional gradient glow) */}
      <div className="fixed top-0 left-0 w-full h-96 bg-gradient-to-b from-primaryColor/10 to-transparent pointer-events-none z-0" />

      <div className="container mx-auto px-4 relative z-10">
        <button
          onClick={() => navigate(-1)}
          className="group fixed top-[calc(var(--app-header-total-height)+0.75rem)] left-4 lg:left-4 lg:top-16 z-50 flex items-center gap-2 px-4 py-2.5 bg-white/10 backdrop-blur-md rounded-full border border-white/20 hover:border-primaryColor/50 hover:bg-white/15 transition-all duration-300 shadow-lg hover:shadow-primaryColor/20"
          aria-label="Quay lại"
        >
          <i className="fa-solid fa-arrow-left text-white group-hover:text-primaryColor transition-colors duration-300 text-sm"></i>
          {/* <span className="text-sm font-medium text-white group-hover:text-primaryColor transition-colors duration-300 hidden sm:block">
          Quay lại
        </span> */}
        </button>
        {/* Back Button */}
        {/* --- Mobile Layout --- */}
        <div className="lg:hidden">
          {/* Cast Info Card */}
          <div className="bg-white/5 backdrop-blur-md rounded-3xl p-6 mb-8 border border-white/10 shadow-xl">
            <div className="flex flex-col items-center mb-6">
              <div className="relative w-36 h-36 rounded-full overflow-hidden mb-4 ring-2 ring-primaryColor/50 shadow-2xl">
                <OptimizedImage
                  src={cast.profileUrl || cast.profilePath || ""}
                  alt={displayName}
                  className="w-full h-full object-cover"
                  sizeKey="CARD"
                />
              </div>
              <h1 className="text-3xl font-bold text-center mb-1 bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
                {displayName}
              </h1>
              {cast.nameLatin && cast.nameLatin !== displayName && (
                <p className="text-gray-500 text-sm font-medium">{cast.name}</p>
              )}
            </div>

            {/* Cast Details Mobile */}
            <div className="space-y-4 bg-black/20 rounded-xl p-4">
              {cast.biography && (
                <div>
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                    Tiểu sử
                  </h3>
                  <p className="text-sm text-gray-300 line-clamp-4 leading-relaxed">
                    {cast.biography}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 pt-2">
                {cast.birthday && <InfoItem label="Ngày sinh" value={formatDate(cast.birthday)} />}
                {cast.place_of_birth && <InfoItem label="Nơi sinh" value={cast.place_of_birth} />}
                {cast.knownForDepartment && (
                  <InfoItem label="Nghề nghiệp" value={cast.knownForDepartment} />
                )}
              </div>
            </div>
          </div>

          {/* Movies Section Mobile */}
          <div>
            <div className="flex flex-col gap-4 mb-6">
              <h2 className="text-2xl font-bold border-l-4 border-primaryColor pl-3">
                Phim đã tham gia
              </h2>
              <div className="w-full">
                <Select
                  value={sort}
                  onChange={handleSortChange}
                  options={[
                    { value: "year", label: "Mới nhất" },
                    { value: "rating", label: "Đánh giá cao" },
                    { value: "views", label: "Lượt xem" },
                  ]}
                  width="w-full"
                  size="sm"
                  bgColor="bg-white/5"
                  bgDropdown="bg-[#1a1a1a]"
                />
              </div>
            </div>

            {movies.length === 0 ? (
              <div className="text-center py-16 bg-white/5 rounded-2xl border border-dashed border-white/10">
                <p className="text-gray-400">Chưa có dữ liệu phim</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
                  {movies.map((movie) => (
                    <MovieCard key={movie.id} movie={movie} />
                  ))}
                </div>
                {pagination.totalPages > 1 && (
                  <PaginationV2
                    page={currentPage}
                    totalPages={pagination.totalPages}
                    onPageChange={handlePageChange}
                    isMobile={true}
                  />
                )}
              </>
            )}
          </div>
        </div>

        {/* --- Desktop Layout --- */}
        <div className="hidden lg:grid lg:grid-cols-12 gap-10">
          {/* Sidebar - Cast Info (Col 3/12) */}
          <div className="lg:col-span-3 xl:col-span-3">
            <div className="sticky top-24">
              <div className="bg-white/5 backdrop-blur-md rounded-3xl p-6 border border-white/10 shadow-2xl overflow-hidden relative">
                {/* Decorative Glow inside card */}
                <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-white/5 to-transparent z-0" />

                {/* Cast Avatar */}
                <div className="relative z-10 flex flex-col items-center mb-4">
                  <div className="relative w-full aspect-[3/4] rounded-2xl overflow-hidden mb-2 shadow-2xl ring-1 ring-primaryColor/50">
                    <OptimizedImage
                      src={cast.profileUrl || cast.profilePath || ""}
                      alt={displayName}
                      className="w-full h-full object-cover transform hover:scale-105 transition-transform duration-500"
                      sizeKey="DETAIL"
                    />
                  </div>
                </div>

                {/* Personal Info Grid */}
                <div className="space-y-4 relative z-10 bg-black/20 rounded-xl p-5">
                  {cast.birthday && (
                    <InfoItem label="Ngày sinh" value={formatDate(cast.birthday)} />
                  )}

                  {cast.place_of_birth && <InfoItem label="Nơi sinh" value={cast.place_of_birth} />}

                  {cast.knownForDepartment && (
                    <InfoItem
                      label="Nghề nghiệp"
                      value={cast.knownForDepartment === "Acting" ? "Diễn viên" : "Đạo diễn"}
                    />
                  )}

                  {/* {cast.popularity && (
                    <InfoItem label="Độ nổi tiếng" value={`${cast.popularity.toFixed(0)} điểm`} />
                  )} */}
                </div>
              </div>
            </div>
          </div>

          {/* Main Content (Col 9/12) */}
          <div className="lg:col-span-9 xl:col-span-9">
            <div className="mb-6">
              <h1 className="text-4xl xl:text-5xl font-bold mb-4 leading-tight">{displayName}</h1>
              {cast.nameLatin && cast.nameLatin !== displayName && (
                <p className="text-gray-500 text-sm font-medium">{cast.name}</p>
              )}
            </div>

            {/* Biography Section */}
            {cast.biography && (
              <div className="mb-6 animate-fade-in-up">
                <h2 className="text-2xl font-bold mb-4 flex items-center gap-3">
                  <span className="w-1 h-8 bg-primaryColor rounded-full block"></span>
                  Tiểu sử
                </h2>
                <div className="text-gray-300 leading-8 text-lg font-light">
                  {cast.biography.split("\n").map(
                    (paragraph, idx) =>
                      paragraph && (
                        <p key={idx} className="mb-4 last:mb-0">
                          {paragraph}
                        </p>
                      )
                  )}
                </div>
              </div>
            )}

            {/* Movies List Header */}
            <div className="flex items-center justify-between mb-8 pb-4 border-b border-white/10">
              <div className="flex items-baseline gap-3">
                <i className="fa-solid fa-film text-primaryColor text-xl"></i>
                <h2 className="text-2xl font-bold text-white">Phim tham gia</h2>
                <div className="flex items-center border border-primaryColor/50 rounded-full px-3 py-0.5 bg-white/5">
                  <span className="text-primaryColor font-mono text-lg">
                    {pagination.total || 0}
                  </span>
                </div>
              </div>
              <Select
                value={sort}
                onChange={handleSortChange}
                options={[
                  { value: "year", label: "Năm phát hành" },
                  { value: "rating", label: "Đánh giá cao" },
                  { value: "views", label: "Lượt xem nhiều" },
                ]}
                width="w-52"
                size="md"
                bgColor="bg-white/5"
                bgDropdown="bg-[#1a1a1a]"
              />
            </div>

            {/* Movies Grid */}
            {movies.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 bg-white/5 rounded-3xl border border-dashed border-white/10">
                <span className="text-4xl mb-4 opacity-50">🎬</span>
                <p className="text-gray-400 text-lg">Chưa có phim nào trong danh sách</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-6 mb-10">
                  {movies.map((movie) => (
                    <MovieCard key={movie.id} movie={movie} />
                  ))}
                </div>
                {pagination.totalPages > 1 && (
                  <div className="flex justify-center">
                    <PaginationV2
                      page={currentPage}
                      totalPages={pagination.totalPages}
                      onPageChange={handlePageChange}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CastDetailPage;
