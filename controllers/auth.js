// controllers/auth.js

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/user');

// Function to register a new user
const register = async (req, res) => {
  const { name, email, password, confirmPassword } = req.body;

  try {
    // Check if the user already exists
    let user = await User.findOne({ email });

    if (user) {
      return res.status(400).json({ msg: 'User already exists' });
    }

    // Create new user instance
    user = new User({ name, email, password, confirmPassword });

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);

    // Save user to database
    await user.save();

    res.json({ msg: 'User registered successfully' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

// Function to authenticate and log in a user
const login = async (req, res) => {
  const { email, password } = req.body;

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

    // Create and return JWT token
    const payload = {
      user: {
        id: user.id,
      },
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: 3600 }, // Token expires in 1 hour
      (err, token) => {
        if (err) throw err;
        res.json({ token, user: { id: user.id, role: user.role } });
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

// Function to fetch user profile
const profile = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]; // Ensure correct token extraction

    if (!token) {
      return res.status(401).json({ msg: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.user.id; // Corrected to use 'user.id'

    const user = await User.findById(userId).select('-password'); // Exclude password from the response

    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ msg: 'Server error' });
  }
};

module.exports = { register, login, profile };
