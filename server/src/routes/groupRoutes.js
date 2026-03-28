const Router = require('@koa/router');
const {
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
} = require('../controllers/groupController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = new Router({
  prefix: '/api/groups'
});

router.post('/', authMiddleware, createGroup);
router.get('/', authMiddleware, getGroupList);
router.get('/search', authMiddleware, searchGroups);
router.post('/join', authMiddleware, sendJoinRequest);
router.get('/applications', authMiddleware, getGroupApplications);
router.post('/applications/handle', authMiddleware, handleGroupApplication);
router.get('/:id/members', authMiddleware, getGroupMembers);
router.post('/kick', authMiddleware, kickGroupMember);
router.post('/dissolve', authMiddleware, dissolveGroup);
router.post('/invite', authMiddleware, inviteGroupMembers);
router.get('/:id/invite-candidates', authMiddleware, getGroupInviteCandidates);
router.post('/leave', authMiddleware, leaveGroup);

module.exports = router;