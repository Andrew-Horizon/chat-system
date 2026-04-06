const Router = require('@koa/router');
const { sendCode, register, login, getMe, logout } = require('../controllers/authController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = new Router({
  prefix: '/api/auth'
});

router.post('/send-code', sendCode);
router.post('/register', register);
router.post('/login', login);
router.get('/me', authMiddleware, getMe);
router.post('/logout', authMiddleware, logout);

module.exports = router;