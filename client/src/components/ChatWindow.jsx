import { useEffect, useMemo, useRef, useState } from 'react';
import { Smile, Folder, Mic, Phone, Video } from 'lucide-react';
import ReadReceiptModal from './ReadReceiptModal';

const EMOJI_LIST = [
  '😀', '😁', '😂', '🤣', '😊', '😍', '😘', '😎',
  '🤔', '😭', '😡', '🥳', '👍', '👎', '👏', '🙏',
  '💖', '💔', '🔥', '🎉', '✨', '🌹', '🍀', '🎂',
  '🐱', '🐶', '🌞', '🌙', '⚽', '🎮', '🍎', '☕'
];

export default function ChatWindow({
  currentChatTitle,
  messageList,
  currentConversationId,
  onSendMessage,
  onSendFile,
  onSendAudio,
  onDownloadFile,
  onStartVoiceCall,
  onStartVideoCall,
  currentUserId,
  currentConversation,
  currentGroupRole,
  onOpenGroupMembers,
  onDissolveGroup,
  onLeaveGroup,
  currentUserInfo,
  onRecallMessage,
  onMarkMessagesAsRead
}) {
  const [inputValue, setInputValue] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingText, setRecordingText] = useState('');
  const [audioPermissionGranted, setAudioPermissionGranted] = useState(false);
  const [playingAudioId, setPlayingAudioId] = useState('');
  const [replyingMessage, setReplyingMessage] = useState(null);
  const [readReceiptVisible, setReadReceiptVisible] = useState(false);
  const [readReceiptUsers, setReadReceiptUsers] = useState([]);

  const messageEndRef = useRef(null);
  const emojiPanelRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordStartTimeRef = useRef(0);
  const streamRef = useRef(null);
  const audioPlayerRef = useRef(null);
  const isRecordingRef = useRef(false);
  const micButtonRef = useRef(null);

  const handleSend = async () => {
    if (!inputValue.trim() || !currentConversationId) return;

    await onSendMessage(inputValue, replyingMessage);
    setInputValue('');
    setShowEmojiPicker(false);
    setReplyingMessage(null);
  };

  const handleKeyDown = async (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      await handleSend();
    }
  };

  const handleInsertEmoji = (emoji) => {
    setInputValue((prev) => prev + emoji);
  };

  const handleChooseFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !currentConversationId) return;

    await onSendFile(file);
    e.target.value = '';
  };

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messageList]);

  const handleMarkMessagesAsReadRef = useRef(onMarkMessagesAsRead);
  useEffect(() => {
    handleMarkMessagesAsReadRef.current = onMarkMessagesAsRead;
  }, [onMarkMessagesAsRead]);

  const unreadMessageObserver = useRef(null);
  const unreadElementsMap = useRef(new Map());

  useEffect(() => {
    unreadMessageObserver.current = new IntersectionObserver(
      (entries) => {
        const readIds = [];
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const msgId = entry.target.dataset.msgid;
            if (msgId) {
              readIds.push(msgId);
              unreadMessageObserver.current.unobserve(entry.target);
              unreadElementsMap.current.delete(msgId);
            }
          }
        });
        if (readIds.length > 0 && handleMarkMessagesAsReadRef.current) {
          handleMarkMessagesAsReadRef.current(readIds);
        }
      },
      { threshold: 0.5 }
    );

    return () => {
      unreadMessageObserver.current?.disconnect();
      unreadElementsMap.current.clear();
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        emojiPanelRef.current &&
        !emojiPanelRef.current.contains(event.target)
      ) {
        setShowEmojiPicker(false);
      }
    };

    if (showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showEmojiPicker]);

  useEffect(() => {
    const requestMicPermission = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        setAudioPermissionGranted(true);
      } catch (error) {
        console.error('麦克风权限申请失败:', error);
        setAudioPermissionGranted(false);
      }
    };

    if (navigator.mediaDevices?.getUserMedia) {
      requestMicPermission();
    }

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
    };
  }, []);

  const handleStartRecording = async (e) => {
    e.preventDefault();

    if (isRecordingRef.current) return;

    try {
      if (e.currentTarget?.setPointerCapture && e.pointerId !== undefined) {
        e.currentTarget.setPointerCapture(e.pointerId);
      }

      let stream = streamRef.current;

      if (!stream) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        setAudioPermissionGranted(true);
      }

      audioChunksRef.current = [];
      recordStartTimeRef.current = Date.now();

      let mimeType = '';
      if (window.MediaRecorder?.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (window.MediaRecorder?.isTypeSupported('audio/webm')) {
        mimeType = 'audio/webm';
      } else if (window.MediaRecorder?.isTypeSupported('audio/ogg;codecs=opus')) {
        mimeType = 'audio/ogg;codecs=opus';
      }

      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = mediaRecorder;
      isRecordingRef.current = true;
      setIsRecording(true);
      setRecordingText('正在录音... 松开发送');

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const durationMs = Date.now() - recordStartTimeRef.current;
        const durationSeconds = Math.max(1, Math.round(durationMs / 1000));

        isRecordingRef.current = false;
        setIsRecording(false);
        setRecordingText('');

        if (durationMs < 1000) {
          audioChunksRef.current = [];
          return;
        }

        if (!audioChunksRef.current.length) {
          return;
        }

        const blobType = mediaRecorder.mimeType || 'audio/webm';
        const ext = blobType.includes('ogg') ? 'ogg' : 'webm';

        const audioBlob = new Blob(audioChunksRef.current, {
          type: blobType
        });

        const audioFile = new File(
          [audioBlob],
          `voice-${Date.now()}.${ext}`,
          { type: blobType }
        );

        await onSendAudio(audioFile, durationSeconds);
        audioChunksRef.current = [];
      };

      mediaRecorder.start();
    } catch (error) {
      console.error('开始录音失败:', error);
      isRecordingRef.current = false;
      setIsRecording(false);
      setRecordingText('');
    }
  };

  const handleStopRecording = (e) => {
    if (e?.currentTarget?.releasePointerCapture && e.pointerId !== undefined) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch (error) {
        // ignore
      }
    }

    if (!isRecordingRef.current) return;

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
  };

  const handleToggleAudioPlay = (msg) => {
    if (!msg?.fileUrl) return;

    const audioId = msg._id;

    if (playingAudioId === audioId && audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      setPlayingAudioId('');
      return;
    }

    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }

    const audio = new Audio(msg.fileUrl);
    audioPlayerRef.current = audio;
    setPlayingAudioId(audioId);

    audio.play().catch((error) => {
      console.error('语音播放失败:', error);
      setPlayingAudioId('');
    });

    audio.onended = () => {
      setPlayingAudioId('');
      audioPlayerRef.current = null;
    };

    audio.onpause = () => {
      if (playingAudioId === audioId) {
        setPlayingAudioId('');
      }
    };
  };

  const isGroupChat = currentConversation?.type === 'group';
  const isOwner = currentGroupRole === 'owner';

  const chatTarget = useMemo(() => {
    if (!currentConversation) return null;

    if (currentConversation.type === 'private') {
      return currentConversation.targetUser || null;
    }

    return currentConversation.groupInfo || null;
  }, [currentConversation]);

  const renderHeaderAvatar = (target) => {
    if (target?.avatar) {
      return (
        <img
          src={target.avatar}
          alt={target?.nickname || target?.username || target?.name || '头像'}
          className="chat-header-avatar-img"
        />
      );
    }

    return (
      <div className="chat-header-avatar-fallback">
        {(target?.nickname || target?.username || target?.name || 'C').slice(0, 1)}
      </div>
    );
  };

  const renderMessageAvatar = (user, isSelf) => {
    if (user?.avatar) {
      return (
        <img
          src={user.avatar}
          alt={user?.nickname || user?.username || '头像'}
          className="message-avatar-img"
        />
      );
    }

    return (
      <div className={isSelf ? 'message-avatar-fallback self' : 'message-avatar-fallback other'}>
        {(user?.nickname || user?.username || 'U').slice(0, 1)}
      </div>
    );
  };

  const isPreviewableFile = (fileUrl = '', fileName = '') => {
    const source = (fileName || fileUrl).toLowerCase();

    return [
      '.pdf',
      '.txt',
      '.png',
      '.jpg',
      '.jpeg',
      '.gif',
      '.webp',
      '.svg',
      '.json',
      '.mp4',
      '.mp3'
    ].some((ext) => source.endsWith(ext));
  };

  return (
    <div className="chat-window">
      <div className="chat-header">
        <div className="chat-header-left">
          <div className="chat-header-title">
            {currentChatTitle || '请选择一个会话'}
          </div>
        </div>

        <div className="chat-header-right">
          {chatTarget ? (
            <div className="chat-header-avatar">
              {renderHeaderAvatar(chatTarget)}
            </div>
          ) : null}

          <div className="chat-header-actions">
            {isGroupChat && isOwner ? (
              <>
                <button
                  className="chat-header-btn secondary"
                  onClick={onOpenGroupMembers}
                >
                  成员管理
                </button>

                <button
                  className="chat-header-btn danger"
                  onClick={onDissolveGroup}
                >
                  解散群聊
                </button>
              </>
            ) : null}

            {isGroupChat && !isOwner ? (
              <button
                className="chat-header-btn danger"
                onClick={onLeaveGroup}
              >
                退出群聊
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="chat-message-list">
        {messageList.length === 0 ? (
          <div className="empty-message">暂无消息</div>
        ) : (
          messageList.map((msg) => {
            const senderId =
              msg.senderId?._id || msg.senderId?.id || msg.senderId || '';
            const isSelf = String(senderId) === String(currentUserId);

            const senderInfo = isSelf ? currentUserInfo : msg.senderId;

            const hasRead = msg.readBy?.some(
              (u) => String(u._id || u) === String(currentUserId)
            );

            const refCallback = (node) => {
              if (!node || isSelf || hasRead || msg.isRecalled) return;
              if (!unreadElementsMap.current.has(msg._id)) {
                unreadMessageObserver.current?.observe(node);
                unreadElementsMap.current.set(msg._id, node);
              }
            };

            const canRecall =
              isSelf &&
              !msg.isRecalled &&
              Date.now() - new Date(msg.sentAt || Date.now()).getTime() <= 2 * 60 * 1000;

            if (msg.isRecalled) {
              return (
                <div key={msg._id} className="message-row recalled-row">
                  <div className="message-recalled-text">
                    {isSelf ? '你' : senderInfo?.nickname || senderInfo?.username} 撤回了一条消息
                  </div>
                </div>
              );
            }

            const readCount = msg.readBy?.length || 0;

            return (
              <div
                key={msg._id}
                ref={refCallback}
                data-msgid={msg._id}
                className={isSelf ? 'message-row self' : 'message-row other'}
              >
                {!isSelf && (
                  <div className="message-avatar">
                    {renderMessageAvatar(senderInfo, false)}
                  </div>
                )}

                <div className={isSelf ? 'message-content-wrap self' : 'message-content-wrap other'}>
                  <div className={isSelf ? 'message-meta self' : 'message-meta other'}>
                    {senderInfo?.nickname || senderInfo?.username || '未知用户'}
                  </div>

                  {msg.replyTo && (
                    <div className="message-reply-bubble">
                      <div className="message-reply-user">
                        {msg.replyTo.senderId?._id === currentUserId
                          ? '回复自己:'
                          : `回复 ${(typeof msg.replyTo.senderId === 'object' ? msg.replyTo.senderId?.nickname || msg.replyTo.senderId?.username : '未知')}:`}
                      </div>
                      <div className="message-reply-text">
                        {msg.replyTo.isRecalled ? '原消息已撤回' : msg.replyTo.messageType === 'text' ? msg.replyTo.content : `[${msg.replyTo.messageType}]`}
                      </div>
                    </div>
                  )}

                  <div className={isSelf ? 'message-bubble self' : 'message-bubble other'}>
{msg.messageType === 'file' ? (
  <div className="file-message-box">
    <div className="file-message-name">📎 {msg.content || '文件'}</div>

    <div className="file-message-actions">
      {isPreviewableFile(msg.fileUrl, msg.content) ? (
        <a
          href={msg.fileUrl}
          target="_blank"
          rel="noreferrer"
          className="file-message-action-link"
        >
          在线预览
        </a>
      ) : null}

      <button
        type="button"
        className="file-message-action-link file-message-action-btn"
        onClick={() =>
          onDownloadFile(
            msg.fileUrl?.split('/').pop(),
            msg.content || '文件'
          )
        }
      >
        下载
      </button>
    </div>
  </div>
) : msg.messageType === 'audio' ? (
  <button
    type="button"
    className={playingAudioId === msg._id ? 'audio-message playing' : 'audio-message'}
    onClick={() => handleToggleAudioPlay(msg)}
  >
    <span className="audio-message-icon">🎤</span>
    <span className="audio-message-text">
      {playingAudioId === msg._id ? '暂停播放' : '点击播放'}
    </span>
    <span className="audio-message-duration">
      {msg.content || '1'}''
    </span>
  </button>
) : msg.messageType === 'call' ? (
  <div className="call-message-card">
    <div className="call-message-icon">
      {msg.callInfo?.mediaType === 'video' ? '📹' : '📞'}
    </div>
    <div className="call-message-content">
      <div className="call-message-title">
        {msg.callInfo?.mediaType === 'video' ? '视频通话记录' : '语音通话记录'}
      </div>
      <div className="call-message-text">{msg.content}</div>
      {msg.callInfo?.durationSec > 0 ? (
        <div className="call-message-duration">
          时长：{msg.callInfo.durationSec} 秒
        </div>
      ) : null}
    </div>
  </div>
) : (
  <div style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{msg.content}</div>
)}
                  </div>
                  
                  <div className="message-actions-bar">
                    <button className="message-action-btn" onClick={() => setReplyingMessage(msg)}>回复</button>
                    {canRecall && (
                      <button className="message-action-btn" onClick={() => onRecallMessage(msg._id)}>撤回</button>
                    )}
                  </div>

                  {isSelf && (
                    <div className="message-read-status" title={isGroupChat ? `已读人员列表...` : ''} onClick={() => {
                        if (isGroupChat && readCount > 0) {
                           setReadReceiptUsers(msg.readBy);
                           setReadReceiptVisible(true);
                        }
                    }}>
                      {isGroupChat ? (
                        readCount > 0 ? <span className="read-count">{readCount}人已读</span> : <span className="read-none">未读</span>
                      ) : (
                        readCount > 0 ? <span className="read-all">✓✓ 已读</span> : <span className="read-none">✓ 未读</span>
                      )}
                    </div>
                  )}

                </div>

                {isSelf && (
                  <div className="message-avatar">
                    {renderMessageAvatar(currentUserInfo, true)}
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={messageEndRef} />
      </div>

      <div className="chat-input-area">
        <div className="chat-toolbar" ref={emojiPanelRef}>
          <button
            className={showEmojiPicker ? 'chat-tool-icon-btn active' : 'chat-tool-icon-btn'}
            type="button"
            onClick={() => setShowEmojiPicker((prev) => !prev)}
            title="表情"
          >
            <Smile size={22} strokeWidth={1.9} />
          </button>

          <button
            className="chat-tool-icon-btn"
            type="button"
            onClick={handleChooseFile}
            title="文件"
          >
            <Folder size={22} strokeWidth={1.9} />
          </button>

          <button
            ref={micButtonRef}
            className={isRecording ? 'chat-tool-icon-btn active record-active' : 'chat-tool-icon-btn'}
            type="button"
            title="按住说话"
            onPointerDown={handleStartRecording}
            onPointerUp={handleStopRecording}
            onPointerCancel={handleStopRecording}
          >
            <Mic size={22} strokeWidth={1.9} />
          </button>

          <button
            className="chat-tool-icon-btn"
            type="button"
            onClick={onStartVoiceCall}
            title="语音聊天"
          >
            <Phone size={22} strokeWidth={1.9} />
          </button>

          <button
            className="chat-tool-icon-btn"
            type="button"
            onClick={onStartVideoCall}
            title="视频聊天"
          >
            <Video size={22} strokeWidth={1.9} />
          </button>

          <input
            ref={fileInputRef}
            type="file"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />

          {showEmojiPicker ? (
            <div className="emoji-picker-panel">
              {EMOJI_LIST.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="emoji-btn"
                  onClick={() => handleInsertEmoji(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {isRecording ? (
          <div className="recording-indicator">{recordingText}</div>
        ) : null}

        {replyingMessage && (
          <div className="reply-prep-bar">
            <div className="reply-prep-content">
              <strong>回复 {replyingMessage.senderId?.nickname || replyingMessage.senderId?.username}: </strong>
              {replyingMessage.messageType === 'text' ? replyingMessage.content : `[${replyingMessage.messageType}]`}
            </div>
            <button className="reply-prep-close" onClick={() => setReplyingMessage(null)}>✕</button>
          </div>
        )}

        <div className="chat-input-main">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息，按 Enter 发送，Shift + Enter 换行"
          />
          <button className="chat-send-btn" onClick={handleSend}>
            发送
          </button>
        </div>
      </div>

      <ReadReceiptModal
        visible={readReceiptVisible}
        onClose={() => setReadReceiptVisible(false)}
        users={readReceiptUsers}
      />
    </div>
  );
}