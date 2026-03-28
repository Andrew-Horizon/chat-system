const Router = require('@koa/router');
const { sendMessage, getMessageList } = require('../controllers/messageController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = new Router({
  prefix: '/api/messages'
});

router.post('/send', authMiddleware, sendMessage);
router.get('/', authMiddleware, getMessageList);

module.exports = router;