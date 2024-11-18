

const express = require('express');
const admin = require('firebase-admin');
const router = express.Router();
const JobPost = require('../models/jobpost');
const auth = require('../middleware/auth');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const User = require('../models/user');
const Counter = require('../models/counter');


const getNextSequence = async (name) => {
  const sequenceDocument = await Counter.findByIdAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return sequenceDocument.seq;
};

// Nodemailer setup for sending email
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const serviceAccount = require('../config/serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const tempDir = path.join(__dirname, '../temp');

if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}


// POST /api/jobPosts - Create a new job post
router.post('/', auth, async (req, res) => {
  // const { CRID } = req.body;
  const { Date, Shift, Location, Starttime, Endtime, JobDescription, Payment, TemplateName, isTemplate } = req.body;
    const nextId = await getNextSequence('jobpostId');  
  const CRID = `CR${String(nextId).padStart(3, '0')}`;

  try {
    const newJobPost = new JobPost({
      user: req.user.id,
      Date,
      Shift,
      Location,
      Starttime,
      Endtime,
      JobDescription,
      Payment,
      TemplateName,
      isTemplate,
      CRID
    });
    const jobPost = await newJobPost.save();

    // Send notification to all devices subscribed to 'job_posts' topic
    const message = {
      notification: {
        title: 'New Job Posted!',
        body: `A new job post has been created. Shift: ${Shift}, Location: ${Location}, JobDescription: ${JobDescription}`,
      },
      topic: 'job_posts',
    };

    await admin.messaging().send(message);

    res.json(jobPost);
  } catch (err) {
    console.error('Error creating job post:', err.message);
    res.status(500).send('Server Error');
  }
});


// GET /api/jobPosts - Fetch all job posts
router.get('/', async (req, res) => {
  try {
    // Extract the isTemplate query parameter from the request
    const isTemplate = req.query.isTemplate === 'true';

    // Find job posts based on the isTemplate filter
    const jobPosts = await JobPost.find({ isTemplate }).sort({ createdAt: -1 });

    res.json(jobPosts);
  } catch (err) {
    console.error('Error fetching job posts:', err.message);
    res.status(500).send('Server Error');
  }
});

// GET /api/jobPosts/:id - Fetch a specific job post by ID
router.get('/:id', async (req, res) => {
  const jobId = req.params.id;

  try {
    const jobPost = await JobPost.findById(jobId);
    if (!jobPost) {
      return res.status(404).json({ msg: 'Job post not found' });
    }
    res.json(jobPost);
  } catch (err) {
    console.error('Error fetching job post:', err.message);
    res.status(500).send('Server Error');
  }
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const updatedJobPost = req.body;

  try {
    const updatedJob = await JobPost.findByIdAndUpdate(id, updatedJobPost, { new: true });
    res.status(200).json(updatedJob);
  } catch (error) {
    console.error('Error updating job post:', error);
    res.status(500).json({ message: 'Failed to update job post' });
  }
});

// DELETE /api/jobPosts/:id - Delete a job post
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    await JobPost.findByIdAndDelete(id);
    res.json({ message: 'Job post deleted successfully' });
  } catch (err) {
    console.error('Error deleting job post:', err);
    res.status(500).json({ error: 'Server Error' });
  }
});

// GET /api/jobPosts/upcoming - Fetch upcoming job posts
router.get('/upcoming', async (req, res) => {
    try {
        const jobs = await JobPost.find({ status: 'upcoming' });
        res.json(jobs);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// PUT /api/jobPosts/accept/:id - Accept a job post
router.put('/accept/:id', auth, async (req, res) => {
  const { id } = req.params;

  try {
    const jobPost = await JobPost.findById(id);
    if (!jobPost) {
      return res.status(404).json({ msg: 'Job post not found' });
    }

    // Check if job post is already accepted or completed
    if (jobPost.status !== 'open') {
      return res.status(400).json({ message: 'Job already accepted or completed' });
    }

    // Update job post status to 'upcoming' and assign to the user
    jobPost.status = 'upcoming';
    jobPost.assignedTo = req.user.id;

    await jobPost.save();
    res.json(jobPost); // Return updated job object
  } catch (error) {
    console.error('Error accepting job:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/checkIn/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const job = await JobPost.findById(id);

    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }

    if (job.status !== 'upcoming') {
      return res.status(400).json({ message: 'Job not in upcoming status' });
    }

    // Update job status to 'checkedIn' and store check-in time
    job.status = 'checkedIn';
    job.checkInTime = new Date(); // Capture current time as check-in time

    // Save updated job
    await job.save();

    // Return updated job object
    res.json(job);
  } catch (error) {
    console.error('Error checking in job:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});


router.put('/checkout/:id', auth, async (req, res) => {
  const { id } = req.params;
  const { signature, checkoutInput, patientWeight, temperature, bloodPressure, contactNumber } = req.body;

  try {
    const jobPost = await JobPost.findById(id);
    if (!jobPost) {
      return res.status(404).json({ msg: 'Job post not found' });
    }

    if (!req.user || !req.user.name) {
      return res.status(400).json({ msg: 'User information is missing' });
    }

    // Update job post details
    Object.assign(jobPost, {
      status: 'completed',
      checkedOut: true,
      checkedOutTime: new Date(), // Capture current time as check-out time
      signature,
      checkoutInput,
      patientWeight,
      temperature,
      bloodPressure,
      contactNumber,
    });

    await jobPost.save();

    // Generate PDF document
    const doc = new PDFDocument({ margin: 30 });
    const filePath = path.join(__dirname, '../temp', `JobCheckout_${id}.pdf`);
    doc.pipe(fs.createWriteStream(filePath));

    // Add header
    doc.fontSize(10).text('Elite Care Management, INC (HC)', { align: 'center' });
    doc.fontSize(10).text('568 S. Washington St.', { align: 'center' });
    doc.fontSize(10).text('Naperville, IL, 60540-6042', { align: 'center' });
    doc.fontSize(10).text('Phone: (630) 548-9500 | Fax: (630) 548-0541', { align: 'center' });

    // Add title
    doc.fontSize(14).text('Registered Nurse', { align: 'right', underline: true });

    // Patient Details Section with border
    doc.moveDown();
    doc.rect(25, doc.y, 560, 150).stroke();
    doc.moveDown();
    doc.fontSize(12).text(`Patient Name: ${jobPost.patientName}`, { align: 'left' });
    doc.fontSize(12).text(`Visit Date: ${jobPost.visitDate}`, { align: 'right' });
    doc.fontSize(12).text(`CRID: ${jobPost.CRID}`, { align: 'left' });
    doc.fontSize(12).text(`Time In: ${jobPost.checkInTime ? jobPost.checkInTime.toISOString() : 'N/A'}`, { align: 'right' });
    doc.fontSize(12).text(`Shift: ${jobPost.Shift}`, { align: 'left' });
    doc.fontSize(12).text(`Time Out: ${jobPost.checkedOutTime ? jobPost.checkedOutTime.toISOString() : 'N/A'}`, { align: 'right' });
    doc.fontSize(12).text(`Last Physician Visit Date: ${jobPost.Date}`, { align: 'left' });
    doc.fontSize(12).text(`Associated Mileage: ${jobPost.associatedMileage}`, { align: 'right' });
    doc.fontSize(12).text(`Primary DX: ${jobPost.primaryDx}`, { align: 'left' });
    doc.fontSize(12).text(`Secondary DX: ${jobPost.secondaryDx}`, { align: 'left' });

    // Vital Signs Section with border
    doc.moveDown();
    doc.rect(25, doc.y, 560, 180).stroke();
    doc.moveDown();
    doc.fontSize(14).text('Vital Signs', { underline: true });
    doc.fontSize(12).text(`Respiration: ${jobPost.respiration}`);
    doc.fontSize(12).text(`Weight: ${patientWeight || 'N/A'}`);
    doc.fontSize(12).text(`Height (in Inches): ${jobPost.height}`);
    doc.fontSize(12).text(`Temperature: ${temperature || 'N/A'}`);
    doc.fontSize(12).text(`Pulse: ${jobPost.pulse}`);
    doc.fontSize(12).text(`Mid-Arm Circumference (cm): ${jobPost.midArmCircumference}`);
    doc.fontSize(12).text(`Blood Glucose: ${jobPost.bloodGlucose}`);
    doc.fontSize(12).text(`Oxygen Saturation: ${jobPost.oxygenSaturation}`);
    doc.fontSize(12).text(`O2 Amount: ${jobPost.oxygenAmount}`);
    doc.fontSize(12).text(`Blood Pressure: ${bloodPressure || 'N/A'}`);
    doc.fontSize(12).text(`Comments: ${jobPost.comments}`);

    // Skin Section with border
    doc.moveDown();
    doc.rect(25, doc.y, 560, 80).stroke();
    doc.moveDown();
    doc.fontSize(14).text('Skin', { underline: true });
    doc.fontSize(12).text(`Color: ${jobPost.skinColor}`);
    doc.fontSize(12).text(`Condition: ${jobPost.skinCondition}`);
    doc.fontSize(12).text(`Comments: ${jobPost.skinComments}`);

    // Add the signature to the PDF if available
    doc.moveDown();
    doc.rect(25, doc.y, 560, 100).stroke();
    doc.moveDown();
    doc.fontSize(12).text('Signature:', { underline: true });
    if (signature) {
      try {
        const base64Data = signature.replace(/^data:image\/\w+;base64,/, '');
        const signatureBuffer = Buffer.from(base64Data, 'base64');
        const imageFormat = signature.match(/^data:image\/(\w+);base64,/);

        if (imageFormat) {
          const format = imageFormat[1];
          const tempImagePath = path.join(__dirname, '../temp', `temp_signature.${format}`);
          fs.writeFileSync(tempImagePath, signatureBuffer);
          doc.image(tempImagePath, { width: 200, height: 50 });
          fs.unlinkSync(tempImagePath);
        } else {
          doc.text('Invalid image format.');
        }
      } catch (error) {
        console.error('Error processing signature image:', error.message);
        doc.text('Signature image could not be added.');
      }
    } else {
      doc.text('No signature provided.');
    }

    doc.end();

    // Fetch admin user to send email
    const adminUser = await User.findOne({ role: 'admin' });
    if (!adminUser) {
      fs.unlinkSync(filePath);
      return res.status(500).json({ message: 'Admin user not found' });
    }

    // Send email with PDF attachment
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: adminUser.email,
      subject: 'Job Checkout Completed',
      text: `The job with ID ${jobPost._id} has been completed by ${req.user.name}. Please find the checkout details attached.`,
      attachments: [
        {
          filename: `JobCheckout_${id}.pdf`,
          path: filePath,
        },
      ],
    };

    transporter.sendMail(mailOptions, (error, info) => {
      fs.unlinkSync(filePath);

      if (error) {
        console.error('Error sending email:', error.message);
        if (!res.headersSent) {
          return res.status(500).json({ message: 'Failed to send email' });
        }
      } else {
        console.log('Email sent:', info.response);
        if (!res.headersSent) {
          return res.status(200).json({ message: 'Job checked out successfully' });
        }
      }
    });
  } catch (error) {
    console.error('Error checking out job:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/templates/:id', async (req, res) => {
  try {
    const jobPost = await JobPost.findById(req.params.id);
    if (!jobPost) {
      return res.status(404).json({ message: 'Template not found' });
    }
    res.json(jobPost);
  } catch (error) {
    console.error('Error fetching template:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


router.get('/job-dates-statuses', async (req, res) => {
  try {
    const jobs = await JobPost.find({}, 'Date status');
    res.json(jobs);
  } catch (error) {
    console.error('Error fetching job dates and statuses:', error);
    res.status(500).json({ error: 'Failed to fetch job dates and statuses' });
  }
});


router.get('/date/:date', async (req, res) => {
  try {
    const date = req.params.date;
    console.log('Fetching jobs for date:', date); // Log the date parameter
    const jobs = await JobPost.find({ Date: date }); // Query the database
    console.log('Jobs found:', jobs); // Log the result
    res.json(jobs);
  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).send('Server error');
  }
});


module.exports = router;
























// const express = require('express');
// const admin = require('firebase-admin');
// const router = express.Router();
// const JobPost = require('../models/jobpost');
// const auth = require('../middleware/auth');
// const PDFDocument = require('pdfkit');
// const nodemailer = require('nodemailer');
// const fs = require('fs');
// const path = require('path');
// const User = require('../models/user');
// const Counter = require('../models/counter');

// const getNextSequence = async (name) => {
//   const sequenceDocument = await Counter.findByIdAndUpdate(
//     { _id: name },
//     { $inc: { seq: 1 } },
//     { new: true, upsert: true }
//   );
//   return sequenceDocument.seq;
// };

// // Nodemailer setup for sending email
// const transporter = nodemailer.createTransport({
//   service: 'gmail',
//   auth: {
//     user: process.env.EMAIL_USER,
//     pass: process.env.EMAIL_PASS,
//   },
// });

// const serviceAccount = require('../config/serviceAccountKey.json');
// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount),
// });

// const tempDir = path.join(__dirname, '../temp');

// if (!fs.existsSync(tempDir)) {
//   fs.mkdirSync(tempDir, { recursive: true });
// }

// // POST /api/jobPosts - Create a new job post
// router.post('/', auth, async (req, res) => {
//   const { Date, Shift, Location, Starttime, Endtime, JobDescription, Payment, TemplateName, isTemplate } = req.body;
//   const nextId = await getNextSequence('jobpostId');  
//   const CRID = `CR${String(nextId).padStart(3, '0')}`;

//   try {
//     const newJobPost = new JobPost({
//       user: req.user.id,
//       Date,
//       Shift,
//       Location,
//       Starttime,
//       Endtime,
//       JobDescription,
//       Payment,
//       TemplateName,
//       isTemplate,
//       CRID
//     });
//     const jobPost = await newJobPost.save();

//     // Send notification to all devices subscribed to 'job_posts' topic
//     const message = {
//       notification: {
//         title: 'New Job Posted!',
//         body: `A new job post has been created. Shift: ${Shift}, Location: ${Location}, JobDescription: ${JobDescription}`,
//       },
//       topic: 'job_posts',
//     };

//     await admin.messaging().send(message);

//     res.json(jobPost);
//   } catch (err) {
//     console.error('Error creating job post:', err.message);
//     res.status(500).send('Server Error');
//   }
// });

// // GET /api/jobPosts - Fetch all job posts
// router.get('/', async (req, res) => {
//   try {
//     const isTemplate = req.query.isTemplate === 'true';
//     const jobPosts = await JobPost.find({ isTemplate }).sort({ createdAt: -1 });
//     res.json(jobPosts);
//   } catch (err) {
//     console.error('Error fetching job posts:', err.message);
//     res.status(500).send('Server Error');
//   }
// });

// // GET /api/jobPosts/:id - Fetch a specific job post by ID
// router.get('/:id', async (req, res) => {
//   const jobId = req.params.id;

//   try {
//     const jobPost = await JobPost.findById(jobId);
//     if (!jobPost) {
//       return res.status(404).json({ msg: 'Job post not found' });
//     }
//     res.json(jobPost);
//   } catch (err) {
//     console.error('Error fetching job post:', err.message);
//     res.status(500).send('Server Error');
//   }
// });

// // PUT /api/jobPosts/:id - Update a job post
// router.put('/:id', async (req, res) => {
//   const { id } = req.params;
//   const updatedJobPost = req.body;

//   try {
//     const updatedJob = await JobPost.findByIdAndUpdate(id, updatedJobPost, { new: true });
//     if (!updatedJob) {
//       return res.status(404).json({ message: 'Job post not found' });
//     }
//     res.status(200).json(updatedJob);
//   } catch (error) {
//     console.error('Error updating job post:', error);
//     res.status(500).json({ message: 'Failed to update job post' });
//   }
// });

// // DELETE /api/jobPosts/:id - Delete a job post
// router.delete('/:id', async (req, res) => {
//   const { id } = req.params;

//   try {
//     const jobPost = await JobPost.findByIdAndDelete(id);
//     if (!jobPost) {
//       return res.status(404).json({ message: 'Job post not found' });
//     }
//     res.json({ message: 'Job post deleted successfully' });
//   } catch (err) {
//     console.error('Error deleting job post:', err);
//     res.status(500).json({ error: 'Server Error' });
//   }
// });

// // GET /api/jobPosts/upcoming - Fetch upcoming job posts
// router.get('/upcoming', async (req, res) => {
//   try {
//     const jobs = await JobPost.find({ status: 'upcoming' });
//     res.json(jobs);
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// });

// // PUT /api/jobPosts/accept/:id - Accept a job post
// router.put('/accept/:id', auth, async (req, res) => {
//   const { id } = req.params;

//   try {
//     const jobPost = await JobPost.findById(id);
//     if (!jobPost) {
//       return res.status(404).json({ msg: 'Job post not found' });
//     }

//     // Check if job post is already accepted or completed
//     if (jobPost.status !== 'open') {
//       return res.status(400).json({ message: 'Job already accepted or completed' });
//     }

//     // Update job post status to 'upcoming' and assign to the user
//     jobPost.status = 'upcoming';
//     jobPost.assignedTo = req.user.id;

//     await jobPost.save();
//     res.json(jobPost); // Return updated job object
//   } catch (error) {
//     console.error('Error accepting job:', error.message);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// // PUT /api/jobPosts/checkIn/:id - Check in for a job
// router.put('/checkIn/:id', auth, async (req, res) => {
//   try {
//     const { id } = req.params;
//     const job = await JobPost.findById(id);

//     if (!job) {
//       return res.status(404).json({ message: 'Job not found' });
//     }

//     if (job.status !== 'upcoming') {
//       return res.status(400).json({ message: 'Job not in upcoming status' });
//     }

//     // Update job status to 'checkedIn' and store check-in time
//     job.status = 'checkedIn';
//     job.checkInTime = new Date(); // Capture current time as check-in time

//     await job.save();

//     res.json(job);
//   } catch (error) {
//     console.error('Error checking in job:', error.message);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// // PUT /api/jobPosts/checkout/:id - Check out from a job
// router.put('/checkout/:id', auth, async (req, res) => {
//   const { id } = req.params;
//   const { signature, checkoutInput, patientWeight, temperature, bloodPressure, contactNumber } = req.body;

//   try {
//     const jobPost = await JobPost.findById(id);
//     if (!jobPost) {
//       return res.status(404).json({ msg: 'Job post not found' });
//     }

//     if (!req.user || !req.user.name) {
//       return res.status(400).json({ msg: 'User information is missing' });
//     }

//     // Update job post details
//     Object.assign(jobPost, {
//       status: 'completed',
//       checkedOut: true,
//       checkedOutTime: new Date(), // Capture current time as check-out time
//       signature,
//       checkoutInput,
//       patientWeight,
//       temperature,
//       bloodPressure,
//       contactNumber,
//     });

//     await jobPost.save();

//     // Generate PDF document
//     const doc = new PDFDocument({ margin: 30 });
//     const filePath = path.join(__dirname, '../temp', `JobCheckout_${id}.pdf`);
//     doc.pipe(fs.createWriteStream(filePath));

//     // Add header
//     doc.fontSize(10).text('Elite Care Management, INC (HC)', { align: 'center' });
//     doc.fontSize(10).text('568 S. Washington St.', { align: 'center' });
//     doc.fontSize(10).text('Naperville, IL, 60540-6042', { align: 'center' });
//     doc.fontSize(10).text('Phone: (630) 548-9500 | Fax: (630) 548-0541', { align: 'center' });

//     // Add title
//     doc.fontSize(14).text('Registered Nurse', { align: 'right', underline: true });

//     // Patient Details Section with border
//     doc.moveDown();
//     doc.rect(25, doc.y, 560, 150).stroke();
//     doc.moveDown();
//     doc.fontSize(12).text(`Patient Name: ${checkoutInput}`);
//     doc.moveDown();
//     doc.text(`Patient Weight: ${patientWeight}`);
//     doc.moveDown();
//     doc.text(`Temperature: ${temperature}`);
//     doc.moveDown();
//     doc.text(`Blood Pressure: ${bloodPressure}`);
//     doc.moveDown();
//     doc.text(`Contact Number: ${contactNumber}`);

//     // Add job details and signature
//     doc.moveDown();
//     doc.text(`Job Date: ${jobPost.Date}`, { align: 'right' });
//     doc.moveDown();
//     doc.text(`Shift: ${jobPost.Shift}`, { align: 'right' });
//     doc.moveDown();
//     doc.text(`Job ID: ${jobPost._id}`, { align: 'right' });

//     doc.moveDown();
//     doc.text(`Signature: ${signature}`, { align: 'right' });

//     doc.end();

//     // Read the PDF file after writing and send it as email attachment
//     doc.on('end', async () => {
//       try {
//         const mailOptions = {
//           from: process.env.EMAIL_USER,
//           to: process.env.EMAIL_USER,
//           subject: 'Job Check-out Details',
//           text: 'Please find the job check-out details attached.',
//           attachments: [{ filename: `JobCheckout_${id}.pdf`, path: filePath }],
//         };

//         await transporter.sendMail(mailOptions);
//         console.log('Email sent successfully');

//         res.json(jobPost);
//       } catch (error) {
//         console.error('Error sending email:', error);
//         res.status(500).json({ error: 'Failed to send email' });
//       } finally {
//         // Delete the PDF file after sending the email
//         fs.unlink(filePath, (err) => {
//           if (err) {
//             console.error('Error deleting file:', err);
//           } else {
//             console.log('PDF file deleted successfully');
//           }
//         });
//       }
//     });
//   } catch (error) {
//     console.error('Error checking out job:', error.message);
//     res.status(500).json({ message: 'Server error' });
//   }
// });

// module.exports = router;
