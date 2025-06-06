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
const axios = require('axios');
// Configuration from environment variables
const PORT = process.env.APP_PORT || 3000;
const IP_TO_MONITOR = process.env.MIKROTIK_IP || '192.168.90.3';
const PING_INTERVAL = parseInt(process.env.PING_INTERVAL || '1000');
const MAX_HISTORY_PER_PAGE = 100;
const NOTIFICATION_PHONE = process.env.NOTIFICATION_PHONE;

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Store latest ping result and failure counter
let latestPingResult = null;
let consecutiveFailures = 0;
let lastNotificationTime = 0;

// Function to send WhatsApp notification
async function sendWhatsAppNotification() {
  if (!NOTIFICATION_PHONE) {
    console.log('WhatsApp notification skipped: No phone number configured');
    return;
  }

  // Prevent notification spam by checking last notification time (minimum 5 minutes between notifications)
  const now = Date.now();
  if (now - lastNotificationTime < 5 * 60 * 1000) {
    console.log('WhatsApp notification skipped: Too soon since last notification');
    return;
  }

  try {
    // Fetch server IP and ISP information from an external API
    const ipInfoResponse = await axios.get('https://ipinfo.io/json');
    const serverIP = ipInfoResponse.data.ip || 'Unknown IP';
    const ispName = ipInfoResponse.data.org || 'Unknown ISP';

    const message = `⚠️ Alert: Mikrotik connection failed 10 consecutive times\n\nIP: ${IP_TO_MONITOR}\nTime: ${formatLocalDateTime(new Date())}\nServer IP: ${serverIP}\nISP: ${ispName}`;
    const url = `https://wa.nux.my.id/api/sendWA?to=${NOTIFICATION_PHONE}&msg=${encodeURIComponent(message)}&secret=32fe56e1e208f41a6dd39c47f0eef976`;
    
    await axios.get(url);
    console.log('WhatsApp notification sent successfully');
    lastNotificationTime = now;
  } catch (error) {
    console.error('Failed to send WhatsApp notification:', error.message);
  }
}

// Set up SQLite database
const db = new sqlite3.Database('./ping_monitor.db');

// Function to clean up old records
function cleanupOldRecords() {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const query = 'DELETE FROM ping_results WHERE timestamp < ?';
  db.run(query, [formatLocalDateTime(sevenDaysAgo)], function(err) {
    if (err) {
      console.error('Error cleaning up old records:', err);
    } else {
      console.log(`Cleaned up ${this.changes} records older than 7 days`);
    }
  });
}

// Create tables if they don't exist
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS ping_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now', 'localtime')),
    ping_time REAL,
    status TEXT
  )`);
  
  // Initial cleanup
  cleanupOldRecords();
});

// Schedule cleanup to run daily at midnight
setInterval(() => {
  const now = new Date();
  if (now.getHours() === 0 && now.getMinutes() === 0) {
    cleanupOldRecords();
  }
}, 60 * 1000); // Check every minute

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
  let query = 'SELECT * FROM ping_results';
  const params = [];
  let conditions = [];
  
  const page = parseInt(req.query.page) || 1;
  const requestedLimit = req.query.limit !== undefined ? parseInt(req.query.limit) : MAX_HISTORY_PER_PAGE;
  
  // If limit is 0 or 'all', return all records without pagination
  const usePagination = requestedLimit !== 0;
  const limit = usePagination ? requestedLimit : null;
  const offset = usePagination ? (page - 1) * limit : 0;
  
  const startDate = req.query.startDate ? new Date(req.query.startDate) : null;
  const endDate = req.query.endDate ? new Date(req.query.endDate) : null;
  
  if (startDate && endDate) {
    conditions.push('timestamp BETWEEN ? AND ?');
    params.push(formatLocalDateTime(startDate), formatLocalDateTime(endDate));
  } else if (startDate) {
    conditions.push('timestamp >= ?');
    params.push(formatLocalDateTime(startDate));
  } else if (endDate) {
    conditions.push('timestamp <= ?');
    params.push(formatLocalDateTime(endDate));
  }
  
  // Add status filter
  if (req.query.status) {
    conditions.push('status = ?');
    params.push(req.query.status);
  }
  
  // Add WHERE clause if there are conditions
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  
  // Add ORDER BY before any LIMIT
  query += ' ORDER BY timestamp DESC';
  
  // Add LIMIT and OFFSET only if pagination is used
  if (usePagination) {
    query += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);
  }
  
  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    // Get total count for pagination
    if (!usePagination) {
      // If not using pagination, return all data without pagination info
      res.json({
        data: rows
      });
    } else {
      // If using pagination, get total count and return pagination info
      let countQuery = 'SELECT COUNT(*) as count FROM ping_results';
      const countParams = params.slice(0, -2); // Remove limit and offset params
      
      if (conditions.length > 0) {
        countQuery += ' WHERE ' + conditions.join(' AND ');
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
    }
  });
});

// API endpoint for current ping status
app.get('/api/current-status', (req, res) => {
  res.json(latestPingResult || { status: 'initializing' });
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
    consecutiveFailures = 0; // Reset failure counter on success
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
    
    // Update latest ping result
    latestPingResult = {
      timestamp: formatLocalDateTime(new Date()),
      ping_time: pingTime,
      status: status
    };

    // Handle consecutive failures
    if (status === 'failed') {
      consecutiveFailures++;
      if (consecutiveFailures >= 10) {
        sendWhatsAppNotification();
      }
    }
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
