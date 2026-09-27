import React from "react";
import { useParams } from "react-router-dom";
import { MobileLayout, DesktopLayout } from "components/movie-detail/index";
import { PageSpinner } from "components/common/LoadingState";
import ErrorState from "components/common/ErrorState";
import ResumePromptModal from "components/movie-detail/ResumePromptModal";
import useMovieDetail from "hooks/useMovieDetail";

const MovieDetail = () => {
  const { id } = useParams();
  const {
    movie,
    loading,
    error,
    activeTab,
    setActiveTab,
    audioType,
    setAudioType,
    savedProgress,
    showResumeModal,
    setShowResumeModal,
  } = useMovieDetail(id);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-dvh bg-bgColor text-white flex items-center justify-center">
        <PageSpinner />
      </div>
    );
  }

  // Error state
  if (error || !movie) {
    return <ErrorState message={error || "Không tìm thấy phim"} />;
  }

  // Shared props for both layouts
  const layoutProps = {
    movie,
    activeTab,
    setActiveTab,
    audioType,
    onAudioTypeChange: setAudioType,
  };

  return (
    <div className="min-h-dvh bg-bgColor overflow-x-hidden">
      {/* Mobile Layout */}
      <MobileLayout {...layoutProps} />

      {/* Desktop Layout */}
      <DesktopLayout {...layoutProps} />

      {/* Resume Prompt Modal */}
      <ResumePromptModal
        isOpen={showResumeModal}
        onClose={() => setShowResumeModal(false)}
        savedProgress={savedProgress}
        movie={movie}
        audioType={audioType}
      />
    </div>
  );
};

export default MovieDetail;
