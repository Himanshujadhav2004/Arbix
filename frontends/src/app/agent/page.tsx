'use client';

import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import type { AxiosResponse } from 'axios';
import { Bot, RefreshCw, TrendingUp, Zap } from 'lucide-react';
import LandingNav from '@/components/LandingNav';
import { getBackendBaseUrl } from '@/lib/backend';
import type { AxiosError } from 'axios';

type SignalRow = {
  symbol: string;
  binancePrice: number;
  coinbasePrice: number;
  spreadPct: number;
  buyAt: string;
  sellAt: string;
  thresholdPercent: number;
  shouldAlert: boolean;
};

type AiInsight = {
  text: string;
  model?: string;
};

const DEFAULT_SYMBOLS = [
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

const THRESHOLDS = [0.25, 0.5, 0.75, 1];

function formatUsd(value: number) {
  if (!Number.isFinite(value)) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(value);
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return '0.00%';
  return `${value.toFixed(4)}%`;
}

function cleanAiLines(text: string) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*•]\s*/, ''))
    .slice(0, 5);
}

export default function ArbixAgentPage() {
  const [threshold, setThreshold] = useState(0.25);
  const [topN, setTopN] = useState(5);
  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [aiInsight, setAiInsight] = useState<AiInsight | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const backendBaseUrl = useMemo(() => getBackendBaseUrl(), []);

  const rankedSignals = useMemo(() => {
    return [...signals].sort((a, b) => b.spreadPct - a.spreadPct).slice(0, topN);
  }, [signals, topN]);

  const profitableCount = useMemo(
    () => signals.filter((signal) => signal.shouldAlert).length,
    [signals],
  );

  type SignalApiResponse = {
    symbol: string;
    binancePrice: number;
    coinbasePrice: number;
    spreadPct: number;
    buyAt: string;
    sellAt: string;
    thresholdPercent: number;
    shouldAlert: boolean;
  };

  type BackendAiResponse = {
    text?: string;
    model?: string;
  };

  const fetchAgentData = async () => {
    setRefreshing(true);
    setError(null);

    try {
      const signalRequests: Array<Promise<AxiosResponse<SignalApiResponse>>> = DEFAULT_SYMBOLS.map((symbol) =>
        axios.get<SignalApiResponse>(`${backendBaseUrl}/api/signal/${symbol}?threshold=${threshold}`),
      );

      const signalResponses = await Promise.allSettled(signalRequests);

      const rows = signalResponses
        .flatMap((result) =>
          result.status === 'fulfilled' ? [result.value.data as SignalRow] : [],
        )
        .filter((row) => Number.isFinite(row?.spreadPct));

      rows.sort((a, b) => b.spreadPct - a.spreadPct);
      setSignals(rows);

      if (rows.length > 0) {
        const aiResponse = await axios.post(`${backendBaseUrl}/api/ai/chat`, {
          systemPrompt:
            'You are ArbiX Agent. Summarize the best arbitrage signals for a trader in short, actionable language. Return plain text only.',
          prompt: [
            `Threshold: ${threshold.toFixed(2)}%`,
            `Top opportunities: ${JSON.stringify(rows.slice(0, topN))}`,
            'Give a concise verdict, the best route, and one caution about execution risk.',
          ].join('\n'),
          model: 'openrouter/free',
        });

        const aiData = aiResponse.data as BackendAiResponse;
        setAiInsight({
          ...aiData,
          text: cleanAiLines(aiData?.text || '').join('\n'),
        });
      } else {
        setAiInsight(null);
      }
    } catch (err: unknown) {
      const error = err as AxiosError<{ error?: string }>;
      console.error('ArbiX Agent error:', error);
      setError(error.response?.data?.error || error.message || 'Failed to load agent data');
      setAiInsight(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAgentData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threshold, topN]);

  return (
    <div className="min-h-screen bg-[#07070b] text-white">
      <LandingNav />

      <main className="mx-auto max-w-7xl px-4 pb-16 pt-24 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-white/5 p-6 text-white shadow-2xl shadow-purple-950/20 backdrop-blur md:p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(168,85,247,0.16),_transparent_42%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.12),_transparent_35%)]" />

          <div className="relative z-10 flex flex-col gap-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-purple-400/20 bg-purple-500/10 px-4 py-2 text-sm text-purple-200">
                  <Bot className="h-4 w-4" />
                  ArbiX Agent
                </div>
                <div className="space-y-3">
                  <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                    AI-ranked signals, real-time insights
                  </h1>
                  {/* <p className="max-w-2xl text-sm leading-6 text-white/70 sm:text-base">
                    This page scans your backend signal engine, ranks the strongest spreads,
                    and asks OpenRouter for a short execution summary so you can move faster.
                  </p> */}
                </div>
              </div>

              <button
                onClick={fetchAgentData}
                disabled={refreshing}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-purple-400/30 bg-purple-500 px-5 py-3 font-medium text-white transition hover:bg-purple-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? 'Refreshing' : 'Refresh Signals'}
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-3xl border border-white/10 bg-black/40 p-5">
                <div className="text-sm text-white/55">Signals scanned</div>
                <div className="mt-2 text-3xl font-semibold">{signals.length}</div>
                <div className="mt-1 text-sm text-white/50">Across Binance and Coinbase</div>
              </div>
              <div className="rounded-3xl border border-white/10 bg-black/40 p-5">
                <div className="text-sm text-white/55">Profitable now</div>
                <div className="mt-2 text-3xl font-semibold text-emerald-400">{profitableCount}</div>
                <div className="mt-1 text-sm text-white/50">Above the current threshold</div>
              </div>
              <div className="rounded-3xl border border-white/10 bg-black/40 p-5">
                <div className="text-sm text-white/55">Threshold</div>
                <div className="mt-2 text-3xl font-semibold text-purple-300">{threshold.toFixed(2)}%</div>
                <div className="mt-1 text-sm text-white/50">Tune the sensitivity</div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-3xl border border-white/10 bg-black/35 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm text-white/55">Control panel</div>
                    <h2 className="mt-1 text-xl font-semibold">Rank, filter, and review the best routes</h2>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {THRESHOLDS.map((value) => (
                      <button
                        key={value}
                        onClick={() => setThreshold(value)}
                        className={`rounded-full px-4 py-2 text-sm transition ${
                          threshold === value
                            ? 'bg-purple-500 text-white'
                            : 'bg-white/10 text-white/70 hover:bg-white/15'
                        }`}
                      >
                        {value.toFixed(2)}%
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-5 flex items-center gap-3 text-sm text-white/70">
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-white">
                    <TrendingUp className="h-4 w-4 text-emerald-400" />
                    Top {topN}
                  </span>
                  <label className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-white">
                    Show
                    <select
                      value={topN}
                      onChange={(e) => setTopN(Number(e.target.value))}
                      className="bg-transparent text-white outline-none"
                    >
                      {[3, 5, 7, 10].map((value) => (
                        <option key={value} value={value} className="bg-black text-white">
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {loading ? (
                  <div className="mt-6 space-y-3 text-white/60">Loading signal engine...</div>
                ) : error ? (
                  <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
                    {error}
                  </div>
                ) : (
                  <div className="mt-6 grid gap-4">
                    {rankedSignals.map((signal, index) => (
                      <article
                        key={signal.symbol}
                        className="rounded-3xl border border-white/10 bg-white/5 p-5 transition hover:border-purple-400/30 hover:bg-white/8"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <div className="text-xs uppercase tracking-[0.3em] text-white/45">
                              #{index + 1} signal
                            </div>
                            <h3 className="mt-2 text-2xl font-semibold">{signal.symbol}</h3>
                            <div className="mt-2 text-sm text-white/60">
                              Buy on <span className="text-emerald-300">{signal.buyAt}</span> and sell on{' '}
                              <span className="text-sky-300">{signal.sellAt}</span>
                            </div>
                          </div>
                          <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-right">
                            <div className="text-xs text-white/45">Spread</div>
                            <div className="text-2xl font-semibold text-purple-300">
                              {formatPercent(signal.spreadPct)}
                            </div>
                            <div className="text-xs text-white/50">Threshold {signal.thresholdPercent.toFixed(2)}%</div>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <div className="rounded-2xl bg-black/30 p-4">
                            <div className="text-xs text-white/45">Binance</div>
                            <div className="mt-1 text-lg font-semibold text-white">
                              {formatUsd(signal.binancePrice)}
                            </div>
                          </div>
                          <div className="rounded-2xl bg-black/30 p-4">
                            <div className="text-xs text-white/45">Coinbase</div>
                            <div className="mt-1 text-lg font-semibold text-white">
                              {formatUsd(signal.coinbasePrice)}
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium">
                          <Zap className={`h-4 w-4 ${signal.shouldAlert ? 'text-emerald-400' : 'text-amber-300'}`} />
                          <span className={signal.shouldAlert ? 'text-emerald-300' : 'text-amber-200'}>
                            {signal.shouldAlert ? 'Profitable route' : 'Watchlist only'}
                          </span>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>

              <aside className="space-y-4">
                <div className="rounded-3xl border border-white/10 bg-black/35 p-5">
                  <div className="text-sm text-white/55">AI brief</div>
                  <h2 className="mt-1 text-xl font-semibold">What the agent thinks</h2>
                  <div className="mt-4 min-h-[180px] rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-6 text-white/80">
                    {aiInsight?.text ? (
                      <div className="space-y-2 whitespace-pre-line">{aiInsight.text}</div>
                    ) : (
                      <div>
                        {loading
                          ? 'Waiting for the signal scan...'
                          : 'No AI summary yet. Refresh the scan or lower the threshold.'}
                      </div>
                    )}
                  </div>
                </div>

                {/* <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-purple-500/15 to-sky-500/10 p-5">
                  <div className="text-sm text-white/60">How it works</div>
                  <ul className="mt-4 space-y-3 text-sm leading-6 text-white/80">
                    <li>1. The page calls your backend signal API for each tracked symbol.</li>
                    <li>2. Signals are ranked by spread so the strongest routes float to the top.</li>
                    <li>3. The backend AI endpoint turns the best set into a concise trading brief.</li>
                  </ul>
                </div> */}
              </aside>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
