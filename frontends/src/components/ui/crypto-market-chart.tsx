"use client"

import React, { useState, useEffect, useRef } from "react"
import axios from "axios"
import { Chart, registerables, type ChartConfiguration } from "chart.js"
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
}

// Shape returned by GET /api/get-token-price/:chainIndex/:address (CoinGecko)
interface TokenPriceData {
  chainIndex: string
  symbol: string
  name: string
  price: number
  priceChange24h: number   // note: lowercase 'h' (CoinGecko backend)
  volume24h: number        // note: lowercase 'h'
  marketCap: number
  high24h: number
  low24h: number
}

// Shape returned by GET /api/token/:chainId/:address (Uniswap / CoinGecko fallback)
interface UniswapTokenData {
  symbol: string
  priceUSD: string
}

type ChartPoint = { x: Date; y: number }

const intervals = ["1m", "5m", "15m", "30m", "1H", "4H", "1D"] as const

export default function CryptoMarketChart({ chainindex, address }: CryptoChartProps) {
  const [chartData, setChartData]           = useState<CryptoDataPoint[]>([])
  const [interval, setInterval]             = useState<typeof intervals[number]>("1H")
  const [tokenPriceData, setTokenPriceData] = useState<TokenPriceData | null>(null)
  const [uniswapData, setUniswapData]       = useState<UniswapTokenData | null>(null)
  const [binancePrice, setBinancePrice]     = useState<number | null>(null)
  const [coinbasePrice, setCoinbasePrice]   = useState<number | null>(null)
  const [isLoading, setIsLoading]           = useState(true)
  const [isPriceLoading, setIsPriceLoading] = useState(true)
  const [isUniLoading, setIsUniLoading]     = useState(false)
  const [uniError, setUniError]             = useState<string | null>(null)
  const [error, setError]                   = useState<string | null>(null)
  const chartRef = useRef<HTMLCanvasElement>(null)
  const chartInstanceRef = useRef<Chart<"line", ChartPoint[], Date> | null>(null)

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  const formatCurrency = (value: number) => {
    if (!value || value === 0) return "-"
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`
    if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`
    return `$${value.toFixed(2)}`
  }

  // -------------------------------------------------------------------------
  // 1. Fetch main token price data from CoinGecko via /api/get-token-price
  //    Response shape: { chainIndex, symbol, name, price, priceChange24h, ... }
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!chainindex || !address) return

    const fetchTokenPrice = async () => {
      setIsPriceLoading(true)
      try {
        const res = await axios.get(
          `http://localhost:3000/api/get-token-price/${chainindex}/${address}`
        )
        // CoinGecko backend returns the object directly (not wrapped in data[0])
        setTokenPriceData(res.data)
        setError(null)
      } catch (err) {
        console.error("Error fetching token price:", err)
        setError("Failed to load token price data")
      } finally {
        setIsPriceLoading(false)
      }
    }

    fetchTokenPrice()
  }, [chainindex, address])

  // -------------------------------------------------------------------------
  // 2. Fetch Uniswap / subgraph data from /api/token/:chainId/:address
  //    Response shape: { symbol, priceUSD }
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!chainindex || !address) return

    const fetchUniswapData = async () => {
      setIsUniLoading(true)
      try {
        const res = await axios.get(
          `http://localhost:3000/api/token/${chainindex}/${address}`
        )
        setUniswapData(res.data)
        setUniError(null)
      } catch (err) {
        console.error("Error fetching Uniswap token data:", err)
        setUniError("Uniswap data not available")
        setUniswapData(null)
      } finally {
        setIsUniLoading(false)
      }
    }

    fetchUniswapData()
  }, [chainindex, address])

  // -------------------------------------------------------------------------
  // 3. Fetch OHLC candle data for chart
  //    CoinGecko backend returns: { data: [{timestamp, open, high, low, close}] }
  // -------------------------------------------------------------------------
  const fetchMarketData = async (selectedInterval: string) => {
    setIsLoading(true)
    try {
      const res = await axios.get(
        `http://localhost:3000/api/market-chart/${chainindex}/${address}?bar=${selectedInterval}`
      )

      // New shape from CoinGecko backend: array of {timestamp, open, high, low, close}
      const raw = res.data.data as { timestamp: number; open: number; high: number; low: number; close: number }[]

      const transformed: CryptoDataPoint[] = raw.map((item) => ({
        timestamp: item.timestamp,
        open:      item.open,
        high:      item.high,
        low:       item.low,
        close:     item.close,
      }))

      setChartData(transformed)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interval, chainindex, address])

  // -------------------------------------------------------------------------
  // 4. Build Chart.js chart whenever chartData updates
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!chartData.length || !chartRef.current) return

    const ctx = chartRef.current.getContext("2d")
    if (!ctx) return

    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy()
    }

    const dataset: ChartPoint[] = chartData.map((d) => ({
      x: new Date(d.timestamp),
      y: d.close,
    }))

    const config: ChartConfiguration<"line", ChartPoint[], Date> = {
      type: "line",
      data: {
        datasets: [
          {
            label: "Price",
            data: dataset,
            borderColor: "#4CAF50",
            backgroundColor: "transparent",
            fill: false,
            borderWidth: 2,
            pointRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: "time",
            time: { tooltipFormat: "MMM dd, yyyy HH:mm" },
            grid: { color: "rgba(255,255,255,0.1)" },
            ticks: { color: "#9CA3AF" },
          },
          y: {
            grid: { color: "rgba(255,255,255,0.1)" },
            ticks: {
              color: "#9CA3AF",
              callback: (tickValue) => `$${Number(tickValue).toFixed(2)}`,
            },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            mode: "index",
            intersect: false,
            backgroundColor: "#1F2937",
            titleColor: "#F9FAFB",
            bodyColor: "#F9FAFB",
          },
        },
      },
    }

    const chartInstance = new Chart(ctx, config)
    chartInstanceRef.current = chartInstance
  }, [chartData])

  // -------------------------------------------------------------------------
  // 5. Fetch Binance price once we know the symbol
  // -------------------------------------------------------------------------
  useEffect(() => {
    const symbol = tokenPriceData?.symbol || uniswapData?.symbol
    if (!symbol) return

    const fetchBinancePrice = async () => {
      try {
        const baseSymbol = symbol.replace(/^W/, "")
        const tradingPair = `${baseSymbol.toUpperCase()}USDT`
        const res = await axios.get(
          `http://localhost:3000/api/binance-price/${tradingPair}`
        )
        if (res.data.price) {
          setBinancePrice(parseFloat(res.data.price))
        } else {
          setBinancePrice(null)
        }
      } catch {
        setBinancePrice(null)
      }
    }

    fetchBinancePrice()
  }, [tokenPriceData?.symbol, uniswapData?.symbol])

  // -------------------------------------------------------------------------
  // 6. Fetch Coinbase price once we know the symbol
  // -------------------------------------------------------------------------
  useEffect(() => {
    const symbol = tokenPriceData?.symbol || uniswapData?.symbol
    if (!symbol) return

    const fetchCoinbasePrice = async () => {
      try {
        const baseSymbol = symbol.replace(/^W/, "")
        const pair = `${baseSymbol.toUpperCase()}-USD`
        const res = await axios.get(
          `http://localhost:3000/api/coinbase-price/${pair}`
        )
        if (res.data.price) {
          setCoinbasePrice(parseFloat(res.data.price))
        } else {
          setCoinbasePrice(null)
        }
      } catch {
        setCoinbasePrice(null)
      }
    }

    fetchCoinbasePrice()
  }, [tokenPriceData?.symbol, uniswapData?.symbol])

  // -------------------------------------------------------------------------
  // Derived values for arbitrage section
  // -------------------------------------------------------------------------
  const displaySymbol = tokenPriceData?.symbol ?? uniswapData?.symbol ?? "..."

  const priceChange = tokenPriceData?.priceChange24h ?? 0
  const currentPrice = tokenPriceData?.price ?? 0
  const volume24h   = tokenPriceData?.volume24h ?? 0
  const marketCap   = tokenPriceData?.marketCap ?? 0

  const prices: { name: string; price: number }[] = []
  if (uniswapData?.priceUSD)    prices.push({ name: "Uniswap", price: parseFloat(uniswapData.priceUSD) })
  if (tokenPriceData?.price)    prices.push({ name: "CoinGecko", price: tokenPriceData.price })
  if (binancePrice !== null)    prices.push({ name: "Binance",   price: binancePrice })
  if (coinbasePrice !== null)   prices.push({ name: "Coinbase",  price: coinbasePrice })

  let recommendation: { buyFrom: string; buyPrice: number; sellTo: string; sellPrice: number; profit: string } | null = null
  if (prices.length > 1) {
    const sorted = [...prices].sort((a, b) => a.price - b.price)
    const min = sorted[0]
    const max = sorted[sorted.length - 1]
    if (max.price - min.price > 0.000001) {
      recommendation = {
        buyFrom:   min.name,
        buyPrice:  min.price,
        sellTo:    max.name,
        sellPrice: max.price,
        profit:    (max.price - min.price).toFixed(6),
      }
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <>
      <div className="w-full max-w-6xl mx-auto bg-white dark:bg-gray-900 rounded-xl shadow-2xl overflow-hidden">
        <LandingNav />

        {/* Header */}
        <div className="p-6 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                {displaySymbol}
              </h2>

              {!isPriceLoading && tokenPriceData && (
                <div className="flex items-center mt-1">
                  <span className="text-xl font-semibold text-gray-900 dark:text-white">
                    ${currentPrice.toFixed(2)}
                  </span>
                  <span
                    className={`ml-2 px-2 py-0.5 rounded text-sm font-medium ${
                      priceChange >= 0
                        ? "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300"
                        : "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-300"
                    }`}
                  >
                    {priceChange >= 0 ? "↑" : "↓"} {Math.abs(priceChange).toFixed(2)}%
                  </span>
                </div>
              )}
            </div>

            {/* Interval buttons */}
            <div className="flex flex-wrap gap-2">
              {intervals.map((i) => (
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

          {/* Stats grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            <div className="bg-white dark:bg-gray-950 p-4 rounded-lg shadow">
              <h3 className="text-sm text-gray-500 dark:text-gray-400">Current Price</h3>
              <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">
                {isPriceLoading ? <span className="animate-pulse">...</span> : currentPrice ? `$${currentPrice.toFixed(2)}` : "-"}
              </p>
            </div>

            <div className="bg-white dark:bg-gray-950 p-4 rounded-lg shadow">
              <h3 className="text-sm text-gray-500 dark:text-gray-400">24h Change</h3>
              <p className={`text-xl font-bold mt-1 ${priceChange >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                {isPriceLoading ? <span className="animate-pulse">...</span> : tokenPriceData ? `${priceChange.toFixed(2)}%` : "-"}
              </p>
            </div>

            <div className="bg-white dark:bg-gray-950 p-4 rounded-lg shadow">
              <h3 className="text-sm text-gray-500 dark:text-gray-400">24h Volume</h3>
              <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">
                {isPriceLoading ? <span className="animate-pulse">...</span> : formatCurrency(volume24h)}
              </p>
            </div>

            <div className="bg-white dark:bg-gray-950 p-4 rounded-lg shadow">
              <h3 className="text-sm text-gray-500 dark:text-gray-400">Market Cap</h3>
              <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">
                {isPriceLoading ? <span className="animate-pulse">...</span> : formatCurrency(marketCap)}
              </p>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="h-[400px] p-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-gray-400">Loading chart...</div>
          ) : error ? (
            <div className="flex items-center justify-center h-full text-red-400">{error}</div>
          ) : (
            <canvas ref={chartRef} />
          )}
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Arbix Bot Signals                                                  */}
      {/* ----------------------------------------------------------------- */}
      <h1 className="text-center mt-20 text-2xl font-bold text-gray-900 dark:text-white mb-4">
        Arbix Bot Signals
      </h1>

      <div className="max-w-3xl mx-auto mt-8 p-4 grid grid-cols-1 sm:grid-cols-2 gap-6">
        {isUniLoading && (
          <p className="col-span-full text-center text-gray-500 dark:text-gray-400 animate-pulse text-sm">
            Loading exchange data...
          </p>
        )}
        {uniError && (
          <p className="col-span-full text-center text-red-600 dark:text-red-400 font-semibold text-sm">
            {uniError}
          </p>
        )}

        {/* Arbitrage recommendation */}
        {recommendation && (
          <div className="col-span-full grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="p-4 rounded-xl bg-white dark:bg-gray-800 shadow ring-1 ring-green-400 dark:ring-green-600 space-y-2">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase">Buy From</h3>
              <p className="text-lg font-semibold text-green-600 dark:text-green-400">{recommendation.buyFrom}</p>
              <p className="text-sm text-gray-600 dark:text-gray-300">Price: ${recommendation.buyPrice.toFixed(6)}</p>
            </div>
            <div className="p-4 rounded-xl bg-white dark:bg-gray-800 shadow ring-1 ring-blue-400 dark:ring-blue-600 space-y-2">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase">Sell To</h3>
              <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">{recommendation.sellTo}</p>
              <p className="text-sm text-gray-600 dark:text-gray-300">Price: ${recommendation.sellPrice.toFixed(6)}</p>
            </div>
            <div className="p-4 rounded-xl bg-white dark:bg-gray-800 shadow ring-1 ring-yellow-400 dark:ring-yellow-600 space-y-2">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase">Profit / Token</h3>
              <p className="text-lg font-semibold text-yellow-600 dark:text-yellow-400">${recommendation.profit}</p>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Gain:{" "}
                {(((recommendation.sellPrice - recommendation.buyPrice) / recommendation.buyPrice) * 100).toFixed(4)}%
              </p>
            </div>
          </div>
        )}

        {/* Exchange cards */}

        {/* Uniswap */}
        {uniswapData && (
          <ExchangeCard
            exchange="Uniswap"
            symbol={displaySymbol}
            price={parseFloat(uniswapData.priceUSD)}
            href="https://app.uniswap.org/"
          />
        )}

        {/* CoinGecko / DEX price (replaces OKX) */}
        {tokenPriceData && (
          <ExchangeCard
            exchange="CoinGecko"
            symbol={displaySymbol}
            price={tokenPriceData.price}
            href="https://www.coingecko.com/"
          />
        )}

        {/* Binance */}
        {binancePrice !== null ? (
          <ExchangeCard
            exchange="Binance"
            symbol={displaySymbol}
            price={binancePrice}
            href={`https://www.binance.com/en/trade/${displaySymbol.toUpperCase()}_USDT`}
          />
        ) : (
          <UnavailableCard exchange="Binance" symbol={displaySymbol} />
        )}

        {/* Coinbase */}
        {coinbasePrice !== null ? (
          <ExchangeCard
            exchange="Coinbase"
            symbol={displaySymbol}
            price={coinbasePrice}
            href="https://www.coinbase.com/price"
          />
        ) : (
          <UnavailableCard exchange="Coinbase" symbol={displaySymbol} />
        )}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Small reusable sub-components
// ---------------------------------------------------------------------------

function ExchangeCard({
  exchange,
  symbol,
  price,
  href,
}: {
  exchange: string
  symbol: string
  price: number
  href: string
}) {
  return (
    <div className="p-5 rounded-xl bg-gradient-to-tr from-white via-gray-100 to-gray-50 dark:from-gray-800 dark:via-gray-900 dark:to-gray-950 shadow-xl ring-1 ring-gray-200 dark:ring-gray-700 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-indigo-600 dark:text-indigo-400 uppercase font-semibold tracking-wide text-xs">
          Exchange
        </span>
        <span className="text-indigo-800 dark:text-indigo-300 font-bold text-xs">{exchange}</span>
      </div>
      <h2 className="text-xl font-extrabold text-gray-900 dark:text-white tracking-tight">{symbol}</h2>
      <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">
        Price:{" "}
        <span className="text-green-600 dark:text-green-400">${price.toFixed(6)}</span>
      </p>
      <button
        className="w-full py-2 rounded-md bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition text-sm"
        onClick={() => window.open(href, "_blank")}
      >
        Buy/Sell on {exchange}
      </button>
    </div>
  )
}

function UnavailableCard({ exchange, symbol }: { exchange: string; symbol: string }) {
  return (
    <div className="p-5 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 shadow ring-1 ring-yellow-300 dark:ring-yellow-600 space-y-3">
      <div className="flex items-center justify-between">
        <span className="uppercase font-semibold tracking-wide text-xs">Exchange</span>
        <span className="font-bold text-xs">{exchange}</span>
      </div>
      <h2 className="text-xl font-extrabold tracking-tight">{symbol}</h2>
      <p className="text-sm font-medium">Price not available on {exchange}</p>
    </div>
  )
}