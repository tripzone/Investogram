# Chart Rules

## Animation Policy

**ALL CHARTS MUST HAVE `animation: false`**

When creating any Chart.js instance, always include `animation: false` in the options:

```javascript
const chart = new Chart(ctx, {
    type: 'bar', // or 'line', 'candlestick', etc.
    data: { ... },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,  // ← REQUIRED: No animations
        plugins: { ... },
        scales: { ... }
    }
});
```

## Why?

- Instant data visualization (no delays)
- Better performance
- No distracting transitions
- Cleaner user experience

## Current Charts

All existing charts have this rule applied:
1. ✅ Asset Allocation (app.js:977)
2. ✅ Category Allocation (app.js:1256)
3. ✅ Market Activity (app.js:1573)
4. ✅ Stock Price Chart (app.js:2421)
5. ✅ Candlestick Modal Chart (app.js:3034)
