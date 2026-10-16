import React, { useState, useEffect, useCallback } from "react";
import {
  FiPlus, FiTrash2, FiEdit2, FiSave, FiX,
  FiDollarSign, FiStar, FiCheck, FiAlertCircle, FiLoader,
  FiChevronUp, FiChevronDown, FiRefreshCw,
} from "react-icons/fi";
import { settingsAPI } from "services/admin.service";
import { BarSpinner } from "components/common/LoadingState";

// ─── Shared Toast ───────────────────────────────────────────────────────────
const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div
      className={`fixed top-4 right-4 z-[100] flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-2xl backdrop-blur-md border text-sm font-medium animate-fade-in ${
        type === "success"
          ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
          : "bg-red-500/15 border-red-500/30 text-red-400"
      }`}
    >
      {type === "success" ? <FiCheck size={16} /> : <FiAlertCircle size={16} />}
      {message}
    </div>
  );
};

// ─── Confirm Dialog ──────────────────────────────────────────────────────────
const ConfirmModal = ({ isOpen, onConfirm, onCancel, title, message, confirmLabel = "Xóa", danger = true }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-[#1a1a2e] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-fade-in-up">
        <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
        <p className="text-gray-400 text-sm mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-gray-400 hover:bg-white/5 hover:text-white transition-all text-sm font-medium"
          >
            Hủy
          </button>
          <button
            onClick={onConfirm}
            className={`px-5 py-2 rounded-xl font-bold text-sm transition-all ${
              danger
                ? "bg-red-500 hover:bg-red-600 text-white"
                : "bg-primaryColor hover:opacity-90 text-black"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Coin Package Form Modal ──────────────────────────────────────────────────
const CoinPackageModal = ({ isOpen, onClose, onSave, initial }) => {
  const [form, setForm] = useState({ amount: "", bonus: "0", label: "", price: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initial) {
      setForm({
        amount: String(initial.amount),
        bonus: String(initial.bonus ?? 0),
        label: initial.label || "",
        price: String(initial.price ?? ""),
      });
    } else {
      setForm({ amount: "", bonus: "0", label: "", price: "" });
    }
  }, [initial, isOpen]);

  if (!isOpen) return null;

  const total = (Number(form.amount) || 0) + (Number(form.bonus) || 0);
  const previewLabel = form.label || (form.amount ? `${total} coin` : "");
  const priceVal = Number(form.price) || 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) return;
    if (!form.price || Number(form.price) <= 0) return;
    setSaving(true);
    try {
      await onSave({
        id: initial?.id,
        amount: Number(form.amount),
        bonus: Number(form.bonus) || 0,
        label: previewLabel,
        price: Number(form.price),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#1a1a2e] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl animate-fade-in-up">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-white">
            {initial ? "Sửa gói coin" : "Thêm gói coin"}
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <FiX size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-gray-400 mb-1.5 tracking-wider">
              Số coin <span className="text-red-400">*</span>
            </label>
            <input
              type="number"
              min="1"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-primaryColor transition-all"
              placeholder="VD: 100"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-gray-400 mb-1.5 tracking-wider">
              Coin thưởng thêm
            </label>
            <input
              type="number"
              min="0"
              value={form.bonus}
              onChange={(e) => setForm((f) => ({ ...f, bonus: e.target.value }))}
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-primaryColor transition-all"
              placeholder="VD: 15"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-gray-400 mb-1.5 tracking-wider">
              Giá (VNĐ) <span className="text-red-400">*</span>
            </label>
            <input
              type="number"
              min="1"
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-primaryColor transition-all"
              placeholder="VD: 50000"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-gray-400 mb-1.5 tracking-wider">
              Nhãn hiển thị{" "}
              <span className="normal-case font-normal text-gray-500">(tự động nếu để trống)</span>
            </label>
            <input
              type="text"
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-primaryColor transition-all"
              placeholder={`VD: ${total} coin`}
            />
          </div>

          {/* Preview */}
          {(previewLabel || priceVal) && (
            <div className="bg-primaryColor/10 border border-primaryColor/20 rounded-xl p-3.5 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider">Xem trước</p>
                <p className="text-primaryColor font-bold text-sm">{previewLabel}</p>
              </div>
              {priceVal > 0 && (
                <div className="text-right">
                  <p className="text-xs text-gray-400 uppercase tracking-wider">Giá</p>
                  <p className="text-emerald-400 font-black text-lg">
                    {priceVal.toLocaleString('vi-VN')}₫
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-xl text-gray-400 hover:bg-white/5 hover:text-white transition-all text-sm font-medium border border-white/10"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={saving || !form.amount || Number(form.amount) <= 0 || !form.price || Number(form.price) <= 0}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primaryColor hover:opacity-90 text-black font-bold text-sm transition-all disabled:opacity-40"
            >
              {saving ? <FiLoader size={14} className="animate-spin" /> : <FiSave size={14} />}
              {saving ? "Đang lưu..." : "Lưu"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Premium Plan Form Modal ──────────────────────────────────────────────────
const PremiumPlanModal = ({ isOpen, onClose, onSave, initial }) => {
  const [form, setForm] = useState({ planKey: "", label: "", days: "", coins: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initial) {
      setForm({
        planKey: initial.planKey || "",
        label: initial.label || "",
        days: String(initial.days),
        coins: String(initial.coins),
      });
    } else {
      setForm({ planKey: "", label: "", days: "", coins: "" });
    }
  }, [initial, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.planKey || !form.label || !form.days || !form.coins) return;
    if (Number(form.days) <= 0 || Number(form.coins) <= 0) return;
    setSaving(true);
    try {
      await onSave({
        id: initial?.id,
        planKey: form.planKey.trim().toLowerCase().replace(/\s+/g, "_"),
        label: form.label.trim(),
        days: Number(form.days),
        coins: Number(form.coins),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#1a1a2e] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl animate-fade-in-up">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-white">
            {initial ? "Sửa gói Premium" : "Thêm gói Premium"}
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <FiX size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-gray-400 mb-1.5 tracking-wider">
              Key <span className="text-red-400">*</span>{" "}
              <span className="normal-case font-normal text-gray-500">(duy nhất, không trùng)</span>
            </label>
            <input
              type="text"
              value={form.planKey}
              onChange={(e) => setForm((f) => ({ ...f, planKey: e.target.value }))}
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-primaryColor transition-all font-mono text-sm"
              placeholder="weekly, monthly hoặc yearly"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-gray-400 mb-1.5 tracking-wider">
              Tên gói hiển thị <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-primaryColor transition-all"
              placeholder="VD: Tháng, Năm, VIP Tháng"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-gray-400 mb-1.5 tracking-wider">
                Số ngày <span className="text-red-400">*</span>
              </label>
              <input
                type="number"
                min="1"
                value={form.days}
                onChange={(e) => setForm((f) => ({ ...f, days: e.target.value }))}
                className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-primaryColor transition-all"
                placeholder="VD: 30"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-gray-400 mb-1.5 tracking-wider">
                Giá (coin) <span className="text-red-400">*</span>
              </label>
              <input
                type="number"
                min="1"
                value={form.coins}
                onChange={(e) => setForm((f) => ({ ...f, coins: e.target.value }))}
                className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-primaryColor transition-all"
                placeholder="VD: 100"
                required
              />
            </div>
          </div>

          {/* Preview */}
          {form.label && form.days && form.coins && (
            <div className="bg-primaryColor/10 border border-primaryColor/20 rounded-xl p-3.5 flex items-center gap-2">
              <FiStar className="text-primaryColor shrink-0" />
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider">Xem trước</p>
                <p className="text-primaryColor font-bold text-sm">
                  {form.label} — {form.days} ngày — {form.coins} coin
                </p>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-xl text-gray-400 hover:bg-white/5 hover:text-white transition-all text-sm font-medium border border-white/10"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={
                saving || !form.planKey || !form.label || !form.days || !form.coins ||
                Number(form.days) <= 0 || Number(form.coins) <= 0
              }
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primaryColor hover:opacity-90 text-black font-bold text-sm transition-all disabled:opacity-40"
            >
              {saving ? <FiLoader size={14} className="animate-spin" /> : <FiSave size={14} />}
              {saving ? "Đang lưu..." : "Lưu"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Coin Package Row ─────────────────────────────────────────────────────────
const CoinPackageRow = ({ pkg, index, total, onEdit, onDelete, onMoveUp, onMoveDown }) => (
  <div className="flex items-center gap-3 bg-white/[0.02] hover:bg-white/[0.04] border border-white/5 rounded-xl p-4 transition-all group">
    {/* Drag handle indicator */}
    <div className="flex flex-col gap-0.5 opacity-30 group-hover:opacity-60 transition-opacity">
      <FiChevronUp size={14} className="text-gray-400" />
      <FiChevronDown size={14} className="text-gray-400" />
    </div>

    {/* Order number */}
    <div className="w-7 h-7 rounded-lg bg-primaryColor/15 text-primaryColor text-xs font-bold flex items-center justify-center shrink-0">
      {index + 1}
    </div>

    {/* Label */}
    <div className="flex-1 min-w-0">
      <p className="text-white font-semibold text-sm truncate">{pkg.label}</p>
      <p className="text-gray-500 text-xs mt-0.5">
        {pkg.amount} coin + {pkg.bonus ?? 0} bonus
      </p>
    </div>

    {/* Total */}
    <div className="text-right shrink-0">
      <p className="text-primaryColor font-black text-lg leading-none">
        {pkg.amount + (pkg.bonus ?? 0)}
      </p>
      <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">coin</p>
    </div>

    {/* Price */}
    <div className="text-right shrink-0">
      <p className="text-emerald-400 font-black text-lg leading-none">
        {pkg.price ? Number(pkg.price).toLocaleString('vi-VN') : '—'}₫
      </p>
      <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">VNĐ</p>
    </div>

    {/* Actions */}
    <div className="flex items-center gap-1.5 shrink-0">
      <button
        onClick={() => onMoveUp(index)}
        disabled={index === 0}
        className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-all disabled:opacity-20 disabled:cursor-not-allowed"
        title="Di chuyển lên"
      >
        <FiChevronUp size={16} />
      </button>
      <button
        onClick={() => onMoveDown(index)}
        disabled={index === total - 1}
        className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-all disabled:opacity-20 disabled:cursor-not-allowed"
        title="Di chuyển xuống"
      >
        <FiChevronDown size={16} />
      </button>
      <button
        onClick={() => onEdit(pkg)}
        className="p-2 rounded-lg text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 transition-all"
        title="Sửa"
      >
        <FiEdit2 size={15} />
      </button>
      <button
        onClick={() => onDelete(pkg)}
        className="p-2 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all"
        title="Xóa"
      >
        <FiTrash2 size={15} />
      </button>
    </div>
  </div>
);

// ─── Premium Plan Row ──────────────────────────────────────────────────────────
const PremiumPlanRow = ({ plan, onEdit, onDelete }) => (
  <div className="flex items-center gap-3 bg-white/[0.02] hover:bg-white/[0.04] border border-white/5 rounded-xl p-4 transition-all group">
    {/* Plan badge */}
    <div className="w-10 h-10 rounded-xl bg-yellow-500/15 text-yellow-400 flex items-center justify-center shrink-0">
      <FiStar size={18} />
    </div>

    {/* Info */}
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <p className="text-white font-semibold text-sm">{plan.label}</p>
        <span className="text-[10px] font-mono text-gray-500 bg-black/30 px-1.5 py-0.5 rounded">
          {plan.planKey}
        </span>
      </div>
      <p className="text-gray-500 text-xs mt-0.5">
        {plan.days} ngày
      </p>
    </div>

    {/* Coins price */}
    <div className="text-right shrink-0">
      <p className="text-yellow-400 font-black text-lg leading-none">
        {plan.coins.toLocaleString("vi-VN")}
      </p>
      <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">coin</p>
    </div>

    {/* Actions */}
    <div className="flex items-center gap-1.5 shrink-0">
      <button
        onClick={() => onEdit(plan)}
        className="p-2 rounded-lg text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 transition-all"
        title="Sửa"
      >
        <FiEdit2 size={15} />
      </button>
      <button
        onClick={() => onDelete(plan)}
        className="p-2 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all"
        title="Xóa"
      >
        <FiTrash2 size={15} />
      </button>
    </div>
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────
const SettingsPricingTab = () => {
  const [coinPackages, setCoinPackages] = useState([]);
  const [premiumPlans, setPremiumPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [coinModal, setCoinModal] = useState({ open: false, pkg: null });
  const [planModal, setPlanModal] = useState({ open: false, plan: null });
  const [deleteTarget, setDeleteTarget] = useState({ type: null, item: null });

  // Toast
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [coins, plans] = await Promise.all([
        settingsAPI.getCoinPackages(),
        settingsAPI.getPremiumPlans(),
      ]);
      setCoinPackages(Array.isArray(coins) ? coins : []);
      setPremiumPlans(Array.isArray(plans) ? plans : []);
    } catch (err) {
      showToast("Không thể tải dữ liệu giá", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Coin Package handlers ──────────────────────────────────────────────────

  const handleSaveCoinPkg = async (pkg) => {
    try {
      const updated = await settingsAPI.upsertCoinPackage(pkg);
      setCoinPackages(updated);
      setCoinModal({ open: false, pkg: null });
      showToast(pkg.id ? "Đã cập nhật gói coin" : "Đã thêm gói coin");
    } catch {
      showToast("Lưu gói coin thất bại", "error");
    }
  };

  const handleDeleteCoinPkg = async (pkg) => {
    try {
      const updated = await settingsAPI.deleteCoinPackage(pkg.id);
      setCoinPackages(updated);
      setDeleteTarget({ type: null, item: null });
      showToast("Đã xóa gói coin");
    } catch {
      showToast("Xóa gói coin thất bại", "error");
    }
  };

  const handleMoveCoinPkg = async (index, direction) => {
    const arr = [...coinPackages];
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= arr.length) return;
    [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
    setCoinPackages(arr);
    try {
      const updated = await settingsAPI.reorderCoinPackages(arr.map((p) => p.id));
      setCoinPackages(updated);
    } catch {
      showToast("Lưu thứ tự thất bại", "error");
    }
  };

  // ── Premium Plan handlers ──────────────────────────────────────────────────

  const handleSavePlan = async (plan) => {
    try {
      const updated = await settingsAPI.upsertPremiumPlan(plan);
      setPremiumPlans(updated);
      setPlanModal({ open: false, plan: null });
      showToast(plan.id ? "Đã cập nhật gói Premium" : "Đã thêm gói Premium");
    } catch (err) {
      showToast(err?.response?.data?.message || "Lưu gói Premium thất bại", "error");
    }
  };

  const handleDeletePlan = async (plan) => {
    try {
      const updated = await settingsAPI.deletePremiumPlan(plan.id);
      setPremiumPlans(updated);
      setDeleteTarget({ type: null, item: null });
      showToast("Đã xóa gói Premium");
    } catch {
      showToast("Xóa gói Premium thất bại", "error");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <BarSpinner />
        <p className="text-gray-400 text-sm animate-pulse">Đang tải cấu hình giá...</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto animate-fade-in pb-10">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between border-b border-white/5 pb-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primaryColor/10 rounded-xl text-primaryColor border border-primaryColor/20">
            <FiDollarSign size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Quản Lý Giá</h1>
            <p className="text-gray-400 text-sm mt-1">
              Chỉnh sửa giá coin và các gói Premium.
            </p>
          </div>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 border border-white/10 text-sm font-medium transition-all"
          title="Tải lại"
        >
          <FiRefreshCw size={14} />
          Tải lại
        </button>
      </div>

      {/* ── Coin Packages ─────────────────────────────────────────────── */}
      <section className="mb-12">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FiDollarSign className="text-primaryColor" size={18} />
            <h2 className="text-white font-bold text-base">Gói Coin</h2>
            <span className="text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded-full">
              {coinPackages.length} gói
            </span>
          </div>
          <button
            onClick={() => setCoinModal({ open: true, pkg: null })}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primaryColor hover:opacity-90 text-black font-bold text-sm transition-all"
          >
            <FiPlus size={14} />
            Thêm gói
          </button>
        </div>

        {coinPackages.length === 0 ? (
          <div className="border border-dashed border-white/10 rounded-2xl py-12 flex flex-col items-center text-gray-500">
            <FiDollarSign size={32} className="mb-2 opacity-30" />
            <p className="text-sm">Chưa có gói coin nào.</p>
            <button
              onClick={() => setCoinModal({ open: true, pkg: null })}
              className="mt-3 text-primaryColor text-sm hover:underline"
            >
              Thêm gói đầu tiên
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {coinPackages.map((pkg, i) => (
              <CoinPackageRow
                key={pkg.id}
                pkg={pkg}
                index={i}
                total={coinPackages.length}
                onEdit={(p) => setCoinModal({ open: true, pkg: p })}
                onDelete={(p) => setDeleteTarget({ type: "coin", item: p })}
                onMoveUp={(idx) => handleMoveCoinPkg(idx, -1)}
                onMoveDown={(idx) => handleMoveCoinPkg(idx, 1)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Premium Plans ─────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FiStar className="text-yellow-400" size={18} />
            <h2 className="text-white font-bold text-base">Gói Premium</h2>
            <span className="text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded-full">
              {premiumPlans.length} gói
            </span>
          </div>
          <button
            onClick={() => setPlanModal({ open: true, plan: null })}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-yellow-400 hover:opacity-90 text-black font-bold text-sm transition-all"
          >
            <FiPlus size={14} />
            Thêm gói
          </button>
        </div>

        {premiumPlans.length === 0 ? (
          <div className="border border-dashed border-white/10 rounded-2xl py-12 flex flex-col items-center text-gray-500">
            <FiStar size={32} className="mb-2 opacity-30" />
            <p className="text-sm">Chưa có gói Premium nào.</p>
            <button
              onClick={() => setPlanModal({ open: true, plan: null })}
              className="mt-3 text-yellow-400 text-sm hover:underline"
            >
              Thêm gói đầu tiên
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {premiumPlans.map((plan) => (
              <PremiumPlanRow
                key={plan.id}
                plan={plan}
                onEdit={(p) => setPlanModal({ open: true, plan: p })}
                onDelete={(p) => setDeleteTarget({ type: "plan", item: p })}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Modals ─────────────────────────────────────────────────────── */}

      <CoinPackageModal
        isOpen={coinModal.open}
        initial={coinModal.pkg}
        onClose={() => setCoinModal({ open: false, pkg: null })}
        onSave={handleSaveCoinPkg}
      />

      <PremiumPlanModal
        isOpen={planModal.open}
        initial={planModal.plan}
        onClose={() => setPlanModal({ open: false, plan: null })}
        onSave={handleSavePlan}
      />

      <ConfirmModal
        isOpen={!!deleteTarget.type}
        title={
          deleteTarget.type === "coin"
            ? "Xóa gói coin"
            : "Xóa gói Premium"
        }
        message={
          deleteTarget.type === "coin"
            ? `Xóa gói "${deleteTarget.item?.label}"? Hành động này không thể hoàn tác.`
            : `Xóa gói Premium "${deleteTarget.item?.label}"? Hành động này không thể hoàn tác.`
        }
        onConfirm={() => {
          if (deleteTarget.type === "coin") handleDeleteCoinPkg(deleteTarget.item);
          else handleDeletePlan(deleteTarget.item);
        }}
        onCancel={() => setDeleteTarget({ type: null, item: null })}
      />

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};

export default SettingsPricingTab;
