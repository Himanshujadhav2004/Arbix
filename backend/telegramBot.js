const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');

const DEFAULT_SUGGEST_SYMBOLS = [
  'BTCUSDT',
  'ETHUSDT',
  'SOLUSDT',
  'AAVEUSDT',
  'LINKUSDT',
  'UNIUSDT',
  'XRPUSDT',
  'ADAUSDT',
  'LTCUSDT',
  'DOGEUSDT',
];

function normalizeBinanceSymbol(rawSymbol) {
  const symbol = String(rawSymbol || '').trim().toUpperCase();
  if (symbol.includes('-')) {
    return symbol.replace('-', '');
  }

  if (symbol.endsWith('USD')) {
    return `${symbol}T`;
  }

  return symbol;
}

function normalizeCoinbaseSymbol(rawSymbol) {
  const symbol = String(rawSymbol || '').trim().toUpperCase();
  if (symbol.includes('-')) {
    return symbol;
  }

  if (symbol.endsWith('USDT')) {
    return `${symbol.slice(0, -4)}-USD`;
  }

  if (symbol.endsWith('USD')) {
    return `${symbol.slice(0, -3)}-USD`;
  }

  return `${symbol}-USD`;
}

async function fetchBinancePrice(symbol) {
  const normalizedSymbol = normalizeBinanceSymbol(symbol);
  const response = await axios.get(
    `https://api.binance.com/api/v3/ticker/price?symbol=${normalizedSymbol}`
  );

  return Number(response.data.price);
}

async function fetchCoinbasePrice(symbol) {
  const normalizedSymbol = normalizeCoinbaseSymbol(symbol);
  const response = await axios.get(
    `https://api.coinbase.com/v2/prices/${normalizedSymbol}/spot`
  );

  return Number(response.data.data.amount);
}

function validateChat(allowedChatId, chatId) {
  if (!allowedChatId) {
    return true;
  }

  return String(allowedChatId) === String(chatId);
}

function startMessage() {
  return [
    'ArbiX bot is online.',
    '',
    'Commands:',
    '/help - Show commands',
    '/price <symbol> - Latest Binance and Coinbase prices',
    '/signal <symbol> - Arbitrage summary (example: /signal YFIUSDT)',
    '/suggest - Top auto-picked opportunities'
  ].join('\n');
}

function mainMenuKeyboard() {
  return {
    keyboard: [
      [{ text: 'Price BTCUSDT' }, { text: 'Signal BTCUSDT' }],
      [{ text: 'Price ETHUSDT' }, { text: 'Signal ETHUSDT' }],
      [{ text: 'Suggest Best Signals' }],
    ],
    resize_keyboard: true,
  };
}

function actionInlineKeyboard(symbol) {
  const normalized = String(symbol || '').toUpperCase();

  return {
    inline_keyboard: [
      [
        { text: `Refresh ${normalized}`, callback_data: `signal:${normalized}` },
        { text: 'Suggest Best', callback_data: 'suggest:5' },
      ],
    ],
  };
}

async function buildArbitrageSignal({ symbol, thresholdPercent = 0.25 }) {
  const [binancePrice, coinbasePrice] = await Promise.all([
    fetchBinancePrice(symbol),
    fetchCoinbasePrice(symbol),
  ]);

  const delta = coinbasePrice - binancePrice;
  const spreadPct = (Math.abs(delta) / binancePrice) * 100;
  const buyAt = delta > 0 ? 'Binance' : 'Coinbase';
  const sellAt = delta > 0 ? 'Coinbase' : 'Binance';
  const shouldAlert = spreadPct >= thresholdPercent;

  const message = [
    `ArbiX Signal: ${String(symbol).toUpperCase()}`,
    `Binance: $${binancePrice.toFixed(6)}`,
    `Coinbase: $${coinbasePrice.toFixed(6)}`,
    `Spread: ${spreadPct.toFixed(4)}%`,
    `Route: Buy on ${buyAt}, Sell on ${sellAt}`,
    shouldAlert
      ? `Status: PROFITABLE (>= ${thresholdPercent}%)`
      : `Status: below threshold (${thresholdPercent}%)`
  ].join('\n');

  return {
    symbol: String(symbol).toUpperCase(),
    binancePrice,
    coinbasePrice,
    spreadPct,
    buyAt,
    sellAt,
    shouldAlert,
    message,
  };
}

async function suggestBestSignals({
  symbols = DEFAULT_SUGGEST_SYMBOLS,
  thresholdPercent = 0.25,
  topN = 5,
}) {
  const settled = await Promise.allSettled(
    symbols.map((symbol) => buildArbitrageSignal({ symbol, thresholdPercent }))
  );

  const successful = settled
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value)
    .sort((a, b) => b.spreadPct - a.spreadPct);

  const best = successful.slice(0, Math.max(1, topN));

  const header = [
    `ArbiX Suggestions (Top ${best.length})`,
    `Threshold: ${thresholdPercent}%`,
    '',
  ];

  const lines = best.map((item, index) => {
    const status = item.shouldAlert ? 'PROFITABLE' : 'WATCH';
    return [
      `${index + 1}. ${item.symbol} (${status})`,
      `Spread: ${item.spreadPct.toFixed(4)}%`,
      `Route: Buy on ${item.buyAt}, Sell on ${item.sellAt}`,
    ].join('\n');
  });

  if (lines.length === 0) {
    return {
      best: [],
      message: 'No suggestions available right now. Please try again shortly.',
    };
  }

  return {
    best,
    message: [...header, lines.join('\n\n')].join('\n'),
  };
}

async function sendPriceMessage(bot, chatId, symbol) {
  const [binancePrice, coinbasePrice] = await Promise.all([
    fetchBinancePrice(symbol),
    fetchCoinbasePrice(symbol),
  ]);

  const normalized = String(symbol).toUpperCase();
  const message = [
    `Prices for ${normalized}`,
    `Binance: $${binancePrice.toFixed(6)}`,
    `Coinbase: $${coinbasePrice.toFixed(6)}`,
  ].join('\n');

  await bot.sendMessage(chatId, message, {
    reply_markup: actionInlineKeyboard(normalized),
  });
}

async function sendSignalMessage(bot, chatId, symbol, thresholdPercent = 0.25) {
  const signal = await buildArbitrageSignal({ symbol, thresholdPercent });
  await bot.sendMessage(chatId, signal.message, {
    reply_markup: actionInlineKeyboard(signal.symbol),
  });
}

async function sendSuggestionsMessage(bot, chatId, topN = 5, thresholdPercent = 0.25) {
  const suggestion = await suggestBestSignals({ topN, thresholdPercent });

  await bot.sendMessage(chatId, suggestion.message, {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Refresh Suggestions', callback_data: `suggest:${topN}` }],
        suggestion.best.slice(0, 3).map((item) => ({
          text: `Signal ${item.symbol}`,
          callback_data: `signal:${item.symbol}`,
        })),
      ],
    },
  });
}

function createTelegramBot({ token, allowedChatId }) {
  if (!token) {
    return {
      bot: null,
      isEnabled: false,
      allowedChatId,
    };
  }

  const bot = new TelegramBot(token, { polling: true });

  bot.setMyCommands([
    { command: 'start', description: 'Open bot menu' },
    { command: 'help', description: 'Show bot commands' },
    { command: 'price', description: 'Get price. Example: /price BTCUSDT' },
    { command: 'signal', description: 'Get signal. Example: /signal BTCUSDT' },
    { command: 'suggest', description: 'Auto-suggest best opportunities' },
  ]);

  bot.onText(/\/start/, async (msg) => {
    if (!validateChat(allowedChatId, msg.chat.id)) {
      return;
    }

    await bot.sendMessage(msg.chat.id, startMessage(), {
      reply_markup: mainMenuKeyboard(),
    });
  });

  bot.onText(/\/help/, async (msg) => {
    if (!validateChat(allowedChatId, msg.chat.id)) {
      return;
    }

    await bot.sendMessage(msg.chat.id, startMessage(), {
      reply_markup: mainMenuKeyboard(),
    });
  });

  bot.onText(/\/price\s+(.+)/, async (msg, match) => {
    if (!validateChat(allowedChatId, msg.chat.id)) {
      return;
    }

    const symbol = match?.[1];
    if (!symbol) {
      await bot.sendMessage(msg.chat.id, 'Use: /price <symbol>');
      return;
    }

    try {
      await sendPriceMessage(bot, msg.chat.id, symbol);
    } catch (error) {
      await bot.sendMessage(msg.chat.id, `Failed to fetch prices: ${error.message}`);
    }
  });

  bot.onText(/\/signal\s+(.+)/, async (msg, match) => {
    if (!validateChat(allowedChatId, msg.chat.id)) {
      return;
    }

    const symbol = match?.[1];
    if (!symbol) {
      await bot.sendMessage(msg.chat.id, 'Use: /signal <symbol> (example: /signal YFIUSDT)');
      return;
    }

    try {
      await sendSignalMessage(bot, msg.chat.id, symbol);
    } catch (error) {
      await bot.sendMessage(msg.chat.id, `Failed to build signal: ${error.message}`);
    }
  });

  bot.onText(/\/suggest(?:\s+(\d+))?/, async (msg, match) => {
    if (!validateChat(allowedChatId, msg.chat.id)) {
      return;
    }

    const requested = Number(match?.[1]);
    const topN = Number.isFinite(requested) && requested > 0 ? Math.min(requested, 10) : 5;

    try {
      await sendSuggestionsMessage(bot, msg.chat.id, topN);
    } catch (error) {
      await bot.sendMessage(msg.chat.id, `Failed to build suggestions: ${error.message}`);
    }
  });

  bot.on('message', async (msg) => {
    if (!validateChat(allowedChatId, msg.chat.id)) {
      return;
    }

    const text = String(msg.text || '').trim();
    if (!text || text.startsWith('/')) {
      return;
    }

    try {
      if (text.startsWith('Price ')) {
        const symbol = text.replace('Price ', '').trim();
        if (symbol) {
          await sendPriceMessage(bot, msg.chat.id, symbol);
        }
      } else if (text.startsWith('Signal ')) {
        const symbol = text.replace('Signal ', '').trim();
        if (symbol) {
          await sendSignalMessage(bot, msg.chat.id, symbol);
        }
      } else if (text === 'Suggest Best Signals') {
        await sendSuggestionsMessage(bot, msg.chat.id, 5);
      }
    } catch (error) {
      await bot.sendMessage(msg.chat.id, `Action failed: ${error.message}`);
    }
  });

  bot.on('callback_query', async (query) => {
    const chatId = query.message?.chat?.id;
    const action = query.data || '';

    if (!chatId || !validateChat(allowedChatId, chatId)) {
      return;
    }

    try {
      if (action.startsWith('signal:')) {
        const symbol = action.replace('signal:', '').trim();
        if (symbol) {
          await sendSignalMessage(bot, chatId, symbol);
        }
      } else if (action.startsWith('suggest:')) {
        const topN = Number(action.replace('suggest:', '')) || 5;
        await sendSuggestionsMessage(bot, chatId, Math.min(Math.max(topN, 1), 10));
      }

      await bot.answerCallbackQuery(query.id);
    } catch (error) {
      await bot.answerCallbackQuery(query.id, {
        text: `Error: ${error.message}`,
        show_alert: false,
      });
    }
  });

  bot.on('polling_error', (error) => {
    console.error('Telegram polling error:', error.message);
  });

  return {
    bot,
    isEnabled: true,
    allowedChatId,
  };
}

async function sendTelegramMessage(bot, message, { chatId } = {}) {
  if (!bot) {
    return {
      ok: false,
      error: 'Telegram bot is disabled. Set TELEGRAM_BOT_TOKEN to enable it.',
    };
  }

  if (!chatId) {
    return {
      ok: false,
      error: 'No chatId provided. Set TELEGRAM_DEFAULT_CHAT_ID or pass chatId.',
    };
  }

  const sent = await bot.sendMessage(chatId, message);
  return {
    ok: true,
    messageId: sent.message_id,
  };
}

module.exports = {
  createTelegramBot,
  sendTelegramMessage,
  buildArbitrageSignal,
  suggestBestSignals,
};
