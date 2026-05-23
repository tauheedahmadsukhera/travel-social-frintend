const mongoose = require('mongoose');

const AdminLogSchema = new mongoose.Schema({
  adminId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: false 
  },
  action: { type: String, required: true },
  targetId: String,
  targetType: String,
  details: mongoose.Schema.Types.Mixed,
  ipAddress: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.AdminLog || mongoose.model('AdminLog', AdminLogSchema);
