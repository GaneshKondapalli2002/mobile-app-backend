
const express = require('express');
const router = express.Router();
const { saveRecognizedText } = require('../controllers/recognizedTextController');

router.post('/save-recognized-text', saveRecognizedText);

module.exports = router;
