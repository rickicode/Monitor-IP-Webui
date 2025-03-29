// server.js - Main application file

require('dotenv').config();

// Set timezone
process.env.TZ = process.env.TZ || 'Asia/Jakarta';
console.log(`Server timezone set to: ${process.env.TZ}`);

const express = require('express');
const http = require('http');
const net = require('net');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const WebSocket = require('ws');

// Configuration from environment variables
const PORT = process.env.APP_PORT || 3000;
const IP_TO_MONITOR = process.env.MIKROTIK_IP || '192.168.90.3';
const PING_INTERVAL = parseInt(process.env.PING_INTERVAL || '1000');
const MAX_HISTORY_PER_PAGE = 100;

// Initialize Express app
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Set up SQLite database
const db = new sqlite3.Database('./ping_monitor.db');

// Create tables if they don't exist
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS ping_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now', 'localtime')),
    ping_time REAL,
    status TEXT
  )`);
});

// Helper function to format date in local timezone
function formatLocalDateTime(date) {
  // Use moment-timezone to handle dates consistently
  const localDate = new Date(date.toLocaleString('en-US', { timeZone: process.env.TZ }));
  
  // Format with leading zeros
  const year = localDate.getFullYear();
  const month = String(localDate.getMonth() + 1).padStart(2, '0');
  const day = String(localDate.getDate()).padStart(2, '0');
  const hours = String(localDate.getHours()).padStart(2, '0');
  const minutes = String(localDate.getMinutes()).padStart(2, '0');
  const seconds = String(localDate.getSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.get('/api/config', (req, res) => {
  res.json({
    title: process.env.APP_TITLE || 'Mikrotik CHR Monitoring',
    ip: IP_TO_MONITOR,
    pingInterval: PING_INTERVAL,
    timezone: process.env.TZ || 'Asia/Jakarta'
  });
});

app.get('/api/ping-data', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || MAX_HISTORY_PER_PAGE;
  const offset = (page - 1) * limit;
  
  const startDate = req.query.startDate ? new Date(req.query.startDate) : null;
  const endDate = req.query.endDate ? new Date(req.query.endDate) : null;
  
  let query = 'SELECT * FROM ping_results';
  const params = [];
  
  if (startDate && endDate) {
    query += ' WHERE timestamp BETWEEN ? AND ?';
    params.push(formatLocalDateTime(startDate), formatLocalDateTime(endDate));
  } else if (startDate) {
    query += ' WHERE timestamp >= ?';
    params.push(formatLocalDateTime(startDate));
  } else if (endDate) {
    query += ' WHERE timestamp <= ?';
    params.push(formatLocalDateTime(endDate));
  }
  
  query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  
  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) as count FROM ping_results';
    const countParams = [];
    
    if (startDate && endDate) {
      countQuery += ' WHERE timestamp BETWEEN ? AND ?';
      countParams.push(formatLocalDateTime(startDate), formatLocalDateTime(endDate));
    } else if (startDate) {
      countQuery += ' WHERE timestamp >= ?';
      countParams.push(formatLocalDateTime(startDate));
    } else if (endDate) {
      countQuery += ' WHERE timestamp <= ?';
      countParams.push(formatLocalDateTime(endDate));
    }
    
    db.get(countQuery, countParams, (err, countRow) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      res.json({
        data: rows,
        pagination: {
          total: countRow.count,
          page,
          limit,
          pages: Math.ceil(countRow.count / limit)
        }
      });
    });
  });
});

// WebSocket for real-time updates
wss.on('connection', (ws) => {
  console.log('Client connected');
  
  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

// Function to ping using TCP connection
function pingIP() {
  const startTime = process.hrtime();
  let pingTime = null;
  let status = 'failed';

  const socket = new net.Socket();
  
  // Set timeout for connection attempt (3 seconds)
  socket.setTimeout(3000);

  // Handle successful connection
  socket.on('connect', () => {
    const diff = process.hrtime(startTime);
    pingTime = Math.round((diff[0] * 1000 + diff[1] / 1000000) * 100) / 100; // Convert to milliseconds with 2 decimal places
    status = 'success';
    socket.end();
  });

  // Handle connection error
  socket.on('error', () => {
    socket.destroy();
    savePingResult();
  });

  // Handle connection timeout
  socket.on('timeout', () => {
    socket.destroy();
    savePingResult();
  });

  // Handle connection close
  socket.on('close', () => {
    savePingResult();
  });

  // Function to save and broadcast the ping result
  function savePingResult() {
    // Store result in database with local timezone
    const stmt = db.prepare('INSERT INTO ping_results (ping_time, status) VALUES (?, ?)');
    stmt.run(pingTime, status);
    stmt.finalize();
    
    // Send result to all connected clients
    const pingData = {
      timestamp: formatLocalDateTime(new Date()),
      ping_time: pingTime,
      status: status
    };
    
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(pingData));
      }
    });
  }

  // Attempt to connect
  socket.connect({
    port: 80, // Try to connect to HTTP port
    host: IP_TO_MONITOR
  });
}

// Start pinging at regular intervals
setInterval(pingIP, PING_INTERVAL);

// Start the server
server.listen(PORT, () => {
  console.log(`${process.env.APP_TITLE || 'Mikrotik CHR Monitoring'} server running at http://localhost:${PORT}`);
});
