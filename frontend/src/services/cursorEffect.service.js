import apiRequest from "./utils/apiRequest";

const cursorEffectService = {
  /**
   * Lấy danh sách hiệu ứng kèm trạng thái owned/equipped
   * @returns {Promise<Array>}
   */
  getEffects: () =>
    apiRequest(`/cursor-effects`, {
      requiresAuth: true,
    }),

  /**
   * Mua hiệu ứng bằng coin
   * @param {string} effectId
   * @returns {Promise<Object>}
   */
  purchase: (effectId) =>
    apiRequest(`/cursor-effects/purchase`, {
      method: "POST",
      data: { effectId },
      requiresAuth: true,
    }),

  /**
   * Trang bị hiệu ứng
   * @param {string} effectId
   * @returns {Promise<Object>}
   */
  equip: (effectId) =>
    apiRequest(`/cursor-effects/equip`, {
      method: "POST",
      data: { effectId },
      requiresAuth: true,
    }),

  /**
   * Nhận hiệu ứng Halloween khi đã tìm đủ bí ngô ẩn
   * @param {Array<string>} spots
   * @returns {Promise<Object>}
   */
  claimHalloweenHunt: (spots) =>
    apiRequest(`/cursor-effects/halloween-hunt/claim`, {
      method: "POST",
      data: { spots },
      requiresAuth: true,
    }),

  /**
   * Bốc Kẹo Tiên Tri hôm nay (gọi lại trong ngày trả về quẻ cũ)
   * @returns {Promise<Object>}
   */
  drawHalloweenFortune: () =>
    apiRequest(`/cursor-effects/halloween-fortune`, {
      method: "POST",
      requiresAuth: true,
    }),
};

export default cursorEffectService;
