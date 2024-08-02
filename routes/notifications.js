// routes/notifications.js
const express = require('express');
const router = express.Router();
const Notification = require('../models/notifications'); 


const authenticate = require('../middleware/auth'); 

// Get notifications for the authenticated user
router.get('/', authenticate, async (req, res) => {
  try {
    // Assuming req.user is set by authentication middleware
    const userId = req.user._id; 

    const notifications = await Notification.find({ userId }).sort({ date: -1 }); // Sort by date, newest first
    res.json(notifications);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ message: 'Error fetching notifications' });
  }
});

module.exports = router;
