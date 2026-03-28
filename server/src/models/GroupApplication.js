const mongoose = require('mongoose');

const groupApplicationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['invite', 'join'],
      required: true
    },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group',
      required: true
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected'],
      default: 'pending'
    }
  },
  {
    timestamps: true
  }
);

groupApplicationSchema.index(
  { type: 1, groupId: 1, senderId: 1, receiverId: 1 },
  { unique: true }
);

module.exports = mongoose.model('GroupApplication', groupApplicationSchema);