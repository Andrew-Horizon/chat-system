const privateVideoCalls = new Map();
/*
key: callId
value: {
  callId,
  type: 'private',
  conversationId,
  callerId,
  calleeId,
  callerInfo,
  status: 'ringing' | 'active',
  startedAt,
  acceptedAt
}
*/

const groupVideoCalls = new Map();
/*
key: groupId
value: {
  callId,
  type: 'group',
  conversationId,
  groupId,
  initiatorId,
  initiatorInfo,
  status: 'ringing' | 'active',
  participants: Map<userId, userInfo>,
  invitedUserIds: string[],
  startedAt,
  acceptedAt,
  groupName
}
*/

module.exports = {
  privateVideoCalls,
  groupVideoCalls
};