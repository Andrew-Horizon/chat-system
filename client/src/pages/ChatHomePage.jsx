import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import ChatListPanel from '../components/ChatListPanel';
import ChatWindow from '../components/ChatWindow';
import AddFriendModal from '../components/AddFriendModal';
import FriendRequestModal from '../components/FriendRequestModal';
import AlertModal from '../components/AlertModal';
import ConfirmModal from '../components/ConfirmModal';
import GroupMemberModal from '../components/GroupMemberModal';
import CreateGroupModal from '../components/CreateGroupModal';
import JoinGroupModal from '../components/JoinGroupModal';
import InviteGroupMemberModal from '../components/InviteGroupMemberModal';
import VoiceCallController from '../components/VoiceCallController';
import VideoCallController from '../components/VideoCallController';
import { logoutApi } from '../api/auth';
import {
  getMeApi,
  getConversationListApi,
  getFriendListApi,
  getGroupListApi,
  getMessageListApi,
  sendMessageApi,
  createPrivateConversationApi,
  addFriendApi,
  searchUsersApi,
  getFriendRequestsApi,
  handleFriendRequestApi,
  deleteFriendApi,
  searchGroupsApi,
  createGroupApi,
  sendJoinGroupRequestApi,
  getGroupApplicationsApi,
  handleGroupApplicationApi,
  getGroupMembersApi,
  kickGroupMemberApi,
  dissolveGroupApi,
  getGroupInviteCandidatesApi,
  inviteGroupMembersApi,
  leaveGroupApi,
  uploadFileApi,
  downloadFileApi,
  uploadPublicKeyApi,
  batchGetPublicKeysApi
} from '../api/chat';
import { connectSocket, disconnectSocket, getSocket } from '../utils/socket';
import {
  generateKeyPair,
  saveKeysToStorage,
  hasLocalKeys,
  getPrivateKeyFromStorage,
  getPublicKeyJwkFromStorage,
  encryptMessage,
  decryptMessage,
  importPublicKey
} from '../utils/crypto';
import '../styles/chat.css';

export default function ChatHomePage() {
  const navigate = useNavigate();

  const [userInfo, setUserInfo] = useState(null);
  const [activeMenu, setActiveMenu] = useState('conversation');
  const [conversations, setConversations] = useState([]);
  const [friends, setFriends] = useState([]);
  const [groups, setGroups] = useState([]);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [messageList, setMessageList] = useState([]);
  const [messagePage, setMessagePage] = useState(1);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [addFriendModalVisible, setAddFriendModalVisible] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [friendRequestModalVisible, setFriendRequestModalVisible] = useState(false);
  const [friendRequests, setFriendRequests] = useState([]);
  const [inviteGroupCandidates, setInviteGroupCandidates] = useState([]);
  
  const [alertModal, setAlertModal] = useState({
    visible: false,
    title: '提示',
    message: ''
  });

  const [confirmModal, setConfirmModal] = useState({
    visible: false,
    title: '确认',
    message: '',
    onConfirm: null
  });

  const [createGroupModalVisible, setCreateGroupModalVisible] = useState(false);
  const [joinGroupModalVisible, setJoinGroupModalVisible] = useState(false);
  const [groupSearchResults, setGroupSearchResults] = useState([]);
  const [groupSearchLoading, setGroupSearchLoading] = useState(false);
  const [groupApplications, setGroupApplications] = useState([]);
  const [groupMembers, setGroupMembers] = useState([]);
  const [groupMemberModalVisible, setGroupMemberModalVisible] = useState(false);

  const currentUserId = userInfo?._id || userInfo?.id || '';
  const currentConversationId = currentConversation?.id || currentConversation?._id || '';
  const joinedConversationRef = useRef('');
  const [inviteGroupMemberModalVisible, setInviteGroupMemberModalVisible] = useState(false);

  const currentChatTitle = useMemo(() => {
    if (!currentConversation) return '';
    if (currentConversation.type === 'private') {
      return (
        currentConversation.targetUser?.nickname ||
        currentConversation.targetUser?.username ||
        '单聊'
      );
    }
    return currentConversation.groupInfo?.name || '群聊';
  }, [currentConversation]);

  const currentGroupRole =
    currentConversation?.type === 'group'
      ? groups.find(
          (item) =>
            String(item.id) === String(currentConversation?.groupInfo?._id) ||
            String(item.id) === String(currentConversation?.groupInfo?.id)
        )?.role
      : null;

  const showAlert = (message, title = '提示') => {
    setAlertModal({
      visible: true,
      title,
      message
    });
  };

  const closeAlert = () => {
    setAlertModal((prev) => ({
      ...prev,
      visible: false
    }));
  };

  const showConfirm = ({ title = '确认', message, onConfirm }) => {
    setConfirmModal({
      visible: true,
      title,
      message,
      onConfirm
    });
  };

  const openCreateGroupModal = () => {
    setCreateGroupModalVisible(true);
  };
  

  const closeCreateGroupModal = () => {
    setCreateGroupModalVisible(false);
  };

  const openJoinGroupModal = () => {
    setGroupSearchResults([]);
    setJoinGroupModalVisible(true);
  };

  const closeJoinGroupModal = () => {
    setJoinGroupModalVisible(false);
    setGroupSearchResults([]);
  };

  const handleCreateGroup = async (payload) => {
    try {
      await createGroupApi(payload);
      closeCreateGroupModal();
      showAlert('创建群聊成功，已向好友发送邀请');
      await loadBaseData();
    } catch (error) {
      showAlert(error?.response?.data?.message || '创建群聊失败');
    }
  };

  const handleSearchGroups = async (keyword) => {
    try {
      setGroupSearchLoading(true);
      const res = await searchGroupsApi(keyword);
      setGroupSearchResults(res.data.data || []);
    } catch (error) {
      showAlert(error?.response?.data?.message || '搜索群聊失败');
    } finally {
      setGroupSearchLoading(false);
    }
  };

  const handleJoinGroup = async (group) => {
    try {
    await sendJoinGroupRequestApi(group.id);
      showAlert('入群申请已发送');

      setGroupSearchResults((prev) =>
        prev.map((item) =>
          item.id === group.id ? { ...item, joinStatus: 'pending' } : item
      )
      );
    } catch (error) {
      showAlert(error?.response?.data?.message || '发送入群申请失败');
    }
  };

  const loadAllApplications = async () => {
    const [friendRes, groupRes] = await Promise.all([
      getFriendRequestsApi(),
      getGroupApplicationsApi()
    ]);

    setFriendRequests(friendRes.data.data || []);
    setGroupApplications(groupRes.data.data || []);
  };

  const openFriendRequestModal = async () => {
    try {
      await loadAllApplications();
      setFriendRequestModalVisible(true);
    } catch (error) {
      showAlert(error?.response?.data?.message || '获取申请失败');
    }
  };

  const handleGroupApplicationAction = async (applicationId, action) => {
    try {
      await handleGroupApplicationApi({
        applicationId,
        action
      });

      showAlert(action === 'accept' ? '已同意群聊申请' : '已拒绝群聊申请');
      await loadAllApplications();
      await loadBaseData();
    } catch (error) {
      showAlert(error?.response?.data?.message || '处理群聊申请失败');
    }
  };

  const closeConfirm = () => {
    setConfirmModal({
      visible: false,
      title: '确认',
      message: '',
      onConfirm: null
    });
  };

  const loadBaseData = async () => {
    try {
      const [meRes, convRes, friendRes, groupRes] = await Promise.all([
        getMeApi(),
        getConversationListApi(),
        getFriendListApi(),
        getGroupListApi()
      ]);

      setUserInfo(meRes.data.data);
      setConversations(convRes.data.data || []);
      setFriends(friendRes.data.data || []);
      setGroups(groupRes.data.data || []);
    } catch (error) {
      disconnectSocket();
      localStorage.removeItem('token');
      localStorage.removeItem('userInfo');
      navigate('/login');
    }
  };

  const decryptMessages = async (messages) => {
    const privateKey = await getPrivateKeyFromStorage();
    if (!privateKey) return messages;
    const myId = userInfo?._id || userInfo?.id || '';
    const result = [];
    for (const msg of messages) {
      if (msg.encrypted && msg.encryptedKeys && msg.iv) {
        try {
          const encKeys = msg.encryptedKeys instanceof Map
            ? Object.fromEntries(msg.encryptedKeys)
            : (typeof msg.encryptedKeys === 'object' ? msg.encryptedKeys : {});
          const myEncKey = encKeys[myId];
          if (myEncKey) {
            const plaintext = await decryptMessage(msg.content, msg.iv, myEncKey, privateKey);
            result.push({ ...msg, content: plaintext, _decrypted: true });
            continue;
          }
        } catch (e) {
          result.push({ ...msg, content: '[加密消息，无法解密]' });
          continue;
        }
      }
      result.push(msg);
    }
    return result;
  };

  const loadMessages = async (conversationId) => {
    try {
      const res = await getMessageListApi(conversationId, 1, 20);
      const data = res.data.data;
      const decrypted = await decryptMessages(data.list || []);
      setMessageList(decrypted);
      setMessagePage(1);
      const total = data.pagination?.total || 0;
      setHasMoreMessages((data.list?.length || 0) < total);
    } catch (error) {
      setMessageList([]);
      setHasMoreMessages(false);
    }
  };

  const loadMoreMessages = async () => {
    if (!currentConversation || loadingMore || !hasMoreMessages) return;
    const convId = currentConversation.id || currentConversation._id;
    const nextPage = messagePage + 1;
    setLoadingMore(true);
    try {
      const res = await getMessageListApi(convId, nextPage, 20);
      const data = res.data.data;
      const olderRaw = data.list || [];
      const older = await decryptMessages(olderRaw);
      if (older.length === 0) {
        setHasMoreMessages(false);
      } else {
        setMessageList((prev) => [...older, ...prev]);
        setMessagePage(nextPage);
        const total = data.pagination?.total || 0;
        const loaded = messageList.length + older.length;
        setHasMoreMessages(loaded < total);
      }
    } catch (error) {
      console.error('加载更多消息失败:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleSelectConversation = async (item) => {
    setCurrentConversation(item);
    setConversations((prev) =>
      prev.map((c) =>
        String(c.id) === String(item.id || item._id)
          ? { ...c, unreadCount: 0 }
          : c
      )
    );
    await loadMessages(item.id || item._id);
  };

  const openAddFriendModal = () => {
    setSearchResults([]);
    setAddFriendModalVisible(true);
  };

  const closeAddFriendModal = () => {
    setAddFriendModalVisible(false);
    setSearchResults([]);
  };

const handleInviteGroupMembers = async (selectedIds) => {
  try {
    const groupId =
      currentConversation?.groupInfo?._id || currentConversation?.groupInfo?.id;

    if (!groupId) {
      showAlert('当前群组信息不存在');
      return;
    }

    await inviteGroupMembersApi({
      groupId,
      inviteFriendIds: selectedIds
    });

    showAlert('群邀请发送成功');

    const res = await getGroupInviteCandidatesApi(groupId);
    setInviteGroupCandidates(res.data.data || []);
  } catch (error) {
    showAlert(error?.response?.data?.message || '发送群邀请失败');
  }
};

  const handleSelectFriend = async (friend) => {
    try {
      const res = await createPrivateConversationApi(friend.id);

      const conversation = {
        ...res.data.data,
        id: res.data.data._id || res.data.data.id,
        type: 'private',
        targetUser: friend,
        groupInfo: null
      };

      setCurrentConversation(conversation);
      setActiveMenu('conversation');
      await loadBaseData();
      await loadMessages(conversation.id);
    } catch (error) {
      showAlert(error?.response?.data?.message || '打开单聊失败');
    }
  };

  const handleSelectGroup = async (group) => {
    const targetConversation = conversations.find(
      (item) =>
        item.type === 'group' &&
        item.groupInfo &&
        (item.groupInfo._id === group.id || item.groupInfo._id === group._id)
    );

    if (!targetConversation) {
      showAlert('该群聊会话暂未找到，请先确认后端会话列表是否包含该群');
      return;
    }

    setCurrentConversation(targetConversation);
    setActiveMenu('conversation');
    await loadMessages(targetConversation.id);
  };

  const handleKickMember = async (member) => {
  const groupId =
    currentConversation?.groupInfo?._id || currentConversation?.groupInfo?.id;

  showConfirm({
    title: '移出群成员',
    message: `确认将 ${member.nickname || member.username} 移出群聊吗？`,
    onConfirm: async () => {
      try {
        await kickGroupMemberApi({
          groupId,
          memberId: member.id
        });

        closeConfirm();
        showAlert('移出群成员成功');

        const res = await getGroupMembersApi(groupId);
        setGroupMembers(res.data.data || []);

        await loadBaseData();
      } catch (error) {
        closeConfirm();
        showAlert(error?.response?.data?.message || '移出群成员失败');
      }
    }
  });
};

const handleLeaveGroup = async () => {
  const groupId =
    currentConversation?.groupInfo?._id || currentConversation?.groupInfo?.id;

  if (!groupId) {
    showAlert('当前群组信息不存在');
    return;
  }

  showConfirm({
    title: '退出群聊',
    message: '确认退出当前群聊吗？退出后将无法继续接收该群消息。',
    onConfirm: async () => {
      try {
        await leaveGroupApi(groupId);

        closeConfirm();
        showAlert('退群成功');

        setCurrentConversation(null);
        setMessageList([]);
        closeGroupMemberModal();

        await loadBaseData();
      } catch (error) {
        closeConfirm();
        showAlert(error?.response?.data?.message || '退群失败');
      }
    }
  });
};

  const handleDissolveGroup = async () => {
  const groupId =
    currentConversation?.groupInfo?._id || currentConversation?.groupInfo?.id;

  if (!groupId) {
    showAlert('当前群组信息不存在');
    return;
  }

  showConfirm({
    title: '解散群聊',
    message: '确认解散当前群聊吗？解散后将删除群成员关系和聊天记录，且不可恢复。',
    onConfirm: async () => {
      try {
        await dissolveGroupApi(groupId);

        closeConfirm();
        showAlert('解散群聊成功');

        setCurrentConversation(null);
        setMessageList([]);
        closeGroupMemberModal();

        await loadBaseData();
      } catch (error) {
        closeConfirm();
        showAlert(error?.response?.data?.message || '解散群聊失败');
      }
    }
  });
};

  const handleSendMessage = async (content, replyTo = null) => {
    if (!currentConversationId || !content.trim()) return;

    const socket = getSocket();
    const tempId = `temp_${Date.now()}`;
    const optimisticMessage = {
      _id: tempId,
      conversationId: currentConversationId,
      conversationType: currentConversation?.type || 'private',
      senderId: {
        _id: currentUserId,
        id: currentUserId,
        username: userInfo?.username,
        nickname: userInfo?.nickname,
        avatar: userInfo?.avatar,
        status: userInfo?.status
      },
      messageType: 'text',
      content,
      fileUrl: '',
      clientMsgId: `msg_${Date.now()}`,
      isRecalled: false,
      replyTo,
      readBy: []
    };

    setMessageList((prev) => [...prev, optimisticMessage]);

    try {
      if (socket && socket.connected) {
        // E2EE 加密
        let sendPayload = {
          conversationId: currentConversationId,
          content,
          messageType: 'text',
          clientMsgId: optimisticMessage.clientMsgId,
          replyTo: replyTo ? replyTo._id || replyTo.id : null
        };

        try {
          const conv = conversations.find(c => String(c.id) === String(currentConversationId));
          const participantIds = conv?.participantIds || [];
          if (participantIds.length > 0) {
            const keysRes = await batchGetPublicKeysApi(participantIds);
            const pubKeys = keysRes.data?.data || {};
            const recipients = [];
            for (const [uid, keyStr] of Object.entries(pubKeys)) {
              const pubKey = await importPublicKey(keyStr);
              recipients.push({ userId: uid, publicKey: pubKey });
            }
            if (recipients.length > 0) {
              const { ciphertext, iv, encryptedKeys } = await encryptMessage(content, recipients);
              sendPayload.content = ciphertext;
              sendPayload.encrypted = true;
              sendPayload.encryptedKeys = encryptedKeys;
              sendPayload.iv = iv;
            }
          }
        } catch (encErr) {
          console.warn('E2EE 加密失败，回退明文发送:', encErr);
        }

        socket.emit('message:send', sendPayload);
      } else {
        await sendMessageApi({
          conversationId: currentConversationId,
          content,
          messageType: 'text',
          clientMsgId: optimisticMessage.clientMsgId,
          replyTo: replyTo ? replyTo._id || replyTo.id : null
        });

        await loadMessages(currentConversationId);
        await loadBaseData();
      }
    } catch (error) {
      setMessageList((prev) => prev.filter((msg) => msg._id !== tempId));
      showAlert(error?.response?.data?.message || '发送消息失败');
    }
  };

const handleSendFile = async (file) => {
  if (!currentConversationId || !file) return;

  try {
    const uploadRes = await uploadFileApi(file);
    const { fileUrl, originalName } = uploadRes.data.data;

    const socket = getSocket();

    if (socket && socket.connected) {
      socket.emit('message:send', {
        conversationId: currentConversationId,
        content: originalName,
        messageType: 'file',
        fileUrl,
        clientMsgId: `file_${Date.now()}`
      });
    } else {
      await sendMessageApi({
        conversationId: currentConversationId,
        content: originalName,
        messageType: 'file',
        fileUrl,
        clientMsgId: `file_${Date.now()}`
      });

      await loadMessages(currentConversationId);
      await loadBaseData();
    }
  } catch (error) {
    showAlert(error?.response?.data?.message || '文件发送失败');
  }
};

const handleSendAudio = async (audioFile, durationSeconds) => {
  if (!currentConversationId || !audioFile) return;

  try {
    const uploadRes = await uploadFileApi(audioFile);
    const { fileUrl } = uploadRes.data.data;

    const socket = getSocket();

    if (socket && socket.connected) {
      socket.emit('message:send', {
        conversationId: currentConversationId,
        content: String(durationSeconds || 1),
        messageType: 'audio',
        fileUrl,
        clientMsgId: `audio_${Date.now()}`
      });
    } else {
      await sendMessageApi({
        conversationId: currentConversationId,
        content: String(durationSeconds || 1),
        messageType: 'audio',
        fileUrl,
        clientMsgId: `audio_${Date.now()}`
      });

      await loadMessages(currentConversationId);
      await loadBaseData();
    }
  } catch (error) {
    showAlert(error?.response?.data?.message || '语音发送失败');
  }
};

const handleStartVoiceCall = () => {
  const socket = getSocket();

  if (!socket || !socket.connected) {
    showAlert('当前连接不可用，无法发起语音聊天');
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

    socket.emit('voice:private:start', {
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

    const participantIds =
      (currentConversation?.participantIds || [])
        .map((item) =>
          typeof item === 'string' ? item : item?._id || item?.id
        )
        .filter(Boolean);

    if (!groupId) {
      showAlert('当前群聊信息不完整');
      return;
    }

    socket.emit('voice:group:start', {
      groupId,
      conversationId,
      groupName
    });
  }
};

const handleStartVideoCall = () => {
  if (typeof window !== 'undefined' && typeof window.__startVideoCall__ === 'function') {
    window.__startVideoCall__();
    return;
  }

  showAlert('视频聊天功能尚未准备完成，请稍后重试');
};

const handleDownloadFile = async (filename, originalName) => {
  try {
    if (!filename) {
      showAlert('文件信息不完整，无法下载');
      return;
    }

    const res = await downloadFileApi(filename, originalName);
    const blob = new Blob([res.data]);

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = originalName || filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    showAlert(error?.response?.data?.message || '文件下载失败');
  }
};

  const handleLogout = async () => {
    try {
      await logoutApi();
    } catch (e) {
      console.warn('Backend logout failed or token already cleared', e);
    }
    disconnectSocket();
    localStorage.removeItem('token');
    localStorage.removeItem('userInfo');

    setUserInfo(null);
    setConversations([]);
    setFriends([]);
    setGroups([]);
    setCurrentConversation(null);
    setMessageList([]);

    window.location.replace('/login');
  };

  const handleRecallMessage = (messageId) => {
    if (!currentConversationId) return;
    const socket = getSocket();
    if (socket && socket.connected) {
      socket.emit('message:recall', {
        messageId,
        conversationId: currentConversationId
      });
    } else {
      showAlert('当前未连接，无法撤回消息');
    }
  };

  const handleMarkMessagesAsRead = (messageIds) => {
    if (!currentConversationId || !messageIds || messageIds.length === 0) return;
    const socket = getSocket();
    if (socket && socket.connected) {
      socket.emit('message:read', {
        messageIds,
        conversationId: currentConversationId
      });
    }
  };

  const handleSearchUsers = async (keyword) => {
    try {
      setSearchLoading(true);
      const res = await searchUsersApi(keyword);
      setSearchResults(res.data.data || []);
    } catch (error) {
      showAlert(error?.response?.data?.message || '搜索失败');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleAddFriend = async (user) => {
    try {
      await addFriendApi(user.id);
      showAlert('好友申请已发送');
      await loadBaseData();

      setSearchResults((prev) =>
        prev.map((item) =>
          item.id === user.id ? { ...item, relationStatus: 'pending' } : item
        )
      );
    } catch (error) {
      showAlert(error?.response?.data?.message || '发送好友申请失败');
    }
  };

  const handleRequestAction = async (requestId, action) => {
    try {
      await handleFriendRequestApi({
        requestId,
        action
      });

      showAlert(action === 'accept' ? '已同意好友申请' : '已拒绝好友申请');

      const res = await getFriendRequestsApi();
      setFriendRequests(res.data.data || []);
      await loadBaseData();
    } catch (error) {
      showAlert(error?.response?.data?.message || '处理好友申请失败');
    }
  };

  const handleDeleteFriend = async (friend) => {
    showConfirm({
      title: '删除好友',
      message: `确认删除好友 ${friend.nickname || friend.username} 吗？`,
      onConfirm: async () => {
        try {
          await deleteFriendApi(friend.id);
          closeConfirm();
          showAlert('删除好友成功');
          await loadBaseData();
        } catch (error) {
          closeConfirm();
          showAlert(error?.response?.data?.message || '删除好友失败');
        }
      }
    });
  };

  const closeGroupMemberModal = () => {
    setGroupMemberModalVisible(false);
    setGroupMembers([]);
  };

const handleOpenGroupMembers = async () => {
  try {
    const groupId =
      currentConversation?.groupInfo?._id || currentConversation?.groupInfo?.id;

    if (!groupId) {
      showAlert('当前群组信息不存在');
      return;
    }

    const res = await getGroupMembersApi(groupId);
    setGroupMembers(res.data.data || []);
    setGroupMemberModalVisible(true);
  } catch (error) {
    showAlert(error?.response?.data?.message || '获取群成员失败');
  }
};

const openInviteGroupMemberModal = async () => {
  try {
    const groupId =
      currentConversation?.groupInfo?._id || currentConversation?.groupInfo?.id;

    if (!groupId) {
      showAlert('当前群组信息不存在');
      return;
    }

    const res = await getGroupInviteCandidatesApi(groupId);
    setInviteGroupCandidates(res.data.data || []);
    setInviteGroupMemberModalVisible(true);
  } catch (error) {
    showAlert(error?.response?.data?.message || '获取可邀请好友失败');
  }
};

const closeInviteGroupMemberModal = () => {
  setInviteGroupMemberModalVisible(false);
  setInviteGroupCandidates([]);
};

  const closeFriendRequestModal = () => {
    setFriendRequestModalVisible(false);
  };

  useEffect(() => {
  const token = localStorage.getItem('token');

  if (!token) {
    navigate('/login');
    return;
  }

  loadBaseData();

  // E2EE: 初始化密钥对
  (async () => {
    try {
      if (!hasLocalKeys()) {
        const keyPair = await generateKeyPair();
        const { publicKeyJwk } = await saveKeysToStorage(keyPair);
        await uploadPublicKeyApi(publicKeyJwk);
        console.log('E2EE: 新密钥对已生成并上传');
      } else {
        const pubJwk = getPublicKeyJwkFromStorage();
        await uploadPublicKeyApi(pubJwk);
        console.log('E2EE: 本地密钥对已恢复');
      }
    } catch (e) {
      console.error('E2EE 初始化失败:', e);
    }
  })();

  const socket = connectSocket(token);
  if (!socket) return;

  const heartbeatInterval = setInterval(() => {
    if (socket && socket.connected) {
      socket.emit('heartbeat');
    }
  }, 30000);

  const handleMessageNew = async (payload) => {
    let newMessage = payload?.data;
    if (!newMessage) return;

    // E2EE 解密
    if (newMessage.encrypted && newMessage.encryptedKeys && newMessage.iv) {
      try {
        const privateKey = await getPrivateKeyFromStorage();
        const myId = currentUserId;
        const encKeys = newMessage.encryptedKeys instanceof Map
          ? Object.fromEntries(newMessage.encryptedKeys)
          : newMessage.encryptedKeys;
        const myEncKey = encKeys[myId];
        if (privateKey && myEncKey) {
          const plaintext = await decryptMessage(newMessage.content, newMessage.iv, myEncKey, privateKey);
          newMessage = { ...newMessage, content: plaintext, _decrypted: true };
        }
      } catch (decErr) {
        console.warn('E2EE 解密失败:', decErr);
        newMessage = { ...newMessage, content: '[加密消息，无法解密]' };
      }
    }

    const newConversationId =
      newMessage.conversationId?._id ||
      newMessage.conversationId ||
      '';

    const currentRefId = joinedConversationRef.current;

    if (String(newConversationId) === String(currentRefId)) {
      setMessageList((prev) => {
        const exists = prev.some(
          (item) =>
            String(item._id) === String(newMessage._id) ||
            (item.clientMsgId && item.clientMsgId === newMessage.clientMsgId)
        );

        if (exists) {
          return prev.map((item) =>
            item.clientMsgId && item.clientMsgId === newMessage.clientMsgId
              ? newMessage
              : item
          );
        }

        return [...prev, newMessage];
      });
    }

    setConversations((prev) => {
      let found = false;
      const updated = prev.map((c) => {
        if (String(c.id) === String(newConversationId)) {
          found = true;
          return {
            ...c,
            lastMessage: newMessage.messageType === 'text' ? newMessage.content : `[${newMessage.messageType}]`,
            lastMessageAt: newMessage.createdAt || newMessage.sentAt || Date.now(),
            unreadCount:
              String(newConversationId) === String(currentRefId) || String(newMessage.senderId?._id) === String(currentUserId)
                ? 0
                : (c.unreadCount || 0) + 1
          };
        }
        return c;
      });
      if (!found) {
        setTimeout(loadBaseData, 500); 
        return prev;
      }
      return updated.sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0));
    });
  };

  const handleMessageAck = (payload) => {
    console.log('消息确认:', payload);
  };

  const handleMessageError = (payload) => {
    console.error('消息发送错误:', payload);
    showAlert(payload?.message || '消息发送失败');
  };

  const handleUserOnline = async () => {
    await loadBaseData();
  };

  const handleUserOffline = async () => {
    await loadBaseData();
  };

  const handleGroupJoined = async () => {
    await loadBaseData();
    showAlert('你已成功加入群聊');
  };

  const handleGroupInvited = async () => {
    await loadBaseData();

    if (friendRequestModalVisible) {
      await loadAllApplications();
    }

    showAlert('你收到新的群聊邀请');
  };

  const handleFriendRequested = async () => {
    await loadBaseData();

    if (friendRequestModalVisible) {
      await loadAllApplications();
    }

    showAlert('你收到新的好友申请');
  };

  const handleFriendAccepted = async (payload) => {
    await loadBaseData();
    showAlert(`${payload.nickname || payload.username} 已同意了你的好友申请`);
  };

  const handleMessageRecalled = async (payload) => {
    const { messageId, conversationId } = payload;
    if (String(conversationId) === String(joinedConversationRef.current)) {
      setMessageList((prev) =>
        prev.map((msg) =>
          String(msg._id) === String(messageId)
            ? { ...msg, isRecalled: true, content: '' }
            : msg
        )
      );
    }
    await loadBaseData();
  };

  const handleMessageReadReceipt = (payload) => {
    const { messageIds, conversationId, userId } = payload;
    if (String(conversationId) !== String(joinedConversationRef.current)) return;
    setMessageList((prev) =>
      prev.map((msg) => {
        if (messageIds.includes(String(msg._id))) {
          const currentReadBy = msg.readBy || [];
          const alreadyRead = currentReadBy.some((u) => String(u._id || u) === String(userId));
          if (!alreadyRead) {
            return {
              ...msg,
              readBy: [...currentReadBy, { _id: userId }]
            };
          }
        }
        return msg;
      })
    );
  };

  const handleCallStatusChanged = (payload) => {
    const { conversationId, activeCallCount } = payload;
    setConversations((prev) =>
      prev.map((c) =>
        String(c.id) === String(conversationId)
          ? { ...c, activeCallCount }
          : c
      )
    );
  };

  socket.on('message:new', handleMessageNew);
  socket.on('message:ack', handleMessageAck);
  socket.on('message:error', handleMessageError);
  socket.on('user:online', handleUserOnline);
  socket.on('user:offline', handleUserOffline);
  socket.on('group:joined', handleGroupJoined);
  socket.on('group:invited', handleGroupInvited);
  socket.on('friend:requested', handleFriendRequested);
  socket.on('friend:accepted', handleFriendAccepted);
  socket.on('message:recalled', handleMessageRecalled);
  socket.on('message:readReceipt', handleMessageReadReceipt);
  socket.on('conversation:call_status_changed', handleCallStatusChanged);

  return () => {
    clearInterval(heartbeatInterval);
    socket.off('message:new', handleMessageNew);
    socket.off('message:ack', handleMessageAck);
    socket.off('message:error', handleMessageError);
    socket.off('user:online', handleUserOnline);
    socket.off('user:offline', handleUserOffline);
    socket.off('group:joined', handleGroupJoined);
    socket.off('group:invited', handleGroupInvited);
    socket.off('friend:requested', handleFriendRequested);
    socket.off('friend:accepted', handleFriendAccepted);
    socket.off('message:recalled', handleMessageRecalled);
    socket.off('message:readReceipt', handleMessageReadReceipt);
    socket.off('conversation:call_status_changed', handleCallStatusChanged);
  };
}, [
  currentUserId,
  navigate
]);

  useEffect(() => {
    const socket = getSocket();

    if (!socket || !socket.connected || !currentConversationId) return;

    if (joinedConversationRef.current && joinedConversationRef.current !== currentConversationId) {
      socket.emit('chat:leave', joinedConversationRef.current);
    }

    socket.emit('chat:join', currentConversationId);
    joinedConversationRef.current = currentConversationId;
  }, [currentConversationId]);

  return (
    <div className="chat-home-page">
      <Sidebar
        userInfo={userInfo}
        activeMenu={activeMenu}
        setActiveMenu={setActiveMenu}
        onLogout={handleLogout}
      />

      <ChatListPanel
        activeMenu={activeMenu}
        conversations={conversations}
        friends={friends}
        groups={groups}
        currentConversationId={currentConversationId}
        onSelectConversation={handleSelectConversation}
        onSelectFriend={handleSelectFriend}
        onSelectGroup={handleSelectGroup}
        onAddFriend={openAddFriendModal}
        onOpenRequests={openFriendRequestModal}
        onDeleteFriend={handleDeleteFriend}
        onJoinGroup={openJoinGroupModal}
        onCreateGroup={openCreateGroupModal}
      />

      <ChatWindow
        currentChatTitle={currentChatTitle}
        messageList={messageList}
        currentConversationId={currentConversationId}
        onSendMessage={handleSendMessage}
        onSendFile={handleSendFile}
        onSendAudio={handleSendAudio}
        onDownloadFile={handleDownloadFile}
        currentUserId={currentUserId}
        currentConversation={currentConversation}
        currentGroupRole={currentGroupRole}
        onOpenGroupMembers={handleOpenGroupMembers}
        onDissolveGroup={handleDissolveGroup}
        onLeaveGroup={handleLeaveGroup}
        currentUserInfo={userInfo}
        onStartVoiceCall={handleStartVoiceCall}
        onStartVideoCall={handleStartVideoCall}
        onRecallMessage={handleRecallMessage}
        onMarkMessagesAsRead={handleMarkMessagesAsRead}
        onLoadMore={loadMoreMessages}
        hasMore={hasMoreMessages}
        loadingMore={loadingMore}
      />

      <AddFriendModal
        visible={addFriendModalVisible}
        onClose={closeAddFriendModal}
        onSearch={handleSearchUsers}
        onAddFriend={handleAddFriend}
        searchResults={searchResults}
        loading={searchLoading}
      />

      <FriendRequestModal
        visible={friendRequestModalVisible}
        onClose={closeFriendRequestModal}
        requests={friendRequests}
        onHandle={handleRequestAction}
        groupApplications={groupApplications}
        onHandleGroupApplication={handleGroupApplicationAction}
      />

      <AlertModal
        visible={alertModal.visible}
        title={alertModal.title}
        message={alertModal.message}
        onClose={closeAlert}
      />

      <ConfirmModal
        visible={confirmModal.visible}
        title={confirmModal.title}
        message={confirmModal.message}
        onCancel={closeConfirm}
        onConfirm={confirmModal.onConfirm}
      />

      <GroupMemberModal
        visible={groupMemberModalVisible}
        onClose={closeGroupMemberModal}
        members={groupMembers}
        currentUserId={currentUserId}
        currentUserRole={currentGroupRole}
        onKickMember={handleKickMember}
        onInviteMember={openInviteGroupMemberModal}
      />

      <CreateGroupModal
        visible={createGroupModalVisible}
        onClose={closeCreateGroupModal}
        friends={friends}
        onSubmit={handleCreateGroup}
      />

      <JoinGroupModal
        visible={joinGroupModalVisible}
        onClose={closeJoinGroupModal}
        onSearch={handleSearchGroups}
        onJoin={handleJoinGroup}
        searchResults={groupSearchResults}
        loading={groupSearchLoading}
      />

      <InviteGroupMemberModal
        visible={inviteGroupMemberModalVisible}
        onClose={closeInviteGroupMemberModal}
        candidates={inviteGroupCandidates}
        onSubmit={handleInviteGroupMembers}
      />

      <VoiceCallController
        currentConversation={currentConversation}
        currentUserInfo={userInfo}
        showAlert={showAlert}
      />

      <VideoCallController
        currentConversation={currentConversation}
        currentUserInfo={userInfo}
        showAlert={showAlert}
      />
    </div>
  );
}