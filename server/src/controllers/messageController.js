const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const { getRecentMessages } = require('../utils/messageCache');

const sendMessage = async (ctx) => {
  try {
    const currentUser = ctx.state.user;
    const {
      conversationId,
      content,
      messageType = 'text',
      fileUrl = '',
      clientMsgId = '',
      replyTo = null
    } = ctx.request.body;

    if (!conversationId) {
      ctx.status = 400;
      ctx.body = {
        success: false,
        message: '会话ID不能为空'
      };
      return;
    }

    if (messageType === 'text' && !content) {
      ctx.status = 400;
      ctx.body = {
        success: false,
        message: '文本消息内容不能为空'
      };
      return;
    }

    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      ctx.status = 404;
      ctx.body = {
        success: false,
        message: '会话不存在'
      };
      return;
    }

    const isParticipant = conversation.participantIds.some(
      (id) => id.toString() === currentUser._id.toString()
    );

    if (!isParticipant) {
      ctx.status = 403;
      ctx.body = {
        success: false,
        message: '你不属于该会话，无法发送消息'
      };
      return;
    }

    const message = await Message.create({
      conversationId,
      conversationType: conversation.type,
      senderId: currentUser._id,
      messageType,
      content,
      fileUrl,
      clientMsgId,
      replyTo
    });

    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage:
        messageType === 'text'
          ? content
          : messageType === 'file'
          ? '[文件]'
          : messageType === 'audio'
          ? '[语音]'
          : `[${messageType}]`,
      lastMessageAt: message.sentAt
    });

    const populatedMessage = await Message.findById(message._id)
      .populate('senderId', 'username nickname avatar status')
      .populate({
        path: 'replyTo',
        select: 'content messageType senderId isRecalled fileUrl',
        populate: { path: 'senderId', select: 'username nickname avatar status' }
      });

    ctx.status = 201;
    ctx.body = {
      success: true,
      message: '发送消息成功',
      data: populatedMessage
    };
  } catch (error) {
    console.error('发送消息失败:', error.message);
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '服务器内部错误'
    };
  }
};

const getMessageList = async (ctx) => {
  try {
    const currentUser = ctx.state.user;
    const { conversationId, page = 1, pageSize = 20 } = ctx.query;

    if (!conversationId) {
      ctx.status = 400;
      ctx.body = {
        success: false,
        message: '会话ID不能为空'
      };
      return;
    }

    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      ctx.status = 404;
      ctx.body = {
        success: false,
        message: '会话不存在'
      };
      return;
    }

    const isParticipant = conversation.participantIds.some(
      (id) => id.toString() === currentUser._id.toString()
    );

    if (!isParticipant) {
      ctx.status = 403;
      ctx.body = {
        success: false,
        message: '你不属于该会话，无法查看消息'
      };
      return;
    }

    const currentPage = parseInt(page, 10);
    const currentPageSize = parseInt(pageSize, 10);
    const skip = (currentPage - 1) * currentPageSize;

    // “热路由”：首屏加载（第 1 页）优先命中 Redis ZSet 缓存
    if (currentPage === 1) {
      const cached = await getRecentMessages(conversationId, currentPageSize);
      if (cached && cached.length >= currentPageSize) {
        const total = await Message.countDocuments({ conversationId });
        ctx.status = 200;
        ctx.body = {
          success: true,
          message: '获取历史消息成功(缓存)',
          data: {
            list: cached,
            pagination: {
              page: 1,
              pageSize: currentPageSize,
              total
            }
          }
        };
        return;
      }
    }

    // “冷路由”：翻页或缓存未命中，回源 MongoDB
    const total = await Message.countDocuments({ conversationId });

    const messages = await Message.find({ conversationId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(currentPageSize)
      .populate('senderId', 'username nickname avatar status')
      .populate({
        path: 'replyTo',
        select: 'content messageType senderId isRecalled fileUrl',
        populate: { path: 'senderId', select: 'username nickname avatar status' }
      })
      .populate('readBy', 'nickname username avatar');

    ctx.status = 200;
    ctx.body = {
      success: true,
      message: '获取历史消息成功',
      data: {
        list: messages.reverse(),
        pagination: {
          page: currentPage,
          pageSize: currentPageSize,
          total
        }
      }
    };
  } catch (error) {
    console.error('获取历史消息失败:', error.message);
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '服务器内部错误'
    };
  }
};

module.exports = {
  sendMessage,
  getMessageList
};