const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");
const BACKEND_API_BASE_URL =
  process.env.INTERNAL_API_BASE_URL ||
  process.env.BACKEND_API_BASE_URL ||
  `http://localhost:${Number(process.env.PORT) || 3000}`;

function formatUsd(value, digits = 6) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "N/A";
  }

  return `$${number.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  })}`;
}

function normalizeQuickActionText(rawText) {
  return String(rawText || "")
    .replace(/^[^A-Za-z0-9/]+/, "")
    .trim();
}

const DEFAULT_SUGGEST_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "AAVEUSDT",
  "LINKUSDT",
  "UNIUSDT",
  "XRPUSDT",
  "ADAUSDT",
  "LTCUSDT",
  "DOGEUSDT",
];

function normalizeBinanceSymbol(rawSymbol) {
  const symbol = String(rawSymbol || "")
    .trim()
    .toUpperCase();
  if (symbol.includes("-")) {
    return symbol.replace("-", "");
  }

  if (symbol.endsWith("USD")) {
    return `${symbol}T`;
  }

  return symbol;
}

function normalizeCoinbaseSymbol(rawSymbol) {
  const symbol = String(rawSymbol || "")
    .trim()
    .toUpperCase();
  if (symbol.includes("-")) {
    return symbol;
  }

  if (symbol.endsWith("USDT")) {
    return `${symbol.slice(0, -4)}-USD`;
  }

  if (symbol.endsWith("USD")) {
    return `${symbol.slice(0, -3)}-USD`;
  }

  return `${symbol}-USD`;
}

async function fetchBinancePrice(symbol) {
  const normalizedSymbol = normalizeBinanceSymbol(symbol);
  const response = await axios.get(
    `${BACKEND_API_BASE_URL}/api/binance-price/${normalizedSymbol}`,
  );

  return Number(response.data?.price);
}

async function fetchCoinbasePrice(symbol) {
  const normalizedSymbol = normalizeCoinbaseSymbol(symbol);
  const response = await axios.get(
    `${BACKEND_API_BASE_URL}/api/coinbase-price/${normalizedSymbol}`,
  );

  return Number(response.data?.price);
}

async function fetchSignalFromBackend(symbol, thresholdPercent = 0.25) {
  const normalizedSymbol = String(symbol || "")
    .trim()
    .toUpperCase();
  const response = await axios.get(
    `${BACKEND_API_BASE_URL}/api/signal/${normalizedSymbol}?threshold=${thresholdPercent}`,
  );

  return response.data;
}

function validateChat(allowedChatId, chatId) {
  if (!allowedChatId) {
    return true;
  }

  return String(allowedChatId) === String(chatId);
}

function startMessage() {
  return [
    "🤖 Welcome to ArbiX",
    "",
    "Your crypto arbitrage assistant for fast market checks and signal discovery.",
    "",
    "What this bot does",
    "• Compares Binance and Coinbase prices in real time",
    "• Calculates spread % and suggests buy/sell route",
    "• Scans top symbols and highlights best opportunities",
    "• Adds AI insight to help with quick decision-making",
    "",
    "Quick start",
    "1) Send /price BTCUSDT for a live price snapshot",
    "2) Send /signal BTCUSDT for a full arbitrage signal",
    "3) Send /suggest to see best opportunities now",
    "",
    "Commands",
    "/suggest - 🧠 Top auto-picked opportunities (AI-enhanced)",
    "/help - 📘 Show command guide",
    "/price <symbol> - 💹 Latest Binance and Coinbase prices",
    "/signal <symbol> - 📈 Arbitrage summary (example: /signal YFIUSDT)",
    "/menu - 🧭 Open quick action menu",
    "",
    "Tip: You can also tap the buttons below for one-tap actions.",
  ].join("\n");
}

function mainMenuKeyboard() {
  return {
    keyboard: [
      [{ text: "💹 Price BTCUSDT" }, { text: "📈 Signal BTCUSDT" }],
      [{ text: "💹 Price ETHUSDT" }, { text: "📈 Signal ETHUSDT" }],
      [{ text: "🧠 Suggest Best Signals" }],
      [{ text: "❓ Help" }],
    ],
    resize_keyboard: true,
    input_field_placeholder: "Choose an action or type a command...",
  };
}

function actionInlineKeyboard(symbol) {
  const normalized = String(symbol || "").toUpperCase();

  return {
    inline_keyboard: [
      [
        {
          text: `🔄 Refresh ${normalized}`,
          callback_data: `signal:${normalized}`,
        },
        { text: "🧠 Suggest Best", callback_data: "suggest:5" },
      ],
    ],
  };
}

async function buildArbitrageSignal({ symbol, thresholdPercent = 0.25 }) {
  const backendSignal = await fetchSignalFromBackend(symbol, thresholdPercent);
  const binancePrice = Number(backendSignal?.binancePrice);
  const coinbasePrice = Number(backendSignal?.coinbasePrice);
  const spreadPct = Number(backendSignal?.spreadPct);
  const buyAt = backendSignal?.buyAt;
  const sellAt = backendSignal?.sellAt;
  const shouldAlert = Boolean(backendSignal?.shouldAlert);

  if (
    !Number.isFinite(binancePrice) ||
    !Number.isFinite(coinbasePrice) ||
    !Number.isFinite(spreadPct)
  ) {
    throw new Error("Invalid signal response from backend");
  }

  const message = [
    `📈 ArbiX Signal: ${String(symbol).toUpperCase()}`,
    `🏦 Binance: ${formatUsd(binancePrice)}`,
    `🏛️ Coinbase: ${formatUsd(coinbasePrice)}`,
    `Spread: ${spreadPct.toFixed(4)}%`,
    `🔁 Route: Buy on ${buyAt} -> Sell on ${sellAt}`,
    `🎯 Threshold: ${thresholdPercent.toFixed(2)}%`,
    shouldAlert
      ? `🟢 Status: PROFITABLE (>= ${thresholdPercent.toFixed(2)}%)`
      : `🟠 Status: below threshold (${thresholdPercent.toFixed(2)}%)`,
  ].join("\n");

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
    symbols.map((symbol) => buildArbitrageSignal({ symbol, thresholdPercent })),
  );

  const successful = settled
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value)
    .sort((a, b) => b.spreadPct - a.spreadPct);

  const profitable = successful.filter((item) => item.shouldAlert);
  const watchOnly = successful.filter((item) => !item.shouldAlert);
  const hasProfitable = profitable.length > 0;
  const selected = hasProfitable
    ? profitable.slice(0, Math.max(1, topN))
    : watchOnly.slice(0, Math.max(1, topN));

  const header = [
    "🧠 ArbiX Suggestions",
    "------------------------------",
    `🎯 Threshold: ${thresholdPercent.toFixed(2)}%`,
    `📊 Scanned: ${successful.length} | Profitable: ${profitable.length} | Watch: ${watchOnly.length}`,
    hasProfitable
      ? `🟢 Status: PROFITABLE opportunities found (showing top ${selected.length})`
      : "🟠 Status: No profitable opportunities right now. Showing watchlist.",
    "",
  ];

  const lines = selected.map((item, index) => {
    const status = item.shouldAlert ? "PROFITABLE" : "WATCH";
    const action = item.shouldAlert
      ? "Action: Consider execution with risk checks"
      : "Action: Monitor and wait";
    return [
      `${item.shouldAlert ? "🟢" : "🟡"} #${index + 1} ${item.symbol} | ${status}`,
      `Spread: ${item.spreadPct.toFixed(4)}%`,
      `Route: ${item.buyAt} -> ${item.sellAt}`,
      action,
    ].join("\n");
  });

  if (lines.length === 0) {
    return {
      best: [],
      message: "No suggestions available right now. Please try again shortly.",
    };
  }

  return {
    best: selected,
    profitableCount: profitable.length,
    watchCount: watchOnly.length,
    hasProfitable,
    message: [...header, lines.join("\n\n")].join("\n"),
  };
}

function formatAiInsightText(aiText) {
  const rawLines = String(aiText || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!rawLines.length) {
    return "";
  }

  const cleaned = rawLines
    .map((line) => line.replace(/\*\*/g, ""))
    .map((line) => line.replace(/^[-*•]\s*/, ""))
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4)
    .map((line) => `• ${line}`);

  return cleaned.join("\n");
}

async function sendPriceMessage(bot, chatId, symbol) {
  const [binancePrice, coinbasePrice] = await Promise.all([
    fetchBinancePrice(symbol),
    fetchCoinbasePrice(symbol),
  ]);

  const normalized = String(symbol).toUpperCase();
  const message = [
    `💹 Price Snapshot: ${normalized}`,
    `🏦 Binance: ${formatUsd(binancePrice)}`,
    `🏛️ Coinbase: ${formatUsd(coinbasePrice)}`,
    `🕒 Updated: ${new Date().toLocaleTimeString()}`,
  ].join("\n");

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

async function sendSuggestionsMessage(
  bot,
  chatId,
  topN = 5,
  thresholdPercent = 0.25,
  askAi,
) {
  const suggestion = await suggestBestSignals({ topN, thresholdPercent });
  let message = suggestion.message;

  if (typeof askAi === "function" && suggestion.best.length > 0) {
    try {
      const aiResult = await askAi({
        prompt: [
          "You are an assistant for an arbitrage bot.",
          suggestion.hasProfitable
            ? "Given these profitable opportunities, provide a concise execution-oriented summary in 4 bullet points max."
            : "Given this watchlist, provide a concise risk-aware summary in 4 bullet points max and explain why waiting is better now.",
          "Mention spread quality, market volatility caution, and one practical next step.",
          "Return plain text only. Do not use markdown bold or headings.",
          `Data: ${JSON.stringify(suggestion.best.slice(0, 5))}`,
        ].join("\n"),
        chatId,
        source: "telegram_suggest",
      });

      const aiText = String(aiResult?.text || "").trim();
      if (aiText) {
        const formattedInsight = formatAiInsightText(aiText);
        message = `${message}\n\n✨ AI Insight\n------------------------------\n${formattedInsight || aiText}`;
      }
    } catch (error) {
      // Keep core /suggest behavior even if AI request fails.
      message = `${message}\n\n⚠️ AI Insight unavailable (${error.message})`;
    }
  }

  await bot.sendMessage(chatId, message, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Refresh Suggestions", callback_data: `suggest:${topN}` }],
        suggestion.best.slice(0, 3).map((item) => ({
          text: `📈 Signal ${item.symbol}`,
          callback_data: `signal:${item.symbol}`,
        })),
      ],
    },
  });
}

function createTelegramBot({ token, allowedChatId, askAi }) {
  if (!token) {
    return {
      bot: null,
      isEnabled: false,
      allowedChatId,
    };
  }

  const bot = new TelegramBot(token, { polling: true });

  bot.setMyCommands([
    { command: "start", description: "Open bot menu" },
    { command: "help", description: "Show bot commands" },
    { command: "price", description: "Get price. Example: /price BTCUSDT" },
    { command: "signal", description: "Get signal. Example: /signal BTCUSDT" },
    { command: "suggest", description: "Auto-suggest best opportunities" },
    { command: "menu", description: "Open quick action menu" },
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

  bot.onText(/\/menu/, async (msg) => {
    if (!validateChat(allowedChatId, msg.chat.id)) {
      return;
    }

    await bot.sendMessage(msg.chat.id, "🧭 Quick actions ready:", {
      reply_markup: mainMenuKeyboard(),
    });
  });

  bot.onText(/\/price\s+(.+)/, async (msg, match) => {
    if (!validateChat(allowedChatId, msg.chat.id)) {
      return;
    }

    const symbol = match?.[1];
    if (!symbol) {
      await bot.sendMessage(msg.chat.id, "Use: /price <symbol>");
      return;
    }

    try {
      await sendPriceMessage(bot, msg.chat.id, symbol);
    } catch (error) {
      await bot.sendMessage(
        msg.chat.id,
        `Failed to fetch prices: ${error.message}`,
      );
    }
  });

  bot.onText(/\/signal\s+(.+)/, async (msg, match) => {
    if (!validateChat(allowedChatId, msg.chat.id)) {
      return;
    }

    const symbol = match?.[1];
    if (!symbol) {
      await bot.sendMessage(
        msg.chat.id,
        "Use: /signal <symbol> (example: /signal YFIUSDT)",
      );
      return;
    }

    try {
      await sendSignalMessage(bot, msg.chat.id, symbol);
    } catch (error) {
      await bot.sendMessage(
        msg.chat.id,
        `Failed to build signal: ${error.message}`,
      );
    }
  });

  bot.onText(/\/suggest(?:\s+(\d+))?/, async (msg, match) => {
    if (!validateChat(allowedChatId, msg.chat.id)) {
      return;
    }

    const requested = Number(match?.[1]);
    const topN =
      Number.isFinite(requested) && requested > 0 ? Math.min(requested, 10) : 5;

    try {
      await sendSuggestionsMessage(bot, msg.chat.id, topN, 0.25, askAi);
    } catch (error) {
      await bot.sendMessage(
        msg.chat.id,
        `Failed to build suggestions: ${error.message}`,
      );
    }
  });

  bot.on("message", async (msg) => {
    if (!validateChat(allowedChatId, msg.chat.id)) {
      return;
    }

    const text = String(msg.text || "").trim();
    if (!text || text.startsWith("/")) {
      return;
    }

    const normalizedText = normalizeQuickActionText(text);

    try {
      if (/^Price\s+/i.test(normalizedText)) {
        const symbol = normalizedText.replace(/^Price\s+/i, "").trim();
        if (symbol) {
          await sendPriceMessage(bot, msg.chat.id, symbol);
        }
      } else if (/^Signal\s+/i.test(normalizedText)) {
        const symbol = normalizedText.replace(/^Signal\s+/i, "").trim();
        if (symbol) {
          await sendSignalMessage(bot, msg.chat.id, symbol);
        }
      } else if (normalizedText === "Suggest Best Signals") {
        await sendSuggestionsMessage(bot, msg.chat.id, 5, 0.25, askAi);
      } else if (normalizedText === "Help") {
        await bot.sendMessage(msg.chat.id, startMessage(), {
          reply_markup: mainMenuKeyboard(),
        });
      }
    } catch (error) {
      await bot.sendMessage(msg.chat.id, `⚠️ Action failed: ${error.message}`);
    }
  });

  bot.on("callback_query", async (query) => {
    const chatId = query.message?.chat?.id;
    const action = query.data || "";

    if (!chatId || !validateChat(allowedChatId, chatId)) {
      return;
    }

    try {
      if (action.startsWith("signal:")) {
        const symbol = action.replace("signal:", "").trim();
        if (symbol) {
          await sendSignalMessage(bot, chatId, symbol);
        }
      } else if (action.startsWith("suggest:")) {
        const topN = Number(action.replace("suggest:", "")) || 5;
        await sendSuggestionsMessage(
          bot,
          chatId,
          Math.min(Math.max(topN, 1), 10),
          0.25,
          askAi,
        );
      }

      await bot.answerCallbackQuery(query.id);
    } catch (error) {
      await bot.answerCallbackQuery(query.id, {
        text: `Error: ${error.message}`,
        show_alert: false,
      });
    }
  });

  bot.on("polling_error", (error) => {
    console.error("Telegram polling error:", error.message);
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
      error: "Telegram bot is disabled. Set TELEGRAM_BOT_TOKEN to enable it.",
    };
  }

  if (!chatId) {
    return {
      ok: false,
      error: "No chatId provided. Set TELEGRAM_DEFAULT_CHAT_ID or pass chatId.",
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
