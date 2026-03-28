const redisClient = require('./redis');

const getCallRoomKey = (conversationId) => `call_room:${conversationId.toString()}`;

const joinCall = async (conversationId, userId) => {
  if (!conversationId || !userId) return;
  await redisClient.sadd(getCallRoomKey(conversationId), userId.toString());
  // 设置一个一小时的保底过期时间，防止异常死锁导致永远展示绿标
  await redisClient.expire(getCallRoomKey(conversationId), 3600);
};

const leaveCall = async (conversationId, userId) => {
  if (!conversationId || !userId) return;
  await redisClient.srem(getCallRoomKey(conversationId), userId.toString());
};

const getCallCount = async (conversationId) => {
  if (!conversationId) return 0;
  return await redisClient.scard(getCallRoomKey(conversationId));
};

module.exports = {
  joinCall,
  leaveCall,
  getCallCount,
  getCallRoomKey
};
