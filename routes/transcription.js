const router = require('express').Router();
const AWS = require('aws-sdk');
const { check, validationResult } = require('express-validator');

AWS.config.update({
  region: 'us-east-1', // Update to your region
  accessKeyId: process.env.AWS_ACCESS_KEY_ID, // Replace with your Access Key ID
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY // Replace with your Secret Access Key
});

const transcribeService = new AWS.TranscribeService();

// Start transcription job
router.post('/start', [
  check('mediaFileUri', 'Media file URI is required').not().isEmpty(),
  check('transcriptionJobName', 'Transcription job name is required').not().isEmpty()
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { mediaFileUri, transcriptionJobName } = req.body;

  const params = {
    LanguageCode: 'en-US', // Language code
    Media: {
      MediaFileUri: mediaFileUri // Use the media file URI from the request body
    },
    MediaFormat: 'mp3', // Format of the audio file (e.g., mp3, wav, etc.)
    TranscriptionJobName: transcriptionJobName // Use the transcription job name from the request body
  };

  transcribeService.startTranscriptionJob(params, (err, data) => {
    if (err) {
      console.error('Error starting transcription job:', err); // Log full error details
      return res.status(500).json({ msg: 'Error starting transcription job', error: err.message });
    } else {
      console.log('Transcription job started:', data);
      res.json({ msg: 'Transcription job started', data });
    }
  });
});
// Check transcription job status
router.get('/status/:jobName', (req, res) => {
  const { jobName } = req.params;

  const params = {
    TranscriptionJobName: jobName // Use the job name from the request parameters
  };

  transcribeService.getTranscriptionJob(params, (err, data) => {
    if (err) {
      console.log('Error checking transcription job status:', err);
      return res.status(500).json({ msg: 'Error checking transcription job status' });
    } else {
      console.log('Transcription job status:', data.TranscriptionJob.TranscriptionJobStatus);
      res.json({ status: data.TranscriptionJob.TranscriptionJobStatus, result: data });
    }
  });
});

module.exports = router;
