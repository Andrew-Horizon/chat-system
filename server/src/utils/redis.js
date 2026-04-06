const Redis = require('ioredis');

// 配置 Redis 客户端连接参数，支持 Docker 环境变量
const redisClient = new Redis(process.env.REDIS_URL || {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
  retryStrategy: (times) => {
    // 指数回退策略，最多重试 5000ms
    const delay = Math.min(times * 50, 5000);
    return delay;
  }
});

redisClient.on('connect', () => {
  console.log('🔗 Redis 连接成功');
});

redisClient.on('error', (err) => {
  console.error('❌ Redis 连接异常:', err);
});

module.exports = redisClient;
