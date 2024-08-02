const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Profile = require('../models/profile');
const User = require('../models/user');

// GET current user's profile
router.get('/me', auth, async (req, res) => {
  try {
    const profile = await Profile.findOne({ user: req.user.id });
    if (!profile) {
      return res.status(400).json({ msg: 'Profile not found' });
    }

    const user = await User.findById(req.user.id).select('name email');
    if (!user) {
      return res.status(400).json({ msg: 'User not found' });
    }

    const combinedData = {
      _id: user._id,
      name: user.name,
      email: user.email,
      profile
    };

    res.json(combinedData);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// PUT update current user's profile
router.put('/me', auth, async (req, res) => {
  const {
    address,
    city,
    pincode,
    phone,
    qualifications,
    skills,
    idOptions
  } = req.body;

  const profileFields = {};
  if (address) profileFields.address = address;
  if (city) profileFields.city = city;
  if (pincode) profileFields.pincode = pincode;
  if (phone) profileFields.phone = phone;
  if (qualifications) profileFields.qualifications = qualifications;
  if (skills) profileFields.skills = skills;
  if (idOptions) profileFields.idOptions = idOptions;

  try {
    let profile = await Profile.findOne({ user: req.user.id });

    if (!profile) {
      profile = new Profile({ user: req.user.id, ...profileFields });
      await profile.save();
    } else {
      profile = await Profile.findOneAndUpdate(
        { user: req.user.id },
        { $set: profileFields },
        { new: true }
      );
    }

    const user = await User.findById(req.user.id).select('name email');
    if (!user) {
      return res.status(400).json({ msg: 'User not found' });
    }

    const updatedUser = {
      _id: user._id,
      name: user.name,
      email: user.email,
      profile
    };

    res.json(updatedUser);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
