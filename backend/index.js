const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const cors = require('cors');
const querystring = require('querystring');
require('dotenv').config();

const { request, gql } = require('graphql-request');
const {
  createTelegramBot,
  sendTelegramMessage,
  buildArbitrageSignal,
} = require('./telegramBot');

const app = express();
const port = Number(process.env.PORT) || 3000;

// Enable CORS
app.use(cors());
app.use(express.json()); // In case you want to parse JSON bodies later

// Your API credentials — ideally move these to env vars
const apiKey = process.env.OKX_API_KEY || '31cee890-8842-42eb-aab3-925956b5a3dc';
const secretKey = process.env.OKX_SECRET_KEY || 'CE25E2B1BF01FC2942835E384B9132CD';
const passphrase = process.env.OKX_PASSPHRASE || 'Yt6M7.zpDrk.kVP';

const methodPost = 'POST';
const requestPathPost = '/api/v5/dex/market/price-info';
const urlPost = `https://web3.okx.com${requestPathPost}`;

// Tokens you want to track
const tokens = [
  { chainIndex: "501", tokenContractAddress: "So11111111111111111111111111111111111111112" }, // SOL
  { chainIndex: "66", tokenContractAddress: "0x382bb369d343125bfb2117af9c149795c6c65c50" }, // HT
  { chainIndex: "1", tokenContractAddress: "0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2" }, // WETH
  { chainIndex: "1", tokenContractAddress: "0x6B175474E89094C44Da98b954EedeAC495271d0F" }, // DAI
  { chainIndex: "1", tokenContractAddress: "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" }, // USDC
  { chainIndex: "1", tokenContractAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7" }, // USDT
  { chainIndex: "137", tokenContractAddress: "0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0" }, // MATIC
  { chainIndex: "1", tokenContractAddress: "0x514910771af9ca656af840dff83e8264ecf986ca" }, // LINK
  { chainIndex: "1", tokenContractAddress: "0x0d8775f648430679a709e98d2b0cb6250d2887ef" }, // BAT
  { chainIndex: "1", tokenContractAddress: "0x111111111117dc0aa78b770fa6a738034120c302" }, // 1INCH
  { chainIndex: "1", tokenContractAddress: "0xc00e94cb662c3520282e6f5717214004a7f26888" }, // COMP
  { chainIndex: "1", tokenContractAddress: "0x6f259637dcd74c767781e37bc6133cd6a68aa161" }, // HT (heco)
  { chainIndex: "1", tokenContractAddress: "0x408e41876cccdc0f92210600ef50372656052a38" }, // REN
  { chainIndex: "1", tokenContractAddress: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984" }, // UNI
  { chainIndex: "1", tokenContractAddress: "0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e" }, // YFI
  { chainIndex: "1", tokenContractAddress: "0x853d955acef822db058eb8505911ed77f175b99e" }, // FRAX
  { chainIndex: "1", tokenContractAddress: "0x4fabb145d64652a948d72533023f6e7a623c7c53" }, // BUSD
  { chainIndex: "56", tokenContractAddress: "0xe9e7cea3dedca5984780bafc599bd69add087d56" }, // BUSD (BSC)
  { chainIndex: "1", tokenContractAddress: "0x2ba592f78db6436527729929aaf6c908497cb200" }, // CREAM
  { chainIndex: "1", tokenContractAddress: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9" }, // AAVE
  { chainIndex: "1", tokenContractAddress: "0x408e41876cccdc0f92210600ef50372656052a38" }, // REN 

];


// Helper delay function
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Fetch token price info (POST)
async function fetchTokenData(token) {
  const timestamp = new Date().toISOString();
  const body = JSON.stringify([token]);

  const prehash = timestamp + methodPost + requestPathPost + body;
  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(prehash)
    .digest('base64');

  const headers = {
    'Content-Type': 'application/json',
    'OK-ACCESS-KEY': apiKey,
    'OK-ACCESS-SIGN': signature,
    'OK-ACCESS-TIMESTAMP': timestamp,
    'OK-ACCESS-PASSPHRASE': passphrase
  };

  try {
    const response = await axios.post(urlPost, body, { headers });
    return response.data?.data?.[0] || null;
  } catch (error) {
    return { error: error.response?.data || error.message };
  }
}

// Market candles endpoint
app.get('/api/market-chart/:chainIndex/:tokenContractAddress', async (req, res) => {
  try {
    const { chainIndex, tokenContractAddress } = req.params;
    const { bar = '1H', limit = '100', before, after } = req.query;

    if (!chainIndex || !tokenContractAddress) {
      return res.status(400).json({ error: 'chainIndex and tokenContractAddress are required' });
    }

    // Construct query params
    const queryParams = {
      chainIndex,
      tokenContractAddress,
      bar,
      limit,
      ...(before && { before }),
      ...(after && { after }),
    };

    const queryStr = querystring.stringify(queryParams);

    const requestPath = `/api/v5/dex/market/candles?${queryStr}`;

    const timestamp = new Date().toISOString();
    const method = 'GET';
    const body = ''; // GET requests have empty body

    // Generate signature
    const prehash = timestamp + method + requestPath + body;
    const signature = crypto
      .createHmac('sha256', secretKey)
      .update(prehash)
      .digest('base64');

    const headers = {
      'OK-ACCESS-KEY': apiKey,
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': passphrase,
    };

    const url = `https://web3.okx.com${requestPath}`;

    const response = await axios.get(url, { headers });
    res.json(response.data);
  } catch (error) {
    console.error('Failed to fetch OKX data:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch market data' });
  }
});

// Endpoint to fetch all tokens data sequentially with delay
app.get('/market-token', async (req, res) => {
  const results = [];

  for (let i = 0; i < tokens.length; i++) {
    const data = await fetchTokenData(tokens[i]);
    results.push({
      index: i + 1,
      token: tokens[i],
      result: data
    });
    await delay(1000); // Delay to avoid rate limits
  }

  res.json(results);
});

app.get('/api/get-token-price/:chainIndex/:tokenContractAddress', async (req, res) => {
  const { chainIndex, tokenContractAddress } = req.params;

  if (!tokenContractAddress || !chainIndex) {
    return res.status(400).json({ error: 'tokenContractAddress and chainIndex are required.' });
  }

  try {
    const timestamp = new Date().toISOString();
    const method = 'POST';
    const requestPath = '/api/v5/dex/market/price-info';

    // OKX expects an array of tokens in JSON body
    const body = JSON.stringify([{ chainIndex, tokenContractAddress }]);

    // Create signature string and sign
    const prehash = timestamp + method + requestPath + body;
    const signature = crypto.createHmac('sha256', secretKey).update(prehash).digest('base64');

    const headers = {
      'Content-Type': 'application/json',
      'OK-ACCESS-KEY': apiKey,
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': passphrase
    };

    const url = `https://web3.okx.com${requestPath}`;

    const response = await axios.post(url, body, { headers });

    res.json(response.data);

  } catch (error) {
    console.error('Error fetching token price:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch token price' });
  }
});

// const API_KEY = 'afc914943ff24797a37853beeff3ca51';
// const SUBGRAPH_ID = '5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV'; // Replace with actual subgraph ID
// const UNISWAP_SUBGRAPH_URL = `https://gateway.thegraph.com/api/${API_KEY}/subgraphs/id/${SUBGRAPH_ID}`;
// async function fetchUniswapTokenData(tokenAddress) {
//   const token = String(tokenAddress).toLowerCase();
//   const query = gql`
//     {
//       token(id: "${token}") {
//         symbol
//         derivedETH
//       }
//       bundle(id: "1") {
//         ethPriceUSD
//       }
//     }
//   `;

//   const data = await request(UNISWAP_SUBGRAPH_URL, query);

//   if (!data.token) throw new Error('Token not found on Uniswap');

//   const priceUSD = parseFloat(data.token.derivedETH) * parseFloat(data.bundle.ethPriceUSD);

//   return {
//     symbol: data.token.symbol,
//     priceUSD: priceUSD.toFixed(6),
//   };
// }

// app.get('/api/token/:address', async (req, res) => {
//   const tokenAddress = req.params.address;

//   try {
//     const tokenData = await fetchUniswapTokenData(tokenAddress);
//     res.json(tokenData);
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: err.message });
//   }
// });

const API_KEY = process.env.GRAPH_API_KEY || 'afc914943ff24797a37853beeff3ca51';

const chainIdToSubgraphId = {
  1: '5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV',      // Mainnet Uniswap v3 subgraph ID
  137: '3hCPRGf4z88VC5rsBKU5AA9FBBq5nF3jbKJG7VZCbhjm', // Polygon (example, replace!)
  10: 'Cghf4LfVqPiFw6fp6Y5X5Ubc8UpmUhSfJL82zwiBFLaj',   // Optimism (example, replace!)
  42161: 'FbCGRftH4a3yZugY7TnbYgPJVEv2LvMT6oF1fxPe9aJM', // Arbitrum (example, replace!)
};

function getSubgraphURL(chainId) {
  const subgraphId = chainIdToSubgraphId[chainId];
  if (!subgraphId) throw new Error(`Unsupported chainId: ${chainId}`);

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

app.get('/api/token/:chainId/:address', async (req, res) => {
  const { chainId, address } = req.params;
  try {
    const tokenData = await fetchUniswapTokenData(Number(chainId), address);
    
    if (!tokenData || Object.keys(tokenData).length === 0) {
      // Token unsupported or not found
      return res.status(404).json({ error: 'Token unsupported or not found' });
    }

    res.json(tokenData);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Example Express route
app.get('/api/binance-price/:symbol', async (req, res) => {
  const { symbol } = req.params;
  try {
    const response = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol.toUpperCase()}`);
    res.status(200).json({ price: response.data.price });
  } catch (error) {
    console.error("Binance API error:", error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch Binance price' });
  }
});



//coinbase 

app.get('/api/coinbase-price/:symbol', async (req, res) => {
  const { symbol } = req.params;

  if (!symbol) {
    return res.status(400).json({ error: 'Symbol parameter is required, e.g. BTC-USD' });
  }

  try {
    // Coinbase public API endpoint for spot price
    const url = `https://api.coinbase.com/v2/prices/${symbol}/spot`;

    const response = await axios.get(url);

    if (response.data && response.data.data) {
      return res.json({
        symbol: symbol.toUpperCase(),
        price: response.data.data.amount,
        currency: response.data.data.currency,
        timestamp: new Date().toISOString()
      });
    } else {
      return res.status(404).json({ error: 'Price data not found' });
    }
  } catch (error) {
    console.error('Error fetching Coinbase price:', error.message);
    return res.status(500).json({ error: 'Failed to fetch price from Coinbase' });
  }
});

const telegramBotController = createTelegramBot({
  token: process.env.TELEGRAM_BOT_TOKEN,
  allowedChatId: process.env.TELEGRAM_ALLOWED_CHAT_ID,
});

app.post('/api/telegram/notify', async (req, res) => {
  const { message, chatId, secret } = req.body || {};

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required and must be a string' });
  }

  if (
    process.env.TELEGRAM_NOTIFY_SECRET &&
    secret !== process.env.TELEGRAM_NOTIFY_SECRET
  ) {
    return res.status(401).json({ error: 'Unauthorized notifier request' });
  }

  const response = await sendTelegramMessage(telegramBotController.bot, message, {
    chatId: chatId || process.env.TELEGRAM_DEFAULT_CHAT_ID,
  });

  if (!response.ok) {
    return res.status(500).json({ error: response.error });
  }

  return res.status(200).json({ success: true, messageId: response.messageId });
});

app.post('/api/telegram/signal/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const { chatId, thresholdPercent, secret } = req.body || {};

  if (!symbol) {
    return res.status(400).json({ error: 'symbol param is required, e.g. YFIUSDT' });
  }

  if (
    process.env.TELEGRAM_NOTIFY_SECRET &&
    secret !== process.env.TELEGRAM_NOTIFY_SECRET
  ) {
    return res.status(401).json({ error: 'Unauthorized notifier request' });
  }

  try {
    const signal = await buildArbitrageSignal({
      symbol,
      thresholdPercent: Number(thresholdPercent) || 0.25,
    });

    const response = await sendTelegramMessage(telegramBotController.bot, signal.message, {
      chatId: chatId || process.env.TELEGRAM_DEFAULT_CHAT_ID,
    });

    if (!response.ok) {
      return res.status(500).json({ error: response.error, signal });
    }

    return res.status(200).json({ success: true, signal, messageId: response.messageId });
  } catch (error) {
    console.error('Failed to create Telegram signal:', error.message);
    return res.status(500).json({ error: 'Failed to create Telegram signal' });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  if (telegramBotController.isEnabled) {
    console.log('Telegram bot polling started');
  } else {
    console.log('Telegram bot is disabled (set TELEGRAM_BOT_TOKEN to enable)');
  }
});
