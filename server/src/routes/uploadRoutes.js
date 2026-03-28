const Router = require('@koa/router');
const multer = require('@koa/multer');
const path = require('path');
const fs = require('fs');
const authMiddleware = require('../middlewares/authMiddleware');

const router = new Router({
  prefix: '/api/upload'
});

const uploadDir = path.join(__dirname, '../../uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 修正中文文件名乱码
const normalizeOriginalName = (name) => {
  try {
    return Buffer.from(name, 'latin1').toString('utf8');
  } catch (error) {
    return name;
  }
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const originalName = normalizeOriginalName(file.originalname);
    const ext = path.extname(originalName);
    // 服务器文件名只保留时间戳+随机数+扩展名，避免中文路径问题
    const safeName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, safeName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024
  }
});

router.post('/file', authMiddleware, upload.single('file'), async (ctx) => {
  try {
    if (!ctx.file) {
      ctx.status = 400;
      ctx.body = {
        success: false,
        message: '未选择文件'
      };
      return;
    }

    const originalName = normalizeOriginalName(ctx.file.originalname);
    const filename = ctx.file.filename;
    const fileUrl = `http://localhost:3000/uploads/${filename}`;
    const downloadUrl = `http://localhost:3000/api/upload/download/${filename}?originalName=${encodeURIComponent(originalName)}`;

    ctx.body = {
      success: true,
      message: '文件上传成功',
      data: {
        originalName,
        filename,
        mimeType: ctx.file.mimetype,
        size: ctx.file.size,
        fileUrl,
        downloadUrl
      }
    };
  } catch (error) {
    console.error('文件上传失败:', error.message);
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '服务器内部错误'
    };
  }
});

router.get('/download/:filename', authMiddleware, async (ctx) => {
  try {
    const { filename } = ctx.params;
    const originalName = ctx.query.originalName || filename;
    const filePath = path.join(uploadDir, filename);

    if (!fs.existsSync(filePath)) {
      ctx.status = 404;
      ctx.body = {
        success: false,
        message: '文件不存在'
      };
      return;
    }

    const safeOriginalName = decodeURIComponent(originalName);

    ctx.set('Content-Type', 'application/octet-stream');
    ctx.set(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(safeOriginalName)}`
    );

    ctx.body = fs.createReadStream(filePath);
  } catch (error) {
    console.error('文件下载失败:', error.message);
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '服务器内部错误'
    };
  }
});

module.exports = router;