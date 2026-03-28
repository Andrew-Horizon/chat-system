const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { registerVoiceCallHandlers } = require('./voiceCallHandlers');
const { registerVideoCallHandlers } = require('./videoCallHandlers');
const redisClient = require('../utils/redis');
const { isRateLimited } = require('../utils/rateLimiter');
const { pushMessage, invalidateMessage } = require('../utils/messageCache');

const onlineUsers = new Map();

const setupSocket = (io) => {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error('未提供认证令牌'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      const user = await User.findById(decoded.userId).select('-password');

      if (!user) {
        return next(new Error('用户不存在'));
      }

      socket.user = user;
      next();
    } catch (error) {
      next(new Error('Socket 认证失败'));
    }
  });

  io.on('connection', async (socket) => {
    const currentUser = socket.user;
    
    socket.join(`user:${currentUser._id.toString()}`);

    console.log(`用户已连接: ${currentUser.username} (${socket.id})`);

    registerVoiceCallHandlers(io, socket);
    registerVideoCallHandlers(io, socket);

    onlineUsers.set(currentUser._id.toString(), socket.id);

    await redisClient.setex(`online:${currentUser._id.toString()}`, 60, socket.id);

    io.emit('user:online', {
      userId: currentUser._id,
      status: 'online'
    });

    socket.on('heartbeat', async () => {
      await redisClient.expire(`online:${currentUser._id.toString()}`, 60);
    });

    socket.on('chat:join', async (conversationId) => {
      try {
        const conversation = await Conversation.findById(conversationId);

        if (!conversation) {
          socket.emit('chat:error', {
            message: '会话不存在'
          });
          return;
        }

        const isParticipant = conversation.participantIds.some(
          (id) => id.toString() === currentUser._id.toString()
        );

        if (!isParticipant) {
          socket.emit('chat:error', {
            message: '你不属于该会话'
          });
          return;
        }

        socket.join(conversationId);
        console.log(`${currentUser.username} 加入会话 ${conversationId}`);
      } catch (error) {
        socket.emit('chat:error', {
          message: '加入会话失败'
        });
      }
    });

    socket.on('chat:leave', (conversationId) => {
      socket.leave(conversationId);
      console.log(`${currentUser.username} 离开会话 ${conversationId}`);
    });

    socket.on('message:send', async (payload) => {
      try {
        const {
          conversationId,
          content,
          messageType = 'text',
          fileUrl = '',
          clientMsgId = '',
          replyTo = null,
          encrypted = false,
          encryptedKeys = undefined,
          iv = ''
        } = payload;

        if (!conversationId) {
          socket.emit('message:error', {
            message: '会话ID不能为空'
          });
          return;
        }

        if (messageType === 'text' && !content) {
          socket.emit('message:error', {
            message: '文本消息内容不能为空'
          });
          return;
        }

        const conversation = await Conversation.findById(conversationId);

        if (!conversation) {
          socket.emit('message:error', {
            message: '会话不存在'
          });
          return;
        }

        const isParticipant = conversation.participantIds.some(
          (id) => id.toString() === currentUser._id.toString()
        );

        if (!isParticipant) {
          socket.emit('message:error', {
            message: '你不属于该会话'
          });
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
          replyTo,
          encrypted,
          encryptedKeys: encrypted ? encryptedKeys : undefined,
          iv: encrypted ? iv : ''
        });

        await Conversation.findByIdAndUpdate(conversationId, {
          lastMessage: encrypted ? '[加密消息]' : (messageType === 'text' ? content : `[${messageType}]`),
          lastMessageAt: message.sentAt
        });

        const receivers = conversation.participantIds.filter(
          id => id.toString() !== currentUser._id.toString()
        );
        if (receivers.length > 0) {
          const pipeline = redisClient.pipeline();
          receivers.forEach(rId => {
            pipeline.incr(`unread:${conversationId}:${rId.toString()}`);
          });
          await pipeline.exec();
        }

        const fullMessage = await Message.findById(message._id)
          .populate('senderId', 'username nickname avatar status')
          .populate({
            path: 'replyTo',
            select: 'content messageType senderId isRecalled fileUrl',
            populate: { path: 'senderId', select: 'username nickname avatar status' }
          });

        io.to(conversationId).emit('message:new', {
          success: true,
          data: fullMessage
        });

        // 写入 Redis ZSet 缓存
        await pushMessage(conversationId, fullMessage.toObject ? fullMessage.toObject() : fullMessage);

        receivers.forEach(rId => {
          io.to(`user:${rId.toString()}`).emit('message:new', {
            success: true,
            data: fullMessage
          });
        });

        socket.emit('message:ack', {
          success: true,
          message: '消息发送成功',
          data: {
            clientMsgId,
            serverMsgId: message._id
          }
        });
      } catch (error) {
        console.error('Socket 消息发送失败:', error.message);
        socket.emit('message:error', {
          message: '消息发送失败'
        });
      }
    });

    socket.on('message:recall', async (payload) => {
      try {
        const { messageId, conversationId } = payload;
        if (!messageId || !conversationId) return;

        const message = await Message.findById(messageId);
        if (!message) return;

        if (message.senderId.toString() !== currentUser._id.toString()) {
          socket.emit('message:error', { message: '无权撤回该消息' });
          return;
        }

        const now = Date.now();
        const sentTime = message.sentAt ? new Date(message.sentAt).getTime() : now;
        if (now - sentTime > 2 * 60 * 1000) {
          socket.emit('message:error', { message: '发送时间已超时两分钟，无法撤回' });
          return;
        }

        message.isRecalled = true;
        await message.save();

        const latestMsg = await Message.findOne({ conversationId }).sort({ createdAt: -1 });
        if (latestMsg && String(latestMsg._id) === String(message._id)) {
           await Conversation.findByIdAndUpdate(conversationId, {
             lastMessage: '[撤回了一条消息]'
           });
        }

        io.to(conversationId).emit('message:recalled', {
          success: true,
          messageId,
          conversationId,
          recalledBy: currentUser._id
        });

        // 同步撤回到 Redis 缓存
        await invalidateMessage(conversationId, messageId);
      } catch (error) {
        console.error('撤回消息失败:', error.message);
      }
    });

    socket.on('message:read', async (payload) => {
      try {
        const { messageIds, conversationId } = payload;
        if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0 || !conversationId) return;

        await Message.updateMany(
          { _id: { $in: messageIds }, conversationId },
          { $addToSet: { readBy: currentUser._id } }
        );

        await redisClient.del(`unread:${conversationId}:${currentUser._id.toString()}`);

        io.to(conversationId).emit('message:readReceipt', {
          success: true,
          messageIds,
          conversationId,
          userId: currentUser._id
        });
      } catch (error) {
        console.error('发送已读回执失败:', error.message);
      }
    });

    socket.on('disconnect', async () => {
      console.log(`用户断开连接: ${currentUser.username} (${socket.id})`);

      onlineUsers.delete(currentUser._id.toString());
      
      await redisClient.del(`online:${currentUser._id.toString()}`);

      io.emit('user:offline', {
        userId: currentUser._id,
        status: 'offline'
      });
    });
  });
};

module.exports = setupSocket;