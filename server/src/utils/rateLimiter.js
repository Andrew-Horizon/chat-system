const redisClient = require('./redis');

/**
 * 检查给定 key 是否超过每秒最大请求限制
 * @param {string} key - Redis存储的键名
 * @param {number} limit - 限制次数 / 秒
 * @returns {Promise<boolean>} - 如果超出限制返回 true，否则返回 false
 */
const isRateLimited = async (key, limit = 5) => {
  try {
    const currentCount = await redisClient.incr(key);
    if (currentCount === 1) {
      await redisClient.expire(key, 1);
    }
    return currentCount > limit;
  } catch (error) {
    console.error('频控检查失败:', error);
    // 降级处理，默认允许
    return false;
  }
};

module.exports = {
  isRateLimited
};
