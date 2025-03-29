// public/js/app.js

// Initialize WebSocket connection
const socket = new WebSocket(`ws://${window.location.host}`);

// DOM elements
const pingStatus = document.getElementById('ping-status');
const pingTime = document.getElementById('ping-time');
const timeoutRanges = document.getElementById('timeout-ranges');
const historyTableBody = document.getElementById('history-table-body');
const paginationInfo = document.getElementById('pagination-info');
const prevPageBtn = document.getElementById('prev-page');
const nextPageBtn = document.getElementById('next-page');
const startDateInput = document.getElementById('start-date');
const endDateInput = document.getElementById('end-date');
const filterBtn = document.getElementById('filter-btn');

// State management
let currentPage = 1;
let totalPages = 1;
let filterStartDate = null;
let filterEndDate = null;

// Timeout tracking state
let timeoutStart = null;
let activeTimeouts = [];
const TIMEOUT_THRESHOLD = 5 * 60 * 1000; // 5 minutes in milliseconds

// Chart configuration
const MAX_DATA_POINTS = 60; // Show 1 minute of data in real-time chart
let realtimeData = [];

// Set up real-time chart
const rtCtx = document.getElementById('real-time-chart').getContext('2d');
const realTimeChart = new Chart(rtCtx, {
  type: 'line',
  data: {
    datasets: [{
      label: 'Ping Time (ms)',
      data: [],
      borderColor: 'rgb(75, 192, 192)',
      tension: 0.1,
      fill: false
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        type: 'time',
        time: {
          unit: 'second',
          displayFormats: {
            second: 'HH:mm:ss'
          }
        },
        title: {
          display: true,
          text: 'Time'
        }
      },
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Ping Time (ms)'
        }
      }
    },
    animation: {
      duration: 0
    }
  }
});

// Set up historical chart
const histCtx = document.getElementById('historical-chart').getContext('2d');
const historicalChart = new Chart(histCtx, {
  type: 'line',
  data: {
    datasets: [{
      label: 'Ping Time (ms)',
      data: [],
      borderColor: 'rgb(153, 102, 255)',
      tension: 0.1,
      fill: false
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        type: 'time',
        time: {
          displayFormats: {
            minute: 'HH:mm',
            hour: 'MMM d, HH:mm'
          }
        },
        title: {
          display: true,
          text: 'Time'
        }
      },
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Ping Time (ms)'
        }
      }
    }
  }
});

// WebSocket event handlers
socket.onopen = () => {
  console.log('Connected to server');
};

socket.onmessage = (event) => {
  const pingData = JSON.parse(event.data);
  
  // Update status display
  updatePingStatus(pingData);
  
  // Update real-time chart
  updateRealTimeChart(pingData);

  // Track timeouts
  handleTimeoutTracking(pingData);
};

socket.onclose = () => {
  console.log('Disconnected from server');
  
  // If there's an active timeout when connection closes, end it
  if (timeoutStart !== null) {
    const now = new Date();
    addTimeoutRange(timeoutStart, now);
    timeoutStart = null;
  }
};

// Handle timeout tracking
function handleTimeoutTracking(pingData) {
  const currentTime = new Date(pingData.timestamp);
  
  if (pingData.status === 'failed') {
    if (timeoutStart === null) {
      timeoutStart = currentTime;
    }
  } else {
    if (timeoutStart !== null) {
      const timeoutDuration = currentTime - timeoutStart;
      if (timeoutDuration >= TIMEOUT_THRESHOLD) {
        addTimeoutRange(timeoutStart, currentTime);
      }
      timeoutStart = null;
    }
  }
}

// Add timeout range to list
function addTimeoutRange(start, end) {
  const duration = end - start;
  const minutes = Math.floor(duration / 60000);
  const seconds = Math.floor((duration % 60000) / 1000);
  
  activeTimeouts.unshift({
    start,
    end,
    duration: `${minutes}m ${seconds}s`
  });

  // Keep only last 10 timeout ranges
  if (activeTimeouts.length > 10) {
    activeTimeouts.pop();
  }

  updateTimeoutRangesDisplay();
}

// Update timeout ranges display
function updateTimeoutRangesDisplay() {
  // Update timeout count in header
  const timeoutCount = activeTimeouts.length;
  document.getElementById('timeout-count').textContent = `${timeoutCount} timeout${timeoutCount !== 1 ? 's' : ''}`;

  if (timeoutCount === 0) {
    timeoutRanges.innerHTML = `<p class="text-gray-500 text-center py-8">No timeouts longer than ${TIMEOUT_THRESHOLD/1000} seconds recorded</p>`;
    return;
  }

  const rangesList = document.createElement('div');
  rangesList.className = 'space-y-3';

  activeTimeouts.forEach((timeout, index) => {
    const range = document.createElement('div');
    range.className = 'timeout-range';
    
    const startDateTime = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(timeout.start);

    const endDateTime = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(timeout.end);

    const durationMs = timeout.end - timeout.start;
    const hours = Math.floor(durationMs / 3600000);
    const minutes = Math.floor((durationMs % 3600000) / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);

    let detailedDuration = [];
    if (hours > 0) detailedDuration.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
    if (minutes > 0) detailedDuration.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
    if (seconds > 0) detailedDuration.push(`${seconds} second${seconds !== 1 ? 's' : ''}`);
    
    range.innerHTML = `
      <div class="timeout-range-header">
        <div class="flex items-center gap-2">
          <span class="bg-red-100 text-red-600 text-sm font-medium px-2 py-1 rounded-full">
            Event #${activeTimeouts.length - index}
          </span>
          <span class="timeout-range-time">
            <svg class="timeout-range-time-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            ${startDateTime}
          </span>
        </div>
        <span class="timeout-range-duration" title="Total duration">
          ${detailedDuration.join(', ')}
        </span>
      </div>
      <div class="timeout-range-body grid grid-cols-2 gap-4 mt-3">
        <div>
          <div class="text-gray-500 text-xs uppercase tracking-wide mb-1">Start Time</div>
          <div class="font-medium">${startDateTime}</div>
        </div>
        <div>
          <div class="text-gray-500 text-xs uppercase tracking-wide mb-1">End Time</div>
          <div class="font-medium">${endDateTime}</div>
        </div>
      </div>
    `;
    
    rangesList.appendChild(range);
  });

  timeoutRanges.innerHTML = '';
  timeoutRanges.appendChild(rangesList);
}

// Update ping status in UI
function updatePingStatus(pingData) {
  if (pingData.status === 'success') {
    pingStatus.className = 'ping-status inline-block w-4 h-4 rounded-full success';
    pingTime.textContent = `${pingData.ping_time} ms`;
  } else {
    pingStatus.className = 'ping-status inline-block w-4 h-4 rounded-full failed';
    pingTime.textContent = 'Failed';
  }
}

// Update real-time chart
function updateRealTimeChart(pingData) {
  const time = new Date(pingData.timestamp);
  
  // Add new data point
  if (pingData.status === 'success') {
    realtimeData.push({
      x: time,
      y: pingData.ping_time
    });
  } else {
    // For failed pings, we could add a null or a very high value
    // Here we choose to skip adding the point
  }
  
  // Limit the number of data points
  if (realtimeData.length > MAX_DATA_POINTS) {
    realtimeData.shift();
  }
  
  // Update chart
  realTimeChart.data.datasets[0].data = realtimeData;
  realTimeChart.update();
}

// Fetch historical data
async function fetchHistoricalData() {
  let url = `/api/ping-data?page=${currentPage}`;
  
  if (filterStartDate) {
    url += `&startDate=${encodeURIComponent(filterStartDate.toISOString())}`;
  }
  
  if (filterEndDate) {
    url += `&endDate=${encodeURIComponent(filterEndDate.toISOString())}`;
  }
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.error) {
      console.error('Error fetching data:', data.error);
      return;
    }
    
    updateHistoricalChart(data.data);
    updateHistoryTable(data.data);
    updatePagination(data.pagination);
    
  } catch (error) {
    console.error('Error fetching data:', error);
  }
}

// Update historical chart
function updateHistoricalChart(data) {
  // Sort data by timestamp (oldest first)
  const sortedData = [...data].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  
  // Convert to chart format
  const chartData = sortedData
    .filter(item => item.status === 'success')
    .map(item => ({
      x: new Date(item.timestamp),
      y: item.ping_time
    }));
  
  // Update chart
  historicalChart.data.datasets[0].data = chartData;
  historicalChart.update();
}

// Update history table
function updateHistoryTable(data) {
  // Clear existing rows
  historyTableBody.innerHTML = '';
  
  // Add new rows
  data.forEach(item => {
    const row = document.createElement('tr');
    
    // Format timestamp
    const date = new Date(item.timestamp);
    const formattedDate = date.toLocaleString();
    
    // Format status
    const statusClass = item.status === 'success' ? 'text-green-600' : 'text-red-600';
    const pingTimeText = item.status === 'success' ? `${item.ping_time} ms` : 'Failed';
    
    row.innerHTML = `
      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${formattedDate}</td>
      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${item.ping_time !== null ? item.ping_time : '-'}</td>
      <td class="px-6 py-4 whitespace-nowrap text-sm ${statusClass}">${item.status}</td>
    `;
    
    historyTableBody.appendChild(row);
  });
}

// Update pagination controls
function updatePagination(pagination) {
  totalPages = pagination.pages;
  
  // Update pagination info text
  const start = (pagination.page - 1) * pagination.limit + 1;
  const end = Math.min(pagination.page * pagination.limit, pagination.total);
  paginationInfo.textContent = `Showing ${start}-${end} of ${pagination.total} entries`;
  
  // Enable/disable pagination buttons
  prevPageBtn.disabled = pagination.page <= 1;
  nextPageBtn.disabled = pagination.page >= pagination.pages;
}

// Event listeners
prevPageBtn.addEventListener('click', () => {
  if (currentPage > 1) {
    currentPage--;
    fetchHistoricalData();
  }
});

nextPageBtn.addEventListener('click', () => {
  if (currentPage < totalPages) {
    currentPage++;
    fetchHistoricalData();
  }
});

filterBtn.addEventListener('click', () => {
  // Reset to page 1 when applying new filters
  currentPage = 1;
  
  // Get filter values
  filterStartDate = startDateInput.value ? new Date(startDateInput.value) : null;
  filterEndDate = endDateInput.value ? new Date(endDateInput.value) : null;
  
  fetchHistoricalData();
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  fetchHistoricalData();
});
