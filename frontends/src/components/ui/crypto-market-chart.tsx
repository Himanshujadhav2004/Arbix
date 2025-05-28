"use client"

import React, { useState, useEffect, useRef } from "react"
import axios from "axios"
import { Chart, registerables } from "chart.js"
import { DateTime } from "luxon"
import "chartjs-adapter-luxon"
import LandingNav from "../LandingNav"

Chart.register(...registerables)

interface CryptoChartProps {
  chainindex: string
  address: string
}

interface CryptoDataPoint {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface TokenPriceData {
  chainIndex: string
  price: string
  priceChange24H: string
  volume24H: string
  marketCap: string
}

const intervals = ["1m", "5m", "15m", "30m", "1H", "4H", "1D"] as const

export default function CryptoMarketChart({
  chainindex,
  address
}: CryptoChartProps) {
  const [chartData, setChartData] = useState<CryptoDataPoint[]>([])
  const [interval, setInterval] = useState<typeof intervals[number]>("1H")
  const [tokenPriceData, setTokenPriceData] = useState<TokenPriceData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [newTokenData, setNewTokenData] = useState<{ symbol: string; priceUSD: string } | null>(null)
const [isNewTokenLoading, setIsNewTokenLoading] = useState(false)
const [newTokenError, setNewTokenError] = useState<string | null>(null)
const [coinbasePrice, setCoinbasePrice] = useState<number | null>(null);

  const [isPriceLoading, setIsPriceLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const chartRef = useRef<HTMLCanvasElement>(null)


  const formatCurrency = (value: number) => {
    if (value === 0) return "-"
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`
    if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`
    return `$${value.toFixed(2)}`
  }

  useEffect(() => {
    const fetchTokenPrice = async () => {
      setIsPriceLoading(true)
      try {
        const res = await axios.get(`http://localhost:3000/api/get-token-price/${chainindex}/${address}`)
        setTokenPriceData(res.data.data[0])
        setError(null)
      } catch (err) {
        console.error("Error fetching token price:", err)
        setError("Failed to load token price data")
      } finally {
        setIsPriceLoading(false)
      }
    }

    if (chainindex && address) fetchTokenPrice()
  }, [chainindex, address])

  useEffect(() => {
  if (!chainindex || !address) return

  const fetchNewTokenData = async () => {
    setIsNewTokenLoading(true)
    try {
      const res = await axios.get(`http://localhost:3000/api/token/${chainindex}/${address}`)
      setNewTokenData(res.data)
      setNewTokenError(null)
    } catch (err) {
      console.error("Error fetching new token data:", err)
      setNewTokenError("Failed to load new token data")
      setNewTokenData(null)
    } finally {
      setIsNewTokenLoading(false)
    }
  }

  fetchNewTokenData()
}, [chainindex, address])




  const fetchMarketData = async (selectedInterval: string) => {
    setIsLoading(true)
    try {
      const res = await axios.get(
        `http://localhost:3000/api/market-chart/${chainindex}/${address}?bar=${selectedInterval}`
      )

      const transformedData = res.data.data.map((item: any) => ({
        timestamp: +item[0],
        open: parseFloat(item[1]),
        high: parseFloat(item[2]),
        low: parseFloat(item[3]),
        close: parseFloat(item[4]),
        volume: parseFloat(item[5])
      }))

      setChartData(transformedData)
      setError(null)
    } catch (err) {
      console.error("Error fetching market data:", err)
      setError("Failed to load market data")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!chainindex || !address) return
    fetchMarketData(interval)
  }, [interval, chainindex, address])

  useEffect(() => {
    if (!chartData.length || !chartRef.current) return

    const ctx = chartRef.current.getContext("2d")
    if (!ctx) return

    if ((chartRef.current as any).chart) {
      (chartRef.current as any).chart.destroy()
    }

    const dataset = chartData.map(d => ({
      x: DateTime.fromMillis(d.timestamp).toJSDate(),
      y: d.close
    }))

    const config: any = {
      type: "line",
      data: {
        datasets: [{
          label: "Price",
          data: dataset,
          borderColor: "#4CAF50",
          backgroundColor: "transparent",
          fill: false,
          borderWidth: 2,
          pointRadius: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: "time",
            time: { tooltipFormat: "MMM dd, yyyy HH:mm" },
            grid: { color: "rgba(255,255,255,0.1)" },
            ticks: { color: "#9CA3AF" }
          },
          y: {
            grid: { color: "rgba(255,255,255,0.1)" },
            ticks: {
              color: "#9CA3AF",
              callback: (val: number) => `$${val.toFixed(2)}`
            }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            mode: "index",
            intersect: false,
            backgroundColor: "#1F2937",
            titleColor: "#F9FAFB",
            bodyColor: "#F9FAFB"
          }
        }
      }
    }

    const chartInstance = new Chart(ctx, config)
    ;(chartRef.current as any).chart = chartInstance
  }, [chartData])



  const [price, setPrice] = useState(null);

// crypto-market-chart.tsx (client)
useEffect(() => {
  const fetchBinancePrice = async () => {
    try {
      if (newTokenData?.symbol) {
        // Remove 'W' prefix for CEX symbols if present
        const baseSymbol = newTokenData.symbol.replace(/^W/, '');
        const tradingPair = `${baseSymbol}USDT`;
        
        const res = await axios.get(
          `http://localhost:3000/api/binance-price/${tradingPair.toUpperCase()}`
        );
        
        if (res.data.price) {
          setPrice(res.data.price);
          console.log(res.data.price);
        } else {
          console.warn("Binance price not available for", tradingPair);
        }
      }
    } catch (error) {
      console.error("Error fetching Binance price:", error);
      setPrice(null); // Clear price on error
    }
  };

  fetchBinancePrice();
}, [newTokenData]);

//coinbase 
useEffect(() => {
  const fetchCoinbasePrice = async () => {
    try {
      if (newTokenData?.symbol) {
        // Remove 'W' prefix if present
        const baseSymbol = newTokenData.symbol.replace(/^W/, '');

        // For Coinbase, the pair is SYMBOL-USD (not USDT)
        const pair = `${baseSymbol.toUpperCase()}-USD`;

        const res = await axios.get(
          `http://localhost:3000/api/coinbase-price/${pair}`
        );

        if (res.data.price) {
          setCoinbasePrice(res.data.price);
          console.log('Coinbase price:', res.data.price);
        } else {
          setCoinbasePrice(null);
          console.warn('Coinbase price not available for', pair);
        }
      }
    } catch (error) {
      setCoinbasePrice(null);
      console.error('Error fetching Coinbase price:', error);
    }
  };

  fetchCoinbasePrice();
}, [newTokenData]);



  return (
    <>
    <div className="w-full max-w-6xl mx-auto bg-white dark:bg-gray-900 rounded-xl shadow-2xl overflow-hidden">
      <LandingNav />
      <div className="p-6 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center">
            {/* <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center mr-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div> */}
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
  {newTokenData?.symbol ?? "Loading..."}
  <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400"></span>
</h2>

              {tokenPriceData && (
                <div className="flex items-center mt-1">
                  <span className="text-xl font-semibold text-gray-900 dark:text-white">
                    ${parseFloat(tokenPriceData.price).toFixed(2)}
                  </span>
                  <span
                    className={`ml-2 px-2 py-0.5 rounded text-sm font-medium ${
                      parseFloat(tokenPriceData.priceChange24H) >= 0
                        ? "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300"
                        : "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-300"
                    }`}
                  >
                    {parseFloat(tokenPriceData.priceChange24H) >= 0 ? "↑" : "↓"}{" "}
                    {Math.abs(parseFloat(tokenPriceData.priceChange24H)).toFixed(2)}%
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {intervals.map(i => (
              <button
                key={i}
                onClick={() => setInterval(i)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  interval === i
                    ? "bg-purple-600 text-white"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                }`}
              >
                {i}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          <div className="bg-white dark:bg-gray-950 p-4 rounded-lg shadow">
            <h3 className="text-sm text-gray-500 dark:text-gray-400">Current Price</h3>
            <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">
              {isPriceLoading ? <span className="animate-pulse">...</span> : tokenPriceData ? `$${parseFloat(tokenPriceData.price).toFixed(2)}` : "-"}
            </p>
          </div>

          <div className="bg-white dark:bg-gray-950 p-4 rounded-lg shadow">
            <h3 className="text-sm text-gray-500 dark:text-gray-400">24h Change</h3>
            <p
              className={`text-xl font-bold mt-1 ${
                tokenPriceData && parseFloat(tokenPriceData.priceChange24H) >= 0
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {isPriceLoading ? <span className="animate-pulse">...</span> : tokenPriceData ? `${parseFloat(tokenPriceData.priceChange24H).toFixed(2)}%` : "-"}
            </p>
          </div>

          <div className="bg-white dark:bg-gray-950  p-4 rounded-lg shadow">
            <h3 className="text-sm text-gray-500 dark:text-gray-400">24h Volume</h3>
            <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">
              {isPriceLoading ? <span className="animate-pulse">...</span> : tokenPriceData ? formatCurrency(parseFloat(tokenPriceData.volume24H)) : "-"}
            </p>
          </div>

          <div className="bg-white dark:bg-gray-950  p-4 rounded-lg shadow">
            <h3 className="text-sm text-gray-500 dark:text-gray-400">Market Cap</h3>
            <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">
              {isPriceLoading ? <span className="animate-pulse">...</span> : tokenPriceData ? formatCurrency(parseFloat(tokenPriceData.marketCap)) : "-"}
            </p>
          </div>
        </div>
      </div>

      <div className="h-[400px] p-4">
        <canvas ref={chartRef}></canvas>
      </div>
  

    </div>  <h1 className="text-center mt-20 text-2xl font-bold text-gray-900 dark:text-white mb-4">
    Arbix Bot Signals
  </h1>
<div className="max-w-3xl mx-auto mt-8 p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 gap-6">
  {/* Loading and Error States */}
  {isNewTokenLoading && (
    <p className="col-span-full text-center text-gray-500 dark:text-gray-400 animate-pulse font-medium text-sm">
      Loading new token data...
    </p>
  )}
  {newTokenError && (
    <p className="col-span-full text-center text-red-600 dark:text-red-400 font-semibold text-sm">
      {newTokenError}
    </p>
  )}

  {/* Cards */}
  {newTokenData && (() => {
    const prices = [];

    if (newTokenData?.priceUSD) prices.push({ name: 'Uniswap', price: parseFloat(newTokenData.priceUSD) });
    if (tokenPriceData?.price) prices.push({ name: 'OKX', price: parseFloat(tokenPriceData.price) });
    if (price) prices.push({ name: 'Binance', price: parseFloat(price) });
    if (coinbasePrice !== null) prices.push({ name: 'Coinbase', price: parseFloat(coinbasePrice) });

    // Arbitrage logic
    let recommendation = null;
    if (prices.length > 1) {
      const sorted = [...prices].sort((a, b) => a.price - b.price);
      const min = sorted[0];
      const max = sorted[sorted.length - 1];

      if (max.price - min.price > 0.01) {
        recommendation = {
          buyFrom: min.name,
          buyPrice: min.price,
          sellTo: max.name,
          sellPrice: max.price,
          profit: (max.price - min.price).toFixed(6),
        };
      }
    }

    return (
      <>
        {/* Arbitrage Recommendation */}
        {recommendation && (
          <div className="col-span-full grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            {/* Buy Card */}
            <div className="p-4 rounded-xl bg-white dark:bg-gray-800 shadow ring-1 ring-green-400 dark:ring-green-600 space-y-2">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase">Buy From</h3>
              <p className="text-lg font-semibold text-green-600 dark:text-green-400">{recommendation.buyFrom}</p>
              <p className="text-sm text-gray-600 dark:text-gray-300">Price: ${recommendation.buyPrice.toFixed(6)}</p>
            </div>

            {/* Sell Card */}
            <div className="p-4 rounded-xl bg-white dark:bg-gray-800 shadow ring-1 ring-blue-400 dark:ring-blue-600 space-y-2">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase">Sell To</h3>
              <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">{recommendation.sellTo}</p>
              <p className="text-sm text-gray-600 dark:text-gray-300">Price: ${recommendation.sellPrice.toFixed(6)}</p>
            </div>

            {/* Profit Card */}
            <div className="p-4 rounded-xl bg-white dark:bg-gray-800 shadow ring-1 ring-yellow-400 dark:ring-yellow-600 space-y-2">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase">Profit</h3>
              <p className="text-lg font-semibold text-yellow-600 dark:text-yellow-400">${recommendation.profit}</p>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Gain: {(((recommendation.sellPrice - recommendation.buyPrice) / recommendation.buyPrice) * 100).toFixed(2)}%
              </p>
            </div>
          </div>
        )}

        {/* Exchange Cards - 2x2 Grid */}
        <>
          {/* Uniswap Card */}
          <div className="p-5 rounded-xl bg-gradient-to-tr from-white via-gray-100 to-gray-50 dark:from-gray-800 dark:via-gray-900 dark:to-gray-950 shadow-xl ring-1 ring-gray-200 dark:ring-gray-700 transition-colors duration-700 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-indigo-600 dark:text-indigo-400 uppercase font-semibold tracking-wide text-xs">Protocol</span>
              <span className="text-indigo-800 dark:text-indigo-300 font-bold text-xs">Uniswap</span>
            </div>
            <h2 className="text-xl font-extrabold text-gray-900 dark:text-white tracking-tight">{newTokenData.symbol}</h2>
            <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">
              Price USD: <span className="text-green-600 dark:text-green-400">${parseFloat(newTokenData.priceUSD).toFixed(6)}</span>
            </p>
            <button
              className="w-full py-2 rounded-md bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition text-sm"
              onClick={() => window.open('https://app.uniswap.org/', '_blank')}
            >
              Buy/Sell on Uniswap
            </button>
          </div>

          {/* OKX Card */}
          {tokenPriceData && (
            <div className="p-5 rounded-xl bg-gradient-to-tr from-white via-gray-100 to-gray-50 dark:from-gray-800 dark:via-gray-900 dark:to-gray-950 shadow-xl ring-1 ring-gray-200 dark:ring-gray-700 transition-colors duration-700 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-indigo-600 dark:text-indigo-400 uppercase font-semibold tracking-wide text-xs">Protocol</span>
                <span className="text-indigo-800 dark:text-indigo-300 font-bold text-xs">OKX</span>
              </div>
              <h2 className="text-xl font-extrabold text-gray-900 dark:text-white tracking-tight">{newTokenData.symbol}</h2>
              <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">
                Price USD: <span className="text-green-600 dark:text-green-400">${parseFloat(tokenPriceData.price).toFixed(6)}</span>
              </p>
              <button
                className="w-full py-2 rounded-md bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition text-sm"
                onClick={() => window.open('https://web3.okx.com/dex-swap/', '_blank')}
              >
                Buy/Sell on OKX
              </button>
            </div>
          )}

          {/* Binance Card */}
          {price ? (
            <div className="p-5 rounded-xl bg-gradient-to-tr from-white via-gray-100 to-gray-50 dark:from-gray-800 dark:via-gray-900 dark:to-gray-950 shadow-xl ring-1 ring-gray-200 dark:ring-gray-700 transition-colors duration-700 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-indigo-600 dark:text-indigo-400 uppercase font-semibold tracking-wide text-xs">Protocol</span>
                <span className="text-indigo-800 dark:text-indigo-300 font-bold text-xs">Binance</span>
              </div>
              <h2 className="text-xl font-extrabold text-gray-900 dark:text-white tracking-tight">{newTokenData.symbol}</h2>
              <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">
                Price USD: <span className="text-green-600 dark:text-green-400">${parseFloat(price).toFixed(6)}</span>
              </p>
              <button
                className="w-full py-2 rounded-md bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition text-sm"
                onClick={() => window.open(`https://www.binance.com/en/trade/${newTokenData.symbol.toUpperCase()}_USDT`, '_blank')}
              >
                Buy/Sell on Binance
              </button>
            </div>
          ) : (
            <div className="p-5 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 shadow ring-1 ring-yellow-300 dark:ring-yellow-600 transition-colors duration-700 space-y-3">
              <div className="flex items-center justify-between">
                <span className="uppercase font-semibold tracking-wide text-xs">Protocol</span>
                <span className="font-bold text-xs">Binance</span>
              </div>
              <h2 className="text-xl font-extrabold tracking-tight">{newTokenData.symbol}</h2>
              <p className="text-sm font-medium">Binance price not available</p>
            </div>
          )}

          {/* Coinbase Card */}
          {coinbasePrice !== null ? (
            <div className="p-5 rounded-xl bg-gradient-to-tr from-white via-gray-100 to-gray-50 dark:from-gray-800 dark:via-gray-900 dark:to-gray-950 shadow-xl ring-1 ring-gray-200 dark:ring-gray-700 transition-colors duration-700 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-indigo-600 dark:text-indigo-400 uppercase font-semibold tracking-wide text-xs">Protocol</span>
                <span className="text-indigo-800 dark:text-indigo-300 font-bold text-xs">Coinbase</span>
              </div>
              <h2 className="text-xl font-extrabold text-gray-900 dark:text-white tracking-tight">{newTokenData.symbol}</h2>
              <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">
                Price USD: <span className="text-green-600 dark:text-green-400">${parseFloat(coinbasePrice).toFixed(6)}</span>
              </p>
              <button
                className="w-full py-2 rounded-md bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition text-sm"
                onClick={() => window.open('https://www.coinbase.com/price', '_blank')}
              >
                 Buy/Sell on Coinbase
              </button>
            </div>
          ) : (
            <div className="p-5 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 shadow ring-1 ring-yellow-300 dark:ring-yellow-600 transition-colors duration-700 space-y-3">
              <div className="flex items-center justify-between">
                <span className="uppercase font-semibold tracking-wide text-xs">Protocol</span>
                <span className="font-bold text-xs">Coinbase</span>
              </div>
              <h2 className="text-xl font-extrabold tracking-tight">{newTokenData.symbol}</h2>
              <p className="text-sm font-medium">Coinbase price not available</p>
            </div>
          )}
        </>
      </>
    );
  })()}
</div>


</>
  )
}
