const { privateVideoCalls, groupVideoCalls } = require('../utils/videoCallStore');
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
  cameraOff: false,
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

const broadcastGroupVideoUpdate = (io, groupCall) => {
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
    emitToUserRoom(io, userId, 'video:group:update', payload);
  });
};

const registerVideoCallHandlers = (io, socket) => {
  const currentUser = socket.user;

  socket.on('video:private:start', async (payload) => {
    try {
      const { conversationId, targetUserId } = payload || {};

      if (!conversationId || !targetUserId) {
        socket.emit('video:private:error', {
          message: '视频邀请参数不完整'
        });
        return;
      }

      if (targetUserId.toString() === currentUser._id.toString()) {
        socket.emit('video:private:error', {
          message: '不能给自己发起视频聊天'
        });
        return;
      }

      const targetRoom = io.sockets.adapter.rooms.get(`user:${targetUserId.toString()}`);
      const isTargetOnline = !!targetRoom && targetRoom.size > 0;

      if (!isTargetOnline) {
        socket.emit('video:private:offline', {
          conversationId,
          targetUserId,
          message: '对方不在线'
        });
        return;
      }

      const callId = `video_private_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

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

      privateVideoCalls.set(callId, callData);

      await createCallMessageAndBroadcast(io, {
        conversationId,
        senderId: currentUser._id,
        content: `${currentUser.nickname || currentUser.username} 发起了视频通话`,
        callInfo: {
          mediaType: 'video',
          action: 'start',
          durationSec: 0,
          targetUserId
        }
      });

      socket.emit('video:private:waiting', {
        callId,
        conversationId,
        targetUserId,
        message: '等待对方接通...'
      });

      emitToUserRoom(io, targetUserId, 'video:private:incoming', {
        callId,
        conversationId,
        caller: buildUserInfo(currentUser),
        message: `${currentUser.nickname || currentUser.username} 发来视频聊天邀请`
      });
    } catch (error) {
      console.error('发起单聊视频失败:', error.message);
      socket.emit('video:private:error', {
        message: '发起视频聊天失败'
      });
    }
  });

  socket.on('video:private:accept', async (payload) => {
    try {
      const { callId } = payload || {};
      const callData = privateVideoCalls.get(callId);

      if (!callData) {
        socket.emit('video:private:error', {
          message: '视频通话不存在或已结束'
        });
        return;
      }

      if (callData.calleeId !== currentUser._id.toString()) {
        socket.emit('video:private:error', {
          message: '无权接听此视频通话'
        });
        return;
      }

      callData.status = 'active';
      callData.acceptedAt = Date.now();
      callData.calleeInfo = buildUserInfo(currentUser);
      privateVideoCalls.set(callId, callData);

      await createCallMessageAndBroadcast(io, {
        conversationId: callData.conversationId,
        senderId: currentUser._id,
        content: `${currentUser.nickname || currentUser.username} 接通了视频通话`,
        callInfo: {
          mediaType: 'video',
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

      emitToUserRoom(io, callData.callerId, 'video:private:accepted', acceptedPayload);
      emitToUserRoom(io, callData.calleeId, 'video:private:accepted', {
        ...acceptedPayload,
        otherUser: callData.callerInfo
      });
    } catch (error) {
      console.error('接听单聊视频失败:', error.message);
      socket.emit('video:private:error', {
        message: '接听视频聊天失败'
      });
    }
  });

  socket.on('video:private:reject', async (payload) => {
    try {
      const { callId } = payload || {};
      const callData = privateVideoCalls.get(callId);

      if (!callData) {
        socket.emit('video:private:error', {
          message: '视频通话不存在或已结束'
        });
        return;
      }

      if (callData.calleeId !== currentUser._id.toString()) {
        socket.emit('video:private:error', {
          message: '无权拒绝此视频通话'
        });
        return;
      }

      emitToUserRoom(io, callData.callerId, 'video:private:rejected', {
        callId,
        conversationId: callData.conversationId,
        message: '对方拒绝了视频聊天'
      });

      emitToUserRoom(io, callData.calleeId, 'video:private:ended', {
        callId,
        conversationId: callData.conversationId,
        message: '已拒绝视频聊天'
      });

      privateVideoCalls.delete(callId);

      await createCallMessageAndBroadcast(io, {
        conversationId: callData.conversationId,
        senderId: currentUser._id,
        content: `${currentUser.nickname || currentUser.username} 拒绝了视频通话`,
        callInfo: {
          mediaType: 'video',
          action: 'reject',
          durationSec: 0,
          targetUserId: callData.callerId
        }
      });

    } catch (error) {
      console.error('拒绝单聊视频失败:', error.message);
      socket.emit('video:private:error', {
        message: '拒绝视频聊天失败'
      });
    }
  });

  socket.on('video:private:end', async (payload) => {
    try {
      const { callId } = payload || {};
      const callData = privateVideoCalls.get(callId);

      if (!callData) {
        socket.emit('video:private:error', {
          message: '视频通话不存在或已结束'
        });
        return;
      }

      const currentUserId = currentUser._id.toString();
      if (
        callData.callerId !== currentUserId &&
        callData.calleeId !== currentUserId
      ) {
        socket.emit('video:private:error', {
          message: '无权挂断此视频通话'
        });
        return;
      }

      const otherUserId =
        callData.callerId === currentUserId
          ? callData.calleeId
          : callData.callerId;

      emitToUserRoom(io, otherUserId, 'video:private:ended', {
        callId,
        conversationId: callData.conversationId,
        message: '对方已挂断视频聊天结束'
      });

      emitToUserRoom(io, currentUserId, 'video:private:ended', {
        callId,
        conversationId: callData.conversationId,
        message: '视频聊天已结束'
      });

      const durationSec = callData.acceptedAt
        ? Math.max(0, Math.floor((Date.now() - callData.acceptedAt) / 1000))
        : 0;

      await createCallMessageAndBroadcast(io, {
        conversationId: callData.conversationId,
        senderId: currentUser._id,
        content: `视频通话结束${durationSec > 0 ? `（${durationSec}秒）` : ''}`,
        callInfo: {
          mediaType: 'video',
          action: 'end',
          durationSec,
          targetUserId: otherUserId
        }
      });

      privateVideoCalls.delete(callId);
    } catch (error) {
      console.error('挂断单聊视频失败:', error.message);
      socket.emit('video:private:error', {
        message: '挂断视频聊天失败'
      });
    }
  });

  socket.on('video:private:media-change', (payload) => {
    try {
      const { callId, isMuted, cameraOff } = payload || {};
      const callData = privateVideoCalls.get(callId);
      if (!callData) return;

      const currentUserId = currentUser._id.toString();
      let targetUserId = '';

      if (callData.callerId === currentUserId) {
        callData.callerInfo = {
          ...(callData.callerInfo || buildUserInfo(currentUser)),
          ...(typeof isMuted === 'boolean' ? { isMuted } : {}),
          ...(typeof cameraOff === 'boolean' ? { cameraOff } : {})
        };
        targetUserId = callData.calleeId;
      } else if (callData.calleeId === currentUserId) {
        callData.calleeInfo = {
          ...(callData.calleeInfo || buildUserInfo(currentUser)),
          ...(typeof isMuted === 'boolean' ? { isMuted } : {}),
          ...(typeof cameraOff === 'boolean' ? { cameraOff } : {})
        };
        targetUserId = callData.callerId;
      } else {
        return;
      }

      privateVideoCalls.set(callId, callData);

      const mediaPayload = {
        callId,
        userId: currentUserId
      };

      if (typeof isMuted === 'boolean') mediaPayload.isMuted = isMuted;
      if (typeof cameraOff === 'boolean') mediaPayload.cameraOff = cameraOff;

      emitToUserRoom(io, targetUserId, 'video:private:media-changed', mediaPayload);
      emitToUserRoom(io, currentUserId, 'video:private:media-changed', mediaPayload);
    } catch (error) {
      console.error('同步单聊视频媒体状态失败:', error.message);
    }
  });

  socket.on('webrtc:video-offer', (payload) => {
    try {
      const { callId, sdp } = payload || {};
      const callData = privateVideoCalls.get(callId);
      if (!callData) return;

      const currentUserId = currentUser._id.toString();
      const targetUserId =
        callData.callerId === currentUserId
          ? callData.calleeId
          : callData.callerId;

      emitToUserRoom(io, targetUserId, 'webrtc:video-offer', {
        callId,
        sdp
      });
    } catch (error) {
      console.error('转发单聊视频 offer 失败:', error.message);
    }
  });

  socket.on('webrtc:video-answer', (payload) => {
    try {
      const { callId, sdp } = payload || {};
      const callData = privateVideoCalls.get(callId);
      if (!callData) return;

      const currentUserId = currentUser._id.toString();
      const targetUserId =
        callData.callerId === currentUserId
          ? callData.calleeId
          : callData.callerId;

      emitToUserRoom(io, targetUserId, 'webrtc:video-answer', {
        callId,
        sdp
      });
    } catch (error) {
      console.error('转发单聊视频 answer 失败:', error.message);
    }
  });

  socket.on('webrtc:video-ice-candidate', (payload) => {
    try {
      const { callId, candidate } = payload || {};
      const callData = privateVideoCalls.get(callId);
      if (!callData) return;

      const currentUserId = currentUser._id.toString();
      const targetUserId =
        callData.callerId === currentUserId
          ? callData.calleeId
          : callData.callerId;

      emitToUserRoom(io, targetUserId, 'webrtc:video-ice-candidate', {
        callId,
        candidate
      });
    } catch (error) {
      console.error('转发单聊视频 ICE candidate 失败:', error.message);
    }
  });

  socket.on('video:group:start', async (payload) => {
    try {
      const {
        groupId,
        conversationId,
        groupName = '群聊'
      } = payload || {};

      if (!groupId || !conversationId) {
        socket.emit('video:group:error', {
          message: '群聊视频参数不完整'
        });
        return;
      }

      const existingGroupCall = groupVideoCalls.get(groupId.toString());

      if (existingGroupCall && existingGroupCall.status !== 'ended') {
        socket.emit('video:group:ongoing', {
          callId: existingGroupCall.callId,
          groupId: existingGroupCall.groupId,
          groupName: existingGroupCall.groupName,
          conversationId: existingGroupCall.conversationId,
          acceptedAt: existingGroupCall.acceptedAt,
          participants: buildParticipantList(existingGroupCall.participants),
          message: '视频聊天正在进行，是否加入'
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
        socket.emit('video:group:offline', {
          groupId,
          groupName,
          conversationId,
          message: '群聊好友无人在线'
        });
        return;
      }

      const callId = `video_group_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

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

      groupVideoCalls.set(groupId.toString(), groupCall);

      await createCallMessageAndBroadcast(io, {
        conversationId,
        senderId: currentUser._id,
        content: `${currentUser.nickname || currentUser.username} 发起了群聊视频通话`,
        callInfo: {
          mediaType: 'video',
          action: 'start',
          durationSec: 0,
          groupId
        }
      });

      socket.emit('video:group:waiting', {
        callId,
        groupId,
        groupName,
        conversationId,
        message: '等待接通...'
      });

      onlineUserIds.forEach((userId) => {
        emitToUserRoom(io, userId, 'video:group:incoming', {
          callId,
          groupId: groupId.toString(),
          groupName,
          conversationId,
          caller: buildUserInfo(currentUser),
          message: `${currentUser.nickname || currentUser.username} 发来群聊视频聊天邀请`
        });
      });
    } catch (error) {
      console.error('发起群聊视频失败:', error.message);
      socket.emit('video:group:error', {
        message: '发起群聊视频失败'
      });
    }
  });

  socket.on('video:group:query', async (payload) => {
    try {
      const { groupId } = payload || {};
      if (!groupId) return;

      const groupCall = groupVideoCalls.get(groupId.toString());

      if (!groupCall || groupCall.status === 'ended') {
        socket.emit('video:group:not-found', {
          groupId
        });
        return;
      }

      socket.emit('video:group:ongoing', {
        callId: groupCall.callId,
        groupId: groupCall.groupId,
        groupName: groupCall.groupName,
        conversationId: groupCall.conversationId,
        acceptedAt: groupCall.acceptedAt,
        participants: buildParticipantList(groupCall.participants),
        message: '视频聊天正在进行，是否加入'
      });
    } catch (error) {
      console.error('查询群聊视频状态失败:', error.message);
    }
  });

  socket.on('video:group:join', async (payload) => {
    try {
      const { groupId } = payload || {};
      const groupCall = groupVideoCalls.get(groupId?.toString());

      if (!groupCall || groupCall.status === 'ended') {
        socket.emit('video:group:error', {
          message: '群聊视频不存在或已结束'
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
      groupVideoCalls.set(groupId.toString(), groupCall);

      await createCallMessageAndBroadcast(io, {
        conversationId: groupCall.conversationId,
        senderId: currentUser._id,
        content: `${currentUser.nickname || currentUser.username} 加入了群聊视频通话`,
        callInfo: {
          mediaType: 'video',
          action: 'join',
          durationSec: 0,
          groupId: groupCall.groupId
        }
      });

      broadcastGroupVideoUpdate(io, groupCall);
    } catch (error) {
      console.error('加入群聊视频失败:', error.message);
      socket.emit('video:group:error', {
        message: '加入群聊视频失败'
      });
    }
  });

  socket.on('video:group:reject', async (payload) => {
    try {
      const { groupId } = payload || {};
      const groupCall = groupVideoCalls.get(groupId?.toString());
      if (!groupCall || groupCall.status === 'ended') return;

      emitToUserRoom(io, currentUser._id.toString(), 'video:group:ended', {
        groupId: groupId.toString(),
        conversationId: groupCall.conversationId,
        message: '已拒绝群聊视频邀请'
      });
    } catch (error) {
      console.error('拒绝群聊视频失败:', error.message);
    }
  });

  socket.on('video:group:leave', async (payload) => {
    try {
      const { groupId } = payload || {};
      const groupCall = groupVideoCalls.get(groupId?.toString());
      if (!groupCall || groupCall.status === 'ended') return;

      const currentUserId = currentUser._id.toString();

      groupCall.participants.delete(currentUserId);
      groupCall.invitedUserIds = groupCall.invitedUserIds.filter(
        (id) => id.toString() !== currentUserId
      );

      emitToUserRoom(io, currentUserId, 'video:group:ended', {
        groupId: groupId.toString(),
        conversationId: groupCall.conversationId,
        message: '已退出群聊视频'
      });

      if (groupCall.participants.size === 0) {
        const targetUserIds = new Set([
          ...groupCall.invitedUserIds.map((id) => id.toString()),
          currentUserId
        ]);

        const durationSec = groupCall.acceptedAt
          ? Math.max(0, Math.floor((Date.now() - groupCall.acceptedAt) / 1000))
          : 0;

        await createCallMessageAndBroadcast(io, {
          conversationId: groupCall.conversationId,
          senderId: currentUser._id,
          content: `群聊视频通话结束${durationSec > 0 ? `（${durationSec}秒）` : ''}`,
          callInfo: {
            mediaType: 'video',
            action: 'end',
            durationSec,
            groupId: groupCall.groupId
          }
        });

        targetUserIds.forEach((userId) => {
          emitToUserRoom(io, userId, 'video:group:ended', {
            groupId: groupId.toString(),
            conversationId: groupCall.conversationId,
            message: '本次群聊视频聊天结束'
          });
        });

        groupVideoCalls.delete(groupId.toString());
        return;
      }

      await createCallMessageAndBroadcast(io, {
        conversationId: groupCall.conversationId,
        senderId: currentUser._id,
        content: `${currentUser.nickname || currentUser.username} 退出了群聊视频通话`,
        callInfo: {
          mediaType: 'video',
          action: 'leave',
          durationSec: 0,
          groupId: groupCall.groupId
        }
      });

      groupVideoCalls.set(groupId.toString(), groupCall);
      broadcastGroupVideoUpdate(io, groupCall);
    } catch (error) {
      console.error('退出群聊视频失败:', error.message);
    }
  });

  socket.on('video:group:media-change', (payload) => {
    try {
      const { groupId, isMuted, cameraOff } = payload || {};
      const groupCall = groupVideoCalls.get(groupId?.toString());
      if (!groupCall || groupCall.status === 'ended') return;

      const currentUserId = currentUser._id.toString();
      const currentInfo = groupCall.participants.get(currentUserId);
      if (!currentInfo) return;

      groupCall.participants.set(currentUserId, {
        ...currentInfo,
        ...(typeof isMuted === 'boolean' ? { isMuted } : {}),
        ...(typeof cameraOff === 'boolean' ? { cameraOff } : {})
      });

      groupVideoCalls.set(groupId.toString(), groupCall);
      broadcastGroupVideoUpdate(io, groupCall);
    } catch (error) {
      console.error('同步群聊视频媒体状态失败:', error.message);
    }
  });

  socket.on('webrtc:group-video-offer', (payload) => {
    try {
      const { groupId, targetUserId, sdp } = payload || {};
      const groupCall = groupVideoCalls.get(groupId?.toString());
      if (!groupCall || groupCall.status === 'ended') return;

      emitToUserRoom(io, targetUserId, 'webrtc:group-video-offer', {
        groupId: groupId.toString(),
        sourceUserId: currentUser._id.toString(),
        sourceUser: buildUserInfo(currentUser),
        sdp
      });
    } catch (error) {
      console.error('转发群聊视频 offer 失败:', error.message);
    }
  });

  socket.on('webrtc:group-video-answer', (payload) => {
    try {
      const { groupId, targetUserId, sdp } = payload || {};
      const groupCall = groupVideoCalls.get(groupId?.toString());
      if (!groupCall || groupCall.status === 'ended') return;

      emitToUserRoom(io, targetUserId, 'webrtc:group-video-answer', {
        groupId: groupId.toString(),
        sourceUserId: currentUser._id.toString(),
        sourceUser: buildUserInfo(currentUser),
        sdp
      });
    } catch (error) {
      console.error('转发群聊视频 answer 失败:', error.message);
    }
  });

  socket.on('webrtc:group-video-ice-candidate', (payload) => {
    try {
      const { groupId, targetUserId, candidate } = payload || {};
      const groupCall = groupVideoCalls.get(groupId?.toString());
      if (!groupCall || groupCall.status === 'ended') return;

      emitToUserRoom(io, targetUserId, 'webrtc:group-video-ice-candidate', {
        groupId: groupId.toString(),
        sourceUserId: currentUser._id.toString(),
        sourceUser: buildUserInfo(currentUser),
        candidate
      });
    } catch (error) {
      console.error('转发群聊视频 ICE candidate 失败:', error.message);
    }
  });

  socket.on('disconnect', () => {
    const currentUserId = currentUser._id.toString();

    for (const [callId, callData] of privateVideoCalls.entries()) {
      if (
        callData.callerId === currentUserId ||
        callData.calleeId === currentUserId
      ) {
        const otherUserId =
          callData.callerId === currentUserId
            ? callData.calleeId
            : callData.callerId;

        emitToUserRoom(io, otherUserId, 'video:private:ended', {
          callId,
          conversationId: callData.conversationId,
          message: '对方已离线，视频聊天结束'
        });

        privateVideoCalls.delete(callId);
      }
    }

    for (const [groupId, groupCall] of groupVideoCalls.entries()) {
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
            emitToUserRoom(io, userId, 'video:group:ended', {
              groupId,
              conversationId: groupCall.conversationId,
              message: '本次群聊视频聊天结束'
            });
          });

          groupVideoCalls.delete(groupId);
        } else {
          groupVideoCalls.set(groupId, groupCall);
          broadcastGroupVideoUpdate(io, groupCall);
        }
      }
    }
  });
};

module.exports = {
  registerVideoCallHandlers
};