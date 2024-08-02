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

// router.post('/draft', async (req, res) => {
//   try {
//     console.log('Request body:', req.body); // Log request body

//     const jobPostData = req.body;

//     if (!jobPostData) {
//       throw new Error('No job post data provided');
//     }



//     const jobPost = new JobPost({
//       ...jobPostData,
//       status: 'draft',
//     });

//     await jobPost.save();

//     res.status(201).json(jobPost);
//   } catch (error) {
//     console.error('Error saving job draft:', error.message);
//     res.status(400).json({ message: error.message });
//   }
// });
// PUT /api/jobPosts/:id - Update a job post
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

// PUT /api/jobPosts/checkIn/:id - Check in to a job
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
    job.checkInTime = new Date();

    // Save updated job
    await job.save();

    // Return updated job object
    res.json(job);
  } catch (error) {
    console.error('Error checking in job:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});


// // routes/jobpost.js
// router.put('/checkout/:id', auth, async (req, res) => {
//   const { id } = req.params;
//   const { signature, checkoutInput } = req.body;

//   try {
//     // Fetch the job post by ID
//     console.log('Fetching job post with ID:', id); // Debugging line
//     const jobPost = await JobPost.findById(id);
    
//     // Log the retrieved job post
//     console.log('Retrieved job post:', jobPost); // Debugging line

//     if (!jobPost) {
//       return res.status(404).json({ msg: 'Job post not found' });
//     }

//     // Update job post with checkout details
//     jobPost.status = 'completed';
//     jobPost.checkedOut = true;
//     jobPost.signature = signature; // Save the base64 signature
//     jobPost.checkoutInput = checkoutInput;

//     await jobPost.save();

//     // Create a PDF document
//     const doc = new PDFDocument();
//     const filePath = path.join(__dirname, '../temp', `JobCheckout_${id}.pdf`);

//     doc.pipe(fs.createWriteStream(filePath));

//     doc.fontSize(12).text(`Job Checkout Details`, { underline: true });
//     doc.moveDown();

//     // Debugging: Log jobPost details
//     console.log('JobPost details for PDF:', {
//       id: jobPost._id,
//       user: req.user.name,
//       date: jobPost.date,
//       shift: jobPost.shift,
//       location: jobPost.location,
//       jobDescription: jobPost.jobDescription,
//       checkoutInput: jobPost.checkoutInput
//     });

//     doc.text(`Job ID: ${jobPost._id || 'Not available'}`);
//     doc.text(`User: ${req.user.name || 'Not available'}`);
//     doc.text(`Date: ${jobPost.date ? jobPost.date.toDateString() : 'Not available'}`);
//     doc.text(`Shift: ${jobPost.shift || 'Not available'}`);
//     doc.text(`Location: ${jobPost.location || 'Not available'}`);
//     doc.text(`Job Description: ${jobPost.jobDescription || 'Not available'}`);
//     doc.text(`Checkout Input: ${jobPost.checkoutInput || 'Not available'}`);
//     doc.text(`Signature:`, { continued: true });

//     // Add the signature to the PDF if available
//     if (signature) {
//       try {
//         const base64Data = signature.replace(/^data:image\/\w+;base64,/, '');
//         const signatureBuffer = Buffer.from(base64Data, 'base64');
//         const imageFormat = signature.match(/^data:image\/(\w+);base64,/);

//         if (imageFormat) {
//           const format = imageFormat[1];
//           const tempImagePath = path.join(__dirname, '../temp', `temp_signature.${format}`);
//           fs.writeFileSync(tempImagePath, signatureBuffer);
//           doc.image(tempImagePath, { width: 200, height: 50 });
//           fs.unlinkSync(tempImagePath);
//         } else {
//           doc.text('Invalid image format.');
//         }
//       } catch (error) {
//         console.error('Error processing signature image:', error.message);
//         doc.text('Signature image could not be added.');
//       }
//     } else {
//       doc.text('No signature provided.');
//     }

//     doc.end();

//     // Retrieve admin user email and send email with PDF attachment
//     const adminUser = await User.findOne({ role: 'admin' });
//     if (!adminUser) {
//       // Clean up the file before responding with an error
//       fs.unlinkSync(filePath);
//       return res.status(500).json({ message: 'Admin user not found' });
//     }

//     const mailOptions = {
//       from: process.env.EMAIL_USER,
//       to: adminUser.email, // Use admin user's email
//       subject: 'Job Checkout Completed',
//       text: `The job with ID ${jobPost._id} has been completed by ${req.user.name}. Please find the checkout details attached.`,
//       attachments: [
//         {
//           filename: `JobCheckout_${id}.pdf`,
//           path: filePath,
//         },
//       ],
//     };

//     transporter.sendMail(mailOptions, (error, info) => {
//       if (error) {
//         console.error('Error sending email:', error);
//         // Clean up the file if email fails to send
//         fs.unlinkSync(filePath);
//         if (!res.headersSent) {
//           return res.status(500).json({ message: 'Failed to send email' });
//         }
//       } else {
//         console.log('Email sent:', info.response);
//         // Optionally delete the temporary file after sending the email
//         fs.unlinkSync(filePath);

//         // Send response only after email has been sent
//         if (!res.headersSent) {
//           return res.json(jobPost);
//         }
//       }
//     });
//   } catch (err) {
//     console.error('Error checking out job:', err.message);
//     if (!res.headersSent) {
//       return res.status(500).send('Server Error');
//     }
//   }
// });

// routes/jobpost.js
router.put('/checkout/:id', auth, async (req, res) => {
  const { id } = req.params;
  const { signature, checkoutInput,patientWeight, temperature, bloodPressure, contactNumber } = req.body;

  try {
    // Fetch the job post by ID
    const jobPost = await JobPost.findById(id);
    if (!jobPost) {
      return res.status(404).json({ msg: 'Job post not found' });
    }

    // Check if req.user is available and has a name property
    if (!req.user || !req.user.name) {
      return res.status(400).json({ msg: 'User information is missing' });
    }

    // Update job post with checkout details
    jobPost.status = 'completed';
    jobPost.checkedOut = true;
    jobPost.signature = signature; // Save the base64 signature
    jobPost.checkoutInput = checkoutInput;
    jobPost.patientWeight = patientWeight;
    jobPost.temperature = temperature;
    jobPost.bloodPressure = bloodPressure;
    jobPost.contactNumber = contactNumber;

    await jobPost.save();

    // Create a PDF document
    const doc = new PDFDocument();
    const filePath = path.join(__dirname, '../temp', `JobCheckout_${id}.pdf`);

    doc.pipe(fs.createWriteStream(filePath));

    doc.fontSize(12).text(`Job Checkout Details`, { underline: true });
    doc.moveDown();
    doc.text(`CRID: ${jobPost.CRID}`);
    doc.text(`Date: ${jobPost.Date}`);
    doc.text(`Shift: ${jobPost.Shift}`);
    doc.text(`Location: ${jobPost.Location}`);
    doc.text(`Patient Weight: ${jobPost.patientWeight}`);
    doc.text(`Temperature: ${jobPost.temperature}`);
    doc.text(`Blood Pressure: ${jobPost.bloodPressure}`);
  
    

   

    // Create a new page for additional details
    doc.addPage();

    // Second page content
    doc.fontSize(12).text(`Additional Job Details`, { underline: true });
    doc.moveDown();
    doc.text(`Job ID: ${jobPost._id}`);
    doc.text(`User: ${req.user.name}`);
    doc.text(`Job Description: ${jobPost.JobDescription}`);
    doc.text(`Checkout Input: ${jobPost.checkoutInput}`);
    doc.text(`Signature:`, { continued: true });
  
 // Add the signature to the PDF if available
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

    // Retrieve admin user email and send email with PDF attachment
    const adminUser = await User.findOne({ role: 'admin' });
    if (!adminUser) {
      // Clean up the file before responding with an error
      fs.unlinkSync(filePath);
      return res.status(500).json({ message: 'Admin user not found' });
    }

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: adminUser.email, // Use admin user's email
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
      if (error) {
        console.error('Error sending email:', error);
        // Clean up the file if email fails to send
        fs.unlinkSync(filePath);
        if (!res.headersSent) {
          return res.status(500).json({ message: 'Failed to send email' });
        }
      } else {
        console.log('Email sent:', info.response);
        // Optionally delete the temporary file after sending the email
        fs.unlinkSync(filePath);

        // Send response only after email has been sent
        if (!res.headersSent) {
          return res.json(jobPost);
        }
      }
    });
  } catch (err) {
    console.error('Error checking out job:', err.message);
    if (!res.headersSent) {
      return res.status(500).send('Server Error');
    }
  }
});




// GET /api/jobPosts/template/:templateName - Fetch a specific job post by TemplateName
router.get('/template/:templateName', async (req, res) => {
  const { templateName } = req.params;

  try {
    const jobPost = await JobPost.findOne({ TemplateName: templateName, isTemplate: true });
    if (!jobPost) {
      return res.status(404).json({ msg: 'Job post not found' });
    }
    res.json(jobPost);
  } catch (err) {
    console.error('Error fetching job post by template name:', err.message);
    res.status(500).send('Server Error');
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
