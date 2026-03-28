const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    avatar: {
      type: String,
      default: ''
    },
    description: {
      type: String,
      default: '',
      maxlength: 200
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Group', groupSchema);