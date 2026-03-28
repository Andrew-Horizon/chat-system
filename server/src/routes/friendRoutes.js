const Router = require('@koa/router');
const {
  sendFriendRequest,
  getFriendList,
  searchUsers,
  getPendingRequests,
  handleFriendRequest,
  deleteFriend
} = require('../controllers/friendController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = new Router({
  prefix: '/api/friends'
});

router.post('/add', authMiddleware, sendFriendRequest);
router.get('/', authMiddleware, getFriendList);
router.get('/search', authMiddleware, searchUsers);
router.get('/requests', authMiddleware, getPendingRequests);
router.post('/requests/handle', authMiddleware, handleFriendRequest);
router.post('/delete', authMiddleware, deleteFriend);

module.exports = router;