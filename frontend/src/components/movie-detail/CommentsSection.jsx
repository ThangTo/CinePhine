import React, { useState, useEffect } from "react";
import CommentInput from "components/movie-detail/comment/CommentInput";
import CommentsList from "components/movie-detail/comment/CommentsList";
import RatingsList from "components/movie-detail/comment/RatingsList";
import useToast from "hooks/useToast";
import useAuth from "hooks/useAuth";
import ToastContainer from "components/common/ToastContainer";
import movieService from "services/movie.service";

// Helper function để tính thời gian đã trôi qua
const getTimeAgo = (date) => {
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);

  if (diffInSeconds < 60) return "Vừa xong";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} phút trước`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} giờ trước`;
  if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)} ngày trước`;
  if (diffInSeconds < 31536000) return `${Math.floor(diffInSeconds / 2592000)} tháng trước`;
  return `${Math.floor(diffInSeconds / 31536000)} năm trước`;
};

// Helper function để format comment từ backend
// userId được truyền vào để lưu trạng thái theo từng user
const formatComment = (comment, currentUserId = null) => {
  const timeAgo = comment.createdAt ? getTimeAgo(new Date(comment.createdAt)) : "Vừa xong";

  // Lấy trạng thái like/dislike từ localStorage theo userId
  const likedComments = getLikedComments(currentUserId);
  const dislikedComments = getDislikedComments(currentUserId);
  const isLiked = likedComments.includes(comment.id);
  const isDisliked = dislikedComments.includes(comment.id);

  return {
    ...comment,
    time: timeAgo,
    dislikes: comment.dislikes || 0,
    isLiked,
    isDisliked,
    // Giữ lại userId để check owner
    userId: comment.userId || comment.userId?._id || comment.userId?.id,
  };
};

// Helper functions để quản lý liked/disliked comments trong localStorage theo userId
const getLikedComments = (userId) => {
  if (!userId) return [];
  try {
    const stored = localStorage.getItem(`likedComments_${userId}`);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const getDislikedComments = (userId) => {
  if (!userId) return [];
  try {
    const stored = localStorage.getItem(`dislikedComments_${userId}`);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const setLikedComment = (commentId, isLiked, userId) => {
  if (!userId) return;
  const liked = getLikedComments(userId);
  if (isLiked) {
    if (!liked.includes(commentId)) {
      liked.push(commentId);
      localStorage.setItem(`likedComments_${userId}`, JSON.stringify(liked));
    }
  } else {
    const filtered = liked.filter((id) => id !== commentId);
    localStorage.setItem(`likedComments_${userId}`, JSON.stringify(filtered));
  }
};

const setDislikedComment = (commentId, isDisliked, userId) => {
  if (!userId) return;
  const disliked = getDislikedComments(userId);
  if (isDisliked) {
    if (!disliked.includes(commentId)) {
      disliked.push(commentId);
      localStorage.setItem(`dislikedComments_${userId}`, JSON.stringify(disliked));
    }
  } else {
    const filtered = disliked.filter((id) => id !== commentId);
    localStorage.setItem(`dislikedComments_${userId}`, JSON.stringify(filtered));
  }
};

const CommentsSection = ({ movie, episodeId = null, className = "" }) => {
  const [activeView, setActiveView] = useState("comments"); // "comments" or "ratings"
  const [commentText, setCommentText] = useState("");
  const [isSpoiler, setIsSpoiler] = useState(false);
  const [showAllComments, setShowAllComments] = useState(false);
  const [comments, setComments] = useState(movie?.comments || []);
  const [ratings, setRatings] = useState([]);
  const [loadingRatings, setLoadingRatings] = useState(false);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const { toasts, removeToast, success, warning } = useToast();
  const { isAuthenticated, openAuthModal, user } = useAuth();

  // Fetch comments if not provided in movie prop
  useEffect(() => {
    const fetchComments = async () => {
      if (!movie?.id || movie.comments) return;
      try {
        const response = await movieService.getComments(movie.id);
        const commentsData = response.data || [];
        // Format comments để match với frontend format (load từ localStorage theo userId)
        const userId = user?._id || user?.id || null;
        const formattedComments = commentsData.map((comment) => formatComment(comment, userId));
        setComments(formattedComments);
      } catch (error) {
        console.error("Error fetching comments:", error);
        setComments([]);
      } finally {
      }
    };
    fetchComments();
  }, [movie, user]);

  // Fetch ratings when switching to ratings view
  useEffect(() => {
    const fetchRatings = async () => {
      if (!movie?.id || activeView !== "ratings" || ratings.length > 0) return;
      try {
        setLoadingRatings(true);
        const response = await movieService.getRatings(movie.id);
        const ratingsData = response.data || [];
        setRatings(ratingsData);
      } catch (error) {
        console.error("Error fetching ratings:", error);
        setRatings([]);
      } finally {
        setLoadingRatings(false);
      }
    };
    fetchRatings();
  }, [movie?.id, activeView, ratings.length]);

  const handleSubmitComment = async () => {
    // Prevent spam: disable if already submitting
    if (isSubmittingComment) {
      return;
    }

    if (!isAuthenticated) {
      openAuthModal("login");
      return;
    }
    if (!commentText.trim()) {
      warning("Vui lòng nhập nội dung bình luận!");
      return;
    }

    // Set submitting state to prevent multiple submissions
    setIsSubmittingComment(true);

    try {
      const response = await movieService.postComment(movie.id, {
        content: commentText,
        isSpoiler,
        ...(Number.isInteger(episodeId) && episodeId > 0 ? { episodeId } : {}),
      });
      const userId = user?._id || user?.id || null;
      const newComment = formatComment(response.data || response, userId);
      setComments((prev) => [newComment, ...prev]);
      success("Bình luận của bạn đã được gửi!");
      setCommentText("");
      setIsSpoiler(false);
    } catch (error) {
      warning(error.message || "Không thể gửi bình luận. Vui lòng thử lại!");
      console.error("Error posting comment:", error);
    } finally {
      // Always reset submitting state
      setIsSubmittingComment(false);
    }
  };

  const handleLike = async (commentId) => {
    if (!isAuthenticated) {
      openAuthModal("login");
      return;
    }

    const userId = user?._id || user?.id || null;
    if (!userId) {
      warning("Không thể xác định người dùng. Vui lòng đăng nhập lại!");
      return;
    }

    // Lấy trạng thái hiện tại từ state
    const comment = comments.find((c) => c.id === commentId);
    const isCurrentlyLiked = comment?.isLiked || false;
    const isCurrentlyDisliked = comment?.isDisliked || false;

    console.log("[Frontend] Like comment:", {
      commentId,
      userId,
      isCurrentlyLiked,
      isCurrentlyDisliked,
    });

    try {
      const response = await movieService.likeComment(
        commentId,
        isCurrentlyLiked,
        isCurrentlyDisliked
      );
      console.log("[Frontend] Like response:", response);

      // Cập nhật localStorage theo userId
      if (isCurrentlyLiked) {
        // Bỏ like
        setLikedComment(commentId, false, userId);
      } else {
        // Thêm like
        setLikedComment(commentId, true, userId);
        // Nếu đang dislike, bỏ dislike
        if (isCurrentlyDisliked) {
          setDislikedComment(commentId, false, userId);
        }
      }

      // Cập nhật comment trong state
      setComments((prev) =>
        prev.map((comment) =>
          comment.id === commentId
            ? {
                ...comment,
                likes: response.likes,
                dislikes: response.dislikes,
                isLiked: !isCurrentlyLiked,
                isDisliked: isCurrentlyDisliked ? false : comment.isDisliked,
              }
            : comment
        )
      );
      success(response.message || "Đã like bình luận!");
    } catch (error) {
      console.error("[Frontend] Error liking comment:", error);
      console.error("[Frontend] Error details:", {
        status: error.status,
        message: error.message,
        raw: error.raw,
      });
      warning(error.message || "Không thể like bình luận. Vui lòng thử lại!");
    }
  };

  const handleDislike = async (commentId) => {
    if (!isAuthenticated) {
      openAuthModal("login");
      return;
    }

    const userId = user?._id || user?.id || null;
    if (!userId) {
      warning("Không thể xác định người dùng. Vui lòng đăng nhập lại!");
      return;
    }

    // Lấy trạng thái hiện tại từ state
    const comment = comments.find((c) => c.id === commentId);
    const isCurrentlyDisliked = comment?.isDisliked || false;
    const isCurrentlyLiked = comment?.isLiked || false;

    try {
      const response = await movieService.dislikeComment(
        commentId,
        isCurrentlyDisliked,
        isCurrentlyLiked
      );

      // Cập nhật localStorage theo userId
      if (isCurrentlyDisliked) {
        // Bỏ dislike
        setDislikedComment(commentId, false, userId);
      } else {
        // Thêm dislike
        setDislikedComment(commentId, true, userId);
        // Nếu đang like, bỏ like
        if (isCurrentlyLiked) {
          setLikedComment(commentId, false, userId);
        }
      }

      // Cập nhật comment trong state
      setComments((prev) =>
        prev.map((comment) =>
          comment.id === commentId
            ? {
                ...comment,
                likes: response.likes,
                dislikes: response.dislikes,
                isDisliked: !isCurrentlyDisliked,
                isLiked: isCurrentlyLiked ? false : comment.isLiked,
              }
            : comment
        )
      );
      success(response.message || "Đã dislike bình luận!");
    } catch (error) {
      warning(error.message || "Không thể dislike bình luận. Vui lòng thử lại!");
      console.error("Error disliking comment:", error);
    }
  };

  const handleReply = (commentId) => {
    if (!isAuthenticated) {
      openAuthModal("login");
      return;
    }
    warning("Chức năng trả lời đang được phát triển!");
  };

  const handleMore = (commentId) => {
    if (!isAuthenticated) {
      openAuthModal("login");
      return;
    }
    warning("Thêm tùy chọn...");
  };

  const handleDelete = async (commentId) => {
    if (!isAuthenticated) {
      openAuthModal("login");
      return;
    }

    // ConfirmDialog đã được xử lý trong CommentItem component
    // Không cần window.confirm() ở đây nữa
    try {
      await movieService.deleteComment(commentId);
      // Xóa comment khỏi state
      setComments((prev) => prev.filter((comment) => comment.id !== commentId));
      success("Đã xóa bình luận!");
    } catch (error) {
      warning(error.message || "Không thể xóa bình luận. Vui lòng thử lại!");
      console.error("Error deleting comment:", error);
    }
  };

  // Limit comments to 10 initially
  const displayedComments = showAllComments ? comments : comments.slice(0, 10);

  const hasMoreComments = comments.length > 10;

  return (
    <>
      <section className={`px-4 py-16 lg:py-8 ${className}`}>
        {/* Header - Toggle Buttons */}
        <div className="mb-6">
          {/* Mobile: Full width buttons */}
          <div className="flex lg:hidden items-center gap-2">
            <button
              onClick={() => setActiveView("comments")}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-all ${
                activeView === "comments"
                  ? "bg-bgColor3 text-white border-2 border-white/20"
                  : "bg-bgColor/50 text-gray-400 border-2 border-transparent"
              }`}
            >
              <i className="fa-solid fa-comment" />
              <span>Bình luận ({comments.length})</span>
            </button>

            <button
              onClick={() => setActiveView("ratings")}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-all ${
                activeView === "ratings"
                  ? "bg-bgColor3 text-white border-2 border-white/20"
                  : "bg-bgColor/50 text-gray-400 border-2 border-transparent"
              }`}
            >
              <i className="fa-solid fa-star" />
              <span>Đánh giá</span>
            </button>
          </div>

          {/* Desktop: Compact toggle */}
          <div className="hidden lg:flex items-center gap-4">
            <div className="flex items-center gap-2">
              <i className="fa-solid fa-comment text-2xl text-white" />
              <span className="text-2xl font-semibold text-white">Bình luận</span>
              <span className="text-2xl font-semibold text-white">({comments.length})</span>
            </div>
            <div className="inline-flex items-center bg-bgColor rounded-lg p-1 border border-white/10">
              <button
                onClick={() => setActiveView("comments")}
                className={`px-2 py-1 rounded-md font-medium transition-all text-sm ${
                  activeView === "comments"
                    ? "bg-gray-700 text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                Bình luận
              </button>
              <button
                onClick={() => setActiveView("ratings")}
                className={`px-2 py-1 rounded-md font-medium transition-all text-sm ${
                  activeView === "ratings"
                    ? "bg-gray-700 text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                Đánh giá
              </button>
            </div>
          </div>
        </div>

        {/* Comment Input */}
        {activeView === "comments" && (
          <CommentInput
            commentText={commentText}
            setCommentText={setCommentText}
            isSpoiler={isSpoiler}
            setIsSpoiler={setIsSpoiler}
            onSubmit={handleSubmitComment}
            isAuthenticated={isAuthenticated}
            onOpenAuth={openAuthModal}
            isSubmitting={isSubmittingComment}
          />
        )}

        {/* Comments List */}
        {activeView === "comments" && (
          <CommentsList
            comments={displayedComments}
            onLike={handleLike}
            onDislike={handleDislike}
            onReply={handleReply}
            onMore={handleMore}
            onDelete={handleDelete}
            currentUserId={user?._id || user?.id || null}
            showAll={showAllComments}
            onShowMore={() => setShowAllComments(true)}
            hasMore={hasMoreComments}
            className="pt-4 lg:pt-0 space-y-2"
          />
        )}

        {/* Ratings View */}
        {activeView === "ratings" && (
          <div className="pt-4 lg:pt-0">
            {loadingRatings ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primaryColor"></div>
                <p className="text-gray-400 mt-4">Đang tải đánh giá...</p>
              </div>
            ) : (
              <RatingsList ratings={ratings} />
            )}
          </div>
        )}
      </section>

      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </>
  );
};

export default CommentsSection;
