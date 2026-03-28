const privateCalls = new Map();
/*
privateCalls:
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

const groupCalls = new Map();
/*
groupCalls:
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
  acceptedAt
}
*/

module.exports = {
  privateCalls,
  groupCalls
};