import { useEffect, useMemo, useRef, useState } from 'react';

function useSpeakingLevel(stream) {
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    if (!stream || !stream.getAudioTracks || stream.getAudioTracks().length === 0) {
      setIsSpeaking(false);
      return;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      setIsSpeaking(false);
      return;
    }

    const audioContext = new AudioContextClass();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.75;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let rafId = null;
    let speakingFrames = 0;
    let silentFrames = 0;

    const THRESHOLD = 18;
    const ACTIVE_FRAMES = 3;
    const SILENT_FRAMES = 10;

    const detect = async () => {
      if (audioContext.state === 'suspended') {
        try {
          await audioContext.resume();
        } catch (error) {
          // ignore
        }
      }

      analyser.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i += 1) {
        sum += dataArray[i];
      }
      const avg = sum / dataArray.length;

      if (avg > THRESHOLD) {
        speakingFrames += 1;
        silentFrames = 0;
      } else {
        silentFrames += 1;
        speakingFrames = 0;
      }

      setIsSpeaking((prev) => {
        if (!prev && speakingFrames >= ACTIVE_FRAMES) return true;
        if (prev && silentFrames >= SILENT_FRAMES) return false;
        return prev;
      });

      rafId = requestAnimationFrame(detect);
    };

    detect();

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      try {
        source.disconnect();
      } catch (error) {
        // ignore
      }
      try {
        analyser.disconnect();
      } catch (error) {
        // ignore
      }
      try {
        audioContext.close();
      } catch (error) {
        // ignore
      }
    };
  }, [stream]);

  return isSpeaking;
}

function VideoTile({ label, stream, muted = false, small = false }) {
  const videoRef = useRef(null);
  const isSpeaking = useSpeakingLevel(stream);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream || null;
    }
  }, [stream]);

  return (
    <div
      className={[
        small ? 'video-call-tile small' : 'video-call-tile',
        isSpeaking ? 'speaking' : ''
      ].join(' ')}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className="video-call-video"
      />
      <div className="video-call-label">{label}</div>
      {isSpeaking ? <div className="video-call-speaking-tag">正在说话</div> : null}
    </div>
  );
}

export default function VideoCallModal({
  visible,
  mode,
  status,
  title,
  message,
  otherUser,
  participants = [],
  acceptedAt,
  localStream,
  privateRemoteStream,
  groupRemoteStreams = [],
  onAccept,
  onReject,
  onJoin,
  onEnd,
  onClose
}) {
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!visible || !acceptedAt || !['active', 'group-active', 'group-ongoing'].includes(status)) {
      return;
    }

    const timer = setInterval(() => {
      forceTick((v) => v + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [visible, status, acceptedAt]);

  const duration = useMemo(() => {
    if (!acceptedAt) return '00:00';
    const diff = Math.max(0, Math.floor((Date.now() - acceptedAt) / 1000));
    const mm = String(Math.floor(diff / 60)).padStart(2, '0');
    const ss = String(diff % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }, [acceptedAt, Math.floor(Date.now() / 1000)]);

  if (!visible) return null;

  const renderSinglePrivateActive = () => {
    return (
      <div className="video-call-private-stage">
        <div className="video-call-private-remote">
          <VideoTile
            label={otherUser?.nickname || otherUser?.username || '对方'}
            stream={privateRemoteStream}
          />
        </div>

        <div className="video-call-private-local">
          <VideoTile
            label="我"
            stream={localStream}
            muted
            small
          />
        </div>
      </div>
    );
  };

  const renderGroupActive = () => {
    return (
      <div className="video-call-group-grid">
        {groupRemoteStreams.map((item) => (
          <VideoTile
            key={item.userId}
            label={item.name}
            stream={item.stream}
          />
        ))}

        {localStream ? (
          <VideoTile
            label="我"
            stream={localStream}
            muted
          />
        ) : null}
      </div>
    );
  };

  return (
    <div className="modal-mask modal-mask-top">
      <div className="modal-card video-call-modal-card">
        <div className="modal-header">
          <span>{title || '视频聊天'}</span>
          {['ended', 'group-ended'].includes(status) ? (
            <button className="modal-close" onClick={onClose}>×</button>
          ) : null}
        </div>

        <div className="modal-body">
          <div className="video-call-message">{message}</div>

          {mode === 'private' && status === 'active' ? renderSinglePrivateActive() : null}
          {mode === 'group' && status === 'group-active' ? renderGroupActive() : null}

          {acceptedAt && ['active', 'group-active', 'group-ongoing'].includes(status) ? (
            <div className="video-call-duration">通话时长：{duration}</div>
          ) : null}

          <div className="modal-footer">
            {status === 'incoming' ? (
              <>
                <button className="modal-btn secondary" onClick={onReject}>拒绝</button>
                <button className="modal-btn" onClick={onAccept}>接听</button>
              </>
            ) : null}

            {status === 'waiting' ? (
              <button className="modal-btn danger" onClick={onEnd}>取消</button>
            ) : null}

            {status === 'active' ? (
              <button className="modal-btn danger" onClick={onEnd}>挂断</button>
            ) : null}

            {status === 'group-incoming' ? (
              <>
                <button className="modal-btn secondary" onClick={onReject}>拒绝</button>
                <button className="modal-btn" onClick={onJoin}>接听</button>
              </>
            ) : null}

            {status === 'group-waiting' ? (
              <button className="modal-btn danger" onClick={onEnd}>取消</button>
            ) : null}

            {status === 'group-ongoing' ? (
              <>
                <button className="modal-btn secondary" onClick={onReject}>取消</button>
                <button className="modal-btn" onClick={onJoin}>加入</button>
              </>
            ) : null}

            {status === 'group-active' ? (
              <button className="modal-btn danger" onClick={onEnd}>退出</button>
            ) : null}

            {['ended', 'group-ended'].includes(status) ? (
              <button className="modal-btn" onClick={onClose}>确定</button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}