// Main Application Logic

class StockDashboard {
    constructor() {
        this.stockList = this.loadStockList();
        this.charts = new Map();
        this.candlestickChart = null;
        this.currentModalSymbol = null;
        this.currentModalRange = null;
        this.currentModalInterval = null;
        this.maVisibility = {}; // Store moving average visibility state
        this.init();
    }

    init() {
        // Yahoo Finance doesn't need API key, so skip prompt
        // Set up event listeners
        this.setupEventListeners();

        // Load initial stocks
        if (this.stockList.length === 0) {
            // Default stocks
            this.stockList = ['AAPL', 'GOOGL', 'MSFT', 'TSLA'];
            this.saveStockList();
        }

        this.renderAllStocks();
    }

    setupEventListeners() {
        // Add stock button
        document.getElementById('addStockBtn').addEventListener('click', () => {
            this.addStock();
        });

        // Enter key in input
        document.getElementById('stockInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.addStock();
            }
        });

        // Refresh button
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.refreshAllStocks();
        });

        // Collapse all button
        document.getElementById('collapseAllBtn').addEventListener('click', () => {
            this.collapseAllCards();
        });

        // Expand all button
        document.getElementById('expandAllBtn').addEventListener('click', () => {
            this.expandAllCards();
        });

        // Settings button - remove API key option
        const settingsBtn = document.getElementById('settingsBtn');
        if (settingsBtn) {
            settingsBtn.style.display = 'none'; // Hide settings since no API key needed
        }

        // Modal close button
        document.getElementById('modalCloseBtn').addEventListener('click', () => {
            this.closeModal();
        });

        // Close modal when clicking outside
        document.getElementById('candlestickModal').addEventListener('click', (e) => {
            if (e.target.id === 'candlestickModal') {
                this.closeModal();
            }
        });

        // Close modal with ESC key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
            }
        });

        // Period selector buttons
        document.querySelectorAll('.period-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const range = e.target.dataset.range;
                const interval = this.getDefaultInterval(range);

                this.currentModalRange = range;
                this.currentModalInterval = interval;

                this.loadCandlestickData(this.currentModalSymbol, range, interval);

                // Update active states
                document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');

                // Update interval buttons based on valid intervals for this range
                this.updateIntervalButtons(range, interval);
            });
        });

        // Interval selector buttons
        document.querySelectorAll('.interval-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const interval = e.target.dataset.interval;

                // Only load data if a period is already selected and interval is valid
                if (this.currentModalRange && !e.target.disabled) {
                    this.currentModalInterval = interval;
                    this.loadCandlestickData(this.currentModalSymbol, this.currentModalRange, interval);

                    // Update active state
                    document.querySelectorAll('.interval-btn').forEach(b => b.classList.remove('active'));
                    e.target.classList.add('active');
                }
            });
        });
    }

    getDefaultInterval(range) {
        // Default intervals based on range
        const defaults = {
            '6mo': '1d',
            '1y': '1d',
            '5y': '1wk',
            '10y': '1mo',
            'max': '1mo'
        };
        return defaults[range] || '1d';
    }

    getValidIntervals(range) {
        // Valid intervals for each range based on Yahoo Finance API limitations
        const validIntervals = {
            '6mo': ['1d', '1wk', '1mo'],
            '1y': ['1d', '1wk', '1mo'],
            '5y': ['1d', '1wk', '1mo'],
            '10y': ['1wk', '1mo'],  // Daily not available for 10y
            'max': ['1mo']  // Only monthly available for all time
        };
        return validIntervals[range] || ['1d', '1wk', '1mo'];
    }

    updateIntervalButtons(range, activeInterval) {
        const validIntervals = this.getValidIntervals(range);

        document.querySelectorAll('.interval-btn').forEach(btn => {
            const interval = btn.dataset.interval;
            const isValid = validIntervals.includes(interval);

            if (isValid) {
                btn.disabled = false;
                btn.classList.remove('disabled');
                if (interval === activeInterval) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            } else {
                btn.disabled = true;
                btn.classList.add('disabled');
                btn.classList.remove('active');
            }
        });
    }

    loadStockList() {
        const saved = localStorage.getItem('stock_list');
        return saved ? JSON.parse(saved) : [];
    }

    saveStockList() {
        localStorage.setItem('stock_list', JSON.stringify(this.stockList));
        this.updateEmptyState();
    }

    updateEmptyState() {
        const emptyState = document.getElementById('emptyState');
        const stockGrid = document.getElementById('stockGrid');

        if (this.stockList.length === 0) {
            emptyState.classList.remove('hidden');
            stockGrid.classList.add('hidden');
        } else {
            emptyState.classList.add('hidden');
            stockGrid.classList.remove('hidden');
        }
    }

    async addStock() {
        const input = document.getElementById('stockInput');
        let inputValue = input.value.trim().toUpperCase();

        if (!inputValue) {
            alert('Please enter a stock symbol');
            return;
        }

        // Parse symbol and optional width (e.g., "AAPL:2" or "AAPL")
        let symbol, width = 1;
        if (inputValue.includes(':')) {
            const parts = inputValue.split(':');
            symbol = parts[0];
            width = parseInt(parts[1]) || 1;
            // Limit width to reasonable range
            width = Math.max(1, Math.min(width, 6));
        } else {
            symbol = inputValue;
        }

        // Check if symbol already exists (with any width)
        const existingEntry = this.stockList.find(entry => this.parseStockEntry(entry).symbol === symbol);
        if (existingEntry) {
            alert('Stock already added');
            input.value = '';
            return;
        }

        // Validate symbol by fetching data
        try {
            input.disabled = true;
            document.getElementById('addStockBtn').disabled = true;

            await stockAPI.getStockData(symbol);

            // Store with width if > 1
            const entry = width > 1 ? `${symbol}:${width}` : symbol;
            this.stockList.push(entry);
            this.saveStockList();
            this.renderStock(entry);

            input.value = '';
        } catch (error) {
            alert(`Error: Could not find stock "${symbol}". Please check the symbol and try again.`);
        } finally {
            input.disabled = false;
            document.getElementById('addStockBtn').disabled = false;
        }
    }

    parseStockEntry(entry) {
        if (entry.includes(':')) {
            const parts = entry.split(':');
            return { symbol: parts[0], width: parseInt(parts[1]) || 1 };
        }
        return { symbol: entry, width: 1 };
    }

    removeStock(symbol) {
        if (!confirm(`Remove ${symbol} from dashboard?`)) {
            return;
        }

        // Remove entry that matches the symbol (regardless of width)
        this.stockList = this.stockList.filter(entry => {
            const parsed = this.parseStockEntry(entry);
            return parsed.symbol !== symbol;
        });
        this.saveStockList();

        const card = document.getElementById(`stock-${symbol}`);
        if (card) {
            card.remove();
        }

        // Destroy chart
        if (this.charts.has(symbol)) {
            this.charts.get(symbol).destroy();
            this.charts.delete(symbol);
        }
    }

    renderAllStocks() {
        const grid = document.getElementById('stockGrid');
        grid.innerHTML = '';

        // Add class for many stocks to make them more compact
        if (this.stockList.length > 6) {
            grid.classList.add('many-stocks');
        } else {
            grid.classList.remove('many-stocks');
        }

        this.stockList.forEach(entry => {
            this.renderStock(entry);
        });

        this.updateEmptyState();
    }

    refreshAllStocks() {
        // Clear cache
        stockAPI.cache.clear();

        // Re-render all stocks
        this.renderAllStocks();
    }

    async renderStock(entry) {
        const { symbol, width } = this.parseStockEntry(entry);
        const grid = document.getElementById('stockGrid');

        // Create card element
        const card = this.createStockCard(symbol, width);
        grid.appendChild(card);

        try {
            // Fetch data
            const data = await stockAPI.getStockData(symbol);

            // Update card with data
            this.updateStockCard(symbol, data);
        } catch (error) {
            this.showCardError(symbol, error.message);
        }
    }

    createStockCard(symbol, width = 1) {
        const card = document.createElement('div');
        card.className = 'stock-card loading';
        card.id = `stock-${symbol}`;
        card.draggable = true;
        card.dataset.symbol = symbol;
        card.dataset.width = width;

        // Check if this card should be collapsed
        const collapsedStocks = this.getCollapsedStocks();
        if (collapsedStocks.includes(symbol)) {
            card.classList.add('collapsed');
        }

        // Set width based on multiplier - match actual single card widths
        if (width > 1) {
            // Determine base width: 240px in many-stocks mode (>6 stocks), 280px otherwise
            const baseWidth = this.stockList.length > 6 ? 240 : 280;
            // Simply multiply base width (box-sizing: border-box includes everything)
            card.style.width = `${baseWidth * width}px`;
        }

        card.innerHTML = `
            <div class="stock-header">
                <div class="stock-symbol">
                    <span class="drag-handle">⋮⋮</span>
                    ${symbol}
                </div>
                <button class="remove-btn" onclick="dashboard.removeStock('${symbol}')">×</button>
            </div>
            <div class="stock-metrics" data-symbol="${symbol}">
                <div class="primary-metric">Loading...</div>
                <div class="secondary-metrics"></div>
            </div>
            <div class="chart-container">
                <canvas id="chart-${symbol}"></canvas>
            </div>
            <div class="ma-info">
                <span class="ma-comparison">Loading...</span>
            </div>
        `;

        // Add click handler to toggle collapse on the metrics area
        const metricsArea = card.querySelector('.stock-metrics');
        metricsArea.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent drag from triggering
            this.toggleCardCollapse(symbol);
        });

        // Add drag event listeners
        card.addEventListener('dragstart', (e) => this.handleDragStart(e));
        card.addEventListener('dragover', (e) => this.handleDragOver(e));
        card.addEventListener('drop', (e) => this.handleDrop(e));
        card.addEventListener('dragend', (e) => this.handleDragEnd(e));
        card.addEventListener('dragenter', (e) => this.handleDragEnter(e));
        card.addEventListener('dragleave', (e) => this.handleDragLeave(e));

        return card;
    }

    getCollapsedStocks() {
        const saved = localStorage.getItem('collapsed_stocks');
        return saved ? JSON.parse(saved) : [];
    }

    saveCollapsedStocks(collapsedStocks) {
        localStorage.setItem('collapsed_stocks', JSON.stringify(collapsedStocks));
    }

    toggleCardCollapse(symbol) {
        const card = document.getElementById(`stock-${symbol}`);
        if (!card) return;

        const collapsedStocks = this.getCollapsedStocks();
        const isCollapsed = card.classList.contains('collapsed');

        if (isCollapsed) {
            // Expand
            card.classList.remove('collapsed');
            const index = collapsedStocks.indexOf(symbol);
            if (index > -1) {
                collapsedStocks.splice(index, 1);
            }
        } else {
            // Collapse
            card.classList.add('collapsed');
            if (!collapsedStocks.includes(symbol)) {
                collapsedStocks.push(symbol);
            }
        }

        this.saveCollapsedStocks(collapsedStocks);
    }

    collapseAllCards() {
        const collapsedStocks = [];

        // Get all stock symbols and collapse them
        this.stockList.forEach(entry => {
            const { symbol } = this.parseStockEntry(entry);
            const card = document.getElementById(`stock-${symbol}`);
            if (card) {
                card.classList.add('collapsed');
                collapsedStocks.push(symbol);
            }
        });

        this.saveCollapsedStocks(collapsedStocks);
    }

    expandAllCards() {
        // Get all stock symbols and expand them
        this.stockList.forEach(entry => {
            const { symbol } = this.parseStockEntry(entry);
            const card = document.getElementById(`stock-${symbol}`);
            if (card) {
                card.classList.remove('collapsed');
            }
        });

        // Clear collapsed stocks list
        this.saveCollapsedStocks([]);
    }

    updateStockCard(symbol, data) {
        const card = document.getElementById(`stock-${symbol}`);
        if (!card) return;

        card.classList.remove('loading');

        // Update primary metric (daily change %)
        const primaryMetric = card.querySelector('.primary-metric');
        const arrow = data.isPositive ? '▲' : '▼';
        primaryMetric.className = `primary-metric ${data.isPositive ? 'positive' : 'negative'}`;
        primaryMetric.textContent = `${arrow} ${data.dayChangePercent}%`;

        // Update secondary metrics (price and weekly change)
        const secondaryMetrics = card.querySelector('.secondary-metrics');
        const weeklyArrow = data.isWeeklyPositive ? '▲' : '▼';
        secondaryMetrics.innerHTML = `
            <span class="price-value">${data.currentPrice}</span>
            <span class="weekly-change ${data.isWeeklyPositive ? 'positive' : 'negative'}">${weeklyArrow} ${data.weeklyChangePercent}% (7d)</span>
        `;


        // Update MA info - show % difference from 50W and 200W MAs
        const maInfo = card.querySelector('.ma-info');
        const vsMA50 = parseFloat(data.vsMA50);
        const vsMA200 = parseFloat(data.vsMA200);

        maInfo.innerHTML = `
            <span class="ma-comparison ma-50 ${vsMA50 >= 0 ? 'above' : 'below'}">
                ${vsMA50 >= 0 ? '▲' : '▼'} ${vsMA50 >= 0 ? '+' : ''}${vsMA50}% <span class="ma-period">(50W)</span>
            </span>
            <span class="ma-comparison ma-200 ${vsMA200 >= 0 ? 'above' : 'below'}">
                ${vsMA200 >= 0 ? '▲' : '▼'} ${vsMA200 >= 0 ? '+' : ''}${vsMA200}% <span class="ma-period">(200W)</span>
            </span>
        `;

        // Create chart
        this.createChart(symbol, data);
    }

    createChart(symbol, data) {
        const canvas = document.getElementById(`chart-${symbol}`);
        if (!canvas) return;

        // Destroy existing chart if any
        if (this.charts.has(symbol)) {
            this.charts.get(symbol).destroy();
        }

        const ctx = canvas.getContext('2d');

        // Determine color based on position relative to 200-week MA
        // Green if above 200W MA (bullish), red if below (bearish)
        const isUptrend = parseFloat(data.vsMA200) >= 0;

        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: Array(data.chartPrices.length).fill(''), // No labels
                datasets: [
                    {
                        label: 'Price',
                        data: data.chartPrices,
                        borderColor: isUptrend ? '#48bb78' : '#f56565',
                        backgroundColor: isUptrend ? 'rgba(72, 187, 120, 0.05)' : 'rgba(245, 101, 101, 0.05)',
                        borderWidth: 1.5,
                        tension: 0.3,
                        fill: true,
                        pointRadius: 0,
                        pointHoverRadius: 3,
                        pointHoverBackgroundColor: isUptrend ? '#48bb78' : '#f56565',
                        order: 1
                    },
                    {
                        label: '50-Week MA',
                        data: data.chartMA50,
                        borderColor: '#f59e0b',
                        backgroundColor: 'transparent',
                        borderWidth: 1.5,
                        tension: 0.3,
                        fill: false,
                        pointRadius: 0,
                        pointHoverRadius: 3,
                        pointHoverBackgroundColor: '#f59e0b',
                        order: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                onClick: (event, activeElements, chart) => {
                    // Open candlestick modal when chart is clicked
                    this.openCandlestickModal(symbol);
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: '#1a1a1a',
                        borderColor: '#333',
                        borderWidth: 1,
                        callbacks: {
                            label: function(context) {
                                const label = context.dataset.label || '';
                                return `${label}: $${context.parsed.y.toFixed(2)}`;
                            },
                            title: function() {
                                return 'Weekly data';
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        display: false,
                        grid: {
                            display: false
                        }
                    },
                    y: {
                        display: false,
                        grid: {
                            display: false
                        }
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                }
            }
        });

        this.charts.set(symbol, chart);
    }

    showCardError(symbol, message) {
        const card = document.getElementById(`stock-${symbol}`);
        if (!card) return;

        card.classList.remove('loading');
        card.innerHTML = `
            <div class="stock-header">
                <div class="stock-symbol">${symbol}</div>
                <button class="remove-btn" onclick="dashboard.removeStock('${symbol}')">×</button>
            </div>
            <div class="error-message">
                ${message}
            </div>
        `;
    }

    // Drag and drop handlers
    handleDragStart(e) {
        e.target.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', e.target.innerHTML);
        this.draggedElement = e.target;
    }

    handleDragOver(e) {
        if (e.preventDefault) {
            e.preventDefault();
        }
        e.dataTransfer.dropEffect = 'move';
        return false;
    }

    handleDragEnter(e) {
        if (e.target.classList.contains('stock-card')) {
            e.target.classList.add('drag-over');
        }
    }

    handleDragLeave(e) {
        if (e.target.classList.contains('stock-card')) {
            e.target.classList.remove('drag-over');
        }
    }

    handleDrop(e) {
        if (e.stopPropagation) {
            e.stopPropagation();
        }

        if (this.draggedElement !== e.target && e.target.classList.contains('stock-card')) {
            const grid = document.getElementById('stockGrid');

            // Get symbols
            const draggedSymbol = this.draggedElement.dataset.symbol;
            const targetSymbol = e.target.dataset.symbol;

            // Find entries in stockList (need to find by symbol, not exact match)
            const draggedIndex = this.stockList.findIndex(entry =>
                this.parseStockEntry(entry).symbol === draggedSymbol
            );
            const targetIndex = this.stockList.findIndex(entry =>
                this.parseStockEntry(entry).symbol === targetSymbol
            );

            // Get the full entry (with width) to move
            const draggedEntry = this.stockList[draggedIndex];

            // Update the array order
            this.stockList.splice(draggedIndex, 1);
            this.stockList.splice(targetIndex, 0, draggedEntry);

            // Just reorder the DOM elements without re-rendering
            if (draggedIndex < targetIndex) {
                // Moving forward - insert after target
                e.target.parentNode.insertBefore(this.draggedElement, e.target.nextSibling);
            } else {
                // Moving backward - insert before target
                e.target.parentNode.insertBefore(this.draggedElement, e.target);
            }

            // Save the new order
            this.saveStockList();
        }

        e.target.classList.remove('drag-over');
        return false;
    }

    handleDragEnd(e) {
        e.target.classList.remove('dragging');
        // Remove drag-over class from all cards
        document.querySelectorAll('.stock-card').forEach(card => {
            card.classList.remove('drag-over');
        });
    }

    // Candlestick Modal Methods
    async openCandlestickModal(symbol) {
        const modal = document.getElementById('candlestickModal');
        const modalSymbol = document.getElementById('modalStockSymbol');
        const chartContainer = document.getElementById('candlestickChartContainer');

        // Store current symbol and set default range/interval
        this.currentModalSymbol = symbol;
        const defaultRange = '5y';
        const defaultInterval = this.getDefaultInterval(defaultRange);
        this.currentModalRange = defaultRange;
        this.currentModalInterval = defaultInterval;

        // Show modal with symbol
        modalSymbol.textContent = `${symbol} - Candlestick Chart`;
        modal.classList.remove('hidden');

        // Destroy existing chart if any
        if (this.candlestickChart) {
            this.candlestickChart.destroy();
            this.candlestickChart = null;
        }

        // Set active state on 5Y button
        document.querySelectorAll('.period-btn').forEach(b => {
            if (b.dataset.range === defaultRange) {
                b.classList.add('active');
            } else {
                b.classList.remove('active');
            }
        });

        // Update interval buttons for 5y range
        this.updateIntervalButtons(defaultRange, defaultInterval);

        // Show loading state
        chartContainer.classList.add('loading');
        chartContainer.classList.remove('no-data');
        const canvas = document.getElementById('candlestickChart');
        canvas.style.display = 'none';

        // Load default data (5 years)
        await this.loadCandlestickData(symbol, defaultRange, defaultInterval);
    }

    async loadCandlestickData(symbol, range, interval) {
        const modalSymbol = document.getElementById('modalStockSymbol');
        const chartContainer = document.getElementById('candlestickChartContainer');
        const canvas = document.getElementById('candlestickChart');

        // Show loading state
        chartContainer.classList.add('loading');
        chartContainer.classList.remove('no-data');
        canvas.style.display = 'none';

        // Save visibility state before destroying chart
        if (this.candlestickChart) {
            this.candlestickChart.data.datasets.forEach((dataset, index) => {
                if (dataset.label && (dataset.label === '50W' || dataset.label === '200W' || dataset.label === '60M')) {
                    // Chart.js stores visibility in metadata when legend is clicked
                    const meta = this.candlestickChart.getDatasetMeta(index);
                    const isVisible = meta && !meta.hidden;
                    this.maVisibility[dataset.label] = isVisible;
                    console.log(`[DEBUG] Saving ${dataset.label}: meta.hidden=${meta?.hidden}, storing visible=${isVisible}`);
                } else if (dataset.label && dataset.label.startsWith('BB_')) {
                    // Save Bollinger bands visibility (only need to check one, they're all the same)
                    if (!this.maVisibility.hasOwnProperty('Bollinger')) {
                        const meta = this.candlestickChart.getDatasetMeta(index);
                        const isVisible = meta && !meta.hidden;
                        this.maVisibility['Bollinger'] = isVisible;
                        console.log(`[DEBUG] Saving Bollinger: meta.hidden=${meta?.hidden}, storing visible=${isVisible}`);
                    }
                }
            });
            console.log('[DEBUG] Saved visibility state:', this.maVisibility);
            this.candlestickChart.destroy();
            this.candlestickChart = null;
        } else {
            console.log('[DEBUG] No existing chart to save state from');
        }

        // Update title with period
        const periodText = {
            '6mo': '6M',
            '1y': '1Y',
            '5y': '5Y',
            '10y': '10Y',
            'max': 'All'
        }[range] || range;
        const intervalText = {
            '1d': 'Daily',
            '1wk': 'Weekly',
            '1mo': 'Monthly'
        }[interval] || interval;
        modalSymbol.textContent = `${symbol} - Candlestick Chart (${periodText}, ${intervalText})`;

        try {
            // Fetch candlestick data
            const data = await stockAPI.getCandlestickData(symbol, range, interval);

            // Show canvas
            canvas.style.display = 'block';
            chartContainer.classList.remove('loading');

            // Render candlestick chart
            this.renderCandlestickChart(data);
        } catch (error) {
            console.error('Error loading candlestick data:', error);
            // Show error in modal
            chartContainer.classList.remove('loading');
            modalSymbol.textContent = `${symbol} - Error loading data`;
        }
    }

    closeModal() {
        const modal = document.getElementById('candlestickModal');
        const chartContainer = document.getElementById('candlestickChartContainer');

        modal.classList.add('hidden');

        // Destroy chart
        if (this.candlestickChart) {
            this.candlestickChart.destroy();
            this.candlestickChart = null;
        }

        // Reset state
        this.currentModalSymbol = null;
        this.currentModalRange = null;
        this.currentModalInterval = null;
        chartContainer.classList.remove('loading', 'no-data');

        // Clear active buttons
        document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.interval-btn').forEach(b => b.classList.remove('active'));
    }

    renderCandlestickChart(data) {
        const canvas = document.getElementById('candlestickChart');
        const ctx = canvas.getContext('2d');

        console.log('[DEBUG] Rendering chart with stored visibility state:', this.maVisibility);

        // Debug: Check SMA data received
        const debugSMA = (smaData, name) => {
            if (!smaData || smaData.length === 0) {
                console.log(`[DEBUG ${name}] No data`);
                return;
            }
            const validPoints = smaData.filter(p => p.y !== null);
            const firstValid = validPoints.length > 0 ? validPoints[0] : null;
            const lastValid = validPoints.length > 0 ? validPoints[validPoints.length - 1] : null;
            console.log(`[DEBUG ${name}] ${validPoints.length}/${smaData.length} valid points`);
            if (firstValid) {
                console.log(`  First: ${new Date(firstValid.x).toISOString().split('T')[0]} = $${firstValid.y.toFixed(2)}`);
            }
            if (lastValid && lastValid !== firstValid) {
                console.log(`  Last: ${new Date(lastValid.x).toISOString().split('T')[0]} = $${lastValid.y.toFixed(2)}`);
            }
        };

        console.log(`\n[DEBUG] Candlesticks: ${data.data.length} points (${new Date(data.data[0].x).toISOString().split('T')[0]} to ${new Date(data.data[data.data.length-1].x).toISOString().split('T')[0]})`);
        debugSMA(data.sma50w, '50W');
        debugSMA(data.sma200w, '200W');
        debugSMA(data.sma60m, '60M');

        // Calculate y-axis range from candlestick data only
        let minPrice = Infinity;
        let maxPrice = -Infinity;

        data.data.forEach(candle => {
            if (candle.l < minPrice) minPrice = candle.l;
            if (candle.h > maxPrice) maxPrice = candle.h;
        });

        // Add 5% padding to top and bottom
        const padding = (maxPrice - minPrice) * 0.05;
        const yMin = minPrice - padding;
        const yMax = maxPrice + padding;

        // Prepare datasets
        const datasets = [];

        // Add Bollinger Bands first (render behind candles)
        if (data.bollingerBands) {
            const bbHiddenState = this.maVisibility['Bollinger'] !== undefined ? !this.maVisibility['Bollinger'] : false;
            console.log(`[DEBUG] Restoring Bollinger: savedVisibility=${this.maVisibility['Bollinger']}, setting hidden=${bbHiddenState}`);

            // Lower band - light grey with low opacity dashed line
            datasets.push({
                type: 'line',
                label: 'BB_Lower',
                data: data.bollingerBands.lower,
                borderColor: 'rgba(153, 153, 153, 0.35)', // Light grey with 35% opacity
                backgroundColor: 'transparent',
                borderWidth: 1,
                borderDash: [5, 5], // Dashed line
                pointRadius: 0,
                pointHoverRadius: 0,
                tension: 0.1,
                spanGaps: true,
                fill: false,
                hidden: bbHiddenState
            });

            // Middle band - light grey with low opacity solid line
            datasets.push({
                type: 'line',
                label: 'BB_Middle',
                data: data.bollingerBands.middle,
                borderColor: 'rgba(153, 153, 153, 0.35)', // Light grey with 35% opacity
                backgroundColor: 'transparent',
                borderWidth: 1,
                pointRadius: 0,
                pointHoverRadius: 0,
                tension: 0.1,
                spanGaps: true,
                fill: false,
                hidden: bbHiddenState
            });

            // Upper band - light grey with low opacity dashed line
            datasets.push({
                type: 'line',
                label: 'BB_Upper',
                data: data.bollingerBands.upper,
                borderColor: 'rgba(153, 153, 153, 0.35)', // Light grey with 35% opacity
                backgroundColor: 'transparent',
                borderWidth: 1,
                borderDash: [5, 5], // Dashed line
                pointRadius: 0,
                pointHoverRadius: 0,
                tension: 0.1,
                spanGaps: true,
                fill: false,
                hidden: bbHiddenState
            });
        }

        // Add candlestick dataset
        datasets.push({
            type: 'candlestick',
            label: data.symbol,
            data: data.data
        });

        // Add SMA datasets if available
        if (data.sma50w && data.sma50w.length > 0) {
            const hiddenState = this.maVisibility['50W'] !== undefined ? !this.maVisibility['50W'] : false;
            console.log(`[DEBUG] Restoring 50W: savedVisibility=${this.maVisibility['50W']}, setting hidden=${hiddenState}`);
            datasets.push({
                type: 'line',
                label: '50W',
                data: data.sma50w,
                borderColor: '#ef4444', // Red-orange
                backgroundColor: 'transparent',
                borderWidth: 1.5,
                pointRadius: 0,
                pointHoverRadius: 0,
                tension: 0.1,
                spanGaps: true,
                hidden: hiddenState
            });
        }

        if (data.sma200w && data.sma200w.length > 0) {
            const hiddenState = this.maVisibility['200W'] !== undefined ? !this.maVisibility['200W'] : true;
            console.log(`[DEBUG] Restoring 200W: savedVisibility=${this.maVisibility['200W']}, setting hidden=${hiddenState}`);
            datasets.push({
                type: 'line',
                label: '200W',
                data: data.sma200w,
                borderColor: '#fb923c', // Coral orange
                backgroundColor: 'transparent',
                borderWidth: 1.5,
                pointRadius: 0,
                pointHoverRadius: 0,
                tension: 0.1,
                spanGaps: true,
                hidden: hiddenState // Hidden by default, can be toggled via legend
            });
        }

        if (data.sma60m && data.sma60m.length > 0) {
            const hiddenState = this.maVisibility['60M'] !== undefined ? !this.maVisibility['60M'] : false;
            console.log(`[DEBUG] Restoring 60M: savedVisibility=${this.maVisibility['60M']}, setting hidden=${hiddenState}`);
            datasets.push({
                type: 'line',
                label: '60M',
                data: data.sma60m,
                borderColor: '#fbbf24', // Amber/golden
                backgroundColor: 'transparent',
                borderWidth: 1.5,
                pointRadius: 0,
                pointHoverRadius: 0,
                tension: 0.1,
                spanGaps: true,
                hidden: hiddenState
            });
        }

        this.candlestickChart = new Chart(ctx, {
            type: 'candlestick',
            data: {
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        align: 'end',
                        labels: {
                            color: '#aaa',
                            font: {
                                size: 11
                            },
                            boxWidth: 20,
                            boxHeight: 2,
                            padding: 10,
                            generateLabels: (chart) => {
                                const datasets = chart.data.datasets;
                                const labels = [];
                                let bollingerAdded = false;

                                datasets.forEach((dataset, i) => {
                                    const meta = chart.getDatasetMeta(i);

                                    // Skip candlestick dataset
                                    if (dataset.label === data.symbol) {
                                        return;
                                    }

                                    // Group all Bollinger Band datasets into one legend item
                                    if (dataset.label && dataset.label.startsWith('BB_')) {
                                        if (!bollingerAdded) {
                                            labels.push({
                                                text: 'Bollinger',
                                                fillStyle: 'rgba(153, 153, 153, 0.35)',
                                                strokeStyle: 'rgba(153, 153, 153, 0.35)',
                                                lineWidth: 1,
                                                fontColor: '#aaa',
                                                hidden: meta.hidden,
                                                index: i,
                                                isBollinger: true
                                            });
                                            bollingerAdded = true;
                                        }
                                        return;
                                    }

                                    // Add other datasets (MAs) normally
                                    if (dataset.label) {
                                        labels.push({
                                            text: dataset.label,
                                            fillStyle: dataset.borderColor,
                                            strokeStyle: dataset.borderColor,
                                            lineWidth: dataset.borderWidth,
                                            fontColor: '#aaa',
                                            hidden: meta.hidden,
                                            index: i
                                        });
                                    }
                                });

                                return labels;
                            }
                        },
                        onClick: (e, legendItem, legend) => {
                            const chart = legend.chart;

                            if (legendItem.isBollinger) {
                                // Toggle all Bollinger Band datasets
                                let newHiddenState = null;
                                chart.data.datasets.forEach((dataset, i) => {
                                    if (dataset.label && dataset.label.startsWith('BB_')) {
                                        const meta = chart.getDatasetMeta(i);
                                        if (newHiddenState === null) {
                                            newHiddenState = !meta.hidden;
                                        }
                                        meta.hidden = newHiddenState;
                                    }
                                });
                                // Save visibility state
                                this.maVisibility['Bollinger'] = !newHiddenState;
                            } else {
                                // Default behavior for MAs
                                const index = legendItem.index;
                                const meta = chart.getDatasetMeta(index);
                                meta.hidden = !meta.hidden;

                                // Save visibility state for MAs
                                const dataset = chart.data.datasets[index];
                                if (dataset.label) {
                                    this.maVisibility[dataset.label] = !meta.hidden;
                                }
                            }

                            chart.update();
                        }
                    },
                    tooltip: {
                        enabled: true,
                        mode: 'index',
                        intersect: false,
                        backgroundColor: '#1a1a1a',
                        borderColor: '#333',
                        borderWidth: 1,
                        titleColor: '#fff',
                        bodyColor: '#aaa',
                        callbacks: {
                            label: function(context) {
                                const point = context.raw;

                                // Handle candlestick data
                                if (point.o !== undefined) {
                                    return [
                                        `Open: $${point.o.toFixed(2)}`,
                                        `High: $${point.h.toFixed(2)}`,
                                        `Low: $${point.l.toFixed(2)}`,
                                        `Close: $${point.c.toFixed(2)}`
                                    ];
                                }

                                // Handle SMA data
                                if (point.y !== null && point.y !== undefined) {
                                    return `${context.dataset.label}: $${point.y.toFixed(2)}`;
                                }

                                return '';
                            },
                            title: function(context) {
                                const date = new Date(context[0].raw.x);
                                return date.toLocaleDateString('en-US', {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric'
                                });
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'day',
                            displayFormats: {
                                day: 'MMM d'
                            }
                        },
                        grid: {
                            color: '#2a2a2a',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#666',
                            maxRotation: 0,
                            autoSkip: true,
                            maxTicksLimit: 12
                        }
                    },
                    y: {
                        position: 'right',
                        min: yMin,
                        max: yMax,
                        grid: {
                            color: '#2a2a2a',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#666',
                            callback: function(value) {
                                return '$' + value.toFixed(0);
                            }
                        }
                    }
                }
            }
        });

        // Manually sync legend state with saved visibility after chart creation
        // This ensures the legend strikethrough matches the actual visibility
        this.candlestickChart.data.datasets.forEach((dataset, index) => {
            const meta = this.candlestickChart.getDatasetMeta(index);

            // Handle moving averages
            if (dataset.label && (dataset.label === '50W' || dataset.label === '200W' || dataset.label === '60M')) {
                const shouldBeHidden = dataset.hidden;
                if (meta.hidden !== shouldBeHidden) {
                    meta.hidden = shouldBeHidden;
                    console.log(`[DEBUG] Synced legend for ${dataset.label}: hidden=${shouldBeHidden}`);
                }
            }

            // Handle Bollinger bands
            if (dataset.label && dataset.label.startsWith('BB_')) {
                const bollingerVisible = this.maVisibility['Bollinger'];
                const shouldBeHidden = bollingerVisible !== undefined ? !bollingerVisible : true; // Hidden by default
                if (meta.hidden !== shouldBeHidden) {
                    meta.hidden = shouldBeHidden;
                    console.log(`[DEBUG] Synced legend for ${dataset.label}: hidden=${shouldBeHidden}`);
                }
            }
        });

        // Update the chart to reflect the metadata changes in the legend
        this.candlestickChart.update('none'); // 'none' = no animation
    }
}

// Initialize dashboard when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.dashboard = new StockDashboard();
    });
} else {
    window.dashboard = new StockDashboard();
}
