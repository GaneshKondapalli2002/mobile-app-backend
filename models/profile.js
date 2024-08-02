// models/profile.js

const mongoose = require('mongoose');

const ProfileSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  address: String,
  city: String,
  pincode: String,
  phone: String,
  qualifications: String,
  skills: String,
  idOptions: String,
});

module.exports = mongoose.models.Profile || mongoose.model('Profile', ProfileSchema);
