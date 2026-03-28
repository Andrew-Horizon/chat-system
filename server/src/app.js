const Koa = require('koa');
const bodyParser = require('koa-bodyparser');
const cors = require('@koa/cors');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require('socket.io');
const mount = require('koa-mount');

const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const friendRoutes = require('./routes/friendRoutes');
const conversationRoutes = require('./routes/conversationRoutes');
const messageRoutes = require('./routes/messageRoutes');
const setupSocket = require('./sockets');
const groupRoutes = require('./routes/groupRoutes');
const { setIO } = require('./utils/socketStore');
const path = require('path');
const serve = require('koa-static');
const uploadRoutes = require('./routes/uploadRoutes');
const keyRoutes = require('./routes/keyRoutes');

dotenv.config();

const app = new Koa();

connectDB();

app.use(cors());
app.use(bodyParser());
app.use(mount('/uploads', serve(path.join(__dirname, '../uploads'))));

app.use(authRoutes.routes());
app.use(authRoutes.allowedMethods());

app.use(friendRoutes.routes());
app.use(friendRoutes.allowedMethods());

app.use(conversationRoutes.routes());
app.use(conversationRoutes.allowedMethods());

app.use(messageRoutes.routes());
app.use(messageRoutes.allowedMethods());

app.use(groupRoutes.routes());
app.use(groupRoutes.allowedMethods());

app.use(uploadRoutes.routes());
app.use(uploadRoutes.allowedMethods());

app.use(keyRoutes.routes());
app.use(keyRoutes.allowedMethods());

app.use(async (ctx) => {
  if (ctx.path === '/' && ctx.method === 'GET') {
    ctx.body = {
      success: true,
      message: 'Chat system server is running'
    };
    return;
  }

  ctx.status = 404;
  ctx.body = {
    success: false,
    message: 'Not Found'
  };
});

const PORT = process.env.PORT || 3000;

const server = http.createServer(app.callback());

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

setIO(io);
setupSocket(io);

server.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});