const express = require('express');
const mysql = require('mysql2');

// Create an Express app
const app = express();

// Set up MySQL connection pool
const pool = mysql.createPool({
  host: '62.72.28.52', // Your MySQL host
  user: 'u742116386_node', // Your MySQL username
  password: 'Node@8115', // Your MySQL password
  database: 'u742116386_node', // Your database name
  waitForConnections: true,
  connectionLimit: 10,  // Max number of connections at a time
  queueLimit: 0         // Unlimited queued requests
});

// Create an API route to fetch data
app.get('/api/users', (req, res) => {
  const sqlQuery = 'SELECT * FROM users';
  
  pool.query(sqlQuery, (err, result) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.status(200).json(result);
    }
  });
});

app.get('/', (req, res) => {
  res.status(200).json('hello bosadi vale kaya dekhane aaya he tu lode ');
});


// Start the server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
