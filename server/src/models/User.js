const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 20
    },
    password: {
      type: String,
      required: true,
      minlength: 6
    },
    nickname: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 30
    },
    avatar: {
      type: String,
      default: ''
    },
    status: {
      type: String,
      enum: ['online', 'offline'],
      default: 'offline'
    },
    publicKey: {
      type: String,
      default: ''
    },
    phone: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      match: /^1[3-9]\d{9}$/
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('User', userSchema);