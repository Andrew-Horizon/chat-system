const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const register = async (ctx) => {
  try {
    const { username, password, nickname } = ctx.request.body;

    if (!username || !password || !nickname) {
      ctx.status = 400;
      ctx.body = {
        success: false,
        message: '用户名、密码和昵称不能为空'
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

    const existingUser = await User.findOne({ username });

    if (existingUser) {
      ctx.status = 409;
      ctx.body = {
        success: false,
        message: '用户名已存在'
      };
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      username,
      password: hashedPassword,
      nickname
    });

    await newUser.save();

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
    const { username, password } = ctx.request.body;

    if (!username || !password) {
      ctx.status = 400;
      ctx.body = {
        success: false,
        message: '用户名和密码不能为空'
      };
      return;
    }

    const user = await User.findOne({ username });

    if (!user) {
      ctx.status = 401;
      ctx.body = {
        success: false,
        message: '用户名或密码错误'
      };
      return;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      ctx.status = 401;
      ctx.body = {
        success: false,
        message: '用户名或密码错误'
      };
      return;
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

module.exports = {
  register,
  login,
  getMe
};