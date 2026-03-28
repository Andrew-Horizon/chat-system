import { useEffect, useMemo, useRef, useState } from 'react';

function VideoTile({
  label,
  stream,
  muted = false,
  small = false,
  isSpeaking = false,
  isMuted = false,
  cameraOff = false
}) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream || null;
    }
  }, [stream]);

  return (
    <div
      className={[
        small ? 'video-call-tile small' : 'video-call-tile',
        isSpeaking ? 'speaking' : '',
        cameraOff ? 'camera-off' : ''
      ].join(' ')}
    >
      {cameraOff ? (
        <div className="video-call-camera-off-placeholder">
          <div className="video-call-camera-off-text">摄像头已关闭</div>
        </div>
      ) : (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          className="video-call-video"
        />
      )}

      <div className="video-call-label">{label}</div>

      <div className="video-call-status-tags">
        {isMuted ? <div className="video-call-status-tag muted">已静音</div> : null}
        {cameraOff ? <div className="video-call-status-tag camera">已关摄像头</div> : null}
      </div>

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
  isMuted = false,
  cameraOff = false,
  remoteMuted = false,
  remoteCameraOff = false,
  onToggleMute,
  onToggleCamera,
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
            isMuted={remoteMuted}
            cameraOff={remoteCameraOff}
          />
        </div>

        <div className="video-call-private-local">
          <VideoTile
            label="我"
            stream={localStream}
            muted
            small
            isMuted={isMuted}
            cameraOff={cameraOff}
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
            isMuted={!!item.isMuted}
            cameraOff={!!item.cameraOff}
          />
        ))}

        {localStream || cameraOff ? (
          <VideoTile
            label="我"
            stream={localStream}
            muted
            isMuted={isMuted}
            cameraOff={cameraOff}
          />
        ) : null}
      </div>
    );
  };

  const showMediaButtons = ['active', 'group-active'].includes(status);

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

          {showMediaButtons ? (
            <div className="video-call-media-row">
              <button
                className={isMuted ? 'modal-btn secondary' : 'modal-btn'}
                onClick={onToggleMute}
              >
                {isMuted ? '取消静音' : '静音'}
              </button>

              <button
                className={cameraOff ? 'modal-btn secondary' : 'modal-btn'}
                onClick={onToggleCamera}
              >
                {cameraOff ? '开启摄像头' : '关闭摄像头'}
              </button>
            </div>
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