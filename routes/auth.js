const router = require('express').Router();
const bcrypt = require('bcryptjs');
const User = require('../models/user');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');

require('dotenv').config(); // Ensure environment variables are loaded

// Setup email transporter
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Function to generate OTP
const generateOTP = () => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

// Function to generate verification token
const generateVerificationToken = () => {
  return jwt.sign({}, process.env.JWT_SECRET, { expiresIn: '1d' }); // Adjust expiry as needed
};

// Registration route
router.post('/register', async (req, res) => {
  const { name, email, password, confirmPassword,role } = req.body;

  try {
    // Check if passwords match
    if (password !== confirmPassword) {
      return res.status(400).json({ msg: 'Passwords do not match' });
    }

    // Check if the user already exists
    let existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({ msg: 'Email already in use' });
    }

    // Generate OTP and verification token
    const otp = generateOTP();
    const verificationToken = generateVerificationToken();

    // Create a new user instance
    const newUser = new User({
      name,
      email,
      password,
      otp,
      verificationToken,
      role
    });

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    newUser.password = await bcrypt.hash(password, salt);

    // Save user to database
    await newUser.save();

    // Send OTP via email
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'OTP for Verification',
      text: `Your OTP for verification is: ${otp}`,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('Error sending OTP email:', error);
        return res.status(500).json({ msg: 'Error sending OTP email' });
      } else {
        console.log('OTP email sent:', info.response);
        res.json({ msg: 'Registration successful. OTP sent to your email for verification.' });
      }
    });

  } catch (err) {
    console.error('Error registering user:', err.message);
    res.status(500).send('Server error');
  }
});

// OTP verification route
router.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;

  try {
    // Find user by email
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ msg: 'Invalid email' });
    }

    // Check if OTP matches
    if (user.otp !== otp) {
      return res.status(400).json({ msg: 'Invalid OTP' });
    }

    // Update user as verified
    user.verified = true;
    await user.save();

    res.status(200).json({ msg: 'OTP verified successfully' });
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
});

// Login route
router.post('/login', async (req, res) => {
  const { email, password, role } = req.body;

  try {
    // Check if the user exists
    let user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }

    // Validate password
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }

    // Log the user object to debug
    console.log('User object:', user);

    // Create and return a JWT token
    jwt.sign(
      { id: user._id }, // Use user._id instead of user.id
      process.env.JWT_SECRET,
      { expiresIn: 3600 }, // Expires in 1 hour
      (err, token) => {
        if (err) throw err;
        res.json({
          token,
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
          },
        });
      }
    );
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
});


module.exports = router;
