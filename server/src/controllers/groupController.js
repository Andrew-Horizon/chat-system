const Group = require('../models/Group');
const GroupMember = require('../models/GroupMember');
const GroupApplication = require('../models/GroupApplication');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Friendship = require('../models/Friendship');
const User = require('../models/User');
const { getIO } = require('../utils/socketStore');
const redisClient = require('../utils/redis');

const createGroup = async (ctx) => {
  try {
    const currentUser = ctx.state.user;
    const { name, description = '', avatar = '', inviteFriendIds = [] } = ctx.request.body;

    if (!name || !name.trim()) {
      ctx.status = 400;
      ctx.body = {
        success: false,
        message: '群名称不能为空'
      };
      return;
    }

    const trimmedName = name.trim();
    const existingGroup = await Group.findOne({ name: trimmedName });
    if (existingGroup) {
      ctx.status = 400;
      ctx.body = {
        success: false,
        message: '群名称已存在，请使用其他名称'
      };
      return;
    }

    const createdGroup = await Group.create({
      name: trimmedName,
      ownerId: currentUser._id,
      avatar,
      description
    });

    await GroupMember.create({
      groupId: createdGroup._id,
      userId: currentUser._id,
      role: 'owner'
    });

    const createdConversation = await Conversation.create({
      type: 'group',
      participantIds: [currentUser._id],
      groupId: createdGroup._id,
      lastMessage: '',
      lastMessageAt: null
    });

    if (inviteFriendIds.length > 0) {
      const acceptedFriendships = await Friendship.find({
        status: 'accepted',
        $or: [
          {
            requesterId: currentUser._id,
            recipientId: { $in: inviteFriendIds }
          },
          {
            requesterId: { $in: inviteFriendIds },
            recipientId: currentUser._id
          }
        ]
      });

      const validFriendIdSet = new Set();

      acceptedFriendships.forEach((item) => {
        const otherId =
          item.requesterId.toString() === currentUser._id.toString()
            ? item.recipientId.toString()
            : item.requesterId.toString();

        validFriendIdSet.add(otherId);
      });

      const applications = inviteFriendIds
        .map((id) => id.toString())
        .filter((id) => validFriendIdSet.has(id))
        .map((friendId) => ({
          type: 'invite',
          groupId: createdGroup._id,
          senderId: currentUser._id,
          receiverId: friendId,
          status: 'pending'
        }));

      if (applications.length > 0) {
        console.log('inviteFriendIds:', inviteFriendIds);
        console.log('group invite applications:', applications);
        await GroupApplication.insertMany(applications, { ordered: false }).catch(() => {});
      }
    }

    ctx.status = 201;
    ctx.body = {
      success: true,
      message: '创建群聊成功',
      data: {
        group: createdGroup,
        conversation: createdConversation
      }
    };
  } catch (error) {
    console.error('创建群聊失败:', error.message);
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '服务器内部错误'
    };
  }
};

const searchGroups = async (ctx) => {
  try {
    const currentUser = ctx.state.user;
    const { keyword = '' } = ctx.query;
    const trimmedKeyword = keyword.trim();

    if (!trimmedKeyword) {
      ctx.body = {
        success: true,
        message: '搜索成功',
        data: []
      };
      return;
    }

    const groups = await Group.find({
      name: { $regex: trimmedKeyword, $options: 'i' }
    }).lean();

    const memberRecords = await GroupMember.find({
      userId: currentUser._id,
      groupId: { $in: groups.map((g) => g._id) }
    }).select('groupId');

    const joinedSet = new Set(memberRecords.map((item) => item.groupId.toString()));

    const pendingApplications = await GroupApplication.find({
      type: 'join',
      senderId: currentUser._id,
      groupId: { $in: groups.map((g) => g._id) },
      status: 'pending'
    }).select('groupId');

    const pendingSet = new Set(pendingApplications.map((item) => item.groupId.toString()));

    const result = groups.map((group) => ({
      id: group._id,
      name: group.name,
      description: group.description,
      ownerId: group.ownerId,
      avatar: group.avatar,
      joinStatus: joinedSet.has(group._id.toString())
        ? 'joined'
        : pendingSet.has(group._id.toString())
        ? 'pending'
        : 'none'
    }));

    ctx.body = {
      success: true,
      message: '搜索成功',
      data: result
    };
  } catch (error) {
    console.error('搜索群组失败:', error.message);
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '服务器内部错误'
    };
  }
};

const getGroupInviteCandidates = async (ctx) => {
  try {
    const currentUser = ctx.state.user;
    const { id: groupId } = ctx.params;

    const selfMember = await GroupMember.findOne({
      groupId,
      userId: currentUser._id
    });

    if (!selfMember || selfMember.role !== 'owner') {
      ctx.status = 403;
      ctx.body = {
        success: false,
        message: '只有群主可以邀请成员'
      };
      return;
    }

    const acceptedFriendships = await Friendship.find({
      status: 'accepted',
      $or: [
        { requesterId: currentUser._id },
        { recipientId: currentUser._id }
      ]
    });

    const friendIds = acceptedFriendships.map((item) =>
      item.requesterId.toString() === currentUser._id.toString()
        ? item.recipientId
        : item.requesterId
    );

    const friends = await User.find({
      _id: { $in: friendIds }
    }).select('_id username nickname avatar status');

    // 当前已在群里的成员
    const existingMembers = await GroupMember.find({
      groupId,
      userId: { $in: friendIds }
    }).select('userId');

    const joinedSet = new Set(
      existingMembers.map((item) => item.userId.toString())
    );

    // 当前待处理的邀请
    const pendingInvites = await GroupApplication.find({
      type: 'invite',
      groupId,
      receiverId: { $in: friendIds },
      status: 'pending'
    }).select('receiverId');

    const pendingSet = new Set(
      pendingInvites.map((item) => item.receiverId.toString())
    );

    const result = friends.map((user) => ({
      id: user._id,
      username: user.username,
      nickname: user.nickname,
      avatar: user.avatar,
      status: user.status,
      inviteStatus: joinedSet.has(user._id.toString())
        ? 'joined'
        : pendingSet.has(user._id.toString())
        ? 'pending'
        : 'none'
    }));

    const onlineKeys = result.map(u => `online:${u.id.toString()}`);
    let onlineStatuses = [];
    if (onlineKeys.length > 0) {
      onlineStatuses = await redisClient.mget(onlineKeys);
    }
    result.forEach((u, i) => {
      u.status = onlineStatuses[i] ? 'online' : 'offline';
    });

    ctx.body = {
      success: true,
      message: '获取可邀请好友成功',
      data: result
    };
  } catch (error) {
    console.error('获取可邀请好友失败:', error.message);
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '服务器内部错误'
    };
  }
};

const sendJoinRequest = async (ctx) => {
  try {
    const currentUser = ctx.state.user;
    const { groupId } = ctx.request.body;

    if (!groupId) {
      ctx.status = 400;
      ctx.body = {
        success: false,
        message: '群组ID不能为空'
      };
      return;
    }

    const group = await Group.findById(groupId);

    if (!group) {
      ctx.status = 404;
      ctx.body = {
        success: false,
        message: '群组不存在'
      };
      return;
    }

    const existingMember = await GroupMember.findOne({
      groupId,
      userId: currentUser._id
    });

    if (existingMember) {
      ctx.status = 409;
      ctx.body = {
        success: false,
        message: '你已经在该群中'
      };
      return;
    }

    const existingPending = await GroupApplication.findOne({
      type: 'join',
      groupId,
      senderId: currentUser._id,
      receiverId: group.ownerId,
      status: 'pending'
    });

    if (existingPending) {
      ctx.status = 409;
      ctx.body = {
        success: false,
        message: '入群申请已发送，请勿重复提交'
      };
      return;
    }

    await GroupApplication.create({
      type: 'join',
      groupId,
      senderId: currentUser._id,
      receiverId: group.ownerId,
      status: 'pending'
    });

    ctx.body = {
      success: true,
      message: '入群申请已发送'
    };
  } catch (error) {
    console.error('发送入群申请失败:', error.message);
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '服务器内部错误'
    };
  }
};

const getGroupApplications = async (ctx) => {
  try {
    const currentUser = ctx.state.user;

    const applications = await GroupApplication.find({
      receiverId: currentUser._id,
      status: 'pending'
    })
      .populate('groupId', 'name description avatar ownerId')
      .populate('senderId', 'username nickname avatar status')
      .sort({ createdAt: -1 });

    const result = applications.map((item) => ({
      id: item._id,
      type: item.type,
      group: item.groupId
        ? {
            id: item.groupId._id,
            name: item.groupId.name,
            description: item.groupId.description,
            avatar: item.groupId.avatar
          }
        : null,
      sender: item.senderId
        ? {
            id: item.senderId._id,
            username: item.senderId.username,
            nickname: item.senderId.nickname,
            avatar: item.senderId.avatar,
            status: item.senderId.status
          }
        : null,
      createdAt: item.createdAt
    }));

    ctx.body = {
      success: true,
      message: '获取群聊申请成功',
      data: result
    };
  } catch (error) {
    console.error('获取群聊申请失败:', error.message);
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '服务器内部错误'
    };
  }
};

const handleGroupApplication = async (ctx) => {
  try {
    const currentUser = ctx.state.user;
    const { applicationId, action } = ctx.request.body;

    if (!applicationId || !action) {
      ctx.status = 400;
      ctx.body = {
        success: false,
        message: '参数不完整'
      };
      return;
    }

    if (!['accept', 'reject'].includes(action)) {
      ctx.status = 400;
      ctx.body = {
        success: false,
        message: '操作不合法'
      };
      return;
    }

    const application = await GroupApplication.findOne({
      _id: applicationId,
      receiverId: currentUser._id,
      status: 'pending'
    });

    if (!application) {
      ctx.status = 404;
      ctx.body = {
        success: false,
        message: '群聊申请不存在'
      };
      return;
    }

    if (action === 'reject') {
      application.status = 'rejected';
      await application.save();

      ctx.body = {
        success: true,
        message: '已拒绝'
      };
      return;
    }

    // 关键：根据申请类型判断真正要入群的人是谁
    const targetUserId =
      application.type === 'invite'
        ? application.receiverId   // 邀请：被邀请人入群
        : application.senderId;    // 申请加入：申请人入群

    const existingMember = await GroupMember.findOne({
      groupId: application.groupId,
      userId: targetUserId
    });

    if (!existingMember) {
      await GroupMember.create({
        groupId: application.groupId,
        userId: targetUserId,
        role: 'member'
      });

      await Conversation.findOneAndUpdate(
        {
          type: 'group',
          groupId: application.groupId
        },
        {
          $addToSet: { participantIds: targetUserId }
        }
      );
    }

    application.status = 'accepted';
    await application.save();

    const io = getIO();
    if (io) {
      io.to(`user:${targetUserId.toString()}`).emit('group:joined', {
        groupId: application.groupId,
        message: '你已成功加入群聊'
      });
    }

    ctx.body = {
      success: true,
      message: '已同意'
    };
  } catch (error) {
    console.error('处理群聊申请失败:', error.message);
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '服务器内部错误'
    };
  }
};

const getGroupList = async (ctx) => {
  try {
    const currentUser = ctx.state.user;

    const memberships = await GroupMember.find({
      userId: currentUser._id
    }).populate('groupId');

    const groupList = memberships
      .filter((item) => item.groupId)
      .map((item) => ({
        id: item.groupId._id,
        name: item.groupId.name,
        avatar: item.groupId.avatar,
        description: item.groupId.description,
        ownerId: item.groupId.ownerId,
        role: item.role,
        createdAt: item.groupId.createdAt,
        updatedAt: item.groupId.updatedAt
      }));

    ctx.body = {
      success: true,
      message: '获取群组列表成功',
      data: groupList
    };
  } catch (error) {
    console.error('获取群组列表失败:', error.message);
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '服务器内部错误'
    };
  }
};

const getGroupMembers = async (ctx) => {
  try {
    const currentUser = ctx.state.user;
    const { id: groupId } = ctx.params;

    const membership = await GroupMember.findOne({
      groupId,
      userId: currentUser._id
    });

    if (!membership) {
      ctx.status = 403;
      ctx.body = {
        success: false,
        message: '你不在该群组中'
      };
      return;
    }

    const members = await GroupMember.find({ groupId })
      .populate('userId', 'username nickname avatar status');

    const memberList = members
      .filter((item) => item.userId)
      .map((item) => ({
        id: item.userId._id,
        username: item.userId.username,
        nickname: item.userId.nickname,
        avatar: item.userId.avatar,
        status: item.userId.status,
        role: item.role
      }));

    const onlineKeys = memberList.map(m => `online:${m.id.toString()}`);
    let onlineStatuses = [];
    if (onlineKeys.length > 0) {
      onlineStatuses = await redisClient.mget(onlineKeys);
    }
    memberList.forEach((m, i) => {
      m.status = onlineStatuses[i] ? 'online' : 'offline';
    });

    ctx.body = {
      success: true,
      message: '获取群成员成功',
      data: memberList
    };
  } catch (error) {
    console.error('获取群成员失败:', error.message);
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '服务器内部错误'
    };
  }
};

const inviteGroupMembers = async (ctx) => {
  try {
    const currentUser = ctx.state.user;
    const { groupId, inviteFriendIds = [] } = ctx.request.body;

    if (!groupId) {
      ctx.status = 400;
      ctx.body = {
        success: false,
        message: '群组ID不能为空'
      };
      return;
    }

    if (!Array.isArray(inviteFriendIds) || inviteFriendIds.length === 0) {
      ctx.status = 400;
      ctx.body = {
        success: false,
        message: '邀请成员不能为空'
      };
      return;
    }

    const selfMember = await GroupMember.findOne({
      groupId,
      userId: currentUser._id
    });

    if (!selfMember || selfMember.role !== 'owner') {
      ctx.status = 403;
      ctx.body = {
        success: false,
        message: '只有群主可以邀请成员'
      };
      return;
    }

    const acceptedFriendships = await Friendship.find({
      status: 'accepted',
      $or: [
        {
          requesterId: currentUser._id,
          recipientId: { $in: inviteFriendIds }
        },
        {
          requesterId: { $in: inviteFriendIds },
          recipientId: currentUser._id
        }
      ]
    });

    const validFriendIdSet = new Set();

    acceptedFriendships.forEach((item) => {
      const otherId =
        item.requesterId.toString() === currentUser._id.toString()
          ? item.recipientId.toString()
          : item.requesterId.toString();

      validFriendIdSet.add(otherId);
    });

    const candidateIds = inviteFriendIds
      .map((id) => id.toString())
      .filter((id) => validFriendIdSet.has(id));

    if (candidateIds.length === 0) {
      ctx.status = 400;
      ctx.body = {
        success: false,
        message: '没有可邀请的好友'
      };
      return;
    }

    // 当前真正已在群里的成员
    const existingMembers = await GroupMember.find({
      groupId,
      userId: { $in: candidateIds }
    }).select('userId');

    const joinedSet = new Set(existingMembers.map((item) => item.userId.toString()));

    // 只保留当前“不在群里”的人
    const finalCandidateIds = candidateIds.filter((id) => !joinedSet.has(id));

    if (finalCandidateIds.length === 0) {
      ctx.status = 409;
      ctx.body = {
        success: false,
        message: '对方已在群内，无需重复邀请'
      };
      return;
    }

    // 查已有 invite 记录（不管 pending / accepted / rejected）
    const existingApplications = await GroupApplication.find({
      type: 'invite',
      groupId,
      senderId: currentUser._id,
      receiverId: { $in: finalCandidateIds }
    });

    const existingMap = new Map();
    existingApplications.forEach((item) => {
      existingMap.set(item.receiverId.toString(), item);
    });

    const toCreate = [];
    const toReset = [];
    const skippedPending = [];

    for (const friendId of finalCandidateIds) {
      const existing = existingMap.get(friendId);

      if (!existing) {
        toCreate.push({
          type: 'invite',
          groupId,
          senderId: currentUser._id,
          receiverId: friendId,
          status: 'pending'
        });
        continue;
      }

      // 已有待处理邀请：跳过
      if (existing.status === 'pending') {
        skippedPending.push(friendId);
        continue;
      }

      // 之前拒绝过：允许重新邀请
      if (existing.status === 'rejected') {
        existing.status = 'pending';
        toReset.push(existing);
        continue;
      }

      // 之前接受过，但现在已经不在群里：也允许重新邀请
      if (existing.status === 'accepted') {
        existing.status = 'pending';
        toReset.push(existing);
        continue;
      }
    }

    if (toCreate.length === 0 && toReset.length === 0) {
      ctx.status = 409;
      ctx.body = {
        success: false,
        message: skippedPending.length > 0
          ? '邀请已发送，请勿重复邀请'
          : '没有可邀请的新成员'
      };
      return;
    }

    if (toCreate.length > 0) {
      await GroupApplication.insertMany(toCreate);
    }

    if (toReset.length > 0) {
      await Promise.all(toReset.map((item) => item.save()));
    }

    const io = getIO();
    if (io) {
      const notifyIds = [
        ...toCreate.map((item) => item.receiverId.toString()),
        ...toReset.map((item) => item.receiverId.toString())
      ];

      notifyIds.forEach((userId) => {
        io.to(`user:${userId}`).emit('group:invited', {
          groupId,
          message: '你收到一个新的群聊邀请'
        });
      });
    }

    ctx.body = {
      success: true,
      message: '群邀请发送成功'
    };
  } catch (error) {
    console.error('邀请群成员失败:', error.message);
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '服务器内部错误'
    };
  }
};

const leaveGroup = async (ctx) => {
  try {
    const currentUser = ctx.state.user;
    const { groupId } = ctx.request.body;

    if (!groupId) {
      ctx.status = 400;
      ctx.body = {
        success: false,
        message: '群组ID不能为空'
      };
      return;
    }

    const selfMember = await GroupMember.findOne({
      groupId,
      userId: currentUser._id
    });

    if (!selfMember) {
      ctx.status = 404;
      ctx.body = {
        success: false,
        message: '你不在该群聊中'
      };
      return;
    }

    if (selfMember.role === 'owner') {
      ctx.status = 403;
      ctx.body = {
        success: false,
        message: '群主不能直接退群，请先解散群聊'
      };
      return;
    }

    await GroupMember.deleteOne({
      groupId,
      userId: currentUser._id
    });

    await Conversation.findOneAndUpdate(
      { type: 'group', groupId },
      { $pull: { participantIds: currentUser._id } }
    );

    ctx.body = {
      success: true,
      message: '退群成功'
    };
  } catch (error) {
    console.error('退群失败:', error.message);
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '服务器内部错误'
    };
  }
};

const kickGroupMember = async (ctx) => {
  try {
    const currentUser = ctx.state.user;
    const { groupId, memberId } = ctx.request.body;

    if (!groupId || !memberId) {
      ctx.status = 400;
      ctx.body = {
        success: false,
        message: '参数不完整'
      };
      return;
    }

    const selfMember = await GroupMember.findOne({
      groupId,
      userId: currentUser._id
    });

    if (!selfMember || selfMember.role !== 'owner') {
      ctx.status = 403;
      ctx.body = {
        success: false,
        message: '只有群主可以踢人'
      };
      return;
    }

    const targetMember = await GroupMember.findOne({
      groupId,
      userId: memberId
    });

    if (!targetMember) {
      ctx.status = 404;
      ctx.body = {
        success: false,
        message: '目标成员不存在'
      };
      return;
    }

    if (targetMember.role === 'owner') {
      ctx.status = 400;
      ctx.body = {
        success: false,
        message: '不能移除群主'
      };
      return;
    }

    await GroupMember.deleteOne({
      groupId,
      userId: memberId
    });

    await Conversation.findOneAndUpdate(
      { type: 'group', groupId },
      { $pull: { participantIds: memberId } }
    );

    ctx.body = {
      success: true,
      message: '移出群成员成功'
    };
  } catch (error) {
    console.error('踢出群成员失败:', error.message);
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '服务器内部错误'
    };
  }
};

const dissolveGroup = async (ctx) => {
  try {
    const currentUser = ctx.state.user;
    const { groupId } = ctx.request.body;

    if (!groupId) {
      ctx.status = 400;
      ctx.body = {
        success: false,
        message: '群组ID不能为空'
      };
      return;
    }

    const selfMember = await GroupMember.findOne({
      groupId,
      userId: currentUser._id
    });

    if (!selfMember || selfMember.role !== 'owner') {
      ctx.status = 403;
      ctx.body = {
        success: false,
        message: '只有群主可以解散群聊'
      };
      return;
    }

    const conversation = await Conversation.findOne({ type: 'group', groupId });

    if (conversation) {
      await Message.deleteMany({ conversationId: conversation._id });
      await Conversation.deleteOne({ _id: conversation._id });
    }

    await GroupApplication.deleteMany({ groupId });
    await GroupMember.deleteMany({ groupId });
    await Group.deleteOne({ _id: groupId });

    ctx.body = {
      success: true,
      message: '解散群聊成功'
    };
  } catch (error) {
    console.error('解散群聊失败:', error.message);
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '服务器内部错误'
    };
  }
};

module.exports = {
  createGroup,
  searchGroups,
  sendJoinRequest,
  getGroupApplications,
  handleGroupApplication,
  getGroupList,
  getGroupMembers,
  kickGroupMember,
  dissolveGroup,
  getGroupInviteCandidates,
  leaveGroup,
  inviteGroupMembers
};