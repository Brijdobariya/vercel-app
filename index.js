require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const cors = require('cors');
const { createTransport } = require('nodemailer');
const jwt = require('jsonwebtoken'); // Import JWT

const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Set up MySQL connection pool using environment variables
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Create Nodemailer transporter
const transporter = createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Function to generate a random 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Store OTP temporarily (in-memory for demo, but consider using a database)
let otpStore = {};

// API route for registration and OTP sending
app.post('/api/register', (req, res) => {
  const { name, email, password } = req.body;

  // Check if the email already exists
  const checkEmailQuery = 'SELECT * FROM users WHERE email = ?';
  pool.query(checkEmailQuery, [email], (err, result) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (result.length > 0) {
      return res.status(400).json({ error: 'Email is already registered' });
    }

    // Generate OTP
    const otp = generateOTP();
    otpStore[email] = otp;  // Store OTP in-memory for now

    // Send OTP via email
    const mailOptions = {
      from: "Live Notes WITH YOU <mr.dobariya8115@gmail.com>",
      to: email,
      subject: 'Your One-Time Password (OTP)',
      html: `
      <h1>Your OTP is: ${otp}</h1>
      <p>Please use this OTP to verify your email address.</p>
      `,
    };

    transporter.sendMail(mailOptions, function (error, info) {
      if (error) {
        return res.status(500).json({ error: 'Failed to send OTP' });
      } else {
        return res.status(200).json({ message: 'OTP sent successfully', otp }); // Include OTP for testing (remove in production)
      }
    });
  });
});

// API route to verify OTP and generate JWT
app.post('/api/verify-otp', (req, res) => {
  const { email, otp, name, password } = req.body;

  // Check if the OTP matches
  if (otpStore[email] && otpStore[email] === otp) {
    delete otpStore[email];  // OTP is used, delete it

    // Create JWT token after successful OTP verification
    const token = jwt.sign(
      { email: email },
      process.env.JWT_SECRET,  // Use a secret key for signing JWT
      { expiresIn: '1h' } // Token expiration time
    );

    // Insert new user into the database with JWT token
    const insertUserQuery = 'INSERT INTO users (name, email, password, token) VALUES (?, ?, ?, ?)';
    pool.query(insertUserQuery, [name, email, password, token], (err, result) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      return res.status(201).json({
        message: 'User registered successfully',
        userId: result.insertId,
        token: token // Send the JWT token to the client
      });
    });
  } else {
    return res.status(400).json({ error: 'Invalid OTP' });
  }
});

// Middleware to verify JWT
const authenticateJWT = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1]; // Get token from headers
  console.log("Received token:", token); // Log the token

  if (!token) {
      return res.status(403).json({ error: 'Access denied, no token provided' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      if (err) {
          console.error('JWT verification error:', err); // Log the error
          return res.status(403).json({ error: 'Invalid token' });
      }
      req.user = user; 
      next();
  });
};



// Protected route example (accessible only with valid JWT)
app.get('/api/protected', authenticateJWT, (req, res) => {
  res.status(200).json({ message: 'This is a protected route', user: req.user });
});


// API route for user login
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;

  // Check if user exists in the database
  const query = 'SELECT * FROM users WHERE email = ? AND password = ?';
  pool.query(query, [email, password], (err, results) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (results.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = results[0];

    // Generate a JWT token for the user
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Send the token to the client
    return res.json({
      message: 'Login successful',
      token: token
    });
  });
});



// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
