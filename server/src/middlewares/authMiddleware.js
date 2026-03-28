const jwt = require('jsonwebtoken');
const User = require('../models/User');
const redisClient = require('../utils/redis');

const authMiddleware = async (ctx, next) => {
  try {
    const authHeader = ctx.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      ctx.status = 401;
      ctx.body = {
        success: false,
        message: '未提供有效的认证令牌'
      };
      return;
    }

    const token = authHeader.split(' ')[1];

    const isBlacklisted = await redisClient.get(`blacklist:${token}`);
    if (isBlacklisted) {
      ctx.status = 401;
      ctx.body = {
        success: false,
        message: '令牌已注销失效，请重新登录'
      };
      return;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.userId).select('-password');

    if (!user) {
      ctx.status = 401;
      ctx.body = {
        success: false,
        message: '用户不存在或令牌无效'
      };
      return;
    }

    ctx.state.user = user;

    await next();
  } catch (error) {
    ctx.status = 401;
    ctx.body = {
      success: false,
      message: '认证失败，请重新登录'
    };
  }
};

module.exports = authMiddleware;