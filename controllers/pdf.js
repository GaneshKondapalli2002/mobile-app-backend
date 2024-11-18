const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const User = require('../models/user');
const JobPost = require('../models/jobpost');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const checkoutJob = async (req, res) => {
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
    doc.rect(60, doc.y, 550, 140).stroke();
    doc.moveDown();
    doc.fontSize(12).text(`Patient Name: ${jobPost.patientName}`, { align: 'left' });
    doc.fontSize(12).text(`Visit Date: ${jobPost.visitDate}`, { align: 'right' });
    doc.fontSize(12).text(`Care Period: ${jobPost.carePeriod}`, { align: 'left' });
    doc.fontSize(12).text(`Time In: ${jobPost.timeIn}`, { align: 'right' });
    doc.fontSize(12).text(`MRN: ${jobPost.mrn}`, { align: 'left' });
    doc.fontSize(12).text(`Time Out: ${jobPost.timeOut}`, { align: 'right' });
    doc.fontSize(12).text(`Last Physician Visit Date: ${jobPost.lastPhysicianVisitDate}`, { align: 'left' });
    doc.fontSize(12).text(`Associated Mileage: ${jobPost.associatedMileage}`, { align: 'right' });
    doc.fontSize(12).text(`Primary DX: ${jobPost.primaryDx}`, { align: 'left' });
    doc.fontSize(12).text(`Secondary DX: ${jobPost.secondaryDx}`, { align: 'left' });
    // Vital Signs Section with border
    doc.moveDown();
    doc.rect(80, doc.y, 550, 160).stroke();
    doc.moveDown();
    doc.fontSize(14).text('Vital Signs', { underline: true });
    doc.fontSize(12).text(`Respiration: ${jobPost.respiration}`);
    doc.fontSize(12).text(`Weight: ${jobPost.patientWeight}`);
    doc.fontSize(12).text(`Height (in Inches): ${jobPost.height}`);
    doc.fontSize(12).text(`Temperature: ${jobPost.temperature}`);
    doc.fontSize(12).text(`Pulse: ${jobPost.pulse}`);
    doc.fontSize(12).text(`Mid-Arm Circumference (cm): ${jobPost.midArmCircumference}`);
    doc.fontSize(12).text(`Blood Glucose: ${jobPost.bloodGlucose}`);
    doc.fontSize(12).text(`Oxygen Saturation: ${jobPost.oxygenSaturation}`);
    doc.fontSize(12).text(`O2 Amount: ${jobPost.oxygenAmount}`);
    doc.fontSize(12).text(`Blood Pressure: ${jobPost.bloodPressure}`);
    doc.fontSize(12).text(`Comments: ${jobPost.comments}`);
    // Skin Section with border
    doc.moveDown();
    doc.rect(40, doc.y, 550, 80).stroke();
    doc.moveDown();
    doc.fontSize(14).text('Skin', { underline: true });
    doc.fontSize(12).text(`Color: ${jobPost.skinColor}`);
    doc.fontSize(12).text(`Condition: ${jobPost.skinCondition}`);
    doc.fontSize(12).text(`Comments: ${jobPost.skinComments}`);

    // Add the signature to the PDF if available
    doc.moveDown();
    doc.rect(30, doc.y, 550, 100).stroke();
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
};

module.exports = {
  checkoutJob,
};







