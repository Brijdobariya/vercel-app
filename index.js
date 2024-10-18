require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const cors = require('cors');
const { createTransport } = require('nodemailer');

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
      from: "Live Notes WITH YOU  <mr.dobariya8115@gmail.com>",
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

// API route to verify OTP
app.post('/api/verify-otp', (req, res) => {
  const { email, otp } = req.body;

  // Check if the OTP matches
  if (otpStore[email] && otpStore[email] === otp) {
    delete otpStore[email];  // OTP is used, delete it

    // Insert new user into database
    const { name, password } = req.body;
    const insertUserQuery = 'INSERT INTO users (name, email, password) VALUES (?, ?, ?)';
    pool.query(insertUserQuery, [name, email, password], (err, result) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      return res.status(201).json({ message: 'User registered successfully', userId: result.insertId });
    });
  } else {
    return res.status(400).json({ error: 'Invalid OTP' });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
  