const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true
    },
    conversationType: {
      type: String,
      enum: ['private', 'group'],
      required: true,
      default: 'private'
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    messageType: {
      type: String,
      enum: ['text', 'emoji', 'file','audio','call'],
      required: true,
      default: 'text'
    },
    callInfo: {
      mediaType: {
        type: String,
        enum: ['voice', 'video'],
        default: undefined
      },
      action: {
        type: String,
        enum: ['start', 'accept', 'reject', 'end', 'join', 'leave', 'missed'],
        default: undefined
      },
      durationSec: {
        type: Number,
        default: 0
      },
      targetUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    default: null
      },
      groupId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Group',
        default: null
      }
    },
    content: {
      type: String,
      default: ''
    },
    isRecalled: {
      type: Boolean,
      default: false
    },
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null
    },
    readBy: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    fileUrl: {
      type: String,
      default: ''
    },
    clientMsgId: {
      type: String,
      default: ''
    },
    encrypted: {
      type: Boolean,
      default: false
    },
    encryptedKeys: {
      type: Map,
      of: String,
      default: undefined
    },
    iv: {
      type: String,
      default: ''
    },
    sentAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ clientMsgId: 1 });

module.exports = mongoose.model('Message', messageSchema);