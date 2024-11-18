const mongoose = require('mongoose');

const ProfileSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  address: String,
  city: String,
  pincode: String,
  phone: String,
  qualifications: String,
  skills: String,
  idOptions: String,
});

module.exports = mongoose.model('Profile', ProfileSchema);
