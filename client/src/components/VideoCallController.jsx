import { useEffect, useMemo, useRef, useState } from 'react';
import { getSocket } from '../utils/socket';
import VideoCallModal from './VideoCallModal';
import {
  getLocalVideoStream,
  createPrivateVideoPeerConnection,
  createPrivateVideoOffer,
  createPrivateVideoAnswer,
  setPrivateVideoRemoteDescription,
  addPrivateVideoIceCandidate,
  ensureGroupVideoPeerConnection,
  createGroupVideoOffer,
  createGroupVideoAnswer,
  setGroupVideoRemoteDescription,
  addGroupVideoIceCandidate,
  removeGroupVideoPeerConnection,
  cleanupPrivateVideoWebRTC,
  cleanupGroupVideoWebRTC,
  cleanupAllVideoWebRTC
} from '../utils/videoWebrtc';

const DEFAULT_STATE = {
  visible: false,
  mode: 'private',
  status: '',
  title: '视频聊天',
  message: '',
  callId: '',
  groupId: '',
  groupName: '',
  conversationId: '',
  otherUser: null,
  participants: [],
  acceptedAt: null
};

export default function VideoCallController({
  currentConversation,
  currentUserInfo,
  showAlert
}) {
  const [videoCallState, setVideoCallState] = useState(DEFAULT_STATE);
  const [localStream, setLocalStream] = useState(null);
  const [privateRemoteStream, setPrivateRemoteStream] = useState(null);
  const [groupRemoteStreamsMap, setGroupRemoteStreamsMap] = useState({});
  const [isMuted, setIsMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [remoteMuted, setRemoteMuted] = useState(false);
  const [remoteCameraOff, setRemoteCameraOff] = useState(false);

  const isCallerRef = useRef(false);
  const negotiatedGroupPeersRef = useRef(new Set());

  const currentUserId =
    currentUserInfo?._id || currentUserInfo?.id || '';

  const groupRemoteStreams = useMemo(() => {
    return Object.entries(groupRemoteStreamsMap).map(([userId, item]) => ({
      userId,
      name: item.name,
      stream: item.stream,
      isMuted: !!item.isMuted,
      cameraOff: !!item.cameraOff
    }));
  }, [groupRemoteStreamsMap]);

  useEffect(() => {
    const probeCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true
        });
        stream.getTracks().forEach((track) => track.stop());
      } catch (error) {
        console.error('摄像头权限申请失败:', error);
      }
    };

    if (navigator.mediaDevices?.getUserMedia) {
      probeCamera();
    }
  }, []);

  const handleStartVideoCall = () => {
    const socket = getSocket();

    if (!socket || !socket.connected) {
      showAlert('当前连接不可用，无法发起视频聊天');
      return;
    }

    if (!currentConversation) {
      showAlert('请先选择一个会话');
      return;
    }

    const conversationId =
      currentConversation?.id || currentConversation?._id || '';

    if (!conversationId) {
      showAlert('当前会话信息不完整');
      return;
    }

    if (currentConversation.type === 'private') {
      const targetUserId =
        currentConversation?.targetUser?.id ||
        currentConversation?.targetUser?._id ||
        '';

      if (!targetUserId) {
        showAlert('当前聊天对象信息不完整');
        return;
      }

      socket.emit('video:private:start', {
        conversationId,
        targetUserId
      });
      return;
    }

    if (currentConversation.type === 'group') {
      const groupId =
        currentConversation?.groupInfo?._id ||
        currentConversation?.groupInfo?.id ||
        '';

      const groupName = currentConversation?.groupInfo?.name || '群聊';

      if (!groupId) {
        showAlert('当前群聊信息不完整');
        return;
      }

      socket.emit('video:group:start', {
        groupId,
        conversationId,
        groupName
      });
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__startVideoCall__ = handleStartVideoCall;
    }
    return () => {
      if (typeof window !== 'undefined') {
        delete window.__startVideoCall__;
      }
    };
  }, [currentConversation, currentUserInfo]);

  const ensureLocalVideo = async () => {
    const stream = await getLocalVideoStream();
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !isMuted;
    });
    stream.getVideoTracks().forEach((track) => {
      track.enabled = !cameraOff;
    });
    setLocalStream(stream);
    return stream;
  };

  const syncPrivateMediaState = (next) => {
    const socket = getSocket();
    if (!socket || !videoCallState.callId || videoCallState.mode !== 'private') return;

    socket.emit('video:private:media-change', {
      callId: videoCallState.callId,
      ...next
    });
  };

  const syncGroupMediaState = (next) => {
    const socket = getSocket();
    if (!socket || !videoCallState.groupId || videoCallState.mode !== 'group') return;

    socket.emit('video:group:media-change', {
      groupId: videoCallState.groupId,
      ...next
    });
  };

  const toggleMute = async () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);

    const stream = await getLocalVideoStream();
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });

    if (videoCallState.mode === 'private') {
      syncPrivateMediaState({ isMuted: nextMuted });
    } else if (videoCallState.mode === 'group') {
      syncGroupMediaState({ isMuted: nextMuted });
    }
  };

  const toggleCamera = async () => {
    const nextCameraOff = !cameraOff;
    setCameraOff(nextCameraOff);

    const stream = await getLocalVideoStream();
    stream.getVideoTracks().forEach((track) => {
      track.enabled = !nextCameraOff;
    });

    if (videoCallState.mode === 'private') {
      syncPrivateMediaState({ cameraOff: nextCameraOff });
    } else if (videoCallState.mode === 'group') {
      syncGroupMediaState({ cameraOff: nextCameraOff });
    }
  };

  const resetLocalMediaState = async () => {
    setIsMuted(false);
    setCameraOff(false);
    setRemoteMuted(false);
    setRemoteCameraOff(false);

    try {
      const stream = await getLocalVideoStream();
      stream.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });
      stream.getVideoTracks().forEach((track) => {
        track.enabled = true;
      });
    } catch (error) {
      // ignore
    }
  };

  const setupPrivatePeer = async (callId) => {
    await createPrivateVideoPeerConnection({
      onIceCandidate: (candidate) => {
        const socket = getSocket();
        if (!socket) return;

        socket.emit('webrtc:video-ice-candidate', {
          callId,
          candidate
        });
      },
      onTrack: (remoteStream) => {
        setPrivateRemoteStream(remoteStream);
      },
      onConnectionStateChange: (state) => {
        if (state === 'failed' || state === 'disconnected' || state === 'closed') {
          showAlert('视频连接已断开');
        }
      }
    });

    await ensureLocalVideo();
  };

  const ensureGroupPeer = async (groupId, peerUserId, peerName) => {
    const socket = getSocket();
    if (!socket || !peerUserId) return;

    await ensureGroupVideoPeerConnection({
      peerUserId,
      onIceCandidate: (targetPeerUserId, candidate) => {
        socket.emit('webrtc:group-video-ice-candidate', {
          groupId,
          targetUserId: targetPeerUserId,
          candidate
        });
      },
      onTrack: (targetPeerUserId, remoteStream) => {
        setGroupRemoteStreamsMap((prev) => ({
          ...prev,
          [targetPeerUserId]: {
            name: peerName || prev[targetPeerUserId]?.name || '成员',
            stream: remoteStream,
            isMuted: prev[targetPeerUserId]?.isMuted || false,
            cameraOff: prev[targetPeerUserId]?.cameraOff || false
          }
        }));
      },
      onConnectionStateChange: (targetPeerUserId, state) => {
        if (state === 'failed' || state === 'closed' || state === 'disconnected') {
          removeGroupVideoPeerConnection(targetPeerUserId);
          setGroupRemoteStreamsMap((prev) => {
            const next = { ...prev };
            delete next[targetPeerUserId];
            return next;
          });
          negotiatedGroupPeersRef.current.delete(`${groupId}_${targetPeerUserId}`);
        }
      }
    });

    await ensureLocalVideo();
  };

  const maybeCreateGroupOffers = async (groupId, participants) => {
    if (!currentUserId || !groupId) return;

    const others = participants
      .map((item) => ({
        id: item.id || item._id,
        name: item.nickname || item.username || '成员'
      }))
      .filter((item) => item.id && String(item.id) !== String(currentUserId));

    for (const peer of others) {
      await ensureGroupPeer(groupId, peer.id, peer.name);

      const pairKey = `${groupId}_${peer.id}`;
      const shouldInitiate = String(currentUserId) < String(peer.id);

      if (shouldInitiate && !negotiatedGroupPeersRef.current.has(pairKey)) {
        const offer = await createGroupVideoOffer(peer.id);
        const socket = getSocket();
        if (socket) {
          socket.emit('webrtc:group-video-offer', {
            groupId,
            targetUserId: peer.id,
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

    const handlePrivateOffline = (payload) => {
      setVideoCallState({
        ...DEFAULT_STATE,
        visible: true,
        mode: 'private',
        status: 'ended',
        title: '视频聊天',
        message: payload?.message || '对方不在线',
        conversationId: payload?.conversationId || '',
        otherUser: currentConversation?.targetUser || null
      });
    };

    const handlePrivateWaiting = (payload) => {
      isCallerRef.current = true;
      setVideoCallState({
        ...DEFAULT_STATE,
        visible: true,
        mode: 'private',
        status: 'waiting',
        title: '视频聊天',
        message: payload?.message || '等待对方接通...',
        callId: payload?.callId || '',
        conversationId: payload?.conversationId || '',
        otherUser: currentConversation?.targetUser || null
      });
    };

    const handlePrivateIncoming = (payload) => {
      isCallerRef.current = false;
      setVideoCallState({
        ...DEFAULT_STATE,
        visible: true,
        mode: 'private',
        status: 'incoming',
        title: '视频聊天邀请',
        message: payload?.message || '收到新的视频聊天邀请',
        callId: payload?.callId || '',
        conversationId: payload?.conversationId || '',
        otherUser: payload?.caller || null
      });
    };

    const handlePrivateAccepted = async (payload) => {
      try {
        setVideoCallState((prev) => ({
          ...prev,
          visible: true,
          mode: 'private',
          status: 'active',
          title: '视频聊天中',
          message: `正在与 ${payload?.otherUser?.nickname || payload?.otherUser?.username || '对方'} 视频聊天中`,
          callId: payload?.callId || prev.callId,
          conversationId: payload?.conversationId || prev.conversationId,
          otherUser: payload?.otherUser || prev.otherUser,
          acceptedAt: payload?.acceptedAt || Date.now()
        }));

        if (isCallerRef.current) {
          await setupPrivatePeer(payload.callId);
          const offer = await createPrivateVideoOffer();

          socket.emit('webrtc:video-offer', {
            callId: payload.callId,
            sdp: offer
          });
        }
      } catch (error) {
        console.error('建立单聊视频连接失败:', error.name, error.message, error);
        showAlert(error?.message || '建立视频连接失败');
      }
    };

    const handlePrivateRejected = async (payload) => {
      cleanupPrivateVideoWebRTC();
      setPrivateRemoteStream(null);
      setLocalStream(null);
      await resetLocalMediaState();

      setVideoCallState((prev) => ({
        ...prev,
        visible: true,
        mode: 'private',
        status: 'ended',
        title: '视频聊天',
        message: payload?.message || '对方拒绝了视频聊天',
        acceptedAt: null
      }));
    };

    const handlePrivateEnded = async (payload) => {
      cleanupPrivateVideoWebRTC();
      setPrivateRemoteStream(null);
      setLocalStream(null);
      await resetLocalMediaState();

      setVideoCallState((prev) => ({
        ...prev,
        visible: true,
        mode: 'private',
        status: 'ended',
        title: '视频聊天',
        message: payload?.message || '视频聊天已结束',
        acceptedAt: null
      }));
    };

    const handlePrivateMediaChanged = (payload) => {
      const otherUserId =
        videoCallState.otherUser?.id ||
        videoCallState.otherUser?._id ||
        '';

      if (String(payload?.userId) !== String(otherUserId)) return;

      if (typeof payload?.isMuted === 'boolean') {
        setRemoteMuted(payload.isMuted);
      }

      if (typeof payload?.cameraOff === 'boolean') {
        setRemoteCameraOff(payload.cameraOff);
      }
    };

    const handlePrivateOffer = async (payload) => {
      try {
        await setupPrivatePeer(payload.callId);
        await setPrivateVideoRemoteDescription(payload.sdp);
        const answer = await createPrivateVideoAnswer();

        socket.emit('webrtc:video-answer', {
          callId: payload.callId,
          sdp: answer
        });
      } catch (error) {
        console.error('处理单聊视频 offer 失败:', error);
      }
    };

    const handlePrivateAnswer = async (payload) => {
      try {
        await setPrivateVideoRemoteDescription(payload.sdp);
      } catch (error) {
        console.error('处理单聊视频 answer 失败:', error);
      }
    };

    const handlePrivateIce = async (payload) => {
      try {
        await addPrivateVideoIceCandidate(payload.candidate);
      } catch (error) {
        console.error('添加单聊视频 ICE candidate 失败:', error);
      }
    };

    const handleGroupOffline = (payload) => {
      setVideoCallState({
        ...DEFAULT_STATE,
        visible: true,
        mode: 'group',
        status: 'group-ended',
        title: '群聊视频',
        message: payload?.message || '群聊好友无人在线',
        groupId: payload?.groupId || '',
        groupName: payload?.groupName || '',
        conversationId: payload?.conversationId || ''
      });
    };

    const handleGroupWaiting = (payload) => {
      setVideoCallState({
        ...DEFAULT_STATE,
        visible: true,
        mode: 'group',
        status: 'group-waiting',
        title: '群聊视频',
        message: `正在等待群聊「${payload?.groupName || '群聊'}」的成员接通...`,
        callId: payload?.callId || '',
        groupId: payload?.groupId || '',
        groupName: payload?.groupName || '',
        conversationId: payload?.conversationId || '',
        participants: currentUserInfo
          ? [{ ...currentUserInfo, isMuted, cameraOff }]
          : []
      });
    };

    const handleGroupIncoming = (payload) => {
      const callerName =
        payload?.caller?.nickname || payload?.caller?.username || '好友';
      const groupName = payload?.groupName || '未知群聊';

      setVideoCallState({
        ...DEFAULT_STATE,
        visible: true,
        mode: 'group',
        status: 'group-incoming',
        title: '群聊视频邀请',
        message: `${callerName} 邀请你加入群聊「${groupName}」的视频聊天`,
        callId: payload?.callId || '',
        groupId: payload?.groupId || '',
        groupName,
        conversationId: payload?.conversationId || '',
        otherUser: payload?.caller || null
      });
    };

    const handleGroupOngoing = (payload) => {
      const groupName = payload?.groupName || '群聊';

      setVideoCallState({
        ...DEFAULT_STATE,
        visible: true,
        mode: 'group',
        status: 'group-ongoing',
        title: '群聊视频',
        message: `群聊「${groupName}」的视频聊天正在进行，是否加入`,
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
        cleanupGroupVideoWebRTC();
        setGroupRemoteStreamsMap({});
        setLocalStream(null);
        negotiatedGroupPeersRef.current.clear();
        await resetLocalMediaState();

        setVideoCallState(DEFAULT_STATE);
        return;
      }

      setVideoCallState((prev) => ({
        ...prev,
        visible: true,
        mode: 'group',
        status: 'group-active',
        title: '群聊视频中',
        message: `正在群聊「${groupName}」视频聊天中`,
        callId: payload?.callId || prev.callId,
        groupId: payload?.groupId || prev.groupId,
        groupName,
        conversationId: payload?.conversationId || prev.conversationId,
        participants,
        acceptedAt: payload?.acceptedAt || prev.acceptedAt || Date.now()
      }));

      const remoteParticipantMap = {};
      participants.forEach((item) => {
        const id = String(item.id || item._id || '');
        if (!id || id === String(currentUserId)) return;

        remoteParticipantMap[id] = {
          ...(groupRemoteStreamsMap[id] || {}),
          name: item.nickname || item.username || '成员',
          isMuted: !!item.isMuted,
          cameraOff: !!item.cameraOff
        };
      });

      setGroupRemoteStreamsMap((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((key) => {
          if (!remoteParticipantMap[key]) {
            delete next[key];
          }
        });
        Object.keys(remoteParticipantMap).forEach((key) => {
          next[key] = {
            ...next[key],
            ...remoteParticipantMap[key]
          };
        });
        return next;
      });

      if (payload?.groupId && participants.length) {
        await maybeCreateGroupOffers(payload.groupId, participants);

        Object.keys(groupRemoteStreamsMap).forEach((peerUserId) => {
          if (!participantIds.includes(String(peerUserId))) {
            removeGroupVideoPeerConnection(peerUserId);
            negotiatedGroupPeersRef.current.delete(`${payload.groupId}_${peerUserId}`);
          }
        });
      }
    };

    const handleGroupEnded = async (payload) => {
      cleanupGroupVideoWebRTC();
      setGroupRemoteStreamsMap({});
      setLocalStream(null);
      negotiatedGroupPeersRef.current.clear();
      await resetLocalMediaState();

      setVideoCallState((prev) => ({
        ...prev,
        visible: true,
        mode: 'group',
        status: 'group-ended',
        title: '群聊视频',
        message: payload?.message || '本次群聊视频聊天结束',
        acceptedAt: null,
        participants: []
      }));
    };

    const handleGroupVideoOffer = async (payload) => {
      try {
        const peerUserId = payload?.sourceUserId;
        const groupId = payload?.groupId;
        if (!peerUserId || !groupId) return;

        await ensureGroupPeer(
          groupId,
          peerUserId,
          payload?.sourceUser?.nickname || payload?.sourceUser?.username || '成员'
        );
        await setGroupVideoRemoteDescription(peerUserId, payload.sdp);
        const answer = await createGroupVideoAnswer(peerUserId);

        socket.emit('webrtc:group-video-answer', {
          groupId,
          targetUserId: peerUserId,
          sdp: answer
        });

        negotiatedGroupPeersRef.current.add(`${groupId}_${peerUserId}`);
      } catch (error) {
        console.error('处理群聊视频 offer 失败:', error);
      }
    };

    const handleGroupVideoAnswer = async (payload) => {
      try {
        const peerUserId = payload?.sourceUserId;
        if (!peerUserId) return;

        await setGroupVideoRemoteDescription(peerUserId, payload.sdp);
      } catch (error) {
        console.error('处理群聊视频 answer 失败:', error);
      }
    };

    const handleGroupVideoIce = async (payload) => {
      try {
        const peerUserId = payload?.sourceUserId;
        if (!peerUserId) return;

        await addGroupVideoIceCandidate(peerUserId, payload.candidate);
      } catch (error) {
        console.error('处理群聊视频 ICE candidate 失败:', error);
      }
    };

    const handleVideoError = (payload) => {
      showAlert(payload?.message || '视频聊天操作失败');
    };

    socket.on('video:private:offline', handlePrivateOffline);
    socket.on('video:private:waiting', handlePrivateWaiting);
    socket.on('video:private:incoming', handlePrivateIncoming);
    socket.on('video:private:accepted', handlePrivateAccepted);
    socket.on('video:private:rejected', handlePrivateRejected);
    socket.on('video:private:ended', handlePrivateEnded);
    socket.on('video:private:media-changed', handlePrivateMediaChanged);
    socket.on('video:private:error', handleVideoError);

    socket.on('webrtc:video-offer', handlePrivateOffer);
    socket.on('webrtc:video-answer', handlePrivateAnswer);
    socket.on('webrtc:video-ice-candidate', handlePrivateIce);

    socket.on('video:group:offline', handleGroupOffline);
    socket.on('video:group:waiting', handleGroupWaiting);
    socket.on('video:group:incoming', handleGroupIncoming);
    socket.on('video:group:ongoing', handleGroupOngoing);
    socket.on('video:group:update', handleGroupUpdate);
    socket.on('video:group:ended', handleGroupEnded);
    socket.on('video:group:error', handleVideoError);

    socket.on('webrtc:group-video-offer', handleGroupVideoOffer);
    socket.on('webrtc:group-video-answer', handleGroupVideoAnswer);
    socket.on('webrtc:group-video-ice-candidate', handleGroupVideoIce);

    return () => {
      socket.off('video:private:offline', handlePrivateOffline);
      socket.off('video:private:waiting', handlePrivateWaiting);
      socket.off('video:private:incoming', handlePrivateIncoming);
      socket.off('video:private:accepted', handlePrivateAccepted);
      socket.off('video:private:rejected', handlePrivateRejected);
      socket.off('video:private:ended', handlePrivateEnded);
      socket.off('video:private:media-changed', handlePrivateMediaChanged);
      socket.off('video:private:error', handleVideoError);

      socket.off('webrtc:video-offer', handlePrivateOffer);
      socket.off('webrtc:video-answer', handlePrivateAnswer);
      socket.off('webrtc:video-ice-candidate', handlePrivateIce);

      socket.off('video:group:offline', handleGroupOffline);
      socket.off('video:group:waiting', handleGroupWaiting);
      socket.off('video:group:incoming', handleGroupIncoming);
      socket.off('video:group:ongoing', handleGroupOngoing);
      socket.off('video:group:update', handleGroupUpdate);
      socket.off('video:group:ended', handleGroupEnded);
      socket.off('video:group:error', handleVideoError);

      socket.off('webrtc:group-video-offer', handleGroupVideoOffer);
      socket.off('webrtc:group-video-answer', handleGroupVideoAnswer);
      socket.off('webrtc:group-video-ice-candidate', handleGroupVideoIce);
    };
  }, [currentConversation, currentUserInfo, showAlert, currentUserId, groupRemoteStreamsMap, videoCallState.otherUser, isMuted, cameraOff]);

  const handleAccept = () => {
    const socket = getSocket();
    if (!socket) return;

    if (videoCallState.mode === 'private') {
      socket.emit('video:private:accept', {
        callId: videoCallState.callId
      });
      return;
    }

    socket.emit('video:group:join', {
      groupId: videoCallState.groupId
    });
  };

  const handleReject = async () => {
    const socket = getSocket();
    if (!socket) return;

    if (videoCallState.mode === 'private') {
      cleanupPrivateVideoWebRTC();
      setPrivateRemoteStream(null);
      setLocalStream(null);
      await resetLocalMediaState();

      socket.emit('video:private:reject', {
        callId: videoCallState.callId
      });
      return;
    }

    socket.emit('video:group:reject', {
      groupId: videoCallState.groupId
    });
  };

  const handleJoin = () => {
    const socket = getSocket();
    if (!socket) return;

    socket.emit('video:group:join', {
      groupId: videoCallState.groupId
    });
  };

  const handleEnd = async () => {
    const socket = getSocket();

    if (videoCallState.mode === 'private') {
      cleanupPrivateVideoWebRTC();
      setPrivateRemoteStream(null);
      setLocalStream(null);
      await resetLocalMediaState();

      if (socket) {
        socket.emit('video:private:end', {
          callId: videoCallState.callId
        });
      }
      return;
    }

    cleanupGroupVideoWebRTC();
    setGroupRemoteStreamsMap({});
    setLocalStream(null);
    negotiatedGroupPeersRef.current.clear();
    await resetLocalMediaState();

    const leavingGroupId = videoCallState.groupId;
    const leavingConversationId = videoCallState.conversationId;

    setVideoCallState(DEFAULT_STATE);

    if (socket) {
      socket.emit('video:group:leave', {
        groupId: leavingGroupId,
        conversationId: leavingConversationId
      });
    }
  };

  const handleClose = async () => {
    cleanupAllVideoWebRTC();
    setPrivateRemoteStream(null);
    setGroupRemoteStreamsMap({});
    setLocalStream(null);
    negotiatedGroupPeersRef.current.clear();
    await resetLocalMediaState();

    setVideoCallState(DEFAULT_STATE);
  };

  return (
    <VideoCallModal
      visible={videoCallState.visible}
      mode={videoCallState.mode}
      status={videoCallState.status}
      title={videoCallState.title}
      message={videoCallState.message}
      otherUser={videoCallState.otherUser}
      participants={videoCallState.participants}
      acceptedAt={videoCallState.acceptedAt}
      localStream={localStream}
      privateRemoteStream={privateRemoteStream}
      groupRemoteStreams={groupRemoteStreams}
      isMuted={isMuted}
      cameraOff={cameraOff}
      remoteMuted={remoteMuted}
      remoteCameraOff={remoteCameraOff}
      onToggleMute={toggleMute}
      onToggleCamera={toggleCamera}
      onAccept={handleAccept}
      onReject={handleReject}
      onJoin={handleJoin}
      onEnd={handleEnd}
      onClose={handleClose}
    />
  );
}