const User = require('../models/User');

const uploadPublicKey = async (ctx) => {
  try {
    const currentUser = ctx.state.user;
    const { publicKey } = ctx.request.body;

    if (!publicKey) {
      ctx.status = 400;
      ctx.body = { success: false, message: '公钥不能为空' };
      return;
    }

    await User.findByIdAndUpdate(currentUser._id, { publicKey });

    ctx.status = 200;
    ctx.body = { success: true, message: '公钥上传成功' };
  } catch (error) {
    console.error('上传公钥失败:', error.message);
    ctx.status = 500;
    ctx.body = { success: false, message: '服务器内部错误' };
  }
};

const getPublicKey = async (ctx) => {
  try {
    const { userId } = ctx.params;
    const user = await User.findById(userId).select('publicKey').lean();

    if (!user || !user.publicKey) {
      ctx.status = 404;
      ctx.body = { success: false, message: '用户公钥不存在' };
      return;
    }

    ctx.status = 200;
    ctx.body = { success: true, data: { userId, publicKey: user.publicKey } };
  } catch (error) {
    console.error('获取公钥失败:', error.message);
    ctx.status = 500;
    ctx.body = { success: false, message: '服务器内部错误' };
  }
};

const batchGetPublicKeys = async (ctx) => {
  try {
    const { userIds } = ctx.request.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      ctx.status = 400;
      ctx.body = { success: false, message: '用户ID列表不能为空' };
      return;
    }

    const users = await User.find({ _id: { $in: userIds } })
      .select('_id publicKey')
      .lean();

    const keys = {};
    users.forEach((u) => {
      if (u.publicKey) {
        keys[u._id.toString()] = u.publicKey;
      }
    });

    ctx.status = 200;
    ctx.body = { success: true, data: keys };
  } catch (error) {
    console.error('批量获取公钥失败:', error.message);
    ctx.status = 500;
    ctx.body = { success: false, message: '服务器内部错误' };
  }
};

module.exports = { uploadPublicKey, getPublicKey, batchGetPublicKeys };
