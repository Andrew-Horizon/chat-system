const Router = require('@koa/router');
const { uploadPublicKey, getPublicKey, batchGetPublicKeys } = require('../controllers/keyController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = new Router({ prefix: '/api/keys' });

router.post('/upload', authMiddleware, uploadPublicKey);
router.get('/:userId', authMiddleware, getPublicKey);
router.post('/batch', authMiddleware, batchGetPublicKeys);

module.exports = router;
