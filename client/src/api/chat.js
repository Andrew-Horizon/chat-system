import axios from 'axios';

const request = axios.create({
  baseURL: 'http://localhost:3000',
  timeout: 5000
});

request.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const getMeApi = () => request.get('/api/auth/me');

export const getConversationListApi = () => request.get('/api/conversations');

export const getFriendListApi = () => request.get('/api/friends');

export const getGroupListApi = () => request.get('/api/groups');

export const getMessageListApi = (conversationId, page = 1, pageSize = 20) =>
  request.get('/api/messages', {
    params: { conversationId, page, pageSize }
  });

export const sendMessageApi = (data) =>
  request.post('/api/messages/send', data);

export const createPrivateConversationApi = (targetUserId) =>
  request.post('/api/conversations/private', { targetUserId });

export const addFriendApi = (friendId) =>
  request.post('/api/friends/add', { friendId });

export const searchUsersApi = (keyword) =>
  request.get('/api/friends/search', {
    params: { keyword }
  });

export const getFriendRequestsApi = () =>
  request.get('/api/friends/requests');

export const handleFriendRequestApi = (data) =>
  request.post('/api/friends/requests/handle', data);

export const deleteFriendApi = (friendId) =>
  request.post('/api/friends/delete', { friendId });

export const searchGroupsApi = (keyword) =>
  request.get('/api/groups/search', {
    params: { keyword }
  });

export const createGroupApi = (data) =>
  request.post('/api/groups', data);

export const sendJoinGroupRequestApi = (groupId) =>
  request.post('/api/groups/join', { groupId });

export const getGroupApplicationsApi = () =>
  request.get('/api/groups/applications');

export const handleGroupApplicationApi = (data) =>
  request.post('/api/groups/applications/handle', data);

export const getGroupMembersApi = (groupId) =>
  request.get(`/api/groups/${groupId}/members`);

export const kickGroupMemberApi = (data) =>
  request.post('/api/groups/kick', data);

export const dissolveGroupApi = (groupId) =>
  request.post('/api/groups/dissolve', { groupId });

export const inviteGroupMembersApi = (data) =>
  request.post('/api/groups/invite', data);

export const getGroupInviteCandidatesApi = (groupId) =>
  request.get(`/api/groups/${groupId}/invite-candidates`);

export const leaveGroupApi = (groupId) =>
  request.post('/api/groups/leave', { groupId });

export const uploadFileApi = (file) => {
  const formData = new FormData();
  formData.append('file', file);

  return request.post('/api/upload/file', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
};

export const downloadFileApi = (filename, originalName) =>
  request.get(`/api/upload/download/${filename}`, {
    params: { originalName },
    responseType: 'blob'
  });