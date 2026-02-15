# Stock Dashboard - Development Documentation

## Project Overview

A personalized Chrome home page that displays stock information with charts and moving averages. Client-side only, using localStorage for preferences. Built for a 25-year investment time horizon.

**Tech Stack:**
- Pure vanilla HTML/CSS/JavaScript (no frameworks)
- Yahoo Finance API (via proxy)
- Chart.js for visualization
- Python HTTP server with proxy
- localStorage for persistence

## Architecture Decisions

### Why Yahoo Finance?

**Initial attempts:**
1. **Finnhub** - Free tier looked good (60 calls/min) but historical candle data is premium-only (403 errors)
2. **Alpha Vantage** - Has historical data but only 5 calls/min (too slow)
3. **Yahoo Finance** - Unofficial API, no key needed, has all data we need ✅

**Trade-offs:**
- No API key = simpler setup
- Unofficial API = could break if Yahoo changes it
- Good enough for personal use

### Why a Proxy Server?

**Problem:** Yahoo Finance blocks requests from `file://` URLs (CORS)

**Solution:** Python HTTP server that:
- Serves static files (HTML/CSS/JS)
- Proxies `/api/stock/SYMBOL` requests to Yahoo Finance
- Adds CORS headers server-side

**Files:**
- `server.py` - Custom HTTP server with proxy
- `start-background.sh` - Easy startup script
- `stop-server.sh` - Easy shutdown script

### Data Architecture

**Two API calls per stock:**
1. **Daily data** (1 month, 1d interval) - For current price, daily %, weekly %
2. **Weekly data** (4 years, 1wk interval) - For chart and moving averages

**Why separate calls:**
- Daily data: Fast, recent, accurate for current metrics
- Weekly data: Longer timeframe for chart and MA calculations
- Cached for 5 minutes to reduce API load

**Data flow:**
```
Browser -> api.js -> /api/stock/AAPL -> server.py -> Yahoo Finance
                                                    ↓
Browser <- Processed data <- Cache (5min) <- Raw JSON
```

## Key Features

### 1. Stock Cards with Custom Widths

**Syntax:** Add stocks with `:N` suffix for width
- `AAPL` → 1 block (280px)
- `AAPL:2` → 2 blocks (560px)
- `AAPL:3` → 3 blocks (840px)
- `AAPL:4` → 4 blocks (1120px)

**Storage:** Saved as `"AAPL:2"` in localStorage `stock_list` array

**Implementation:**
- Parse format in `parseStockEntry()` helper
- Set inline `style.width` when creating cards
- Standard width: 280px per block

**Width calculation:**
- Dynamically calculates based on stock count: `baseWidth * width`
- Base width: 240px in many-stocks mode (>6 stocks), 280px otherwise
- Box-sizing: border-box handles borders automatically
- Must match CSS media query logic for consistency

### 2. Drag & Drop Reordering

**How it works:**
- Cards are draggable (HTML5 drag API)
- Click and drag any card to reorder
- Visual feedback: dragging card becomes transparent, drop target shows blue border
- On drop: Updates `stockList` array and reorders DOM elements **without re-fetching data**
- Order persists in localStorage

**Implementation details:**
- Uses dataset.symbol to track which card is which
- Finds entry in stockList by parsing symbol (handles width notation)
- DOM manipulation only - no re-render = no loading states

**Drag handle:** `⋮⋮` icon next to symbol (visual indicator)

### 3. Expand/Collapse Cards

**How to use:**
- Click on the percentage area (e.g., `▲ 2.5%`) to toggle
- Collapsed: Hides chart and MA percentages
- Expanded: Shows everything

**Visual indicators:**
- Small chevron: `▼` (expanded) or `◀` (collapsed)
- Subtle hover effect on metrics area

**State persistence:**
- Saved in localStorage as `collapsed_stocks` array
- Contains symbol names (e.g., `["AAPL", "TSLA"]`)
- Each stock independently collapsible

**Use case:** Compact view when tracking many stocks

### 4. Moving Averages

**Chart display:**
- 50-week MA shown as orange line overlay
- Weekly price data from ~2021 (4 years)

**Bottom metrics:**
- **50W MA %** (orange) - Distance from 50-week moving average
- **200W MA %** (yellow) - Distance from 200-week moving average
- Positive % = price above MA (bullish)
- Negative % = price below MA (bearish)

**Why these MAs:**
- 50-week (~1 year): Medium-term trend
- 200-week (~4 years): Long-term secular trend
- For 25-year horizon, these provide context without daily noise

**Calculation:**
- 50W MA: Calculated as array for chart line
- 200W MA: Single value only (no line drawn)
- Uses simple moving average (SMA)

### 5. Metrics Priority

**Primary (large):** Daily % change
- `▲ 2.37%` or `▼ -1.45%`
- Today vs yesterday's close
- Most important for monitoring

**Secondary (smaller):** Current price + Weekly % change
- `255.78  ▲ 0.24% (7d)`
- 7-day performance context

**Bottom:** MA comparisons
- Long-term positioning vs trend lines

## Technical Implementation Details

### Data Accuracy Issues Encountered

**Problem 1: Wrong previous close**
- Yahoo's `chartPreviousClose` = close from start of range (1 month ago)
- **Fix:** Use `closePrices[closePrices.length - 2]` (yesterday's close from time series)

**Problem 2: Comparing current to today's close**
- Was showing 0% for all stocks
- **Fix:** Use second-to-last element, not last element

**Problem 3: Daily % showing as -26%**
- Was comparing to wrong baseline
- **Current solution:** Second-to-last close price from daily data

### Chart Implementation

**Library:** Chart.js v4.4.0 (CDN)

**Configuration:**
- Type: line
- Responsive: true
- No axes, no grid (clean look)
- Hover tooltips show price
- Tension: 0.3 (smooth curves)
- Fill: subtle gradient under line

**Color logic:**
- Green if overall uptrend (first vs last price)
- Red if overall downtrend
- 50W MA: Orange (#f59e0b)

**Performance:**
- One chart instance per stock
- Stored in `this.charts` Map
- Destroyed before re-creating (prevents memory leaks)

### localStorage Schema

```javascript
{
  "stock_list": ["AAPL", "GOOGL:2", "MSFT", "TSLA:3"],
  "collapsed_stocks": ["MSFT"],
  "finnhub_api_key": null  // Legacy, not used
}
```

**Note:** No API key needed for Yahoo Finance, but field exists from Finnhub attempt

### Rate Limiting

**Current:** 500ms delay between requests
**Yahoo limit:** Unknown (unofficial API)
**Strategy:**
- Conservative delay to be respectful
- 5-minute cache reduces repeated calls
- Queue requests to avoid parallel spam

### Styling Architecture

**Theme:** Dark minimalist
- Background: #1a1a1a
- Cards: #242424
- Borders: #333
- Text: #fff, #aaa, #666

**Layout:**
- Flexbox grid with wrap
- Fixed card width (280px)
- Horizontal scrolling if needed
- Responsive (mobile stacks vertically)

**Card structure:**
```
┌─────────────────────────┐
│ ⋮⋮ SYMBOL           [×] │ ← Header (drag handle + remove)
│ ▲ 2.37% ▼              │ ← Metrics (clickable to collapse)
│ 255.78  ▲ 0.24% (7d)   │
│ ┌───────────────────┐   │
│ │     Chart         │   │ ← Hidden when collapsed
│ └───────────────────┘   │
│ ▲ +7.5% (50W) ▲ +33% (200W) │ ← Hidden when collapsed
└─────────────────────────┘
```

## Known Issues & Quirks

### 1. Card Width Alignment (FIXED)

**Issue:** Multi-width cards (`:2`, `:3`) didn't align with stacked single cards

**Root cause:**
- CSS has "many-stocks" mode that changes base width from 280px → 240px when >6 stocks
- JavaScript was hardcoded to always use 280px, causing misalignment in many-stocks mode

**Solution:** Dynamic base width calculation
```javascript
const baseWidth = this.stockList.length > 6 ? 240 : 280;
card.style.width = `${baseWidth * width}px`;
```

**Key learning:** When CSS has responsive/conditional sizing, JavaScript must mirror that logic

**Debug approach if issues recur:**
```javascript
// Check actual rendered widths in console
document.querySelectorAll('.stock-card').forEach(c => {
    console.log(c.dataset.symbol, c.getBoundingClientRect().width);
});
```

### 2. Cache Invalidation

**Issue:** Browser caches JavaScript aggressively

**Solution:** Hard refresh (`Cmd + Shift + R`) after code changes

**Better solution (future):**
- Add version query param: `app.js?v=timestamp`
- Or use service worker for cache control

### 3. Yahoo Finance API Reliability

**Risk:** Unofficial API could break anytime

**Mitigation:**
- Graceful error handling
- Error messages show on cards
- Easy to switch to different API (just update `api.js`)

**Backup plan:** Could switch to Alpha Vantage with slower refresh rate

### 4. Market Hours

**Current:** Shows "current" price from Yahoo
**Reality:** Only updates during market hours
**After hours:** May show stale data

**Not fixed:** Out of scope for personal dashboard

## Development History Highlights

### Major Iterations

1. **Initial Plan:** Finnhub with 60/min rate limit
2. **Pivot 1:** Finnhub blocked historical data (premium only)
3. **Pivot 2:** Tried Alpha Vantage (too slow - 5/min)
4. **Final:** Yahoo Finance via proxy (perfect fit)

### Feature Evolution

**Moving Averages:**
- Started with 20-day MA (too short-term)
- Added 50-week MA (good medium-term)
- Added 200-week MA value (long-term positioning)
- Removed 200W line from chart (too cluttered)
- Show MA as % difference instead of absolute values

**Layout:**
- Started with card grid (purple gradient background)
- Evolved to horizontal ticker (dark minimalist)
- Added drag-drop (user request)
- Added collapse (compact view)
- Added custom widths (flexible layout)

### Design Philosophy Changes

**Initial:** Feature-rich dashboard with everything visible
**Current:** Minimalist, user-controlled information density

**Key insight:** For 25-year horizon, daily noise matters less than positioning vs long-term trends

## Future Enhancement Ideas

### High Priority

- [ ] Auto-refresh toggle (every 5/15/30 minutes)
- [ ] Keyboard shortcuts (arrow keys to navigate, space to collapse, etc.)
- [ ] Export/import stock list (share configurations)
- [ ] Dark/light theme toggle
- [ ] Search/filter when many stocks

### Medium Priority

- [ ] Crypto support (BTC-USD, ETH-USD format)
- [ ] Index funds (^GSPC for S&P 500)
- [ ] Currency pairs (EUR/USD)
- [ ] News headlines per stock (via separate API)
- [ ] Earnings calendar indicator
- [ ] Dividend yield display

### Low Priority

- [ ] Portfolio tracking (shares owned, cost basis)
- [ ] Performance attribution
- [ ] Correlation matrix between stocks
- [ ] Sector breakdown
- [ ] Alerts/notifications

### Technical Improvements

- [ ] Service worker for offline support
- [ ] PWA manifest (install as app)
- [ ] Compress API responses
- [ ] Lazy load charts (render on scroll)
- [ ] WebSocket for real-time updates (if available)
- [ ] Unit tests (Jest + Testing Library)

## Setup for New Developers

### Quick Start

```bash
cd /Users/kasra.zahir/code/stock-dashboard
./start-background.sh
open http://localhost:8000
```

### Development Workflow

1. **Edit files:** HTML/CSS/JS changes are instant
2. **Server changes:** Restart server with `./stop-server.sh && ./start-background.sh`
3. **Clear cache:** Hard refresh browser (`Cmd + Shift + R`)
4. **Test:** Add/remove stocks, drag, collapse, check alignment

### Code Organization

```
stock-dashboard/
├── index.html          # Structure - minimal, clean
├── styles.css          # All styling - dark theme, responsive
├── app.js              # Main logic - DOM manipulation, events
├── api.js              # Data fetching - Yahoo Finance integration
├── server.py           # Proxy server - CORS workaround
├── start-background.sh # Startup helper
├── stop-server.sh      # Shutdown helper
├── README.md           # User documentation
└── DEVELOPMENT.md      # This file
```

### Key Functions to Know

**app.js:**
- `addStock()` - Parse symbol with width, validate, add to list
- `removeStock()` - Remove from list and DOM
- `parseStockEntry()` - Parse "SYMBOL:WIDTH" format
- `createStockCard()` - Build card DOM with all event listeners
- `toggleCardCollapse()` - Show/hide chart and MA info
- `handleDrop()` - Drag-drop reordering logic

**api.js:**
- `fetchStockData()` - Get both daily and weekly data
- `getStockData()` - Process raw data into clean format
- `calculateMovingAverageArray()` - MA for chart overlay
- `calculateMovingAverage()` - Single MA value

### Debugging Tips

**Check API responses:**
```bash
curl http://localhost:8000/api/stock/AAPL | python3 -m json.tool
```

**Check localStorage:**
```javascript
console.log(localStorage.getItem('stock_list'));
console.log(localStorage.getItem('collapsed_stocks'));
```

**Clear localStorage:**
```javascript
localStorage.clear();
location.reload();
```

**Check card widths:**
```javascript
document.querySelectorAll('.stock-card').forEach(c => {
    const w = c.getBoundingClientRect().width;
    console.log(`${c.dataset.symbol} (${c.dataset.width}x): ${w}px`);
});
```

## Company Policy Compliance

✅ **Lightweight** - No servers beyond local Python (no daemons)
✅ **No company data** - Only public market data
✅ **No unapproved installs** - Pure HTML/CSS/JS + Python (standard dev tools)
✅ **Credentials hygiene** - No API keys stored
✅ **Network safe** - Simple GET requests to public APIs

**Approved for personal use on company machines.**

## Contributing

When making changes:

1. **Test thoroughly** - Multiple stocks, different widths, collapse/expand
2. **Check alignment** - Especially multi-width cards
3. **Clear cache** - Hard refresh after changes
4. **Update this doc** - If architecture changes
5. **Keep it simple** - Vanilla JS, no build tools, no complexity

## Contact & Support

This is a personal project. For issues:
1. Check browser console for errors
2. Check server.log for API issues
3. Try hard refresh / clear cache
4. Restart server
5. Check Yahoo Finance is accessible

---

**Last updated:** 2026-02-13 (width alignment fix)
**Status:** Production ready, actively used
**Maintainer:** Personal project
