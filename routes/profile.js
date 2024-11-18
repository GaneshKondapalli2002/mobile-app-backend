// routes/authRoutes.js

const express = require('express');
const {profile } = require('../controllers/auth');
const router = express.Router();


router.get('/profile', profile);

module.exports = router;
