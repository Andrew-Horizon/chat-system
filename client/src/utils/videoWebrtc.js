let localVideoStream = null;

let privateVideoPeerConnection = null;
let privateRemoteVideoStream = null;

const groupVideoPeerConnections = new Map(); // peerUserId -> RTCPeerConnection
const groupRemoteVideoStreams = new Map();   // peerUserId -> MediaStream

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

export const getLocalVideoStream = async () => {
  if (localVideoStream) return localVideoStream;

  localVideoStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    },
    video: {
      width: { ideal: 640 },
      height: { ideal: 360 },
      frameRate: { ideal: 24, max: 30 },
      facingMode: 'user'
    }
  });

  return localVideoStream;
};

export const stopLocalVideoStream = () => {
  if (localVideoStream) {
    localVideoStream.getTracks().forEach((track) => track.stop());
    localVideoStream = null;
  }
};

export const cleanupPrivateVideoWebRTC = () => {
  if (privateVideoPeerConnection) {
    privateVideoPeerConnection.onicecandidate = null;
    privateVideoPeerConnection.ontrack = null;
    privateVideoPeerConnection.onconnectionstatechange = null;
    privateVideoPeerConnection.close();
    privateVideoPeerConnection = null;
  }
  privateRemoteVideoStream = null;
};

export const cleanupGroupVideoWebRTC = () => {
  for (const [, pc] of groupVideoPeerConnections.entries()) {
    pc.onicecandidate = null;
    pc.ontrack = null;
    pc.onconnectionstatechange = null;
    pc.close();
  }
  groupVideoPeerConnections.clear();
  groupRemoteVideoStreams.clear();
};

export const cleanupAllVideoWebRTC = () => {
  cleanupPrivateVideoWebRTC();
  cleanupGroupVideoWebRTC();
  stopLocalVideoStream();
};

export const createPrivateVideoPeerConnection = async ({
  onIceCandidate,
  onTrack,
  onConnectionStateChange
}) => {
  cleanupPrivateVideoWebRTC();

  const pc = new RTCPeerConnection(rtcConfig);
  privateVideoPeerConnection = pc;

  const stream = await getLocalVideoStream();
  stream.getTracks().forEach((track) => {
    pc.addTrack(track, stream);
  });

  pc.onicecandidate = (event) => {
    if (event.candidate && typeof onIceCandidate === 'function') {
      onIceCandidate(event.candidate);
    }
  };

  pc.ontrack = (event) => {
    if (!privateRemoteVideoStream) {
      privateRemoteVideoStream = new MediaStream();
    }

    event.streams[0].getTracks().forEach((track) => {
      const exists = privateRemoteVideoStream.getTracks().some((t) => t.id === track.id);
      if (!exists) {
        privateRemoteVideoStream.addTrack(track);
      }
    });

    if (typeof onTrack === 'function') {
      onTrack(privateRemoteVideoStream);
    }
  };

  pc.onconnectionstatechange = () => {
    if (typeof onConnectionStateChange === 'function') {
      onConnectionStateChange(pc.connectionState);
    }
  };

  return pc;
};

export const createPrivateVideoOffer = async () => {
  if (!privateVideoPeerConnection) {
    throw new Error('单聊视频 PeerConnection 未初始化');
  }

  const offer = await privateVideoPeerConnection.createOffer({
    offerToReceiveAudio: true,
    offerToReceiveVideo: true
  });

  await privateVideoPeerConnection.setLocalDescription(offer);
  return offer;
};

export const createPrivateVideoAnswer = async () => {
  if (!privateVideoPeerConnection) {
    throw new Error('单聊视频 PeerConnection 未初始化');
  }

  const answer = await privateVideoPeerConnection.createAnswer();
  await privateVideoPeerConnection.setLocalDescription(answer);
  return answer;
};

export const setPrivateVideoRemoteDescription = async (sdp) => {
  if (!privateVideoPeerConnection) {
    throw new Error('单聊视频 PeerConnection 未初始化');
  }

  await privateVideoPeerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
};

export const addPrivateVideoIceCandidate = async (candidate) => {
  if (!privateVideoPeerConnection || !candidate) return;
  await privateVideoPeerConnection.addIceCandidate(new RTCIceCandidate(candidate));
};

const buildGroupVideoPeer = async ({
  peerUserId,
  onIceCandidate,
  onTrack,
  onConnectionStateChange
}) => {
  const existing = groupVideoPeerConnections.get(peerUserId);
  if (existing) return existing;

  const pc = new RTCPeerConnection(rtcConfig);
  groupVideoPeerConnections.set(peerUserId, pc);

  const stream = await getLocalVideoStream();
  stream.getTracks().forEach((track) => {
    pc.addTrack(track, stream);
  });

  pc.onicecandidate = (event) => {
    if (event.candidate && typeof onIceCandidate === 'function') {
      onIceCandidate(peerUserId, event.candidate);
    }
  };

  pc.ontrack = (event) => {
    let remoteStream = groupRemoteVideoStreams.get(peerUserId);

    if (!remoteStream) {
      remoteStream = new MediaStream();
      groupRemoteVideoStreams.set(peerUserId, remoteStream);
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

export const ensureGroupVideoPeerConnection = async (options) => {
  return buildGroupVideoPeer(options);
};

export const createGroupVideoOffer = async (peerUserId) => {
  const pc = groupVideoPeerConnections.get(peerUserId);
  if (!pc) {
    throw new Error('群聊视频 PeerConnection 未初始化');
  }

  const offer = await pc.createOffer({
    offerToReceiveAudio: true,
    offerToReceiveVideo: true
  });

  await pc.setLocalDescription(offer);
  return offer;
};

export const createGroupVideoAnswer = async (peerUserId) => {
  const pc = groupVideoPeerConnections.get(peerUserId);
  if (!pc) {
    throw new Error('群聊视频 PeerConnection 未初始化');
  }

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  return answer;
};

export const setGroupVideoRemoteDescription = async (peerUserId, sdp) => {
  const pc = groupVideoPeerConnections.get(peerUserId);
  if (!pc) {
    throw new Error('群聊视频 PeerConnection 未初始化');
  }

  await pc.setRemoteDescription(new RTCSessionDescription(sdp));
};

export const addGroupVideoIceCandidate = async (peerUserId, candidate) => {
  const pc = groupVideoPeerConnections.get(peerUserId);
  if (!pc || !candidate) return;

  await pc.addIceCandidate(new RTCIceCandidate(candidate));
};

export const removeGroupVideoPeerConnection = (peerUserId) => {
  const pc = groupVideoPeerConnections.get(peerUserId);
  if (pc) {
    pc.onicecandidate = null;
    pc.ontrack = null;
    pc.onconnectionstatechange = null;
    pc.close();
    groupVideoPeerConnections.delete(peerUserId);
  }

  groupRemoteVideoStreams.delete(peerUserId);
};

export const getGroupRemoteVideoStream = (peerUserId) => {
  return groupRemoteVideoStreams.get(peerUserId) || null;
};