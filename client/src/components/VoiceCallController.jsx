import { useEffect, useRef, useState } from 'react';
import { getSocket } from '../utils/socket';
import VoiceCallModal from './VoiceCallModal';
import {
  createPrivatePeerConnection,
  createPrivateOffer,
  createPrivateAnswer,
  setPrivateRemoteDescription,
  addPrivateIceCandidate,
  ensureGroupPeerConnection,
  createGroupOffer,
  createGroupAnswer,
  setGroupRemoteDescription,
  addGroupIceCandidate,
  removeGroupPeerConnection,
  getLocalStream,
  cleanupAllWebRTC,
  cleanupPrivateWebRTC,
  cleanupGroupWebRTC
} from '../utils/webrtc';

const DEFAULT_STATE = {
  visible: false,
  mode: 'private',
  status: '',
  title: '语音聊天',
  message: '',
  callId: '',
  groupId: '',
  groupName: '',
  conversationId: '',
  otherUser: null,
  participants: [],
  acceptedAt: null
};

export default function VoiceCallController({
  currentConversation,
  currentUserInfo,
  showAlert
}) {
  const [voiceCallState, setVoiceCallState] = useState(DEFAULT_STATE);
  const [isMuted, setIsMuted] = useState(false);
  const [remoteMuted, setRemoteMuted] = useState(false);

  const localAudioRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const groupRemoteAudioMapRef = useRef(new Map());
  const isCallerRef = useRef(false);
  const negotiatedGroupPeersRef = useRef(new Set());

  const currentUserId =
    currentUserInfo?._id || currentUserInfo?.id || '';

  const applyMuteStateToLocalStream = async (muted) => {
    try {
      const localStream = await getLocalStream();
      const audioTracks = localStream.getAudioTracks();
      audioTracks.forEach((track) => {
        track.enabled = !muted;
      });
    } catch (error) {
      console.error('切换静音状态失败:', error);
    }
  };

  const syncMuteStatus = (muted) => {
    const socket = getSocket();
    if (!socket) return;

    if (voiceCallState.mode === 'private' && voiceCallState.callId) {
      socket.emit('voice:private:mute-change', {
        callId: voiceCallState.callId,
        isMuted: muted
      });
      return;
    }

    if (voiceCallState.mode === 'group' && voiceCallState.groupId) {
      socket.emit('voice:group:mute-change', {
        groupId: voiceCallState.groupId,
        isMuted: muted
      });
    }
  };

  const resetMuteState = async () => {
    setIsMuted(false);
    setRemoteMuted(false);

    try {
      const localStream = await getLocalStream();
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });
    } catch (error) {
      // ignore
    }
  };

  const toggleMute = async () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    await applyMuteStateToLocalStream(nextMuted);
    syncMuteStatus(nextMuted);
  };

  const playGroupRemoteStream = (peerUserId, remoteStream) => {
    let audioEl = groupRemoteAudioMapRef.current.get(peerUserId);

    if (!audioEl) {
      audioEl = new Audio();
      audioEl.autoplay = true;
      groupRemoteAudioMapRef.current.set(peerUserId, audioEl);
    }

    audioEl.srcObject = remoteStream;
    audioEl.play().catch(() => {});
  };

  const removeGroupRemoteAudio = (peerUserId) => {
    const audioEl = groupRemoteAudioMapRef.current.get(peerUserId);
    if (audioEl) {
      audioEl.pause();
      audioEl.srcObject = null;
      groupRemoteAudioMapRef.current.delete(peerUserId);
    }
  };

  const resetAllGroupRemoteAudios = () => {
    for (const [, audioEl] of groupRemoteAudioMapRef.current.entries()) {
      audioEl.pause();
      audioEl.srcObject = null;
    }
    groupRemoteAudioMapRef.current.clear();
  };

  const ensureLocalAudio = async () => {
    const localStream = await getLocalStream();
    if (localAudioRef.current) {
      localAudioRef.current.srcObject = localStream;
      localAudioRef.current.muted = true;
    }

    localStream.getAudioTracks().forEach((track) => {
      track.enabled = !isMuted;
    });
  };

  const setupPrivatePeer = async (callId) => {
    await createPrivatePeerConnection({
      onIceCandidate: (candidate) => {
        const socket = getSocket();
        if (!socket) return;

        socket.emit('webrtc:ice-candidate', {
          callId,
          candidate
        });
      },
      onTrack: (remoteStream) => {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = remoteStream;
          remoteAudioRef.current.play().catch(() => {});
        }
      },
      onConnectionStateChange: (state) => {
        if (state === 'failed' || state === 'disconnected' || state === 'closed') {
          showAlert('语音连接已断开');
        }
      }
    });

    await ensureLocalAudio();
  };

  const ensureGroupPeer = async (groupId, peerUserId) => {
    const socket = getSocket();
    if (!socket || !peerUserId) return;

    await ensureGroupPeerConnection({
      peerUserId,
      onIceCandidate: (targetPeerUserId, candidate) => {
        socket.emit('webrtc:group-ice-candidate', {
          groupId,
          targetUserId: targetPeerUserId,
          candidate
        });
      },
      onTrack: (targetPeerUserId, remoteStream) => {
        playGroupRemoteStream(targetPeerUserId, remoteStream);
      },
      onConnectionStateChange: (targetPeerUserId, state) => {
        if (state === 'failed' || state === 'closed' || state === 'disconnected') {
          removeGroupPeerConnection(targetPeerUserId);
          removeGroupRemoteAudio(targetPeerUserId);
          negotiatedGroupPeersRef.current.delete(`${groupId}_${targetPeerUserId}`);
        }
      }
    });

    await ensureLocalAudio();
  };

  const maybeCreateGroupOffers = async (groupId, participants) => {
    if (!currentUserId || !groupId) return;

    const otherParticipants = participants
      .map((item) => item.id || item._id)
      .filter(Boolean)
      .filter((id) => String(id) !== String(currentUserId));

    for (const peerUserId of otherParticipants) {
      await ensureGroupPeer(groupId, peerUserId);

      const pairKey = `${groupId}_${peerUserId}`;
      const shouldInitiate = String(currentUserId) < String(peerUserId);

      if (shouldInitiate && !negotiatedGroupPeersRef.current.has(pairKey)) {
        const offer = await createGroupOffer(peerUserId);
        const socket = getSocket();
        if (socket) {
          socket.emit('webrtc:group-offer', {
            groupId,
            targetUserId: peerUserId,
            sdp: offer
          });
        }
        negotiatedGroupPeersRef.current.add(pairKey);
      }
    }
  };

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleOffline = (payload) => {
      setVoiceCallState({
        ...DEFAULT_STATE,
        visible: true,
        mode: 'private',
        status: 'ended',
        title: '语音聊天',
        message: payload?.message || '对方不在线',
        conversationId: payload?.conversationId || '',
        otherUser: currentConversation?.targetUser || null
      });
    };

    const handleWaiting = (payload) => {
      isCallerRef.current = true;

      setVoiceCallState({
        ...DEFAULT_STATE,
        visible: true,
        mode: 'private',
        status: 'waiting',
        title: '语音聊天',
        message: payload?.message || '等待对方接通...',
        callId: payload?.callId || '',
        conversationId: payload?.conversationId || '',
        otherUser: currentConversation?.targetUser || null
      });
    };

    const handleIncoming = (payload) => {
      isCallerRef.current = false;

      setVoiceCallState({
        ...DEFAULT_STATE,
        visible: true,
        mode: 'private',
        status: 'incoming',
        title: '语音聊天邀请',
        message: payload?.message || '收到新的语音聊天邀请',
        callId: payload?.callId || '',
        conversationId: payload?.conversationId || '',
        otherUser: payload?.caller || null
      });
    };

    const handleAccepted = async (payload) => {
      try {
        await setupPrivatePeer(payload.callId);

        setVoiceCallState((prev) => ({
          ...prev,
          visible: true,
          mode: 'private',
          status: 'active',
          title: '语音聊天中',
          message: `正在与 ${payload?.otherUser?.nickname || payload?.otherUser?.username || '对方'} 语音聊天中`,
          callId: payload?.callId || prev.callId,
          conversationId: payload?.conversationId || prev.conversationId,
          otherUser: payload?.otherUser || prev.otherUser,
          acceptedAt: payload?.acceptedAt || Date.now()
        }));

        if (isCallerRef.current) {
          const offer = await createPrivateOffer();
          socket.emit('webrtc:offer', {
            callId: payload.callId,
            sdp: offer
          });
        }
      } catch (error) {
        console.error('建立单聊语音连接失败:', error);
        showAlert(error?.message || '建立语音连接失败');
      }
    };

    const handleRejected = async (payload) => {
      cleanupPrivateWebRTC();
      await resetMuteState();

      setVoiceCallState((prev) => ({
        ...prev,
        visible: true,
        mode: 'private',
        status: 'ended',
        title: '语音聊天',
        message: payload?.message || '对方拒绝了语音聊天',
        acceptedAt: null
      }));
    };

    const handleEnded = async (payload) => {
      cleanupPrivateWebRTC();
      await resetMuteState();

      setVoiceCallState((prev) => ({
        ...prev,
        visible: true,
        status: prev.mode === 'group' ? 'group-ended' : 'ended',
        title: '语音聊天',
        message: payload?.message || '语音聊天已结束',
        acceptedAt: null
      }));
    };

    const handlePrivateMuteChanged = (payload) => {
      const otherUserId =
        voiceCallState.otherUser?.id ||
        voiceCallState.otherUser?._id ||
        '';

      if (String(payload?.userId) === String(otherUserId)) {
        setRemoteMuted(!!payload?.isMuted);
      }
    };

    const handleError = (payload) => {
      showAlert(payload?.message || '语音聊天操作失败');
    };

    const handleOffer = async (payload) => {
      try {
        await setupPrivatePeer(payload.callId);
        await setPrivateRemoteDescription(payload.sdp);
        const answer = await createPrivateAnswer();

        socket.emit('webrtc:answer', {
          callId: payload.callId,
          sdp: answer
        });
      } catch (error) {
        console.error('处理单聊 offer 失败:', error);
        showAlert('建立语音连接失败');
      }
    };

    const handleAnswer = async (payload) => {
      try {
        await setPrivateRemoteDescription(payload.sdp);
      } catch (error) {
        console.error('处理单聊 answer 失败:', error);
      }
    };

    const handleIceCandidate = async (payload) => {
      try {
        await addPrivateIceCandidate(payload.candidate);
      } catch (error) {
        console.error('添加单聊 ICE candidate 失败:', error);
      }
    };

    const handleGroupOffline = (payload) => {
      setVoiceCallState({
        ...DEFAULT_STATE,
        visible: true,
        mode: 'group',
        status: 'group-ended',
        title: '群聊语音',
        message: payload?.message || '群聊好友无人在线',
        groupId: payload?.groupId || '',
        groupName: payload?.groupName || '',
        conversationId: payload?.conversationId || ''
      });
    };

    const handleGroupWaiting = (payload) => {
      setVoiceCallState({
        ...DEFAULT_STATE,
        visible: true,
        mode: 'group',
        status: 'group-waiting',
        title: '群聊语音',
        message: `正在等待群聊「${payload?.groupName || '群聊'}」的成员接通...`,
        callId: payload?.callId || '',
        groupId: payload?.groupId || '',
        groupName: payload?.groupName || '',
        conversationId: payload?.conversationId || '',
        participants: currentUserInfo
          ? [{ ...currentUserInfo, isMuted }]
          : []
      });
    };

    const handleGroupIncoming = (payload) => {
      const callerName =
        payload?.caller?.nickname || payload?.caller?.username || '好友';
      const groupName = payload?.groupName || '未知群聊';

      setVoiceCallState({
        ...DEFAULT_STATE,
        visible: true,
        mode: 'group',
        status: 'group-incoming',
        title: '群聊语音邀请',
        message: `${callerName} 邀请你加入群聊「${groupName}」的语音聊天`,
        callId: payload?.callId || '',
        groupId: payload?.groupId || '',
        groupName,
        conversationId: payload?.conversationId || '',
        otherUser: payload?.caller || null
      });
    };

    const handleGroupOngoing = (payload) => {
      const groupName = payload?.groupName || '群聊';

      setVoiceCallState({
        ...DEFAULT_STATE,
        visible: true,
        mode: 'group',
        status: 'group-ongoing',
        title: '群聊语音',
        message: `群聊「${groupName}」的语音聊天正在进行，是否加入`,
        callId: payload?.callId || '',
        groupId: payload?.groupId || '',
        groupName,
        conversationId: payload?.conversationId || '',
        participants: payload?.participants || [],
        acceptedAt: payload?.acceptedAt || null
      });
    };

    const handleGroupUpdate = async (payload) => {
      const groupName = payload?.groupName || '群聊';
      const participants = payload?.participants || [];
      const participantIds = participants
        .map((item) => item.id || item._id)
        .filter(Boolean)
        .map(String);

      if (!participantIds.includes(String(currentUserId))) {
        cleanupGroupWebRTC();
        resetAllGroupRemoteAudios();
        negotiatedGroupPeersRef.current.clear();
        await resetMuteState();

        setVoiceCallState(DEFAULT_STATE);
        return;
      }

      setVoiceCallState((prev) => ({
        ...prev,
        visible: true,
        mode: 'group',
        status: 'group-active',
        title: '群聊语音中',
        message: `正在群聊「${groupName}」语音聊天中`,
        callId: payload?.callId || prev.callId,
        groupId: payload?.groupId || prev.groupId,
        groupName,
        conversationId: payload?.conversationId || prev.conversationId,
        participants,
        acceptedAt: payload?.acceptedAt || prev.acceptedAt || Date.now()
      }));

      if (payload?.groupId && participants.length) {
        await maybeCreateGroupOffers(payload.groupId, participants);

        for (const [peerUserId] of groupRemoteAudioMapRef.current.entries()) {
          if (!participantIds.includes(String(peerUserId))) {
            removeGroupPeerConnection(peerUserId);
            removeGroupRemoteAudio(peerUserId);
            negotiatedGroupPeersRef.current.delete(`${payload.groupId}_${peerUserId}`);
          }
        }
      }
    };

    const handleGroupEnded = async (payload) => {
      cleanupGroupWebRTC();
      resetAllGroupRemoteAudios();
      negotiatedGroupPeersRef.current.clear();
      await resetMuteState();

      setVoiceCallState((prev) => ({
        ...prev,
        visible: true,
        mode: 'group',
        status: 'group-ended',
        title: '群聊语音',
        message: payload?.message || '本次群聊语音聊天结束',
        acceptedAt: null,
        participants: []
      }));
    };

    const handleGroupOffer = async (payload) => {
      try {
        const peerUserId = payload?.sourceUserId;
        const groupId = payload?.groupId;
        if (!peerUserId || !groupId) return;

        await ensureGroupPeer(groupId, peerUserId);
        await setGroupRemoteDescription(peerUserId, payload.sdp);
        const answer = await createGroupAnswer(peerUserId);

        socket.emit('webrtc:group-answer', {
          groupId,
          targetUserId: peerUserId,
          sdp: answer
        });

        negotiatedGroupPeersRef.current.add(`${groupId}_${peerUserId}`);
      } catch (error) {
        console.error('处理群聊 offer 失败:', error);
      }
    };

    const handleGroupAnswer = async (payload) => {
      try {
        const peerUserId = payload?.sourceUserId;
        if (!peerUserId) return;

        await setGroupRemoteDescription(peerUserId, payload.sdp);
      } catch (error) {
        console.error('处理群聊 answer 失败:', error);
      }
    };

    const handleGroupIceCandidate = async (payload) => {
      try {
        const peerUserId = payload?.sourceUserId;
        if (!peerUserId) return;

        await addGroupIceCandidate(peerUserId, payload.candidate);
      } catch (error) {
        console.error('添加群聊 ICE candidate 失败:', error);
      }
    };

    socket.on('voice:private:offline', handleOffline);
    socket.on('voice:private:waiting', handleWaiting);
    socket.on('voice:private:incoming', handleIncoming);
    socket.on('voice:private:accepted', handleAccepted);
    socket.on('voice:private:rejected', handleRejected);
    socket.on('voice:private:ended', handleEnded);
    socket.on('voice:private:mute-changed', handlePrivateMuteChanged);
    socket.on('voice:private:error', handleError);

    socket.on('webrtc:offer', handleOffer);
    socket.on('webrtc:answer', handleAnswer);
    socket.on('webrtc:ice-candidate', handleIceCandidate);

    socket.on('voice:group:offline', handleGroupOffline);
    socket.on('voice:group:waiting', handleGroupWaiting);
    socket.on('voice:group:incoming', handleGroupIncoming);
    socket.on('voice:group:ongoing', handleGroupOngoing);
    socket.on('voice:group:update', handleGroupUpdate);
    socket.on('voice:group:ended', handleGroupEnded);
    socket.on('voice:group:error', handleError);

    socket.on('webrtc:group-offer', handleGroupOffer);
    socket.on('webrtc:group-answer', handleGroupAnswer);
    socket.on('webrtc:group-ice-candidate', handleGroupIceCandidate);

    return () => {
      socket.off('voice:private:offline', handleOffline);
      socket.off('voice:private:waiting', handleWaiting);
      socket.off('voice:private:incoming', handleIncoming);
      socket.off('voice:private:accepted', handleAccepted);
      socket.off('voice:private:rejected', handleRejected);
      socket.off('voice:private:ended', handleEnded);
      socket.off('voice:private:mute-changed', handlePrivateMuteChanged);
      socket.off('voice:private:error', handleError);

      socket.off('webrtc:offer', handleOffer);
      socket.off('webrtc:answer', handleAnswer);
      socket.off('webrtc:ice-candidate', handleIceCandidate);

      socket.off('voice:group:offline', handleGroupOffline);
      socket.off('voice:group:waiting', handleGroupWaiting);
      socket.off('voice:group:incoming', handleGroupIncoming);
      socket.off('voice:group:ongoing', handleGroupOngoing);
      socket.off('voice:group:update', handleGroupUpdate);
      socket.off('voice:group:ended', handleGroupEnded);
      socket.off('voice:group:error', handleError);

      socket.off('webrtc:group-offer', handleGroupOffer);
      socket.off('webrtc:group-answer', handleGroupAnswer);
      socket.off('webrtc:group-ice-candidate', handleGroupIceCandidate);
    };
  }, [currentConversation, currentUserInfo, showAlert, currentUserId, isMuted, voiceCallState.otherUser]);

  const handleAccept = () => {
    const socket = getSocket();
    if (!socket) return;

    if (voiceCallState.mode === 'private') {
      socket.emit('voice:private:accept', {
        callId: voiceCallState.callId
      });
      return;
    }

    socket.emit('voice:group:join', {
      groupId: voiceCallState.groupId
    });
  };

  const handleReject = async () => {
    const socket = getSocket();
    if (!socket) return;

    if (voiceCallState.mode === 'private') {
      cleanupPrivateWebRTC();
      await resetMuteState();

      socket.emit('voice:private:reject', {
        callId: voiceCallState.callId
      });
      return;
    }

    socket.emit('voice:group:reject', {
      groupId: voiceCallState.groupId
    });
  };

  const handleJoin = () => {
    const socket = getSocket();
    if (!socket) return;

    socket.emit('voice:group:join', {
      groupId: voiceCallState.groupId
    });
  };

  const handleEnd = async () => {
    const socket = getSocket();

    if (voiceCallState.mode === 'private') {
      cleanupPrivateWebRTC();
      await resetMuteState();

      if (socket) {
        socket.emit('voice:private:end', {
          callId: voiceCallState.callId
        });
      }
      return;
    }

    cleanupGroupWebRTC();
    resetAllGroupRemoteAudios();
    negotiatedGroupPeersRef.current.clear();
    await resetMuteState();

    const leavingGroupId = voiceCallState.groupId;
    const leavingConversationId = voiceCallState.conversationId;

    setVoiceCallState(DEFAULT_STATE);

    if (socket) {
      socket.emit('voice:group:leave', {
        groupId: leavingGroupId,
        conversationId: leavingConversationId
      });
    }
  };

  const handleClose = async () => {
    cleanupAllWebRTC();
    resetAllGroupRemoteAudios();
    negotiatedGroupPeersRef.current.clear();
    await resetMuteState();

    setVoiceCallState(DEFAULT_STATE);
  };

  return (
    <>
      <audio ref={localAudioRef} autoPlay muted style={{ display: 'none' }} />
      <audio ref={remoteAudioRef} autoPlay style={{ display: 'none' }} />

      <VoiceCallModal
        visible={voiceCallState.visible}
        mode={voiceCallState.mode}
        status={voiceCallState.status}
        title={voiceCallState.title}
        message={voiceCallState.message}
        otherUser={voiceCallState.otherUser}
        participants={voiceCallState.participants}
        acceptedAt={voiceCallState.acceptedAt}
        isMuted={isMuted}
        remoteMuted={remoteMuted}
        currentUserId={currentUserId}
        onToggleMute={toggleMute}
        onAccept={handleAccept}
        onReject={handleReject}
        onJoin={handleJoin}
        onEnd={handleEnd}
        onClose={handleClose}
      />
    </>
  );
}