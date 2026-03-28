const redisClient = require('./redis');

const MSG_CACHE_KEY = (conversationId) => `msg_cache:${conversationId}`;
const MAX_CACHED = 50;

/**
 * 将一条消息写入 Redis ZSet 缓存（以 sentAt 时间戳为分数）
 * @param {string} conversationId
 * @param {object} populatedMessage - 已 populate 的消息对象
 */
const pushMessage = async (conversationId, populatedMessage) => {
  try {
    const key = MSG_CACHE_KEY(conversationId);
    const score = new Date(populatedMessage.sentAt || populatedMessage.createdAt).getTime();
    await redisClient.zadd(key, score, JSON.stringify(populatedMessage));
    // 只保留最新的 MAX_CACHED 条，裁剪掉最旧的
    await redisClient.zremrangebyrank(key, 0, -(MAX_CACHED + 1));
    // 设置 2 小时 TTL，防止冷会话永驻内存
    await redisClient.expire(key, 7200);
  } catch (e) {
    console.error('pushMessage to Redis failed:', e.message);
  }
};

/**
 * 从 ZSet 缓存中拉取最新的 N 条消息（按时间正序返回）
 * @param {string} conversationId
 * @param {number} count - 拉取条数
 * @returns {Array} 已解析的消息对象数组（从旧到新）
 */
const getRecentMessages = async (conversationId, count = 50) => {
  try {
    const key = MSG_CACHE_KEY(conversationId);
    // ZREVRANGE 取最新的 count 条（分数降序），再 reverse 成正序
    const raw = await redisClient.zrevrange(key, 0, count - 1);
    if (!raw || raw.length === 0) return null; // null 代表缓存未命中
    return raw.reverse().map((item) => JSON.parse(item));
  } catch (e) {
    console.error('getRecentMessages from Redis failed:', e.message);
    return null;
  }
};

/**
 * 当消息撤回时，更新缓存中的对应条目
 * @param {string} conversationId
 * @param {string} messageId
 */
const invalidateMessage = async (conversationId, messageId) => {
  try {
    const key = MSG_CACHE_KEY(conversationId);
    const all = await redisClient.zrange(key, 0, -1);
    for (const item of all) {
      const parsed = JSON.parse(item);
      if (String(parsed._id) === String(messageId)) {
        // 先删旧的，再加新的（标记为已撤回）
        await redisClient.zrem(key, item);
        parsed.isRecalled = true;
        parsed.content = '';
        const score = new Date(parsed.sentAt || parsed.createdAt).getTime();
        await redisClient.zadd(key, score, JSON.stringify(parsed));
        break;
      }
    }
  } catch (e) {
    console.error('invalidateMessage in Redis failed:', e.message);
  }
};

module.exports = {
  pushMessage,
  getRecentMessages,
  invalidateMessage,
  MSG_CACHE_KEY,
  MAX_CACHED
};
