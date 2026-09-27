import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import useAuth from "hooks/useAuth";
import userService from "services/user.service";
import { settingsAPI } from "services/admin.service";
import { BarSpinner, PageSpinner } from "components/common/LoadingState";
import PremiumStatusSummary from "components/account/PremiumStatusSummary";
import { getPremiumSummary, isPremiumActive } from "utils/premiumUtils";

// Import Icons
import {
  FiCheck,
  FiStar,
  FiZap,
  FiShield,
  FiFilm,
  FiDownload,
  FiHeadphones,
  FiPlus,
  FiAlertCircle,
  FiCheckCircle,
  FiCpu,
} from "react-icons/fi";
import { FaCoins } from "react-icons/fa";

const PremiumPage = () => {
  const navigate = useNavigate();
  const { user, updateUser, isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(false);
  const [loadingPlanId, setLoadingPlanId] = useState(null); // Track which plan is being processed
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [plans, setPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(true);

  // Redirect nếu chưa đăng nhập
  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, navigate]);

  // Load premium plans from Settings
  useEffect(() => {
    settingsAPI.getPremiumPlans()
      .then((fetchedPlans) => {
        const sorted = [...(fetchedPlans || [])].sort((a, b) => (a.sortOrder || 99) - (b.sortOrder || 99));
        // Merge with display metadata (features, popular, etc.)
        const DEFAULT_FEATURES = {
          weekly: ["Xem phim không giới hạn", "Chất lượng HD/4K", "Không quảng cáo", "Tải xuống để xem offline"],
          monthly: ["Tất cả tính năng Premium Tuần", "Xem phim không giới hạn", "Chất lượng HD/4K", "Không quảng cáo", "Tải xuống để xem offline", "Ưu tiên hỗ trợ khách hàng"],
          yearly: ["Tất cả tính năng Premium Tháng", "Ưu tiên truy cập phim mới", "Không quảng cáo", "Huy hiệu thành viên độc quyền", "Hỗ trợ VIP 24/7", "Quà tặng dịp lễ"],
        };
        const mapped = sorted.map((p, idx) => ({
          id: p.planKey,
          name: `Premium ${p.label}`,
          duration: `${p.days} ngày`,
          price: p.coins,
          priceLabel: `${p.coins} Coin`,
          features: DEFAULT_FEATURES[p.planKey] || [`Premium ${p.label}`, `${p.days} ngày`, "Tất cả tính năng premium"],
          popular: idx === 1, // Middle plan is popular by default
        }));
        setPlans(mapped);
      })
      .catch(() => {})
      .finally(() => setLoadingPlans(false));
  }, []);

  const handleUpgrade = async (planId) => {
    if (!user) {
      navigate("/");
      return;
    }

    setLoading(true);
    setLoadingPlanId(planId); // Set the plan being processed
    setError(null);
    setSuccess(null);

    try {
      const result = await userService.upgradePremium(planId);
      setSuccess(result.message || "Nâng cấp Premium thành công!");

      // Cập nhật thông tin user
      if (result.user) {
        updateUser(result.user);
      } else {
        const updatedUser = await userService.getProfile();
        updateUser(updatedUser);
      }

      // Chuyển hướng sau 2s
      setTimeout(() => {
        navigate("/account?tabs=profile");
      }, 2000);
    } catch (err) {
      setError(err.message || "Có lỗi xảy ra khi nâng cấp");
    } finally {
      setLoading(false);
      setLoadingPlanId(null); // Clear the loading plan ID
    }
  };

  // Loading state ban đầu
  if (!user) {
    return (
      <div className="min-h-dvh bg-[#111] flex items-center justify-center">
        <PageSpinner />
      </div>
    );
  }

  // Check if user is premium and subscription is still valid
  const isPremium = isPremiumActive(user);
  const userCoins = user.coin || 0;
  const currentPlan = user.premiumPlan;
  const premiumSummary = getPremiumSummary(user);
  const remainingDays = premiumSummary.remainingDays;

  return (
    <div className="min-h-dvh pt-[var(--app-header-total-height)] md:pt-0 bg-[#111] relative overflow-hidden font-sans text-gray-200 selection:bg-primaryColor/30">
      {/* --- Background Effects (Glow nền) --- */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-[500px] bg-primaryColor/20 blur-[120px] rounded-full pointer-events-none mix-blend-screen" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-blue-600/10 blur-[100px] rounded-full pointer-events-none" />

      <div className="container mx-auto px-4 py-12 relative z-10 max-w-7xl">
        {/* --- Header Section --- */}
        <div className="text-center mb-12 md:mb-16 space-y-4">
          <span className="inline-block py-1 px-3 rounded-full bg-white/5 border border-white/10 text-xs font-bold tracking-widest uppercase text-primaryColor backdrop-blur-md">
            Nâng tầm trải nghiệm
          </span>
          <h1 className="text-4xl md:text-6xl font-extrabold text-white tracking-tight">
            Chọn gói{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primaryColor to-yellow-200">
              Premium
            </span>
            <br className="hidden md:block" /> phù hợp với bạn
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Mở khóa kho phim khổng lồ chất lượng 4K, không quảng cáo và tải xuống không giới hạn.
          </p>
        </div>

        <div className="mx-auto mb-10 max-w-4xl">
          <PremiumStatusSummary user={user} showAction={false} />
        </div>

        {/* --- Coin Dashboard Widget --- */}
        <div className="flex justify-center mb-16 sticky top-[calc(var(--app-header-total-height)+0.5rem)] z-40 md:static">
          <div className="bg-[#1a1a1a]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-2 pr-2 md:pr-4 flex items-center gap-2 md:gap-4 shadow-2xl ring-1 ring-white/5">
            <div className="bg-black/40 rounded-xl px-4 py-2 flex items-center gap-3 border border-white/5">
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center shadow-lg shadow-yellow-500/20">
                <FaCoins className="text-black text-sm md:text-lg" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] md:text-xs text-gray-400 font-medium uppercase tracking-wider">
                  Số dư
                </span>
                <span className="text-sm md:text-xl font-bold text-white leading-none font-mono">
                  {userCoins.toLocaleString()}{" "}
                  <span className="text-xs text-yellow-500 font-sans">Coin</span>
                </span>
              </div>
            </div>

            <button
              onClick={() => navigate("/recharge")}
              className="group flex items-center gap-2 px-4 md:px-6 py-3 bg-primaryColor hover:bg-hoverPrimaryColor text-black font-bold rounded-xl transition-all hover:shadow-lg hover:shadow-primaryColor/20 active:scale-95"
            >
              <FiPlus className="w-5 h-5 transition-transform group-hover:rotate-90" />
              <span className="hidden md:inline">Nạp thêm</span>
            </button>
          </div>
        </div>

        {/* --- Alert Messages --- */}
        {error && (
          <div className="max-w-md mx-auto mb-8 bg-red-500/10 border border-red-500/50 text-red-200 px-4 py-3 rounded-xl flex items-center gap-3 animate-fade-in">
            <FiAlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="max-w-md mx-auto mb-8 bg-green-500/10 border border-green-500/50 text-green-200 px-4 py-3 rounded-xl flex items-center gap-3 animate-fade-in">
            <FiCheckCircle className="w-5 h-5 flex-shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* --- Pricing Cards Grid --- */}
        <div className="container mx-auto px-0 md:px-4 pb-20 max-w-6xl">
          {loadingPlans ? (
            <div className="flex items-center justify-center py-20">
              <BarSpinner />
            </div>
          ) : plans.length === 0 ? (
            <div className="text-center py-20 text-gray-500">
              Chưa có gói Premium nào được cấu hình.
            </div>
          ) : (
          /* items-stretch: Quan trọng để các thẻ cao bằng nhau */
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 items-stretch">
            {plans.map((plan) => {
              const canAfford = userCoins >= plan.price;
              const isCurrentPlan = isPremium && currentPlan === plan.id;
              const isProcessing = loadingPlanId === plan.id; // Check if this specific plan is being processed
              const isDisabled = (isPremium && !isCurrentPlan) || !canAfford || loading;
              const isPopular = plan.popular;

              return (
                <div
                  key={plan.id}
                  // Flex-col và h-full: Để nội dung dàn dọc và chiếm hết chiều cao
                  className={`
                    relative flex flex-col h-full rounded-3xl transition-all duration-300
                    ${
                      isPopular
                        ? "bg-[#1a1a1a]/90 border-2 border-primaryColor shadow-2xl shadow-primaryColor/15 z-10 md:scale-105"
                        : "bg-white/[0.03] border border-white/10 hover:border-white/20 hover:bg-white/[0.05]"
                    }
                    backdrop-blur-xl p-6 lg:p-8
                    ${isDisabled && !isPremium ? "opacity-70 grayscale-[0.3]" : ""}
                  `}
                >
                  {/* Badge Phổ biến */}
                  {isPopular && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-primaryColor to-yellow-400 text-black font-bold px-4 py-1 rounded-full shadow-lg shadow-orange-500/20 text-[10px] md:text-xs flex items-center gap-1 whitespace-nowrap z-20 tracking-wider">
                      <FiStar className="w-3 h-3 fill-black" />
                      PHỔ BIẾN NHẤT
                    </div>
                  )}

                  {/* Header của thẻ */}
                  <div className="text-center mb-6">
                    <h3
                      className={`text-lg font-bold mb-2 uppercase tracking-wider ${
                        isPopular ? "text-white" : "text-gray-400"
                      }`}
                    >
                      {plan.name}
                    </h3>

                    <div className="flex items-center justify-center gap-1">
                      <span
                        className={`text-4xl lg:text-5xl font-extrabold ${
                          isPopular ? "text-primaryColor" : "text-white"
                        }`}
                      >
                        {plan.price}
                      </span>
                      <span className="text-gray-500 font-medium mt-auto mb-2">Coin</span>
                    </div>

                    {/* Premium Status Badge */}
                    {isCurrentPlan && (
                      <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primaryColor/20 border border-primaryColor/30 text-primaryColor text-xs font-bold">
                        <FiCheckCircle className="w-3 h-3" />
                        Premium {remainingDays} ngày
                      </div>
                    )}

                    {/* Khu vực giá gốc (Dùng Spacer nếu không có giảm giá) */}
                    <div className="h-6 mt-2 flex items-center justify-center gap-2">
                      {plan.originalPrice ? (
                        <>
                          <span className="text-sm text-gray-600 line-through font-medium">
                            {plan.originalPrice}
                          </span>
                          <span className="text-[10px] font-bold text-green-400 bg-green-400/10 px-2 py-0.5 rounded border border-green-400/20">
                            -{Math.round((1 - plan.price / plan.originalPrice) * 100)}%
                          </span>
                        </>
                      ) : (
                        <div className="h-6 w-full" /> /* Spacer */
                      )}
                    </div>
                  </div>

                  {/* Đường kẻ phân cách */}
                  <div className="w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mb-6" />

                  {/* Danh sách tính năng (Flex-1 đẩy nút xuống đáy) */}
                  <div className="flex-1 mb-8">
                    <ul className="space-y-4">
                      {plan.features.map((feature, idx) => (
                        <li key={idx} className="flex items-start gap-3 text-sm text-gray-300">
                          <div
                            className={`mt-0.5 p-0.5 rounded-full flex-shrink-0 ${
                              isPopular ? "text-primaryColor" : "text-gray-600"
                            }`}
                          >
                            <FiCheck className="w-4 h-4" />
                          </div>
                          <span className="leading-relaxed font-light">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Nút hành động */}
                  <div className="mt-auto">
                    <button
                      onClick={() => handleUpgrade(plan.id)}
                      disabled={isDisabled}
                      className={`
                        w-full py-3.5 rounded-xl font-bold text-sm tracking-wide transition-all duration-300
                        flex items-center justify-center gap-2 group relative overflow-hidden
                        ${
                          isPremium
                            ? "bg-gray-700/50 text-gray-400 cursor-not-allowed border border-white/5"
                            : !canAfford
                            ? "bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20"
                            : isPopular
                            ? "bg-primaryColor hover:bg-hoverPrimaryColor text-black shadow-lg shadow-primaryColor/25 hover:shadow-primaryColor/40 hover:-translate-y-1"
                            : "bg-white/5 hover:bg-white/10 text-white border border-white/10 hover:border-primaryColor/50 hover:-translate-y-1"
                        }
                      `}
                    >
                      {isProcessing ? (
                        <>
                          <BarSpinner className="w-4 h-4" /> Đang xử lý...
                        </>
                      ) : isCurrentPlan ? (
                        <>
                          <FiCheckCircle className="w-4 h-4" /> Đang sử dụng
                        </>
                      ) : !canAfford ? (
                        `Thiếu ${(plan.price - userCoins).toLocaleString()}`
                      ) : (
                        <>
                          Nâng cấp ngay
                          <FiZap
                            className={`w-4 h-4 transition-transform group-hover:scale-110 ${
                              isPopular ? "fill-black" : ""
                            }`}
                          />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </div>

        {/* --- Benefits Section --- */}
        <div className="border-t border-white/10 pt-16">
          <h2 className="text-2xl font-bold text-center text-white mb-12 flex items-center justify-center gap-3">
            <FiCpu className="text-primaryColor" />
            Đặc quyền VIP có gì hot?
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: FiFilm,
                title: "Kho Phim 4K",
                desc: "Chất lượng hình ảnh sắc nét, sống động từng chi tiết.",
              },
              {
                icon: FiShield,
                title: "Không Quảng Cáo",
                desc: "Tận hưởng trọn vẹn bộ phim không bị làm phiền.",
              },
              {
                icon: FiDownload,
                title: "Xem Offline",
                desc: "Tải phim về máy xem mọi lúc mọi nơi không cần mạng.",
              },
              {
                icon: FiHeadphones,
                title: "CSKH Ưu Tiên",
                desc: "Đội ngũ hỗ trợ riêng biệt 24/7 cho tài khoản VIP.",
              },
            ].map((item, index) => (
              <div
                key={index}
                className="bg-white/[0.02] border border-white/5 p-6 rounded-2xl hover:bg-white/[0.04] transition-colors group cursor-default"
              >
                <div className="w-12 h-12 bg-gray-800 rounded-xl flex items-center justify-center mb-4 group-hover:bg-primaryColor group-hover:text-black transition-colors duration-300 shadow-lg">
                  <item.icon className="w-6 h-6 text-primaryColor group-hover:text-black transition-colors duration-300" />
                </div>
                <h3 className="text-white font-bold mb-2">{item.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PremiumPage;
