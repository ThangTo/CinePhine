import React, { useEffect, useMemo, useState } from "react";
import useAuth from "hooks/useAuth";
import userService from "services/user.service";
import { BarSpinner } from "components/common/LoadingState";

const LIMIT = 20;

const REASON_LABELS = {
  quest_reward: "Thưởng nhiệm vụ",
  quest_reward_auto: "Tự nhận thưởng nhiệm vụ",
  quest_bonus: "Bonus hoàn thành nhiệm vụ",
  quest_bonus_auto: "Tự nhận bonus nhiệm vụ",
  payment_success: "Nạp coin thành công",
  premium_upgrade: "Nâng cấp Premium",
  cursor_purchase: "Mua hiệu ứng con trỏ",
  halloween_fortune: "Kẹo Tiên Tri Halloween",
  admin_add_coin: "Cộng coin thủ công",
  admin_adjustment: "Điều chỉnh coin thủ công",
};

const formatDelta = (value) => {
  const absValue = Math.abs(value || 0).toLocaleString("vi-VN");
  return `${value >= 0 ? "+" : "-"}${absValue}`;
};

const formatDateTime = (value) => {
  if (!value) return "--";

  return new Date(value).toLocaleString("vi-VN", {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getReasonLabel = (reason) => REASON_LABELS[reason] || "Biến động coin";

const CoinHistoryTab = () => {
  const { user } = useAuth();
  const [history, setHistory] = useState({
    entries: [],
    total: 0,
    totalPages: 1,
    page: 1,
    limit: LIMIT,
  });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const paymentStatus = useMemo(() => {
    const search = new URLSearchParams(window.location.search);
    if (search.get("success")) {
      return {
        type: "success",
        message: "Thanh toán thành công. Coin đã được cộng vào tài khoản.",
      };
    }
    if (search.get("canceled")) {
      return {
        type: "error",
        message: "Thanh toán chưa hoàn tất hoặc đã bị hủy.",
      };
    }
    return null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      setLoading(true);
      setError("");

      try {
        const result = await userService.getCoinHistory({ page, limit: LIMIT });
        if (!cancelled) {
          setHistory({
            entries: result?.entries || [],
            total: result?.total || 0,
            totalPages: result?.totalPages || 1,
            page: result?.page || page,
            limit: result?.limit || LIMIT,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || "Không thể tải lịch sử coin.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadHistory();

    return () => {
      cancelled = true;
    };
  }, [page]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <BarSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-account-border bg-account-bg-secondary p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-account-text-secondary">
            Số dư hiện tại
          </p>
          <div className="mt-3 flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primaryColor/15 text-primaryColor">
              <i className="fa-solid fa-coins" />
            </span>
            <div>
              <p className="text-2xl font-bold text-account-text-primary">
                {(user?.coin || 0).toLocaleString("vi-VN")}
              </p>
              <p className="text-sm text-account-text-secondary">Coin khả dụng</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-account-border bg-account-bg-secondary p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-account-text-secondary">
            Tổng giao dịch
          </p>
          <p className="mt-4 text-3xl font-bold text-account-text-primary">
            {(history.total || 0).toLocaleString("vi-VN")}
          </p>
          <p className="mt-2 text-sm text-account-text-secondary">
            Bao gồm mọi lần cộng và trừ coin
          </p>
        </div>

        <div className="rounded-2xl border border-account-border bg-account-bg-secondary p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-account-text-secondary">
            Trang hiện tại
          </p>
          <p className="mt-4 text-3xl font-bold text-account-text-primary">
            {history.page}/{history.totalPages}
          </p>
          <p className="mt-2 text-sm text-account-text-secondary">
            Mỗi trang hiển thị tối đa {history.limit} giao dịch
          </p>
        </div>
      </div>

      {paymentStatus && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-medium ${
            paymentStatus.type === "success"
              ? "border-green-500/40 bg-green-500/10 text-green-300"
              : "border-red-500/40 bg-red-500/10 text-red-300"
          }`}
        >
          {paymentStatus.message}
        </div>
      )}

      {error ? (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      <div className="rounded-[28px] border border-account-border bg-account-bg-secondary p-3 md:p-4">
        {history.entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-account-text-secondary">
            <i className="fa-solid fa-receipt mb-4 text-4xl opacity-40" />
            <p className="text-lg font-semibold text-account-text-primary">Chưa có lịch sử coin</p>
            <p className="mt-2 max-w-md text-sm">
              Khi bạn nhận thưởng nhiệm vụ, nạp coin, mua hiệu ứng hoặc nâng cấp Premium, mọi biến
              động sẽ xuất hiện ở đây.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {history.entries.map((entry) => {
              const isPositive = entry.delta >= 0;

              return (
                <article
                  key={entry._id}
                  className="rounded-2xl border border-account-border bg-account-bg-primary/70 p-4"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center rounded-full bg-account-bg-tertiary px-3 py-1 text-xs font-semibold text-account-text-primary">
                          {getReasonLabel(entry.reason)}
                        </span>
                        <span className="text-xs text-account-text-secondary">
                          {formatDateTime(entry.createdAt)}
                        </span>
                      </div>
                      <p className="mt-3 text-sm font-medium text-account-text-primary">
                        {entry.note || getReasonLabel(entry.reason)}
                      </p>
                      <div className="mt-4 grid grid-cols-1 gap-3 text-sm text-account-text-secondary md:grid-cols-3">
                        <div className="rounded-2xl bg-account-bg-secondary px-3 py-2">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-account-text-secondary/75">
                            Trước giao dịch
                          </p>
                          <p className="mt-1 font-semibold text-account-text-primary">
                            {(entry.balanceBefore || 0).toLocaleString("vi-VN")} coin
                          </p>
                        </div>
                        <div className="rounded-2xl bg-account-bg-secondary px-3 py-2">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-account-text-secondary/75">
                            Biến động
                          </p>
                          <p
                            className={`mt-1 font-semibold ${
                              isPositive ? "text-green-400" : "text-red-400"
                            }`}
                          >
                            {formatDelta(entry.delta)} coin
                          </p>
                        </div>
                        <div className="rounded-2xl bg-account-bg-secondary px-3 py-2">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-account-text-secondary/75">
                            Sau giao dịch
                          </p>
                          <p className="mt-1 font-semibold text-account-text-primary">
                            {(entry.balanceAfter || 0).toLocaleString("vi-VN")} coin
                          </p>
                        </div>
                      </div>
                    </div>

                    <div
                      className={`inline-flex shrink-0 items-center justify-center rounded-2xl px-4 py-3 text-lg font-bold ${
                        isPositive ? "bg-green-500/12 text-green-300" : "bg-red-500/12 text-red-300"
                      }`}
                    >
                      {formatDelta(entry.delta)}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {history.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
            disabled={history.page <= 1}
            className="inline-flex items-center gap-2 rounded-xl border border-account-border bg-account-bg-secondary px-4 py-2 text-sm font-semibold text-account-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <i className="fa-solid fa-arrow-left" />
            Trang trước
          </button>
          <button
            type="button"
            onClick={() => setPage((prev) => Math.min(prev + 1, history.totalPages))}
            disabled={history.page >= history.totalPages}
            className="inline-flex items-center gap-2 rounded-xl bg-primaryColor px-4 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            Trang sau
            <i className="fa-solid fa-arrow-right" />
          </button>
        </div>
      )}
    </div>
  );
};

export default CoinHistoryTab;
