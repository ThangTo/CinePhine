import React, { useEffect, useState, useRef } from "react";
import cursorEffectService from "services/cursorEffect.service";
import useAuth from "hooks/useAuth";
import { BarSpinner } from "components/common/LoadingState";
import HoverEffectCanvas from "components/account/HoverEffectCanvas";
import { setCursorLocalActive } from "contexts/CursorEffectContext";

// ─── Effect type config ──────────────────────────────────────────────────────

const TYPE_CONFIG = {
  shop: {
    label: "Cửa hàng",
    labelVi: "Cửa hàng",
    badgeClass: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    badgeIcon: "fa-shop",
  },
  premium: {
    label: "Premium",
    labelVi: "Premium",
    badgeClass: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    badgeIcon: "fa-crown",
  },
  event: {
    label: "Sự kiện",
    labelVi: "Sự kiện",
    badgeClass: "bg-rose-500/20 text-rose-400 border-rose-500/30",
    badgeIcon: "fa-calendar-star",
  },
};

// ─── Effect Card ─────────────────────────────────────────────────────────────

const EffectCard = ({ effect, onEquip, onBuy, isEquipping }) => {
  const typeConfig = TYPE_CONFIG[effect.unlockType] || TYPE_CONFIG.shop;
  const cardRef = useRef(null);

  return (
    <div
      ref={cardRef}
      className={`group relative overflow-hidden rounded-2xl border bg-white/[0.04] p-4 transition-all duration-300 backdrop-blur-sm ${
        effect.isEquipped
          ? "border-primaryColor/50 bg-primaryColor/[0.06] shadow-[0_0_20px_rgb(var(--ui-primary)/0.1)]"
          : effect.isOwned
            ? "border-white/10 hover:border-primaryColor/30 hover:bg-white/[0.06]"
            : "border-white/10 opacity-70 hover:opacity-90"
      }`}
    >
      {/* Type badge */}
      <div
        className={`absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${typeConfig.badgeClass}`}
      >
        <i className={`fa-solid ${typeConfig.badgeIcon}`} />
        <span>{typeConfig.labelVi}</span>
      </div>

      {/* Equipped badge */}
      {effect.isEquipped && (
        <div className="absolute left-3 top-3 z-10 inline-flex items-center gap-1 rounded-full bg-primaryColor/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primaryColor">
          <i className="fa-solid fa-check" />
          <span>Đang dùng</span>
        </div>
      )}

      {/* Canvas preview — chỉ chạy khi hover vào card */}
      <div
        className="relative z-0 mt-8"
        onMouseEnter={() => {
          setCursorLocalActive(true);
          cardRef.current?._hoverCanvasStart?.();
        }}
        onMouseLeave={() => {
          setCursorLocalActive(false);
          cardRef.current?._hoverCanvasStop?.();
        }}
      >
        {/* Container cố định kích thước để canvas hiển thị đúng pixel ratio */}
        <div className="relative h-[180px] w-full overflow-hidden rounded-xl">
          <HoverEffectCanvas effectId={effect.effectId} cardRef={cardRef} />
          {/* Hint text khi chưa hover */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/20 text-xs text-gray-500 group-hover:hidden">
            <i className="fa-solid fa-wand-magic-sparkles text-lg" />
            <span>Rê chuột vào đây</span>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="mt-4">
        <h3 className="text-base font-bold text-white">{effect.nameVi}</h3>
        <p className="mt-1 text-xs leading-relaxed text-gray-400">
          {effect.descriptionVi || effect.description || "Chưa có mô tả"}
        </p>
      </div>

      {/* Action */}
      <div className="mt-4">
        {effect.isEquipped ? (
          <button
            disabled
            className="w-full cursor-default rounded-xl border border-primaryColor/20 bg-primaryColor/10 py-2.5 text-sm font-semibold text-primaryColor"
          >
            <i className="fa-solid fa-check mr-2" />
            Đang sử dụng
          </button>
        ) : effect.isOwned ? (
          <button
            onClick={() => onEquip(effect.effectId)}
            disabled={isEquipping}
            className="w-full cursor-pointer rounded-xl border border-primaryColor/30 bg-primaryColor/10 py-2.5 text-sm font-semibold text-primaryColor transition-all hover:bg-primaryColor/20"
          >
            <i className="fa-solid fa-rocket mr-2" />
            {isEquipping ? "Đang trang bị..." : "Trang bị"}
          </button>
        ) : effect.unlockType === "event" ? (
          <button
            disabled
            className="w-full cursor-not-allowed rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm font-semibold text-gray-500"
          >
            <i className="fa-solid fa-lock mr-2" />
            {effect.unlockConditionVi || effect.unlockCondition || "Chưa mở khóa"}
          </button>
        ) : effect.unlockType === "premium" ? (
          <button
            disabled
            className="w-full cursor-not-allowed rounded-xl border border-purple-500/20 bg-purple-500/10 py-2.5 text-sm font-semibold text-purple-400"
          >
            <i className="fa-solid fa-crown mr-2" />
            Nâng cấp Premium
          </button>
        ) : (
          <button
            onClick={() => onBuy(effect.effectId, effect.price)}
            disabled={isEquipping}
            className="w-full cursor-pointer rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-white/10"
          >
            <i className="fa-solid fa-coins mr-2 text-amber-400" />
            {effect.price.toLocaleString("vi-VN")} coin
          </button>
        )}
      </div>
    </div>
  );
};

// ─── Main Shop Component ─────────────────────────────────────────────────────

const CursorEffectShop = () => {
  const { user, updateUser } = useAuth();
  const [effects, setEffects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isEquipping, setIsEquipping] = useState(false);
  const [actionEffectId, setActionEffectId] = useState(null);
  const [pendingBuy, setPendingBuy] = useState(null); // { effectId, price }

  const loadEffects = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await cursorEffectService.getEffects();
      setEffects(res.data || []);
    } catch (err) {
      setError("Không thể tải danh sách hiệu ứng.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEffects();
  }, []);

  const handleEquip = async (effectId) => {
    if (isEquipping) return;
    setIsEquipping(true);
    setActionEffectId(effectId);
    try {
      const res = await cursorEffectService.equip(effectId);
      if (res.cursorEffectId) {
        // Update user locally
        updateUser({ ...user, cursorEffectId: res.cursorEffectId });
      }
      await loadEffects();
    } catch (err) {
      console.error("Equip error:", err);
    } finally {
      setIsEquipping(false);
      setActionEffectId(null);
    }
  };

  const handleBuy = async (effectId, price) => {
    if (isEquipping) return;
    setPendingBuy({ effectId, price });
  };

  const confirmBuy = async () => {
    if (!pendingBuy || isEquipping) return;
    const { effectId } = pendingBuy;
    setPendingBuy(null);
    setIsEquipping(true);
    setActionEffectId(effectId);
    try {
      const res = await cursorEffectService.purchase(effectId);
      // Reload effects to get updated ownership
      await loadEffects();
      // Update user's coin and owned effects
      if (res.remainingCoins !== undefined) {
        updateUser({ ...user, coin: res.remainingCoins });
      }
    } catch (err) {
      alert(err?.response?.data?.message || err.message || "Mua thất bại");
    } finally {
      setIsEquipping(false);
      setActionEffectId(null);
    }
  };

  if (loading) return <BarSpinner className="py-12" />;

  if (error) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center text-gray-400">
        <i className="fa-solid fa-triangle-exclamation text-2xl text-red-400" />
        <p className="mt-3">{error}</p>
        <button
          onClick={loadEffects}
          className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10"
        >
          Thử lại
        </button>
      </div>
    );
  }

  const equipped = effects.find((e) => e.isEquipped);
  const shopEffects = effects.filter((e) => e.unlockType === "shop");
  const premiumEffects = effects.filter((e) => e.unlockType === "premium");
  const eventEffects = effects.filter((e) => e.unlockType === "event");

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Cửa hàng hiệu ứng</h2>
          <p className="mt-1 text-sm text-gray-400">
            {equipped
              ? `Đang dùng: ${equipped.nameVi}`
              : "Chọn một hiệu ứng để trang bị cho con trỏ chuột của bạn."}
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-400">
          <i className="fa-solid fa-coins" />
          <span>{user?.coin?.toLocaleString("vi-VN") || 0} coin</span>
        </div>
      </div>

      {/* Shop items */}
      {shopEffects.length > 0 && (
        <section>
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-gray-400">
            <i className="fa-solid fa-shop text-amber-400" />
            Mua bằng Coin
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shopEffects.map((effect) => (
              <EffectCard
                key={effect.effectId}
                effect={effect}
                onEquip={handleEquip}
                onBuy={handleBuy}
                isEquipping={isEquipping && actionEffectId === effect.effectId}
              />
            ))}
          </div>
        </section>
      )}

      {/* Premium items */}
      {premiumEffects.length > 0 && (
        <section>
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-gray-400">
            <i className="fa-solid fa-crown text-purple-400" />
            Dành cho Premium
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {premiumEffects.map((effect) => (
              <EffectCard
                key={effect.effectId}
                effect={effect}
                onEquip={handleEquip}
                onBuy={handleBuy}
                isEquipping={isEquipping && actionEffectId === effect.effectId}
              />
            ))}
          </div>
        </section>
      )}

      {/* Event items */}
      {eventEffects.length > 0 && (
        <section>
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-gray-400">
            <i className="fa-solid fa-calendar-star text-rose-400" />
            Sự kiện đặc biệt
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {eventEffects.map((effect) => (
              <EffectCard
                key={effect.effectId}
                effect={effect}
                onEquip={handleEquip}
                onBuy={handleBuy}
                isEquipping={isEquipping && actionEffectId === effect.effectId}
              />
            ))}
          </div>
        </section>
      )}

      {/* Confirmation dialog */}
      {pendingBuy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0b1018] p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Xác nhận mua</h3>
            <p className="mt-2 text-sm text-gray-300">
              Bạn có chắc muốn mua hiệu ứng này với{" "}
              <span className="font-semibold text-amber-400">
                {pendingBuy.price.toLocaleString("vi-VN")} coin
              </span>
              ?
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setPendingBuy(null)}
                className="flex-1 cursor-pointer rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
              >
                Hủy
              </button>
              <button
                onClick={confirmBuy}
                className="flex-1 cursor-pointer rounded-xl border border-amber-500/30 bg-amber-500/20 py-2.5 text-sm font-semibold text-amber-400 hover:bg-amber-500/30"
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CursorEffectShop;
