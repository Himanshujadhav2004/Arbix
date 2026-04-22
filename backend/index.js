const express = require('express');
const axios = require('axios');
const cors = require('cors');
const querystring = require('querystring');
const Groq = require('groq-sdk');
const { request, gql } = require('graphql-request');
const { configDotenv } = require('dotenv');

configDotenv(); // Load .env variables
const {
  createTelegramBot,
  sendTelegramMessage,
  buildArbitrageSignal,
} = require('./telegramBot');

const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openrouter/free';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
const groqClient = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

function aiWait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildAiMessages({ prompt, systemPrompt, history } = {}) {
  const messages = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: String(systemPrompt) });
  }

  if (Array.isArray(history)) {
    for (const item of history) {
      if (!item || typeof item !== 'object') continue;
      if (!item.role || !item.content) continue;
      messages.push({ role: String(item.role), content: String(item.content) });
    }
  }

  if (prompt) {
    messages.push({ role: 'user', content: String(prompt) });
  }

  if (!messages.length) {
    throw new Error('No prompt or messages provided');
  }

  return messages;
}

function isOpenRouterRateLimitError(error) {
  const status = Number(error?.response?.status || 0);
  const raw = String(
    error?.response?.data?.error?.metadata?.raw ||
    error?.response?.data?.error?.message ||
    error?.message ||
    ''
  ).toLowerCase();

  return status === 429 || raw.includes('rate-limit') || raw.includes('rate limit');
}

function getOpenRouterModelCandidates(requestedModel) {
  const primary = String(requestedModel || OPENROUTER_MODEL || '').trim();
  const envFallback = String(process.env.OPENROUTER_FALLBACK_MODELS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  const groqFallbackFromEnv = String(process.env.OPENROUTER_GROQ_FALLBACK_MODEL || '').trim();

  const defaults = [
    'openrouter/free',
    // Alternative free Groq-friendly candidate.
    'meta-llama/llama-3.3-70b-instruct:free',
    'google/gemma-3n-e2b-it:free',
    'google/gemma-4-26b-a4b-it:free',
  ];

  return [...new Set([primary, ...envFallback, ...defaults].filter(Boolean))];
}

async function askAiWithOpenRouter({ prompt, systemPrompt, history, model } = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

  const messages = buildAiMessages({ prompt, systemPrompt, history });

  const modelCandidates = getOpenRouterModelCandidates(model);
  const maxRetries = Math.max(1, Number(process.env.OPENROUTER_MAX_RETRIES) || 2);
  let lastError = null;

  for (const currentModel of modelCandidates) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.post(
          `${OPENROUTER_BASE_URL}/chat/completions`,
          {
            model: currentModel,
            messages,
            temperature: 0.3,
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
              'X-Title': 'ArbiX Backend',
            },
            timeout: 30000,
          }
        );

        const choice = response.data?.choices?.[0];
        const text = choice?.message?.content || '';
        if (!text) {
          throw new Error('OpenRouter returned an empty response');
        }

        return {
          text,
          model: response.data?.model || currentModel,
          usage: response.data?.usage || null,
        };
      } catch (error) {
        lastError = error;
        const isRateLimited = isOpenRouterRateLimitError(error);

        if (isRateLimited && attempt < maxRetries) {
          await aiWait(600 * attempt);
          continue;
        }

        if (isRateLimited) {
          break;
        }

        throw error;
      }
    }
  }

  if (isOpenRouterRateLimitError(lastError)) {
    const rateLimitError = new Error('OpenRouter is temporarily rate-limited. Please retry shortly.');
    rateLimitError.status = 429;
    throw rateLimitError;
  }

  throw lastError || new Error('OpenRouter request failed');
}

async function askAiWithGroq({ prompt, systemPrompt, history, model } = {}) {
  if (!groqClient) {
    throw new Error('GROQ_API_KEY is not configured');
  }

  const messages = buildAiMessages({ prompt, systemPrompt, history });
  const response = await groqClient.chat.completions.create({
    model: model || GROQ_MODEL,
    messages,
    temperature: 0.3,
  });

  const text = response?.choices?.[0]?.message?.content || '';
  if (!text) {
    throw new Error('Groq returned an empty response');
  }

  return {
    text,
    model: response?.model || model || GROQ_MODEL,
    usage: response?.usage || null,
    provider: 'groq',
  };
}

function shouldFallbackToGroq(error) {
  const status = Number(error?.status || error?.response?.status || 0);
  const message = String(error?.message || '').toLowerCase();
  return (
    status === 429 ||
    status >= 500 ||
    message.includes('openrouter') ||
    message.includes('provider returned error') ||
    message.includes('temporarily rate-limited') ||
    message.includes('openrouter_api_key')
  );
}

async function askAiWithFallbackProviders({ prompt, systemPrompt, history, model } = {}) {
  try {
    const openRouterResult = await askAiWithOpenRouter({ prompt, systemPrompt, history, model });
    return {
      ...openRouterResult,
      provider: 'openrouter',
    };
  } catch (openRouterError) {
    console.error('OpenRouter error:', openRouterError.response?.data || openRouterError.message);

    if (!groqClient || !shouldFallbackToGroq(openRouterError)) {
      throw openRouterError;
    }

    try {
      return await askAiWithGroq({ prompt, systemPrompt, history, model: process.env.GROQ_MODEL || GROQ_MODEL });
    } catch (groqError) {
      console.error('Groq fallback error:', groqError.response?.data || groqError.message);
      throw openRouterError;
    }
  }
}

const telegramBotController = createTelegramBot({
  token: process.env.TELEGRAM_BOT_TOKEN,
  allowedChatId: process.env.TELEGRAM_ALLOWED_CHAT_ID || process.env.TELEGRAM_DEFAULT_CHAT_ID,
  askAi: askAiWithFallbackProviders,
});

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());

const requestRateStore = new Map();
const responseCacheStore = new Map();

function createRateLimiter({ keyPrefix, windowMs, maxRequests }) {
  return function rateLimitMiddleware(req, res, next) {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const bucketKey = `${keyPrefix}:${ip}`;
    const now = Date.now();
    const current = requestRateStore.get(bucketKey);

    if (!current || current.resetAt <= now) {
      requestRateStore.set(bucketKey, {
        count: 1,
        resetAt: now + windowMs,
      });
      return next();
    }

    if (current.count >= maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        error: 'Too many requests. Please retry shortly.',
        retryAfterSeconds,
      });
    }

    current.count += 1;
    requestRateStore.set(bucketKey, current);
    return next();
  };
}

function createCacheMiddleware({ keyPrefix, ttlMs }) {
  return function cacheMiddleware(req, res, next) {
    const bodyKey = req.method === 'POST' ? JSON.stringify(req.body || {}) : '';
    const cacheKey = `${keyPrefix}:${req.method}:${req.originalUrl}:${bodyKey}`;
    const now = Date.now();
    const cached = responseCacheStore.get(cacheKey);

    if (cached && cached.expiresAt > now) {
      res.setHeader('X-Cache', 'HIT');
      return res.status(cached.status).json(cached.payload);
    }

    if (cached && cached.expiresAt <= now) {
      responseCacheStore.delete(cacheKey);
    }

    const originalJson = res.json.bind(res);
    res.json = (payload) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        responseCacheStore.set(cacheKey, {
          status: res.statusCode,
          payload,
          expiresAt: now + ttlMs,
        });
        res.setHeader('X-Cache', 'MISS');
      }
      return originalJson(payload);
    };

    return next();
  };
}

const aiRateLimiter = createRateLimiter({
  keyPrefix: 'ai',
  windowMs: Number(process.env.AI_RATE_WINDOW_MS) || 60_000,
  maxRequests: Number(process.env.AI_RATE_MAX_REQUESTS) || 20,
});

const marketRateLimiter = createRateLimiter({
  keyPrefix: 'market',
  windowMs: Number(process.env.MARKET_RATE_WINDOW_MS) || 60_000,
  maxRequests: Number(process.env.MARKET_RATE_MAX_REQUESTS) || 120,
});

const heavyRouteRateLimiter = createRateLimiter({
  keyPrefix: 'market-heavy',
  windowMs: Number(process.env.MARKET_HEAVY_WINDOW_MS) || 60_000,
  maxRequests: Number(process.env.MARKET_HEAVY_MAX_REQUESTS) || 12,
});

const aiCache = createCacheMiddleware({
  keyPrefix: 'ai-chat',
  ttlMs: Number(process.env.AI_CACHE_TTL_MS) || 20_000,
});

const marketCacheShort = createCacheMiddleware({
  keyPrefix: 'market-short',
  ttlMs: Number(process.env.MARKET_CACHE_SHORT_TTL_MS) || 15_000,
});

const marketCacheLong = createCacheMiddleware({
  keyPrefix: 'market-long',
  ttlMs: Number(process.env.MARKET_CACHE_LONG_TTL_MS) || 60_000,
});

app.post('/api/ai/chat', aiRateLimiter, aiCache, async (req, res) => {
  const { message, prompt, systemPrompt, history, model } = req.body || {};
  const userPrompt = message || prompt;

  if (!userPrompt && !Array.isArray(history)) {
    return res.status(400).json({ error: 'message (or prompt) or history is required' });
  }

  try {
    const result = await askAiWithFallbackProviders({
      prompt: userPrompt,
      systemPrompt,
      history,
      model,
    });
    return res.json(result);
  } catch (error) {
    console.error('OpenRouter error:', error.response?.data || error.message);
    if (String(error.message || '').includes('OPENROUTER_API_KEY')) {
      return res.status(503).json({ error: error.message });
    }
    if (Number(error.status || error.response?.status) === 429) {
      return res.status(429).json({ error: error.message || 'AI temporarily rate-limited. Please retry shortly.' });
    }
    return res.status(500).json({ error: 'AI request failed' });
  }
});

// ---------------------------------------------------------------------------
// CoinGecko — free public API, no key required, works globally
// Docs: https://www.coingecko.com/en/api/documentation
// ---------------------------------------------------------------------------

// Map from (chainIndex or chainId) -> CoinGecko platform id
const chainToCoinGeckoPlatform = {
  '1':    'ethereum',
  '56':   'binance-smart-chain',
  '137':  'polygon-pos',
  '10':   'optimistic-ethereum',
  '42161':'arbitrum-one',
  '43114':'avalanche',
  '250':  'fantom',
  '66':   'huobi-token',           // HECO
  '501':  'solana',                // Solana
};

// Map from (chainIndex or chainId) -> CoinGecko asset_platform id for candles
// CoinGecko uses "id" for coins. For contract-based tokens we use /coins/{platform}/contract/{address}
// For Solana native token we use a direct coin id lookup
const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

// Some tokens don't have contract addresses on CoinGecko (native tokens).
// We map known native token contracts to their CoinGecko coin id.
const nativeTokenMap = {
  // Solana native SOL
  'So11111111111111111111111111111111111111112': 'solana',
  // WETH on Ethereum (treated as ETH)
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 'ethereum',
  // MATIC native (polygon)
  '0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0': 'matic-network',
};

/**
 * Fetch token price info from CoinGecko.
 * Supports both contract-address-based tokens and native tokens.
 */
async function fetchTokenPriceFromCoinGecko(chainIndex, tokenContractAddress) {
  const platform = chainToCoinGeckoPlatform[String(chainIndex)];
  const addressLower = tokenContractAddress.toLowerCase();

  // Check if it's a known native token
  const nativeCoinId = nativeTokenMap[tokenContractAddress] || nativeTokenMap[addressLower];

  try {
    let url;
    if (nativeCoinId) {
      // Use direct coin endpoint
      url = `${COINGECKO_BASE}/coins/${nativeCoinId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false`;
    } else if (platform) {
      // Use contract endpoint
      url = `${COINGECKO_BASE}/coins/${platform}/contract/${addressLower}`;
    } else {
      return { error: `Unsupported chainIndex: ${chainIndex}` };
    }

    const response = await axios.get(url, {
      headers: { 'Accept': 'application/json' },
      timeout: 10000,
    });

    const data = response.data;
    const marketData = data.market_data;

    return {
      tokenContractAddress,
      chainIndex,
      symbol: data.symbol?.toUpperCase(),
      name: data.name,
      price: marketData?.current_price?.usd ?? null,
      priceChange24h: marketData?.price_change_percentage_24h ?? null,
      volume24h: marketData?.total_volume?.usd ?? null,
      marketCap: marketData?.market_cap?.usd ?? null,
      high24h: marketData?.high_24h?.usd ?? null,
      low24h: marketData?.low_24h?.usd ?? null,
      lastUpdated: marketData?.last_updated ?? null,
    };
  } catch (error) {
    const status = error.response?.status;
    if (status === 404) {
      return { error: 'Token not found on CoinGecko', chainIndex, tokenContractAddress };
    }
    if (status === 429) {
      return { error: 'CoinGecko rate limit hit — please wait a moment', chainIndex, tokenContractAddress };
    }
    return { error: error.response?.data?.error || error.message, chainIndex, tokenContractAddress };
  }
}

// ---------------------------------------------------------------------------
// Tokens list (same tokens as before)
// ---------------------------------------------------------------------------
const tokens = [
  { chainIndex: "501", tokenContractAddress: "So11111111111111111111111111111111111111112" }, // SOL
  { chainIndex: "66",  tokenContractAddress: "0x382bb369d343125bfb2117af9c149795c6c65c50" }, // HT
  { chainIndex: "1",   tokenContractAddress: "0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2" }, // WETH
  { chainIndex: "1",   tokenContractAddress: "0x6B175474E89094C44Da98b954EedeAC495271d0F" }, // DAI
  { chainIndex: "1",   tokenContractAddress: "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" }, // USDC
  { chainIndex: "1",   tokenContractAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7" }, // USDT
  { chainIndex: "137", tokenContractAddress: "0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0" }, // MATIC
  { chainIndex: "1",   tokenContractAddress: "0x514910771af9ca656af840dff83e8264ecf986ca" }, // LINK
  { chainIndex: "1",   tokenContractAddress: "0x0d8775f648430679a709e98d2b0cb6250d2887ef" }, // BAT
  { chainIndex: "1",   tokenContractAddress: "0x111111111117dc0aa78b770fa6a738034120c302" }, // 1INCH
  { chainIndex: "1",   tokenContractAddress: "0xc00e94cb662c3520282e6f5717214004a7f26888" }, // COMP
  { chainIndex: "1",   tokenContractAddress: "0x408e41876cccdc0f92210600ef50372656052a38" }, // REN
  { chainIndex: "1",   tokenContractAddress: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984" }, // UNI
  { chainIndex: "1",   tokenContractAddress: "0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e" }, // YFI
  { chainIndex: "1",   tokenContractAddress: "0x853d955acef822db058eb8505911ed77f175b99e" }, // FRAX
  { chainIndex: "1",   tokenContractAddress: "0x4fabb145d64652a948d72533023f6e7a623c7c53" }, // BUSD
  { chainIndex: "56",  tokenContractAddress: "0xe9e7cea3dedca5984780bafc599bd69add087d56" }, // BUSD (BSC)
  { chainIndex: "1",   tokenContractAddress: "0x2ba592f78db6436527729929aaf6c908497cb200" }, // CREAM
  { chainIndex: "1",   tokenContractAddress: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9" }, // AAVE
];

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Route: GET /market-token
// Returns price info for all tracked tokens
// ---------------------------------------------------------------------------
app.get('/market-token', heavyRouteRateLimiter, marketCacheLong, async (req, res) => {
  const results = [];

  for (let i = 0; i < tokens.length; i++) {
    const { chainIndex, tokenContractAddress } = tokens[i];
    const data = await fetchTokenPriceFromCoinGecko(chainIndex, tokenContractAddress);
    results.push({ index: i + 1, token: tokens[i], result: data });
    await delay(1200); // CoinGecko free tier: ~50 req/min, so ~1.2s gap is safe
  }

  res.json(results);
});

// ---------------------------------------------------------------------------
// Route: GET /api/get-token-price/:chainIndex/:tokenContractAddress
// Returns price info for a single token via CoinGecko
// ---------------------------------------------------------------------------
app.get('/api/get-token-price/:chainIndex/:tokenContractAddress', marketRateLimiter, marketCacheShort, async (req, res) => {
  const { chainIndex, tokenContractAddress } = req.params;

  if (!tokenContractAddress || !chainIndex) {
    return res.status(400).json({ error: 'tokenContractAddress and chainIndex are required.' });
  }

  const data = await fetchTokenPriceFromCoinGecko(chainIndex, tokenContractAddress);

  if (data.error) {
    return res.status(404).json(data);
  }

  res.json(data);
});

// ---------------------------------------------------------------------------
// Route: GET /api/market-chart/:chainIndex/:tokenContractAddress
// Returns OHLCV candle data from CoinGecko
// bar param: '1H' | '4H' | '1D' | '1W'  (we map to CoinGecko "days")
// ---------------------------------------------------------------------------
const barToDays = {
  '1m': 1, '5m': 1, '15m': 1, '30m': 1,
  '1H': 1, '4H': 7, '1D': 30, '1W': 90, '1M': 365,
};

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/market-chart/:chainIndex/:tokenContractAddress', marketRateLimiter, marketCacheShort, async (req, res) => {
  const { chainIndex, tokenContractAddress } = req.params;
  const { bar = '1D' } = req.query;

  const platform = chainToCoinGeckoPlatform[String(chainIndex)];
  const addressLower = tokenContractAddress.toLowerCase();
  const nativeCoinId = nativeTokenMap[tokenContractAddress] || nativeTokenMap[addressLower];
  const days = barToDays[bar] || 30;

  try {
    let url;
    if (nativeCoinId) {
      url = `${COINGECKO_BASE}/coins/${nativeCoinId}/ohlc?vs_currency=usd&days=${days}`;
    } else if (platform) {
      // Get coin id from contract first, then fetch OHLC
      const infoRes = await axios.get(`${COINGECKO_BASE}/coins/${platform}/contract/${addressLower}`);
      const coinId = infoRes.data.id;
      url = `${COINGECKO_BASE}/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`;
    } else {
      return res.status(400).json({ error: `Unsupported chainIndex: ${chainIndex}` });
    }

    const response = await axios.get(url, { timeout: 10000 });

    // CoinGecko OHLC format: [[timestamp, open, high, low, close], ...]
    // We reformat to match original OKX candle structure: [ts, o, h, l, c, vol, volCcy]
    const candles = response.data.map(([ts, o, h, l, c]) => ({
      timestamp: ts,
      open: o,
      high: h,
      low: l,
      close: c,
    }));

    res.json({ data: candles, bar, days });
  } catch (error) {
    console.error('Failed to fetch candle data:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch market chart data' });
  }
});

// ---------------------------------------------------------------------------
// Uniswap subgraph (The Graph) — EVM chains only
// Chain 501 (Solana) is intentionally excluded here; use /api/get-token-price instead
// ---------------------------------------------------------------------------
const API_KEY = process.env.UNISWAP_API_KEY;

const chainIdToSubgraphId = {
  1:     '5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV',
  137:   '3hCPRGf4z88VC5rsBKU5AA9FBBq5nF3jbKJG7VZCbhjm',
  10:    'Cghf4LfVqPiFw6fp6Y5X5Ubc8UpmUhSfJL82zwiBFLaj',
  42161: 'FbCGRftH4a3yZugY7TnbYgPJVEv2LvMT6oF1fxPe9aJM',
};

function getSubgraphURL(chainId) {
  const subgraphId = chainIdToSubgraphId[chainId];
  if (!subgraphId) throw new Error(`Unsupported chainId for Uniswap subgraph: ${chainId}. Use /api/get-token-price instead.`);
  return `https://gateway.thegraph.com/api/${API_KEY}/subgraphs/id/${subgraphId}`;
}

async function fetchUniswapTokenData(chainId, tokenAddress) {
  const subgraphURL = getSubgraphURL(chainId);
  const token = String(tokenAddress).toLowerCase();

  const query = gql`
    {
      token(id: "${token}") {
        symbol
        derivedETH
      }
      bundle(id: "1") {
        ethPriceUSD
      }
    }
  `;

  const data = await request(subgraphURL, query);
  if (!data.token) throw new Error('Token not found on Uniswap');

  const priceUSD = parseFloat(data.token.derivedETH) * parseFloat(data.bundle.ethPriceUSD);
  return {
    symbol: data.token.symbol,
    priceUSD: priceUSD.toFixed(6),
  };
}

app.get('/api/token/:chainId/:address', marketRateLimiter, marketCacheShort, async (req, res) => {
  const { chainId, address } = req.params;
  const numericChainId = Number(chainId);

  // Solana and unsupported chains — fall back to CoinGecko
  if (!chainIdToSubgraphId[numericChainId]) {
    const data = await fetchTokenPriceFromCoinGecko(chainId, address);
    if (data.error) return res.status(404).json(data);
    return res.json({ symbol: data.symbol, priceUSD: String(data.price) });
  }

  try {
    const tokenData = await fetchUniswapTokenData(numericChainId, address);
    if (!tokenData || Object.keys(tokenData).length === 0) {
      return res.status(404).json({ error: 'Token unsupported or not found' });
    }
    res.json(tokenData);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Binance price endpoint (unchanged — works globally)
// ---------------------------------------------------------------------------
app.get('/api/binance-price/:symbol', marketRateLimiter, marketCacheShort, async (req, res) => {
  const { symbol } = req.params;
  try {
    const response = await axios.get(
      `https://api.binance.com/api/v3/ticker/price?symbol=${symbol.toUpperCase()}`
    );
    res.status(200).json({ price: response.data.price });
  } catch (error) {
    console.error('Binance API error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch Binance price' });
  }
});

// ---------------------------------------------------------------------------
// Coinbase price endpoint (unchanged — works globally)
// ---------------------------------------------------------------------------
app.get('/api/coinbase-price/:symbol', marketRateLimiter, marketCacheShort, async (req, res) => {
  const { symbol } = req.params;

  if (!symbol) {
    return res.status(400).json({ error: 'Symbol parameter is required, e.g. BTC-USD' });
  }

  try {
    const url = `https://api.coinbase.com/v2/prices/${symbol}/spot`;
    const response = await axios.get(url);

    if (response.data?.data) {
      return res.json({
        symbol: symbol.toUpperCase(),
        price: response.data.data.amount,
        currency: response.data.data.currency,
        timestamp: new Date().toISOString(),
      });
    }

    return res.status(404).json({ error: 'Price data not found' });
  } catch (error) {
    console.error('Error fetching Coinbase price:', error.message);
    return res.status(500).json({ error: 'Failed to fetch price from Coinbase' });
  }
});

// ---------------------------------------------------------------------------
// Signal endpoint (backend source of truth for Telegram/web clients)
// ---------------------------------------------------------------------------
app.get('/api/signal/:symbol', marketRateLimiter, marketCacheShort, async (req, res) => {
  const { symbol } = req.params;
  const threshold = Number(req.query?.threshold);
  const thresholdPercent = Number.isFinite(threshold) && threshold > 0 ? threshold : 0.25;

  if (!symbol) {
    return res.status(400).json({ error: 'Symbol parameter is required, e.g. BTCUSDT' });
  }

  try {
    const normalizedBinanceSymbol = String(symbol).trim().toUpperCase().replace('-', '').replace(/USD$/, 'USDT');
    const normalizedCoinbaseSymbol = String(symbol).trim().toUpperCase().includes('-')
      ? String(symbol).trim().toUpperCase()
      : String(symbol).trim().toUpperCase().endsWith('USDT')
        ? `${String(symbol).trim().toUpperCase().slice(0, -4)}-USD`
        : String(symbol).trim().toUpperCase().endsWith('USD')
          ? `${String(symbol).trim().toUpperCase().slice(0, -3)}-USD`
          : `${String(symbol).trim().toUpperCase()}-USD`;

    const [binanceResponse, coinbaseResponse] = await Promise.all([
      axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${normalizedBinanceSymbol}`),
      axios.get(`https://api.coinbase.com/v2/prices/${normalizedCoinbaseSymbol}/spot`),
    ]);

    const binancePrice = Number(binanceResponse.data?.price);
    const coinbasePrice = Number(coinbaseResponse.data?.data?.amount);

    if (!Number.isFinite(binancePrice) || !Number.isFinite(coinbasePrice) || binancePrice <= 0) {
      return res.status(502).json({ error: 'Invalid price response from upstream exchange API' });
    }

    const delta = coinbasePrice - binancePrice;
    const spreadPct = (Math.abs(delta) / binancePrice) * 100;
    const buyAt = delta > 0 ? 'Binance' : 'Coinbase';
    const sellAt = delta > 0 ? 'Coinbase' : 'Binance';
    const shouldAlert = spreadPct >= thresholdPercent;

    return res.json({
      symbol: String(symbol).trim().toUpperCase(),
      binancePrice,
      coinbasePrice,
      spreadPct,
      buyAt,
      sellAt,
      thresholdPercent,
      shouldAlert,
    });
  } catch (error) {
    console.error('Signal API error:', error.response?.data || error.message);
    return res.status(500).json({ error: 'Failed to fetch signal data' });
  }
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  if (telegramBotController.isEnabled) {
    console.log('Telegram bot polling started');
  } else {
    console.log('Telegram bot is disabled (set TELEGRAM_BOT_TOKEN to enable)');
  }
});