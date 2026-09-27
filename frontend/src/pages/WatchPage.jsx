import React, { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, useParams, useSearchParams, useLocation } from "react-router-dom";
import VideoPlayer from "components/watch-page/VideoPlayer";
import ActionBar from "components/watch-page/ActionBar";
import RatingSidebar from "components/watch-page/RatingSidebar";
import EpisodesSection from "components/movie-detail/EpisodesSection";
import CommentsSection from "components/movie-detail/CommentsSection";
import MovieInfoBrief from "components/watch-page/MovieInfoBrief";
import { fetchMovieById, fetchEpisodes } from "services/movie.service";
import { enrichMovieWithSeriesParts } from "utils/seriesGrouping";
import { getYouTubeEmbedUrl } from "utils/videoUtils";
import {
  countUniqueEpisodes,
  findEpisodeVariant,
  getEpisodeNumber,
  pickPreferredAudioType,
} from "utils/episodeSelection";
import movieService from "services/movie.service";
import { PageSpinner } from "components/common/LoadingState";
import CastSection from "components/movie-detail/CastSection";
import RecommendationsSection from "components/general/RecommendationsSection";

const WatchPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const episodeParam = parseInt(searchParams.get("ep") || "1", 10);
  const audioParam = searchParams.get("audio") || null;
  const resumeTime = location.state?.resumeTime !== undefined ? location.state.resumeTime : null;
  const startFromBeginning = location.state?.startFromBeginning || false;

  const [movie, setMovie] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [activeEp, setActiveEp] = useState(episodeParam);
  const [loading, setLoading] = useState(true);
  const [audioType, setAudioType] = useState(null);
  const viewCountedRef = useRef(false);
  const viewHistoryIdRef = useRef(null);

  useEffect(() => {
    viewCountedRef.current = false;
    viewHistoryIdRef.current = null;
  }, [id, episodeParam, audioType]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [m, eps] = await Promise.all([fetchMovieById(id), fetchEpisodes(id)]);
        // Handle response format: could be direct object/array or wrapped in { data }
        const baseMovie = m?.data || m;
        const enrichedMovie = await enrichMovieWithSeriesParts(baseMovie);
        setMovie(enrichedMovie);
        const episodesData = eps?.data || eps || [];
        const normalizedEpisodes = Array.isArray(episodesData) ? episodesData : [];

        console.log("🎬 [WatchPage] Episodes loaded:", {
          count: normalizedEpisodes.length,
          firstEpisode: normalizedEpisodes[0],
          hasThumbnails:
            normalizedEpisodes[0]?.thumbnail_vtt && normalizedEpisodes[0]?.thumbnail_sprite,
        });

        setEpisodes(normalizedEpisodes);

        // Prefer URL audio, then the best available variant from episode data.
        const initialAudio = audioParam || pickPreferredAudioType(normalizedEpisodes);
        setAudioType(initialAudio);
      } catch (error) {
        console.error("Error loading movie:", error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, audioParam]);

  // Chỉ tăng view khi user thực sự ấn Play (callback từ VideoPlayer)
  const handleFirstPlay = useCallback(async () => {
    if (viewCountedRef.current) return;
    try {
      let epId = null;
      if (movie && episodes && episodes.length > 0) {
        const isTrailer = movie.isHidden || !movie.currentEpisode || movie.currentEpisode === 0;
        if (!isTrailer) {
          const match = findEpisodeVariant(episodes, activeEp, audioType);
          epId = match?._id || match?.id;
        }
      }

      const result = await movieService.incrementView(id, epId);
      viewCountedRef.current = true;
      // Lưu viewHistoryId để dùng cho heartbeat watch-time
      if (result?.viewHistoryId) {
        viewHistoryIdRef.current = result.viewHistoryId;
      }
    } catch (error) {
      console.error("Error incrementing view count:", error);
    }
  }, [id, movie, episodes, activeEp, audioType]);

  useEffect(() => {
    setActiveEp(episodeParam);
  }, [episodeParam]);

  const handleEpisodeChange = (episodeNumber, nextAudioType) => {
    // episodeNumber can be either episode.episode or episode.id (for backward compatibility)
    const effectiveAudio = nextAudioType ?? audioType;
    const audioQuery = effectiveAudio ? `&audio=${encodeURIComponent(effectiveAudio)}` : "";
    navigate(`/watch/${id}?ep=${episodeNumber}${audioQuery}`);
  };

  if (loading) {
    return (
      <div className="min-h-dvh bg-bgColor text-white flex items-center justify-center">
        <PageSpinner />
      </div>
    );
  }

  if (!movie) {
    return (
      <div className="min-h-dvh bg-bgColor text-white flex items-center justify-center">
        <div className="text-xl">Không tìm thấy phim</div>
      </div>
    );
  }

  // Find episode by episode number (not id)
  // Backend returns: { id: ObjectId, episode: episodeId (number), ... }
  // For hidden movies or movies lacking playable episodes, create a fake episode with trailer
  const isTrailerOnly = movie.isHidden || !movie.currentEpisode || movie.currentEpisode === 0;
  
  const currentEpisode = isTrailerOnly
    ? {
        episode: 1,
        episodeId: 1,
        link_embed: getYouTubeEmbedUrl(movie.trailer_url || movie.trailerUrl || movie.trailer),
        videoUrl: getYouTubeEmbedUrl(movie.trailer_url || movie.trailerUrl || movie.trailer),
      }
    : findEpisodeVariant(episodes, activeEp, audioType);

  const totalPlayableEpisodes = movie.totalEpisodes || countUniqueEpisodes(episodes);
  const commentEpisodeId = isTrailerOnly ? null : getEpisodeNumber(currentEpisode);

  console.log("🎬 [WatchPage] Current episode:", {
    activeEp,
    currentEpisode,
    hasThumbnails: currentEpisode?.thumbnail_vtt && currentEpisode?.thumbnail_sprite,
  });

  return (
    <div className="min-h-dvh bg-bgColor">
      {/* Top Bar */}
      <div
        className="w-full px-2"
        style={{ paddingTop: "calc(var(--app-header-total-height) + 0.75rem)" }}
      >
        <div className="container mx-auto flex items-center gap-3 text-white">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <i className="fa-solid fa-chevron-left text-lg" />
          </button>
          <h1 className="text-base md:text-lg font-semibold truncate">
            Xem phim <span className="text-primaryColor">{movie.title}</span>
          </h1>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-2 py-3 md:py-6">
        <div className="flex lg:grid flex-col lg:grid-cols-12 gap-4 md:gap-6">
          {/* Video Player - Full width on all screens */}
          <div className="lg:col-span-12 w-full">
            <VideoPlayer
              movie={movie}
              episode={currentEpisode}
              onEpisodeChange={handleEpisodeChange}
              totalEpisodes={totalPlayableEpisodes}
              audioType={audioType}
              onAudioTypeChange={setAudioType}
              resumeTime={startFromBeginning ? 0 : resumeTime}
              onFirstPlay={handleFirstPlay}
              viewHistoryIdRef={viewHistoryIdRef}
            />

            {/* Action Bar - Only favorite and add buttons */}
            <ActionBar movie={movie} />
          </div>

          {/* Desktop Layout: Left column (Movie Info + Episodes + Comments) */}
          <div className="lg:col-span-8 flex flex-col">
            {/* Movie Info Brief - Hidden on md and below */}
            <div className="hidden lg:block">
              <MovieInfoBrief movie={movie} activeEp={activeEp} />
            </div>

            {/* Episodes Section - Hidden for hidden/trailer-only movies */}
            {!isTrailerOnly && (
              <EpisodesSection
                movie={{ ...movie, episodes: episodes }}
                activeEpisode={activeEp}
                onEpisodeClick={handleEpisodeChange}
                audioType={audioType}
                onAudioTypeChange={setAudioType}
                onPartChange={(partLabel) => {
                  if (!movie?.seriesParts || !Array.isArray(movie.seriesParts)) return;
                  const match = partLabel.match(/Phần\s*(\d+)/i);
                  const partNumber = match ? parseInt(match[1], 10) : 1;
                  const target = movie.seriesParts.find((p) => p.partNumber === partNumber);
                  if (!target) return;

                  const audioQuery = audioType ? `&audio=${encodeURIComponent(audioType)}` : "";
                  navigate(`/watch/${target.id}?ep=1${audioQuery}`);
                }}
              />
            )}

            {/* Comments - constrained to left grid column on desktop */}
            <div className="hidden lg:block mt-6">
              <CommentsSection movie={movie} episodeId={commentEpisodeId} />
            </div>
          </div>

          {/* Desktop Layout: Right Sidebar (Rating + Cast) */}
          <div className="hidden lg:block lg:col-span-4 pl-6 border-l-2 border-borderColor">
            <div className="gap-8 flex flex-col">
              <RatingSidebar movie={movie} />
              <CastSection movie={movie} layout="vertical" />
              <RecommendationsSection movie={movie} />
            </div>
          </div>

          {/* Mobile/Tablet Layout: Rating + Cast below Episodes (sm and below) */}
          <div className="lg:hidden w-full space-y-6 mt-6 ">
            <RatingSidebar movie={movie} />
            <CastSection movie={movie} layout="vertical" />
            <RecommendationsSection movie={movie} />
          </div>

          {/* Mobile/Tablet Comments below rating & cast */}
          <div className="lg:hidden w-full mt-6">
            <CommentsSection movie={movie} episodeId={commentEpisodeId} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default WatchPage;
