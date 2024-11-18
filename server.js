const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const connectDB = require('./config/db');
const dotenv = require('dotenv');
const authRoutes = require('./routes/auth');
const Profile = require('./routes/profile')
const jobPostRoutes = require('./routes/jobpost');
const notificationRoutes = require('./routes/notifications');
// const transcriptionRoutes = require('./routes/transcription');
const recognizedTextRoutes = require('./routes/textToSpeech');
const messageRoutes = require('./routes/message')

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.json({ extended: false }));
// Connect to MongoDB
connectDB();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api', Profile);
app.use('/api/jobPosts', jobPostRoutes);
app.use('/api/notifications', notificationRoutes);
// app.use('/api/transcription', transcriptionRoutes);
app.use('/api/recognizedText', recognizedTextRoutes);
app.use('/api/messages', messageRoutes);

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
