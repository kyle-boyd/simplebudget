const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;

// Restrict CORS to localhost origins only (this server is for local dev/preview)
app.use(cors({ origin: /^http:\/\/localhost(:\d+)?$/ }));

// Serve the built app. Run `npm run build` first.
const DIST = path.join(__dirname, 'dist');

app.use(express.static(DIST));

// Handle client-side routing - serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(DIST, 'index.html'));
});

app.listen(PORT, 'localhost', () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
