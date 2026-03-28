const Friendship = require('../models/Friendship');
const User = require('../models/User');
const { getIO } = require('../utils/socketStore');

const sendFriendRequest = async (ctx) => {
  try {
    const currentUser = ctx.state.user;
    const { friendId } = ctx.request.body;

    if (!friendId) {
      ctx.status = 400;
      ctx.body = {
        success: false,
        message: '好友ID不能为空'
      };
      return;
    }

    if (currentUser._id.toString() === friendId) {
      ctx.status = 400;
      ctx.body = {
        success: false,
        message: '不能添加自己为好友'
      };
      return;
    }

    const targetUser = await User.findById(friendId);

    if (!targetUser) {
      ctx.status = 404;
      ctx.body = {
        success: false,
        message: '目标用户不存在'
      };
      return;
    }

    const existingRelation = await Friendship.findOne({
      $or: [
        { requesterId: currentUser._id, recipientId: friendId },
        { requesterId: friendId, recipientId: currentUser._id }
      ]
    });

    if (existingRelation) {
      if (existingRelation.status === 'accepted') {
        ctx.status = 409;
        ctx.body = {
          success: false,
          message: '该用户已是你的好友'
        };
        return;
      }

      if (existingRelation.status === 'pending') {
        ctx.status = 409;
        ctx.body = {
          success: false,
          message: '好友申请已存在，请勿重复发送'
        };
        return;
      }

      if (existingRelation.status === 'rejected') {
        // 允许重新申请
        existingRelation.requesterId = currentUser._id;
        existingRelation.recipientId = friendId;
        existingRelation.status = 'pending';
        await existingRelation.save();

        const io = getIO();
        if (io) {
          io.to(`user:${friendId}`).emit('friend:requested', {
            userId: currentUser._id,
            message: '你收到新的好友申请'
          });
        }

        ctx.status = 200;
        ctx.body = {
          success: true,
          message: '好友申请已重新发送'
        };
        return;
      }
    }

    await Friendship.create({
      requesterId: currentUser._id,
      recipientId: friendId,
      status: 'pending'
    });

    const io = getIO();
    if (io) {
      io.to(`user:${friendId}`).emit('friend:requested', {
        userId: currentUser._id,
        message: '你收到新的好友申请'
      });
    }

    ctx.status = 201;
    ctx.body = {
      success: true,
      message: '好友申请发送成功'
    };
  } catch (error) {
    console.error('发送好友申请失败:', error.message);
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '服务器内部错误'
    };
  }
};

const getFriendList = async (ctx) => {
  try {
    const currentUser = ctx.state.user;

    const relations = await Friendship.find({
      status: 'accepted',
      $or: [
        { requesterId: currentUser._id },
        { recipientId: currentUser._id }
      ]
    })
      .populate('requesterId', 'username nickname avatar status')
      .populate('recipientId', 'username nickname avatar status');

    const friendList = relations.map((item) => {
      const isRequester = item.requesterId._id.toString() === currentUser._id.toString();
      const friend = isRequester ? item.recipientId : item.requesterId;

      return {
        id: friend._id,
        username: friend.username,
        nickname: friend.nickname,
        avatar: friend.avatar,
        status: friend.status,
        relationId: item._id
      };
    });

    ctx.status = 200;
    ctx.body = {
      success: true,
      message: '获取好友列表成功',
      data: friendList
    };
  } catch (error) {
    console.error('获取好友列表失败:', error.message);
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '服务器内部错误'
    };
  }
};

const searchUsers = async (ctx) => {
  try {
    const currentUser = ctx.state.user;
    const { keyword = '' } = ctx.query;

    const trimmedKeyword = keyword.trim();

    if (!trimmedKeyword) {
      ctx.status = 200;
      ctx.body = {
        success: true,
        message: '搜索成功',
        data: []
      };
      return;
    }

    const users = await User.find({
      _id: { $ne: currentUser._id },
      $or: [
        { username: { $regex: trimmedKeyword, $options: 'i' } },
        { nickname: { $regex: trimmedKeyword, $options: 'i' } }
      ]
    }).select('_id username nickname avatar status');

    const relations = await Friendship.find({
      $or: [
        { requesterId: currentUser._id, recipientId: { $in: users.map((u) => u._id) } },
        { requesterId: { $in: users.map((u) => u._id) }, recipientId: currentUser._id }
      ]
    });

    const relationMap = new Map();

    relations.forEach((item) => {
      const otherId =
        item.requesterId.toString() === currentUser._id.toString()
          ? item.recipientId.toString()
          : item.requesterId.toString();

      relationMap.set(otherId, item.status);
    });

    const result = users.map((user) => ({
      id: user._id,
      username: user.username,
      nickname: user.nickname,
      avatar: user.avatar,
      status: user.status,
      relationStatus: relationMap.get(user._id.toString()) || 'none'
    }));

    ctx.status = 200;
    ctx.body = {
      success: true,
      message: '搜索成功',
      data: result
    };
  } catch (error) {
    console.error('搜索用户失败:', error.message);
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '服务器内部错误'
    };
  }
};

const getPendingRequests = async (ctx) => {
  try {
    const currentUser = ctx.state.user;

    const requests = await Friendship.find({
      recipientId: currentUser._id,
      status: 'pending'
    }).populate('requesterId', 'username nickname avatar status');

    const result = requests.map((item) => ({
      id: item._id,
      requester: {
        id: item.requesterId._id,
        username: item.requesterId.username,
        nickname: item.requesterId.nickname,
        avatar: item.requesterId.avatar,
        status: item.requesterId.status
      },
      createdAt: item.createdAt
    }));

    ctx.status = 200;
    ctx.body = {
      success: true,
      message: '获取好友申请成功',
      data: result
    };
  } catch (error) {
    console.error('获取好友申请失败:', error.message);
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '服务器内部错误'
    };
  }
};

const handleFriendRequest = async (ctx) => {
  try {
    const currentUser = ctx.state.user;
    const { requestId, action } = ctx.request.body;

    if (!requestId || !action) {
      ctx.status = 400;
      ctx.body = {
        success: false,
        message: '参数不完整'
      };
      return;
    }

    if (!['accept', 'reject'].includes(action)) {
      ctx.status = 400;
      ctx.body = {
        success: false,
        message: '处理动作不合法'
      };
      return;
    }

    const request = await Friendship.findOne({
      _id: requestId,
      recipientId: currentUser._id,
      status: 'pending'
    });

    if (!request) {
      ctx.status = 404;
      ctx.body = {
        success: false,
        message: '好友申请不存在'
      };
      return;
    }

    request.status = action === 'accept' ? 'accepted' : 'rejected';
    await request.save();

    ctx.status = 200;
    ctx.body = {
      success: true,
      message: action === 'accept' ? '已同意好友申请' : '已拒绝好友申请'
    };
  } catch (error) {
    console.error('处理好友申请失败:', error.message);
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '服务器内部错误'
    };
  }
};

const deleteFriend = async (ctx) => {
  try {
    const currentUser = ctx.state.user;
    const { friendId } = ctx.request.body;

    if (!friendId) {
      ctx.status = 400;
      ctx.body = {
        success: false,
        message: '好友ID不能为空'
      };
      return;
    }

    const relation = await Friendship.findOneAndDelete({
      status: 'accepted',
      $or: [
        { requesterId: currentUser._id, recipientId: friendId },
        { requesterId: friendId, recipientId: currentUser._id }
      ]
    });

    if (!relation) {
      ctx.status = 404;
      ctx.body = {
        success: false,
        message: '好友关系不存在'
      };
      return;
    }

    ctx.status = 200;
    ctx.body = {
      success: true,
      message: '删除好友成功'
    };
  } catch (error) {
    console.error('删除好友失败:', error.message);
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '服务器内部错误'
    };
  }
};

module.exports = {
  sendFriendRequest,
  getFriendList,
  searchUsers,
  getPendingRequests,
  handleFriendRequest,
  deleteFriend
};