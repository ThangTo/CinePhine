import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "contexts/AuthContext";
import bgFormLogin from "assets/images/bg-form-login.webp";
import { isValidEmail, normalizeEmail } from "utils/emailUtils";

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:5000/api/v1";
const GOOGLE_AUTH_URL = `${API_BASE_URL}/auth/google`;

const AuthModal = ({ isOpen, onClose, initialMode = "login" }) => {
  const {
    login,
    register,
    requestRegistrationOTP,
    forgotPassword,
    verifyPasswordResetOTP,
    resetPassword,
  } = useAuth();
  // modes: "login", "register", "forgot-password", "verify-otp-register", "verify-otp-forgot-password", "reset-password"
  const [mode, setMode] = useState(initialMode);
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    otp: "",
  });
  const [resetToken, setResetToken] = useState(null);
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState({
    password: false,
    confirmPassword: false,
  });
  const [resendTimer, setResendTimer] = useState(0);
  const timerRef = useRef(null);
  const otpRefs = useRef([]);

  const handleOtpChange = (index, value) => {
    if (isNaN(value)) return;

    let currentOtp = formData.otp.split("");
    while (currentOtp.length < 6) currentOtp.push("");

    currentOtp[index] = value.slice(-1); // Take last char if multiple
    const newOtp = currentOtp.join("").substring(0, 6);

    setFormData((prev) => ({ ...prev, otp: newOtp }));

    if (value && index < 5 && otpRefs.current[index + 1]) {
      otpRefs.current[index + 1].focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === "Backspace") {
      if (!formData.otp[index] && index > 0 && otpRefs.current[index - 1]) {
        otpRefs.current[index - 1].focus();
      }
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pastedData) {
      setFormData((prev) => ({ ...prev, otp: pastedData }));
      const focusIndex = Math.min(pastedData.length, 5);
      if (otpRefs.current[focusIndex]) {
        otpRefs.current[focusIndex].focus();
      }
    }
  };

  // Sync mode with initialMode when modal opens
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setErrors({});
    }
  }, [isOpen, initialMode]);

  // Handle countdown timer for OTP resend
  useEffect(() => {
    if (resendTimer > 0) {
      timerRef.current = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
    } else {
      clearTimeout(timerRef.current);
    }
    return () => clearTimeout(timerRef.current);
  }, [resendTimer]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      const scrollY = window.scrollY;
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = "100%";
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.width = "";
        document.body.style.overflow = "";
        window.scrollTo(0, scrollY);
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => {
      const newErrors = { ...prev };
      if (newErrors[name]) delete newErrors[name];
      if (newErrors.general) delete newErrors.general;
      return newErrors;
    });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrors({});
    if (!formData.email || !formData.password) {
      setErrors({ general: "Vui lòng nhập đầy đủ email và mật khẩu" });
      return;
    }
    setIsLoading(true);
    try {
      await login({ email: formData.email, password: formData.password });
      onClose();
    } catch (error) {
      setErrors({ general: error?.message || "Đăng nhập thất bại" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestRegistrationOTP = async (e) => {
    e.preventDefault();
    const newErrors = {};
    const normalizedEmail = normalizeEmail(formData.email);
    if (!formData.username) newErrors.username = "Vui lòng nhập tên hiển thị";
    if (!normalizedEmail) newErrors.email = "Vui lòng nhập email";
    else if (!isValidEmail(normalizedEmail)) newErrors.email = "Email không hợp lệ";
    if (!formData.password) newErrors.password = "Vui lòng nhập mật khẩu";
    else if (formData.password.length < 6) newErrors.password = "Mật khẩu phải ít nhất 6 ký tự";
    if (formData.password !== formData.confirmPassword)
      newErrors.confirmPassword = "Mật khẩu không khớp";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsLoading(true);
    try {
      await requestRegistrationOTP({ username: formData.username, email: normalizedEmail });
      setFormData((prev) => ({ ...prev, email: normalizedEmail }));
      switchMode("verify-otp-register");
      setResendTimer(60);
    } catch (error) {
      setErrors({ general: error?.message || "Không thể gửi mã OTP" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    const normalizedEmail = normalizeEmail(formData.email);
    if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
      setErrors({ email: "Vui lòng nhập email hợp lệ" });
      return;
    }
    setIsLoading(true);
    try {
      await forgotPassword(normalizedEmail);
      setFormData((prev) => ({ ...prev, email: normalizedEmail }));
      switchMode("verify-otp-forgot-password");
      setResendTimer(60);
    } catch (error) {
      setErrors({ general: error?.message || "Lỗi khi gửi yêu cầu" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyForgotOTP = async (e) => {
    e.preventDefault();
    if (formData.otp.length !== 6) {
      setErrors({ otp: "Mã OTP phải có 6 chữ số" });
      return;
    }

    setIsLoading(true);
    try {
      const result = await verifyPasswordResetOTP({
        email: formData.email,
        otp: formData.otp,
      });
      setResetToken(result.resetToken);
      switchMode("reset-password");
    } catch (error) {
      setErrors({ general: error?.message || "Mã xác thực không chính xác" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyRegisterOTP = async (e) => {
    e.preventDefault();
    if (formData.otp.length !== 6) {
      setErrors({ otp: "Mã OTP phải có 6 chữ số" });
      return;
    }

    setIsLoading(true);
    try {
      await register({
        username: formData.username,
        email: formData.email,
        password: formData.password,
        otp: formData.otp,
      });
      onClose();
    } catch (error) {
      setErrors({ general: error?.message || "Xác thực thất bại" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    const newErrors = {};
    if (!formData.password) newErrors.password = "Vui lòng nhập mật khẩu mới";
    else if (formData.password.length < 6) newErrors.password = "Mật khẩu phải ít nhất 6 ký tự";
    if (formData.password !== formData.confirmPassword)
      newErrors.confirmPassword = "Mật khẩu không khớp";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsLoading(true);
    try {
      await resetPassword({
        resetToken: resetToken,
        newPassword: formData.password,
      });
      setErrors({ general: "Đổi mật khẩu thành công! Vui lòng đăng nhập lại." });
      setTimeout(() => switchMode("login"), 2000);
    } catch (error) {
      setErrors({ general: error?.message || "Đổi mật khẩu thất bại" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOTP = async () => {
    if (resendTimer > 0) return;
    setIsLoading(true);
    try {
      if (mode === "verify-otp-register") {
        await requestRegistrationOTP({ username: formData.username, email: formData.email });
      } else if (mode === "verify-otp-forgot-password") {
        await forgotPassword(formData.email);
      }
      setResendTimer(60);
      setErrors({ general: "Mã OTP mới đã được gửi thành công!" });
    } catch (error) {
      setErrors({ general: error?.message || "Không thể gửi lại mã" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    window.location.href = GOOGLE_AUTH_URL;
  };

  const switchMode = (newMode) => {
    setMode(newMode);
    if (!newMode.includes("otp") && newMode !== "reset-password") {
      setFormData({ username: "", email: "", password: "", confirmPassword: "", otp: "" });
    }
    setErrors({});
  };

  return (
    <div className="fixed inset-0 z-[9999999] flex items-center justify-center safe-modal-padding overflow-y-auto">
      {/* Animated Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      {/* Modal Container - Glassmorphism */}
      <div className="relative z-10 w-full max-w-[900px] my-auto flex flex-col md:flex-row rounded-3xl overflow-hidden border border-white/10 bg-[#111111]/80 backdrop-blur-2xl shadow-[0_0_50px_-12px_rgba(0,0,0,0.8)] animate-fade-in">
        {/* Left Side (Hidden on Mobile) */}
        <div className="hidden md:flex md:w-5/12 relative overflow-hidden">
          <img
            src={bgFormLogin}
            alt="Background"
            className="absolute inset-0 w-full h-full object-cover opacity-50 mix-blend-overlay"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent"></div>
          <div className="relative z-10 p-10 flex flex-col justify-end items-start h-full text-white w-full">
            <div className="w-16 h-1.5 bg-primaryColor rounded-full mb-6 shadow-[0_0_10px_rgb(var(--ui-primary)/0.6)]"></div>
            <h1 className="text-4xl font-extrabold mb-4 tracking-wider drop-shadow-lg">
              CINEPHINE
            </h1>
            <p className="text-gray-300 leading-relaxed font-light text-sm drop-shadow-md">
              Thế giới điện ảnh thu nhỏ trong tầm tay bạn. Khám phá hàng ngàn bộ phim bom tấn với
              chất lượng tuyệt đỉnh cùng cộng đồng đam mê điện ảnh.
            </p>
          </div>
        </div>

        {/* Right Side - Form */}
        <div className="w-full md:w-7/12 p-8 sm:p-10 relative">
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 sm:top-6 sm:right-6 w-10 h-10 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white transition-all z-20 group"
          >
            <i className="fa-solid fa-times text-lg group-hover:rotate-90 transition-transform duration-300" />
          </button>

          <div className="max-w-[380px] mx-auto w-full pt-2 sm:pt-4">
            {/* Headers */}
            <div className="mb-8">
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-2 tracking-tight">
                {mode === "login" && "Đăng nhập"}
                {mode === "register" && "Đăng ký"}
                {mode === "forgot-password" && "Khôi phục mật khẩu"}
                {mode === "verify-otp-register" && "Xác thực OTP"}
                {mode === "reset-password" && "Đặt mật khẩu mới"}
              </h2>

              <p className="text-gray-400 text-sm sm:text-base">
                {mode === "login" && (
                  <>
                    Chưa có tài khoản?{" "}
                    <button
                      type="button"
                      onClick={() => switchMode("register")}
                      className="text-primaryColor font-semibold hover:underline"
                    >
                      Đăng ký
                    </button>
                  </>
                )}
                {mode === "register" && (
                  <>
                    Đã có tài khoản?{" "}
                    <button
                      type="button"
                      onClick={() => switchMode("login")}
                      className="text-primaryColor font-semibold hover:underline"
                    >
                      Đăng nhập
                    </button>
                  </>
                )}
                {mode === "forgot-password" && (
                  <>
                    Nhớ mật khẩu?{" "}
                    <button
                      type="button"
                      onClick={() => switchMode("login")}
                      className="text-primaryColor font-semibold hover:underline"
                    >
                      Quay lại
                    </button>
                  </>
                )}
                {(mode === "verify-otp-register" || mode === "verify-otp-forgot-password") && (
                  <>
                    Mã OTP đã được gửi đến <br />
                    <span className="text-white font-medium mt-1 inline-block">
                      {formData.email}
                    </span>
                  </>
                )}
              </p>
            </div>

            {/* Error Message */}
            {errors.general && (
              <div
                className={`mb-6 p-4 rounded-xl text-sm border flex items-start gap-3 animate-fade-in backdrop-blur-md ${errors.general.includes("thành công") ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-red-500/10 border-red-500/30 text-red-400"}`}
              >
                <i
                  className={`fa-solid mt-0.5 ${errors.general.includes("thành công") ? "fa-circle-check" : "fa-circle-exclamation"}`}
                ></i>
                <p>{errors.general}</p>
              </div>
            )}

            {/* Login Form */}
            {mode === "login" && (
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-1">
                  <input
                    required
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="Email của bạn"
                    className="w-full px-5 py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 focus:border-primaryColor rounded-xl text-white placeholder-gray-500 transition-all outline-none backdrop-blur-sm shadow-inner"
                  />
                </div>

                <div className="space-y-1 relative">
                  <input
                    required
                    type={showPassword.password ? "text" : "password"}
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Mật khẩu"
                    className="w-full px-5 py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 focus:border-primaryColor rounded-xl text-white placeholder-gray-500 transition-all outline-none backdrop-blur-sm shadow-inner pr-12"
                  />
                  <button
                    type="button"
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                    onClick={() =>
                      setShowPassword({ ...showPassword, password: !showPassword.password })
                    }
                  >
                    <i className={`fas ${showPassword.password ? "fa-eye-slash" : "fa-eye"}`}></i>
                  </button>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => switchMode("forgot-password")}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    Quên mật khẩu?
                  </button>
                </div>

                <button
                  disabled={isLoading}
                  className="w-full py-4 bg-primaryColor hover:bg-hoverPrimaryColor text-black font-bold rounded-xl shadow-[0_0_20px_rgb(var(--ui-primary)/0.3)] hover:shadow-[0_0_25px_rgb(var(--ui-primary)/0.5)] transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2 active:scale-[0.98]"
                >
                  {isLoading ? <i className="fas fa-spinner fa-spin mr-2"></i> : "Đăng nhập"}
                </button>
              </form>
            )}

            {/* Register Form */}
            {mode === "register" && (
              <form onSubmit={handleRequestRegistrationOTP} className="space-y-4">
                <input
                  required
                  type="text"
                  name="username"
                  value={formData.username}
                  onChange={handleChange}
                  placeholder="Tên hiển thị"
                  className="w-full px-5 py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 focus:border-primaryColor rounded-xl text-white placeholder-gray-500 transition-all outline-none backdrop-blur-sm shadow-inner"
                />

                <div className="space-y-1">
                  <input
                    required
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="Email xác thực"
                    aria-invalid={Boolean(errors.email)}
                    className={`w-full px-5 py-3.5 bg-white/5 hover:bg-white/10 border focus:border-primaryColor rounded-xl text-white placeholder-gray-500 transition-all outline-none backdrop-blur-sm shadow-inner ${
                      errors.email ? "border-red-400/70" : "border-white/10"
                    }`}
                  />
                  {errors.email && <p className="text-red-400 text-sm">{errors.email}</p>}
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div className="relative">
                    <input
                      required
                      type={showPassword.password ? "text" : "password"}
                      name="password"
                      value={formData.password}
                      onChange={handleChange}
                      placeholder="Mật khẩu (tối thiểu 6 ký tự)"
                      className="w-full px-5 py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 focus:border-primaryColor rounded-xl text-white placeholder-gray-500 transition-all outline-none backdrop-blur-sm shadow-inner pr-12"
                    />
                    <button
                      type="button"
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                      onClick={() =>
                        setShowPassword({ ...showPassword, password: !showPassword.password })
                      }
                    >
                      <i className={`fas ${showPassword.password ? "fa-eye-slash" : "fa-eye"}`}></i>
                    </button>
                  </div>

                  <div className="relative">
                    <input
                      required
                      type={showPassword.confirmPassword ? "text" : "password"}
                      name="confirmPassword"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      placeholder="Xác nhận mật khẩu"
                      className="w-full px-5 py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 focus:border-primaryColor rounded-xl text-white placeholder-gray-500 transition-all outline-none backdrop-blur-sm shadow-inner pr-12"
                    />
                    <button
                      type="button"
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                      onClick={() =>
                        setShowPassword({
                          ...showPassword,
                          confirmPassword: !showPassword.confirmPassword,
                        })
                      }
                    >
                      <i
                        className={`fas ${showPassword.confirmPassword ? "fa-eye-slash" : "fa-eye"}`}
                      ></i>
                    </button>
                  </div>
                </div>

                <button
                  disabled={isLoading}
                  className="w-full py-4 bg-primaryColor hover:bg-hoverPrimaryColor text-black font-bold rounded-xl shadow-[0_0_20px_rgb(var(--ui-primary)/0.3)] hover:shadow-[0_0_25px_rgb(var(--ui-primary)/0.5)] transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-4 active:scale-[0.98]"
                >
                  {isLoading ? <i className="fas fa-spinner fa-spin mr-2"></i> : "Tiếp tục"}
                </button>
              </form>
            )}

            {/* Forgot Password Form */}
            {mode === "forgot-password" && (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <p className="text-sm text-gray-400">
                  Nhập email của bạn, chúng tôi sẽ gửi mã OTP để đặt lại mật khẩu.
                </p>
                <div className="space-y-1">
                  <input
                    required
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="Email đã đăng ký"
                    aria-invalid={Boolean(errors.email)}
                    className={`w-full px-5 py-3.5 bg-white/5 hover:bg-white/10 border focus:border-primaryColor rounded-xl text-white placeholder-gray-500 transition-all outline-none backdrop-blur-sm shadow-inner ${
                      errors.email ? "border-red-400/70" : "border-white/10"
                    }`}
                  />
                  {errors.email && <p className="text-red-400 text-sm">{errors.email}</p>}
                </div>

                <button
                  disabled={isLoading}
                  className="w-full py-4 bg-primaryColor hover:bg-hoverPrimaryColor text-black font-bold rounded-xl shadow-[0_0_20px_rgb(var(--ui-primary)/0.3)] hover:shadow-[0_0_25px_rgb(var(--ui-primary)/0.5)] transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-4 active:scale-[0.98]"
                >
                  {isLoading ? <i className="fas fa-spinner fa-spin mr-2"></i> : "Gửi mã OTP"}
                </button>
              </form>
            )}

            {/* Reset Password Form */}
            {mode === "reset-password" && (
              <form onSubmit={handleResetPassword} className="space-y-6">
                <div className="space-y-4">
                  <div className="relative">
                    <input
                      required
                      type={showPassword.password ? "text" : "password"}
                      name="password"
                      value={formData.password}
                      onChange={handleChange}
                      placeholder="Mật khẩu mới"
                      className="w-full px-5 py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 focus:border-primaryColor rounded-xl text-white placeholder-gray-500 transition-all outline-none backdrop-blur-sm shadow-inner pr-12"
                    />
                    <button
                      type="button"
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                      onClick={() =>
                        setShowPassword({ ...showPassword, password: !showPassword.password })
                      }
                    >
                      <i className={`fas ${showPassword.password ? "fa-eye-slash" : "fa-eye"}`}></i>
                    </button>
                  </div>
                  {errors.password && <p className="text-red-400 text-sm">{errors.password}</p>}

                  <div className="relative">
                    <input
                      required
                      type={showPassword.confirmPassword ? "text" : "password"}
                      name="confirmPassword"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      placeholder="Xác nhận mật khẩu mới"
                      className="w-full px-5 py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 focus:border-primaryColor rounded-xl text-white placeholder-gray-500 transition-all outline-none backdrop-blur-sm shadow-inner pr-12"
                    />
                    <button
                      type="button"
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                      onClick={() =>
                        setShowPassword({
                          ...showPassword,
                          confirmPassword: !showPassword.confirmPassword,
                        })
                      }
                    >
                      <i
                        className={`fas ${showPassword.confirmPassword ? "fa-eye-slash" : "fa-eye"}`}
                      ></i>
                    </button>
                  </div>
                  {errors.confirmPassword && (
                    <p className="text-red-400 text-sm">{errors.confirmPassword}</p>
                  )}
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => switchMode("forgot-password")}
                    className="w-1/3 py-4 bg-white/5 text-white font-semibold rounded-xl border border-white/10 hover:bg-white/10 transition-all backdrop-blur-sm active:scale-[0.98]"
                  >
                    Hủy
                  </button>
                  <button
                    disabled={isLoading}
                    className="w-2/3 py-4 bg-primaryColor hover:bg-hoverPrimaryColor text-black font-bold rounded-xl shadow-[0_0_20px_rgb(var(--ui-primary)/0.3)] hover:shadow-[0_0_25px_rgb(var(--ui-primary)/0.5)] transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
                  >
                    {isLoading ? <i className="fas fa-spinner fa-spin"></i> : "Xác nhận"}
                  </button>
                </div>
              </form>
            )}

            {/* OTP Verification Form for Register */}
            {mode === "verify-otp-register" && (
              <form onSubmit={handleVerifyRegisterOTP} className="space-y-8">
                <div
                  className="flex justify-center gap-1.5 sm:gap-3 w-full"
                  onPaste={handleOtpPaste}
                >
                  {[0, 1, 2, 3, 4, 5].map((index) => (
                    <input
                      key={index}
                      ref={(el) => (otpRefs.current[index] = el)}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={formData.otp[index] || ""}
                      onChange={(e) => handleOtpChange(index, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(index, e)}
                      className="w-[45px] h-[55px] sm:w-14 sm:h-16 text-center text-xl sm:text-2xl font-bold bg-white/5 border border-white/10 rounded-xl text-white focus:bg-white/10 focus:border-primaryColor focus:shadow-[0_0_15px_rgb(var(--ui-primary)/0.2)] outline-none transition-all shadow-inner placeholder-white/20"
                      placeholder="-"
                      autoComplete="one-time-code"
                    />
                  ))}
                </div>

                <div className="text-center">
                  <button
                    type="button"
                    disabled={resendTimer > 0 || isLoading}
                    onClick={handleResendOTP}
                    className="text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-50 disabled:hover:text-gray-400 font-medium"
                  >
                    {resendTimer > 0
                      ? `Gửi lại mã sau ${resendTimer}s`
                      : "Chưa nhận được mã? Gửi lại ngay"}
                  </button>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => switchMode("register")}
                    className="w-1/3 py-4 bg-white/5 text-white font-semibold rounded-xl border border-white/10 hover:bg-white/10 transition-all backdrop-blur-sm active:scale-[0.98]"
                  >
                    Hủy
                  </button>
                  <button
                    disabled={isLoading || formData.otp.length < 6}
                    className="w-2/3 py-4 bg-primaryColor hover:bg-hoverPrimaryColor text-black font-bold rounded-xl shadow-[0_0_20px_rgb(var(--ui-primary)/0.3)] hover:shadow-[0_0_25px_rgb(var(--ui-primary)/0.5)] transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
                  >
                    {isLoading ? <i className="fas fa-spinner fa-spin"></i> : "Xác nhận"}
                  </button>
                </div>
              </form>
            )}

            {/* OTP Verification Form for Forgot Password */}
            {mode === "verify-otp-forgot-password" && (
              <form onSubmit={handleVerifyForgotOTP} className="space-y-8">
                <div
                  className="flex justify-center gap-1.5 sm:gap-3 w-full"
                  onPaste={handleOtpPaste}
                >
                  {[0, 1, 2, 3, 4, 5].map((index) => (
                    <input
                      key={index}
                      ref={(el) => (otpRefs.current[index] = el)}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={formData.otp[index] || ""}
                      onChange={(e) => handleOtpChange(index, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(index, e)}
                      className="w-[45px] h-[55px] sm:w-14 sm:h-16 text-center text-xl sm:text-2xl font-bold bg-white/5 border border-white/10 rounded-xl text-white focus:bg-white/10 focus:border-primaryColor focus:shadow-[0_0_15px_rgb(var(--ui-primary)/0.2)] outline-none transition-all shadow-inner placeholder-white/20"
                      placeholder="-"
                      autoComplete="one-time-code"
                    />
                  ))}
                </div>

                <div className="text-center">
                  <button
                    type="button"
                    disabled={resendTimer > 0 || isLoading}
                    onClick={handleResendOTP}
                    className="text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-50 disabled:hover:text-gray-400 font-medium"
                  >
                    {resendTimer > 0
                      ? `Gửi lại mã sau ${resendTimer}s`
                      : "Chưa nhận được mã? Gửi lại ngay"}
                  </button>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => switchMode("forgot-password")}
                    className="w-1/3 py-4 bg-white/5 text-white font-semibold rounded-xl border border-white/10 hover:bg-white/10 transition-all backdrop-blur-sm active:scale-[0.98]"
                  >
                    Hủy
                  </button>
                  <button
                    disabled={isLoading || formData.otp.length < 6}
                    className="w-2/3 py-4 bg-primaryColor hover:bg-hoverPrimaryColor text-black font-bold rounded-xl shadow-[0_0_20px_rgb(var(--ui-primary)/0.3)] hover:shadow-[0_0_25px_rgb(var(--ui-primary)/0.5)] transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
                  >
                    {isLoading ? <i className="fas fa-spinner fa-spin"></i> : "Tiếp tục"}
                  </button>
                </div>
              </form>
            )}

            {/* Social Login Separator */}
            {mode === "login" && (
              <div className="mt-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="flex-1 border-t border-white/10"></div>
                  <span className="text-xs text-gray-500 uppercase tracking-widest font-semibold">
                    Hoặc đăng nhập với
                  </span>
                  <div className="flex-1 border-t border-white/10"></div>
                </div>

                <button
                  onClick={handleGoogleLogin}
                  type="button"
                  className="w-full py-4 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold rounded-xl flex items-center justify-center gap-3 transition-all group backdrop-blur-sm active:scale-[0.98]"
                >
                  <img
                    src="https://www.google.com/favicon.ico"
                    alt="Google"
                    className="w-5 h-5 group-hover:scale-110 transition-transform"
                  />
                  Tiếp tục với Google
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
