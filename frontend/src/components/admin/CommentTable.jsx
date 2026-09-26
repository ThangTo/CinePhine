import React, { useState, useEffect } from "react";
import { commentAPI } from "services/admin.service";
import { BarSpinner } from "components/common/LoadingState";
import ConfirmDialog from "components/common/ConfirmDialog";
import PaginationV2 from "components/common/PaginationV2";
// Import Icons
import {
  FiCheck,
  FiTrash2,
  FiEyeOff,
  FiAlertCircle,
  FiMessageSquare,
  FiUser,
  FiClock,
} from "react-icons/fi";

const CommentTable = () => {
  const [comments, setComments] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedCommentId, setSelectedCommentId] = useState(null);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalItems: 0,
    limit: 10,
  });

  const loadComments = async (page = 1, status = "all") => {
    setIsLoading(true);
    try {
      const response = await commentAPI.getAll({
        page,
        limit: 10,
        status: status !== "all" ? status : undefined,
      });
      if (response && response.data) {
        setComments(response.data);
        setPagination({
          currentPage: response.pagination.page,
          totalPages: response.pagination.totalPages,
          totalItems: response.pagination.totalItems,
          limit: response.pagination.limit,
        });
      }
    } catch (err) {
      console.error("API Error", err);
      setError("Không thể tải danh sách bình luận");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadComments(1, filterStatus);
  }, [filterStatus]);

  const handleStatusUpdate = async (id, newStatus) => {
    // Optimistic UI Update
    if (filterStatus === "pending") {
      setComments((prev) => prev.filter((c) => c.id !== id));
    } else {
      setComments((prev) =>
        prev.map((c) => {
          if (c.id !== id) return c;

          if (newStatus === "allowed") {
            return { ...c, status: newStatus, flag: null, reason: null };
          }
          return { ...c, status: newStatus };
        })
      );
    }

    try {
      await commentAPI.updateStatus(id, newStatus);
    } catch (err) {
      setError("Không thể cập nhật trạng thái: " + err.message);
      // Revert on error by reloading to ensure data consistency
      loadComments(pagination.currentPage, filterStatus);
    }
  };

  const handleDeleteClick = (id) => {
    setSelectedCommentId(id);
    setIsDeleteModalOpen(true);
  };

  const handleDelete = async () => {
    if (!selectedCommentId) return;

    setIsDeleteModalOpen(false);

    // Optimistic UI Update
    setComments((prev) => prev.filter((c) => c.id !== selectedCommentId));

    try {
      await commentAPI.delete(selectedCommentId);
      setSelectedCommentId(null);
    } catch (err) {
      setError("Không thể xóa bình luận: " + err.message);
      // Revert on error
      loadComments(pagination.currentPage, filterStatus);
      setSelectedCommentId(null);
    }
  };

  // Helper: Tạo avatar từ tên user
  const getInitials = (name) => {
    return name ? name.charAt(0).toUpperCase() : "?";
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return { date: "N/A", time: "N/A" };

    const date = new Date(dateString);

    // Format to UTC+7 (Asia/Ho_Chi_Minh)
    const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    const timeFormatter = new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      minute: "2-digit",
      // second: '2-digit', // Optional, maybe keep it simple or match previous
      hour12: false,
    });

    return {
      date: dateFormatter.format(date),
      time: timeFormatter.format(date),
    };
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
      banned: "bg-red-500/10 text-red-500 border-red-500/20",
      dismissed: "bg-gray-500/10 text-gray-400 border-gray-500/20",
      allowed: "bg-green-500/10 text-green-500 border-green-500/20",
    };

    const labels = {
      pending: "Chờ duyệt",
      banned: "Đã chặn",
      dismissed: "Đã ẩn",
      allowed: "Hoạt động",
    };

    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${
          styles[status] || styles.dismissed
        }`}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            status === "allowed"
              ? "bg-green-500"
              : status === "pending"
              ? "bg-yellow-500"
              : "bg-current"
          }`}
        ></span>
        {labels[status] || status}
      </span>
    );
  };

  return (
    <div className="bg-[#1a1a1a] rounded-2xl border border-white/5 shadow-xl flex flex-col h-full">
      {/* --- HEADER & FILTERS --- */}
      <div className="p-5 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <FiMessageSquare className="text-primaryColor" />
          Quản lý Bình luận
        </h2>

        <div className="flex bg-black/20 p-1 rounded-lg border border-white/5">
          {[
            { id: "all", label: "Tất cả" },
            { id: "pending", label: "Chờ duyệt" },
            // { id: "allowed", label: "Đã duyệt" }, // Hidden per requirement
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterStatus(tab.id)}
              className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
                filterStatus === tab.id
                  ? "bg-white/10 text-white shadow-sm"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* --- ERROR MESSAGE --- */}
      {error && (
        <div className="mx-5 mt-5 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-2">
            <FiAlertCircle />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="hover:text-white transition-colors">
            ✕
          </button>
        </div>
      )}

      {/* --- TABLE CONTENT --- */}
      <div className="flex-1 overflow-x-auto custom-scrollbar">
        <table className="w-full text-left border-collapse min-w-[500px] sm:min-w-full">
          <thead className="bg-white/[0.02] border-b border-white/5">
            <tr>
              <th className="px-4 py-3 sm:px-6 sm:py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                Nội dung / Lý do
              </th>
              <th className="px-4 py-3 sm:px-6 sm:py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                Người dùng
              </th>
              <th className="px-4 py-3 sm:px-6 sm:py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider text-center hidden md:table-cell">
                Trạng thái
              </th>
              <th className="px-4 py-3 sm:px-6 sm:py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                Thời gian
              </th>
              <th className="px-4 py-3 sm:px-6 sm:py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider text-right w-[120px]">
                Hành động
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-white/5">
            {isLoading && comments.length === 0 ? (
              <tr>
                <td colSpan="5" className="py-20 text-center">
                  <BarSpinner />
                </td>
              </tr>
            ) : comments.length === 0 ? (
              <tr>
                <td colSpan="5" className="py-16 text-center text-gray-500">
                  <div className="flex flex-col items-center justify-center w-full h-full">
                    <FiMessageSquare className="text-4xl mb-3 opacity-20" />
                    Không có dữ liệu
                  </div>
                </td>
              </tr>
            ) : (
              comments.map((comment) => (
                <tr key={comment.id} className="group hover:bg-white/[0.02] transition-colors">
                  {/* Cột Nội Dung */}
                  <td className="px-4 py-3 sm:px-6 sm:py-4 max-w-[200px] sm:max-w-sm">
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-2 sm:hidden mb-1">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center border border-white/10 text-[9px] font-bold text-white shrink-0">
                          {getInitials(comment.user.name)}
                        </div>
                        <span className="text-xs font-medium text-gray-300 truncate">{comment.user.name}</span>
                      </div>
                      <p
                        className="text-sm text-gray-200 line-clamp-2 sm:line-clamp-3 leading-relaxed"
                        title={comment.fullContent}
                      >
                        {comment.content}
                      </p>
                      <p className="text-xs text-gray-400 break-words">
                        <span className="text-gray-500">Phim: </span>
                        {comment.movieName || "Không xác định"}
                        {comment.episodeId != null && (
                          <span> · Tập {comment.episodeId}</span>
                        )}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        {comment.flag && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded">
                            <FiAlertCircle className="w-3 h-3" /> Flag: {comment.flag}
                          </span>
                        )}
                        {comment.reason && (
                          <span className="text-[10px] sm:text-xs text-gray-500 italic flex items-center gap-1">
                            • Lý do: {comment.reason}
                          </span>
                        )}
                        
                        {/* Mobile only Status & Time */}
                        <div className="flex md:hidden items-center gap-2 w-full mt-1">
                          {getStatusBadge(comment.status)}
                          <span className="text-[9px] text-gray-500 lg:hidden">
                            {formatDateTime(comment.createdAt).date}
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Cột Người Dùng */}
                  <td className="px-4 py-3 sm:px-6 sm:py-4 hidden sm:table-cell">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center border border-white/10 text-xs font-bold text-white">
                        {getInitials(comment.user.name)}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-white">{comment.user.name}</span>
                        <span className="text-[10px] text-gray-500 uppercase flex items-center gap-1">
                          <FiUser className="w-2.5 h-2.5" /> {comment.user.role}
                        </span>
                      </div>
                    </div>
                  </td>

                  {/* Cột Trạng Thái */}
                  <td className="px-4 py-3 sm:px-6 sm:py-4 text-center hidden md:table-cell">
                    {getStatusBadge(comment.status)}
                  </td>

                  {/* Cột Thời Gian */}
                  <td className="px-4 py-3 sm:px-6 sm:py-4 hidden lg:table-cell">
                    <div className="flex flex-col text-xs text-gray-400">
                      <span className="text-gray-300 font-medium">
                        {formatDateTime(comment.createdAt).date}
                      </span>
                      <span className="flex items-center gap-1 mt-0.5">
                        <FiClock className="w-3 h-3" /> {formatDateTime(comment.createdAt).time}
                      </span>
                    </div>
                  </td>

                  {/* Cột Hành Động (Icons) */}
                  <td className="px-4 py-3 sm:px-6 sm:py-4 text-right">
                    <div className="flex flex-wrap sm:flex-nowrap items-center justify-end gap-1 opacity-100 sm:opacity-80 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleStatusUpdate(comment.id, "allowed")}
                        title="Chấp nhận"
                        className="p-2 rounded-lg text-green-500 hover:bg-green-500/10 sm:hover:scale-110 transition-all flex-1 sm:flex-none flex justify-center"
                      >
                        <FiCheck size={18} />
                      </button>

                      <button
                        onClick={() => handleStatusUpdate(comment.id, "dismissed")}
                        title="Ẩn bình luận"
                        className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 sm:hover:scale-110 transition-all flex-1 sm:flex-none flex justify-center"
                      >
                        <FiEyeOff size={18} />
                      </button>

                      <div className="w-px h-4 bg-white/10 mx-1 hidden sm:block"></div>

                      <button
                        onClick={() => handleDeleteClick(comment.id)}
                        title="Xóa vĩnh viễn"
                        className="p-2 rounded-lg text-red-500 hover:bg-red-500/10 sm:hover:scale-110 transition-all flex-1 sm:flex-none flex justify-center"
                      >
                        <FiTrash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* --- FOOTER / PAGINATION --- */}
      <div className="p-4 border-t border-white/5 flex items-center justify-between bg-white/[0.01]">
        <div className="text-xs text-gray-500">
          Hiển thị <span className="text-white font-bold">{comments.length}</span> trên tổng{" "}
          <span className="text-white font-bold">{pagination.totalItems}</span> bình luận
        </div>

        <PaginationV2
          page={pagination.currentPage}
          totalPages={pagination.totalPages}
          onPageChange={(newPage) => loadComments(newPage, filterStatus)}
        />
      </div>

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setSelectedCommentId(null);
        }}
        onConfirm={handleDelete}
        title="Xóa Bình Luận"
        message="Bạn có chắc chắn muốn xóa bình luận này vĩnh viễn? Hành động này không thể hoàn tác."
        confirmText="Xóa ngay"
        cancelText="Hủy bỏ"
        isDanger={true}
      />
    </div>
  );
};

export default CommentTable;
