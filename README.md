# Stock Dashboard - Personal Chrome Home Page

A lightweight, client-side stock tracking dashboard that displays real-time stock information with charts and moving averages. Perfect for use as a Chrome home page.

## Features

- 📊 Real-time stock quotes with daily % change
- 📈 7-day price trend charts
- 📉 20-day moving average comparison
- 💾 Local storage for preferences (no server needed)
- 🔄 Manual refresh with smart caching (5 minutes)
- ➕ Easy add/remove stocks
- 📱 Responsive design
- 🆓 **No API key required!** Uses Yahoo Finance

## Setup Instructions

### Quick Start

**Option 1: Using the startup script (Recommended)**
```bash
cd /Users/kasra.zahir/code/stock-dashboard
./start.sh
```

**Option 2: Manual server start**
```bash
cd /Users/kasra.zahir/code/stock-dashboard
python3 -m http.server 8000
# Then open http://localhost:8000 in your browser
```

**Why a local server?** Yahoo Finance blocks requests from `file://` URLs due to CORS security. Running a local server (http://localhost) solves this.

No API key, no sign-up, no configuration needed.

### Set as Chrome Home Page

1. Start the server: `./start.sh` (in the stock-dashboard directory)
2. Open Chrome Settings (`chrome://settings/`)
3. Go to "On startup" section
4. Select "Open a specific page or set of pages"
5. Click "Add a new page"
6. Enter: `http://localhost:8000`

**Note:** The local server needs to be running for the dashboard to work. You can:
- Run `./start.sh` in a terminal when you start your computer
- Or set up the script to run automatically at login (see "Auto-start on Login" below)

### Auto-start on Login (Optional)

To automatically start the server when you log in:

**macOS:**
1. Open System Preferences → Users & Groups
2. Click "Login Items"
3. Click "+" and add Terminal
4. Or create a LaunchAgent (advanced - see online guides)

## Usage

### Adding Stocks
1. Type a stock symbol in the input field (e.g., `AAPL`, `TSLA`, `GOOGL`)
2. Click "Add Stock" or press Enter
3. The stock card will appear with live data

### Removing Stocks
1. Click the "×" button on any stock card
2. Confirm the removal

### Refreshing Data
1. Click "🔄 Refresh All" to update all stocks
2. Data is cached for 5 minutes to improve performance

## Technical Details

### File Structure
```
stock-dashboard/
├── index.html          # Main HTML structure
├── styles.css          # Styling and responsive design
├── app.js              # Application logic and DOM manipulation
├── api.js              # Yahoo Finance API integration
└── README.md           # This file
```

### Technologies Used
- **HTML/CSS/JavaScript**: Pure vanilla JS, no frameworks
- **Chart.js**: Lightweight charting library
- **Yahoo Finance API**: Free, no API key required
- **localStorage**: Client-side storage for stock list

### Data Displayed
- **Current Price**: Real-time stock price
- **Daily Change**: $ and % change from previous close
- **7-Day Chart**: Line chart showing last week's price trend (market days)
- **20-Day MA**: Moving average with comparison to current price

### Performance
- Requests are queued with 500ms delays to be respectful to Yahoo's servers
- Responses cached for 5 minutes
- Fast loading: 4 stocks load in ~2-3 seconds

### Security & Privacy
- ✅ No API key needed
- ✅ All data processing happens client-side
- ✅ No personal data collected or transmitted
- ✅ No external dependencies beyond Chart.js CDN and Yahoo Finance API
- ✅ Stock list stored only in your browser's localStorage

## Company Policy Compliance

This project complies with standard corporate security policies:

- **✅ Lightweight**: No servers, daemons, or background processes
- **✅ No company data**: Only public market data from third-party APIs
- **✅ No unapproved installs**: Pure HTML/CSS/JS, runs in browser
- **✅ No credentials**: No API keys or authentication required
- **✅ Network safe**: Simple GET requests to public APIs

## Troubleshooting

### Stock Not Found
- **Problem**: "Could not find stock" error
- **Solution**: Verify the stock symbol is correct. Use ticker symbols like `AAPL`, not company names. Try searching the symbol on Yahoo Finance first.

### Charts Not Displaying
- **Problem**: Chart.js not loading
- **Solution**: Check internet connection (Chart.js loads from CDN)

### Data Not Refreshing
- **Problem**: Old data showing
- **Solution**: Click "🔄 Refresh All" to clear cache and fetch new data

### Slow Loading
- **Problem**: Stocks loading slowly
- **Solution**: This is normal - requests are queued with delays to respect Yahoo's servers. Each stock takes ~500ms to load.

## Customization

### Default Stocks
Edit `app.js` line 19 to change default stocks:
```javascript
this.stockList = ['AAPL', 'GOOGL', 'MSFT', 'TSLA']; // Change these
```

### Moving Average Period
Edit `api.js` line 129 to change MA period:
```javascript
const ma20Prices = closePrices.slice(-20); // Change -20 to desired period
```

### Cache Duration
Edit `api.js` line 9 to change cache timeout:
```javascript
this.cacheTimeout = 5 * 60 * 1000; // 5 minutes in milliseconds
```

### Request Delay
Edit `api.js` line 7 to change delay between requests:
```javascript
this.requestDelay = 500; // 500ms between requests
```

## Known Limitations

- **Data Source**: Uses Yahoo Finance's unofficial API, which could change
- **Market Hours**: Data updates during market hours; delayed after hours
- **Historical Data**: Limited to ~1 month of historical data
- **Symbols**: Only works with symbols available on Yahoo Finance

## Future Enhancements

Potential features to add:
- [ ] Auto-refresh toggle with interval
- [ ] Different MA periods (50, 200-day)
- [ ] Crypto support (BTC-USD, ETH-USD)
- [ ] Dark mode
- [ ] Export/import stock lists
- [ ] Drag-and-drop reordering
- [ ] News headlines per stock
- [ ] Earnings calendar
- [ ] Watchlist alerts

## Credits

- Stock data: [Yahoo Finance](https://finance.yahoo.com)
- Charts: [Chart.js](https://www.chartjs.org)
- Built with vanilla JavaScript

## License

This project is provided as-is for personal use. Yahoo Finance API usage subject to their terms of service.

---

**Enjoy your stock dashboard!** 📈
