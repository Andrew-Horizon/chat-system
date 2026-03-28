const { privateCalls, groupCalls } = require('../utils/callStore');
const Conversation = require('../models/Conversation');
const GroupMember = require('../models/GroupMember');
const { createCallMessageAndBroadcast } = require('../utils/callMessageLogger');

const buildUserInfo = (user, extra = {}) => ({
  id: user._id?.toString?.() || user.id || '',
  username: user.username || '',
  nickname: user.nickname || '',
  avatar: user.avatar || '',
  status: user.status || 'offline',
  isMuted: false,
  ...extra
});

const emitToUserRoom = (io, userId, eventName, payload) => {
  io.to(`user:${userId.toString()}`).emit(eventName, payload);
};

const getOnlineUserIdsInGroup = (io, participantIds, excludeUserId) => {
  return participantIds
    .map((id) => id.toString())
    .filter((id) => id !== excludeUserId.toString())
    .filter((id) => {
      const room = io.sockets.adapter.rooms.get(`user:${id}`);
      return !!room && room.size > 0;
    });
};

const getGroupParticipantIdsFromDB = async ({ groupId, conversationId }) => {
  if (conversationId) {
    const conversation = await Conversation.findById(conversationId).select('participantIds');
    if (conversation?.participantIds?.length) {
      return conversation.participantIds.map((id) => id.toString());
    }
  }

  if (groupId) {
    const members = await GroupMember.find({ groupId }).select('userId');
    if (members?.length) {
      return members.map((item) => item.userId.toString());
    }
  }

  return [];
};

const buildParticipantList = (participantsMap) => {
  return Array.from(participantsMap.values());
};

const broadcastGroupCallUpdate = (io, groupCall) => {
  const payload = {
    callId: groupCall.callId,
    groupId: groupCall.groupId,
    groupName: groupCall.groupName,
    conversationId: groupCall.conversationId,
    status: groupCall.status,
    acceptedAt: groupCall.acceptedAt,
    participants: buildParticipantList(groupCall.participants)
  };

  const targetUserIds = Array.from(groupCall.participants.keys());

  targetUserIds.forEach((userId) => {
    emitToUserRoom(io, userId, 'voice:group:update', payload);
  });
};

const registerVoiceCallHandlers = (io, socket) => {
  const currentUser = socket.user;

  socket.on('voice:private:start', async (payload) => {
    try {
      const { conversationId, targetUserId } = payload || {};

      if (!conversationId || !targetUserId) {
        socket.emit('voice:private:error', {
          message: '语音邀请参数不完整'
        });
        return;
      }

      if (targetUserId.toString() === currentUser._id.toString()) {
        socket.emit('voice:private:error', {
          message: '不能给自己发起语音聊天'
        });
        return;
      }

      const targetRoom = io.sockets.adapter.rooms.get(`user:${targetUserId.toString()}`);
      const isTargetOnline = !!targetRoom && targetRoom.size > 0;

      if (!isTargetOnline) {
        socket.emit('voice:private:offline', {
          conversationId,
          targetUserId,
          message: '对方不在线'
        });
        return;
      }

      const callId = `private_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const callData = {
        callId,
        type: 'private',
        conversationId,
        callerId: currentUser._id.toString(),
        calleeId: targetUserId.toString(),
        callerInfo: buildUserInfo(currentUser),
        calleeInfo: null,
        status: 'ringing',
        startedAt: Date.now(),
        acceptedAt: null
      };

      privateCalls.set(callId, callData);

      await createCallMessageAndBroadcast(io, {
        conversationId,
        senderId: currentUser._id,
        content: `${currentUser.nickname || currentUser.username} 发起了语音通话`,
        callInfo: {
          mediaType: 'voice',
          action: 'start',
          durationSec: 0,
          targetUserId
        }
      });

      socket.emit('voice:private:waiting', {
        callId,
        conversationId,
        targetUserId,
        message: '等待对方接通...'
      });

      emitToUserRoom(io, targetUserId, 'voice:private:incoming', {
        callId,
        conversationId,
        caller: buildUserInfo(currentUser),
        message: `${currentUser.nickname || currentUser.username} 发来语音聊天邀请`
      });
    } catch (error) {
      console.error('发起单聊语音失败:', error.message);
      socket.emit('voice:private:error', {
        message: '发起语音聊天失败'
      });
    }
  });

  socket.on('voice:private:accept', async (payload) => {
    try {
      const { callId } = payload || {};
      const callData = privateCalls.get(callId);

      if (!callData) {
        socket.emit('voice:private:error', {
          message: '通话不存在或已结束'
        });
        return;
      }

      if (callData.calleeId !== currentUser._id.toString()) {
        socket.emit('voice:private:error', {
          message: '无权接听此通话'
        });
        return;
      }

      callData.status = 'active';
      callData.acceptedAt = Date.now();
      callData.calleeInfo = buildUserInfo(currentUser);
      privateCalls.set(callId, callData);

      await createCallMessageAndBroadcast(io, {
        conversationId: callData.conversationId,
        senderId: currentUser._id,
        content: `${currentUser.nickname || currentUser.username} 接通了语音通话`,
        callInfo: {
          mediaType: 'voice',
          action: 'accept',
          durationSec: 0,
          targetUserId: callData.callerId
        }
      });

      const acceptedPayload = {
        callId,
        conversationId: callData.conversationId,
        callerId: callData.callerId,
        calleeId: callData.calleeId,
        acceptedAt: callData.acceptedAt,
        otherUser: buildUserInfo(currentUser)
      };

      emitToUserRoom(io, callData.callerId, 'voice:private:accepted', acceptedPayload);
      emitToUserRoom(io, callData.calleeId, 'voice:private:accepted', {
        ...acceptedPayload,
        otherUser: callData.callerInfo
      });
    } catch (error) {
      console.error('接听单聊语音失败:', error.message);
      socket.emit('voice:private:error', {
        message: '接听语音聊天失败'
      });
    }
  });

  socket.on('voice:private:reject', async (payload) => {
    try {
      const { callId } = payload || {};
      const callData = privateCalls.get(callId);

      if (!callData) {
        socket.emit('voice:private:error', {
          message: '通话不存在或已结束'
        });
        return;
      }

      if (callData.calleeId !== currentUser._id.toString()) {
        socket.emit('voice:private:error', {
          message: '无权拒绝此通话'
        });
        return;
      }

      emitToUserRoom(io, callData.callerId, 'voice:private:rejected', {
        callId,
        conversationId: callData.conversationId,
        message: '对方拒绝了语音聊天'
      });

      emitToUserRoom(io, callData.calleeId, 'voice:private:ended', {
        callId,
        conversationId: callData.conversationId,
        message: '已拒绝语音聊天'
      });

      privateCalls.delete(callId);

      await createCallMessageAndBroadcast(io, {
        conversationId: callData.conversationId,
        senderId: currentUser._id,
        content: `${currentUser.nickname || currentUser.username} 拒绝了语音通话`,
        callInfo: {
          mediaType: 'voice',
          action: 'reject',
          durationSec: 0,
          targetUserId: callData.callerId
        }
      });
    } catch (error) {
      console.error('拒绝单聊语音失败:', error.message);
      socket.emit('voice:private:error', {
        message: '拒绝语音聊天失败'
      });
    }
  });

  socket.on('voice:private:end', async (payload) => {
    try {
      const { callId } = payload || {};
      const callData = privateCalls.get(callId);

      if (!callData) {
        socket.emit('voice:private:error', {
          message: '通话不存在或已结束'
        });
        return;
      }

      const currentUserId = currentUser._id.toString();
      if (
        callData.callerId !== currentUserId &&
        callData.calleeId !== currentUserId
      ) {
        socket.emit('voice:private:error', {
          message: '无权挂断此通话'
        });
        return;
      }

      const otherUserId =
        callData.callerId === currentUserId
          ? callData.calleeId
          : callData.callerId;

      emitToUserRoom(io, otherUserId, 'voice:private:ended', {
        callId,
        conversationId: callData.conversationId,
        message: '对方已挂断语音聊天结束'
      });

      emitToUserRoom(io, currentUserId, 'voice:private:ended', {
        callId,
        conversationId: callData.conversationId,
        message: '语音聊天已结束'
      });

      privateCalls.delete(callId);

      const durationSec = callData.acceptedAt
        ? Math.max(0, Math.floor((Date.now() - callData.acceptedAt) / 1000))
        : 0;

      await createCallMessageAndBroadcast(io, {
        conversationId: callData.conversationId,
        senderId: currentUser._id,
        content: `语音通话结束${durationSec > 0 ? `（${durationSec}秒）` : ''}`,
        callInfo: {
          mediaType: 'voice',
          action: 'end',
          durationSec,
          targetUserId: otherUserId
        }
      });
    } catch (error) {
      console.error('挂断单聊语音失败:', error.message);
      socket.emit('voice:private:error', {
        message: '挂断语音聊天失败'
      });
    }
  });

  socket.on('voice:private:mute-change', (payload) => {
    try {
      const { callId, isMuted } = payload || {};
      const callData = privateCalls.get(callId);
      if (!callData) return;

      const currentUserId = currentUser._id.toString();
      let targetUserId = '';

      if (callData.callerId === currentUserId) {
        callData.callerInfo = {
          ...(callData.callerInfo || buildUserInfo(currentUser)),
          isMuted: !!isMuted
        };
        targetUserId = callData.calleeId;
      } else if (callData.calleeId === currentUserId) {
        callData.calleeInfo = {
          ...(callData.calleeInfo || buildUserInfo(currentUser)),
          isMuted: !!isMuted
        };
        targetUserId = callData.callerId;
      } else {
        return;
      }

      privateCalls.set(callId, callData);

      emitToUserRoom(io, targetUserId, 'voice:private:mute-changed', {
        callId,
        userId: currentUserId,
        isMuted: !!isMuted
      });

      emitToUserRoom(io, currentUserId, 'voice:private:mute-changed', {
        callId,
        userId: currentUserId,
        isMuted: !!isMuted
      });
    } catch (error) {
      console.error('同步单聊静音状态失败:', error.message);
    }
  });

  socket.on('webrtc:offer', (payload) => {
    try {
      const { callId, sdp } = payload || {};
      const callData = privateCalls.get(callId);
      if (!callData) return;

      const currentUserId = currentUser._id.toString();
      const targetUserId =
        callData.callerId === currentUserId
          ? callData.calleeId
          : callData.callerId;

      emitToUserRoom(io, targetUserId, 'webrtc:offer', {
        callId,
        sdp
      });
    } catch (error) {
      console.error('转发 offer 失败:', error.message);
    }
  });

  socket.on('webrtc:answer', (payload) => {
    try {
      const { callId, sdp } = payload || {};
      const callData = privateCalls.get(callId);
      if (!callData) return;

      const currentUserId = currentUser._id.toString();
      const targetUserId =
        callData.callerId === currentUserId
          ? callData.calleeId
          : callData.callerId;

      emitToUserRoom(io, targetUserId, 'webrtc:answer', {
        callId,
        sdp
      });
    } catch (error) {
      console.error('转发 answer 失败:', error.message);
    }
  });

  socket.on('webrtc:ice-candidate', (payload) => {
    try {
      const { callId, candidate } = payload || {};
      const callData = privateCalls.get(callId);
      if (!callData) return;

      const currentUserId = currentUser._id.toString();
      const targetUserId =
        callData.callerId === currentUserId
          ? callData.calleeId
          : callData.callerId;

      emitToUserRoom(io, targetUserId, 'webrtc:ice-candidate', {
        callId,
        candidate
      });
    } catch (error) {
      console.error('转发 ICE candidate 失败:', error.message);
    }
  });

  socket.on('voice:group:start', async (payload) => {
    try {
      const {
        groupId,
        conversationId,
        groupName = '群聊'
      } = payload || {};

      if (!groupId || !conversationId) {
        socket.emit('voice:group:error', {
          message: '群聊语音参数不完整'
        });
        return;
      }

      const existingGroupCall = groupCalls.get(groupId.toString());

      if (existingGroupCall && existingGroupCall.status !== 'ended') {
        socket.emit('voice:group:ongoing', {
          callId: existingGroupCall.callId,
          groupId: existingGroupCall.groupId,
          groupName: existingGroupCall.groupName,
          conversationId: existingGroupCall.conversationId,
          acceptedAt: existingGroupCall.acceptedAt,
          participants: buildParticipantList(existingGroupCall.participants),
          message: '语音聊天正在进行，是否加入'
        });
        return;
      }

      const allParticipantIds = await getGroupParticipantIdsFromDB({
        groupId,
        conversationId
      });

      const onlineUserIds = getOnlineUserIdsInGroup(
        io,
        allParticipantIds,
        currentUser._id.toString()
      );

      if (onlineUserIds.length === 0) {
        socket.emit('voice:group:offline', {
          groupId,
          groupName,
          conversationId,
          message: '群聊好友无人在线'
        });
        return;
      }

      const callId = `group_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const participantsMap = new Map();
      participantsMap.set(currentUser._id.toString(), buildUserInfo(currentUser));

      const groupCall = {
        callId,
        type: 'group',
        conversationId,
        groupId: groupId.toString(),
        initiatorId: currentUser._id.toString(),
        initiatorInfo: buildUserInfo(currentUser),
        status: 'ringing',
        participants: participantsMap,
        invitedUserIds: onlineUserIds,
        startedAt: Date.now(),
        acceptedAt: null,
        groupName
      };

      groupCalls.set(groupId.toString(), groupCall);

      await createCallMessageAndBroadcast(io, {
        conversationId,
        senderId: currentUser._id,
        content: `${currentUser.nickname || currentUser.username} 发起了群聊语音通话`,
        callInfo: {
          mediaType: 'voice',
          action: 'start',
          durationSec: 0,
          groupId
        }
      });

      socket.emit('voice:group:waiting', {
        callId,
        groupId,
        groupName,
        conversationId,
        message: '等待接通...'
      });

      onlineUserIds.forEach((userId) => {
        emitToUserRoom(io, userId, 'voice:group:incoming', {
          callId,
          groupId: groupId.toString(),
          groupName,
          conversationId,
          caller: buildUserInfo(currentUser),
          message: `${currentUser.nickname || currentUser.username} 发来群聊语音聊天邀请`
        });
      });
    } catch (error) {
      console.error('发起群聊语音失败:', error.message);
      socket.emit('voice:group:error', {
        message: '发起群聊语音失败'
      });
    }
  });

  socket.on('voice:group:query', async (payload) => {
    try {
      const { groupId } = payload || {};
      if (!groupId) return;

      const groupCall = groupCalls.get(groupId.toString());

      if (!groupCall || groupCall.status === 'ended') {
        socket.emit('voice:group:not-found', {
          groupId
        });
        return;
      }

      socket.emit('voice:group:ongoing', {
        callId: groupCall.callId,
        groupId: groupCall.groupId,
        groupName: groupCall.groupName,
        conversationId: groupCall.conversationId,
        acceptedAt: groupCall.acceptedAt,
        participants: buildParticipantList(groupCall.participants),
        message: '语音聊天正在进行，是否加入'
      });
    } catch (error) {
      console.error('查询群聊语音状态失败:', error.message);
    }
  });

  socket.on('voice:group:join', async (payload) => {
    try {
      const { groupId } = payload || {};
      const groupCall = groupCalls.get(groupId?.toString());

      if (!groupCall || groupCall.status === 'ended') {
        socket.emit('voice:group:error', {
          message: '群聊语音不存在或已结束'
        });
        return;
      }

      const currentUserId = currentUser._id.toString();

      if (!groupCall.participants.has(currentUserId)) {
        groupCall.participants.set(currentUserId, buildUserInfo(currentUser));
      }

      if (!groupCall.acceptedAt) {
        groupCall.acceptedAt = Date.now();
      }

      groupCall.status = 'active';
      groupCalls.set(groupId.toString(), groupCall);

      await createCallMessageAndBroadcast(io, {
        conversationId: groupCall.conversationId,
        senderId: currentUser._id,
        content: `${currentUser.nickname || currentUser.username} 加入了群聊语音通话`,
        callInfo: {
          mediaType: 'voice',
          action: 'join',
          durationSec: 0,
          groupId: groupCall.groupId
        }
      });

      broadcastGroupCallUpdate(io, groupCall);
    } catch (error) {
      console.error('加入群聊语音失败:', error.message);
      socket.emit('voice:group:error', {
        message: '加入群聊语音失败'
      });
    }
  });

  socket.on('voice:group:reject', async (payload) => {
    try {
      const { groupId } = payload || {};
      const groupCall = groupCalls.get(groupId?.toString());
      if (!groupCall || groupCall.status === 'ended') return;

      emitToUserRoom(io, currentUser._id.toString(), 'voice:group:ended', {
        groupId: groupId.toString(),
        conversationId: groupCall.conversationId,
        message: '已拒绝群聊语音邀请'
      });
    } catch (error) {
      console.error('拒绝群聊语音失败:', error.message);
    }
  });

  socket.on('voice:group:leave', async (payload) => {
    try {
      const { groupId } = payload || {};
      const groupCall = groupCalls.get(groupId?.toString());
      if (!groupCall || groupCall.status === 'ended') return;

      const currentUserId = currentUser._id.toString();

      groupCall.participants.delete(currentUserId);
      groupCall.invitedUserIds = groupCall.invitedUserIds.filter(
        (id) => id.toString() !== currentUserId
      );

      emitToUserRoom(io, currentUserId, 'voice:group:ended', {
        groupId: groupId.toString(),
        conversationId: groupCall.conversationId,
        message: '已退出群聊语音'
      });

      if (groupCall.participants.size === 0) {
        const targetUserIds = new Set([
          ...groupCall.invitedUserIds.map((id) => id.toString()),
          currentUserId
        ]);

        targetUserIds.forEach((userId) => {
          emitToUserRoom(io, userId, 'voice:group:ended', {
            groupId: groupId.toString(),
            conversationId: groupCall.conversationId,
            message: '本次群聊语音聊天结束'
          });
        });

const durationSec = groupCall.acceptedAt
  ? Math.max(0, Math.floor((Date.now() - groupCall.acceptedAt) / 1000))
  : 0;

await createCallMessageAndBroadcast(io, {
  conversationId: groupCall.conversationId,
  senderId: currentUser._id,
  content: `群聊语音通话结束${durationSec > 0 ? `（${durationSec}秒）` : ''}`,
  callInfo: {
    mediaType: 'voice',
    action: 'end',
    durationSec,
    groupId: groupCall.groupId
  }
});

        groupCalls.delete(groupId.toString());
        return;
      }

      groupCalls.set(groupId.toString(), groupCall);

      await createCallMessageAndBroadcast(io, {
        conversationId: groupCall.conversationId,
        senderId: currentUser._id,
        content: `${currentUser.nickname || currentUser.username} 退出了群聊语音通话`,
        callInfo: {
          mediaType: 'voice',
          action: 'leave',
          durationSec: 0,
          groupId: groupCall.groupId
        }
      });

      broadcastGroupCallUpdate(io, groupCall);
    } catch (error) {
      console.error('退出群聊语音失败:', error.message);
    }
  });

  socket.on('voice:group:mute-change', (payload) => {
    try {
      const { groupId, isMuted } = payload || {};
      const groupCall = groupCalls.get(groupId?.toString());
      if (!groupCall || groupCall.status === 'ended') return;

      const currentUserId = currentUser._id.toString();
      const currentInfo = groupCall.participants.get(currentUserId);
      if (!currentInfo) return;

      groupCall.participants.set(currentUserId, {
        ...currentInfo,
        isMuted: !!isMuted
      });

      groupCalls.set(groupId.toString(), groupCall);
      broadcastGroupCallUpdate(io, groupCall);
    } catch (error) {
      console.error('同步群聊静音状态失败:', error.message);
    }
  });

  socket.on('webrtc:group-offer', (payload) => {
    try {
      const { groupId, targetUserId, sdp } = payload || {};
      const groupCall = groupCalls.get(groupId?.toString());
      if (!groupCall || groupCall.status === 'ended') return;

      emitToUserRoom(io, targetUserId, 'webrtc:group-offer', {
        groupId: groupId.toString(),
        sourceUserId: currentUser._id.toString(),
        sourceUser: buildUserInfo(currentUser),
        sdp
      });
    } catch (error) {
      console.error('转发群聊 offer 失败:', error.message);
    }
  });

  socket.on('webrtc:group-answer', (payload) => {
    try {
      const { groupId, targetUserId, sdp } = payload || {};
      const groupCall = groupCalls.get(groupId?.toString());
      if (!groupCall || groupCall.status === 'ended') return;

      emitToUserRoom(io, targetUserId, 'webrtc:group-answer', {
        groupId: groupId.toString(),
        sourceUserId: currentUser._id.toString(),
        sourceUser: buildUserInfo(currentUser),
        sdp
      });
    } catch (error) {
      console.error('转发群聊 answer 失败:', error.message);
    }
  });

  socket.on('webrtc:group-ice-candidate', (payload) => {
    try {
      const { groupId, targetUserId, candidate } = payload || {};
      const groupCall = groupCalls.get(groupId?.toString());
      if (!groupCall || groupCall.status === 'ended') return;

      emitToUserRoom(io, targetUserId, 'webrtc:group-ice-candidate', {
        groupId: groupId.toString(),
        sourceUserId: currentUser._id.toString(),
        sourceUser: buildUserInfo(currentUser),
        candidate
      });
    } catch (error) {
      console.error('转发群聊 ICE candidate 失败:', error.message);
    }
  });

  socket.on('disconnect', () => {
    const currentUserId = currentUser._id.toString();

    for (const [callId, callData] of privateCalls.entries()) {
      if (
        callData.callerId === currentUserId ||
        callData.calleeId === currentUserId
      ) {
        const otherUserId =
          callData.callerId === currentUserId
            ? callData.calleeId
            : callData.callerId;

        emitToUserRoom(io, otherUserId, 'voice:private:ended', {
          callId,
          conversationId: callData.conversationId,
          message: '对方已离线，语音聊天结束'
        });

        privateCalls.delete(callId);
      }
    }

    for (const [groupId, groupCall] of groupCalls.entries()) {
      if (groupCall.participants.has(currentUserId)) {
        groupCall.participants.delete(currentUserId);
        groupCall.invitedUserIds = groupCall.invitedUserIds.filter(
          (id) => id.toString() !== currentUserId
        );

        if (groupCall.participants.size === 0) {
          const targetUserIds = new Set([
            ...groupCall.invitedUserIds.map((id) => id.toString()),
            currentUserId
          ]);

          targetUserIds.forEach((userId) => {
            emitToUserRoom(io, userId, 'voice:group:ended', {
              groupId,
              conversationId: groupCall.conversationId,
              message: '本次群聊语音聊天结束'
            });
          });

          groupCalls.delete(groupId);
        } else {
          groupCalls.set(groupId, groupCall);
          broadcastGroupCallUpdate(io, groupCall);
        }
      }
    }
  });
};

module.exports = {
  registerVoiceCallHandlers
};