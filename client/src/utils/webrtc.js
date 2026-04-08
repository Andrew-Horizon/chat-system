let localStream = null;
let privatePeerConnection = null;
let privateRemoteStream = null;

const groupPeerConnections = new Map(); // peerUserId -> RTCPeerConnection
const groupRemoteStreams = new Map();   // peerUserId -> MediaStream

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

export const getLocalStream = async () => {
  if (localStream) return localStream;

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('您的浏览器不支持或禁用了音视频功能。注意：语音聊天需要 HTTPS 环境或 localhost。');
  }

  localStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    },
    video: false
  });

  return localStream;
};

export const stopLocalStream = () => {
  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
    localStream = null;
  }
};

export const cleanupPrivateWebRTC = () => {
  if (privatePeerConnection) {
    privatePeerConnection.onicecandidate = null;
    privatePeerConnection.ontrack = null;
    privatePeerConnection.onconnectionstatechange = null;
    privatePeerConnection.close();
    privatePeerConnection = null;
  }
  privateRemoteStream = null;
};

export const cleanupGroupWebRTC = () => {
  for (const [, pc] of groupPeerConnections.entries()) {
    pc.onicecandidate = null;
    pc.ontrack = null;
    pc.onconnectionstatechange = null;
    pc.close();
  }
  groupPeerConnections.clear();
  groupRemoteStreams.clear();
};

export const cleanupAllWebRTC = () => {
  cleanupPrivateWebRTC();
  cleanupGroupWebRTC();
  stopLocalStream();
};

export const createPrivatePeerConnection = async ({
  onIceCandidate,
  onTrack,
  onConnectionStateChange
}) => {
  cleanupPrivateWebRTC();

  const pc = new RTCPeerConnection(rtcConfig);
  privatePeerConnection = pc;

  const stream = await getLocalStream();
  stream.getTracks().forEach((track) => {
    pc.addTrack(track, stream);
  });

  pc.onicecandidate = (event) => {
    if (event.candidate && typeof onIceCandidate === 'function') {
      onIceCandidate(event.candidate);
    }
  };

  pc.ontrack = (event) => {
    if (!privateRemoteStream) {
      privateRemoteStream = new MediaStream();
    }

    event.streams[0].getTracks().forEach((track) => {
      const exists = privateRemoteStream.getTracks().some((t) => t.id === track.id);
      if (!exists) {
        privateRemoteStream.addTrack(track);
      }
    });

    if (typeof onTrack === 'function') {
      onTrack(privateRemoteStream);
    }
  };

  pc.onconnectionstatechange = () => {
    if (typeof onConnectionStateChange === 'function') {
      onConnectionStateChange(pc.connectionState);
    }
  };

  return pc;
};

export const createPrivateOffer = async () => {
  if (!privatePeerConnection) {
    throw new Error('单聊 PeerConnection 未初始化');
  }

  const offer = await privatePeerConnection.createOffer({
    offerToReceiveAudio: true,
    offerToReceiveVideo: false
  });

  await privatePeerConnection.setLocalDescription(offer);
  return offer;
};

export const createPrivateAnswer = async () => {
  if (!privatePeerConnection) {
    throw new Error('单聊 PeerConnection 未初始化');
  }

  const answer = await privatePeerConnection.createAnswer();
  await privatePeerConnection.setLocalDescription(answer);
  return answer;
};

export const setPrivateRemoteDescription = async (sdp) => {
  if (!privatePeerConnection) {
    throw new Error('单聊 PeerConnection 未初始化');
  }

  await privatePeerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
};

export const addPrivateIceCandidate = async (candidate) => {
  if (!privatePeerConnection || !candidate) return;
  await privatePeerConnection.addIceCandidate(new RTCIceCandidate(candidate));
};

const buildGroupPeer = async ({
  peerUserId,
  onIceCandidate,
  onTrack,
  onConnectionStateChange
}) => {
  const existing = groupPeerConnections.get(peerUserId);
  if (existing) return existing;

  const pc = new RTCPeerConnection(rtcConfig);
  groupPeerConnections.set(peerUserId, pc);

  const stream = await getLocalStream();
  stream.getTracks().forEach((track) => {
    pc.addTrack(track, stream);
  });

  pc.onicecandidate = (event) => {
    if (event.candidate && typeof onIceCandidate === 'function') {
      onIceCandidate(peerUserId, event.candidate);
    }
  };

  pc.ontrack = (event) => {
    let remoteStream = groupRemoteStreams.get(peerUserId);

    if (!remoteStream) {
      remoteStream = new MediaStream();
      groupRemoteStreams.set(peerUserId, remoteStream);
    }

    event.streams[0].getTracks().forEach((track) => {
      const exists = remoteStream.getTracks().some((t) => t.id === track.id);
      if (!exists) {
        remoteStream.addTrack(track);
      }
    });

    if (typeof onTrack === 'function') {
      onTrack(peerUserId, remoteStream);
    }
  };

  pc.onconnectionstatechange = () => {
    if (typeof onConnectionStateChange === 'function') {
      onConnectionStateChange(peerUserId, pc.connectionState);
    }
  };

  return pc;
};

export const ensureGroupPeerConnection = async (options) => {
  return buildGroupPeer(options);
};

export const createGroupOffer = async (peerUserId) => {
  const pc = groupPeerConnections.get(peerUserId);
  if (!pc) {
    throw new Error('群聊 PeerConnection 未初始化');
  }

  const offer = await pc.createOffer({
    offerToReceiveAudio: true,
    offerToReceiveVideo: false
  });

  await pc.setLocalDescription(offer);
  return offer;
};

export const createGroupAnswer = async (peerUserId) => {
  const pc = groupPeerConnections.get(peerUserId);
  if (!pc) {
    throw new Error('群聊 PeerConnection 未初始化');
  }

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  return answer;
};

export const setGroupRemoteDescription = async (peerUserId, sdp) => {
  const pc = groupPeerConnections.get(peerUserId);
  if (!pc) {
    throw new Error('群聊 PeerConnection 未初始化');
  }

  await pc.setRemoteDescription(new RTCSessionDescription(sdp));
};

export const addGroupIceCandidate = async (peerUserId, candidate) => {
  const pc = groupPeerConnections.get(peerUserId);
  if (!pc || !candidate) return;

  await pc.addIceCandidate(new RTCIceCandidate(candidate));
};

export const removeGroupPeerConnection = (peerUserId) => {
  const pc = groupPeerConnections.get(peerUserId);
  if (pc) {
    pc.onicecandidate = null;
    pc.ontrack = null;
    pc.onconnectionstatechange = null;
    pc.close();
    groupPeerConnections.delete(peerUserId);
  }

  groupRemoteStreams.delete(peerUserId);
};

export const getGroupRemoteStream = (peerUserId) => {
  return groupRemoteStreams.get(peerUserId) || null;
};