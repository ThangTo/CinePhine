import React, { useState, useEffect } from "react";
import { settingsAPI } from "services/admin.service";
import { useTheme } from "contexts/ThemeContext";
import { FiCheck, FiLoader, FiSettings, FiLayout, FiCpu, FiExternalLink, FiSave } from "react-icons/fi";

const AdminSettingsTab = () => {
  const { allThemes, applySavedTheme } = useTheme();
  const [currentTheme, setCurrentTheme] = useState("default");
  const [colabUrl, setColabUrl] = useState("");
  const [featurePermissions, setFeaturePermissions] = useState({
    download_movie: { requiresPremium: false },
    korean_subtitles: { requiresPremium: false }
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingColab, setSavingColab] = useState(false);
  const [savingFeatures, setSavingFeatures] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  // Load current settings from server
  useEffect(() => {
    const loadSettings = async () => {
      try {
        setLoading(true);
        const [theme, url, features] = await Promise.all([
          settingsAPI.getTheme(),
          settingsAPI.getColabUrl(),
          settingsAPI.getFeaturePermissions()
        ]);
        setCurrentTheme(theme);
        setColabUrl(url);
        if (features) {
          setFeaturePermissions({
            download_movie: features.download_movie || { requiresPremium: false },
            korean_subtitles: features.korean_subtitles || { requiresPremium: false }
          });
        }
      } catch (error) {
        console.error("Failed to load settings:", error);
        setMessage({ type: "error", text: "Không thể tải cài đặt hệ thống" });
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, []);

  // Save theme to server
  const handleThemeChange = async (themeName) => {
    try {
      setSaving(true);
      setMessage({ type: "", text: "" });
      await settingsAPI.setTheme(themeName);
      applySavedTheme(themeName);
      setCurrentTheme(themeName);
      setMessage({ type: "success", text: "Đã cập nhật theme thành công!" });
      setTimeout(() => setMessage({ type: "", text: "" }), 3000);
    } catch (error) {
      console.error("Failed to save theme:", error);
      setMessage({ type: "error", text: "Không thể lưu cài đặt theme" });
    } finally {
      setSaving(false);
    }
  };

  // Save Colab URL
  const handleSaveColabUrl = async () => {
    try {
      setSavingColab(true);
      setMessage({ type: "", text: "" });
      await settingsAPI.updateColabUrl(colabUrl);
      setMessage({ type: "success", text: "Đã cập nhật URL Google Colab thành công!" });
      setTimeout(() => setMessage({ type: "", text: "" }), 3000);
    } catch (error) {
      console.error("Failed to save Colab URL:", error);
      setMessage({ type: "error", text: "Không thể lưu URL Google Colab" });
    } finally {
      setSavingColab(false);
    }
  };

  // Save Feature Permissions
  const handleSaveFeaturePermissions = async () => {
    try {
      setSavingFeatures(true);
      setMessage({ type: "", text: "" });
      await settingsAPI.updateFeaturePermissions(featurePermissions);
      setMessage({ type: "success", text: "Đã cập nhật phân quyền tính năng thành công!" });
      setTimeout(() => setMessage({ type: "", text: "" }), 3000);
    } catch (error) {
      console.error("Failed to save feature permissions:", error);
      setMessage({ type: "error", text: "Không thể lưu phân quyền tính năng" });
    } finally {
      setSavingFeatures(false);
    }
  };

  const toggleFeaturePermission = (featureKey) => {
    setFeaturePermissions(prev => ({
      ...prev,
      [featureKey]: { requiresPremium: !prev[featureKey]?.requiresPremium }
    }));
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="relative">
          <div className="w-12 h-12 rounded-full border-4 border-white/10 border-t-primaryColor animate-spin"></div>
        </div>
        <p className="text-gray-400 text-sm animate-pulse">Đang tải cấu hình...</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto animate-fade-in pb-20">
      {/* 1. Header */}
      <div className="mb-8 flex items-center gap-4 border-b border-white/5 pb-6">
        <div className="p-3 bg-primaryColor/10 rounded-xl text-primaryColor border border-primaryColor/20">
          <FiSettings size={28} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Cài Đặt Hệ Thống</h1>
          <p className="text-gray-400 text-sm mt-1">
            Quản lý giao diện và các dịch vụ xử lý dữ liệu của CinePhine.
          </p>
        </div>
      </div>

      {/* 2. Message Banner */}
      {message.text && (
        <div
          className={`mb-8 p-4 rounded-xl flex items-center gap-3 shadow-lg backdrop-blur-md transition-all duration-300 transform translate-y-0 ${
            message.type === "success"
              ? "bg-green-500/10 border border-green-500/30 text-green-400"
              : "bg-red-500/10 border border-red-500/30 text-red-400"
          }`}
        >
          {message.type === "success" ? (
            <FiCheck size={20} />
          ) : (
            <div className="w-5 h-5 rounded-full border-2 border-current flex items-center justify-center font-bold text-xs">
              !
            </div>
          )}
          <span className="font-medium">{message.text}</span>
        </div>
      )}

      <div className="space-y-12">
        {/* 3. Colab Whisper Section */}
        <section className="bg-white/5 border border-white/10 rounded-3xl p-8 space-y-6 overflow-hidden relative">
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <FiCpu size={120} />
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-white font-semibold text-xl">
                <FiCpu className="text-blue-400" />
                <h2>Remote Whisper (Google Colab GPU)</h2>
              </div>
              <p className="text-gray-400 text-sm max-w-2xl">
                Dán URL từ Ngrok chạy trên Google Colab để sử dụng model <b>Whisper Large-v3</b> với hiệu năng GPU mạnh mẽ.
                Để trống nếu muốn sử dụng model mặc định của Server.
              </p>
            </div>
            <a 
              href="https://colab.research.google.com/" 
              target="_blank" 
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-white text-sm font-medium rounded-xl border border-white/10 transition-all"
            >
              Mở Google Colab <FiExternalLink size={14} />
            </a>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 pt-2">
            <div className="flex-1 relative group">
              <input
                type="text"
                value={colabUrl}
                onChange={(e) => setColabUrl(e.target.value)}
                placeholder="https://xxxx-xxxx-xxxx.ngrok-free.app"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
              />
              <div className="absolute inset-y-0 right-3 flex items-center">
                {colabUrl && (
                  <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 text-[10px] font-bold uppercase tracking-wider border border-green-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                    Ready
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={handleSaveColabUrl}
              disabled={savingColab}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:opacity-50 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-900/20"
            >
              {savingColab ? <FiLoader className="animate-spin" /> : <FiSave />}
              <span>{savingColab ? "Đang lưu..." : "Cập nhật URL"}</span>
            </button>
          </div>
        </section>

        {/* 4. Feature Permissions Section */}
        <section className="bg-white/5 border border-white/10 rounded-3xl p-8 space-y-6">
          <div className="flex items-center gap-2 text-white font-semibold text-lg">
            <FiSettings className="text-purple-400" />
            <h2>Đặc quyền người dùng</h2>
          </div>
          <p className="text-gray-400 text-sm max-w-2xl mb-4">
            Bật tính năng "Yêu cầu Premium" nếu bạn muốn giới hạn chức năng đó chỉ dành cho các tài khoản đã mua gói trả phí.
          </p>

          <div className="space-y-4 max-w-xl">
            {/* Download Toggle */}
            <div className="flex items-center justify-between bg-black/40 border border-white/5 p-4 rounded-xl">
              <div>
                <h3 className="text-white font-medium">Tải phim</h3>
                <p className="text-gray-500 text-xs mt-1">Cho phép người dùng lưu video về máy.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer"
                  checked={featurePermissions.download_movie?.requiresPremium || false}
                  onChange={() => toggleFeaturePermission("download_movie")}
                />
                <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500"></div>
                <span className="ml-3 text-sm font-medium text-gray-300 w-28">
                  {featurePermissions.download_movie?.requiresPremium ? "Chỉ Premium" : "Tất cả User"}
                </span>
              </label>
            </div>

            {/* Subtitles Toggle */}
            <div className="flex items-center justify-between bg-black/40 border border-white/5 p-4 rounded-xl">
              <div>
                <h3 className="text-white font-medium">Phu de AI theo ngon ngu goc</h3>
                <p className="text-gray-500 text-xs mt-1">Gui yeu cau tao sub bang Whisper va hien thi phu de theo ngon ngu phim.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer"
                  checked={featurePermissions.korean_subtitles?.requiresPremium || false}
                  onChange={() => toggleFeaturePermission("korean_subtitles")}
                />
                <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500"></div>
                <span className="ml-3 text-sm font-medium text-gray-300 w-28">
                  {featurePermissions.korean_subtitles?.requiresPremium ? "Chỉ Premium" : "Tất cả User"}
                </span>
              </label>
            </div>
          </div>

          <div className="flex justify-start pt-2">
            <button
              onClick={handleSaveFeaturePermissions}
              disabled={savingFeatures}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 disabled:opacity-50 text-white font-bold rounded-xl transition-all shadow-lg shadow-purple-900/20"
            >
              {savingFeatures ? <FiLoader className="animate-spin" /> : <FiSave />}
              <span>{savingFeatures ? "Đang lưu..." : "Lưu phân quyền"}</span>
            </button>
          </div>
        </section>

        {/* 5. Theme Section */}
        <section className="space-y-6">
          <div className="flex items-center gap-2 text-white font-semibold text-lg">
            <FiLayout className="text-primaryColor" />
            <h2>Giao diện & Chủ đề</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Object.values(allThemes).map((theme) => {
              const isActive = currentTheme === theme.name;

              return (
                <button
                  key={theme.name}
                  onClick={() => handleThemeChange(theme.name)}
                  disabled={saving}
                  className={`group relative flex flex-col items-start w-full text-left rounded-2xl overflow-hidden transition-all duration-300 ${
                    isActive
                      ? "ring-2 ring-primaryColor ring-offset-2 ring-offset-[#0f172a] shadow-2xl shadow-primaryColor/20 scale-[1.02]"
                      : "border border-white/10 hover:border-white/20 hover:shadow-xl hover:-translate-y-1 opacity-80 hover:opacity-100"
                  } ${saving ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                >
                  {/* A. Mini UI Preview */}
                  <div
                    className="w-full h-40 relative overflow-hidden bg-gray-900 border-b border-white/5"
                    style={{ backgroundColor: theme.colors.background }}
                  >
                    {/* Giả lập Sidebar */}
                    <div
                      className="absolute left-0 top-0 bottom-0 w-1/4 opacity-30 flex flex-col gap-2 p-2"
                      style={{ backgroundColor: theme.colors.accent }}
                    >
                      <div className="w-8 h-8 rounded-full bg-white/20 mb-2"></div>
                      <div className="w-full h-2 rounded-full bg-white/10"></div>
                      <div className="w-3/4 h-2 rounded-full bg-white/10"></div>
                    </div>

                    {/* Giả lập Header & Content */}
                    <div className="absolute left-[25%] top-0 right-0 bottom-0 p-3 flex flex-col gap-3">
                      <div className="flex justify-between items-center">
                        <div className="w-1/3 h-3 rounded-full bg-white/10"></div>
                        <div className="w-6 h-6 rounded-full bg-white/10"></div>
                      </div>
                      <div
                        className="w-full h-16 rounded-lg shadow-sm flex items-center justify-center"
                        style={{ backgroundColor: theme.colors.primary }}
                      >
                        <div className="w-8 h-8 rounded-full bg-black/20"></div>
                      </div>
                      <div className="flex gap-2 mt-1">
                        <div className="w-1/3 h-12 rounded bg-white/5"></div>
                        <div className="w-1/3 h-12 rounded bg-white/5"></div>
                        <div className="w-1/3 h-12 rounded bg-white/5"></div>
                      </div>
                    </div>

                    {saving && isActive && (
                      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center z-20">
                        <FiLoader className="w-8 h-8 animate-spin text-white" />
                      </div>
                    )}
                  </div>

                  {/* B. Theme Info */}
                  <div className="w-full p-5 bg-bgColor3 flex items-center justify-between">
                    <div>
                      <h3
                        className={`font-bold text-base ${
                          isActive ? "text-white" : "text-gray-300 group-hover:text-white"
                        }`}
                      >
                        {theme.displayName}
                      </h3>
                      <p className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                        <span
                          className="inline-block w-2 h-2 rounded-full"
                          style={{ backgroundColor: theme.colors.primary }}
                        ></span>
                        {isActive ? "Đang kích hoạt" : "Nhấn để áp dụng"}
                      </p>
                    </div>
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
                        isActive
                          ? "bg-primaryColor text-black scale-100 opacity-100"
                          : "bg-white/5 text-gray-500 scale-0 opacity-0 group-hover:scale-100 group-hover:opacity-100"
                      }`}
                    >
                      <FiCheck size={16} strokeWidth={3} />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
};

export default AdminSettingsTab;
