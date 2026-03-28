const Message = require('../models/Message');
const Conversation = require('../models/Conversation');

const buildLastMessageText = (callInfo = {}, content = '') => {
  if (content) return content;

  const mediaLabel = callInfo.mediaType === 'video' ? '视频通话' : '语音通话';

  switch (callInfo.action) {
    case 'start':
      return `发起了${mediaLabel}`;
    case 'accept':
      return `${mediaLabel}已接通`;
    case 'reject':
      return `拒绝了${mediaLabel}`;
    case 'end':
      return `${mediaLabel}已结束`;
    case 'join':
      return `加入了${mediaLabel}`;
    case 'leave':
      return `退出了${mediaLabel}`;
    case 'missed':
      return `${mediaLabel}未接通`;
    default:
      return mediaLabel;
  }
};

const createCallMessageAndBroadcast = async (io, {
  conversationId,
  senderId,
  content = '',
  callInfo = {}
}) => {
  const conversation = await Conversation.findById(conversationId);

  if (!conversation) {
    throw new Error('会话不存在，无法记录通话消息');
  }

  const finalContent = buildLastMessageText(callInfo, content);

  const message = await Message.create({
    conversationId,
    conversationType: conversation.type,
    senderId,
    messageType: 'call',
    content: finalContent,
    fileUrl: '',
    clientMsgId: '',
    callInfo
  });

  await Conversation.findByIdAndUpdate(conversationId, {
    lastMessage: finalContent,
    lastMessageAt: message.createdAt || new Date()
  });

  const populatedMessage = await Message.findById(message._id)
    .populate('senderId', 'username nickname avatar status');

  const participantIds = (conversation.participantIds || []).map((id) => id.toString());

  participantIds.forEach((userId) => {
    io.to(`user:${userId}`).emit('message:new', {
      data: populatedMessage
    });
  });

  return populatedMessage;
};

module.exports = {
  createCallMessageAndBroadcast
};