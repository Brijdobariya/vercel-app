require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const cors = require('cors');
const { createTransport } = require('nodemailer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt'); // Add bcrypt for password hashing

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// MySQL connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Nodemailer setup
const transporter = createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// OTP expiration time (5 minutes)
const OTP_EXPIRATION_TIME = 5 * 60 * 1000;

// Function to generate a random 6-digit OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// In-memory store for OTPs with expiry
let otpStore = {};

// Register API - Generate OTP and send via email
app.post('/api/register', (req, res) => {
  const { name, email, password, mobile } = req.body;

  // Check if the email already exists
  const checkEmailQuery = 'SELECT * FROM users WHERE email = ?';
  pool.query(checkEmailQuery, [email], async (err, result) => {
    if (err) return res.status(500).json({ error: err.message });

    if (result.length > 0) return res.status(400).json({ error: 'Email is already registered' });

    // Generate OTP
    const otp = generateOTP();
    otpStore[email] = { otp, expiresAt: Date.now() + OTP_EXPIRATION_TIME };

    // Send OTP via email
    const mailOptions = {
      from: "Live Notes WITH YOU <mr.dobariya8115@gmail.com>",
      to: email,
      subject: 'Your One-Time Password (OTP)',
      html: `<h1>Your OTP is: ${otp}</h1><p>Please use this OTP to verify your email address.</p>`,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) return res.status(500).json({ error: 'Failed to send OTP' });

      res.status(200).json({ message: 'OTP sent successfully' });
    });
  });
});

// Verify OTP and complete registration
app.post('/api/verify-otp', (req, res) => {
  const { email, otp, name, password, mobile } = req.body;

  const storedOtpData = otpStore[email];

  // Check if OTP exists and is valid
  if (!storedOtpData || storedOtpData.otp !== otp || Date.now() > storedOtpData.expiresAt) {
    return res.status(400).json({ error: 'Invalid or expired OTP' });
  }

  // Remove OTP after use
  delete otpStore[email];

  // Hash the password before saving
  bcrypt.hash(password, 10, (err, hashedPassword) => {
    if (err) return res.status(500).json({ error: 'Failed to hash password' });

    // Generate JWT token
    const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '1h' });

    // Insert user into the database
    const insertUserQuery = 'INSERT INTO users (name, email, password, mobile, token) VALUES (?, ?, ?, ?, ?)';
    pool.query(insertUserQuery, [name, email, hashedPassword, mobile, token], (err, result) => {
      if (err) return res.status(500).json({ error: err.message });

      res.status(201).json({
        message: 'User registered successfully',
        userId: result.insertId,
        token, // Send the JWT token
      });
    });
  });
});

// Login API
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;

  const query = 'SELECT * FROM users WHERE email = ?';
  pool.query(query, [email], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (results.length === 0) return res.status(401).json({ error: 'Invalid email or password' });

    const user = results[0];

    // Compare hashed passwords
    bcrypt.compare(password, user.password, (err, isMatch) => {
      if (err || !isMatch) return res.status(401).json({ error: 'Invalid email or password' });

      const token = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '1h' });

      res.json({ message: 'Login successful', token });
    });
  });
});

// JWT Authentication Middleware
const authenticateJWT = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(403).json({ error: 'No token provided' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// Example of a protected route
app.get('/api/protected', authenticateJWT, (req, res) => {
  res.status(200).json({ message: 'This is a protected route', user: req.user });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
  
