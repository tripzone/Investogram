// Main Application Logic

class StockDashboard {
    constructor() {
        this.stockList = this.loadStockList();
        this.portfolioGraphs = this.loadPortfolioGraphs();
        this.charts = new Map();
        this.portfolioCharts = new Map();
        this.candlestickChart = null;
        this.currentModalSymbol = null;
        this.currentModalRange = null;
        this.currentModalInterval = null;
        this.maVisibility = {}; // Store moving average visibility state
        this.selectedFile = null;
        this.selectedGraph = null;
        this.showValues = this.loadShowValuesPreference();
        this.resizing = null; // Track active resize operation
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
        this.setupUploadModal();
        this.setupGraphSelector();
        this.setupValuesToggle();
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

        // Update divider widths on window resize
        window.addEventListener('resize', () => {
            this.updateAllDividerWidths();
        });
    }

    updateAvailableGraphs() {
        // Start with base graph
        this.availableGraphs = [
            {
                id: 'asset-allocation',
                title: 'All Assets',
                cardTitle: 'Asset Allocation: All Assets',
                description: 'Portfolio breakdown by symbol',
                heading: 'Asset Allocation'
            }
        ];

        // Load detected category columns
        const categoryColumns = this.loadCategoriesColumns();
        if (categoryColumns && categoryColumns.length > 0) {
            // Add a graph for each category
            categoryColumns.forEach(categoryName => {
                this.availableGraphs.push({
                    id: `category-${categoryName}`,
                    title: `Category: ${categoryName}`,
                    cardTitle: `Asset Allocation: ${categoryName}`,
                    description: `Allocation within ${categoryName} category`,
                    categoryColumn: categoryName,
                    heading: 'Asset Allocation'
                });
            });
        }
    }

    setupTabs() {
        const stocksTab = document.getElementById('stocksTab');
        const portfolioTab = document.getElementById('portfolioTab');
        const stocksView = document.getElementById('stocksView');
        const portfolioView = document.getElementById('portfolioView');
        const stockControls = document.querySelector('.stock-controls');
        const portfolioControls = document.querySelector('.portfolio-controls');
        const collapseAllBtn = document.getElementById('collapseAllBtn');
        const expandAllBtn = document.getElementById('expandAllBtn');
        const uploadControls = document.querySelector('.upload-controls');

        stocksTab.addEventListener('click', () => {
            // Switch to stocks view
            stocksTab.classList.add('active');
            portfolioTab.classList.remove('active');
            stocksView.classList.remove('hidden');
            portfolioView.classList.add('hidden');

            // Show stock-specific controls
            stockControls.classList.remove('hidden');
            portfolioControls.classList.add('hidden');
            collapseAllBtn.style.display = 'flex';
            expandAllBtn.style.display = 'flex';

            // Hide upload controls
            uploadControls.classList.remove('visible');
        });

        portfolioTab.addEventListener('click', () => {
            // Switch to portfolio view
            portfolioTab.classList.add('active');
            stocksTab.classList.remove('active');
            portfolioView.classList.remove('hidden');
            stocksView.classList.add('hidden');

            // Hide stock-specific controls
            stockControls.classList.add('hidden');
            portfolioControls.classList.remove('hidden');
            collapseAllBtn.style.display = 'none';
            expandAllBtn.style.display = 'none';

            // Show upload controls
            uploadControls.classList.add('visible');
        });
    }

    setupUploadModal() {
        const uploadBtn = document.getElementById('uploadBtn');
        const uploadModal = document.getElementById('uploadModal');
        const uploadModalCloseBtn = document.getElementById('uploadModalCloseBtn');
        const cancelUploadBtn = document.getElementById('cancelUploadBtn');
        const selectFileBtn = document.getElementById('selectFileBtn');
        const fileInput = document.getElementById('fileInput');
        const confirmUploadBtn = document.getElementById('confirmUploadBtn');

        // Open upload modal
        uploadBtn.addEventListener('click', () => {
            this.openUploadModal();
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
        const positionsIndicator = document.getElementById('positionsIndicator');
        const tradesIndicator = document.getElementById('tradesIndicator');
        const categoriesIndicator = document.getElementById('categoriesIndicator');

        // Check if positions data exists
        const positionsData = this.loadPortfolioData('positions');
        const positionsCheck = positionsIndicator.querySelector('.indicator-check');
        if (positionsData && positionsData.length > 0) {
            positionsCheck.classList.remove('hidden');
        } else {
            positionsCheck.classList.add('hidden');
        }

        // Check if trades data exists
        const tradesData = this.loadPortfolioData('trades');
        const tradesCheck = tradesIndicator.querySelector('.indicator-check');
        if (tradesData && tradesData.length > 0) {
            tradesCheck.classList.remove('hidden');
        } else {
            tradesCheck.classList.add('hidden');
        }

        // Check if categories data exists
        const categoriesData = this.loadCategoriesData();
        const categoriesCheck = categoriesIndicator.querySelector('.indicator-check');
        if (categoriesData && categoriesData.length > 0) {
            categoriesCheck.classList.remove('hidden');
        } else {
            categoriesCheck.classList.add('hidden');
        }
    }

    setupValuesToggle() {
        const toggleBtn = document.getElementById('toggleValuesBtn');

        // Set initial state
        if (this.showValues) {
            toggleBtn.classList.add('active');
        }

        // Toggle on click
        toggleBtn.addEventListener('click', () => {
            this.showValues = !this.showValues;
            this.saveShowValuesPreference(this.showValues);

            if (this.showValues) {
                toggleBtn.classList.add('active');
            } else {
                toggleBtn.classList.remove('active');
            }

            // Re-render portfolio graphs to apply changes
            this.renderPortfolioGraphs();
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
            const query = e.target.value.toLowerCase();
            this.filterGraphs(query);
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
            if (e.key === 'Enter' && this.selectedGraph) {
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

        // Add to list with default width of 3 (full width)
        this.portfolioGraphs.push({ id: this.selectedGraph.id, width: 3 });
        this.savePortfolioGraphs();

        // Clear selection
        const graphInput = document.getElementById('graphInput');
        const graphDropdown = document.getElementById('graphDropdown');
        const addGraphBtn = document.getElementById('addGraphBtn');

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
        // Default to width 3 (full width) for better backward compatibility
        return parsed.map(item => {
            if (typeof item === 'string') {
                return { id: item, width: 3 };
            }
            return item;
        });
    }

    savePortfolioGraphs() {
        localStorage.setItem('portfolio_graphs', JSON.stringify(this.portfolioGraphs));
    }

    renderPortfolioGraphs() {
        const portfolioView = document.getElementById('portfolioView');

        // Destroy existing charts
        this.portfolioCharts.forEach(chart => chart.destroy());
        this.portfolioCharts.clear();

        if (this.portfolioGraphs.length === 0) {
            portfolioView.innerHTML = '<div class="empty-state"><p>No graphs added yet. Add your first graph above!</p></div>';
            return;
        }

        portfolioView.innerHTML = '';

        this.portfolioGraphs.forEach((graphEntry, index) => {
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

            graphCard.innerHTML = `
                <div class="graph-card-header">
                    <span class="graph-drag-handle">⋮⋮</span>
                    <h3>${graphDef.cardTitle || graphDef.title}</h3>
                    <button class="remove-graph-btn" onclick="dashboard.removeGraph('${graphId}')">×</button>
                </div>
                <div class="graph-card-body">
                    <canvas id="${canvasId}"></canvas>
                </div>
                <div class="graph-resize-handle"></div>
            `;

            portfolioView.appendChild(graphCard);

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

    async renderGraph(graphId, canvasId) {
        // Check if this is a category graph
        if (graphId.startsWith('category-')) {
            const categoryName = graphId.replace('category-', '');
            await this.renderCategoryAllocation(canvasId, categoryName);
            return;
        }

        switch(graphId) {
            case 'asset-allocation':
                await this.renderAssetAllocation(canvasId);
                break;
            default:
                // Show placeholder for unimplemented graphs
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

    async getExchangeRate(from, to) {
        // Check cache first (cache for 1 hour)
        const cacheKey = `exchange_rate_${from}_${to}`;
        const cached = localStorage.getItem(cacheKey);
        const cacheTime = localStorage.getItem(`${cacheKey}_time`);

        if (cached && cacheTime) {
            const age = Date.now() - parseInt(cacheTime);
            if (age < 3600000) { // 1 hour
                return parseFloat(cached);
            }
        }

        try {
            // Use frankfurter.app API (free, no API key needed)
            const response = await fetch(`https://api.frankfurter.app/latest?from=${from}&to=${to}`);
            const data = await response.json();

            if (data.rates && data.rates[to]) {
                const rate = data.rates[to];
                // Cache the rate
                localStorage.setItem(cacheKey, rate.toString());
                localStorage.setItem(`${cacheKey}_time`, Date.now().toString());
                return rate;
            }
        } catch (error) {
            console.error('Error fetching exchange rate:', error);
        }

        return null;
    }

    async renderAssetAllocation(canvasId) {
        const positionsData = this.loadPortfolioData('positions');
        const canvas = document.getElementById(canvasId);

        if (!canvas) return;

        if (!positionsData || positionsData.length === 0) {
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#666';
            ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto';
            ctx.textAlign = 'center';
            ctx.fillText('No positions data available. Upload positions data to see this chart.', canvas.width / 2, canvas.height / 2);
            return;
        }

        // Get exchange rate USD -> CAD
        const usdToCad = await this.getExchangeRate('USD', 'CAD');

        if (!usdToCad) {
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#666';
            ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto';
            ctx.textAlign = 'center';
            ctx.fillText('Unable to fetch exchange rates. Please try again.', canvas.width / 2, canvas.height / 2);
            return;
        }

        // Convert all values to CAD
        const positionsInCAD = positionsData.map(pos => {
            const value = parseFloat(pos.total_cost || 0);
            const valueInCAD = pos.currency === 'USD' ? value * usdToCad : value;

            return {
                ...pos,
                total_cost_cad: valueInCAD,
                original_value: value,
                original_currency: pos.currency
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

            datasets.push({
                label: pos.symbol,
                data: [percentage],
                backgroundColor: color,
                borderColor: color,
                borderWidth: 1,
                percentage: percentage,
                value: valueCAD,
                originalValue: pos.original_value,
                originalCurrency: pos.original_currency
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
        const positionsData = this.loadPortfolioData('positions');
        const categoriesData = this.loadCategoriesData();
        const canvas = document.getElementById(canvasId);

        if (!canvas) return;

        // Validate data availability
        if (!positionsData || positionsData.length === 0) {
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

        // Convert all positions to CAD and add category value
        const positionsWithCategory = [];
        positionsData.forEach(pos => {
            const categoryValue = symbolToCategoryValue.get(pos.symbol);
            if (!categoryValue) {
                console.warn(`Symbol ${pos.symbol} not found in ${categoryName} category or has N/A value`);
                return; // Skip positions without category data
            }

            const value = parseFloat(pos.total_cost || 0);
            const valueInCAD = pos.currency === 'USD' ? value * usdToCad : value;

            positionsWithCategory.push({
                symbol: pos.symbol,
                categoryValue: categoryValue,
                total_cost_cad: valueInCAD,
                original_value: value,
                original_currency: pos.currency
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
                stocks: []
            };
            existing.total_cad += pos.total_cost_cad;
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

            datasets.push({
                label: group.categoryValue,
                data: [percentage],
                backgroundColor: color,
                borderColor: color,
                borderWidth: 1,
                percentage: percentage,
                value: valueCAD,
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

                                // Show list of stocks in this category value
                                if (dataset.stocks && dataset.stocks.length > 0) {
                                    lines.push(''); // Empty line
                                    lines.push('Stocks:');
                                    dataset.stocks.forEach(stock => {
                                        const stockPercent = (stock.total_cost_cad / dataset.value * 100).toFixed(1);
                                        lines.push(`  ${stock.symbol}: ${stockPercent}%`);
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
        const card = e.target.closest('.portfolio-graph-card');
        if (card && card !== this.draggedElement) {
            card.classList.add('drag-over');
        }
    }

    handleGraphDragLeave(e) {
        const card = e.target.closest('.portfolio-graph-card');
        // Only remove the class if we're actually leaving the card (not just entering a child)
        if (card && !card.contains(e.relatedTarget)) {
            card.classList.remove('drag-over');
        }
    }

    handleGraphDrop(e) {
        if (e.stopPropagation) {
            e.stopPropagation();
        }

        const targetCard = e.target.closest('.portfolio-graph-card');

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
        // Remove drag-over class from all graph cards
        document.querySelectorAll('.portfolio-graph-card').forEach(card => {
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

    renderAllStocks() {
        const grid = document.getElementById('stockGrid');
        grid.innerHTML = '';

        // Add class for many stocks to make them more compact
        if (this.stockList.length > 6) {
            grid.classList.add('many-stocks');
        } else {
            grid.classList.remove('many-stocks');
        }

        this.stockList.forEach((entry, index) => {
            const parsed = this.parseStockEntry(entry);
            if (parsed.isDivider) {
                this.renderDivider(index, parsed.title);
            } else {
                this.renderStock(entry);
            }
        });

        this.updateEmptyState();

        // Update divider widths after all stocks are rendered and layout is calculated
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                this.updateAllDividerWidths();
            });
        });
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
            <div class="resize-handle"></div>
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
        if (e.target.classList.contains('stock-card') || e.target.classList.contains('stock-divider')) {
            e.target.classList.add('drag-over');
        }
    }

    handleDragLeave(e) {
        if (e.target.classList.contains('stock-card') || e.target.classList.contains('stock-divider')) {
            e.target.classList.remove('drag-over');
        }
    }

    handleDrop(e) {
        if (e.stopPropagation) {
            e.stopPropagation();
        }

        const isDraggableTarget = e.target.classList.contains('stock-card') || e.target.classList.contains('stock-divider');

        if (this.draggedElement !== e.target && isDraggableTarget) {
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

            // Update data-index attributes for all dividers
            this.updateDividerIndices();

            // Save the new order
            this.saveStockList();
        }

        e.target.classList.remove('drag-over');
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

            // Calculate the width multiplier based on 1/3 width increments
            // baseWidth is full container, so each column is baseWidth/3
            const columnWidth = baseWidth / 3;
            const multiplier = Math.max(1, Math.round(newWidth / columnWidth));

            // Limit to reasonable range (1 to 3 columns)
            const limitedMultiplier = Math.min(3, multiplier);

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
