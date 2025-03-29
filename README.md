# Mikrotik CHR Monitoring

Web-based monitoring system for Mikrotik CHR IP that tracks and visualizes ping responses in real-time.

## Features

- Real-time ping monitoring
- Historical data visualization
- Response time graphs
- Filterable date ranges
- Pagination for historical data

## Prerequisites

- Node.js (v18 or higher)
- npm
- PM2 (for production deployment)

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Application Configuration
APP_TITLE=Mikrotik CHR Monitoring
APP_PORT=3000

# Monitoring Configuration
MIKROTIK_IP=192.168.90.3
PING_INTERVAL=1000 # in milliseconds
```

## Installation

1. Clone the repository:
```bash
git clone [repository-url]
cd pingMikrotik
```

2. Install dependencies:
```bash
npm install
```

3. Install PM2 globally (if not already installed):
```bash
npm install -g pm2
```

4. Build the CSS:
```bash
npm run build:css
```

## Development

To run the application in development mode:

```bash
# Watch for CSS changes
npm run watch:css

# In another terminal, run the server
npm run dev
```

The application will be available at `http://localhost:3000`

## Production Deployment with PM2

1. Build the CSS for production:
```bash
npm run build:css
```

2. Start the application with PM2:
```bash
pm2 start server.js --name "mikrotik-monitor"
```

### PM2 Common Commands

- View logs:
```bash
pm2 logs mikrotik-monitor
```

- View status:
```bash
pm2 status
```

- Restart application:
```bash
pm2 restart mikrotik-monitor
```

- Stop application:
```bash
pm2 stop mikrotik-monitor
```

- Enable startup script (auto-start on system reboot):
```bash
pm2 startup
pm2 save
```

## Available Scripts

- `npm start` - Start the server
- `npm run dev` - Start the server in development mode with nodemon
- `npm run build:css` - Build and minify CSS for production
- `npm run watch:css` - Watch and rebuild CSS on changes

## Project Structure

```
pingMikrotik/
├── public/
│   ├── css/
│   │   └── style.css     # Built Tailwind CSS
│   ├── js/
│   │   └── app.js        # Frontend JavaScript
│   └── index.html        # Main HTML file
├── src/
│   └── input.css         # Tailwind source CSS
├── server.js             # Express server
├── tailwind.config.js    # Tailwind configuration
├── postcss.config.js     # PostCSS configuration
└── package.json
