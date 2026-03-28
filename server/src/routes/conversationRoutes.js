const Router = require('@koa/router');
const {
  createOrGetPrivateConversation,
  getConversationList
} = require('../controllers/conversationController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = new Router({
  prefix: '/api/conversations'
});

router.post('/private', authMiddleware, createOrGetPrivateConversation);
router.get('/', authMiddleware, getConversationList);

module.exports = router;