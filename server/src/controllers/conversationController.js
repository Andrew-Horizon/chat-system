const Conversation = require('../models/Conversation');
const Friendship = require('../models/Friendship');
const User = require('../models/User');
const Group = require('../models/Group');

const createOrGetPrivateConversation = async (ctx) => {
  try {
    const currentUser = ctx.state.user;
    const { targetUserId } = ctx.request.body;

    if (!targetUserId) {
      ctx.status = 400;
      ctx.body = {
        success: false,
        message: '目标用户ID不能为空'
      };
      return;
    }

    if (currentUser._id.toString() === targetUserId) {
      ctx.status = 400;
      ctx.body = {
        success: false,
        message: '不能和自己创建单聊会话'
      };
      return;
    }

    const targetUser = await User.findById(targetUserId);

    if (!targetUser) {
      ctx.status = 404;
      ctx.body = {
        success: false,
        message: '目标用户不存在'
      };
      return;
    }

    const friendship = await Friendship.findOne({
      status: 'accepted',
      $or: [
        {
          requesterId: currentUser._id,
          recipientId: targetUserId
        },
        {
          requesterId: targetUserId,
          recipientId: currentUser._id
        }
      ]
    });

    if (!friendship) {
      ctx.status = 403;
      ctx.body = {
        success: false,
        message: '对方不是你的好友，无法创建单聊会话'
      };
      return;
    }

    let conversation = await Conversation.findOne({
      type: 'private',
      participantIds: { $all: [currentUser._id, targetUserId], $size: 2 }
    });

    if (!conversation) {
      conversation = await Conversation.create({
        type: 'private',
        participantIds: [currentUser._id, targetUserId],
        lastMessage: '',
        lastMessageAt: null
      });
    }

    ctx.status = 200;
    ctx.body = {
      success: true,
      message: '获取单聊会话成功',
      data: conversation
    };
  } catch (error) {
    console.error('创建或获取单聊会话失败:', error.message);
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '服务器内部错误'
    };
  }
};

const getConversationList = async (ctx) => {
  try {
    const currentUser = ctx.state.user;

    const conversations = await Conversation.find({
      participantIds: currentUser._id
    })
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .lean();

    const result = [];

    for (const conversation of conversations) {
      if (conversation.type === 'private') {
        const targetUserId = conversation.participantIds.find(
          (id) => id.toString() !== currentUser._id.toString()
        );

        const targetUser = await User.findById(targetUserId)
          .select('username nickname avatar status')
          .lean();

        result.push({
          id: conversation._id,
          type: conversation.type,
          targetUser: targetUser || null,
          groupInfo: null,
          lastMessage: conversation.lastMessage || '',
          lastMessageAt: conversation.lastMessageAt,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt
        });
      } else if (conversation.type === 'group') {
        const groupInfo = conversation.groupId
          ? await Group.findById(conversation.groupId)
              .select('name avatar description ownerId')
              .lean()
          : null;

        result.push({
          id: conversation._id,
          type: conversation.type,
          targetUser: null,
          groupInfo,
          lastMessage: conversation.lastMessage || '',
          lastMessageAt: conversation.lastMessageAt,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt
        });
      }
    }

    ctx.status = 200;
    ctx.body = {
      success: true,
      message: '获取会话列表成功',
      data: result
    };
  } catch (error) {
    console.error('获取会话列表失败:', error.message);
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '服务器内部错误'
    };
  }
};

module.exports = {
  createOrGetPrivateConversation,
  getConversationList
};