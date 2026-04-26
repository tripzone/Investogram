// Main Application Logic
// RULE: ALL CHARTS MUST HAVE animation: false - No animations allowed

class StockDashboard {
    constructor() {
        this.stockList = this.loadStockList();
        this.watchlist = this.loadWatchlist();
        this.portfolioGraphs = this.loadPortfolioGraphs();
        this.charts = new Map();
        this.portfolioCharts = new Map();
        this.graphCanvasMap = new Map(); // graphId -> canvasId mapping for sync
        this.candlestickChart = null;
        this.currentModalSymbol = null;
        this.currentModalRange = null;
        this.currentModalInterval = null;
        this._activeModalType = null;   // 'candlestick' | 'ai' | 'fundamentals' | 'tracking-overview'
        this._activeModalSymbol = null;
        this._activeModalContext = null; // 'tracking' | 'watchlist'
        this.trackingOverviewChart = null;
        this.maVisibility = {}; // Store moving average visibility state
        this.selectedFile = null;
        this.selectedGraph = null;
        this.showValues = this.loadShowValuesPreference();
        this.stockDataMap = {}; // symbol -> last known stock data, used for AI analysis
        this.trackingDataMap = {}; // symbol -> last known stock data for tracking tab
        this.resizing = null; // Track active resize operation
        this._renderToken = 0; // incremented each renderAllStocks call; stale stream callbacks check this
        this.latestPrices = null; // Map<symbol, { currentPrice, currency }>
        this.latestPricesState = 'idle'; // 'idle' | 'loading' | 'active' | 'error'
        this.useCurrentPrices = true; // clock toggle: true = use market prices, false = use acquisition cost
        this.portfolioExcludedSymbols = this.loadPortfolioExcludedSymbols();
        this.availableGraphs = [
            {
                id: 'asset-allocation',
                title: 'Asset Allocation',
                description: 'Portfolio breakdown by symbol'
            }
        ];
        this.init();
    }

    formatCurrency(value, currency = 'CAD') {
        const symbol = currency === 'USD' ? '$' : 'CAD $';
        return `${symbol}${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    init() {
        // Yahoo Finance doesn't need API key, so skip prompt
        // Set up event listeners
        this.setupEventListeners();
        this.setupTabs();
        this.setupWatchlistControls();
        this.setupUploadModal();
        this.setupGraphSelector();
        this.setupValuesToggle();
        this.setupPortfolioRefresh();
        this.updateAvailableGraphs();
        this.updateDataIndicators();

        // Load initial stocks
        if (this.stockList.length === 0) {
            // Default stocks
            this.stockList = ['AAPL', 'GOOGL', 'MSFT', 'TSLA'];
            this.saveStockList();
        }

        this.renderAllStocks();
        this.renderPortfolioGraphs();
        this.updateCollapseToggleBar();

        // Update divider and card widths on window resize
        window.addEventListener('resize', () => {
            this.updateAllDividerWidths();
            this.updateCardWidthsForViewport();
        });
    }

    updateAvailableGraphs() {
        this.availableGraphs = [
            {
                id: 'asset-allocation',
                title: 'Asset Allocation',
                cardTitle: 'Asset Allocation',
                description: 'Portfolio breakdown — toggle between all assets and category groups',
                heading: 'Asset Allocation'
            },
            {
                id: 'market-activity',
                title: 'Market Activity',
                cardTitle: 'Market Activity',
                description: 'Monthly net trades or by-ticker breakdown — toggle between views',
                heading: 'Trading Activity'
            },
            {
                id: 'stock-analysis',
                title: 'Stock Analysis',
                cardTitle: 'Stock Analysis',
                description: 'Transaction analysis by price or by date — toggle between views',
                heading: 'Stock Analysis'
            },
            {
                id: 'portfolio-performance',
                title: 'Portfolio vs S&P 500',
                cardTitle: 'Portfolio vs S&P 500',
                description: 'Performance vs S&P 500 across all timeframes — toggle between TWR and S&P Equivalent views',
                heading: 'Performance'
            }
        ];
    }

    setupTabs() {
        const stocksTab = document.getElementById('stocksTab');
        const watchlistTab = document.getElementById('watchlistTab');
        const portfolioTab = document.getElementById('portfolioTab');
        const stocksView = document.getElementById('stocksView');
        const watchlistView = document.getElementById('watchlistView');
        const portfolioView = document.getElementById('portfolioView');
        const stockControls = document.querySelector('.stock-controls');
        const watchlistControls = document.querySelector('.watchlist-controls');
        const portfolioControls = document.querySelector('.portfolio-controls');
        const uploadControls = document.querySelector('.upload-controls');
        const trackingActionBtns = document.querySelectorAll('.stock-action-btns');
        const trackingDesktop = document.getElementById('trackingActionBtns');
        const watchlistDesktop = document.getElementById('watchlistActionBtns');
        const watchlistMobile = document.querySelector('.watchlist-action-mobile');

        const showStockActions = () => {
            trackingActionBtns.forEach(el => el.classList.remove('hidden'));
            if (watchlistDesktop) watchlistDesktop.classList.add('hidden');
            if (watchlistMobile) watchlistMobile.classList.add('hidden');
        };
        const hideStockActions = () => trackingActionBtns.forEach(el => el.classList.add('hidden'));
        const showWatchlistActions = () => {
            if (trackingDesktop) trackingDesktop.classList.add('hidden');
            if (watchlistDesktop) watchlistDesktop.classList.remove('hidden');
            if (watchlistMobile) watchlistMobile.classList.remove('hidden');
        };

        // Wire up collapse toggle bar via addEventListener — more reliable on mobile than inline onclick
        const collapseBar = document.getElementById('collapseToggleBar');
        if (collapseBar) {
            collapseBar.addEventListener('click', () => this.toggleCollapseAll());
        }

        stocksTab.addEventListener('click', () => {
            stocksTab.classList.add('active');
            watchlistTab.classList.remove('active');
            portfolioTab.classList.remove('active');
            stocksView.classList.remove('hidden');
            watchlistView.classList.add('hidden');
            portfolioView.classList.add('hidden');

            stockControls.classList.remove('hidden');
            watchlistControls.classList.add('hidden');
            portfolioControls.classList.add('hidden');
            uploadControls.classList.remove('visible');
            showStockActions();
            const bar = document.getElementById('collapseToggleBar');
            if (bar) bar.classList.remove('hidden');
            this.updateCollapseToggleBar();
        });

        watchlistTab.addEventListener('click', () => {
            watchlistTab.classList.add('active');
            stocksTab.classList.remove('active');
            portfolioTab.classList.remove('active');
            watchlistView.classList.remove('hidden');
            stocksView.classList.add('hidden');
            portfolioView.classList.add('hidden');

            watchlistControls.classList.remove('hidden');
            stockControls.classList.add('hidden');
            portfolioControls.classList.add('hidden');
            uploadControls.classList.remove('visible');
            hideStockActions();
            showWatchlistActions();
            document.getElementById('collapseToggleBar')?.classList.add('hidden');

            // Lazy render: first visit fetches only cache misses from tracking tab;
            // subsequent visits are instant since cards are already in the DOM.
            // rAF defers until after the browser has laid out the now-visible tab,
            // so Chart.js reads the correct container width on first render.
            if (!this._watchlistRendered) {
                this._watchlistRendered = true;
                requestAnimationFrame(() => this.renderAllWatchlistStocks());
            } else {
                // Flush any charts deferred because the view was hidden.
                // The rAF runs after the browser has laid out the now-visible view,
                // so Chart.js reads the correct container dimensions.
                requestAnimationFrame(() => {
                    if (this._pendingWLCharts && this._pendingWLCharts.length) {
                        const pending = this._pendingWLCharts.splice(0);
                        pending.forEach(({ symbol, data }) => this.createChart(symbol, data, 'watchlist'));
                    }
                });
            }
        });

        portfolioTab.addEventListener('click', () => {
            portfolioTab.classList.add('active');
            stocksTab.classList.remove('active');
            watchlistTab.classList.remove('active');
            portfolioView.classList.remove('hidden');
            stocksView.classList.add('hidden');
            watchlistView.classList.add('hidden');

            stockControls.classList.add('hidden');
            watchlistControls.classList.add('hidden');
            portfolioControls.classList.remove('hidden');
            uploadControls.classList.add('visible');
            hideStockActions();
            if (watchlistDesktop) watchlistDesktop.classList.add('hidden');
            if (watchlistMobile) watchlistMobile.classList.add('hidden');
            const bar = document.getElementById('collapseToggleBar');
            if (bar) bar.classList.add('hidden');

            if (this._pendingAnalysisMeasure) {
                this._pendingAnalysisMeasure = false;
                requestAnimationFrame(() => this._measureAnalysisToggle());
            }

            // Auto-fetch prices if clock is on and no prices yet
            if (this.useCurrentPrices && this.latestPricesState === 'idle') {
                this.fetchLatestPrices();
            }
        });

        // Swipe left/right on the main content area to switch tabs
        const tabOrder = ['stocksTab', 'watchlistTab', 'portfolioTab'];
        const tabSwipe = {};
        const mainContainer = document.querySelector('.container');
        if (mainContainer) {
            mainContainer.addEventListener('touchstart', (e) => {
                if (document.querySelector('.modal:not(.hidden)')) return;
                tabSwipe.startX = e.touches[0].clientX;
                tabSwipe.startY = e.touches[0].clientY;
                tabSwipe.dragging = false;
                tabSwipe.locked = false;
            }, { passive: true });

            mainContainer.addEventListener('touchmove', (e) => {
                if (tabSwipe.startX == null || tabSwipe.locked) return;
                if (document.querySelector('.modal:not(.hidden)')) { tabSwipe.startX = null; return; }
                const dx = e.touches[0].clientX - tabSwipe.startX;
                const dy = e.touches[0].clientY - tabSwipe.startY;
                if (!tabSwipe.dragging) {
                    if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
                    if (Math.abs(dy) >= Math.abs(dx)) { tabSwipe.locked = true; return; }
                    tabSwipe.dragging = true;
                }
                e.preventDefault();
            }, { passive: false });

            mainContainer.addEventListener('touchend', (e) => {
                if (tabSwipe.startX == null || !tabSwipe.dragging) { tabSwipe.startX = null; return; }
                const dx = e.changedTouches[0].clientX - tabSwipe.startX;
                const dy = e.changedTouches[0].clientY - tabSwipe.startY;
                tabSwipe.startX = null;
                tabSwipe.dragging = false;
                tabSwipe.locked = false;
                if (Math.abs(dx) < 40 || Math.abs(dx) <= Math.abs(dy) * 1.5) return;
                const activeIdx = tabOrder.findIndex(id => document.getElementById(id)?.classList.contains('active'));
                const nextIdx = dx < 0 ? activeIdx + 1 : activeIdx - 1;
                if (nextIdx < 0 || nextIdx >= tabOrder.length) return;
                document.getElementById(tabOrder[nextIdx])?.click();
            }, { passive: true });
        }
    }

    setupUploadModal() {
        const uploadBtn = document.getElementById('uploadBtn');
        const uploadModal = document.getElementById('uploadModal');
        const uploadModalCloseBtn = document.getElementById('uploadModalCloseBtn');
        const cancelUploadBtn = document.getElementById('cancelUploadBtn');
        const selectFileBtn = document.getElementById('selectFileBtn');
        const fileInput = document.getElementById('fileInput');
        const confirmUploadBtn = document.getElementById('confirmUploadBtn');
        const fileUploadSourceBtn = document.getElementById('fileUploadSourceBtn');
        const uploadBackBtn = document.getElementById('uploadBackBtn');
        const uploadBtnMobile = document.getElementById('uploadBtnMobile');

        // Open upload modal (source picker)
        uploadBtn.addEventListener('click', () => {
            this.openUploadModal();
        });

        uploadBtnMobile.addEventListener('click', () => {
            this.openUploadModal();
        });

        // Source picker: File Upload
        fileUploadSourceBtn.addEventListener('click', () => {
            document.getElementById('uploadSourceStep').classList.add('hidden');
            document.getElementById('uploadFileStep').classList.remove('hidden');
            this.updateDataIndicators();
        });

        // Back to source picker
        uploadBackBtn.addEventListener('click', () => {
            this.resetUploadModal();
        });

        // Close modal handlers
        uploadModalCloseBtn.addEventListener('click', () => {
            this.closeUploadModal();
        });

        cancelUploadBtn.addEventListener('click', () => {
            this.closeUploadModal();
        });

        uploadModal.addEventListener('click', (e) => {
            if (e.target.id === 'uploadModal') {
                this.closeUploadModal();
            }
        });

        // File selection
        selectFileBtn.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', (e) => {
            this.handleFileSelect(e.target.files[0]);
        });

        // Drag and drop on upload area
        const uploadArea = document.querySelector('.upload-area');
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('drag-active');
        });
        uploadArea.addEventListener('dragleave', (e) => {
            if (!uploadArea.contains(e.relatedTarget)) {
                uploadArea.classList.remove('drag-active');
            }
        });
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('drag-active');
            const file = e.dataTransfer.files[0];
            if (file) this.handleFileSelect(file);
        });

        // Confirm upload
        confirmUploadBtn.addEventListener('click', () => {
            this.handleUpload();
        });
    }

    openUploadModal() {
        const uploadModal = document.getElementById('uploadModal');
        uploadModal.classList.remove('hidden');
        this.resetUploadModal();
    }

    closeUploadModal() {
        const uploadModal = document.getElementById('uploadModal');
        uploadModal.classList.add('hidden');
        this.resetUploadModal();
    }

    resetUploadModal() {
        // Reset to source step
        document.getElementById('uploadSourceStep').classList.remove('hidden');
        document.getElementById('uploadFileStep').classList.add('hidden');

        // Clear file selection
        const fileInput = document.getElementById('fileInput');
        const fileInfo = document.getElementById('fileInfo');
        const uploadError = document.getElementById('uploadError');
        const confirmUploadBtn = document.getElementById('confirmUploadBtn');

        fileInput.value = '';
        fileInfo.classList.add('hidden');
        fileInfo.textContent = '';
        uploadError.classList.add('hidden');
        uploadError.textContent = '';
        confirmUploadBtn.disabled = true;
        this.selectedFile = null;
    }

    handleFileSelect(file) {
        const fileInfo = document.getElementById('fileInfo');
        const uploadError = document.getElementById('uploadError');
        const confirmUploadBtn = document.getElementById('confirmUploadBtn');

        uploadError.classList.add('hidden');

        if (!file) {
            this.selectedFile = null;
            fileInfo.classList.add('hidden');
            confirmUploadBtn.disabled = true;
            return;
        }

        if (!file.name.endsWith('.csv')) {
            uploadError.textContent = 'Please select a CSV file';
            uploadError.classList.remove('hidden');
            this.selectedFile = null;
            fileInfo.classList.add('hidden');
            confirmUploadBtn.disabled = true;
            return;
        }

        this.selectedFile = file;
        fileInfo.textContent = `Selected: ${file.name}`;
        fileInfo.classList.remove('hidden');
        confirmUploadBtn.disabled = false;
    }

    async handleUpload() {
        if (!this.selectedFile) return;

        const uploadType = document.querySelector('input[name="uploadType"]:checked').value;
        const uploadError = document.getElementById('uploadError');
        const confirmUploadBtn = document.getElementById('confirmUploadBtn');

        try {
            confirmUploadBtn.disabled = true;
            confirmUploadBtn.textContent = 'Uploading...';

            const text = await this.selectedFile.text();
            const result = this.parseCSV(text, uploadType);

            if (uploadType === 'categories') {
                // Categories returns {data, columns}
                console.log('[DEBUG] Categories result:', result);
                if (!result || typeof result !== 'object') {
                    throw new Error('Invalid result from CSV parser');
                }
                if (!result.data || result.data.length === 0) {
                    throw new Error('No valid data found in file (parsed 0 rows)');
                }
                if (!result.columns || result.columns.length === 0) {
                    throw new Error('No category columns found in file');
                }

                // Store categories data and detected columns
                this.saveCategoriesData(result.data, result.columns);

                // Update available graphs dynamically
                this.updateAvailableGraphs();

                // Update indicators
                this.updateDataIndicators();

                // Success
                this.closeUploadModal();
                alert(`Successfully uploaded ${result.data.length} ${uploadType} records with ${result.columns.length} categories`);

            } else {
                // Positions and trades return just data array
                if (!result || result.length === 0) {
                    throw new Error('No valid data found in file');
                }

                // Store in localStorage
                this.savePortfolioData(uploadType, result);

                // Update indicators
                this.updateDataIndicators();

                // Success
                this.closeUploadModal();
                alert(`Successfully uploaded ${result.length} ${uploadType} records`);
            }

        } catch (error) {
            console.error('Upload error:', error);
            uploadError.textContent = error.message || 'Error processing file';
            uploadError.classList.remove('hidden');
        } finally {
            confirmUploadBtn.disabled = false;
            confirmUploadBtn.textContent = 'Upload';
        }
    }

    parseCSV(text, type) {
        // Handle different line endings (\r\n for Windows, \n for Unix)
        const lines = text.trim().split(/\r?\n/);
        if (lines.length < 2) {
            throw new Error('File is empty or has no data rows');
        }

        const headers = lines[0].split(',').map(h => h.trim());
        const data = [];

        // Validate headers based on type
        if (type === 'positions') {
            const requiredHeaders = ['symbol', 'quantity', 'average_entry_price', 'total_cost', 'currency'];
            const hasAllHeaders = requiredHeaders.every(h => headers.includes(h));
            if (!hasAllHeaders) {
                throw new Error('Invalid positions file format. Expected headers: ' + requiredHeaders.join(', '));
            }
        } else if (type === 'trades') {
            const requiredHeaders = ['transaction_date', 'symbol', 'type', 'currency'];
            const hasAllHeaders = requiredHeaders.every(h => headers.includes(h));
            if (!hasAllHeaders) {
                throw new Error('Invalid trades file format. Expected headers: ' + requiredHeaders.join(', '));
            }
        } else if (type === 'categories') {
            // Validate: first column must be 'symbol', and need at least one other column
            if (headers.length < 2) {
                throw new Error('Invalid categories file format. Expected at least 2 columns.');
            }
            if (headers[0].toLowerCase() !== 'symbol') {
                throw new Error(`Invalid categories file format. First column must be "symbol" (found "${headers[0]}")`);
            }
            console.log('[DEBUG] Categories headers:', headers);
            console.log('[DEBUG] Parsing', lines.length - 1, 'data rows');
        }

        // Parse data rows
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const values = line.split(',').map(v => v.trim());
            const row = {};

            headers.forEach((header, index) => {
                row[header] = values[index] || '';
            });

            // Basic validation - check using the actual first header name
            const symbolColumnName = headers[0];
            if (!row[symbolColumnName]) {
                if (type === 'categories') {
                    console.log('[DEBUG] Skipping row', i, '- no symbol value');
                }
                continue;
            }

            // For categories, normalize symbol column to lowercase 'symbol'
            if (type === 'categories' && symbolColumnName !== 'symbol') {
                row['symbol'] = row[symbolColumnName];
                delete row[symbolColumnName];
            }

            data.push(row);
        }

        // For categories, return both data and detected column names (excluding 'symbol')
        if (type === 'categories') {
            const columns = headers.slice(1); // All columns except first (symbol)
            console.log('[DEBUG] Parsed', data.length, 'rows with', columns.length, 'category columns');
            console.log('[DEBUG] Sample row:', data[0]);
            return { data, columns };
        }

        return data;
    }

    savePortfolioData(type, data) {
        const key = type === 'positions' ? 'portfolio_positions' : 'portfolio_trades';
        localStorage.setItem(key, JSON.stringify(data));
        localStorage.setItem(key + '_uploaded_at', new Date().toISOString());
    }

    loadPortfolioData(type) {
        const key = type === 'positions' ? 'portfolio_positions' : 'portfolio_trades';
        const saved = localStorage.getItem(key);
        return saved ? JSON.parse(saved) : null;
    }

    loadPortfolioExcludedSymbols() {
        const saved = localStorage.getItem('portfolio_excluded_symbols');
        if (!saved) return new Set();
        try { return new Set(JSON.parse(saved)); } catch { return new Set(); }
    }

    savePortfolioExcludedSymbols() {
        localStorage.setItem('portfolio_excluded_symbols', JSON.stringify([...this.portfolioExcludedSymbols]));
    }

    getPortfolioSymbols() {
        const symbols = new Set();
        const positions = this.loadPortfolioData('positions');
        if (positions) positions.forEach(p => { if (p.symbol) symbols.add(p.symbol.toUpperCase()); });
        const trades = this.loadPortfolioData('trades');
        if (trades) trades.forEach(t => { if (t.symbol && t.type?.toLowerCase() !== 'dividend') symbols.add(t.symbol.toUpperCase()); });
        return [...symbols].sort();
    }

    buildExcludeFilterBar() {
        const symbols = this.getPortfolioSymbols();
        const bar = document.createElement('div');
        bar.id = 'portfolio-filter-bar';
        bar.className = 'portfolio-filter-bar';
        if (symbols.length === 0) return bar;

        const excludedCount = symbols.filter(s => this.portfolioExcludedSymbols.has(s)).length;
        const allSelected = excludedCount === 0;

        const itemHTML = (label, checked, cls, dataAttr = '') =>
            `<div class="portfolio-filter-item ${cls}" ${dataAttr}>
                <span class="pf-check">${checked ? '✓' : ''}</span>
                <span class="pf-label">${label}</span>
            </div>`;

        bar.innerHTML = `
            <div class="portfolio-filter-wrapper">
                <button class="portfolio-filter-btn${excludedCount > 0 ? ' has-exclusions' : ''}">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/>
                    </svg>
                    <span class="pf-btn-label">${excludedCount > 0 ? `Filter (${excludedCount} hidden)` : 'Filter'}</span>
                </button>
                <div class="portfolio-filter-dropdown hidden">
                    <div class="portfolio-filter-select-all-row">
                        ${itemHTML('Select All', allSelected, 'portfolio-filter-select-all')}
                    </div>
                    <div class="portfolio-filter-symbol-list">
                        ${symbols.map(s => itemHTML(s, !this.portfolioExcludedSymbols.has(s), 'portfolio-filter-symbol-item', `data-symbol="${s}"`)).join('')}
                    </div>
                </div>
            </div>
        `;

        const btn = bar.querySelector('.portfolio-filter-btn');
        const btnLabel = bar.querySelector('.pf-btn-label');
        const dropdown = bar.querySelector('.portfolio-filter-dropdown');
        const selectAllItem = bar.querySelector('.portfolio-filter-select-all');

        const updateBtn = () => {
            const n = symbols.filter(s => this.portfolioExcludedSymbols.has(s)).length;
            btnLabel.textContent = n > 0 ? `Filter (${n} hidden)` : 'Filter';
            btn.classList.toggle('has-exclusions', n > 0);
            selectAllItem.querySelector('.pf-check').textContent =
                this.portfolioExcludedSymbols.size === 0 ? '✓' : '';
        };

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('hidden');
            if (!dropdown.classList.contains('hidden')) {
                const closeOnOutside = (ev) => {
                    if (!bar.contains(ev.target)) {
                        dropdown.classList.add('hidden');
                        document.removeEventListener('click', closeOnOutside);
                    }
                };
                setTimeout(() => document.addEventListener('click', closeOnOutside), 0);
            }
        });

        selectAllItem.addEventListener('click', () => {
            const isChecked = selectAllItem.querySelector('.pf-check').textContent === '✓';
            if (isChecked) {
                symbols.forEach(s => this.portfolioExcludedSymbols.add(s));
                bar.querySelectorAll('.portfolio-filter-symbol-item .pf-check').forEach(c => { c.textContent = ''; });
            } else {
                this.portfolioExcludedSymbols.clear();
                bar.querySelectorAll('.portfolio-filter-symbol-item .pf-check').forEach(c => { c.textContent = '✓'; });
            }
            updateBtn();
            this.savePortfolioExcludedSymbols();
            this.rerenderPortfolioCharts();
        });

        bar.querySelectorAll('.portfolio-filter-symbol-item').forEach(item => {
            item.addEventListener('click', () => {
                const symbol = item.dataset.symbol;
                const checkEl = item.querySelector('.pf-check');
                const isChecked = checkEl.textContent === '✓';
                if (isChecked) {
                    this.portfolioExcludedSymbols.add(symbol);
                    checkEl.textContent = '';
                } else {
                    this.portfolioExcludedSymbols.delete(symbol);
                    checkEl.textContent = '✓';
                }
                updateBtn();
                this.savePortfolioExcludedSymbols();
                this.rerenderPortfolioCharts();
            });
        });

        return bar;
    }

    saveCategoriesData(data, columns) {
        localStorage.setItem('portfolio_categories', JSON.stringify(data));
        localStorage.setItem('portfolio_categories_columns', JSON.stringify(columns));
        localStorage.setItem('portfolio_categories_uploaded_at', new Date().toISOString());
    }

    loadCategoriesData() {
        const saved = localStorage.getItem('portfolio_categories');
        return saved ? JSON.parse(saved) : null;
    }

    loadCategoriesColumns() {
        const saved = localStorage.getItem('portfolio_categories_columns');
        return saved ? JSON.parse(saved) : null;
    }

    updateDataIndicators() {
        const positionsData = this.loadPortfolioData('positions');
        const tradesData = this.loadPortfolioData('trades');
        const categoriesData = this.loadCategoriesData();

        const hasData = {
            positions: positionsData && positionsData.length > 0,
            trades: tradesData && tradesData.length > 0,
            categories: categoriesData && categoriesData.length > 0,
        };

        const idMap = {
            positions: 'typeOptionPositions',
            trades: 'typeOptionTrades',
            categories: 'typeOptionCategories',
        };

        for (const [type, id] of Object.entries(idMap)) {
            const el = document.getElementById(id);
            if (el) el.classList.toggle('has-data', hasData[type]);
        }
    }

    setupValuesToggle() {
        const toggleBtn = document.getElementById('toggleValuesBtn');
        const toggleBtnMobile = document.getElementById('toggleValuesBtnMobile');

        const syncActiveState = () => {
            toggleBtn.classList.toggle('active', this.showValues);
            toggleBtnMobile.classList.toggle('active', this.showValues);
        };

        syncActiveState();

        const onToggle = () => {
            this.showValues = !this.showValues;
            this.saveShowValuesPreference(this.showValues);
            syncActiveState();
            this.renderPortfolioGraphs();
        };

        toggleBtn.addEventListener('click', onToggle);
        toggleBtnMobile.addEventListener('click', onToggle);
    }

    setupPortfolioRefresh() {
        ['portfolioRefreshBtn', 'portfolioRefreshBtnMobile'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.addEventListener('click', () => this.fetchLatestPrices());
        });
    }

    loadShowValuesPreference() {
        const saved = localStorage.getItem('show_values');
        return saved === 'true'; // Default to false (hidden)
    }

    saveShowValuesPreference(value) {
        localStorage.setItem('show_values', value.toString());
    }

    setupGraphSelector() {
        const graphInput = document.getElementById('graphInput');
        const graphDropdown = document.getElementById('graphDropdown');
        const graphList = document.getElementById('graphList');
        const addGraphBtn = document.getElementById('addGraphBtn');

        // Show dropdown on focus
        graphInput.addEventListener('focus', () => {
            this.showGraphDropdown();
        });

        // Filter graphs as user types
        graphInput.addEventListener('input', (e) => {
            const query = e.target.value;
            if (query.startsWith('--')) {
                // Divider mode: hide dropdown, enable Add button
                graphDropdown.classList.add('hidden');
                addGraphBtn.disabled = false;
                this.selectedGraph = null;
                return;
            }
            this.filterGraphs(query.toLowerCase());
        });

        // Hide dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.graph-selector-wrapper')) {
                graphDropdown.classList.add('hidden');
            }
        });

        // Add graph button
        addGraphBtn.addEventListener('click', () => {
            this.addGraph();
        });

        // Enter key to add graph
        graphInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && (this.selectedGraph || graphInput.value.startsWith('--'))) {
                this.addGraph();
            }
        });
    }

    showGraphDropdown() {
        const graphDropdown = document.getElementById('graphDropdown');
        graphDropdown.classList.remove('hidden');
        this.renderGraphOptions(this.availableGraphs, true);
    }

    filterGraphs(query) {
        if (!query) {
            this.renderGraphOptions(this.availableGraphs, true);
            return;
        }

        const filtered = this.availableGraphs.filter(graph => {
            return graph.title.toLowerCase().includes(query) ||
                   graph.description.toLowerCase().includes(query);
        });

        this.renderGraphOptions(filtered, false);
    }

    renderGraphOptions(graphs, showHeadings = true) {
        const graphList = document.getElementById('graphList');
        graphList.innerHTML = '';

        if (graphs.length === 0) {
            graphList.innerHTML = '<div class="graph-list-empty">No graphs found</div>';
            return;
        }

        if (showHeadings) {
            // Group graphs by heading
            const grouped = {};
            graphs.forEach(graph => {
                const heading = graph.heading || 'Other';
                if (!grouped[heading]) {
                    grouped[heading] = [];
                }
                grouped[heading].push(graph);
            });

            // Render each heading group
            Object.keys(grouped).forEach(heading => {
                // Add heading
                const headingEl = document.createElement('div');
                headingEl.className = 'graph-heading';
                headingEl.textContent = heading;
                graphList.appendChild(headingEl);

                // Add graphs under this heading
                grouped[heading].forEach(graph => {
                    this.renderGraphOption(graphList, graph);
                });
            });
        } else {
            // Flat list (when searching)
            graphs.forEach(graph => {
                this.renderGraphOption(graphList, graph);
            });
        }
    }

    renderGraphOption(graphList, graph) {
        const option = document.createElement('div');
        option.className = 'graph-option';
        option.dataset.graphId = graph.id;

        // Check if already added
        const alreadyAdded = this.portfolioGraphs.some(g => {
            const id = typeof g === 'string' ? g : g.id;
            return id === graph.id;
        });
        if (alreadyAdded) {
            option.style.opacity = '0.5';
            option.style.cursor = 'default';
        }

        option.innerHTML = `
            <div class="graph-option-title">${graph.title}${alreadyAdded ? ' (added)' : ''}</div>
            <div class="graph-option-description">${graph.description}</div>
        `;

        if (!alreadyAdded) {
            option.addEventListener('click', () => {
                this.selectGraph(graph);
            });
        }

        graphList.appendChild(option);
    }

    selectGraph(graph) {
        const graphInput = document.getElementById('graphInput');
        const addGraphBtn = document.getElementById('addGraphBtn');
        const graphOptions = document.querySelectorAll('.graph-option');

        // Update selected state
        graphOptions.forEach(opt => opt.classList.remove('selected'));
        const selectedOption = document.querySelector(`[data-graph-id="${graph.id}"]`);
        if (selectedOption) {
            selectedOption.classList.add('selected');
        }

        // Update input
        graphInput.value = graph.title;
        this.selectedGraph = graph;

        // Enable add button
        addGraphBtn.disabled = false;
    }

    addGraph() {
        const graphInput = document.getElementById('graphInput');
        const graphDropdown = document.getElementById('graphDropdown');
        const addGraphBtn = document.getElementById('addGraphBtn');
        const inputValue = graphInput.value.trim();

        // Check if user wants to add a divider (with or without title)
        if (inputValue.startsWith('--')) {
            const title = inputValue.substring(2).trim();
            const entry = { isDivider: true, title, id: `--${Date.now()}` };
            this.portfolioGraphs.push(entry);
            this.savePortfolioGraphs();
            graphInput.value = '';
            addGraphBtn.disabled = true;
            this.renderPortfolioGraphs();
            return;
        }

        if (!this.selectedGraph) return;

        // Check if already added
        const alreadyExists = this.portfolioGraphs.some(g => {
            const id = typeof g === 'string' ? g : g.id;
            return id === this.selectedGraph.id;
        });

        if (alreadyExists) {
            alert('Graph already added');
            return;
        }

        // Add to list with default width of 6 (full width)
        this.portfolioGraphs.push({ id: this.selectedGraph.id, width: 6 });
        this.savePortfolioGraphs();

        // Clear selection
        graphInput.value = '';
        graphDropdown.classList.add('hidden');
        addGraphBtn.disabled = true;
        this.selectedGraph = null;

        // Re-render portfolio view
        this.renderPortfolioGraphs();
    }

    loadPortfolioGraphs() {
        const saved = localStorage.getItem('portfolio_graphs');
        if (!saved) return [];

        const parsed = JSON.parse(saved);
        // Migrate old format (array of strings) to new format (array of objects)
        // Default to width 6 (full width) for better backward compatibility
        const LEGACY_ID_MAP = {
            'portfolio-performance-weekly': 'portfolio-performance',
            'asset-allocation-groups': 'asset-allocation',
        };
        const seen = new Set();
        return parsed.map(item => {
            if (typeof item === 'object' && item.isDivider) {
                return item; // Pass through divider entries as-is
            }
            if (typeof item === 'string') {
                return { id: LEGACY_ID_MAP[item] || item, width: 6 };
            }
            if (item.id && LEGACY_ID_MAP[item.id]) {
                return { ...item, id: LEGACY_ID_MAP[item.id] };
            }
            return item;
        }).filter(item => {
            if (item.isDivider) return true; // keep dividers
            if (seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
        });
    }

    savePortfolioGraphs() {
        localStorage.setItem('portfolio_graphs', JSON.stringify(this.portfolioGraphs));
    }

    buildAnalysisCard() {
        const card = document.createElement('div');
        card.className = 'ai-analysis-card';
        card.id = 'ai-analysis-card';
        card.innerHTML = `
            <div class="ai-analysis-header">
                <span class="ai-analysis-label">AI Health Analysis</span>
                <button class="ai-analysis-refresh-btn" onclick="dashboard.refreshAnalysis()" title="Refresh analysis">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
                        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                    </svg>
                </button>
            </div>
            <div class="ai-analysis-body ai-analysis-collapsed" id="ai-analysis-body" onclick="dashboard.expandAnalysis()">
                <span class="ai-analysis-loading">Analyzing portfolio...</span>
            </div>
            <button class="ai-analysis-toggle" id="ai-analysis-toggle" onclick="dashboard.toggleAnalysis()" style="display:none">Show more</button>
        `;
        return card;
    }

    _renderPortfolioAnalysisText(text) {
        const clean = text
            .replace(/\*\*/g, '')
            .replace(/^(Analysis|Recommendation):\s*\n+/gim, '$1:\n');
        return clean
            .split(/\n\n+/)
            .filter(p => p.trim())
            .map(p => {
                let t = p.trim();
                t = t.replace(/^(Analysis|Recommendation):/i, (_, label) =>
                    `<span class="ai-section-label">${label}:</span>`
                );
                t = t.replace(/\n(\d+\.)/g, '<br>$1');
                t = t.replace(/<\/span><br>/g, '</span>');
                return `<p>${t}</p>`;
            })
            .join('');
    }

    async fetchPortfolioAnalysis(positions) {
        const body = document.getElementById('ai-analysis-body');
        if (!body) return;

        // Check daily cache
        const today = new Date().toISOString().split('T')[0];
        const cached = localStorage.getItem(`ai_portfolio_analysis_${today}`);
        if (cached) {
            body.innerHTML = this._renderPortfolioAnalysisText(cached);
            const portfolioView = document.getElementById('portfolioView');
            if (portfolioView && !portfolioView.classList.contains('hidden')) {
                this._measureAnalysisToggle();
            } else {
                this._pendingAnalysisMeasure = true;
            }
            return;
        }

        try {
            const resp = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ positions })
            });
            const data = await resp.json();
            if (data.error) {
                body.textContent = 'Analysis unavailable.';
            } else {
                localStorage.setItem(`ai_portfolio_analysis_${today}`, data.analysis);
                body.innerHTML = this._renderPortfolioAnalysisText(data.analysis);
            }
            const portfolioView = document.getElementById('portfolioView');
            if (portfolioView && !portfolioView.classList.contains('hidden')) {
                this._measureAnalysisToggle();
            } else {
                this._pendingAnalysisMeasure = true;
            }
        } catch {
            body.textContent = 'Analysis unavailable.';
        }
    }

    _measureAnalysisToggle() {
        const body = document.getElementById('ai-analysis-body');
        const toggle = document.getElementById('ai-analysis-toggle');
        if (!body || !toggle) return;
        body.classList.remove('ai-analysis-collapsed');
        const fullHeight = body.scrollHeight;
        body.classList.add('ai-analysis-collapsed');
        const collapsedHeight = body.clientHeight;
        const needsToggle = fullHeight > collapsedHeight + 2;
        toggle.style.display = needsToggle ? 'block' : 'none';
        body.onclick = needsToggle ? () => this.expandAnalysis() : null;
    }

    refreshAnalysis() {
        const raw = this.loadPortfolioData('positions');
        if (!raw) return;
        const positions = raw.filter(p => !this.portfolioExcludedSymbols.has(p.symbol?.toUpperCase()));
        if (!positions.length) return;
        const today = new Date().toISOString().split('T')[0];
        localStorage.removeItem(`ai_portfolio_analysis_${today}`);
        const body = document.getElementById('ai-analysis-body');
        if (body) {
            body.innerHTML = '<span class="ai-analysis-loading">Analyzing portfolio...</span>';
            body.classList.add('ai-analysis-collapsed');
            body.onclick = () => this.expandAnalysis();
        }
        const toggle = document.getElementById('ai-analysis-toggle');
        if (toggle) { toggle.textContent = 'Show more'; toggle.style.display = 'none'; }
        this.fetchPortfolioAnalysis(positions);
    }

    expandAnalysis() {
        const body = document.getElementById('ai-analysis-body');
        const toggle = document.getElementById('ai-analysis-toggle');
        if (!body || !body.classList.contains('ai-analysis-collapsed')) return;
        body.classList.remove('ai-analysis-collapsed');
        body.onclick = null;
        if (toggle) {
            toggle.textContent = 'Show less';
            toggle.style.display = 'block';
        }
    }

    toggleAnalysis() {
        const body = document.getElementById('ai-analysis-body');
        const toggle = document.getElementById('ai-analysis-toggle');
        if (!body || !toggle) return;
        const collapsed = body.classList.toggle('ai-analysis-collapsed');
        toggle.textContent = collapsed ? 'Show more' : 'Show less';
        body.onclick = collapsed ? () => this.expandAnalysis() : null;
    }

    renderPortfolioGraphs() {
        const portfolioView = document.getElementById('portfolioView');

        // Destroy existing charts
        this.portfolioCharts.forEach(chart => chart.destroy());
        this.portfolioCharts.clear();
        this.graphCanvasMap.clear();

        if (this.portfolioGraphs.length === 0) {
            portfolioView.innerHTML = '<div class="empty-state"><p>No graphs added yet. Add your first graph above!</p></div>';
            return;
        }

        portfolioView.innerHTML = '';

        // Insert AI analysis card
        const rawPositions = this.loadPortfolioData('positions');
        const positions = rawPositions
            ? rawPositions.filter(p => !this.portfolioExcludedSymbols.has(p.symbol?.toUpperCase()))
            : null;
        if (positions && positions.length > 0) {
            portfolioView.appendChild(this.buildAnalysisCard());
            this.fetchPortfolioAnalysis(positions);
        }

        // Insert filter bar
        portfolioView.appendChild(this.buildExcludeFilterBar());

        this.portfolioGraphs.forEach((graphEntry, index) => {
            if (graphEntry.isDivider) {
                this.renderPortfolioDivider(graphEntry);
                return;
            }

            const graphId = typeof graphEntry === 'string' ? graphEntry : graphEntry.id;
            const width = typeof graphEntry === 'string' ? 1 : (graphEntry.width || 1);

            const graphDef = this.availableGraphs.find(g => g.id === graphId);
            if (!graphDef) return;

            const graphCard = document.createElement('div');
            graphCard.className = 'portfolio-graph-card';
            graphCard.id = `portfolio-graph-${graphId}`;
            graphCard.dataset.graphId = graphId;
            graphCard.dataset.width = width;
            graphCard.dataset.index = index;
            graphCard.draggable = true;

            // Apply width - span columns in the grid (1, 2, or 3 columns)
            graphCard.style.gridColumn = `span ${width}`;

            const canvasId = `portfolio-chart-${index}`;
            this.graphCanvasMap.set(graphId, canvasId);

            // Categorize graph type
            const isMarketActivityGraph = graphId === 'market-activity';
            const isStockAnalysisGraph = graphId === 'stock-analysis';
            const isPerformanceGraph = graphId === 'portfolio-performance';
            const isAllocationGraph = graphId === 'asset-allocation' || graphId.startsWith('category-');

            // Timeframe row (market activity + performance graphs)
            const SHORT_TERM_TFS = new Set(['7d', '28d', '3m']);
            const timeframeRow = isMarketActivityGraph ? `
                <div class="graph-header-timeframe">
                    <button class="timeframe-btn active" data-timeframe="1y">1Y</button>
                    <button class="timeframe-btn" data-timeframe="5y">5Y</button>
                    <button class="timeframe-btn" data-timeframe="all">ALL</button>
                </div>
            ` : isPerformanceGraph ? `
                <div class="graph-header-timeframe">
                    <button class="timeframe-btn" data-timeframe="7d">7D</button>
                    <button class="timeframe-btn" data-timeframe="28d">28D</button>
                    <button class="timeframe-btn" data-timeframe="3m">3M</button>
                    <button class="timeframe-btn" data-timeframe="6m">6M</button>
                    <button class="timeframe-btn active" data-timeframe="1y">1Y</button>
                    <button class="timeframe-btn" data-timeframe="2y">2Y</button>
                    <button class="timeframe-btn" data-timeframe="3y">3Y</button>
                    <button class="timeframe-btn" data-timeframe="5y">5Y</button>
                </div>
            ` : '';

            // Mode row
            const combinedInfoContent = `
                <strong>TWR vs S&P Equivalent — what's the difference?</strong>
                <p><em>TWR (Time-Weighted Return):</em> Every period counts equally regardless of how much capital was deployed. Best for evaluating stock-picking skill — "did my selections beat the market?"</p>
                <p><em>S&P 500 Equivalent:</em> Mirrors your actual cash flows into a hypothetical S&P 500 portfolio. Asks "would I have done better just buying the index each time I invested?" Weights returns by dollars deployed.</p>
                <p>The two will diverge when you make large trades — that divergence is real information, not noise. TWR gap = selection skill. S&P Equiv gap = dollar-weighted alpha including deployment timing.</p>
            `;

            let modeRow = '';
            if (isPerformanceGraph) {
                modeRow = `
                    <div class="graph-header-mode">
                        <button class="mode-btn active" data-mode="twr">TWR</button>
                        <button class="mode-btn" data-mode="sp-equivalent">S&P Equiv.</button>
                        <div class="graph-info-tooltip">
                            <span class="graph-info-icon">ⓘ</span>
                            <div class="graph-info-popover">${combinedInfoContent}</div>
                        </div>
                    </div>
                `;
            } else if (isMarketActivityGraph) {
                modeRow = `
                    <div class="graph-header-mode">
                        <button class="mode-btn active" data-mode="net-trades">Net Trades</button>
                        <button class="mode-btn" data-mode="by-ticker">By Ticker</button>
                    </div>
                `;
            } else if (isStockAnalysisGraph) {
                modeRow = `
                    <div class="graph-header-mode">
                        <button class="mode-btn active" data-mode="by-price">By Price</button>
                        <button class="mode-btn" data-mode="by-date">By Date</button>
                    </div>
                `;
            } else if (isAllocationGraph) {
                const catCols = this.loadCategoriesColumns() || [];
                const allBtns = [
                    `<button class="mode-btn active" data-mode="all-assets">All Assets</button>`,
                    ...catCols.map(col => `<button class="mode-btn" data-mode="${col}">${col}</button>`)
                ].join('');
                modeRow = `<div class="graph-header-mode">${allBtns}</div>`;
            }

            // Clock toggle for allocation graphs
            const allocationRefreshBtn = isAllocationGraph ? `
                <button class="allocation-time-btn${this.useCurrentPrices ? '' : ' inactive'}"
                        title="${this.useCurrentPrices ? 'Using current market prices' : 'Using acquisition prices'}"
                        onclick="event.stopPropagation(); dashboard.toggleCurrentPrices()">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                </button>
            ` : '';

            // Ticker selector for stock analysis
            const tickerSelector = (isStockAnalysisGraph || graphId === 'buys-sells-analysis' || graphId === 'buys-sells-by-date') ? `
                <div class="ticker-selector-wrapper">
                    <input
                        type="text"
                        class="ticker-selector-input"
                        placeholder="Select ticker..."
                        autocomplete="off"
                    >
                    <div class="ticker-dropdown hidden">
                        <div class="ticker-list"></div>
                    </div>
                </div>
            ` : '';

            graphCard.innerHTML = `
                <div class="graph-card-header">
                    <div class="graph-header-title">
                        <span class="graph-drag-handle">⋮⋮</span>
                        <span class="graph-card-title">${graphDef.cardTitle || graphDef.title}</span>
                        ${allocationRefreshBtn}
                        <button class="remove-graph-btn" onclick="dashboard.removeGraph('${graphId}')">×</button>
                    </div>
                    ${modeRow}
                    ${timeframeRow}
                    ${tickerSelector}
                </div>
                <div class="graph-card-body">
                    <canvas id="${canvasId}"></canvas>
                </div>
                <div class="graph-resize-handle"></div>
            `;

            portfolioView.appendChild(graphCard);

            // Market activity: mode + timeframe listeners
            if (isMarketActivityGraph) {
                const modeBtns = graphCard.querySelectorAll('.mode-btn');
                const timeframeBtns = graphCard.querySelectorAll('.timeframe-btn');
                const renderMarketWithState = () => {
                    const mode = graphCard.querySelector('.mode-btn.active')?.dataset.mode || 'net-trades';
                    const timeframe = graphCard.querySelector('.timeframe-btn.active')?.dataset.timeframe || '1y';
                    mode === 'by-ticker'
                        ? this.renderMarketActivityByTicker(canvasId, timeframe)
                        : this.renderMarketActivity(canvasId, timeframe);
                };
                modeBtns.forEach(btn => btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    modeBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    renderMarketWithState();
                }));
                timeframeBtns.forEach(btn => btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    timeframeBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    renderMarketWithState();
                }));
            }

            // Stock analysis: mode listener
            if (isStockAnalysisGraph) {
                const modeBtns = graphCard.querySelectorAll('.mode-btn');
                const renderAnalysisWithState = () => {
                    const mode = graphCard.querySelector('.mode-btn.active')?.dataset.mode || 'by-price';
                    const ticker = graphCard.querySelector('.ticker-selector-input')?.value || null;
                    mode === 'by-date'
                        ? this.renderBuySellsByDate(canvasId, ticker)
                        : this.renderBuySellAnalysis(canvasId, ticker);
                };
                modeBtns.forEach(btn => btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    modeBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    renderAnalysisWithState();
                }));
            }

            // Performance graph: mode + timeframe listeners (short-term → daily, long-term → weekly)
            if (isPerformanceGraph) {
                const modeBtns = graphCard.querySelectorAll('.mode-btn');
                const timeframeBtns = graphCard.querySelectorAll('.timeframe-btn');

                const renderWithActiveState = () => {
                    const mode = graphCard.querySelector('.mode-btn.active')?.dataset.mode || 'twr';
                    const timeframe = graphCard.querySelector('.timeframe-btn.active')?.dataset.timeframe || '1y';
                    const useDaily = SHORT_TERM_TFS.has(timeframe);
                    if (mode === 'sp-equivalent') {
                        useDaily
                            ? this.renderSPEquivalentPerformance(canvasId, timeframe)
                            : this.renderSPEquivalentPerformanceWeekly(canvasId, timeframe);
                    } else {
                        useDaily
                            ? this.renderPortfolioPerformance(canvasId, timeframe)
                            : this.renderPortfolioPerformanceWeekly(canvasId, timeframe);
                    }
                };

                modeBtns.forEach(btn => btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    modeBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    renderWithActiveState();
                }));

                timeframeBtns.forEach(btn => btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    timeframeBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    renderWithActiveState();
                }));
            }

            // Asset allocation: mode listener (All Assets + category columns)
            if (isAllocationGraph) {
                const modeBtns = graphCard.querySelectorAll('.mode-btn');
                modeBtns.forEach(btn => btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    modeBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    if (btn.dataset.mode === 'all-assets') {
                        this.renderAssetAllocation(canvasId);
                    } else {
                        this.renderCategoryAllocation(canvasId, btn.dataset.mode);
                    }
                }));
            }

            // Ticker selector for stock-analysis (and legacy buys-sells graphs)
            if (isStockAnalysisGraph || graphId === 'buys-sells-analysis' || graphId === 'buys-sells-by-date') {
                this.setupTickerSelector(graphCard, canvasId, graphId);
            }

            // Add resize functionality
            const resizeHandle = graphCard.querySelector('.graph-resize-handle');
            resizeHandle.addEventListener('mousedown', (e) => this.handleGraphResizeStart(e, graphId));

            // Add drag event listeners
            graphCard.addEventListener('dragstart', (e) => this.handleGraphDragStart(e));
            graphCard.addEventListener('dragover', (e) => this.handleGraphDragOver(e));
            graphCard.addEventListener('drop', (e) => this.handleGraphDrop(e));
            graphCard.addEventListener('dragend', (e) => this.handleGraphDragEnd(e));
            graphCard.addEventListener('dragenter', (e) => this.handleGraphDragEnter(e));
            graphCard.addEventListener('dragleave', (e) => this.handleGraphDragLeave(e));

            // Render specific graph type
            setTimeout(() => {
                this.renderGraph(graphId, canvasId);
            }, 0);
        });
    }

    renderPortfolioDivider(entry) {
        const portfolioView = document.getElementById('portfolioView');
        const divider = document.createElement('div');
        divider.className = 'portfolio-divider';
        if (entry.title) divider.classList.add('has-title');
        divider.draggable = true;
        divider.dataset.graphId = entry.id;
        divider.style.gridColumn = 'span 6';

        if (entry.title) {
            divider.innerHTML = `
                <div class="divider-content">
                    <div class="divider-line"></div>
                    <span class="divider-title">${entry.title}</span>
                    <div class="divider-line"></div>
                </div>
                <button class="divider-remove-btn">×</button>
            `;
        } else {
            divider.innerHTML = `
                <div class="divider-line"></div>
                <button class="divider-remove-btn">×</button>
            `;
        }

        const removeBtn = divider.querySelector('.divider-remove-btn');
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.removeGraph(entry.id);
        });

        divider.addEventListener('dragstart', (e) => this.handleGraphDragStart(e));
        divider.addEventListener('dragover', (e) => this.handleGraphDragOver(e));
        divider.addEventListener('drop', (e) => this.handleGraphDrop(e));
        divider.addEventListener('dragend', (e) => this.handleGraphDragEnd(e));
        divider.addEventListener('dragenter', (e) => this.handleGraphDragEnter(e));
        divider.addEventListener('dragleave', (e) => this.handleGraphDragLeave(e));

        portfolioView.appendChild(divider);
    }

    async renderGraph(graphId, canvasId) {
        // Legacy category-* graphs
        if (graphId.startsWith('category-')) {
            const categoryName = graphId.replace('category-', '');
            await this.renderCategoryAllocation(canvasId, categoryName);
            return;
        }

        switch(graphId) {
            case 'asset-allocation': {
                const card = document.getElementById(`portfolio-graph-${graphId}`);
                const activeMode = card?.querySelector('.mode-btn.active')?.dataset.mode || 'all-assets';
                if (activeMode === 'all-assets') {
                    await this.renderAssetAllocation(canvasId);
                } else {
                    await this.renderCategoryAllocation(canvasId, activeMode);
                }
                break;
            }
            case 'market-activity': {
                const card = document.getElementById(`portfolio-graph-${graphId}`);
                const mode = card?.querySelector('.mode-btn.active')?.dataset.mode || 'net-trades';
                const timeframe = card?.querySelector('.timeframe-btn.active')?.dataset.timeframe || '1y';
                mode === 'by-ticker'
                    ? await this.renderMarketActivityByTicker(canvasId, timeframe)
                    : await this.renderMarketActivity(canvasId, timeframe);
                break;
            }
            case 'stock-analysis': {
                const card = document.getElementById(`portfolio-graph-${graphId}`);
                const mode = card?.querySelector('.mode-btn.active')?.dataset.mode || 'by-price';
                const ticker = card?.querySelector('.ticker-selector-input')?.value || null;
                mode === 'by-date'
                    ? await this.renderBuySellsByDate(canvasId, ticker)
                    : await this.renderBuySellAnalysis(canvasId, ticker);
                break;
            }
            // Legacy graph IDs — kept for backwards compatibility
            case 'market-activity-by-ticker':
                await this.renderMarketActivityByTicker(canvasId);
                break;
            case 'buys-sells-analysis':
                await this.renderBuySellAnalysis(canvasId);
                break;
            case 'buys-sells-by-date':
                await this.renderBuySellsByDate(canvasId);
                break;
            case 'portfolio-performance': {
                const card = document.getElementById(`portfolio-graph-${graphId}`);
                const mode = card?.querySelector('.mode-btn.active')?.dataset.mode || 'twr';
                const timeframe = card?.querySelector('.timeframe-btn.active')?.dataset.timeframe || '1y';
                const useDaily = new Set(['7d', '28d', '3m']).has(timeframe);
                if (mode === 'sp-equivalent') {
                    useDaily
                        ? await this.renderSPEquivalentPerformance(canvasId, timeframe)
                        : await this.renderSPEquivalentPerformanceWeekly(canvasId, timeframe);
                } else {
                    useDaily
                        ? await this.renderPortfolioPerformance(canvasId, timeframe)
                        : await this.renderPortfolioPerformanceWeekly(canvasId, timeframe);
                }
                break;
            }
            default: {
                const canvas = document.getElementById(canvasId);
                if (canvas) {
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#666';
                    ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto';
                    ctx.textAlign = 'center';
                    ctx.fillText('Graph visualization coming soon', canvas.width / 2, canvas.height / 2);
                }
                break;
            }
        }
    }

    rerenderPortfolioCharts() {
        this.portfolioCharts.forEach(chart => chart.destroy());
        this.portfolioCharts.clear();

        this.portfolioGraphs.forEach((graphEntry, index) => {
            if (graphEntry.isDivider) return;
            const graphId = typeof graphEntry === 'string' ? graphEntry : graphEntry.id;
            const canvasId = `portfolio-chart-${index}`;

            // Preserve active timeframe for graphs that have timeframe buttons
            const graphCard = document.getElementById(`portfolio-graph-${graphId}`);
            const activeTimeframeBtn = graphCard?.querySelector('.timeframe-btn.active');
            const timeframe = activeTimeframeBtn?.dataset.timeframe || '1y';

            setTimeout(() => {
                if (graphId === 'market-activity') {
                    const mode = graphCard?.querySelector('.mode-btn.active')?.dataset.mode || 'net-trades';
                    mode === 'by-ticker'
                        ? this.renderMarketActivityByTicker(canvasId, timeframe)
                        : this.renderMarketActivity(canvasId, timeframe);
                } else if (graphId === 'stock-analysis') {
                    const mode = graphCard?.querySelector('.mode-btn.active')?.dataset.mode || 'by-price';
                    const ticker = graphCard?.querySelector('.ticker-selector-input')?.value || null;
                    mode === 'by-date'
                        ? this.renderBuySellsByDate(canvasId, ticker)
                        : this.renderBuySellAnalysis(canvasId, ticker);
                } else if (graphId === 'portfolio-performance') {
                    const mode = graphCard?.querySelector('.mode-btn.active')?.dataset.mode || 'twr';
                    const tf = activeTimeframeBtn?.dataset.timeframe || '1y';
                    const useDaily = new Set(['7d', '28d', '3m']).has(tf);
                    if (mode === 'sp-equivalent') {
                        useDaily
                            ? this.renderSPEquivalentPerformance(canvasId, tf)
                            : this.renderSPEquivalentPerformanceWeekly(canvasId, tf);
                    } else {
                        useDaily
                            ? this.renderPortfolioPerformance(canvasId, tf)
                            : this.renderPortfolioPerformanceWeekly(canvasId, tf);
                    }
                } else {
                    this.renderGraph(graphId, canvasId);
                }
            }, 0);
        });
    }

    async fetchLatestPrices() {
        if (this.latestPricesState === 'loading') return;

        this.setHeaderRefreshState('loading');

        try {
            const positionsData = this.loadPortfolioData('positions');
            if (!positionsData || positionsData.length === 0) {
                this.setHeaderRefreshState('idle');
                return;
            }

            const symbols = [...new Set(positionsData.map(p => p.symbol))];
            this.latestPrices = await window.stockAPI.fetchPortfolioCurrentPrices(symbols);

            if (this.latestPrices.size === 0) throw new Error('No prices fetched');

            this.latestPricesState = 'active';
            this.setHeaderRefreshState('active');
            this.rerenderAllocationGraphs();
        } catch (err) {
            console.error('Failed to fetch latest prices:', err);
            this.latestPrices = null;
            this.latestPricesState = 'error';
            this.setHeaderRefreshState('error');
        }
    }

    toggleCurrentPrices() {
        this.useCurrentPrices = !this.useCurrentPrices;
        this.updateAllocationTimeBtns();

        if (this.useCurrentPrices && this.latestPricesState === 'idle') {
            this.fetchLatestPrices();
        } else {
            this.rerenderAllocationGraphs();
        }
    }

    setHeaderRefreshState(state) {
        this.latestPricesState = state;
        ['portfolioRefreshBtn', 'portfolioRefreshBtnMobile'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.classList.toggle('loading', state === 'loading');
        });
    }

    updateAllocationTimeBtns() {
        document.querySelectorAll('.allocation-time-btn').forEach(btn => {
            btn.classList.toggle('inactive', !this.useCurrentPrices);
            btn.title = this.useCurrentPrices
                ? 'Using current market prices'
                : 'Using acquisition prices';
        });
    }

    rerenderAllocationGraphs() {
        this.portfolioGraphs.forEach((graphEntry) => {
            if (graphEntry.isDivider) return;
            const graphId = typeof graphEntry === 'string' ? graphEntry : graphEntry.id;
            if (graphId !== 'asset-allocation' && !graphId.startsWith('category-')) return;

            const canvasId = this.graphCanvasMap.get(graphId);
            if (!canvasId) return;

            const existingChart = this.portfolioCharts.get(canvasId);
            if (existingChart) {
                existingChart.destroy();
                this.portfolioCharts.delete(canvasId);
            }
            this.renderGraph(graphId, canvasId);
        });
    }

    async getExchangeRate(from, to) {
        // Check cache first (cache for 1 hour)
        const cacheKey = `exchange_rate_${from}_${to}`;
        const cached = localStorage.getItem(cacheKey);
        const cacheTime = localStorage.getItem(`${cacheKey}_time`);

        if (cached && cacheTime) {
            const age = Date.now() - parseInt(cacheTime);
            if (age < 3600000) { // 1 hour
                this.hideExchangeRateWarning(); // Fresh data available
                return parseFloat(cached);
            }
        }

        try {
            // Use frankfurter.dev API (free, no API key needed)
            const response = await fetch(`https://api.frankfurter.dev/v1/latest?from=${from}&to=${to}`);
            const data = await response.json();

            if (data.rates && data.rates[to]) {
                const rate = data.rates[to];
                // Cache the rate
                localStorage.setItem(cacheKey, rate.toString());
                localStorage.setItem(`${cacheKey}_time`, Date.now().toString());
                this.hideExchangeRateWarning(); // Fresh data available
                return rate;
            }
        } catch (error) {
            console.error('Error fetching exchange rate:', error);
        }

        // Fallback: Use cached rate even if expired
        if (cached) {
            console.warn('Using expired exchange rate from cache');
            const cachedAge = cacheTime ? Math.floor((Date.now() - parseInt(cacheTime)) / 3600000) : '?';
            this.showExchangeRateWarning(`Using cached exchange rate (${cachedAge}h old). Unable to fetch latest rates.`);
            return parseFloat(cached);
        }

        // No cached data available at all
        this.showExchangeRateWarning('Unable to fetch exchange rates and no cached data available.');
        return null;
    }

    showExchangeRateWarning(message) {
        let banner = document.getElementById('exchangeRateWarning');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'exchangeRateWarning';
            banner.className = 'warning-banner';
            const container = document.querySelector('.container');
            const header = document.querySelector('header');
            if (container && header) {
                container.insertBefore(banner, header.nextSibling);
            }
        }
        banner.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            <span>${message}</span>
        `;
        banner.style.display = 'flex';
    }

    hideExchangeRateWarning() {
        const banner = document.getElementById('exchangeRateWarning');
        if (banner) {
            banner.style.display = 'none';
        }
    }

    async renderAssetAllocation(canvasId) {
        const rawPositions = this.loadPortfolioData('positions');
        const positionsData = rawPositions
            ? rawPositions.filter(p => !this.portfolioExcludedSymbols.has(p.symbol?.toUpperCase()))
            : null;
        const canvas = document.getElementById(canvasId);

        if (!canvas) return;

        if (!rawPositions || rawPositions.length === 0) {
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#666';
            ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto';
            ctx.textAlign = 'center';
            ctx.fillText('No positions data available. Upload positions data to see this chart.', canvas.width / 2, canvas.height / 2);
            return;
        }

        // Get exchange rate USD -> CAD
        let usdToCad = await this.getExchangeRate('USD', 'CAD');

        // If no exchange rate available, use 1:1 as fallback (warning already shown)
        if (!usdToCad) {
            usdToCad = 1.0;
        }

        // Convert all values to CAD — use latest market price if available, otherwise acquisition cost
        const usingLatest = this.useCurrentPrices && this.latestPricesState === 'active' && this.latestPrices;
        const positionsInCAD = positionsData.map(pos => {
            let value, priceCurrency;

            if (usingLatest) {
                const priceData = this.latestPrices.get(pos.symbol.toUpperCase());
                if (priceData) {
                    value = parseFloat(pos.quantity || 0) * priceData.currentPrice;
                    priceCurrency = priceData.currency;
                } else {
                    // Fallback to acquisition cost if this symbol's price wasn't fetched
                    value = parseFloat(pos.total_cost || 0);
                    priceCurrency = pos.currency;
                }
            } else {
                value = parseFloat(pos.total_cost || 0);
                priceCurrency = pos.currency;
            }

            const valueInCAD = priceCurrency === 'USD' ? value * usdToCad : value;

            return {
                ...pos,
                total_cost_cad: valueInCAD,
                original_value: value,
                original_currency: priceCurrency
            };
        });

        // Calculate total portfolio value in CAD
        const totalValue = positionsInCAD.reduce((sum, pos) => {
            return sum + pos.total_cost_cad;
        }, 0);

        // Sort by total_cost_cad descending
        const sortedPositions = [...positionsInCAD].sort((a, b) => {
            return b.total_cost_cad - a.total_cost_cad;
        });

        // Prepare datasets - one dataset per asset for stacked bar
        const datasets = [];
        const colors = [];

        // Define color palette
        const colorPalette = [
            '#1E4D5C', // Dark teal
            '#2A6B7D', // Medium teal
            '#3D8A9E', // Bright teal
            '#5FA89D', // Seafoam
            '#7FB685', // Sage green
            '#9FBD6E', // Olive
            '#C5B358', // Gold
            '#D9A54A', // Mustard
            '#E89447', // Orange gold
            '#EE7F43', // Tangerine
            '#F16940', // Bright orange
            '#D95944', // Rust orange
            '#C04848'  // Rust red
        ];

        sortedPositions.forEach((pos, index) => {
            const valueCAD = pos.total_cost_cad;
            const percentage = (valueCAD / totalValue * 100).toFixed(2);

            // Interpolate color based on position
            const color = this.interpolateColor(colorPalette, index, sortedPositions.length);
            colors.push(color);

            const priceData = usingLatest ? this.latestPrices?.get(pos.symbol.toUpperCase()) : null;
            const avgEntryPrice = parseFloat(pos.average_entry_price || 0);
            const currentPrice = priceData ? priceData.currentPrice : null;

            datasets.push({
                label: pos.symbol,
                data: [percentage],
                backgroundColor: color,
                borderColor: color,
                borderWidth: 1,
                percentage: percentage,
                value: valueCAD,
                originalValue: pos.original_value,
                originalCurrency: pos.original_currency,
                avgEntryPrice: avgEntryPrice,
                currentPrice: currentPrice
            });
        });

        const ctx = canvas.getContext('2d');
        const showValues = this.showValues;

        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Portfolio'],
                datasets: datasets
            },
            plugins: [ChartDataLabels],
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    datalabels: {
                        color: 'rgba(255, 255, 255, 0.9)',
                        font: {
                            size: 11,
                            weight: 600
                        },
                        rotation: -90,
                        align: 'center',
                        anchor: 'center',
                        clip: true,
                        formatter: function(value, context) {
                            // Get the symbol and remove anything after a dot
                            const symbol = context.dataset.label;
                            const cleanSymbol = symbol.split('.')[0];
                            return cleanSymbol;
                        },
                        display: function(context) {
                            // Calculate if the label fits
                            const dataset = context.dataset;
                            const percentage = parseFloat(dataset.percentage);

                            // Get the chart width
                            const chartWidth = context.chart.width;

                            // Calculate the segment width (percentage of chart width)
                            const segmentWidth = (percentage / 100) * chartWidth;

                            // Get clean symbol (before any dot)
                            const cleanSymbol = dataset.label.split('.')[0];

                            // Estimate label height when rotated (becomes width)
                            // Each character is roughly 5px wide when rotated (relaxed)
                            const labelWidth = cleanSymbol.length * 5;

                            // Only show if label fits (no padding requirement)
                            return segmentWidth > labelWidth;
                        }
                    },
                    tooltip: {
                        backgroundColor: '#1a1a1a',
                        borderColor: '#333',
                        borderWidth: 1,
                        titleColor: '#fff',
                        bodyColor: '#aaa',
                        callbacks: {
                            title: function(context) {
                                return context[0].dataset.label;
                            },
                            label: function(context) {
                                const dataset = context.dataset;
                                const lines = [];

                                if (showValues) {
                                    lines.push(`Value: ${window.dashboard.formatCurrency(dataset.value, 'CAD')}`);
                                    // Show original currency if it was USD
                                    if (dataset.originalCurrency === 'USD') {
                                        lines.push(`(${window.dashboard.formatCurrency(dataset.originalValue, 'USD')})`);
                                    }
                                }
                                lines.push(`Allocation: ${dataset.percentage}%`);

                                if (dataset.currentPrice !== null && dataset.avgEntryPrice > 0) {
                                    const growth = ((dataset.currentPrice - dataset.avgEntryPrice) / dataset.avgEntryPrice) * 100;
                                    const sign = growth >= 0 ? '+' : '';
                                    lines.push(`Growth: ${sign}${growth.toFixed(2)}%`);
                                }

                                return lines;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        stacked: true,
                        max: 100,
                        grid: {
                            color: '#2a2a2a',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#666',
                            callback: function(value) {
                                return value + '%';
                            }
                        }
                    },
                    y: {
                        stacked: true,
                        display: false,
                        grid: {
                            display: false,
                            drawBorder: false
                        }
                    }
                }
            }
        });

        // Store chart instance
        this.portfolioCharts.set(canvasId, chart);
    }

    showGraphMessage(canvas, message) {
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#666';
        ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto';
        ctx.textAlign = 'center';
        ctx.fillText(message, canvas.width / 2, canvas.height / 2);
    }

    // Interpolate between colors in a palette
    interpolateColor(palette, index, totalItems) {
        // Map index to a position in the palette (0 to palette.length - 1)
        const position = (index / (totalItems - 1)) * (palette.length - 1);
        const lowerIndex = Math.floor(position);
        const upperIndex = Math.ceil(position);
        const fraction = position - lowerIndex;

        // If at exact palette position, return that color
        if (fraction === 0) {
            return palette[lowerIndex];
        }

        // Parse hex colors
        const parseHex = (hex) => {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return { r, g, b };
        };

        // Interpolate between two colors
        const color1 = parseHex(palette[lowerIndex]);
        const color2 = parseHex(palette[upperIndex]);

        const r = Math.round(color1.r + (color2.r - color1.r) * fraction);
        const g = Math.round(color1.g + (color2.g - color1.g) * fraction);
        const b = Math.round(color1.b + (color2.b - color1.b) * fraction);

        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }

    async renderCategoryAllocation(canvasId, categoryName) {
        const rawPositions = this.loadPortfolioData('positions');
        const positionsData = rawPositions
            ? rawPositions.filter(p => !this.portfolioExcludedSymbols.has(p.symbol?.toUpperCase()))
            : null;
        const categoriesData = this.loadCategoriesData();
        const canvas = document.getElementById(canvasId);

        if (!canvas) return;

        const existingChart = this.portfolioCharts.get(canvasId);
        if (existingChart) {
            existingChart.destroy();
            this.portfolioCharts.delete(canvasId);
        }

        // Validate data availability
        if (!rawPositions || rawPositions.length === 0) {
            this.showGraphMessage(canvas, 'No positions data available. Upload positions data to see this chart.');
            return;
        }

        if (!categoriesData || categoriesData.length === 0) {
            this.showGraphMessage(canvas, 'No categories data available. Upload categories data to see this chart.');
            return;
        }

        // Get exchange rate USD -> CAD
        const usdToCad = await this.getExchangeRate('USD', 'CAD');

        if (!usdToCad) {
            this.showGraphMessage(canvas, 'Unable to fetch exchange rates. Please try again.');
            return;
        }

        // Create a map of symbol -> category value
        const symbolToCategoryValue = new Map();
        categoriesData.forEach(row => {
            const categoryValue = row[categoryName];
            if (categoryValue && categoryValue.trim() !== '' && categoryValue !== 'N/A') {
                symbolToCategoryValue.set(row.symbol, categoryValue.trim());
            }
        });

        // Convert all positions to CAD and add category value — use latest price if available
        const usingLatest = this.useCurrentPrices && this.latestPricesState === 'active' && this.latestPrices;
        const positionsWithCategory = [];
        positionsData.forEach(pos => {
            const categoryValue = symbolToCategoryValue.get(pos.symbol);
            if (!categoryValue) {
                console.warn(`Symbol ${pos.symbol} not found in ${categoryName} category or has N/A value`);
                return; // Skip positions without category data
            }

            let value, priceCurrency;

            if (usingLatest) {
                const priceData = this.latestPrices.get(pos.symbol.toUpperCase());
                if (priceData) {
                    value = parseFloat(pos.quantity || 0) * priceData.currentPrice;
                    priceCurrency = priceData.currency;
                } else {
                    value = parseFloat(pos.total_cost || 0);
                    priceCurrency = pos.currency;
                }
            } else {
                value = parseFloat(pos.total_cost || 0);
                priceCurrency = pos.currency;
            }

            const valueInCAD = priceCurrency === 'USD' ? value * usdToCad : value;

            const latestPriceData = usingLatest ? this.latestPrices?.get(pos.symbol.toUpperCase()) : null;
            const costBasisCAD = parseFloat(pos.total_cost || 0) * (pos.currency === 'USD' ? usdToCad : 1);
            positionsWithCategory.push({
                symbol: pos.symbol,
                categoryValue: categoryValue,
                total_cost_cad: valueInCAD,
                cost_basis_cad: costBasisCAD,
                original_value: value,
                original_currency: priceCurrency,
                avgEntryPrice: parseFloat(pos.average_entry_price || 0),
                currentPrice: latestPriceData ? latestPriceData.currentPrice : null
            });
        });

        if (positionsWithCategory.length === 0) {
            this.showGraphMessage(canvas, `No position data found for stocks in ${categoryName} category.`);
            return;
        }

        // Group by category value and sum the totals
        const categoryGroups = new Map();
        positionsWithCategory.forEach(pos => {
            const existing = categoryGroups.get(pos.categoryValue) || {
                categoryValue: pos.categoryValue,
                total_cad: 0,
                total_cost_basis_cad: 0,
                stocks: []
            };
            existing.total_cad += pos.total_cost_cad;
            existing.total_cost_basis_cad += pos.cost_basis_cad;
            existing.stocks.push(pos);
            categoryGroups.set(pos.categoryValue, existing);
        });

        // Calculate total value across all groups
        const totalValue = Array.from(categoryGroups.values()).reduce((sum, group) => {
            return sum + group.total_cad;
        }, 0);

        // Sort groups by total value descending
        const sortedGroups = Array.from(categoryGroups.values()).sort((a, b) => {
            return b.total_cad - a.total_cad;
        });

        // Prepare datasets - one dataset per category value for stacked bar
        const datasets = [];

        // Define color palette
        const colorPalette = [
            '#1E4D5C', // Dark teal
            '#2A6B7D', // Medium teal
            '#3D8A9E', // Bright teal
            '#5FA89D', // Seafoam
            '#7FB685', // Sage green
            '#9FBD6E', // Olive
            '#C5B358', // Gold
            '#D9A54A', // Mustard
            '#E89447', // Orange gold
            '#EE7F43', // Tangerine
            '#F16940', // Bright orange
            '#D95944', // Rust orange
            '#C04848'  // Rust red
        ];

        sortedGroups.forEach((group, index) => {
            const valueCAD = group.total_cad;
            const percentage = (valueCAD / totalValue * 100).toFixed(2);

            // Interpolate color based on position
            const color = this.interpolateColor(colorPalette, index, sortedGroups.length);

            const groupGrowth = usingLatest && group.total_cost_basis_cad > 0
                ? ((group.total_cad - group.total_cost_basis_cad) / group.total_cost_basis_cad) * 100
                : null;

            datasets.push({
                label: group.categoryValue,
                data: [percentage],
                backgroundColor: color,
                borderColor: color,
                borderWidth: 1,
                percentage: percentage,
                value: valueCAD,
                groupGrowth: groupGrowth,
                stocks: group.stocks
            });
        });

        const ctx = canvas.getContext('2d');
        const showValues = this.showValues;

        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: [categoryName],
                datasets: datasets
            },
            plugins: [ChartDataLabels],
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    datalabels: {
                        color: 'rgba(255, 255, 255, 0.9)',
                        font: {
                            size: 11,
                            weight: 600
                        },
                        rotation: -90,
                        align: 'center',
                        anchor: 'center',
                        clip: true,
                        formatter: function(value, context) {
                            // Return the category value as the label
                            return context.dataset.label;
                        },
                        display: function(context) {
                            // Calculate if the label fits
                            const dataset = context.dataset;
                            const percentage = parseFloat(dataset.percentage);

                            // Get the chart width
                            const chartWidth = context.chart.width;

                            // Calculate the segment width (percentage of chart width)
                            const segmentWidth = (percentage / 100) * chartWidth;

                            // Get clean label (category value)
                            const label = dataset.label;

                            // Estimate label height when rotated (becomes width)
                            // Each character is roughly 5px wide when rotated (relaxed)
                            const labelWidth = label.length * 5;

                            // Only show if label fits (no padding requirement)
                            return segmentWidth > labelWidth;
                        }
                    },
                    tooltip: {
                        backgroundColor: '#1a1a1a',
                        borderColor: '#333',
                        borderWidth: 1,
                        titleColor: '#fff',
                        bodyColor: '#aaa',
                        callbacks: {
                            title: function(context) {
                                return context[0].dataset.label;
                            },
                            label: function(context) {
                                const dataset = context.dataset;
                                const lines = [];

                                if (showValues) {
                                    lines.push(`Value: ${window.dashboard.formatCurrency(dataset.value, 'CAD')}`);
                                }
                                lines.push(`Allocation: ${dataset.percentage}%`);

                                if (dataset.groupGrowth !== null && dataset.groupGrowth !== undefined) {
                                    const sign = dataset.groupGrowth >= 0 ? '+' : '';
                                    lines.push(`Growth: ${sign}${dataset.groupGrowth.toFixed(2)}%`);
                                }

                                // Show list of stocks in this category value
                                if (dataset.stocks && dataset.stocks.length > 0) {
                                    lines.push(''); // Empty line
                                    lines.push('Stocks:');
                                    dataset.stocks.forEach(stock => {
                                        const stockPercent = (stock.total_cost_cad / dataset.value * 100).toFixed(1);
                                        let stockLine = `  ${stock.symbol}: ${stockPercent}%`;
                                        if (stock.currentPrice !== null && stock.avgEntryPrice > 0) {
                                            const growth = ((stock.currentPrice - stock.avgEntryPrice) / stock.avgEntryPrice) * 100;
                                            const sign = growth >= 0 ? '+' : '';
                                            stockLine += ` (${sign}${growth.toFixed(1)}%)`;
                                        }
                                        lines.push(stockLine);
                                    });
                                }

                                return lines;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        stacked: true,
                        max: 100,
                        grid: {
                            color: '#2a2a2a',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#666',
                            callback: function(value) {
                                return value + '%';
                            }
                        }
                    },
                    y: {
                        stacked: true,
                        display: false,
                        grid: {
                            display: false,
                            drawBorder: false
                        }
                    }
                }
            }
        });

        // Store chart instance
        this.portfolioCharts.set(canvasId, chart);
    }

    async renderMarketActivity(canvasId, timeframe = '1y') {
        const rawTrades = this.loadPortfolioData('trades');
        const tradesData = rawTrades
            ? rawTrades.filter(t => !this.portfolioExcludedSymbols.has(t.symbol?.toUpperCase()))
            : null;
        const positionsData = this.loadPortfolioData('positions');
        const canvas = document.getElementById(canvasId);

        if (!canvas) return;

        // Destroy existing chart if it exists
        const existingChart = this.portfolioCharts.get(canvasId);
        if (existingChart) {
            existingChart.destroy();
            this.portfolioCharts.delete(canvasId);
        }

        if (!rawTrades || rawTrades.length === 0) {
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#666';
            ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto';
            ctx.textAlign = 'center';
            ctx.fillText('No trades data available. Upload trades data to see this chart.', canvas.width / 2, canvas.height / 2);
            return;
        }

        // Debug: log first trade to see available fields
        if (tradesData.length > 0) {
            console.log('[Market Activity] Sample trade data:', tradesData[0]);
            console.log('[Market Activity] Available fields:', Object.keys(tradesData[0]));
        }

        // Get exchange rate USD -> CAD
        let usdToCad = await this.getExchangeRate('USD', 'CAD');

        // If no exchange rate available, use 1:1 as fallback (warning already shown)
        if (!usdToCad) {
            usdToCad = 1.0;
        }

        // Calculate total portfolio value in CAD for percentage calculations
        let totalPortfolioValue = 0;
        if (positionsData && positionsData.length > 0) {
            totalPortfolioValue = positionsData.reduce((sum, pos) => {
                const value = parseFloat(pos.total_cost || 0);
                const valueInCAD = pos.currency === 'USD' ? value * usdToCad : value;
                return sum + valueInCAD;
            }, 0);
        }

        // Generate month range based on timeframe
        const now = new Date();
        let monthsToShow = [];

        if (timeframe === 'all') {
            // Find the earliest trade date
            let earliestDate = now;
            tradesData.forEach(trade => {
                const date = new Date(trade.transaction_date);
                if (!isNaN(date.getTime()) && date < earliestDate) {
                    earliestDate = date;
                }
            });

            // Generate all months from earliest to now
            const startDate = new Date(earliestDate.getFullYear(), earliestDate.getMonth(), 1);
            const endDate = new Date(now.getFullYear(), now.getMonth(), 1);
            const currentDate = new Date(startDate);

            while (currentDate <= endDate) {
                const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
                monthsToShow.push({
                    key: monthKey,
                    label: currentDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short' }),
                    buys: 0,
                    sells: 0
                });
                currentDate.setMonth(currentDate.getMonth() + 1);
            }
        } else {
            // Generate months based on timeframe (1y = 12 months, 5y = 60 months)
            const monthCount = timeframe === '1y' ? 12 : 60;
            for (let i = monthCount - 1; i >= 0; i--) {
                const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                monthsToShow.push({
                    key: monthKey,
                    label: date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' }),
                    buys: 0,
                    sells: 0
                });
            }
        }

        // Process trades data - group by month
        let processedCount = 0;
        let skippedCount = 0;
        tradesData.forEach((trade, index) => {
            const type = trade.type?.toLowerCase();

            // Skip dividends (we only want trades)
            if (type === 'dividend') {
                skippedCount++;
                return;
            }

            const date = new Date(trade.transaction_date);
            if (isNaN(date.getTime())) {
                console.log('[Market Activity] Invalid date:', trade.transaction_date, 'in trade:', trade);
                skippedCount++;
                return; // Skip invalid dates
            }

            // Create month key (YYYY-MM)
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

            // Find if this month is in our selected timeframe
            const monthData = monthsToShow.find(m => m.key === monthKey);
            if (!monthData) {
                skippedCount++;
                return; // Skip if not in selected timeframe
            }

            // Parse amount (try multiple possible field names)
            let amount = 0;
            if (trade.net_amount) {
                amount = parseFloat(trade.net_amount);
            } else if (trade.amount) {
                amount = parseFloat(trade.amount);
            } else if (trade.value) {
                amount = parseFloat(trade.value);
            } else if (trade.total) {
                amount = parseFloat(trade.total);
            } else if (trade.total_cost) {
                amount = parseFloat(trade.total_cost);
            } else if (trade.quantity && trade.price) {
                amount = parseFloat(trade.quantity) * parseFloat(trade.price);
            } else if (trade.quantity && trade.average_entry_price) {
                amount = parseFloat(trade.quantity) * parseFloat(trade.average_entry_price);
            }

            if (isNaN(amount) || amount === 0) return;

            // Convert to CAD if needed
            const amountInCAD = trade.currency === 'USD' ? Math.abs(amount) * usdToCad : Math.abs(amount);

            // Determine if buy or sell based on amount sign or type
            const isBuy = (type === 'buy') || (type === 'trade' && amount > 0) || (type === 'liquidation');
            const isSell = (type === 'sell') || (type === 'trade' && amount < 0);

            if (isBuy) {
                monthData.buys += amountInCAD;
                processedCount++;
                if (processedCount <= 3) {
                    console.log('[Market Activity] Processing BUY:', {
                        date: trade.transaction_date,
                        monthKey,
                        symbol: trade.symbol,
                        amount,
                        amountInCAD,
                        monthTotal: monthData.buys
                    });
                }
            } else if (isSell) {
                monthData.sells += amountInCAD;
                processedCount++;
                if (processedCount <= 3) {
                    console.log('[Market Activity] Processing SELL:', {
                        date: trade.transaction_date,
                        monthKey,
                        symbol: trade.symbol,
                        amount,
                        amountInCAD,
                        monthTotal: monthData.sells
                    });
                }
            }
        });

        console.log('[Market Activity] Processed', processedCount, 'trades, skipped', skippedCount);

        // Extract labels and net activity
        const labels = monthsToShow.map(m => m.label);
        const netActivity = monthsToShow.map(m => m.buys - m.sells);

        // Debug: log processed data
        console.log('[Market Activity] Timeframe:', timeframe, '- Showing', monthsToShow.length, 'months');
        console.log('[Market Activity] Processed monthly data:', monthsToShow);
        console.log('[Market Activity] Net activity values:', netActivity);

        // Determine colors (bright teal for net buys, rust red for net sells - ends of asset allocation palette)
        const backgroundColors = netActivity.map(value => value >= 0 ? 'rgba(61, 138, 158, 0.7)' : 'rgba(192, 72, 72, 0.7)');
        const borderColors = netActivity.map(value => value >= 0 ? 'rgba(61, 138, 158, 1)' : 'rgba(192, 72, 72, 1)');

        const showValues = this.showValues;
        const formatCurrency = this.formatCurrency.bind(this);
        const currentTimeframe = timeframe; // Capture for use in chart options

        // Create chart
        const chart = new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Net Trading Activity',
                    data: netActivity,
                    backgroundColor: backgroundColors,
                    borderColor: borderColors,
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.9)',
                        padding: 12,
                        titleColor: '#fff',
                        bodyColor: '#fff',
                        borderColor: '#444',
                        borderWidth: 1,
                        callbacks: {
                            title: function(context) {
                                return context[0].label;
                            },
                            label: function(context) {
                                const value = context.parsed.y;
                                const lines = [];

                                if (showValues) {
                                    lines.push(`Net Activity: ${formatCurrency(Math.abs(value), 'CAD')}`);
                                    lines.push(value >= 0 ? '(Net Purchases)' : '(Net Sales)');
                                }

                                // Calculate percentage of portfolio
                                if (totalPortfolioValue > 0) {
                                    const percentage = (Math.abs(value) / totalPortfolioValue * 100).toFixed(2);
                                    lines.push(`${percentage}% of portfolio`);
                                }

                                return lines;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: '#2a2a2a',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#999',
                            maxRotation: 45,
                            minRotation: 45,
                            autoSkip: true,
                            maxTicksLimit: currentTimeframe === 'all' ? 20 : (currentTimeframe === '5y' ? 15 : 12)
                        }
                    },
                    y: {
                        grid: {
                            color: '#2a2a2a',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#999',
                            callback: function(value) {
                                // If eye icon is off, don't show dollar values
                                if (!showValues) {
                                    return '';
                                }

                                // Format y-axis labels as currency (abbreviated)
                                const absValue = Math.abs(value);
                                const sign = value < 0 ? '-' : '';

                                if (absValue === 0) {
                                    return '$0';
                                } else if (absValue >= 1000000) {
                                    return sign + '$' + (absValue / 1000000).toFixed(1) + 'M';
                                } else if (absValue >= 1000) {
                                    return sign + '$' + (absValue / 1000).toFixed(0) + 'K';
                                } else if (absValue >= 1) {
                                    return sign + '$' + absValue.toFixed(0);
                                } else {
                                    // For very small values, don't show
                                    return '';
                                }
                            }
                        }
                    }
                }
            }
        });

        // Store chart instance
        this.portfolioCharts.set(canvasId, chart);
    }

    async renderMarketActivityByTicker(canvasId, timeframe = '1y') {
        const rawTrades = this.loadPortfolioData('trades');
        const tradesData = rawTrades
            ? rawTrades.filter(t => !this.portfolioExcludedSymbols.has(t.symbol?.toUpperCase()))
            : null;
        const canvas = document.getElementById(canvasId);

        if (!canvas) return;

        // Destroy existing chart if it exists
        const existingChart = this.portfolioCharts.get(canvasId);
        if (existingChart) {
            existingChart.destroy();
            this.portfolioCharts.delete(canvasId);
        }

        if (!rawTrades || rawTrades.length === 0) {
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#666';
            ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto';
            ctx.textAlign = 'center';
            ctx.fillText('No trades data available. Upload trades data to see this chart.', canvas.width / 2, canvas.height / 2);
            return;
        }

        // Get exchange rate USD -> CAD
        let usdToCad = await this.getExchangeRate('USD', 'CAD');
        if (!usdToCad) {
            usdToCad = 1.0;
        }

        // Generate month range based on timeframe
        const now = new Date();
        let monthsToShow = [];

        if (timeframe === 'all') {
            let earliestDate = now;
            tradesData.forEach(trade => {
                const date = new Date(trade.transaction_date);
                if (!isNaN(date.getTime()) && date < earliestDate) {
                    earliestDate = date;
                }
            });

            const startDate = new Date(earliestDate.getFullYear(), earliestDate.getMonth(), 1);
            const endDate = new Date(now.getFullYear(), now.getMonth(), 1);
            const currentDate = new Date(startDate);

            while (currentDate <= endDate) {
                const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
                monthsToShow.push({
                    key: monthKey,
                    label: currentDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
                });
                currentDate.setMonth(currentDate.getMonth() + 1);
            }
        } else {
            const monthCount = timeframe === '1y' ? 12 : 60;
            for (let i = monthCount - 1; i >= 0; i--) {
                const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                monthsToShow.push({
                    key: monthKey,
                    label: date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
                });
            }
        }

        // Process trades: group by ticker and month
        const tickerMonthData = {}; // {ticker: {monthKey: netAmount}}
        const allTickers = new Set();

        tradesData.forEach(trade => {
            const type = trade.type?.toLowerCase();
            if (type === 'dividend') return;

            const date = new Date(trade.transaction_date);
            if (isNaN(date.getTime())) return;

            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            const monthData = monthsToShow.find(m => m.key === monthKey);
            if (!monthData) return;

            const ticker = trade.symbol;
            if (!ticker) return;

            let amount = 0;
            if (trade.net_amount) {
                amount = parseFloat(trade.net_amount);
            } else if (trade.quantity && trade.price) {
                amount = parseFloat(trade.quantity) * parseFloat(trade.price);
            }

            if (isNaN(amount) || amount === 0) return;

            // Convert to CAD
            const amountInCAD = trade.currency === 'USD' ? amount * usdToCad : amount;

            // Initialize ticker data if needed
            if (!tickerMonthData[ticker]) {
                tickerMonthData[ticker] = {};
            }

            // Add to ticker's month total (amount is already signed: positive for buys, negative for sells)
            if (!tickerMonthData[ticker][monthKey]) {
                tickerMonthData[ticker][monthKey] = 0;
            }
            tickerMonthData[ticker][monthKey] += amountInCAD;
            allTickers.add(ticker);
        });

        // Create datasets (one per ticker)
        const labels = monthsToShow.map(m => m.label);
        const datasets = [];
        const tickerArray = Array.from(allTickers).sort();

        // Green/teal side of the palette for buys, orange/red side for sells
        const greenPalette = [
            '#1E4D5C', // Dark teal
            '#2A6B7D', // Medium teal
            '#3D8A9E', // Bright teal
            '#5FA89D', // Seafoam
            '#7FB685', // Sage green
            '#9FBD6E', // Olive
        ];
        const redPalette = [
            '#C5B358', // Gold
            '#D9A54A', // Mustard
            '#E89447', // Orange gold
            '#EE7F43', // Tangerine
            '#F16940', // Bright orange
            '#D95944', // Rust orange
            '#C04848', // Rust red
        ];

        tickerArray.forEach((ticker, index) => {
            const data = monthsToShow.map(month => {
                return tickerMonthData[ticker][month.key] || 0;
            });

            const total = Math.max(tickerArray.length, 2);
            const greenColor = this.interpolateColor(greenPalette, index, total);
            const redColor = this.interpolateColor(redPalette, index, total);

            datasets.push({
                label: ticker,
                data: data,
                backgroundColor: function(context) {
                    const value = context.parsed?.y ?? 0;
                    return value >= 0 ? greenColor : redColor;
                },
                borderColor: function(context) {
                    const value = context.parsed?.y ?? 0;
                    return value >= 0 ? greenColor : redColor;
                },
                borderWidth: 1,
                stack: 'stack0'
            });
        });

        const showValues = this.showValues;
        const formatCurrency = this.formatCurrency.bind(this);
        const currentTimeframe = timeframe;

        // Create chart
        const chart = new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: labels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.9)',
                        padding: 12,
                        titleColor: '#fff',
                        bodyColor: '#fff',
                        borderColor: '#444',
                        borderWidth: 1,
                        callbacks: {
                            title: function(context) {
                                return context[0].label;
                            },
                            label: function(context) {
                                const ticker = context.dataset.label;
                                const value = context.parsed.y;
                                const lines = [];

                                if (showValues) {
                                    lines.push(`${ticker}: ${formatCurrency(Math.abs(value), 'CAD')}`);
                                    lines.push(value >= 0 ? '(Bought)' : '(Sold)');
                                } else {
                                    lines.push(`${ticker}: ${value >= 0 ? 'Bought' : 'Sold'}`);
                                }

                                return lines;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        stacked: true,
                        grid: {
                            color: '#2a2a2a',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#999',
                            maxRotation: 45,
                            minRotation: 45,
                            autoSkip: true,
                            maxTicksLimit: currentTimeframe === 'all' ? 20 : (currentTimeframe === '5y' ? 15 : 12)
                        }
                    },
                    y: {
                        stacked: true,
                        grid: {
                            color: '#2a2a2a',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#999',
                            callback: function(value) {
                                if (!showValues) {
                                    return '';
                                }

                                const absValue = Math.abs(value);
                                const sign = value < 0 ? '-' : '';

                                if (absValue === 0) {
                                    return '$0';
                                } else if (absValue >= 1000000) {
                                    return sign + '$' + (absValue / 1000000).toFixed(1) + 'M';
                                } else if (absValue >= 1000) {
                                    return sign + '$' + (absValue / 1000).toFixed(0) + 'K';
                                } else if (absValue >= 1) {
                                    return sign + '$' + absValue.toFixed(0);
                                } else {
                                    return '';
                                }
                            }
                        }
                    }
                }
            }
        });

        // Store chart instance
        this.portfolioCharts.set(canvasId, chart);
    }

    setupTickerSelector(graphCard, canvasId, graphId) {
        const input = graphCard.querySelector('.ticker-selector-input');
        const dropdown = graphCard.querySelector('.ticker-dropdown');
        const tickerList = graphCard.querySelector('.ticker-list');

        // Get all unique tickers from trades, excluding hidden symbols
        const tradesData = this.loadPortfolioData('trades');
        const tickers = new Set();
        if (tradesData) {
            tradesData.forEach(trade => {
                if (trade.symbol && trade.type?.toLowerCase() !== 'dividend' &&
                    !this.portfolioExcludedSymbols.has(trade.symbol.toUpperCase())) {
                    tickers.add(trade.symbol);
                }
            });
        }
        const sortedTickers = Array.from(tickers).sort();

        // Show dropdown on focus
        input.addEventListener('focus', () => {
            this.showTickerDropdown(input, dropdown, tickerList, sortedTickers, canvasId, graphId);
        });

        // Filter tickers as user types
        input.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            const filtered = sortedTickers.filter(ticker => ticker.toLowerCase().includes(query));
            this.showTickerDropdown(input, dropdown, tickerList, filtered, canvasId, graphId);
        });

        // Hide dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.ticker-selector-wrapper')) {
                dropdown.classList.add('hidden');
            }
        });
    }

    showTickerDropdown(input, dropdown, tickerList, tickers, canvasId, graphId) {
        tickerList.innerHTML = '';
        dropdown.classList.remove('hidden');

        if (tickers.length === 0) {
            tickerList.innerHTML = '<div class="ticker-list-empty">No tickers found</div>';
            return;
        }

        tickers.forEach(ticker => {
            const item = document.createElement('div');
            item.className = 'ticker-list-item';
            item.textContent = ticker;
            item.addEventListener('click', () => {
                input.value = ticker;
                dropdown.classList.add('hidden');
                if (graphId === 'stock-analysis') {
                    // Use active mode to decide which render to call
                    const card = document.getElementById('portfolio-graph-stock-analysis');
                    const mode = card?.querySelector('.mode-btn.active')?.dataset.mode || 'by-price';
                    mode === 'by-date'
                        ? this.renderBuySellsByDate(canvasId, ticker)
                        : this.renderBuySellAnalysis(canvasId, ticker);
                } else if (graphId === 'buys-sells-by-date') {
                    this.renderBuySellsByDate(canvasId, ticker);
                    // Sync the legacy paired graph if present
                    const pairedCanvasId = this.graphCanvasMap.get('buys-sells-analysis');
                    if (pairedCanvasId) {
                        const pairedCard = document.getElementById('portfolio-graph-buys-sells-analysis');
                        if (pairedCard) pairedCard.querySelector('.ticker-selector-input').value = ticker;
                        this.renderBuySellAnalysis(pairedCanvasId, ticker);
                    }
                } else {
                    this.renderBuySellAnalysis(canvasId, ticker);
                    // Sync the legacy paired graph if present
                    const pairedCanvasId = this.graphCanvasMap.get('buys-sells-by-date');
                    if (pairedCanvasId) {
                        const pairedCard = document.getElementById('portfolio-graph-buys-sells-by-date');
                        if (pairedCard) pairedCard.querySelector('.ticker-selector-input').value = ticker;
                        this.renderBuySellsByDate(pairedCanvasId, ticker);
                    }
                }
            });
            tickerList.appendChild(item);
        });
    }

    async renderBuySellAnalysis(canvasId, ticker = null) {
        const tradesData = this.loadPortfolioData('trades');
        const canvas = document.getElementById(canvasId);

        if (!canvas) return;

        // Destroy existing chart if it exists
        const existingChart = this.portfolioCharts.get(canvasId);
        if (existingChart) {
            existingChart.destroy();
            this.portfolioCharts.delete(canvasId);
        }

        if (!tradesData || tradesData.length === 0) {
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#666';
            ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto';
            ctx.textAlign = 'center';
            ctx.fillText('No trades data available. Upload trades data to see this chart.', canvas.width / 2, canvas.height / 2);
            return;
        }

        if (!ticker) {
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#666';
            ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto';
            ctx.textAlign = 'center';
            ctx.fillText('Select a ticker to view buy/sell analysis', canvas.width / 2, canvas.height / 2);
            return;
        }

        // Get exchange rate USD -> CAD
        let usdToCad = await this.getExchangeRate('USD', 'CAD');
        if (!usdToCad) {
            usdToCad = 1.0;
        }

        // Process trades for selected ticker
        const priceData = {}; // {price: {buys: quantity, sells: quantity}}

        tradesData.forEach(trade => {
            if (trade.symbol !== ticker) return;

            const type = trade.type?.toLowerCase();
            if (type === 'dividend') return;

            const price = parseFloat(trade.price);
            if (isNaN(price) || price === 0) return;

            const quantity = parseFloat(trade.quantity);
            if (isNaN(quantity) || quantity === 0) return;

            // Round price to integer
            const roundedPrice = Math.round(price);

            if (!priceData[roundedPrice]) {
                priceData[roundedPrice] = { buys: 0, sells: 0 };
            }

            // Type 'trade' with positive quantity = buy, negative = sell
            if (type === 'trade' || type === 'buy' || type === 'sell') {
                if (quantity > 0 || type === 'buy') {
                    priceData[roundedPrice].buys += Math.abs(quantity);
                } else {
                    priceData[roundedPrice].sells += Math.abs(quantity);
                }
            }
        });

        // Sort prices
        const prices = Object.keys(priceData).map(p => parseInt(p)).sort((a, b) => a - b);
        const labels = prices.map(p => `$${p}`);

        // Prepare buy and sell data (buys positive, sells negative)
        const buyData = prices.map(price => priceData[price].buys);
        const sellData = prices.map(price => -priceData[price].sells); // Negative for left side

        const showValues = this.showValues;

        // Create chart
        const chart = new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Buys',
                        data: buyData,
                        backgroundColor: 'rgba(61, 138, 158, 0.7)',
                        borderColor: 'rgba(61, 138, 158, 1)',
                        borderWidth: 1
                    },
                    {
                        label: 'Sells',
                        data: sellData,
                        backgroundColor: 'rgba(192, 72, 72, 0.7)',
                        borderColor: 'rgba(192, 72, 72, 1)',
                        borderWidth: 1
                    }
                ]
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
                            color: '#999',
                            font: {
                                size: 11
                            },
                            boxWidth: 20,
                            padding: 12
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.9)',
                        padding: 12,
                        titleColor: '#fff',
                        bodyColor: '#fff',
                        borderColor: '#444',
                        borderWidth: 1,
                        callbacks: {
                            title: function(context) {
                                return `Price: ${context[0].label}`;
                            },
                            label: function(context) {
                                const value = Math.abs(context.parsed.y);
                                const type = context.dataset.label;
                                return `${type}: ${value.toFixed(2)} shares`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: '#2a2a2a',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#999',
                            maxRotation: 45,
                            autoSkip: true,
                            maxTicksLimit: 20
                        }
                    },
                    y: {
                        grid: {
                            color: '#2a2a2a',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#999',
                            callback: function(value) {
                                return Math.abs(value);
                            }
                        },
                        title: {
                            display: true,
                            text: 'Shares',
                            color: '#666',
                            font: { size: 11 }
                        }
                    }
                }
            }
        });

        // Store chart instance
        this.portfolioCharts.set(canvasId, chart);
    }

    async renderBuySellsByDate(canvasId, ticker = null) {
        const tradesData = this.loadPortfolioData('trades');
        const canvas = document.getElementById(canvasId);

        if (!canvas) return;

        // Destroy existing chart if it exists
        const existingChart = this.portfolioCharts.get(canvasId);
        if (existingChart) {
            existingChart.destroy();
            this.portfolioCharts.delete(canvasId);
        }

        if (!tradesData || tradesData.length === 0) {
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#666';
            ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto';
            ctx.textAlign = 'center';
            ctx.fillText('No trades data available. Upload trades data to see this chart.', canvas.width / 2, canvas.height / 2);
            return;
        }

        if (!ticker) {
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#666';
            ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto';
            ctx.textAlign = 'center';
            ctx.fillText('Select a ticker to view buy/sell analysis', canvas.width / 2, canvas.height / 2);
            return;
        }

        // Process trades for selected ticker, grouped by date
        // dateData stores quantity and cost for weighted-average price calculation
        const dateData = {}; // {dateStr: {buys, sells, buyCost, sellCost}}
        let firstTradeDate = null;

        tradesData.forEach(trade => {
            if (trade.symbol !== ticker) return;

            const type = trade.type?.toLowerCase();
            if (type === 'dividend') return;

            const quantity = parseFloat(trade.quantity);
            if (isNaN(quantity) || quantity === 0) return;

            const date = new Date(trade.transaction_date);
            if (isNaN(date.getTime())) return;

            const dateStr = date.toISOString().slice(0, 10); // YYYY-MM-DD

            if (!firstTradeDate || date < firstTradeDate) {
                firstTradeDate = date;
            }

            if (!dateData[dateStr]) {
                dateData[dateStr] = { buys: 0, sells: 0, buyCost: 0, sellCost: 0 };
            }

            if (type === 'trade' || type === 'buy' || type === 'sell') {
                const price = parseFloat(trade.price) || 0;
                const absQty = Math.abs(quantity);
                if (quantity > 0 || type === 'buy') {
                    dateData[dateStr].buys += absQty;
                    dateData[dateStr].buyCost += absQty * price;
                } else {
                    dateData[dateStr].sells += absQty;
                    dateData[dateStr].sellCost += absQty * price;
                }
            }
        });

        if (!firstTradeDate) {
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#666';
            ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto';
            ctx.textAlign = 'center';
            ctx.fillText(`No trades found for ${ticker}`, canvas.width / 2, canvas.height / 2);
            return;
        }

        // Build label array: all dates from first trade to today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const startDate = new Date(firstTradeDate);
        startDate.setHours(0, 0, 0, 0);

        // Only include dates that have actual trades to avoid a huge sparse axis
        const activeDates = Object.keys(dateData).sort();
        // Always include today as the right boundary label (no bar, just extends axis)
        const todayStr = today.toISOString().slice(0, 10);

        const labels = activeDates;
        const buyData = activeDates.map(d => dateData[d].buys);
        const sellData = activeDates.map(d => -dateData[d].sells); // negative for symmetry
        const buyAvgPrices = activeDates.map(d => {
            const d_ = dateData[d];
            return d_.buys > 0 ? d_.buyCost / d_.buys : null;
        });
        const sellAvgPrices = activeDates.map(d => {
            const d_ = dateData[d];
            return d_.sells > 0 ? d_.sellCost / d_.sells : null;
        });

        const showValues = this.showValues;

        const chart = new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Buys',
                        data: buyData,
                        backgroundColor: 'rgba(61, 138, 158, 0.7)',
                        borderColor: 'rgba(61, 138, 158, 1)',
                        borderWidth: 1
                    },
                    {
                        label: 'Sells',
                        data: sellData,
                        backgroundColor: 'rgba(192, 72, 72, 0.7)',
                        borderColor: 'rgba(192, 72, 72, 1)',
                        borderWidth: 1
                    }
                ]
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
                            color: '#999',
                            font: { size: 11 },
                            boxWidth: 20,
                            padding: 12
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.9)',
                        padding: 12,
                        titleColor: '#fff',
                        bodyColor: '#fff',
                        borderColor: '#444',
                        borderWidth: 1,
                        callbacks: {
                            title: function(context) {
                                return `Date: ${context[0].label}`;
                            },
                            label: function(context) {
                                const value = Math.abs(context.parsed.y);
                                const type = context.dataset.label;
                                const i = context.dataIndex;
                                const avgPrice = type === 'Buys' ? buyAvgPrices[i] : sellAvgPrices[i];
                                const priceStr = avgPrice != null ? ` @ $${avgPrice.toFixed(2)}` : '';
                                return `${type}: ${value.toFixed(2)} shares${priceStr}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: '#2a2a2a',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#999',
                            maxRotation: 45,
                            autoSkip: true,
                            maxTicksLimit: 20
                        },
                        title: {
                            display: true,
                            text: `${startDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })} → ${today.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}`,
                            color: '#666',
                            font: { size: 11 }
                        }
                    },
                    y: {
                        grid: {
                            color: '#2a2a2a',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#999',
                            callback: function(value) {
                                return Math.abs(value);
                            }
                        },
                        title: {
                            display: true,
                            text: 'Shares',
                            color: '#666',
                            font: { size: 11 }
                        }
                    }
                }
            }
        });

        this.portfolioCharts.set(canvasId, chart);
    }

    async renderPortfolioPerformance(canvasId, period = '28d') {
        const rawPositions = this.loadPortfolioData('positions');
        const rawTrades = this.loadPortfolioData('trades');
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const existingChart = this.portfolioCharts.get(canvasId);
        if (existingChart) {
            existingChart.destroy();
            this.portfolioCharts.delete(canvasId);
        }

        const showError = (msg) => {
            const c = canvas.getContext('2d');
            c.clearRect(0, 0, canvas.width, canvas.height);
            c.fillStyle = '#666';
            c.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto';
            c.textAlign = 'center';
            c.fillText(msg, canvas.width / 2, canvas.height / 2);
        };

        if ((!rawPositions || rawPositions.length === 0) && (!rawTrades || rawTrades.length === 0)) {
            showError('No portfolio data available. Upload positions or trades to see this chart.');
            return;
        }

        showError('Loading performance data...');

        let usdToCad = await this.getExchangeRate('USD', 'CAD') || 1.0;

        // Build symbol→currency map from positions (most reliable), supplemented by trades
        const symbolCurrency = {};
        if (rawPositions) {
            rawPositions.forEach(p => {
                if (p.symbol && p.currency) symbolCurrency[p.symbol.toUpperCase()] = p.currency;
            });
        }

        // Calendar-day lookback per period (data fetch is always 1y/1d — see below)
        const calendarDaysMap = { '7d': 7, '28d': 28, '3m': 90, '6m': 180 };
        const calendarDays = calendarDaysMap[period] ?? 28;

        // Determine symbols to fetch and how to compute holdings per day
        const useTrades = rawTrades && rawTrades.length > 0;
        let symbolsToFetch;
        // holdingsPerDay: tradingDay[] -> {symbol: signedQty}[], built after we know tradingDays
        let buildHoldingsPerDay;

        if (useTrades) {
            // Sort trades by date; exclude dividends
            const trades = rawTrades
                .filter(t => t.type?.toLowerCase() !== 'dividend' && parseFloat(t.quantity || 0) !== 0)
                .sort((a, b) => (a.transaction_date || '').localeCompare(b.transaction_date || ''));

            // Supplement currency map from trade records
            trades.forEach(t => {
                const sym = t.symbol?.toUpperCase();
                if (sym && t.currency && !symbolCurrency[sym]) symbolCurrency[sym] = t.currency;
            });

            // All symbols ever traded (respecting exclude filter)
            symbolsToFetch = [...new Set(
                trades
                    .map(t => t.symbol?.toUpperCase())
                    .filter(s => s && !this.portfolioExcludedSymbols.has(s))
            )];

            // Signed quantity: buy = positive, sell = negative
            const signedQty = (trade) => {
                const qty = parseFloat(trade.quantity || 0);
                const type = trade.type?.toLowerCase();
                if (type === 'buy')  return  Math.abs(qty);
                if (type === 'sell') return -Math.abs(qty);
                return qty; // 'trade' type: quantity carries the sign
            };

            buildHoldingsPerDay = (tradingDays) => {
                // Single O(trades + days) pass — walk trades in date order alongside days
                const result = [];
                const current = {}; // symbol -> running qty
                let ti = 0;
                for (const day of tradingDays) {
                    while (ti < trades.length && (trades[ti].transaction_date || '') <= day) {
                        const t = trades[ti++];
                        const sym = t.symbol?.toUpperCase();
                        if (!sym || this.portfolioExcludedSymbols.has(sym)) continue;
                        current[sym] = (current[sym] || 0) + signedQty(t);
                    }
                    result.push({ ...current });
                }
                return result;
            };
        } else {
            // Fall back to fixed positions snapshot
            const positions = (rawPositions || []).filter(
                p => !this.portfolioExcludedSymbols.has(p.symbol?.toUpperCase())
            );
            if (positions.length === 0) {
                showError('All positions are excluded. Adjust the filter to see this chart.');
                return;
            }
            symbolsToFetch = [...new Set(positions.map(p => p.symbol.toUpperCase()))];
            const fixed = {};
            positions.forEach(p => { fixed[p.symbol.toUpperCase()] = parseFloat(p.quantity || 0); });
            buildHoldingsPerDay = (tradingDays) => tradingDays.map(() => ({ ...fixed }));
        }

        if (symbolsToFetch.length === 0) {
            showError('No tradeable symbols found in portfolio data.');
            return;
        }

        // Fetch 1y/1d once per day and persist in localStorage.
        // All period views (7D→6M) slice this single dataset client-side — no extra Yahoo calls.
        // Historical daily closes never change, so end-of-day expiry is the right TTL.
        const allSymbols = [...symbolsToFetch, '^GSPC'];
        const cacheKey = [...allSymbols].sort().join(',');
        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        const LS_KEY = 'perf_price_cache';

        let priceHistory; // symbol -> {dateStr: closePrice}

        try {
            const stored = localStorage.getItem(LS_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (parsed.key === cacheKey && parsed.date === today) {
                    priceHistory = parsed.priceHistory;
                }
            }
        } catch (_) { /* ignore parse errors */ }

        if (!priceHistory) {
            priceHistory = {};
            try {
                const batchUrl = `/api/stocks/batch?symbols=${allSymbols.map(encodeURIComponent).join(',')}&range=1y&interval=1d`;
                const resp = await fetch(batchUrl);
                if (!resp.ok) throw new Error('Batch fetch failed');
                const batchData = await resp.json();

                for (const sym of allSymbols) {
                    const result = batchData[sym]?.chart?.result?.[0];
                    if (!result) continue;
                    const timestamps = result.timestamp;
                    const closes = result.indicators?.quote?.[0]?.close;
                    if (!timestamps || !closes) continue;
                    priceHistory[sym] = {};
                    timestamps.forEach((ts, i) => {
                        if (closes[i] != null) {
                            const dateStr = new Date(ts * 1000).toISOString().slice(0, 10);
                            priceHistory[sym][dateStr] = closes[i];
                        }
                    });
                }
            } catch (err) {
                console.error('[Portfolio Performance] Failed to fetch data:', err);
                showError('Failed to load performance data. Please try again.');
                return;
            }

            try {
                localStorage.setItem(LS_KEY, JSON.stringify({ key: cacheKey, date: today, priceHistory }));
            } catch (_) { /* ignore quota errors — cache is best-effort */ }
        }

        // Use S&P 500 trading days as the reference timeline, filtered to selected period
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - calendarDays);
        const cutoffStr = cutoff.toISOString().slice(0, 10);
        const sp500Dates = Object.keys(priceHistory['^GSPC'] || {}).sort();
        const tradingDays = sp500Dates.filter(d => d >= cutoffStr);

        if (tradingDays.length < 2) {
            showError('Not enough historical data available.');
            return;
        }

        // Build sorted date arrays per symbol for binary-search price lookups
        const symbolDates = {};
        for (const sym of symbolsToFetch) {
            symbolDates[sym] = Object.keys(priceHistory[sym] || {}).sort();
        }

        // Return most recent close for sym on or before targetDate (forward-fill gaps)
        const getPrice = (sym, targetDate) => {
            const prices = priceHistory[sym];
            if (!prices) return null;
            const dates = symbolDates[sym];
            if (!dates || dates.length === 0) return null;
            let lo = 0, hi = dates.length - 1, found = -1;
            while (lo <= hi) {
                const mid = (lo + hi) >> 1;
                if (dates[mid] <= targetDate) { found = mid; lo = mid + 1; }
                else { hi = mid - 1; }
            }
            return found >= 0 ? prices[dates[found]] : null;
        };

        // Build holdings for each trading day
        const holdingsPerDay = buildHoldingsPerDay(tradingDays);

        // Find first day that has any holdings
        const baseIdx = holdingsPerDay.findIndex(h =>
            Object.values(h).some(q => Math.abs(q) > 0.0001)
        );
        if (baseIdx === -1) {
            showError('No portfolio holdings found in this period.');
            return;
        }

        const effectiveDays = tradingDays.slice(baseIdx);
        const effectiveHoldings = holdingsPerDay.slice(baseIdx);

        // Time-weighted return via daily chain-linking:
        // Each day's factor = (value of YESTERDAY's holdings at TODAY's prices)
        //                   / (value of YESTERDAY's holdings at YESTERDAY's prices)
        // This strips out capital injections — a buy on day N only starts earning from day N+1.
        const portfolioChanges = [0]; // day 0 always starts at 0%
        let cumulativeFactor = 1.0;

        for (let i = 1; i < effectiveDays.length; i++) {
            const prevDay = effectiveDays[i - 1];
            const currDay = effectiveDays[i];
            const prevHoldings = effectiveHoldings[i - 1]; // held overnight into currDay

            let vPrev = 0, vCurr = 0;
            for (const [sym, qty] of Object.entries(prevHoldings)) {
                if (qty < 0.0001) continue; // skip zero and negative (oversold/data errors)
                const pPrev = getPrice(sym, prevDay);
                const pCurr = getPrice(sym, currDay);
                if (pPrev == null || pCurr == null) continue;
                const fx = (symbolCurrency[sym] || 'CAD') === 'USD' ? usdToCad : 1;
                vPrev += pPrev * qty * fx;
                vCurr += pCurr * qty * fx;
            }

            if (vPrev > 0) cumulativeFactor *= vCurr / vPrev;
            portfolioChanges.push((cumulativeFactor - 1) * 100);
        }

        // S&P 500 normalized from the same base date (simple price return is fine — no cash flows)
        const sp500Prices = effectiveDays.map(day => priceHistory['^GSPC']?.[day] ?? null);
        const baseSP500 = sp500Prices[0];
        const sp500Changes = sp500Prices.map(p =>
            baseSP500 > 0 && p != null ? ((p / baseSP500) - 1) * 100 : 0
        );

        // x-axis labels
        const labels = effectiveDays.map(d => {
            const date = new Date(d + 'T12:00:00Z');
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        });

        // Clear loading text before creating chart
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);

        const chart = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Portfolio',
                        data: portfolioChanges,
                        borderColor: '#3D8A9E',
                        backgroundColor: 'rgba(61, 138, 158, 0.08)',
                        borderWidth: 2,
                        pointRadius: 3,
                        pointHoverRadius: 5,
                        tension: 0.1,
                        fill: false
                    },
                    {
                        label: 'S&P 500',
                        data: sp500Changes,
                        borderColor: '#E8A838',
                        backgroundColor: 'rgba(232, 168, 56, 0.08)',
                        borderWidth: 2,
                        pointRadius: 3,
                        pointHoverRadius: 5,
                        tension: 0.1,
                        fill: false
                    }
                ]
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
                            color: '#999',
                            font: { size: 11 },
                            boxWidth: 20,
                            padding: 12
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.9)',
                        padding: 12,
                        titleColor: '#fff',
                        bodyColor: '#fff',
                        borderColor: '#444',
                        borderWidth: 1,
                        callbacks: {
                            title: (context) => context[0].label,
                            label: (context) => {
                                const val = context.parsed.y;
                                const sign = val >= 0 ? '+' : '';
                                return `${context.dataset.label}: ${sign}${val.toFixed(2)}%`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: '#2a2a2a', drawBorder: false },
                        ticks: {
                            color: '#999',
                            maxRotation: 45,
                            autoSkip: true,
                            maxTicksLimit: 14
                        }
                    },
                    y: {
                        grid: {
                            color: (context) => context.tick.value === 0 ? '#555' : '#2a2a2a',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#999',
                            callback: (value) => {
                                const sign = value >= 0 ? '+' : '';
                                return `${sign}${value.toFixed(1)}%`;
                            }
                        },
                        title: {
                            display: true,
                            text: 'Cumulative Return',
                            color: '#666',
                            font: { size: 11 }
                        }
                    }
                }
            }
        });

        this.portfolioCharts.set(canvasId, chart);
    }

    async renderPortfolioPerformanceWeekly(canvasId, period = '1y') {
        const rawPositions = this.loadPortfolioData('positions');
        const rawTrades = this.loadPortfolioData('trades');
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const existingChart = this.portfolioCharts.get(canvasId);
        if (existingChart) {
            existingChart.destroy();
            this.portfolioCharts.delete(canvasId);
        }

        const showError = (msg) => {
            const c = canvas.getContext('2d');
            c.clearRect(0, 0, canvas.width, canvas.height);
            c.fillStyle = '#666';
            c.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto';
            c.textAlign = 'center';
            c.fillText(msg, canvas.width / 2, canvas.height / 2);
        };

        if ((!rawPositions || rawPositions.length === 0) && (!rawTrades || rawTrades.length === 0)) {
            showError('No portfolio data available. Upload positions or trades to see this chart.');
            return;
        }

        showError('Loading performance data...');

        let usdToCad = await this.getExchangeRate('USD', 'CAD') || 1.0;

        // Build symbol→currency map
        const symbolCurrency = {};
        if (rawPositions) {
            rawPositions.forEach(p => {
                if (p.symbol && p.currency) symbolCurrency[p.symbol.toUpperCase()] = p.currency;
            });
        }

        // Calendar-day lookback per period
        const calendarDaysMap = { '6m': 182, '1y': 365, '2y': 730, '3y': 1095, '5y': 1825 };
        const calendarDays = calendarDaysMap[period] ?? 365;

        // Determine symbols and holdings builder (same trade/positions logic as daily chart)
        const useTrades = rawTrades && rawTrades.length > 0;
        let symbolsToFetch;
        let buildHoldingsPerWeek;

        if (useTrades) {
            const trades = rawTrades
                .filter(t => t.type?.toLowerCase() !== 'dividend' && parseFloat(t.quantity || 0) !== 0)
                .sort((a, b) => (a.transaction_date || '').localeCompare(b.transaction_date || ''));

            trades.forEach(t => {
                const sym = t.symbol?.toUpperCase();
                if (sym && t.currency && !symbolCurrency[sym]) symbolCurrency[sym] = t.currency;
            });

            symbolsToFetch = [...new Set(
                trades
                    .map(t => t.symbol?.toUpperCase())
                    .filter(s => s && !this.portfolioExcludedSymbols.has(s))
            )];

            const signedQty = (trade) => {
                const qty = parseFloat(trade.quantity || 0);
                const type = trade.type?.toLowerCase();
                if (type === 'buy')  return  Math.abs(qty);
                if (type === 'sell') return -Math.abs(qty);
                return qty;
            };

            buildHoldingsPerWeek = (weekDays) => {
                const result = [];
                const current = {};
                let ti = 0;
                for (const day of weekDays) {
                    while (ti < trades.length && (trades[ti].transaction_date || '') <= day) {
                        const t = trades[ti++];
                        const sym = t.symbol?.toUpperCase();
                        if (!sym || this.portfolioExcludedSymbols.has(sym)) continue;
                        current[sym] = (current[sym] || 0) + signedQty(t);
                    }
                    result.push({ ...current });
                }
                return result;
            };
        } else {
            // Fixed positions snapshot without trade history: applying current holdings
            // retroactively to years ago produces deeply misleading results. A stock
            // bought last month would show its full 5-year return as if held throughout.
            showError('Trade history required for multi-year performance. Upload your trades CSV to use this chart.');
            return;
        }

        if (symbolsToFetch.length === 0) {
            showError('No tradeable symbols found in portfolio data.');
            return;
        }

        // Fetch 5y of weekly data — cached once per day.
        // All period views (6M→5Y) slice this single dataset client-side.
        const allSymbols = [...symbolsToFetch, '^GSPC'];
        const cacheKey = [...allSymbols].sort().join(',');
        const today = new Date().toISOString().slice(0, 10);
        const LS_KEY = 'perf_weekly_price_cache_10y';

        let priceHistory;

        try {
            const stored = localStorage.getItem(LS_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (parsed.key === cacheKey && parsed.date === today) {
                    priceHistory = parsed.priceHistory;
                }
            }
        } catch (_) { /* ignore parse errors */ }

        if (!priceHistory) {
            priceHistory = {};
            try {
                const batchUrl = `/api/stocks/batch?symbols=${allSymbols.map(encodeURIComponent).join(',')}&range=10y&interval=1wk`;
                const resp = await fetch(batchUrl);
                if (!resp.ok) throw new Error('Batch fetch failed');
                const batchData = await resp.json();

                for (const sym of allSymbols) {
                    const result = batchData[sym]?.chart?.result?.[0];
                    if (!result) continue;
                    const timestamps = result.timestamp;
                    const closes = result.indicators?.quote?.[0]?.close;
                    if (!timestamps || !closes) continue;
                    priceHistory[sym] = {};
                    timestamps.forEach((ts, i) => {
                        if (closes[i] != null) {
                            const dateStr = new Date(ts * 1000).toISOString().slice(0, 10);
                            priceHistory[sym][dateStr] = closes[i];
                        }
                    });
                }
            } catch (err) {
                console.error('[Portfolio Performance Weekly] Failed to fetch data:', err);
                showError('Failed to load performance data. Please try again.');
                return;
            }

            try {
                localStorage.setItem(LS_KEY, JSON.stringify({ key: cacheKey, date: today, priceHistory }));
            } catch (_) { /* ignore quota errors — cache is best-effort */ }
        }

        // Filter weekly dates to selected period using ^GSPC as timeline reference
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - calendarDays);
        const cutoffStr = cutoff.toISOString().slice(0, 10);
        const sp500Dates = Object.keys(priceHistory['^GSPC'] || {}).sort();
        const weekDays = sp500Dates.filter(d => d >= cutoffStr);

        if (weekDays.length < 2) {
            showError('Not enough historical data available.');
            return;
        }

        // Build sorted date arrays per symbol for forward-fill lookups
        const symbolDates = {};
        for (const sym of symbolsToFetch) {
            symbolDates[sym] = Object.keys(priceHistory[sym] || {}).sort();
        }

        const getPrice = (sym, targetDate) => {
            const prices = priceHistory[sym];
            if (!prices) return null;
            const dates = symbolDates[sym];
            if (!dates || dates.length === 0) return null;
            let lo = 0, hi = dates.length - 1, found = -1;
            while (lo <= hi) {
                const mid = (lo + hi) >> 1;
                if (dates[mid] <= targetDate) { found = mid; lo = mid + 1; }
                else { hi = mid - 1; }
            }
            return found >= 0 ? prices[dates[found]] : null;
        };

        const holdingsPerWeek = buildHoldingsPerWeek(weekDays);

        // Find first week that has any holdings
        const baseIdx = holdingsPerWeek.findIndex(h =>
            Object.values(h).some(q => Math.abs(q) > 0.0001)
        );
        if (baseIdx === -1) {
            showError('No portfolio holdings found in this period.');
            return;
        }

        const effectiveDays = weekDays.slice(baseIdx);
        const effectiveHoldings = holdingsPerWeek.slice(baseIdx);

        // Time-weighted return via weekly chain-linking
        const portfolioChanges = [0];
        let cumulativeFactor = 1.0;

        for (let i = 1; i < effectiveDays.length; i++) {
            const prevDay = effectiveDays[i - 1];
            const currDay = effectiveDays[i];
            const prevHoldings = effectiveHoldings[i - 1];

            let vPrev = 0, vCurr = 0;
            for (const [sym, qty] of Object.entries(prevHoldings)) {
                if (qty < 0.0001) continue; // skip zero and negative (oversold/data errors)
                const pPrev = getPrice(sym, prevDay);
                const pCurr = getPrice(sym, currDay);
                if (pPrev == null || pCurr == null) continue;
                const fx = (symbolCurrency[sym] || 'CAD') === 'USD' ? usdToCad : 1;
                vPrev += pPrev * qty * fx;
                vCurr += pCurr * qty * fx;
            }

            if (vPrev > 0) cumulativeFactor *= vCurr / vPrev;
            portfolioChanges.push((cumulativeFactor - 1) * 100);
        }

        // S&P 500 normalized from the same base date
        const sp500Prices = effectiveDays.map(day => priceHistory['^GSPC']?.[day] ?? null);
        const baseSP500 = sp500Prices[0];
        const sp500Changes = sp500Prices.map(p =>
            baseSP500 > 0 && p != null ? ((p / baseSP500) - 1) * 100 : 0
        );

        // x-axis labels — show month+year for longer ranges, month+day for shorter
        const longRange = calendarDays > 400;
        const labels = effectiveDays.map(d => {
            const date = new Date(d + 'T12:00:00Z');
            return longRange
                ? date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
                : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        });

        // Subtitle shows actual covered range so the user can tell when data runs short
        const fmtDate = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        const actualStartDate = effectiveDays[0];
        const requestedStartDate = weekDays[0];
        const dateLimitedByTrades = actualStartDate > requestedStartDate;
        const subtitleText = dateLimitedByTrades
            ? `${fmtDate(actualStartDate)} → ${fmtDate(effectiveDays[effectiveDays.length - 1])} (trade history starts ${fmtDate(actualStartDate)})`
            : `${fmtDate(effectiveDays[0])} → ${fmtDate(effectiveDays[effectiveDays.length - 1])}`;

        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);

        const chart = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Portfolio',
                        data: portfolioChanges,
                        borderColor: '#3D8A9E',
                        backgroundColor: 'rgba(61, 138, 158, 0.08)',
                        borderWidth: 2,
                        pointRadius: 2,
                        pointHoverRadius: 4,
                        tension: 0.1,
                        fill: false
                    },
                    {
                        label: 'S&P 500',
                        data: sp500Changes,
                        borderColor: '#E8A838',
                        backgroundColor: 'rgba(232, 168, 56, 0.08)',
                        borderWidth: 2,
                        pointRadius: 2,
                        pointHoverRadius: 4,
                        tension: 0.1,
                        fill: false
                    }
                ]
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
                            color: '#999',
                            font: { size: 11 },
                            boxWidth: 20,
                            padding: 12
                        }
                    },
                    subtitle: {
                        display: true,
                        text: subtitleText,
                        color: dateLimitedByTrades ? '#a0522d' : '#555',
                        font: { size: 10 },
                        padding: { bottom: 6 }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(0, 0, 0, 0.9)',
                        padding: 12,
                        titleColor: '#fff',
                        bodyColor: '#fff',
                        borderColor: '#444',
                        borderWidth: 1,
                        callbacks: {
                            title: (context) => context[0].label,
                            label: (context) => {
                                const val = context.parsed.y;
                                const sign = val >= 0 ? '+' : '';
                                return `${context.dataset.label}: ${sign}${val.toFixed(2)}%`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: '#2a2a2a', drawBorder: false },
                        ticks: {
                            color: '#999',
                            maxRotation: 45,
                            autoSkip: true,
                            maxTicksLimit: longRange ? 12 : 14
                        }
                    },
                    y: {
                        grid: {
                            color: (context) => context.tick.value === 0 ? '#555' : '#2a2a2a',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#999',
                            callback: (value) => {
                                const sign = value >= 0 ? '+' : '';
                                return `${sign}${value.toFixed(1)}%`;
                            }
                        },
                        title: {
                            display: true,
                            text: 'Cumulative Return',
                            color: '#666',
                            font: { size: 11 }
                        }
                    }
                }
            }
        });

        this.portfolioCharts.set(canvasId, chart);
    }

    // ─── S&P 500 Equivalent Portfolio ─────────────────────────────────────────
    // Answers: "Would I have done better buying S&P 500 instead?"
    // Method: On period start, hypothetical S&P portfolio = actual portfolio value.
    //         For any buy/sell within the period, the same dollars flow into/out of
    //         the hypothetical S&P 500 position on the same date.
    //         Both lines show % change vs the initial portfolio value.
    //
    // Industry label: "S&P 500 Equivalent Portfolio" (Sharesight-style opportunity cost)
    // ──────────────────────────────────────────────────────────────────────────

    async renderSPEquivalentPerformance(canvasId, period = '28d') {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const rawPositions = this.loadPortfolioData('positions');
        const rawTrades = this.loadPortfolioData('trades');

        const existingChart = this.portfolioCharts.get(canvasId);
        if (existingChart) {
            existingChart.destroy();
            this.portfolioCharts.delete(canvasId);
        }

        const showError = (msg) => {
            const c = canvas.getContext('2d');
            c.clearRect(0, 0, canvas.width, canvas.height);
            c.fillStyle = '#666';
            c.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto';
            c.textAlign = 'center';
            c.fillText(msg, canvas.width / 2, canvas.height / 2);
        };

        if ((!rawPositions || rawPositions.length === 0) && (!rawTrades || rawTrades.length === 0)) {
            showError('No portfolio data available. Upload positions or trades to see this chart.');
            return;
        }

        showError('Loading performance data...');

        let usdToCad = await this.getExchangeRate('USD', 'CAD') || 1.0;

        const symbolCurrency = {};
        if (rawPositions) {
            rawPositions.forEach(p => {
                if (p.symbol && p.currency) symbolCurrency[p.symbol.toUpperCase()] = p.currency;
            });
        }

        const calendarDaysMap = { '7d': 7, '28d': 28, '3m': 90, '6m': 180 };
        const calendarDays = calendarDaysMap[period] ?? 28;

        const useTrades = rawTrades && rawTrades.length > 0;
        let symbolsToFetch;
        let buildHoldingsPerDay;
        let allTrades = [];

        if (useTrades) {
            const trades = rawTrades
                .filter(t => t.type?.toLowerCase() !== 'dividend' && parseFloat(t.quantity || 0) !== 0)
                .sort((a, b) => (a.transaction_date || '').localeCompare(b.transaction_date || ''));

            trades.forEach(t => {
                const sym = t.symbol?.toUpperCase();
                if (sym && t.currency && !symbolCurrency[sym]) symbolCurrency[sym] = t.currency;
            });

            symbolsToFetch = [...new Set(
                trades.map(t => t.symbol?.toUpperCase()).filter(s => s && !this.portfolioExcludedSymbols.has(s))
            )];

            const signedQty = (trade) => {
                const qty = parseFloat(trade.quantity || 0);
                const type = trade.type?.toLowerCase();
                if (type === 'buy')  return  Math.abs(qty);
                if (type === 'sell') return -Math.abs(qty);
                return qty;
            };

            buildHoldingsPerDay = (tradingDays) => {
                const result = [];
                const current = {};
                let ti = 0;
                for (const day of tradingDays) {
                    while (ti < trades.length && (trades[ti].transaction_date || '') <= day) {
                        const t = trades[ti++];
                        const sym = t.symbol?.toUpperCase();
                        if (!sym || this.portfolioExcludedSymbols.has(sym)) continue;
                        current[sym] = (current[sym] || 0) + signedQty(t);
                    }
                    result.push({ ...current });
                }
                return result;
            };

            allTrades = trades;
        } else {
            const positions = (rawPositions || []).filter(
                p => !this.portfolioExcludedSymbols.has(p.symbol?.toUpperCase())
            );
            if (positions.length === 0) {
                showError('All positions are excluded. Adjust the filter to see this chart.');
                return;
            }
            symbolsToFetch = [...new Set(positions.map(p => p.symbol.toUpperCase()))];
            const fixed = {};
            positions.forEach(p => { fixed[p.symbol.toUpperCase()] = parseFloat(p.quantity || 0); });
            buildHoldingsPerDay = (tradingDays) => tradingDays.map(() => ({ ...fixed }));
        }

        if (symbolsToFetch.length === 0) {
            showError('No tradeable symbols found in portfolio data.');
            return;
        }

        // Reuse same daily cache as TWR chart
        const allSymbols = [...symbolsToFetch, '^GSPC'];
        const cacheKey = [...allSymbols].sort().join(',');
        const today = new Date().toISOString().slice(0, 10);
        const LS_KEY = 'perf_price_cache';

        let priceHistory;
        try {
            const stored = localStorage.getItem(LS_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (parsed.key === cacheKey && parsed.date === today) priceHistory = parsed.priceHistory;
            }
        } catch (_) {}

        if (!priceHistory) {
            priceHistory = {};
            try {
                const batchUrl = `/api/stocks/batch?symbols=${allSymbols.map(encodeURIComponent).join(',')}&range=1y&interval=1d`;
                const resp = await fetch(batchUrl);
                if (!resp.ok) throw new Error('Batch fetch failed');
                const batchData = await resp.json();
                for (const sym of allSymbols) {
                    const result = batchData[sym]?.chart?.result?.[0];
                    if (!result) continue;
                    const timestamps = result.timestamp;
                    const closes = result.indicators?.quote?.[0]?.close;
                    if (!timestamps || !closes) continue;
                    priceHistory[sym] = {};
                    timestamps.forEach((ts, i) => {
                        if (closes[i] != null) {
                            const dateStr = new Date(ts * 1000).toISOString().slice(0, 10);
                            priceHistory[sym][dateStr] = closes[i];
                        }
                    });
                }
            } catch (err) {
                console.error('[SP Equivalent] Failed to fetch data:', err);
                showError('Failed to load performance data. Please try again.');
                return;
            }
            try {
                localStorage.setItem(LS_KEY, JSON.stringify({ key: cacheKey, date: today, priceHistory }));
            } catch (_) {}
        }

        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - calendarDays);
        const cutoffStr = cutoff.toISOString().slice(0, 10);
        const sp500Dates = Object.keys(priceHistory['^GSPC'] || {}).sort();
        const tradingDays = sp500Dates.filter(d => d >= cutoffStr);

        if (tradingDays.length < 2) {
            showError('Not enough historical data available.');
            return;
        }

        // Build sorted date index per symbol for binary-search forward-fill lookups
        const symbolDates = {};
        for (const sym of [...symbolsToFetch, '^GSPC']) {
            symbolDates[sym] = Object.keys(priceHistory[sym] || {}).sort();
        }

        const getPrice = (sym, targetDate) => {
            const prices = priceHistory[sym];
            if (!prices) return null;
            const dates = symbolDates[sym];
            if (!dates || dates.length === 0) return null;
            let lo = 0, hi = dates.length - 1, found = -1;
            while (lo <= hi) {
                const mid = (lo + hi) >> 1;
                if (dates[mid] <= targetDate) { found = mid; lo = mid + 1; }
                else { hi = mid - 1; }
            }
            return found >= 0 ? prices[dates[found]] : null;
        };

        const holdingsPerDay = buildHoldingsPerDay(tradingDays);

        const baseIdx = holdingsPerDay.findIndex(h => Object.values(h).some(q => Math.abs(q) > 0.0001));
        if (baseIdx === -1) {
            showError('No portfolio holdings found in this period.');
            return;
        }

        const effectiveDays = tradingDays.slice(baseIdx);
        const effectiveHoldings = holdingsPerDay.slice(baseIdx);
        const periodStart = effectiveDays[0];

        // Compute actual mark-to-market portfolio value for each day
        const actualValues = effectiveDays.map((day, i) => {
            let v = 0;
            for (const [sym, qty] of Object.entries(effectiveHoldings[i])) {
                if (qty < 0.0001) continue;
                const p = getPrice(sym, day);
                if (p == null) continue;
                const fx = (symbolCurrency[sym] || 'CAD') === 'USD' ? usdToCad : 1;
                v += p * qty * fx;
            }
            return v;
        });

        const baseActualValue = actualValues[0];
        if (!baseActualValue || baseActualValue <= 0) {
            showError('Could not compute portfolio value at start of period.');
            return;
        }

        // Parallel S&P 500 portfolio:
        // Both lines start at 0% on the left edge of the chart.
        // S&P portfolio is seeded with the same dollar value as the actual portfolio at period start.
        // Every buy/sell AFTER period start is mirrored into the S&P portfolio with the same dollars.
        // Running netCapital is the denominator — prevents capital injections from inflating returns.
        const baseSP500Price = getPrice('^GSPC', periodStart);
        if (!baseSP500Price || baseSP500Price <= 0) {
            showError('No S&P 500 price data available for this period.');
            return;
        }
        let spShares = baseActualValue / baseSP500Price;
        let netCapital = baseActualValue;

        // Build sorted list of intra-period trades (strictly after periodStart).
        // Sorting by date and using a cursor index (rather than a hash-lookup by exact date)
        // correctly handles trades on weekends/holidays — they get attributed to the next
        // trading day via the (prevDay, day] window below.
        const intraTrades = [];
        for (const t of allTrades) {
            if (!t.transaction_date || t.transaction_date <= periodStart) continue;
            const type = t.type?.toLowerCase();
            const rawQty = parseFloat(t.quantity || 0);
            const price  = parseFloat(t.price   || 0);
            if (price <= 0 || rawQty === 0) continue;
            const isBuy  = type === 'buy'  || (type === 'trade' && rawQty > 0);
            const isSell = type === 'sell' || (type === 'trade' && rawQty < 0);
            if (!isBuy && !isSell) continue;
            const sym = t.symbol?.toUpperCase();
            if (!sym || this.portfolioExcludedSymbols.has(sym)) continue;
            intraTrades.push({
                date: t.transaction_date,
                qty: Math.abs(rawQty),
                price,
                currency: t.currency || symbolCurrency[sym] || 'CAD',
                isBuy
            });
        }
        // allTrades is pre-sorted by transaction_date so intraTrades is already in order

        // Single O(trades + days) pass.
        // Each iteration applies trades whose date falls in (prevDay, day] so non-trading-day
        // trades are attributed to the next trading day rather than silently dropped.
        let tradeIdx = 0;
        const spValues   = [];
        const netCapitals = [];

        for (let i = 0; i < effectiveDays.length; i++) {
            const day     = effectiveDays[i];
            const prevDay = i > 0 ? effectiveDays[i - 1] : null;

            while (tradeIdx < intraTrades.length && intraTrades[tradeIdx].date <= day) {
                const t = intraTrades[tradeIdx++];
                // skip trades that fall on or before prevDay — already applied in a prior iteration
                if (prevDay && t.date <= prevDay) continue;
                const fx           = t.currency === 'USD' ? usdToCad : 1;
                const dollarAmount = t.qty * t.price * fx;
                const spPriceOnDay = getPrice('^GSPC', day);
                if (spPriceOnDay && spPriceOnDay > 0) {
                    if (t.isBuy) {
                        spShares  += dollarAmount / spPriceOnDay;
                        netCapital += dollarAmount;
                    } else {
                        spShares   = Math.max(0, spShares - dollarAmount / spPriceOnDay);
                        netCapital -= dollarAmount;
                    }
                }
            }

            const spPrice = getPrice('^GSPC', day);
            spValues.push(spPrice != null ? spShares * spPrice : null);
            netCapitals.push(netCapital);
        }

        // Both start at 0% (spValues[0] == baseActualValue == netCapitals[0])
        const portfolioChanges = actualValues.map((v, i) => {
            const nc = netCapitals[i];
            return nc > 0 && v != null ? ((v / nc) - 1) * 100 : 0;
        });
        const spChanges = spValues.map((v, i) => {
            const nc = netCapitals[i];
            return nc > 0 && v != null ? ((v / nc) - 1) * 100 : 0;
        });

        const labels = effectiveDays.map(d => {
            const date = new Date(d + 'T12:00:00Z');
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        });

        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);

        const chart = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Your Portfolio',
                        data: portfolioChanges,
                        borderColor: '#3D8A9E',
                        backgroundColor: 'rgba(61, 138, 158, 0.08)',
                        borderWidth: 2,
                        pointRadius: 3,
                        pointHoverRadius: 5,
                        tension: 0.1,
                        fill: false
                    },
                    {
                        label: 'S&P 500 Equivalent',
                        data: spChanges,
                        borderColor: '#E8A838',
                        backgroundColor: 'rgba(232, 168, 56, 0.08)',
                        borderWidth: 2,
                        pointRadius: 3,
                        pointHoverRadius: 5,
                        tension: 0.1,
                        fill: false
                    }
                ]
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
                        labels: { color: '#999', font: { size: 11 }, boxWidth: 20, padding: 12 }
                    },
                    subtitle: {
                        display: true,
                        text: 'Hypothetical: same dollars invested in S&P 500 on each trade date',
                        color: '#555',
                        font: { size: 10 },
                        padding: { bottom: 6 }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.9)',
                        padding: 12,
                        titleColor: '#fff',
                        bodyColor: '#fff',
                        borderColor: '#444',
                        borderWidth: 1,
                        callbacks: {
                            title: (context) => context[0].label,
                            label: (context) => {
                                const val = context.parsed.y;
                                const sign = val >= 0 ? '+' : '';
                                return `${context.dataset.label}: ${sign}${val.toFixed(2)}%`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: '#2a2a2a', drawBorder: false },
                        ticks: { color: '#999', maxRotation: 45, autoSkip: true, maxTicksLimit: 14 }
                    },
                    y: {
                        grid: {
                            color: (context) => context.tick.value === 0 ? '#555' : '#2a2a2a',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#999',
                            callback: (value) => {
                                const sign = value >= 0 ? '+' : '';
                                return `${sign}${value.toFixed(1)}%`;
                            }
                        },
                        title: {
                            display: true,
                            text: 'Return vs Period Start Value',
                            color: '#666',
                            font: { size: 11 }
                        }
                    }
                }
            }
        });

        this.portfolioCharts.set(canvasId, chart);
    }

    async renderSPEquivalentPerformanceWeekly(canvasId, period = '1y') {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const rawPositions = this.loadPortfolioData('positions');
        const rawTrades = this.loadPortfolioData('trades');

        const existingChart = this.portfolioCharts.get(canvasId);
        if (existingChart) {
            existingChart.destroy();
            this.portfolioCharts.delete(canvasId);
        }

        const showError = (msg) => {
            const c = canvas.getContext('2d');
            c.clearRect(0, 0, canvas.width, canvas.height);
            c.fillStyle = '#666';
            c.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto';
            c.textAlign = 'center';
            c.fillText(msg, canvas.width / 2, canvas.height / 2);
        };

        if ((!rawPositions || rawPositions.length === 0) && (!rawTrades || rawTrades.length === 0)) {
            showError('No portfolio data available. Upload positions or trades to see this chart.');
            return;
        }

        if (!rawTrades || rawTrades.length === 0) {
            showError('Trade history required for long-term S&P 500 equivalent. Upload your trades CSV to use this chart.');
            return;
        }

        showError('Loading performance data...');

        let usdToCad = await this.getExchangeRate('USD', 'CAD') || 1.0;

        const symbolCurrency = {};
        if (rawPositions) {
            rawPositions.forEach(p => {
                if (p.symbol && p.currency) symbolCurrency[p.symbol.toUpperCase()] = p.currency;
            });
        }

        const calendarDaysMap = { '6m': 182, '1y': 365, '2y': 730, '3y': 1095, '5y': 1825 };
        const calendarDays = calendarDaysMap[period] ?? 365;

        const trades = rawTrades
            .filter(t => t.type?.toLowerCase() !== 'dividend' && parseFloat(t.quantity || 0) !== 0)
            .sort((a, b) => (a.transaction_date || '').localeCompare(b.transaction_date || ''));

        trades.forEach(t => {
            const sym = t.symbol?.toUpperCase();
            if (sym && t.currency && !symbolCurrency[sym]) symbolCurrency[sym] = t.currency;
        });

        const symbolsToFetch = [...new Set(
            trades.map(t => t.symbol?.toUpperCase()).filter(s => s && !this.portfolioExcludedSymbols.has(s))
        )];

        if (symbolsToFetch.length === 0) {
            showError('No tradeable symbols found in portfolio data.');
            return;
        }

        const signedQty = (trade) => {
            const qty = parseFloat(trade.quantity || 0);
            const type = trade.type?.toLowerCase();
            if (type === 'buy')  return  Math.abs(qty);
            if (type === 'sell') return -Math.abs(qty);
            return qty;
        };

        const buildHoldingsPerWeek = (weekDays) => {
            const result = [];
            const current = {};
            let ti = 0;
            for (const day of weekDays) {
                while (ti < trades.length && (trades[ti].transaction_date || '') <= day) {
                    const t = trades[ti++];
                    const sym = t.symbol?.toUpperCase();
                    if (!sym || this.portfolioExcludedSymbols.has(sym)) continue;
                    current[sym] = (current[sym] || 0) + signedQty(t);
                }
                result.push({ ...current });
            }
            return result;
        };

        // Reuse same weekly cache as TWR weekly chart
        const allSymbols = [...symbolsToFetch, '^GSPC'];
        const cacheKey = [...allSymbols].sort().join(',');
        const today = new Date().toISOString().slice(0, 10);
        const LS_KEY = 'perf_weekly_price_cache_10y';

        let priceHistory;
        try {
            const stored = localStorage.getItem(LS_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (parsed.key === cacheKey && parsed.date === today) priceHistory = parsed.priceHistory;
            }
        } catch (_) {}

        if (!priceHistory) {
            priceHistory = {};
            try {
                const batchUrl = `/api/stocks/batch?symbols=${allSymbols.map(encodeURIComponent).join(',')}&range=10y&interval=1wk`;
                const resp = await fetch(batchUrl);
                if (!resp.ok) throw new Error('Batch fetch failed');
                const batchData = await resp.json();
                for (const sym of allSymbols) {
                    const result = batchData[sym]?.chart?.result?.[0];
                    if (!result) continue;
                    const timestamps = result.timestamp;
                    const closes = result.indicators?.quote?.[0]?.close;
                    if (!timestamps || !closes) continue;
                    priceHistory[sym] = {};
                    timestamps.forEach((ts, i) => {
                        if (closes[i] != null) {
                            const dateStr = new Date(ts * 1000).toISOString().slice(0, 10);
                            priceHistory[sym][dateStr] = closes[i];
                        }
                    });
                }
            } catch (err) {
                console.error('[SP Equivalent Weekly] Failed to fetch data:', err);
                showError('Failed to load performance data. Please try again.');
                return;
            }
            try {
                localStorage.setItem(LS_KEY, JSON.stringify({ key: cacheKey, date: today, priceHistory }));
            } catch (_) {}
        }

        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - calendarDays);
        const cutoffStr = cutoff.toISOString().slice(0, 10);
        const sp500Dates = Object.keys(priceHistory['^GSPC'] || {}).sort();
        const weekDays = sp500Dates.filter(d => d >= cutoffStr);

        if (weekDays.length < 2) {
            showError('Not enough historical data available.');
            return;
        }

        const symbolDates = {};
        for (const sym of [...symbolsToFetch, '^GSPC']) {
            symbolDates[sym] = Object.keys(priceHistory[sym] || {}).sort();
        }

        const getPrice = (sym, targetDate) => {
            const prices = priceHistory[sym];
            if (!prices) return null;
            const dates = symbolDates[sym];
            if (!dates || dates.length === 0) return null;
            let lo = 0, hi = dates.length - 1, found = -1;
            while (lo <= hi) {
                const mid = (lo + hi) >> 1;
                if (dates[mid] <= targetDate) { found = mid; lo = mid + 1; }
                else { hi = mid - 1; }
            }
            return found >= 0 ? prices[dates[found]] : null;
        };

        const holdingsPerWeek = buildHoldingsPerWeek(weekDays);

        const baseIdx = holdingsPerWeek.findIndex(h => Object.values(h).some(q => Math.abs(q) > 0.0001));
        if (baseIdx === -1) {
            showError('No portfolio holdings found in this period.');
            return;
        }

        const effectiveDays = weekDays.slice(baseIdx);
        const effectiveHoldings = holdingsPerWeek.slice(baseIdx);
        const periodStart = effectiveDays[0];

        const actualValues = effectiveDays.map((day, i) => {
            let v = 0;
            for (const [sym, qty] of Object.entries(effectiveHoldings[i])) {
                if (qty < 0.0001) continue;
                const p = getPrice(sym, day);
                if (p == null) continue;
                const fx = (symbolCurrency[sym] || 'CAD') === 'USD' ? usdToCad : 1;
                v += p * qty * fx;
            }
            return v;
        });

        const baseActualValue = actualValues[0];
        if (!baseActualValue || baseActualValue <= 0) {
            showError('Could not compute portfolio value at start of period.');
            return;
        }

        const baseSP500Price = getPrice('^GSPC', periodStart);
        if (!baseSP500Price || baseSP500Price <= 0) {
            showError('No S&P 500 price data available for this period.');
            return;
        }

        // Parallel S&P 500 portfolio — identical logic to the daily chart.
        // Both lines start at 0% at the left edge of the chart.
        // Seeded from portfolio value at period start; mirrors every intra-period cash flow.
        // Non-trading-day trades are attributed to the next week via the (prevDay, day] window.
        let spShares  = baseActualValue / baseSP500Price;
        let netCapital = baseActualValue;

        const intraTrades = [];
        for (const t of trades) {
            if (!t.transaction_date || t.transaction_date <= periodStart) continue;
            const type   = t.type?.toLowerCase();
            const rawQty = parseFloat(t.quantity || 0);
            const price  = parseFloat(t.price   || 0);
            if (price <= 0 || rawQty === 0) continue;
            const isBuy  = type === 'buy'  || (type === 'trade' && rawQty > 0);
            const isSell = type === 'sell' || (type === 'trade' && rawQty < 0);
            if (!isBuy && !isSell) continue;
            const sym = t.symbol?.toUpperCase();
            if (!sym || this.portfolioExcludedSymbols.has(sym)) continue;
            intraTrades.push({
                date: t.transaction_date,
                qty: Math.abs(rawQty),
                price,
                currency: t.currency || symbolCurrency[sym] || 'CAD',
                isBuy
            });
        }
        // trades is pre-sorted by transaction_date, so intraTrades is already in order

        let tradeIdx  = 0;
        const spValues    = [];
        const netCapitals = [];

        for (let i = 0; i < effectiveDays.length; i++) {
            const day     = effectiveDays[i];
            const prevDay = i > 0 ? effectiveDays[i - 1] : null;

            while (tradeIdx < intraTrades.length && intraTrades[tradeIdx].date <= day) {
                const t = intraTrades[tradeIdx++];
                if (prevDay && t.date <= prevDay) continue;
                const fx           = t.currency === 'USD' ? usdToCad : 1;
                const dollarAmount = t.qty * t.price * fx;
                const spPriceOnDay = getPrice('^GSPC', day);
                if (spPriceOnDay && spPriceOnDay > 0) {
                    if (t.isBuy) {
                        spShares   += dollarAmount / spPriceOnDay;
                        netCapital += dollarAmount;
                    } else {
                        spShares   = Math.max(0, spShares - dollarAmount / spPriceOnDay);
                        netCapital -= dollarAmount;
                    }
                }
            }

            const spPrice = getPrice('^GSPC', day);
            spValues.push(spPrice != null ? spShares * spPrice : null);
            netCapitals.push(netCapital);
        }

        // Both start at 0% (spValues[0] == baseActualValue == netCapitals[0] by construction)
        const portfolioChanges = actualValues.map((v, i) => {
            const nc = netCapitals[i];
            return nc > 0 && v != null ? ((v / nc) - 1) * 100 : 0;
        });
        const spChanges = spValues.map((v, i) => {
            const nc = netCapitals[i];
            return nc > 0 && v != null ? ((v / nc) - 1) * 100 : 0;
        });

        const longRange = calendarDays > 400;
        const labels = effectiveDays.map(d => {
            const date = new Date(d + 'T12:00:00Z');
            return longRange
                ? date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
                : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        });

        const fmtDate = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        const subtitleText = `${fmtDate(effectiveDays[0])} → ${fmtDate(effectiveDays[effectiveDays.length - 1])} · Hypothetical: same dollars in S&P 500 on each trade date`;

        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);

        const chart = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Your Portfolio',
                        data: portfolioChanges,
                        borderColor: '#3D8A9E',
                        backgroundColor: 'rgba(61, 138, 158, 0.08)',
                        borderWidth: 2,
                        pointRadius: 3,
                        pointHoverRadius: 5,
                        tension: 0.1,
                        fill: false
                    },
                    {
                        label: 'S&P 500 Equivalent',
                        data: spChanges,
                        borderColor: '#E8A838',
                        backgroundColor: 'rgba(232, 168, 56, 0.08)',
                        borderWidth: 2,
                        pointRadius: 3,
                        pointHoverRadius: 5,
                        tension: 0.1,
                        fill: false
                    }
                ]
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
                        labels: { color: '#999', font: { size: 11 }, boxWidth: 20, padding: 12 }
                    },
                    subtitle: {
                        display: true,
                        text: subtitleText,
                        color: '#555',
                        font: { size: 10 },
                        padding: { bottom: 6 }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.9)',
                        padding: 12,
                        titleColor: '#fff',
                        bodyColor: '#fff',
                        borderColor: '#444',
                        borderWidth: 1,
                        callbacks: {
                            title: (context) => context[0].label,
                            label: (context) => {
                                const val = context.parsed.y;
                                const sign = val >= 0 ? '+' : '';
                                return `${context.dataset.label}: ${sign}${val.toFixed(2)}%`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: '#2a2a2a', drawBorder: false },
                        ticks: {
                            color: '#999',
                            maxRotation: 45,
                            autoSkip: true,
                            maxTicksLimit: longRange ? 12 : 14
                        }
                    },
                    y: {
                        grid: {
                            color: (context) => context.tick.value === 0 ? '#555' : '#2a2a2a',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#999',
                            callback: (value) => {
                                const sign = value >= 0 ? '+' : '';
                                return `${sign}${value.toFixed(1)}%`;
                            }
                        },
                        title: {
                            display: true,
                            text: 'Return vs Period Start Value',
                            color: '#666',
                            font: { size: 11 }
                        }
                    }
                }
            }
        });

        this.portfolioCharts.set(canvasId, chart);
    }

    removeGraph(graphId) {
        if (!confirm('Remove this graph?')) return;

        this.portfolioGraphs = this.portfolioGraphs.filter(g => {
            const id = typeof g === 'string' ? g : g.id;
            return id !== graphId;
        });
        this.savePortfolioGraphs();
        this.renderPortfolioGraphs();
    }

    // Graph drag and drop handlers
    handleGraphDragStart(e) {
        e.target.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', e.target.innerHTML);
        this.draggedElement = e.target;
    }

    handleGraphDragOver(e) {
        if (e.preventDefault) {
            e.preventDefault();
        }
        e.dataTransfer.dropEffect = 'move';
        return false;
    }

    handleGraphDragEnter(e) {
        const card = e.target.closest('.portfolio-graph-card, .portfolio-divider');
        if (card && card !== this.draggedElement) {
            card.classList.add('drag-over');
        }
    }

    handleGraphDragLeave(e) {
        const card = e.target.closest('.portfolio-graph-card, .portfolio-divider');
        // Only remove the class if we're actually leaving the card (not just entering a child)
        if (card && !card.contains(e.relatedTarget)) {
            card.classList.remove('drag-over');
        }
    }

    handleGraphDrop(e) {
        if (e.stopPropagation) {
            e.stopPropagation();
        }

        const targetCard = e.target.closest('.portfolio-graph-card, .portfolio-divider');

        if (this.draggedElement !== targetCard && targetCard) {
            const portfolioView = document.getElementById('portfolioView');

            // Get graph IDs
            const draggedGraphId = this.draggedElement.dataset.graphId;
            const targetGraphId = targetCard.dataset.graphId;

            // Find indices in portfolioGraphs
            const draggedIndex = this.portfolioGraphs.findIndex(g => {
                const id = typeof g === 'string' ? g : g.id;
                return id === draggedGraphId;
            });
            const targetIndex = this.portfolioGraphs.findIndex(g => {
                const id = typeof g === 'string' ? g : g.id;
                return id === targetGraphId;
            });

            // Get the full entry to move
            const draggedEntry = this.portfolioGraphs[draggedIndex];

            // Update the array order
            this.portfolioGraphs.splice(draggedIndex, 1);
            this.portfolioGraphs.splice(targetIndex, 0, draggedEntry);

            // Just reorder the DOM elements without re-rendering
            if (draggedIndex < targetIndex) {
                // Moving forward - insert after target
                targetCard.parentNode.insertBefore(this.draggedElement, targetCard.nextSibling);
            } else {
                // Moving backward - insert before target
                targetCard.parentNode.insertBefore(this.draggedElement, targetCard);
            }

            // Save the new order
            this.savePortfolioGraphs();
        }

        if (targetCard) {
            targetCard.classList.remove('drag-over');
        }
        return false;
    }

    handleGraphDragEnd(e) {
        e.target.classList.remove('dragging');
        // Remove drag-over class from all graph cards and dividers
        document.querySelectorAll('.portfolio-graph-card, .portfolio-divider').forEach(card => {
            card.classList.remove('drag-over');
        });
    }

    // Graph resize functionality
    handleGraphResizeStart(e, graphId) {
        e.preventDefault();
        e.stopPropagation();

        const card = document.getElementById(`portfolio-graph-${graphId}`);
        const startX = e.clientX;
        const startWidth = card.offsetWidth;
        const portfolioView = document.getElementById('portfolioView');
        // Get full container width for calculation
        const containerWidth = portfolioView.offsetWidth - 40; // Subtract padding
        const baseWidth = containerWidth; // Full container width (we'll divide by 3 for columns)

        this.resizing = {
            graphId,
            card,
            startX,
            startWidth,
            baseWidth,
            isGraph: true
        };

        // Add visual feedback
        card.classList.add('resizing');
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';

        // Attach move and up handlers to document (use unified handlers)
        document.addEventListener('mousemove', this.handleResizeMove);
        document.addEventListener('mouseup', this.handleResizeEnd);
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

        // Settings button - remove API key option
        const settingsBtn = document.getElementById('settingsBtn');
        if (settingsBtn) {
            settingsBtn.style.display = 'none'; // Hide settings since no API key needed
        }

        // Modal close button
        document.getElementById('modalCloseBtn').addEventListener('click', () => {
            this.closeModal();
        });

        // Close candlestick modal
        document.getElementById('modalCloseBtn').addEventListener('click', () => this.closeModal());
        document.getElementById('candlestickModal').addEventListener('click', (e) => {
            if (e.target.id === 'candlestickModal') {
                this.closeModal();
            }
        });

        // Fundamentals modal
        document.getElementById('fundamentalsModalCloseBtn').addEventListener('click', () => {
            this.closeFundamentalsModal();
        });
        document.getElementById('fundamentalsModal').addEventListener('click', (e) => {
            if (e.target.id === 'fundamentalsModal') this.closeFundamentalsModal();
        });

        // AI Analysis modal
        document.getElementById('aiModalCloseBtn').addEventListener('click', () => this.closeAIModal());
        document.getElementById('aiModal').addEventListener('click', (e) => {
            if (e.target.id === 'aiModal') this.closeAIModal();
        });

        // Tracking Overview modal
        document.getElementById('trackingOverviewModalCloseBtn').addEventListener('click', () => this.closeTrackingOverviewModal());
        document.getElementById('trackingOverviewModal').addEventListener('click', (e) => {
            if (e.target.id === 'trackingOverviewModal') this.closeTrackingOverviewModal();
        });

        // Close modals with ESC key; navigate between watchlist stocks with arrows
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
                this.closeFundamentalsModal();
                this.closeAIModal();
                this.closeTrackingOverviewModal();
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                if (this._activeModalType) {
                    e.preventDefault();
                    this._navigateModal(e.key === 'ArrowRight' ? 1 : -1);
                }
            }
        });

        // Swipe to navigate between modal cards with TikTok-style slide animation
        const _swipeState = {};
        ['candlestickModal', 'aiModal', 'fundamentalsModal', 'trackingOverviewModal'].forEach(id => {
            const el = document.getElementById(id);

            el.addEventListener('touchstart', (e) => {
                _swipeState.startX = e.touches[0].clientX;
                _swipeState.startY = e.touches[0].clientY;
                _swipeState.dragging = false;
                _swipeState.locked = false;
                _swipeState.modalId = id;
            }, { passive: true });

            el.addEventListener('touchmove', (e) => {
                if (_swipeState.startX == null || _swipeState.locked) return;
                const dx = e.touches[0].clientX - _swipeState.startX;
                const dy = e.touches[0].clientY - _swipeState.startY;

                if (!_swipeState.dragging) {
                    if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
                    if (Math.abs(dy) >= Math.abs(dx)) { _swipeState.locked = true; return; }
                    _swipeState.dragging = true;
                }

                e.preventDefault();
                const content = el.querySelector('.modal-content');
                if (content) {
                    content.style.transition = 'none';
                    content.style.transform = `translateX(${dx}px)`;
                }
            }, { passive: false });

            el.addEventListener('touchend', (e) => {
                if (_swipeState.startX == null) return;
                const dx = e.changedTouches[0].clientX - _swipeState.startX;
                const dy = e.changedTouches[0].clientY - _swipeState.startY;
                const wasDragging = _swipeState.dragging;
                _swipeState.startX = null;
                _swipeState.dragging = false;
                _swipeState.locked = false;

                const content = el.querySelector('.modal-content');

                const snapBack = () => {
                    if (content) {
                        content.style.transition = 'transform 0.15s cubic-bezier(0.2, 0.8, 0.3, 1)';
                        content.style.transform = '';
                        content.addEventListener('transitionend', () => { content.style.transition = ''; }, { once: true });
                    }
                };

                if (!wasDragging || Math.abs(dx) < 40 || Math.abs(dx) <= Math.abs(dy) * 1.5) {
                    snapBack();
                    return;
                }

                const dir = dx < 0 ? 1 : -1;
                const swipeDir = dx < 0 ? 'left' : 'right';
                const exitX = dx < 0 ? '-110%' : '110%';

                if (content) {
                    content.style.transition = 'transform 0.15s cubic-bezier(0.2, 0.8, 0.3, 1)';
                    content.style.transform = `translateX(${exitX})`;
                    content.addEventListener('transitionend', () => {
                        content.style.transition = '';
                        content.style.transform = '';
                        this._navigateModal(dir, swipeDir);
                    }, { once: true });
                } else {
                    this._navigateModal(dir, swipeDir);
                }
            }, { passive: true });
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
        if (!saved) return [];
        const parsed = JSON.parse(saved);
        const seen = new Set();
        return parsed.filter(entry => {
            if (entry.startsWith('--')) return true; // keep dividers
            const symbol = entry.includes(':') ? entry.split(':')[0] : entry;
            if (seen.has(symbol)) return false;
            seen.add(symbol);
            return true;
        });
    }

    saveStockList() {
        localStorage.setItem('stock_list', JSON.stringify(this.stockList));
        this.updateEmptyState();
    }

    loadWatchlist() {
        const saved = localStorage.getItem('watchlist');
        return saved ? JSON.parse(saved) : [];
    }

    saveWatchlist() {
        localStorage.setItem('watchlist', JSON.stringify(this.watchlist));
        this.updateWatchlistEmptyState();
    }

    updateWatchlistEmptyState() {
        const emptyState = document.getElementById('watchlistEmptyState');
        const grid = document.getElementById('watchlistGrid');
        if (this.watchlist.length === 0) {
            emptyState.classList.remove('hidden');
            grid.classList.add('hidden');
        } else {
            emptyState.classList.add('hidden');
            grid.classList.remove('hidden');
        }
    }

    setupWatchlistControls() {
        const input = document.getElementById('watchlistInput');
        const addBtn = document.getElementById('addWatchlistBtn');
        const dropdown = document.getElementById('watchlistDropdown');

        const showDropdown = () => {
            const tracking = this.stockList.filter(s => !this.watchlist.includes(s));
            if (!tracking.length) return;
            const query = input.value.trim().toUpperCase();
            const filtered = query
                ? tracking.filter(s => s.toUpperCase().includes(query))
                : tracking;
            if (!filtered.length) { dropdown.classList.add('hidden'); return; }
            dropdown.innerHTML = filtered.map(s => `<div class="wl-drop-item" data-symbol="${s}">${s}</div>`).join('');
            dropdown.classList.remove('hidden');
        };

        const hideDropdown = () => dropdown.classList.add('hidden');

        input.addEventListener('focus', showDropdown);
        input.addEventListener('input', showDropdown);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') hideDropdown();
            if (e.key === 'ArrowDown') {
                const first = dropdown.querySelector('.wl-drop-item');
                if (first) { e.preventDefault(); first.focus(); }
            }
        });

        dropdown.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                const next = document.activeElement.nextElementSibling;
                if (next) next.focus();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                const prev = document.activeElement.previousElementSibling;
                if (prev) prev.focus(); else input.focus();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                document.activeElement.click();
            } else if (e.key === 'Escape') {
                hideDropdown();
                input.focus();
            }
        });

        dropdown.addEventListener('click', (e) => {
            const item = e.target.closest('.wl-drop-item');
            if (!item) return;
            input.value = item.dataset.symbol;
            hideDropdown();
            this.addToWatchlistFromInput();
        });

        // Hide on outside click
        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !dropdown.contains(e.target)) hideDropdown();
        });

        addBtn.addEventListener('click', () => { hideDropdown(); this.addToWatchlistFromInput(); });
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') { hideDropdown(); this.addToWatchlistFromInput(); }
        });
    }

    async addToWatchlistFromInput() {
        const input = document.getElementById('watchlistInput');
        const symbol = input.value.trim().toUpperCase();
        if (!symbol) return;

        if (this.watchlist.includes(symbol)) {
            alert('Symbol already in watchlist');
            input.value = '';
            return;
        }

        try {
            input.disabled = true;
            document.getElementById('addWatchlistBtn').disabled = true;

            await stockAPI.getStockData(symbol);

            this.watchlist.unshift(symbol);
            this.saveWatchlist();
            await this.renderWatchlistStock(symbol, true);
            this.updateWatchlistAddButtons();
            this.analyzeWatchlistWithAI();

            input.value = '';
        } catch (error) {
            alert(`Error: Could not find stock "${symbol}". Please check the symbol and try again.`);
        } finally {
            input.disabled = false;
            document.getElementById('addWatchlistBtn').disabled = false;
        }
    }

    async addToWatchlist(symbol) {
        if (this.watchlist.includes(symbol)) return;

        this.watchlist.unshift(symbol);
        this.saveWatchlist();
        await this.renderWatchlistStock(symbol, true);
        this.updateWatchlistAddButtons();
        this.analyzeWatchlistWithAI();
    }

    removeFromWatchlist(symbol) {
        this.watchlist = this.watchlist.filter(s => s !== symbol);
        this.saveWatchlist();

        const card = document.getElementById(`watchlist-${symbol}`);
        if (card) card.remove();

        const chartKey = `wl-${symbol}`;
        if (this.charts.has(chartKey)) {
            this.charts.get(chartKey).destroy();
            this.charts.delete(chartKey);
        }

        this.updateWatchlistAddButtons();
    }

    updateWatchlistAddButtons() {
        document.querySelectorAll('.watchlist-add-btn').forEach(btn => {
            const symbol = btn.dataset.symbol;
            if (this.watchlist.includes(symbol)) {
                btn.classList.add('in-watchlist');
                btn.title = 'Already in Watchlist';
            } else {
                btn.classList.remove('in-watchlist');
                btn.title = 'Add to Watchlist';
            }
        });
    }

    async renderWatchlistStock(symbol, prepend = false) {
        const grid = document.getElementById('watchlistGrid');
        const card = this.createWatchlistCard(symbol);
        if (prepend && grid.firstChild) {
            grid.insertBefore(card, grid.firstChild);
        } else {
            grid.appendChild(card);
        }

        try {
            const data = await stockAPI.getStockData(symbol);
            this.updateStockCard(symbol, data, 'watchlist');
        } catch (error) {
            const metricsEl = document.querySelector(`#watchlist-${symbol} .primary-metric`);
            if (metricsEl) metricsEl.textContent = 'Error loading data';
        }

        try {
            const cached = stockAPI.getFundamentalsFromCache(symbol);
            if (cached) {
                this.updateCardWithFundamentals(symbol, cached);
            } else {
                const data = await stockAPI.fetchFundamentals([symbol]);
                const fund = data[symbol.toUpperCase()];
                if (fund) this.updateCardWithFundamentals(symbol, fund);
            }
        } catch (e) {
            // Fundamentals unavailable — card shows dashes
        }
    }

    async renderAllWatchlistStocks() {
        const grid = document.getElementById('watchlistGrid');
        grid.innerHTML = '';
        this.updateWatchlistEmptyState();

        if (this.watchlist.length > 0) {
            // Only batch-fetch symbols not already in cache from the tracking tab
            const missing = this.watchlist.filter(sym =>
                !stockAPI.getFromCache(`/api/stock/${sym}?range=1mo&interval=1d`) ||
                !stockAPI.getFromCache(`/api/stock/${sym}?range=4y&interval=1wk`)
            );
            if (missing.length > 0) await stockAPI.prefetchStockData(missing);
        }

        const renderPromises = this.watchlist.map(symbol => this.renderWatchlistStock(symbol));
        await Promise.all(renderPromises);
        this.analyzeWatchlistWithAI();
    }

    createWatchlistCard(symbol) {
        const card = document.createElement('div');
        card.className = 'stock-card loading';
        card.id = `watchlist-${symbol}`;
        card.draggable = true;
        card.dataset.symbol = symbol;
        card.dataset.width = 1;

        card.innerHTML = `
            <div class="stock-header">
                <div class="stock-symbol">
                    <span class="drag-handle">⋮⋮</span>
                    ${symbol}
                </div>
                <button class="remove-btn" onclick="dashboard.removeFromWatchlist('${symbol}')">×</button>
            </div>
            <div class="collapsed-summary">
                <div class="cs-metrics"></div>
                <div class="cs-ratings"></div>
            </div>
            <div class="watchlist-card-body">
                <div class="watchlist-card-left">
                    <div class="watchlist-card-info">
                        <div class="stock-metrics" data-symbol="${symbol}" data-context="watchlist">
                            <div class="primary-metric">Loading...</div>
                            <div class="secondary-metrics"></div>
                        </div>
                        <div class="ma-info">
                            <span class="ma-comparison">Loading...</span>
                        </div>
                        <div class="fundamentals-info hidden"></div>
                        <div class="watchlist-verdict-mobile hidden"></div>
                    </div>
                    <div class="chart-container">
                        <canvas id="chart-watchlist-${symbol}"></canvas>
                    </div>
                </div>
                <div class="ai-section"></div>
            </div>
            <div class="ai-description hidden"></div>
        `;

        const metricsArea = card.querySelector('.stock-metrics');
        metricsArea.addEventListener('click', (e) => {
            e.stopPropagation();
            const collapsed = card.classList.toggle('collapsed');
            const collapsedStocks = this.getCollapsedStocks();
            if (collapsed) {
                if (!collapsedStocks.includes(symbol)) collapsedStocks.push(symbol);
            } else {
                const idx = collapsedStocks.indexOf(symbol);
                if (idx > -1) collapsedStocks.splice(idx, 1);
                requestAnimationFrame(() => {
                    const chart = this.charts.get(`wl-${symbol}`);
                    if (chart) chart.resize();
                });
            }
            this.saveCollapsedStocks(collapsedStocks);
        });

        card.addEventListener('click', (e) => {
            if (card.classList.contains('collapsed') && !e.target.closest('.remove-btn')) {
                card.classList.remove('collapsed');
                const collapsedStocks = this.getCollapsedStocks();
                const idx = collapsedStocks.indexOf(symbol);
                if (idx > -1) collapsedStocks.splice(idx, 1);
                this.saveCollapsedStocks(collapsedStocks);
                requestAnimationFrame(() => {
                    const chart = this.charts.get(`wl-${symbol}`);
                    if (chart) chart.resize();
                });
            }
        });

        card.addEventListener('dragstart', (e) => this.handleDragStart(e));
        card.addEventListener('dragover', (e) => this.handleDragOver(e));
        card.addEventListener('drop', (e) => this.handleWatchlistDrop(e));
        card.addEventListener('dragend', (e) => this.handleDragEnd(e));
        card.addEventListener('dragenter', (e) => this.handleDragEnter(e));
        card.addEventListener('dragleave', (e) => this.handleDragLeave(e));

        // Fundamentals click → open details modal
        card.addEventListener('click', (e) => {
            const fundTarget = e.target.closest('.fund-in-ai, .fundamentals-info');
            if (fundTarget) {
                e.stopPropagation();
                this.openFundamentalsModal(symbol);
            }
        });

        return card;
    }

    handleWatchlistDrop(e) {
        if (e.stopPropagation) e.stopPropagation();

        const targetCard = e.target.closest('.stock-card');
        if (this.draggedElement !== targetCard && targetCard) {
            const draggedSymbol = this.draggedElement.dataset.symbol;
            const targetSymbol = targetCard.dataset.symbol;

            const draggedIndex = this.watchlist.indexOf(draggedSymbol);
            const targetIndex = this.watchlist.indexOf(targetSymbol);

            if (draggedIndex === -1 || targetIndex === -1) return;

            this.watchlist.splice(draggedIndex, 1);
            this.watchlist.splice(targetIndex, 0, draggedSymbol);

            if (draggedIndex < targetIndex) {
                targetCard.parentNode.insertBefore(this.draggedElement, targetCard.nextSibling);
            } else {
                targetCard.parentNode.insertBefore(this.draggedElement, targetCard);
            }

            this.saveWatchlist();
        }

        if (targetCard) targetCard.classList.remove('drag-over');
        return false;
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
        let inputValue = input.value.trim();

        if (!inputValue) {
            alert('Please enter a stock symbol');
            return;
        }

        // Check if user wants to add a divider (with or without title)
        if (inputValue.startsWith('--')) {
            this.stockList.push(inputValue);
            this.saveStockList();
            const title = inputValue.substring(2).trim(); // Get text after "--"
            this.renderDivider(this.stockList.length - 1, title);
            input.value = '';
            return;
        }

        inputValue = inputValue.toUpperCase();

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
        if (entry.startsWith('--')) {
            const title = entry.substring(2).trim();
            return { symbol: '--', width: 1, isDivider: true, title: title };
        }
        if (entry.includes(':')) {
            const parts = entry.split(':');
            return { symbol: parts[0], width: parseInt(parts[1]) || 1, isDivider: false };
        }
        return { symbol: entry, width: 1, isDivider: false };
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

    async renderAllStocks() {
        const token = ++this._renderToken;

        // If cards already exist in the DOM, use them as the source of truth for collapsed state.
        // Firestore may have overwritten localStorage with stale data before this re-render,
        // so the DOM (what the user actually sees) is more reliable than localStorage here.
        const existingCards = document.querySelectorAll('#stockGrid .stock-card');
        if (existingCards.length > 0) {
            const domCollapsed = [...existingCards]
                .filter(c => c.classList.contains('collapsed'))
                .map(c => c.dataset.symbol).filter(Boolean);
            this.saveCollapsedStocks(domCollapsed);
        }

        const grid = document.getElementById('stockGrid');
        grid.innerHTML = '';

        if (this.stockList.length > 6) grid.classList.add('many-stocks');
        else grid.classList.remove('many-stocks');

        // Step 1: render all skeleton cards immediately so the layout is visible
        const symbols = [];
        this.stockList.forEach((entry, index) => {
            const parsed = this.parseStockEntry(entry);
            if (parsed.isDivider) {
                this.renderDivider(index, parsed.title);
            } else {
                this.renderSkeletonCard(entry);
                symbols.push(parsed.symbol);
            }
        });

        this.updateEmptyState();
        this.updateWatchlistAddButtons();
        requestAnimationFrame(() => requestAnimationFrame(() => this.updateAllDividerWidths()));

        if (!symbols.length) return;

        // dailyDataMap: filled as each symbol's daily data streams in (needed by chart builder)
        // pendingWeekly: weekly data that arrived before its daily counterpart
        // fundsCache: filled when fundamentals batch resolves
        const dailyDataMap = {};
        const pendingWeekly = {};
        const fundsCache = {};

        const isStale = () => this._renderToken !== token;

        const applyChart = (symbol, dailyRaw, weeklyRaw) => {
            if (!weeklyRaw?.chart?.result?.[0]) return;
            stockAPI.setCache(`/api/stock/${symbol}?range=4y&interval=1wk`, weeklyRaw);
            try {
                const metrics = stockAPI.parseDailyMetrics(dailyRaw);
                const chartData = stockAPI.parseWeeklyChart(weeklyRaw, parseFloat(metrics.currentPrice));
                this.updateStockCardChart(symbol, { ...metrics, ...chartData });
            } catch (e) {
                const card = document.getElementById(`stock-${symbol}`);
                if (card) card.querySelector('.chart-container')?.classList.remove('chart-loading');
            }
        };

        // Fundamentals: fetch in parallel, apply to each card as soon as both
        // fundamentals and that card's daily metrics are ready.
        const fundsPromise = stockAPI.fetchFundamentals(symbols)
            .catch(() => ({}))
            .then(funds => {
                if (isStale()) return;
                Object.assign(fundsCache, funds);
                for (const symbol of symbols) {
                    const fund = funds[symbol.toUpperCase()];
                    if (fund) this.updateTrackingCardPE(symbol, fund);
                }
            });

        // Stream daily data — each card gets its price/metrics the moment Yahoo responds
        const dailyPromise = stockAPI.streamBatch(symbols, '1mo', '1d', (symbol, raw) => {
            if (isStale()) return;
            if (!raw?.chart?.result?.[0]) {
                this.showCardError(symbol, 'No data available');
                return;
            }
            stockAPI.setCache(`/api/stock/${symbol}?range=1mo&interval=1d`, raw);
            dailyDataMap[symbol] = raw;
            try {
                const metrics = stockAPI.parseDailyMetrics(raw);
                this.updateStockCardMetrics(symbol, metrics);
            } catch (e) {
                this.showCardError(symbol, e.message);
                return;
            }
            // Apply PE if fundamentals already resolved
            const fund = fundsCache[symbol.toUpperCase()];
            if (fund) this.updateTrackingCardPE(symbol, fund);
            // Apply chart if weekly data already arrived
            if (pendingWeekly[symbol]) {
                applyChart(symbol, raw, pendingWeekly[symbol]);
                delete pendingWeekly[symbol];
            }
        });

        // Stream weekly data — each chart renders the moment its data arrives
        const weeklyPromise = stockAPI.streamBatch(symbols, '4y', '1wk', (symbol, raw) => {
            if (isStale()) return;
            const dailyRaw = dailyDataMap[symbol];
            if (!dailyRaw) {
                pendingWeekly[symbol] = raw; // daily not yet here — buffer it
                return;
            }
            applyChart(symbol, dailyRaw, raw);
        });

        await Promise.all([dailyPromise, weeklyPromise, fundsPromise]);
    }

    renderSkeletonCard(entry) {
        const { symbol, width } = this.parseStockEntry(entry);
        const card = this.createStockCard(symbol, width);
        document.getElementById('stockGrid').appendChild(card);
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

        const card = this.createStockCard(symbol, width);
        grid.appendChild(card);
        this.updateWatchlistAddButtons();

        try {
            // Phase 1: daily + fundamentals (fast) — show price immediately
            const [dailyBatch, funds] = await Promise.all([
                stockAPI.fetchBatch([symbol], '1mo', '1d'),
                stockAPI.fetchFundamentals([symbol]).catch(() => ({}))
            ]);
            const dailyRaw = dailyBatch[symbol.toUpperCase()];
            if (!dailyRaw?.chart?.result?.[0]) throw new Error('No data available');
            stockAPI.setCache(`/api/stock/${symbol}?range=1mo&interval=1d`, dailyRaw);
            const metrics = stockAPI.parseDailyMetrics(dailyRaw);
            this.updateStockCardMetrics(symbol, metrics);
            const fund = funds[symbol.toUpperCase()];
            if (fund) this.updateTrackingCardPE(symbol, fund);

            // Phase 2: weekly data (slow) — fill in chart + MA
            const weeklyBatch = await stockAPI.fetchBatch([symbol], '4y', '1wk');
            const weeklyRaw = weeklyBatch[symbol.toUpperCase()];
            if (weeklyRaw?.chart?.result?.[0]) {
                stockAPI.setCache(`/api/stock/${symbol}?range=4y&interval=1wk`, weeklyRaw);
                const chartData = stockAPI.parseWeeklyChart(weeklyRaw, parseFloat(metrics.currentPrice));
                this.updateStockCardChart(symbol, { ...metrics, ...chartData });
            }
        } catch (error) {
            this.showCardError(symbol, error.message);
        }
    }

    renderDivider(index, title = '') {
        const grid = document.getElementById('stockGrid');
        const divider = document.createElement('div');
        divider.className = 'stock-divider';
        if (title) {
            divider.classList.add('has-title');
        }
        divider.draggable = true;
        divider.dataset.symbol = '--';
        divider.dataset.index = index;

        if (title) {
            divider.innerHTML = `
                <div class="divider-content">
                    <div class="divider-line"></div>
                    <span class="divider-title">${title}</span>
                    <div class="divider-line"></div>
                </div>
                <button class="divider-remove-btn">×</button>
            `;
        } else {
            divider.innerHTML = `
                <div class="divider-line"></div>
                <button class="divider-remove-btn">×</button>
            `;
        }

        // Add remove button click handler
        const removeBtn = divider.querySelector('.divider-remove-btn');
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.removeDivider(divider);
        });

        // Add drag event listeners
        divider.addEventListener('dragstart', (e) => this.handleDragStart(e));
        divider.addEventListener('dragover', (e) => this.handleDragOver(e));
        divider.addEventListener('drop', (e) => this.handleDrop(e));
        divider.addEventListener('dragend', (e) => this.handleDragEnd(e));
        divider.addEventListener('dragenter', (e) => this.handleDragEnter(e));
        divider.addEventListener('dragleave', (e) => this.handleDragLeave(e));

        grid.appendChild(divider);

        // Update divider line width to match visible cards
        this.updateDividerWidth(divider);
    }

    updateDividerWidth(divider) {
        const grid = document.getElementById('stockGrid');

        // Get all stock cards (not dividers)
        const stockCards = Array.from(grid.querySelectorAll('.stock-card'));

        if (stockCards.length === 0) {
            return;
        }

        // Get the actual width of a stock card from the DOM
        const firstCard = stockCards[0];
        const cardWidth = firstCard.offsetWidth;

        // Calculate how many cards fit in the grid width
        const gridWidth = grid.offsetWidth;
        const cardsPerRow = Math.floor(gridWidth / cardWidth);

        // Calculate the effective width to match the last row of cards
        const effectiveWidth = cardsPerRow * cardWidth;

        // Set the divider container width
        divider.style.width = `${effectiveWidth}px`;
    }

    updateAllDividerWidths() {
        const dividers = document.querySelectorAll('.stock-divider');
        dividers.forEach(divider => this.updateDividerWidth(divider));
    }

    updateCardWidthsForViewport() {
        const isMobile = window.innerWidth <= 768;
        const baseWidth = this.stockList.length > 6 ? 240 : 280;
        document.querySelectorAll('.stock-card').forEach(card => {
            const width = parseInt(card.dataset.width) || 1;
            if (width > 1) {
                card.style.width = isMobile ? '100%' : `${baseWidth * width}px`;
            }
        });
    }

    removeDivider(dividerElement) {
        if (!confirm('Remove divider?')) {
            return;
        }

        // Find the index of this divider in the stockList
        const index = parseInt(dividerElement.dataset.index);
        this.stockList.splice(index, 1);
        this.saveStockList();
        this.renderAllStocks();
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
            if (window.innerWidth <= 768) {
                card.style.width = '100%';   // :2+ cards take full row on mobile
            } else {
                // Determine base width: 240px in many-stocks mode (>6 stocks), 280px otherwise
                const baseWidth = this.stockList.length > 6 ? 240 : 280;
                // Simply multiply base width (box-sizing: border-box includes everything)
                card.style.width = `${baseWidth * width}px`;
            }
        }

        card.innerHTML = `
            <div class="stock-header">
                <div class="stock-symbol">
                    <span class="drag-handle">⋮⋮</span>
                    ${symbol}
                    <button class="watchlist-add-btn" data-symbol="${symbol}" onclick="dashboard.addToWatchlist('${symbol}')" title="Add to Watchlist">
                        <svg class="wl-btn-plus" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="6" y1="1" x2="6" y2="11"/><line x1="1" y1="6" x2="11" y2="6"/></svg>
                        <svg class="wl-btn-check" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1.5,6 4.5,9 10.5,3"/></svg>
                    </button>
                </div>
                <button class="remove-btn" onclick="dashboard.removeStock('${symbol}')">×</button>
            </div>
            <div class="stock-metrics" data-symbol="${symbol}">
                <div class="primary-metric"><span class="sk-bar sk-primary"></span></div>
                <div class="secondary-metrics">
                    <span class="sk-bar sk-price"></span>
                    <span class="sk-bar sk-change"></span>
                    <span class="sk-bar sk-pe"></span>
                </div>
            </div>
            <div class="chart-container chart-loading">
                <div class="chart-skeleton"></div>
                <canvas id="chart-${symbol}"></canvas>
            </div>
            <div class="ma-info">
                <span class="sk-bar sk-ma"></span>
                <span class="sk-bar sk-ma"></span>
            </div>
            <div class="resize-handle"></div>
        `;

        const metricsArea = card.querySelector('.stock-metrics');
        metricsArea.addEventListener('click', (e) => {
            e.stopPropagation();
            if (card.classList.contains('collapsed')) {
                this.openTrackingOverviewModal(symbol);
            } else {
                this.toggleCardCollapse(symbol);
            }
        });

        card.addEventListener('click', (e) => {
            if (card.classList.contains('collapsed') && !e.target.closest('.remove-btn, .resize-handle, .watchlist-add-btn')) {
                this.openTrackingOverviewModal(symbol);
            }
        });

        // Add drag event listeners
        card.addEventListener('dragstart', (e) => this.handleDragStart(e));
        card.addEventListener('dragover', (e) => this.handleDragOver(e));
        card.addEventListener('drop', (e) => this.handleDrop(e));
        card.addEventListener('dragend', (e) => this.handleDragEnd(e));
        card.addEventListener('dragenter', (e) => this.handleDragEnter(e));
        card.addEventListener('dragleave', (e) => this.handleDragLeave(e));

        // Add resize functionality
        const resizeHandle = card.querySelector('.resize-handle');
        resizeHandle.addEventListener('mousedown', (e) => this.handleResizeStart(e, symbol));

        return card;
    }

    getCollapsedStocks() {
        const saved = localStorage.getItem('collapsed_stocks');
        return saved ? JSON.parse(saved) : [];
    }

    saveCollapsedStocks(collapsedStocks) {
        localStorage.setItem('collapsed_stocks', JSON.stringify(collapsedStocks));
        this.updateCollapseToggleBar();
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
        this.stockList.forEach(entry => {
            const { symbol } = this.parseStockEntry(entry);
            const card = document.getElementById(`stock-${symbol}`);
            if (card) card.classList.remove('collapsed');
        });
        this.saveCollapsedStocks([]);
    }

    collapseAllWatchlist() {
        this.watchlist.forEach(symbol => {
            const card = document.getElementById(`watchlist-${symbol}`);
            if (card) card.classList.add('collapsed');
        });
        this.updateCollapseToggleBar();
    }

    expandAllWatchlist() {
        this.watchlist.forEach(symbol => {
            const card = document.getElementById(`watchlist-${symbol}`);
            if (card) card.classList.remove('collapsed');
        });
        requestAnimationFrame(() => {
            this.watchlist.forEach(symbol => {
                const chart = this.charts.get(`wl-${symbol}`);
                if (chart) chart.resize();
            });
        });
        this.updateCollapseToggleBar();
    }

    updateCollapseToggleBar() {
        const bar = document.getElementById('collapseToggleBar');
        if (!bar || bar.classList.contains('hidden')) return;
        const activeTab = document.querySelector('.tab-btn.active')?.id;
        let allCollapsed = false;
        if (activeTab === 'stocksTab') {
            const stocks = this.stockList.filter(e => !this.parseStockEntry(e).isDivider);
            const collapsed = this.getCollapsedStocks();
            allCollapsed = stocks.length > 0 && stocks.every(e => collapsed.includes(this.parseStockEntry(e).symbol));
        } else if (activeTab === 'watchlistTab') {
            const cards = document.querySelectorAll('.watchlist-card');
            allCollapsed = cards.length > 0 && [...cards].every(c => c.classList.contains('collapsed'));
        }
        bar.textContent = allCollapsed ? '▼' : '▲';
    }

    toggleCollapseAll() {
        const activeTab = document.querySelector('.tab-btn.active')?.id;
        if (activeTab === 'stocksTab') {
            const stocks = this.stockList.filter(e => !this.parseStockEntry(e).isDivider);
            const collapsed = this.getCollapsedStocks();
            const allCollapsed = stocks.length > 0 && stocks.every(e => collapsed.includes(this.parseStockEntry(e).symbol));
            if (allCollapsed) this.expandAllCards();
            else this.collapseAllCards();
        } else if (activeTab === 'watchlistTab') {
            const cards = document.querySelectorAll('.watchlist-card');
            const allCollapsed = cards.length > 0 && [...cards].every(c => c.classList.contains('collapsed'));
            if (allCollapsed) this.expandAllWatchlist();
            else this.collapseAllWatchlist();
        }
    }

    refreshAllWatchlist() {
        stockAPI.cache.clear();
        stockAPI.fundamentalsCache.clear();
        this.refreshAIAnalysis();
        this.renderAllWatchlistStocks();
    }

    updateStockCardMetrics(symbol, metrics, context = 'tracking') {
        const cardId = context === 'watchlist' ? `watchlist-${symbol}` : `stock-${symbol}`;
        const card = document.getElementById(cardId);
        if (!card) return;

        card.classList.remove('loading');

        const primaryMetric = card.querySelector('.primary-metric');
        const arrow = metrics.isPositive ? '▲' : '▼';
        primaryMetric.className = `primary-metric ${metrics.isPositive ? 'positive' : 'negative'}`;
        primaryMetric.textContent = `${arrow} ${metrics.dayChangePercent}%`;

        const secondaryMetrics = card.querySelector('.secondary-metrics');
        const weeklyArrow = metrics.isWeeklyPositive ? '▲' : '▼';
        const monthlyArrow = metrics.isMonthlyPositive ? '▲' : '▼';
        secondaryMetrics.innerHTML = `
            <span class="price-value">${metrics.currentPrice}</span>
            <span class="weekly-change ${metrics.isWeeklyPositive ? 'positive' : 'negative'}">${weeklyArrow} ${metrics.weeklyChangePercent}% (7d)</span>
            ${context === 'watchlist' ? `<span class="weekly-change ${metrics.isMonthlyPositive ? 'positive' : 'negative'}">${monthlyArrow} ${metrics.monthlyChangePercent}% (28d)</span>` : '<span class="tracking-pe-value">–</span>'}
        `;
    }

    updateStockCardChart(symbol, data, context = 'tracking') {
        const cardId = context === 'watchlist' ? `watchlist-${symbol}` : `stock-${symbol}`;
        const card = document.getElementById(cardId);
        if (!card) return;

        card.classList.remove('loading');
        card.querySelector('.chart-container')?.classList.remove('chart-loading');

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

        this.createChart(symbol, data, context);

        if (context === 'tracking') {
            this.trackingDataMap[symbol] = data;
        }
    }

    updateStockCard(symbol, data, context = 'tracking') {
        const cardId = context === 'watchlist' ? `watchlist-${symbol}` : `stock-${symbol}`;
        const card = document.getElementById(cardId);
        if (!card) return;

        card.classList.remove('loading');
        card.querySelector('.chart-container')?.classList.remove('chart-loading');

        // Update primary metric (daily change %)
        const primaryMetric = card.querySelector('.primary-metric');
        const arrow = data.isPositive ? '▲' : '▼';
        primaryMetric.className = `primary-metric ${data.isPositive ? 'positive' : 'negative'}`;
        primaryMetric.textContent = `${arrow} ${data.dayChangePercent}%`;

        // Update secondary metrics (price, weekly, and monthly change)
        const secondaryMetrics = card.querySelector('.secondary-metrics');
        const weeklyArrow = data.isWeeklyPositive ? '▲' : '▼';
        const monthlyArrow = data.isMonthlyPositive ? '▲' : '▼';
        secondaryMetrics.innerHTML = `
            <span class="price-value">${data.currentPrice}</span>
            <span class="weekly-change ${data.isWeeklyPositive ? 'positive' : 'negative'}">${weeklyArrow} ${data.weeklyChangePercent}% (7d)</span>
            ${context === 'watchlist' ? `<span class="weekly-change ${data.isMonthlyPositive ? 'positive' : 'negative'}">${monthlyArrow} ${data.monthlyChangePercent}% (28d)</span>` : '<span class="tracking-pe-value">–</span>'}
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
        this.createChart(symbol, data, context);

        if (context === 'tracking') {
            this.trackingDataMap[symbol] = data;
        }

        // Store data for AI analysis calls (watchlist only)
        if (context === 'watchlist') {
            this.stockDataMap[symbol] = data;

            // Populate collapsed summary metrics
            const csMetrics = card.querySelector('.cs-metrics');
            if (csMetrics) {
                const arrow = data.isPositive ? '▲' : '▼';
                const weeklyArrow = data.isWeeklyPositive ? '▲' : '▼';
                const monthlyArrow = data.isMonthlyPositive ? '▲' : '▼';
                csMetrics.innerHTML = `
                    <span class="cs-change ${data.isPositive ? 'positive' : 'negative'}">${arrow} ${data.dayChangePercent}%</span>
                    <div class="cs-secondary">
                        <span class="cs-7d ${data.isWeeklyPositive ? 'positive' : 'negative'}">${weeklyArrow} ${data.weeklyChangePercent}% 7d</span>
                        <span class="cs-28d ${data.isMonthlyPositive ? 'positive' : 'negative'}">${monthlyArrow} ${data.monthlyChangePercent}% 28d</span>
                    </div>
                    <div class="cs-pe">
                        <span class="cs-pe-trailing">–</span>
                        <span class="cs-pe-forward">–</span>
                    </div>
                `;
            }

            // Restore cached AI analysis if available for this week
            const cached = this.getCachedStockAnalysis(symbol);
            if (cached) {
                this.updateCardWithAI(symbol, cached);
            }
        }
    }

    getWeekKey() {
        const d = new Date();
        const jan1 = new Date(d.getFullYear(), 0, 1);
        const week = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
        return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
    }

    getCachedStockAnalysis(symbol) {
        const raw = localStorage.getItem(`ai_stock_${symbol}_${this.getWeekKey()}`);
        return raw ? JSON.parse(raw) : null;
    }

    setCachedStockAnalysis(symbol, analysis) {
        localStorage.setItem(`ai_stock_${symbol}_${this.getWeekKey()}`, JSON.stringify(analysis));
    }

    refreshAIAnalysis() {
        const weekKey = this.getWeekKey();
        this.watchlist.forEach(symbol => {
            localStorage.removeItem(`ai_stock_${symbol}_${weekKey}`);
        });
        this.analyzeWatchlistWithAI();
    }

    async refreshCardAnalysis(symbol) {
        localStorage.removeItem(`ai_stock_${symbol}_${this.getWeekKey()}`);
        const card = document.getElementById(`watchlist-${symbol}`);
        if (!card) return;

        const aiSection = card.querySelector('.ai-section');
        if (aiSection) {
            aiSection.classList.remove('hidden');
            aiSection.innerHTML = `
                <div class="fund-in-ai"></div>
                <div class="ai-skeleton-block">
                    <div class="ai-sk-verdict"></div>
                    <div class="ai-sk-bar"></div>
                    <div class="ai-sk-bar short"></div>
                    <div class="ai-sk-bar"></div>
                    <div class="ai-sk-bar short"></div>
                </div>`;
            const cachedFund = stockAPI.getFundamentalsFromCache(symbol);
            if (cachedFund) this._fillFundInAI(card, cachedFund);
        }
        const aiDesc = card.querySelector('.ai-description');
        if (aiDesc) {
            aiDesc.classList.remove('hidden');
            aiDesc.innerHTML = '<div class="ai-desc-skeleton"><span></span><span></span><span></span><span></span><span></span></div>';
        }
        const csRatings = card.querySelector('.cs-ratings');
        if (csRatings) {
            csRatings.innerHTML = '<div class="cs-ratings-loading"><span></span><span></span><span></span></div>';
        }

        const d = this.stockDataMap[symbol];
        if (!d) return;

        const rawPositions = JSON.parse(localStorage.getItem('portfolio_positions') || '[]');
        const portfolio = rawPositions.map(p => ({
            symbol: p.symbol,
            quantity: p.quantity,
            average_entry_price: p.average_entry_price,
            currency: p.currency
        }));

        try {
            const response = await fetch('/api/ai/stock-analysis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    stocks: [{ symbol, currentPrice: d.currentPrice, vsMA50: d.vsMA50, vsMA200: d.vsMA200, dayChangePercent: d.dayChangePercent, weeklyChangePercent: d.weeklyChangePercent }],
                    portfolio
                })
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const analysis = await response.json();
            if (analysis.error) throw new Error(analysis.error);
            const symbolData = analysis[symbol] ??
                Object.entries(analysis).find(([k]) => k.toUpperCase() === symbol.toUpperCase())?.[1];
            if (symbolData) {
                this.setCachedStockAnalysis(symbol, symbolData);
                this.updateCardWithAI(symbol, symbolData);
            }
        } catch (err) {
            console.error(`Refresh failed for ${symbol}:`, err);
            if (aiSection) aiSection.innerHTML = '<div class="ai-error">Analysis unavailable</div>';
        }
    }

    setAIBarStatus(text) {
        // Extract a countdown number from messages like "AI · analyzing 3..."
        const match = text.match(/analyzing (\d+)/);
        const count = match ? parseInt(match[1]) : 0;
        const loading = count > 0;

        document.querySelectorAll('.watchlist-refresh-btn').forEach(btn => {
            btn.classList.toggle('ai-loading-spin', loading);
            const countEl = btn.querySelector('.watchlist-refresh-count');
            if (countEl) countEl.textContent = loading ? count : '';
        });
    }

    async analyzeWatchlistWithAI() {
        const symbols = this.watchlist.filter(s => s);
        if (!symbols.length) return;

        // Portfolio context (shared across all calls)
        const rawPositions = JSON.parse(localStorage.getItem('portfolio_positions') || '[]');
        const portfolio = rawPositions.map(p => ({
            symbol: p.symbol,
            quantity: p.quantity,
            average_entry_price: p.average_entry_price,
            currency: p.currency
        }));

        // Split into cached vs. needing fetch
        const uncached = symbols.filter(s => !this.getCachedStockAnalysis(s) && this.stockDataMap[s]);
        const alreadyCached = symbols.filter(s => this.getCachedStockAnalysis(s));

        // Render cached ones immediately
        alreadyCached.forEach(symbol => {
            this.updateCardWithAI(symbol, this.getCachedStockAnalysis(symbol));
        });

        if (!uncached.length) {
            this.setAIBarStatus('AI · cached');
            return;
        }

        // Show loading only on cards that need fetching
        this.setAIBarStatus(`AI · analyzing ${uncached.length}...`);
        uncached.forEach(symbol => {
            const card = document.getElementById(`watchlist-${symbol}`);
            if (!card) return;
            const aiSection = card.querySelector('.ai-section');
            if (aiSection) {
                const wasHiddenSkel = aiSection.classList.contains('hidden');
                aiSection.classList.remove('hidden');
                aiSection.innerHTML = `
                    <div class="fund-in-ai"></div>
                    <div class="ai-skeleton-block">
                        <div class="ai-sk-verdict"></div>
                        <div class="ai-sk-bar"></div>
                        <div class="ai-sk-bar short"></div>
                        <div class="ai-sk-bar"></div>
                        <div class="ai-sk-bar short"></div>
                    </div>`;
                const cachedFund = stockAPI.getFundamentalsFromCache(symbol);
                if (cachedFund) this._fillFundInAI(card, cachedFund);
                if (wasHiddenSkel) {
                    requestAnimationFrame(() => {
                        const chart = this.charts.get(`wl-${symbol}`);
                        if (chart) chart.resize();
                    });
                }
            }
            const aiDesc = card.querySelector('.ai-description');
            if (aiDesc) {
                aiDesc.classList.remove('hidden');
                aiDesc.innerHTML = '<div class="ai-desc-skeleton"><span></span><span></span><span></span><span></span><span></span></div>';
            }
            const csRatings = card.querySelector('.cs-ratings');
            if (csRatings) {
                csRatings.innerHTML = '<div class="cs-ratings-loading"><span></span><span></span><span></span></div>';
            }
        });

        // One call per uncached stock, fired in parallel
        let completed = 0;
        let failed = 0;
        const analyzeOne = async (symbol) => {
            const d = this.stockDataMap[symbol];
            const stockPayload = [{
                symbol,
                currentPrice: d.currentPrice,
                vsMA50: d.vsMA50,
                vsMA200: d.vsMA200,
                dayChangePercent: d.dayChangePercent,
                weeklyChangePercent: d.weeklyChangePercent
            }];
            try {
                const response = await fetch('/api/ai/stock-analysis', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ stocks: stockPayload, portfolio })
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const analysis = await response.json();
                if (analysis.error) throw new Error(analysis.error);
                const symbolData = analysis[symbol] ??
                    Object.entries(analysis).find(([k]) => k.toUpperCase() === symbol.toUpperCase())?.[1];
                if (symbolData) {
                    this.setCachedStockAnalysis(symbol, symbolData);
                    this.updateCardWithAI(symbol, symbolData);
                }
                completed++;
            } catch (err) {
                console.error(`AI analysis failed for ${symbol}:`, err);
                const card = document.getElementById(`watchlist-${symbol}`);
                if (card) {
                    const aiSection = card.querySelector('.ai-section');
                    if (aiSection) aiSection.innerHTML = '<div class="ai-error">Analysis unavailable</div>';
                }
                failed++;
            }
            const remaining = uncached.length - completed - failed;
            if (remaining > 0) {
                this.setAIBarStatus(`AI · analyzing ${remaining}...`);
            } else {
                this.setAIBarStatus(failed ? 'AI · partial' : 'AI · updated this week');
            }
        };

        await Promise.all(uncached.map(s => analyzeOne(s)));
    }

    updateCardWithAI(symbol, analysis) {
        const card = document.getElementById(`watchlist-${symbol}`);
        if (!card) return;
        const aiSection = card.querySelector('.ai-section');
        if (!aiSection) return;

        const verdict = analysis.verdict || 'hold';
        const label = verdict.charAt(0).toUpperCase() + verdict.slice(1);

        const ratingsHTML = `
            <div class="ai-ratings">
                <span class="ai-rating-item valuation-${analysis.valuation_rating || 'mid'}">
                    <span class="ai-rating-label">Valuation</span> ${analysis.valuation_rating || '–'}
                </span>
                <span class="ai-rating-item fundamentals-${analysis.fundamentals_rating || 'mid'}">
                    <span class="ai-rating-label">Fundamentals</span> ${analysis.fundamentals_rating || '–'}
                </span>
                <span class="ai-rating-item fit-${analysis.portfolio_fit_rating || 'mid'}">
                    <span class="ai-rating-label">Portfolio fit</span> ${analysis.portfolio_fit_rating || '–'}
                </span>
                <span class="ai-rating-item longterm-${analysis.long_term_rating || 'mid'}">
                    <span class="ai-rating-label">Long term</span> ${analysis.long_term_rating || '–'}
                </span>
            </div>
        `;

        const fullDetailsHTML = `
            <div class="ai-detail">
                <p><span class="ai-label">Valuation:</span> ${analysis.valuation}</p>
                <p><span class="ai-label">Fundamentals:</span> ${analysis.fundamentals}</p>
                <p><span class="ai-label">Portfolio fit:</span> ${analysis.portfolio_fit}</p>
                <p><span class="ai-label">Long-term:</span> ${analysis.long_term}</p>
            </div>
        `;

        // ai-section (right of graph, desktop only): fundamentals + verdict badge + rating pills
        // Entire section is clickable to open the AI modal
        const wasHidden = aiSection.classList.contains('hidden');
        aiSection.classList.remove('hidden');
        aiSection.innerHTML = `
            <div class="fund-in-ai"></div>
            <div class="ai-verdict-row">
                <span class="ai-source-badge">AI</span>
                <div class="ai-verdict ${verdict}">${label}</div>
                <button class="ai-card-refresh-btn" title="Refresh analysis">↻</button>
            </div>
            ${ratingsHTML}
        `;
        aiSection.querySelector('.ai-card-refresh-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.refreshCardAnalysis(symbol);
        });
        aiSection.onclick = (e) => {
            if (!e.target.closest('.ai-card-refresh-btn')) this.openAIModal(symbol);
        };
        aiSection.style.cursor = 'pointer';

        // If the ai-section was hidden before, the chart was sized to fill the full left column.
        // Now that the right column is visible, force an immediate resize.
        if (wasHidden) {
            requestAnimationFrame(() => {
                const chart = this.charts.get(`wl-${symbol}`);
                if (chart) chart.resize();
            });
        }

        // Fill fundamentals placeholder immediately if already cached
        const cachedFund = stockAPI.getFundamentalsFromCache(symbol);
        if (cachedFund) this._fillFundInAI(card, cachedFund);

        // Mobile verdict badge (shown in left column on mobile)
        const mobileVerdict = card.querySelector('.watchlist-verdict-mobile');
        if (mobileVerdict) {
            mobileVerdict.classList.remove('hidden');
            mobileVerdict.innerHTML = `<div class="ai-verdict ${verdict}">${label}</div>`;
        }

        // Collapsed summary ratings — compact squares with single letter + verdict
        const csRatings = card.querySelector('.cs-ratings');
        if (csRatings) {
            csRatings.innerHTML = `
                <div class="cs-verdict-signal ${verdict}">${label}</div>
                <span class="cs-sq valuation-${analysis.valuation_rating || 'mid'}" title="Valuation: ${analysis.valuation_rating || '–'}">V</span>
                <span class="cs-sq fundamentals-${analysis.fundamentals_rating || 'mid'}" title="Fundamentals: ${analysis.fundamentals_rating || '–'}">F</span>
                <span class="cs-sq fit-${analysis.portfolio_fit_rating || 'mid'}" title="Portfolio fit: ${analysis.portfolio_fit_rating || '–'}">P</span>
                <span class="cs-sq longterm-${analysis.long_term_rating || 'mid'}" title="Long term: ${analysis.long_term_rating || '–'}">L</span>
            `;
        }

        // ai-description (mobile only — desktop hides this via CSS, ai-section is used there)
        // Shows verdict badge + rating pills as a compact clickable row
        const aiDesc = card.querySelector('.ai-description');
        if (aiDesc) {
            aiDesc.classList.remove('hidden');
            aiDesc.innerHTML = `
                <div class="ai-desc-trigger">
                    <span class="ai-source-badge">AI</span>
                    <div class="ai-verdict ${verdict}">${label}</div>
                    <span class="ai-rating-item valuation-${analysis.valuation_rating || 'mid'}">${analysis.valuation_rating || '–'}</span>
                    <span class="ai-rating-item fundamentals-${analysis.fundamentals_rating || 'mid'}">${analysis.fundamentals_rating || '–'}</span>
                    <span class="ai-rating-item fit-${analysis.portfolio_fit_rating || 'mid'}">${analysis.portfolio_fit_rating || '–'}</span>
                    <span class="ai-rating-item longterm-${analysis.long_term_rating || 'mid'}">${analysis.long_term_rating || '–'}</span>
                    <button class="ai-card-refresh-btn ai-desc-refresh" title="Refresh analysis">↻</button>
                </div>
            `;
            aiDesc.querySelector('.ai-desc-trigger').addEventListener('click', (e) => {
                if (!e.target.closest('.ai-desc-refresh')) this.openAIModal(symbol);
            });
            aiDesc.querySelector('.ai-desc-refresh').addEventListener('click', (e) => {
                e.stopPropagation();
                this.refreshCardAnalysis(symbol);
            });
        }
    }

    _fillFundInAI(card, fundamentals) {
        const fmt = (v) => v != null ? parseFloat(v).toFixed(1) : '–';
        const fmtMargin = (v) => v != null ? (parseFloat(v) * 100).toFixed(1) + '%' : '–';
        const fmtYield = (v) => v != null ? parseFloat(v).toFixed(2) + '%' : '–';
        const fundInAI = card.querySelector('.fund-in-ai');
        if (!fundInAI) return;
        fundInAI.innerHTML = `
            <div class="fund-ai-row"><span class="fund-ai-label">P/E</span><span class="fund-ai-val">${fmt(fundamentals.trailingPE)}</span></div>
            <div class="fund-ai-row"><span class="fund-ai-label">Fwd P/E</span><span class="fund-ai-val">${fmt(fundamentals.forwardPE)}</span></div>
            <div class="fund-ai-row"><span class="fund-ai-label">Margin</span><span class="fund-ai-val">${fmtMargin(fundamentals.profitMargin)}</span></div>
            <div class="fund-ai-row"><span class="fund-ai-label">Div</span><span class="fund-ai-val">${fmtYield(fundamentals.dividendYield)}</span></div>
        `;
    }

    updateCardWithFundamentals(symbol, fundamentals) {
        const card = document.getElementById(`watchlist-${symbol}`);
        if (!card) return;

        const fmt = (v) => v != null ? parseFloat(v).toFixed(1) : '–';
        const fmtMargin = (v) => v != null ? (parseFloat(v) * 100).toFixed(1) + '%' : '–';
        const fmtYield = (v) => v != null ? parseFloat(v).toFixed(2) + '%' : '–';

        // Desktop right column: fill fund-in-ai placeholder (present once updateCardWithAI has run)
        this._fillFundInAI(card, fundamentals);

        // Mobile left column (hidden on desktop via CSS)
        const fundInfo = card.querySelector('.fundamentals-info');
        if (fundInfo) {
            fundInfo.classList.remove('hidden');
            fundInfo.innerHTML = `
                <div class="fund-item">
                    <span class="fund-label">P/E</span>
                    <span class="fund-value">${fmt(fundamentals.trailingPE)}</span>
                </div>
                <div class="fund-item">
                    <span class="fund-label">Fwd P/E</span>
                    <span class="fund-value">${fmt(fundamentals.forwardPE)}</span>
                </div>
                <div class="fund-item">
                    <span class="fund-label">Margin</span>
                    <span class="fund-value">${fmtMargin(fundamentals.profitMargin)}</span>
                </div>
                <div class="fund-item">
                    <span class="fund-label">Div</span>
                    <span class="fund-value">${fmtYield(fundamentals.dividendYield)}</span>
                </div>
            `;
        }

        // Collapsed view: stacked PE beside 7d/28d
        const csPeTrailing = card.querySelector('.cs-pe-trailing');
        const csPeForward = card.querySelector('.cs-pe-forward');
        if (csPeTrailing) csPeTrailing.textContent = `P/E ${fmt(fundamentals.trailingPE)}`;
        if (csPeForward) csPeForward.textContent = `Fwd ${fmt(fundamentals.forwardPE)}`;
    }

    updateTrackingCardPE(symbol, fundamentals) {
        const card = document.getElementById(`stock-${symbol}`);
        if (!card) return;
        const fmt = (v) => v != null ? parseFloat(v).toFixed(1) : '–';
        const peEl = card.querySelector('.tracking-pe-value');
        if (peEl) peEl.textContent = `P/E ${fmt(fundamentals.trailingPE)}`;
    }

    createChart(symbol, data, context = 'tracking') {
        // If the watchlist view is hidden (e.g. user is on Tracking tab), Chart.js
        // would measure 0px for the container. Defer creation until the tab is shown.
        if (context === 'watchlist') {
            const view = document.getElementById('watchlistView');
            if (view && view.classList.contains('hidden')) {
                this._pendingWLCharts = this._pendingWLCharts || [];
                // Replace any existing pending entry for the same symbol
                this._pendingWLCharts = this._pendingWLCharts.filter(p => p.symbol !== symbol);
                this._pendingWLCharts.push({ symbol, data });
                return;
            }
        }

        const chartKey = context === 'watchlist' ? `wl-${symbol}` : symbol;
        const canvasId = context === 'watchlist' ? `chart-watchlist-${symbol}` : `chart-${symbol}`;
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        // Destroy existing chart if any
        if (this.charts.has(chartKey)) {
            this.charts.get(chartKey).destroy();
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
                    this.openCandlestickModal(symbol, context);
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: window.innerWidth <= 768 ? { enabled: false } : {
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

        this.charts.set(chartKey, chart);
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
        const card = e.target.closest('.stock-card, .stock-divider');
        if (card && card !== this.draggedElement) {
            card.classList.add('drag-over');
        }
    }

    handleDragLeave(e) {
        const card = e.target.closest('.stock-card, .stock-divider');
        if (card && !card.contains(e.relatedTarget)) {
            card.classList.remove('drag-over');
        }
    }

    handleDrop(e) {
        if (e.stopPropagation) {
            e.stopPropagation();
        }

        const targetCard = e.target.closest('.stock-card, .stock-divider');

        if (this.draggedElement !== targetCard && targetCard) {
            const grid = document.getElementById('stockGrid');

            // Get symbols
            const draggedSymbol = this.draggedElement.dataset.symbol;
            const targetSymbol = targetCard.dataset.symbol;

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
                targetCard.parentNode.insertBefore(this.draggedElement, targetCard.nextSibling);
            } else {
                // Moving backward - insert before target
                targetCard.parentNode.insertBefore(this.draggedElement, targetCard);
            }

            // Update data-index attributes for all dividers
            this.updateDividerIndices();

            // Save the new order
            this.saveStockList();
        }

        if (targetCard) {
            targetCard.classList.remove('drag-over');
        }
        return false;
    }

    updateDividerIndices() {
        // Update data-index for all dividers to match their position in stockList
        const dividers = document.querySelectorAll('.stock-divider');
        let dividerCount = 0;

        this.stockList.forEach((entry, index) => {
            const parsed = this.parseStockEntry(entry);
            if (parsed.isDivider) {
                if (dividers[dividerCount]) {
                    dividers[dividerCount].dataset.index = index;
                }
                dividerCount++;
            }
        });
    }

    handleDragEnd(e) {
        e.target.classList.remove('dragging');
        // Remove drag-over class from all cards and dividers
        document.querySelectorAll('.stock-card, .stock-divider').forEach(card => {
            card.classList.remove('drag-over');
        });
    }

    // Resize functionality
    handleResizeStart(e, symbol) {
        e.preventDefault();
        e.stopPropagation();

        const card = document.getElementById(`stock-${symbol}`);
        const startX = e.clientX;
        const startWidth = card.offsetWidth;
        const baseWidth = this.stockList.length > 6 ? 240 : 280;

        // Disable dragging while resizing
        card.draggable = false;

        this.resizing = {
            symbol,
            card,
            startX,
            startWidth,
            baseWidth
        };

        // Add visual feedback
        card.classList.add('resizing');
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';

        // Attach move and up handlers to document
        document.addEventListener('mousemove', this.handleResizeMove);
        document.addEventListener('mouseup', this.handleResizeEnd);
    }

    handleResizeMove = (e) => {
        if (!this.resizing) return;

        // Handle graph resize
        if (this.resizing.isGraph) {
            const { card, startX, startWidth, baseWidth } = this.resizing;
            const deltaX = e.clientX - startX;
            const newWidth = startWidth + deltaX;

            // Calculate the width multiplier based on 1/6 width increments
            // baseWidth is full container, so each column is baseWidth/6
            const columnWidth = baseWidth / 6;
            const multiplier = Math.max(1, Math.round(newWidth / columnWidth));

            // Limit to reasonable range (1 to 6 columns)
            const limitedMultiplier = Math.min(6, multiplier);

            // Update grid column span
            card.style.gridColumn = `span ${limitedMultiplier}`;
            return;
        }

        // Handle stock card resize
        const { card, startX, startWidth, baseWidth } = this.resizing;
        const deltaX = e.clientX - startX;
        const newWidth = startWidth + deltaX;

        // Calculate the width multiplier (snap to increments)
        const multiplier = Math.max(1, Math.round(newWidth / baseWidth));
        const snappedWidth = multiplier * baseWidth;

        // Limit to reasonable range (1x to 6x)
        const limitedMultiplier = Math.min(6, multiplier);
        const finalWidth = limitedMultiplier * baseWidth;

        // Update card width
        card.style.width = `${finalWidth}px`;
    }

    handleResizeEnd = (e) => {
        if (!this.resizing) return;

        // Handle graph resize
        if (this.resizing.isGraph) {
            const { graphId, card } = this.resizing;

            // Calculate final multiplier from grid column span
            const gridColumn = card.style.gridColumn;
            const multiplier = gridColumn ? parseInt(gridColumn.replace('span ', '')) : 1;

            // Update portfolioGraphs with new width
            const graphIndex = this.portfolioGraphs.findIndex(g => {
                const id = typeof g === 'string' ? g : g.id;
                return id === graphId;
            });

            if (graphIndex !== -1) {
                const currentEntry = this.portfolioGraphs[graphIndex];
                const id = typeof currentEntry === 'string' ? currentEntry : currentEntry.id;
                this.portfolioGraphs[graphIndex] = { id, width: multiplier };
                this.savePortfolioGraphs();

                // Update card's data-width attribute
                card.dataset.width = multiplier;
            }

            // Clean up
            card.classList.remove('resizing');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';

            document.removeEventListener('mousemove', this.handleResizeMove);
            document.removeEventListener('mouseup', this.handleResizeEnd);

            this.resizing = null;
            return;
        }

        // Handle stock card resize
        const { symbol, card, baseWidth } = this.resizing;

        // Calculate final multiplier
        const finalWidth = parseInt(card.style.width);
        const multiplier = Math.round(finalWidth / baseWidth);

        // Update stockList with new width
        const entryIndex = this.stockList.findIndex(entry => {
            const parsed = this.parseStockEntry(entry);
            return parsed.symbol === symbol;
        });

        if (entryIndex !== -1) {
            const newEntry = multiplier > 1 ? `${symbol}:${multiplier}` : symbol;
            this.stockList[entryIndex] = newEntry;
            this.saveStockList();

            // Update card's data-width attribute
            card.dataset.width = multiplier;
        }

        // Clean up
        card.classList.remove('resizing');
        card.draggable = true;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        document.removeEventListener('mousemove', this.handleResizeMove);
        document.removeEventListener('mouseup', this.handleResizeEnd);

        this.resizing = null;

        // Update divider widths after resize
        requestAnimationFrame(() => {
            this.updateAllDividerWidths();
        });
    }

    // Candlestick Modal Methods
    async openCandlestickModal(symbol, context = null) {
        const modal = document.getElementById('candlestickModal');
        const modalSymbol = document.getElementById('modalStockSymbol');
        const chartContainer = document.getElementById('candlestickChartContainer');

        // Store current symbol and set default range/interval
        this.currentModalSymbol = symbol;
        this._activeModalType = 'candlestick';
        this._activeModalSymbol = symbol;
        // Use explicitly passed context, otherwise fall back to checking watchlist membership
        this._activeModalContext = context || (this.watchlist.includes(symbol) ? 'watchlist' : 'tracking');
        const defaultRange = '5y';
        const defaultInterval = this.getDefaultInterval(defaultRange);
        this.currentModalRange = defaultRange;
        this.currentModalInterval = defaultInterval;

        // Show modal with symbol
        modalSymbol.textContent = symbol;
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

        // Keep symbol only
        modalSymbol.textContent = symbol;

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
        this._activeModalType = null;
        this._activeModalSymbol = null;
        chartContainer.classList.remove('loading', 'no-data');

        // Clear active buttons
        document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.interval-btn').forEach(b => b.classList.remove('active'));
        this._activeModalContext = null;
    }

    // ── Fundamentals Modal ─────────────────────────────────────────────────────

    async openFundamentalsModal(symbol) {
        const modal = document.getElementById('fundamentalsModal');
        const modalSymbol = document.getElementById('fundamentalsModalSymbol');
        const modalName = document.getElementById('fundamentalsModalName');
        const body = document.getElementById('fundamentalsModalBody');

        this._activeModalType = 'fundamentals';
        this._activeModalSymbol = symbol;
        if (!this._activeModalContext) {
            this._activeModalContext = this.watchlist.includes(symbol) ? 'watchlist' : 'tracking';
        }
        modalSymbol.textContent = symbol;
        modalName.textContent = '';
        body.innerHTML = '<div class="fundamentals-loading">Loading...</div>';
        modal.classList.remove('hidden');

        try {
            const resp = await fetch(`/api/stock/${symbol}/details`);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const d = await resp.json();
            if (d.error) throw new Error(d.error);

            if (d.longName) modalName.textContent = `${d.longName}${d.sector ? ' · ' + d.sector : ''}`;

            const fmt = (v, dec = 1) => v != null ? parseFloat(v).toFixed(dec) : '–';
            const fmtPct = (v) => v != null ? (parseFloat(v) * 100).toFixed(1) + '%' : '–';
            // dividendYield from yfinance is already in % form (0.39 = 0.39%)
            const fmtYield = (v) => v != null ? parseFloat(v).toFixed(2) + '%' : '–';
            const fmtLarge = (v) => {
                if (v == null) return '–';
                const n = parseFloat(v);
                if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
                if (n >= 1e9)  return (n / 1e9).toFixed(2) + 'B';
                if (n >= 1e6)  return (n / 1e6).toFixed(2) + 'M';
                return n.toFixed(0);
            };
            const fmtPrice = (v) => v != null ? '$' + parseFloat(v).toFixed(2) : '–';
            const fmtRec = (v) => v ? v.charAt(0).toUpperCase() + v.slice(1) : '–';

            const sections = [
                {
                    title: 'Valuation',
                    rows: [
                        ['P/E (TTM)',       fmt(d.trailingPE)],
                        ['Forward P/E',     fmt(d.forwardPE)],
                        ['PEG Ratio',       fmt(d.trailingPegRatio, 2)],
                        ['Price / Book',    fmt(d.priceToBook, 2)],
                        ['Price / Sales',   fmt(d.priceToSalesTrailing12Months, 2)],
                        ['EV / EBITDA',     fmt(d.enterpriseToEbitda, 1)],
                        ['EV / Revenue',    fmt(d.enterpriseToRevenue, 2)],
                    ]
                },
                {
                    title: 'Profitability',
                    rows: [
                        ['Gross Margin',     fmtPct(d.grossMargins)],
                        ['Operating Margin', fmtPct(d.operatingMargins)],
                        ['EBITDA Margin',    fmtPct(d.ebitdaMargins)],
                        ['Net Margin',       fmtPct(d.profitMargins)],
                        ['Return on Equity', fmtPct(d.returnOnEquity)],
                        ['Return on Assets', fmtPct(d.returnOnAssets)],
                    ]
                },
                {
                    title: 'Growth',
                    rows: [
                        ['Revenue Growth (YoY)',  fmtPct(d.revenueGrowth)],
                        ['Earnings Growth (YoY)', fmtPct(d.earningsGrowth)],
                        ['Quarterly EPS Growth',  fmtPct(d.earningsQuarterlyGrowth)],
                    ]
                },
                {
                    title: 'Financial Health',
                    rows: [
                        ['Debt / Equity',     fmt(d.debtToEquity, 2)],
                        ['Current Ratio',     fmt(d.currentRatio, 2)],
                        ['Quick Ratio',       fmt(d.quickRatio, 2)],
                        ['Total Cash',        fmtLarge(d.totalCash)],
                        ['Total Debt',        fmtLarge(d.totalDebt)],
                        ['Free Cash Flow',    fmtLarge(d.freeCashflow)],
                        ['Operating CF',      fmtLarge(d.operatingCashflow)],
                    ]
                },
                {
                    title: 'Dividends',
                    rows: [
                        ['Dividend Yield',       fmtYield(d.dividendYield)],
                        ['Annual Dividend',       d.dividendRate != null ? '$' + fmt(d.dividendRate, 2) : '–'],
                        ['Payout Ratio',          fmtPct(d.payoutRatio)],
                        ['5Y Avg Yield',          d.fiveYearAvgDividendYield != null ? fmt(d.fiveYearAvgDividendYield, 2) + '%' : '–'],
                    ]
                },
                {
                    title: 'Market & Share Data',
                    rows: [
                        ['Market Cap',         fmtLarge(d.marketCap)],
                        ['Enterprise Value',   fmtLarge(d.enterpriseValue)],
                        ['Beta',               fmt(d.beta, 2)],
                        ['Shares Outstanding', fmtLarge(d.sharesOutstanding)],
                        ['Float',              fmtLarge(d.floatShares)],
                        ['Short Ratio',        fmt(d.shortRatio, 1)],
                        ['Short % Float',      d.shortPercentOfFloat != null ? fmtPct(d.shortPercentOfFloat) : '–'],
                        ['52W High',           fmtPrice(d.fiftyTwoWeekHigh)],
                        ['52W Low',            fmtPrice(d.fiftyTwoWeekLow)],
                        ['50D Avg',            fmtPrice(d.fiftyDayAverage)],
                        ['200D Avg',           fmtPrice(d.twoHundredDayAverage)],
                        ['Avg Volume',         fmtLarge(d.averageVolume)],
                    ]
                },
                {
                    title: 'Per Share',
                    rows: [
                        ['EPS (TTM)',      fmtPrice(d.trailingEps)],
                        ['EPS (Forward)', fmtPrice(d.forwardEps)],
                        ['Book Value',    fmtPrice(d.bookValue)],
                        ['Revenue/Share', fmtPrice(d.revenuePerShare)],
                        ['Cash/Share',    fmtPrice(d.totalCashPerShare)],
                    ]
                },
                {
                    title: 'Analyst',
                    rows: [
                        ['Rating',         fmtRec(d.recommendationKey)],
                        ['# Analysts',     d.numberOfAnalystOpinions != null ? String(d.numberOfAnalystOpinions) : '–'],
                        ['Target (mean)',  fmtPrice(d.targetMeanPrice)],
                        ['Target (high)',  fmtPrice(d.targetHighPrice)],
                        ['Target (low)',   fmtPrice(d.targetLowPrice)],
                    ]
                },
            ];

            body.innerHTML = sections.map(s => `
                <div class="fund-modal-section">
                    <div class="fund-modal-section-title">${s.title}</div>
                    <table class="fund-modal-table">
                        ${s.rows.map(([label, val]) => `
                            <tr>
                                <td class="fund-modal-label">${label}</td>
                                <td class="fund-modal-val">${val}</td>
                            </tr>
                        `).join('')}
                    </table>
                </div>
            `).join('');
        } catch (e) {
            body.innerHTML = `<div class="fundamentals-loading">Failed to load data</div>`;
            console.error('Fundamentals modal error:', e);
        }
    }

    closeFundamentalsModal() {
        document.getElementById('fundamentalsModal').classList.add('hidden');
        this._activeModalType = null;
        this._activeModalSymbol = null;
        this._activeModalContext = null;
    }

    openAIModal(symbol) {
        const analysis = this.getCachedStockAnalysis(symbol);
        if (!analysis) return;
        this._activeModalType = 'ai';
        this._activeModalSymbol = symbol;
        if (!this._activeModalContext) {
            this._activeModalContext = 'watchlist';
        }

        const verdict = analysis.verdict || 'hold';
        const label = verdict.charAt(0).toUpperCase() + verdict.slice(1);

        document.getElementById('aiModalSymbol').textContent = symbol;

        const section = (title, ratingClass, ratingValue, text) => `
            <div class="ai-modal-section">
                <div class="ai-modal-section-header">
                    <span class="ai-modal-section-title">${title}</span>
                    <span class="ai-rating-item ${ratingClass} ai-modal-badge">${ratingValue || '–'}</span>
                </div>
                <p class="ai-modal-section-text">${text || ''}</p>
            </div>
        `;

        document.getElementById('aiModalBody').innerHTML = `
            <div class="ai-modal-top">
                <div class="ai-verdict ${verdict} ai-modal-verdict">${label}</div>
                ${analysis.rationale ? `<p class="ai-modal-rationale">${analysis.rationale}</p>` : ''}
            </div>
            ${analysis.summary ? `<p class="ai-modal-summary">${analysis.summary}</p>` : ''}
            <div class="ai-modal-sections">
                ${section('Valuation',    `valuation-${analysis.valuation_rating || 'mid'}`,      analysis.valuation_rating,      analysis.valuation)}
                ${section('Fundamentals', `fundamentals-${analysis.fundamentals_rating || 'mid'}`, analysis.fundamentals_rating,   analysis.fundamentals)}
                ${section('Portfolio Fit',`fit-${analysis.portfolio_fit_rating || 'mid'}`,         analysis.portfolio_fit_rating,  analysis.portfolio_fit)}
                ${section('Long Term',    `longterm-${analysis.long_term_rating || 'mid'}`,        analysis.long_term_rating,      analysis.long_term)}
            </div>
        `;

        document.getElementById('aiModalRefreshBtn').onclick = () => {
            this.closeAIModal();
            this.refreshCardAnalysis(symbol);
        };

        document.getElementById('aiModal').classList.remove('hidden');
    }

    closeAIModal() {
        document.getElementById('aiModal').classList.add('hidden');
        this._activeModalType = null;
        this._activeModalSymbol = null;
        this._activeModalContext = null;
    }

    // ── Tracking Overview Modal ────────────────────────────────────────────────

    openTrackingOverviewModal(symbol) {
        const data = this.trackingDataMap[symbol];
        if (!data) return;

        this._activeModalType = 'tracking-overview';
        this._activeModalSymbol = symbol;
        if (!this._activeModalContext) this._activeModalContext = 'tracking';

        const fund = stockAPI.getFundamentalsFromCache(symbol);
        const fmt = (v, dec = 1) => v != null ? parseFloat(v).toFixed(dec) : '–';

        const peText = fund ? `P/E ${fmt(fund.trailingPE)} · Fwd ${fmt(fund.forwardPE)}` : '–';

        const dayArrow = data.isPositive ? '▲' : '▼';
        const weekArrow = data.isWeeklyPositive ? '▲' : '▼';
        const vsMA50 = parseFloat(data.vsMA50);
        const vsMA200 = parseFloat(data.vsMA200);

        document.getElementById('trackingOverviewSymbol').textContent = symbol;

        document.getElementById('trackingOverviewBody').innerHTML = `
            <div class="tov-metrics">
                <div class="tov-metric-primary ${data.isPositive ? 'positive' : 'negative'}">
                    ${dayArrow} ${data.dayChangePercent}%
                    <span class="tov-metric-label">Today</span>
                </div>
                <div class="tov-metric-secondary ${data.isWeeklyPositive ? 'positive' : 'negative'}">
                    ${weekArrow} ${data.weeklyChangePercent}%
                    <span class="tov-metric-label">7 days</span>
                </div>
                <div class="tov-metric-secondary tov-price">
                    ${data.currentPrice}
                    <span class="tov-metric-label">Price</span>
                </div>
                <div class="tov-metric-secondary">
                    ${peText}
                    <span class="tov-metric-label">Valuation</span>
                </div>
            </div>
            <div class="tov-chart-container">
                <canvas id="trackingOverviewChart"></canvas>
            </div>
            <div class="tov-ma-row">
                <span class="tov-ma ${vsMA50 >= 0 ? 'above' : 'below'}">
                    ${vsMA50 >= 0 ? '▲' : '▼'} ${vsMA50 >= 0 ? '+' : ''}${vsMA50}%
                    <span class="tov-ma-label">vs 50W MA</span>
                </span>
                <span class="tov-ma ${vsMA200 >= 0 ? 'above' : 'below'}">
                    ${vsMA200 >= 0 ? '▲' : '▼'} ${vsMA200 >= 0 ? '+' : ''}${vsMA200}%
                    <span class="tov-ma-label">vs 200W MA</span>
                </span>
            </div>
        `;

        document.getElementById('trackingOverviewModal').classList.remove('hidden');

        // Render the line chart
        const canvas = document.getElementById('trackingOverviewChart');
        const ctx = canvas.getContext('2d');
        const isUptrend = parseFloat(data.vsMA200) >= 0;

        if (this.trackingOverviewChart) {
            this.trackingOverviewChart.destroy();
            this.trackingOverviewChart = null;
        }

        this.trackingOverviewChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: Array(data.chartPrices.length).fill(''),
                datasets: [
                    {
                        label: 'Price',
                        data: data.chartPrices,
                        borderColor: isUptrend ? '#48bb78' : '#f56565',
                        backgroundColor: isUptrend ? 'rgba(72,187,120,0.06)' : 'rgba(245,101,101,0.06)',
                        borderWidth: 2,
                        tension: 0.3,
                        fill: true,
                        pointRadius: 0,
                    },
                    {
                        label: '50W MA',
                        data: data.chartMA50,
                        borderColor: '#f59e0b',
                        backgroundColor: 'transparent',
                        borderWidth: 1.5,
                        tension: 0.3,
                        fill: false,
                        pointRadius: 0,
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false }
                },
                scales: {
                    x: { display: false },
                    y: { display: false }
                }
            }
        });
    }

    closeTrackingOverviewModal() {
        document.getElementById('trackingOverviewModal').classList.add('hidden');
        if (this.trackingOverviewChart) {
            this.trackingOverviewChart.destroy();
            this.trackingOverviewChart = null;
        }
        this._activeModalType = null;
        this._activeModalSymbol = null;
        this._activeModalContext = null;
    }

    _navigateModal(dir, swipeDir = null) {
        // dir: +1 = next, -1 = prev. swipeDir: 'left' | 'right' | null (from touch swipe)
        if (!this._activeModalType || !this._activeModalSymbol) return;

        const context = this._activeModalContext;
        const types = context === 'tracking'
            ? ['candlestick', 'fundamentals', 'tracking-overview']
            : ['candlestick', 'ai', 'fundamentals'];

        const idx = types.indexOf(this._activeModalType);
        const nextType = types[(idx + dir + types.length) % types.length];
        const symbol = this._activeModalSymbol;

        const nextModalId = {
            'candlestick': 'candlestickModal',
            'fundamentals': 'fundamentalsModal',
            'ai': 'aiModal',
            'tracking-overview': 'trackingOverviewModal',
        }[nextType];

        // Close current modal silently (preserve context for next open)
        if (this._activeModalType === 'candlestick') {
            document.getElementById('candlestickModal').classList.add('hidden');
            if (this.candlestickChart) { this.candlestickChart.destroy(); this.candlestickChart = null; }
            this.currentModalSymbol = null;
            document.querySelectorAll('.period-btn,.interval-btn').forEach(b => b.classList.remove('active'));
        } else if (this._activeModalType === 'fundamentals') {
            document.getElementById('fundamentalsModal').classList.add('hidden');
        } else if (this._activeModalType === 'ai') {
            document.getElementById('aiModal').classList.add('hidden');
        } else if (this._activeModalType === 'tracking-overview') {
            document.getElementById('trackingOverviewModal').classList.add('hidden');
            if (this.trackingOverviewChart) { this.trackingOverviewChart.destroy(); this.trackingOverviewChart = null; }
        }

        this._activeModalType = null;
        this._activeModalSymbol = null;

        if (nextType === 'candlestick') {
            this._activeModalContext = context;
            this.openCandlestickModal(symbol, context);
        } else if (nextType === 'fundamentals') {
            this._activeModalContext = context;
            this.openFundamentalsModal(symbol);
        } else if (nextType === 'ai') {
            this._activeModalContext = context;
            this.openAIModal(symbol);
        } else if (nextType === 'tracking-overview') {
            this._activeModalContext = context;
            this.openTrackingOverviewModal(symbol);
        }

        // Slide the incoming modal content in from the opposite edge
        if (swipeDir && nextModalId) {
            const startX = swipeDir === 'left' ? '110%' : '-110%';
            const nextModal = document.getElementById(nextModalId);
            const content = nextModal?.querySelector('.modal-content');
            if (content) {
                content.style.transition = 'none';
                content.style.transform = `translateX(${startX})`;
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        content.style.transition = 'transform 0.18s cubic-bezier(0.2, 0.8, 0.3, 1)';
                        content.style.transform = '';
                        content.addEventListener('transitionend', () => {
                            content.style.transition = '';
                        }, { once: true });
                    });
                });
            }
        }
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
                        maxWidth: 600,
                        labels: {
                            color: '#aaa',
                            font: {
                                size: 11
                            },
                            boxWidth: 20,
                            boxHeight: 2,
                            padding: 12,
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

        // Dismiss tooltip on touchend — Chart.js has no mouseleave on mobile so it sticks
        canvas.addEventListener('touchend', () => {
            this.candlestickChart?.tooltip.setActiveElements([], { x: 0, y: 0 });
            this.candlestickChart?.update('none');
        }, { passive: true });

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
