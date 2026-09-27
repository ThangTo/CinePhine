import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import useAuth from "hooks/useAuth";
import { BarSpinner, PageSpinner } from "components/common/LoadingState";
import { settingsAPI } from "services/admin.service";
import http from "lib/axios";

// Import React Icons
import { FiCheck, FiAlertCircle, FiCreditCard, FiTrendingUp } from "react-icons/fi";
import { FaCoins } from "react-icons/fa";

const RechargeCoinPage = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [loading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [selectedAmount, setSelectedAmount] = useState(null);
  const [customAmount, setCustomAmount] = useState("");
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const [coinPackages, setCoinPackages] = useState([]);
  const [loadingPackages, setLoadingPackages] = useState(true);
  const [paymentEnabled, setPaymentEnabled] = useState(true);

  // Redirect if not authenticated
  React.useEffect(() => {
    if (!isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, navigate]);

  // Load coin packages from Settings
  useEffect(() => {
    settingsAPI.getCoinPackages()
      .then((pkgs) => {
        // Sort by sortOrder
        const sorted = [...(pkgs || [])].sort((a, b) => (a.sortOrder || 99) - (b.sortOrder || 99));
        setCoinPackages(sorted);
      })
      .catch(() => {})
      .finally(() => setLoadingPackages(false));
  }, []);

  // Check global payment toggle (admin can disable bank transfer)
  useEffect(() => {
    settingsAPI
      .getPaymentStatus()
      .then((res) => setPaymentEnabled(res?.enabled !== false))
      .catch(() => {});
  }, []);

  // Check URL params for payment status (Redirect Mode)
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get("success")) {
      setSuccess("Thanh toán thành công. Coin đã được cộng vào tài khoản!");
    }
    if (query.get("canceled")) {
      setError("Thanh toán thất bại hoặc đã bị hủy.");
    }
  }, []);

  const handleSelectPackage = (amount) => {
    setSelectedAmount(amount);
    setCustomAmount("");
    setError(null);
    setSuccess(null);
  };

  const handleRecharge = async () => {
    if (!user) {
      navigate("/");
      return;
    }

    if (!paymentEnabled) {
      setError("Chức năng nạp tiền đang tạm khóa, vui lòng quay lại sau.");
      return;
    }

    const amount = selectedAmount || parseInt(customAmount);
    const selectedPackage = coinPackages.find((pkg) => pkg.amount === selectedAmount);

    if (!amount || amount <= 0) {
      setError("Vui lòng chọn gói coin hoặc nhập số coin muốn nạp");
      return;
    }

    if (amount < 10) {
      setError("Số coin tối thiểu là 10");
      return;
    }

    if (amount > 100000) {
      setError("Số coin tối đa là 100,000");
      return;
    }

    if (!selectedPackage?.id) {
      setError("Please select a valid coin package.");
      return;
    }

    try {
      setIsCreatingLink(true);
      setError(null);

      // Call Backend to Create Payment Link using secure axios instance
      const response = await http.post("/payment/create-payment-link", {
        packageId: selectedPackage.id,
      });

      const result = response.data;

      // REDIRECT to Gateway
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
      } else {
        setError("Lỗi: Không nhận được link thanh toán.");
      }
    } catch (err) {
      console.error(err);
      if (err.status === 403) {
        setPaymentEnabled(false);
        setError(err.message || "Chức năng nạp tiền đang tạm khóa, vui lòng quay lại sau.");
      } else {
        setError("Có lỗi xảy ra. Vui lòng thử lại sau.");
      }
    } finally {
      setIsCreatingLink(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-dvh bg-[#111] flex items-center justify-center">
        <PageSpinner />
      </div>
    );
  }

  const userCoins = user.coin || 0;
  const finalAmount = selectedAmount || parseInt(customAmount) || 0;
  const selectedPackage = coinPackages.find((pkg) => pkg.amount === selectedAmount);
  return (
    <div className="min-h-dvh pt-[var(--app-header-total-height)] md:pt-0 bg-[#111] relative overflow-hidden font-sans text-gray-200 selection:bg-primaryColor/30">
      {/* --- Background Effects --- */}
      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-primaryColor/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none" />

      <div className="container mx-auto px-4 py-12 relative z-10 max-w-4xl">
        {/* --- Header Section --- */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-4 tracking-tight">
            Nạp{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primaryColor to-yellow-200">
              Coin
            </span>
          </h1>
          {/* <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Nạp coin nhanh chóng, an toàn để nâng cấp Premium và mở khóa các tính năng độc quyền.
          </p> */}

          {/* Current Coin Display Widget */}
          <div className="mt-8 inline-flex items-center gap-4 bg-[#1a1a1a] border border-white/10 px-2 py-2 pr-6 rounded-full shadow-lg backdrop-blur-md">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center shadow-lg shadow-yellow-500/20">
              <FaCoins className="text-black text-lg" />
            </div>
            <div className="flex flex-col items-start">
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                Số dư hiện tại
              </span>
              <span className="text-lg font-bold text-white leading-none">
                {userCoins.toLocaleString()} <span className="text-xs text-yellow-500">Coin</span>
              </span>
            </div>
          </div>
        </div>

        {/* --- Main Content Grid --- */}
        <div className="space-y-12">
          {/* STEP 1: Selection Area */}
          <div>
            <h2 className="md:text-2xl text-xl font-bold text-yellow-400 mb-6 flex items-center gap-2">
              Bước 1: <span className="text-white text-lg md:text-2xl">Chọn gói nạp nhanh</span>
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {loadingPackages ? (
                <div className="col-span-full flex items-center justify-center py-8">
                  <BarSpinner />
                </div>
              ) : coinPackages.length === 0 ? (
                <div className="col-span-full text-center py-8 text-gray-500">
                  Chưa có gói coin nào được cấu hình.
                </div>
              ) : (
                coinPackages.map((pkg) => {
                  const isSelected = selectedAmount === pkg.amount;
                  return (
                    <button
                      key={pkg.id || pkg.amount}
                      onClick={() => handleSelectPackage(pkg.amount)}
                      className={`
                        relative p-5 rounded-2xl border transition-all duration-300 group overflow-hidden
                        ${
                          isSelected
                            ? "bg-primaryColor/10 border-primaryColor shadow-lg shadow-primaryColor/20 scale-[1.02]"
                            : "bg-white/[0.03] border-white/10 hover:bg-white/[0.06] hover:border-white/20"
                        }
                      `}
                    >
                      {/* Popular Badge */}
                      {pkg.popular && (
                        <div className="absolute top-0 right-0 bg-primaryColor text-black text-[10px] font-bold px-2 py-1 rounded-bl-lg shadow-sm">
                          HOT
                        </div>
                      )}
                      {isSelected && (
                        <div className="absolute top-3 right-3 shadow-sm rounded-full">
                          <div className="w-6 h-6 bg-primaryColor rounded-full flex items-center justify-center">
                            <FiCheck className="text-black w-4 h-4 stroke-[3px]" />
                          </div>
                        </div>
                      )}

                      <div className="flex flex-col items-center text-center relative z-10">
                        <span
                          className={`text-xl font-bold mb-1 ${
                            isSelected
                              ? "text-primaryColor"
                              : "text-white group-hover:text-primaryColor transition-colors"
                          }`}
                        >
                          {pkg.label}
                        </span>
                        <span className="text-sm text-gray-400 font-medium tracking-wider">
                          {pkg.price ? Number(pkg.price).toLocaleString('vi-VN') + ' VNĐ' : (pkg.amount * 10).toLocaleString() + ' VNĐ'}
                        </span>

                        {/* Bonus Display */}
                        {pkg.bonus > 0 ? (
                          <div className="mt-3 py-1 px-2 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-bold flex items-center gap-1">
                            <FiTrendingUp /> +{pkg.bonus.toLocaleString()}
                          </div>
                        ) : (
                          <div className="mt-3 h-6 opacity-0">spacer</div>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Custom Amount Input Helper */}
            {/* <div className="mt-6">
                <div className="bg-[#1a1a1a]/50 backdrop-blur-sm rounded-2xl p-6 border border-white/10 flex flex-col md:flex-row items-center gap-4">
                  <h3 className="text-sm font-semibold text-gray-400 whitespace-nowrap">Hoặc nhập số lượng tùy ý:</h3>
                  <div className="relative w-full max-w-md">
                    <input
                      type="text"
                      value={customAmount}
                      onChange={handleCustomAmount}
                      placeholder="Nhập số coin (10 - 100,000)"
                      className="w-full pl-12 pr-4 py-3 bg-black/40 border border-white/10 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-primaryColor focus:ring-1 focus:ring-primaryColor transition-all font-mono"
                    />
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">
                      <FaCoins />
                    </div>
                  </div>
                </div>
            </div> */}
          </div>

          {/* STEP 2: Payment Method */}
          <div>
            <h2 className="md:text-2xl text-xl font-bold text-yellow-400 mb-6 flex items-center gap-2">
              Bước 2:{" "}
              <span className="text-white text-lg md:text-2xl">Chọn phương thức thanh toán</span>
            </h2>

            <div className="grid md:grid-cols-2 gap-4">
              {/* Method 1: Bank Transfer (PayOS) */}
              <div
                className={`p-6 rounded-2xl border transition-all relative ${
                  paymentEnabled
                    ? "cursor-pointer border-primaryColor bg-primaryColor/5"
                    : "cursor-not-allowed border-white/5 bg-white/[0.01] opacity-60"
                }`}
              >
                {paymentEnabled ? (
                  <div className="absolute top-3 right-3 shadow-sm rounded-full">
                    <div className="w-5 h-5 bg-primaryColor rounded-full flex items-center justify-center">
                      <FiCheck className="text-black w-3 h-3 stroke-[3px]" />
                    </div>
                  </div>
                ) : (
                  <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-xs font-semibold">
                    Tạm khóa
                  </div>
                )}
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-600/20 flex items-center justify-center text-blue-400">
                    <FiCreditCard size={24} />
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-lg">Chuyển khoản / VietQR</h3>
                    <p className="text-gray-500 text-sm">
                      {paymentEnabled ? "Quét mã QR, tự động xử lý 24/7" : "Đang tạm khóa, vui lòng quay lại sau"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Method 2: Momo (Placeholder) */}
              <div className="p-6 rounded-2xl border border-white/5 bg-white/[0.01] opacity-60 cursor-not-allowed">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-pink-600/20 flex items-center justify-center text-pink-400">
                    {/* Momo Icon placeholder */}
                    <div className="font-bold text-xs">MOMO</div>
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-lg">Ví Momo</h3>
                    <p className="text-gray-500 text-sm">Bảo trì</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SUMMARY & ACTION (Moved to Bottom) */}
          <div className="mt-8">
            <div className="bg-[#1a1a1a] rounded-3xl p-8 border border-white/10 shadow-2xl relative overflow-hidden">
              {/* Decoration */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-primaryColor/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

              <div className="flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
                {/* Info Text */}
                <div className="text-left space-y-2">
                  <p className="text-gray-400">
                    Bạn đã chọn mua gói{" "}
                    <strong className="text-white">
                      {finalAmount > 0 ? finalAmount.toLocaleString() : "0"} Coin
                    </strong>
                    {selectedPackage?.bonus > 0 && (
                      <span className="text-green-400 ml-2">
                        + {selectedPackage.bonus.toLocaleString()} Bonus
                      </span>
                    )}
                  </p>
                  <p className="text-gray-400">
                    Tổng coin nhận được:{" "}
                    <strong className="text-white text-xl">
                      {(finalAmount + (selectedPackage?.bonus || 0)).toLocaleString()} Coin
                    </strong>
                  </p>
                  <p className="text-gray-400">
                    Tổng thanh toán:{" "}
                    <strong className="text-primaryColor text-2xl">
                      {selectedPackage?.price
                        ? Number(selectedPackage.price).toLocaleString("vi-VN")
                        : (finalAmount * 10).toLocaleString("vi-VN")} VNĐ
                    </strong>
                  </p>
                </div>

                {/* Action Button */}
                <div className="w-full md:w-auto min-w-[300px]">
                  <button
                    onClick={handleRecharge}
                    disabled={!finalAmount || finalAmount < 10 || loading || isCreatingLink || !paymentEnabled}
                    className={`
                            w-full py-4 rounded-xl font-bold text-lg tracking-wide transition-all duration-300
                            flex items-center justify-center gap-3 shadow-lg
                            ${
                              finalAmount >= 10 && !loading && !isCreatingLink && paymentEnabled
                                ? "bg-primaryColor hover:bg-hoverPrimaryColor text-black shadow-primaryColor/25 hover:shadow-primaryColor/40 hover:-translate-y-1"
                                : "bg-gray-800 text-gray-500 cursor-not-allowed border border-white/5"
                            }
                        `}
                  >
                    {loading || isCreatingLink ? (
                      <>
                        <BarSpinner className="w-5 h-5" /> Đang chuyển hướng...
                      </>
                    ) : (
                      <>Xác nhận và thanh toán</>
                    )}
                  </button>
                  {!paymentEnabled && (
                    <p className="text-center text-sm text-red-400 mt-2">
                      Chức năng nạp tiền đang tạm khóa, vui lòng quay lại sau.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Messages Area */}
            {(error || success) && (
              <div
                className={`mt-6 p-4 rounded-xl flex items-center justify-center gap-3 animate-fade-in ${
                  error
                    ? "bg-red-500/10 border border-red-500/30 text-red-200"
                    : "bg-green-500/10 border border-green-500/30 text-green-200"
                }`}
              >
                {error ? (
                  <FiAlertCircle className="w-5 h-5 flex-shrink-0" />
                ) : (
                  <FiCheck className="w-5 h-5 flex-shrink-0" />
                )}
                <span>{error || success}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RechargeCoinPage;
