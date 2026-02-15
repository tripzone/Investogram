// API Configuration and Data Fetching - Yahoo Finance

class StockAPI {
    constructor() {
        this.requestQueue = [];
        this.isProcessing = false;
        this.requestDelay = 500; // 500ms between requests to be respectful
        this.cache = new Map(); // Cache for 5 minutes
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    }

    getAPIKey() {
        return true; // No API key needed for Yahoo Finance
    }

    setAPIKey(key) {
        // No-op, Yahoo doesn't need API key
    }

    hasAPIKey() {
        return true; // Always return true since no key needed
    }

    getCacheKey(url) {
        return url;
    }

    getFromCache(cacheKey) {
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            console.log('Using cached data for', cacheKey);
            return cached.data;
        }
        return null;
    }

    setCache(cacheKey, data) {
        this.cache.set(cacheKey, {
            data,
            timestamp: Date.now()
        });
    }

    async queueRequest(requestFn) {
        return new Promise((resolve, reject) => {
            this.requestQueue.push({ requestFn, resolve, reject });
            this.processQueue();
        });
    }

    async processQueue() {
        if (this.isProcessing || this.requestQueue.length === 0) {
            return;
        }

        this.isProcessing = true;
        const { requestFn, resolve, reject } = this.requestQueue.shift();

        try {
            const result = await requestFn();
            resolve(result);
        } catch (error) {
            reject(error);
        }

        // Wait before processing next request
        setTimeout(() => {
            this.isProcessing = false;
            this.processQueue();
        }, this.requestDelay);
    }

    async fetchAPI(url) {
        const cacheKey = this.getCacheKey(url);
        const cached = this.getFromCache(cacheKey);

        if (cached) {
            return cached;
        }

        console.log('Fetching:', url);

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        // Check for errors in response
        if (data.chart && data.chart.error) {
            throw new Error(data.chart.error.description || 'Invalid stock symbol');
        }

        this.setCache(cacheKey, data);
        return data;
    }

    async fetchStockData(symbol) {
        // Use our proxy server to avoid CORS issues
        // Fetch both daily (for recent changes) and weekly (for chart - 4 years for 200-week MA)
        const dailyUrl = `/api/stock/${symbol}?range=1mo&interval=1d`;
        const weeklyUrl = `/api/stock/${symbol}?range=4y&interval=1wk`;

        return this.queueRequest(async () => {
            const [dailyData, weeklyData] = await Promise.all([
                this.fetchAPI(dailyUrl),
                this.fetchAPI(weeklyUrl)
            ]);
            return { daily: dailyData, weekly: weeklyData };
        });
    }

    async getStockData(symbol) {
        try {
            const { daily, weekly } = await this.fetchStockData(symbol);

            // Parse daily data for current metrics
            if (!daily.chart || !daily.chart.result || daily.chart.result.length === 0) {
                throw new Error('Invalid stock symbol or no data available');
            }

            const dailyResult = daily.chart.result[0];
            const dailyMeta = dailyResult.meta;
            const dailyQuote = dailyResult.indicators.quote[0];
            const dailyCloses = dailyQuote.close.filter(price => price !== null);

            if (dailyCloses.length < 2) {
                throw new Error('Not enough historical data available');
            }

            // Current price and previous close (yesterday's close)
            const currentPrice = dailyMeta.regularMarketPrice;
            const previousClose = dailyCloses[dailyCloses.length - 2];
            const dayChange = currentPrice - previousClose;
            const dayChangePercent = ((dayChange / previousClose) * 100).toFixed(2);

            // Calculate 7-day change (from daily data)
            const weeklyDailyPrices = dailyCloses.slice(-7);
            const weekAgoPrice = weeklyDailyPrices[0];
            const weeklyChange = currentPrice - weekAgoPrice;
            const weeklyChangePercent = ((weeklyChange / weekAgoPrice) * 100).toFixed(2);

            // Parse weekly data for chart
            const weeklyResult = weekly.chart.result[0];
            const weeklyQuote = weeklyResult.indicators.quote[0];
            const weeklyCloses = weeklyQuote.close.filter(price => price !== null);

            // Calculate 50-week moving average array for the chart
            const ma50Week = this.calculateMovingAverageArray(weeklyCloses, 50);

            // Calculate current 50-week and 200-week MA values
            const ma50Current = this.calculateMovingAverage(weeklyCloses, 50);
            const ma200Current = this.calculateMovingAverage(weeklyCloses, 200);

            // Calculate % difference from current price to each MA
            const vsMA50 = ((currentPrice - ma50Current) / ma50Current * 100).toFixed(2);
            const vsMA200 = ((currentPrice - ma200Current) / ma200Current * 100).toFixed(2);

            return {
                symbol: symbol.toUpperCase(),
                currentPrice: currentPrice.toFixed(2),
                dayChange: dayChange.toFixed(2),
                dayChangePercent: dayChangePercent,
                weeklyChange: weeklyChange.toFixed(2),
                weeklyChangePercent: weeklyChangePercent,
                chartPrices: weeklyCloses, // Weekly data for chart
                chartMA50: ma50Week, // 50-week moving average for chart
                vsMA50: vsMA50, // % difference from 50-week MA
                vsMA200: vsMA200, // % difference from 200-week MA
                isPositive: dayChange >= 0,
                isWeeklyPositive: weeklyChange >= 0
            };
        } catch (error) {
            console.error(`Error fetching data for ${symbol}:`, error);
            throw error;
        }
    }

    calculateMovingAverage(prices, period) {
        if (prices.length < period) {
            period = prices.length;
        }
        const relevantPrices = prices.slice(-period);
        const sum = relevantPrices.reduce((acc, price) => acc + price, 0);
        return sum / relevantPrices.length;
    }

    calculateMovingAverageArray(prices, period) {
        const maArray = [];
        for (let i = 0; i < prices.length; i++) {
            if (i < period - 1) {
                // Not enough data points yet, push null
                maArray.push(null);
            } else {
                // Calculate MA for this point
                const slice = prices.slice(i - period + 1, i + 1);
                const avg = slice.reduce((sum, price) => sum + price, 0) / period;
                maArray.push(avg);
            }
        }
        return maArray;
    }

    async getCandlestickData(symbol, range = '6mo', interval = '1d') {
        try {
            // Fetch candlestick data at requested interval
            const candlestickUrl = `/api/stock/${symbol}?range=${range}&interval=${interval}`;

            // Fetch SMA data with maximum range, independent of candlestick range
            // This allows SMAs to extend back further than visible candlesticks
            // Note: Yahoo Finance returns monthly data when requesting range=max with interval=1wk
            // But range=20y returns actual weekly data (tested: 1045 points for 20 years)
            const weeklyUrl = `/api/stock/${symbol}?range=20y&interval=1wk`;

            // For monthly data, we can safely use max since Yahoo handles it correctly
            const monthlyUrl = `/api/stock/${symbol}?range=max&interval=1mo`;

            // Fetch all data in parallel
            const [candlestickData, weeklyData, monthlyData] = await this.queueRequest(async () => {
                return await Promise.all([
                    this.fetchAPI(candlestickUrl),
                    this.fetchAPI(weeklyUrl),
                    this.fetchAPI(monthlyUrl)
                ]);
            });

            if (!candlestickData.chart || !candlestickData.chart.result || candlestickData.chart.result.length === 0) {
                throw new Error('Invalid stock symbol or no data available');
            }

            // Extract candlestick OHLC data
            const candleResult = candlestickData.chart.result[0];
            const candleTimestamps = candleResult.timestamp;
            const candleQuote = candleResult.indicators.quote[0];

            const candlesticks = [];
            for (let i = 0; i < candleTimestamps.length; i++) {
                if (candleQuote.open[i] !== null && candleQuote.high[i] !== null &&
                    candleQuote.low[i] !== null && candleQuote.close[i] !== null) {
                    candlesticks.push({
                        x: candleTimestamps[i] * 1000,
                        o: candleQuote.open[i],
                        h: candleQuote.high[i],
                        l: candleQuote.low[i],
                        c: candleQuote.close[i]
                    });
                }
            }

            // Extract weekly data for 50W and 200W SMAs
            const weeklyResult = weeklyData.chart.result[0];
            const weeklyTimestamps = weeklyResult.timestamp;
            const weeklyQuote = weeklyResult.indicators.quote[0];
            const weeklyCloses = [];

            for (let i = 0; i < weeklyTimestamps.length; i++) {
                if (weeklyQuote.close[i] !== null) {
                    weeklyCloses.push({
                        x: weeklyTimestamps[i] * 1000,
                        c: weeklyQuote.close[i]
                    });
                }
            }

            // Extract monthly data for 60M SMA
            const monthlyResult = monthlyData.chart.result[0];
            const monthlyTimestamps = monthlyResult.timestamp;
            const monthlyQuote = monthlyResult.indicators.quote[0];
            const monthlyCloses = [];

            for (let i = 0; i < monthlyTimestamps.length; i++) {
                if (monthlyQuote.close[i] !== null) {
                    monthlyCloses.push({
                        x: monthlyTimestamps[i] * 1000,
                        c: monthlyQuote.close[i]
                    });
                }
            }

            // Calculate SMAs from appropriate grain data
            console.log(`\n[DEBUG ${symbol}] Data points available:`);
            console.log(`  Candlesticks: ${candlesticks.length} (${new Date(candlesticks[0].x).toISOString().split('T')[0]} to ${new Date(candlesticks[candlesticks.length-1].x).toISOString().split('T')[0]})`);
            console.log(`  Weekly data: ${weeklyCloses.length} points (${new Date(weeklyCloses[0].x).toISOString().split('T')[0]} to ${new Date(weeklyCloses[weeklyCloses.length-1].x).toISOString().split('T')[0]})`);
            console.log(`  Monthly data: ${monthlyCloses.length} points (${new Date(monthlyCloses[0].x).toISOString().split('T')[0]} to ${new Date(monthlyCloses[monthlyCloses.length-1].x).toISOString().split('T')[0]})`);

            const sma50w = this.calculateSMAFromCloses(weeklyCloses, 50);
            const sma200w = this.calculateSMAFromCloses(weeklyCloses, 200);
            const sma60m = this.calculateSMAFromCloses(monthlyCloses, 60);

            // Log SMA calculation results
            const sma50wValid = sma50w.filter(p => p.y !== null);
            const sma200wValid = sma200w.filter(p => p.y !== null);
            const sma60mValid = sma60m.filter(p => p.y !== null);
            console.log(`\n[DEBUG ${symbol}] SMA calculations:`);
            console.log(`  50W: ${sma50wValid.length}/${sma50w.length} valid points, first valid: ${sma50wValid.length > 0 ? new Date(sma50wValid[0].x).toISOString().split('T')[0] : 'none'}`);
            console.log(`  200W: ${sma200wValid.length}/${sma200w.length} valid points, first valid: ${sma200wValid.length > 0 ? new Date(sma200wValid[0].x).toISOString().split('T')[0] : 'none'}`);
            console.log(`  60M: ${sma60mValid.length}/${sma60m.length} valid points, first valid: ${sma60mValid.length > 0 ? new Date(sma60mValid[0].x).toISOString().split('T')[0] : 'none'}`);

            // Interpolate SMAs to match candlestick timestamps
            const interpolationTimestamps = candlesticks.map(c => c.x);
            const sma50wInterpolated = this.interpolateSMA(sma50w, interpolationTimestamps);
            const sma200wInterpolated = this.interpolateSMA(sma200w, interpolationTimestamps);
            const sma60mInterpolated = this.interpolateSMA(sma60m, interpolationTimestamps);

            // Log interpolation results
            const sma50wInterpValid = sma50wInterpolated.filter(p => p.y !== null);
            const sma200wInterpValid = sma200wInterpolated.filter(p => p.y !== null);
            const sma60mInterpValid = sma60mInterpolated.filter(p => p.y !== null);
            console.log(`\n[DEBUG ${symbol}] After interpolation:`);
            console.log(`  50W: ${sma50wInterpValid.length}/${sma50wInterpolated.length} valid, first: ${sma50wInterpValid.length > 0 ? new Date(sma50wInterpValid[0].x).toISOString().split('T')[0] : 'none'}`);
            console.log(`  200W: ${sma200wInterpValid.length}/${sma200wInterpolated.length} valid, first: ${sma200wInterpValid.length > 0 ? new Date(sma200wInterpValid[0].x).toISOString().split('T')[0] : 'none'}`);
            console.log(`  60M: ${sma60mInterpValid.length}/${sma60mInterpolated.length} valid, first: ${sma60mInterpValid.length > 0 ? new Date(sma60mInterpValid[0].x).toISOString().split('T')[0] : 'none'}\n`);

            // Calculate Bollinger Bands (20-period, 2 standard deviations)
            const bollingerBands = this.calculateBollingerBands(candlesticks, 20, 2);

            return {
                symbol: symbol.toUpperCase(),
                data: candlesticks,
                sma50w: sma50wInterpolated,
                sma200w: sma200wInterpolated,
                sma60m: sma60mInterpolated,
                bollingerBands: bollingerBands
            };
        } catch (error) {
            console.error(`Error fetching candlestick data for ${symbol}:`, error);
            throw error;
        }
    }

    calculateSMAFromCloses(closesData, period) {
        // closesData is an array of {x: timestamp, c: close price}
        // Calculate SMA for each point where we have enough history
        const smaData = [];

        for (let i = 0; i < closesData.length; i++) {
            if (i < period - 1) {
                // Not enough data yet, push null
                smaData.push({ x: closesData[i].x, y: null });
            } else {
                // Calculate average of close prices over the period
                let sum = 0;
                for (let j = 0; j < period; j++) {
                    sum += closesData[i - j].c;
                }
                const avg = sum / period;
                smaData.push({ x: closesData[i].x, y: avg });
            }
        }

        return smaData;
    }

    interpolateSMA(smaData, targetTimestamps) {
        // Interpolate SMA values to match target timestamps
        // smaData: array of {x: timestamp, y: value} from weekly/monthly data
        // targetTimestamps: array of timestamps from candlestick data

        const interpolated = [];

        // Filter out null values from SMA data
        const validSmaData = smaData.filter(point => point.y !== null);

        if (validSmaData.length === 0) {
            // No valid SMA data, return nulls
            return targetTimestamps.map(ts => ({ x: ts, y: null }));
        }

        for (const targetTime of targetTimestamps) {
            // Find the SMA points before and after this timestamp
            let beforePoint = null;
            let afterPoint = null;

            for (let i = 0; i < validSmaData.length; i++) {
                if (validSmaData[i].x <= targetTime) {
                    beforePoint = validSmaData[i];
                }
                if (validSmaData[i].x >= targetTime && afterPoint === null) {
                    afterPoint = validSmaData[i];
                    break;
                }
            }

            let interpolatedValue = null;

            if (beforePoint && afterPoint && beforePoint.x !== afterPoint.x) {
                // Interpolate between the two points
                const ratio = (targetTime - beforePoint.x) / (afterPoint.x - beforePoint.x);
                interpolatedValue = beforePoint.y + ratio * (afterPoint.y - beforePoint.y);
            } else if (beforePoint && !afterPoint) {
                // After the last SMA point, use the last value
                interpolatedValue = beforePoint.y;
            } else if (!beforePoint && afterPoint) {
                // Before the first SMA point, return null (not enough data yet)
                interpolatedValue = null;
            } else if (beforePoint && afterPoint && beforePoint.x === afterPoint.x) {
                // Exact match
                interpolatedValue = beforePoint.y;
            }

            interpolated.push({ x: targetTime, y: interpolatedValue });
        }

        return interpolated;
    }

    calculateBollingerBands(candlestickData, period = 20, stdDev = 2) {
        const upperBand = [];
        const lowerBand = [];
        const middleBand = [];

        for (let i = 0; i < candlestickData.length; i++) {
            if (i < period - 1) {
                // Not enough data yet
                upperBand.push({ x: candlestickData[i].x, y: null });
                lowerBand.push({ x: candlestickData[i].x, y: null });
                middleBand.push({ x: candlestickData[i].x, y: null });
            } else {
                // Calculate SMA (middle band)
                let sum = 0;
                const prices = [];
                for (let j = 0; j < period; j++) {
                    const price = candlestickData[i - j].c;
                    sum += price;
                    prices.push(price);
                }
                const sma = sum / period;

                // Calculate standard deviation
                const squaredDiffs = prices.map(price => Math.pow(price - sma, 2));
                const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
                const sd = Math.sqrt(variance);

                // Calculate bands
                const upper = sma + (stdDev * sd);
                const lower = sma - (stdDev * sd);

                upperBand.push({ x: candlestickData[i].x, y: upper });
                lowerBand.push({ x: candlestickData[i].x, y: lower });
                middleBand.push({ x: candlestickData[i].x, y: sma });
            }
        }

        return { upper: upperBand, lower: lowerBand, middle: middleBand };
    }
}

// Create global instance
window.stockAPI = new StockAPI();
