const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const redisClient = require('../utils/redis');
const { sendSmsCode } = require('../utils/sms');

const sendCode = async (ctx) => {
  try {
    const { phone } = ctx.request.body;
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      ctx.status = 400;
      ctx.body = { success: false, message: '无效的手机号' };
      return;
    }

    const cacheKey = `auth:sms:${phone}`;
    const ttl = await redisClient.ttl(cacheKey);

    if (ttl > 0 && 300 - ttl < 60) {
      ctx.status = 429;
      ctx.body = { success: false, message: '发送过于频繁，请稍后再试' };
      return;
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const isSent = await sendSmsCode(phone, code);

    if (isSent) {
      await redisClient.setex(cacheKey, 300, code);
      ctx.status = 200;
      ctx.body = { success: true, message: '验证码发送成功' };
    } else {
      ctx.status = 500;
      ctx.body = { success: false, message: '短信服务异常，请稍后再试' };
    }
  } catch (error) {
    console.error('发送验证码失败:', error.message);
    ctx.status = 500;
    ctx.body = { success: false, message: '服务器内部错误' };
  }
};

const register = async (ctx) => {
  try {
    const { username, password, nickname, phone, code } = ctx.request.body;

    if (!username || !password || !nickname || !phone || !code) {
      ctx.status = 400;
      ctx.body = {
        success: false,
        message: '所有字段(用户名、密码、昵称、手机号、验证码)不能为空'
      };
      return;
    }

    if (password.length < 6) {
      ctx.status = 400;
      ctx.body = {
        success: false,
        message: '密码长度不能少于6位'
      };
      return;
    }
    
    const cacheKey = `auth:sms:${phone}`;
    const savedCode = await redisClient.get(cacheKey);
    
    if (!savedCode || savedCode !== code) {
      ctx.status = 400;
      ctx.body = {
        success: false,
        message: '验证码错误或已过期'
      };
      return;
    }

    const existingUser = await User.findOne({ 
      $or: [{ username }, { phone }, { nickname }]
    });

    if (existingUser) {
      let message = '信息已存在';
      if (existingUser.username === username) message = '用户名已存在';
      else if (existingUser.phone === phone) message = '手机号已被注册';
      else if (existingUser.nickname === nickname) message = '该昵称已被占用';
      
      ctx.status = 409;
      ctx.body = { success: false, message };
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      username,
      password: hashedPassword,
      nickname,
      phone
    });

    await newUser.save();
    await redisClient.del(cacheKey);

    ctx.status = 201;
    ctx.body = {
      success: true,
      message: '注册成功',
      data: {
        id: newUser._id,
        username: newUser.username,
        nickname: newUser.nickname,
        avatar: newUser.avatar,
        status: newUser.status
      }
    };
  } catch (error) {
    console.error('注册失败:', error.message);
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '服务器内部错误'
    };
  }
};

const login = async (ctx) => {
  try {
    const { username, password, phone, code } = ctx.request.body;
    let user;

    if (phone && code) {
      const cacheKey = `auth:sms:${phone}`;
      const savedCode = await redisClient.get(cacheKey);
      
      if (!savedCode || savedCode !== code) {
        ctx.status = 400;
        ctx.body = { success: false, message: '验证码错误或已过期' };
        return;
      }
      
      user = await User.findOne({ phone });
      
      if (!user) {
        ctx.status = 400;
        ctx.body = { success: false, message: '账号未注册，请先注册' };
        return;
      }
      
      await redisClient.del(cacheKey);
    } else {
      if (!username || !password) {
        ctx.status = 400;
        ctx.body = { success: false, message: '用户名和密码不能为空' };
        return;
      }

      user = await User.findOne({ username });

      if (!user) {
        ctx.status = 401;
        ctx.body = { success: false, message: '用户名或密码错误' };
        return;
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (!isPasswordValid) {
        ctx.status = 401;
        ctx.body = { success: false, message: '用户名或密码错误' };
        return;
      }
    }

    await User.findByIdAndUpdate(user._id, {
      status: 'online'
    });

    const token = jwt.sign(
      {
        userId: user._id,
        username: user.username
      },
      process.env.JWT_SECRET,
      {
        expiresIn: '7d'
      }
    );

    ctx.status = 200;
    ctx.body = {
      success: true,
      message: '登录成功',
      data: {
        token,
        user: {
          id: user._id,
          username: user.username,
          nickname: user.nickname,
          avatar: user.avatar,
          status: user.status
        }
      }
    };
  } catch (error) {
    console.error('登录失败:', error.message);
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '服务器内部错误'
    };
  }
};

const getMe = async (ctx) => {
  try {
    ctx.status = 200;
    ctx.body = {
      success: true,
      message: '获取当前用户信息成功',
      data: ctx.state.user
    };
  } catch (error) {
    console.error('获取当前用户信息失败:', error.message);
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '服务器内部错误'
    };
  }
};

const logout = async (ctx) => {
  try {
    const authHeader = ctx.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.decode(token);
        if (decoded && decoded.exp) {
          const expiresAt = decoded.exp * 1000;
          const ttl = Math.floor((expiresAt - Date.now()) / 1000);
          if (ttl > 0) {
            await redisClient.setex(`blacklist:${token}`, ttl, '1');
          }
        }
      } catch (err) {
        console.error('Token Decode Error in Logout:', err);
      }
    }
    
    if (ctx.state.user) {
      await User.findByIdAndUpdate(ctx.state.user._id, { status: 'offline' });
    }

    ctx.status = 200;
    ctx.body = {
      success: true,
      message: '退出登录成功'
    };
  } catch (error) {
    console.error('退出登录失败:', error.message);
    ctx.status = 500;
    ctx.body = {
      success: false,
      message: '服务器内部错误'
    };
  }
};

module.exports = {
  sendCode,
  register,
  login,
  getMe,
  logout
};