const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const multer = require('multer');
const uploadRouter = require('./routes/upload');  // Import the router we created

const app = express();
const port = 3000;


// Enable CORS for all routes
app.use(cors());

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files if needed
app.use(express.static(path.join(__dirname, 'public')));

// Use the uploadRouter for handling file uploads
app.use('/upload', uploadRouter);  // Ensure the /upload path is being registered



// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
