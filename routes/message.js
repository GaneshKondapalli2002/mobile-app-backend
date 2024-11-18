const express = require('express');
const router = express.Router();
const Message = require('../models/message');
const auth = require('../middleware/auth');

// Send a message
router.post('/', auth, async (req, res) => {
  const { receiver, message } = req.body;
  try {
    const newMessage = new Message({
      sender: req.user.id,
      receiver,
      message,
    });
    const savedMessage = await newMessage.save();
    res.json(savedMessage);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
});

// Get messages between two users
router.get('/:receiverId', auth, async (req, res) => {
  const { receiverId } = req.params;
  try {
    const messages = await Message.find({
      $or: [
        { sender: req.user.id, receiver: receiverId },
        { sender: receiverId, receiver: req.user.id },
      ],
    }).sort({ timestamp: 1 });
    res.json(messages);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
});

module.exports = router;
