'use client';
import { useState } from 'react';
import { useTheme } from 'next-themes';
import { ArrowUpDown } from 'lucide-react';
import { useWallet } from '@/contexts/WalletContext';
import { Connection, VersionedTransaction } from '@solana/web3.js';
import LandingNav from '@/components/LandingNav';
import crypto from 'crypto';

const SOLANA_CHAIN_ID = 99999; // Correct chain ID for Solana mainnet
const TOKEN_ADDRESSES = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
};

const generateSignature = (secret: string, timestamp: string, method: string, path: string, body: string) => {
  const message = `${timestamp}${method}${path}${body}`;
  return crypto.createHmac('sha256', secret).update(message).digest('base64');
};

export default function Swap() {
  const [tokenA, setTokenA] = useState<'SOL' | 'USDC'>('SOL');
  const [tokenB, setTokenB] = useState<'SOL' | 'USDC'>('USDC');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { publicKey, connected, signTransaction } = useWallet();
  const { theme } = useTheme();

  const swapTokens = () => {
    setTokenA(tokenB);
    setTokenB(tokenA);
    setError(null);
  };

  const handleSwap = async () => {
    if (!publicKey || !signTransaction) {
      setError('Wallet not connected');
      return;
    }

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount)) {
      setError('Please enter a valid amount');
      return;
    }

    if (tokenA === tokenB) {
      setError('Cannot swap same tokens');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const timestamp = Date.now().toString();
      const method = 'POST';

      // Generate signature for quote
      const quotePath = '/api/v5/dex/aggregator/quote';
      const quoteBody = JSON.stringify({
        chainId: SOLANA_CHAIN_ID,
        fromTokenAddress: TOKEN_ADDRESSES[tokenA],
        toTokenAddress: TOKEN_ADDRESSES[tokenB],
        amount: numericAmount.toString(),
        slippage: '1',
        userWalletAddress: publicKey,
      });

      const quoteSignature = generateSignature(
        process.env.NEXT_PUBLIC_OKX_API_SECRET!,
        timestamp,
        method,
        quotePath,
        quoteBody
      );

      // Get quote
      const quoteResponse = await fetch(`https://www.okx.com${quotePath}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'OK-ACCESS-KEY': process.env.NEXT_PUBLIC_OKX_API_KEY!,
          'OK-ACCESS-SIGN': quoteSignature,
          'OK-ACCESS-TIMESTAMP': timestamp,
        },
        body: quoteBody,
      });

      if (!quoteResponse.ok) {
        const errorText = await quoteResponse.text();
        throw new Error(`Quote failed: ${errorText}`);
      }

      const quoteData = await quoteResponse.json();

      // Generate signature for swap
      const swapPath = '/api/v5/dex/aggregator/swap';
      const swapBody = JSON.stringify({
        chainId: SOLANA_CHAIN_ID,
        quote: quoteData.data[0],
        userWalletAddress: publicKey,
      });

      const swapSignature = generateSignature(
        process.env.NEXT_PUBLIC_OKX_API_SECRET!,
        timestamp,
        method,
        swapPath,
        swapBody
      );

      // Execute swap
      const swapResponse = await fetch(`https://www.okx.com${swapPath}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'OK-ACCESS-KEY': process.env.NEXT_PUBLIC_OKX_API_KEY!,
          'OK-ACCESS-SIGN': swapSignature,
          'OK-ACCESS-TIMESTAMP': timestamp,
        },
        body: swapBody,
      });

      if (!swapResponse.ok) {
        const errorText = await swapResponse.text();
        throw new Error(`Swap failed: ${errorText}`);
      }

      const swapData = await swapResponse.json();

      // Sign and send transaction
      const txData = swapData.data[0].tx;
      const tx = VersionedTransaction.deserialize(Buffer.from(txData, 'base64'));
      const signedTx = await signTransaction(tx);
      
      const connection = new Connection(
        process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL!
      );

      const signature = await connection.sendRawTransaction(signedTx.serialize());
      const confirmation = await connection.confirmTransaction(signature);

      if (confirmation.value.err) {
        throw new Error('Transaction failed on chain');
      }

      alert(`Swap successful! TX: ${signature}`);
      setAmount('');
    } catch (error: any) {
      console.error('Full error:', error);
      setError(error.message || 'Transaction failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <LandingNav />
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-black p-4">
        <div
          className="p-5 rounded-xl bg-gradient-to-tr from-white via-gray-100 to-gray-50
                     dark:from-gray-800 dark:via-gray-900 dark:to-gray-950
                     shadow-xl ring-1 ring-gray-200 dark:ring-gray-700
                     transition-colors duration-700 space-y-6 max-w-md w-full"
        >
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white tracking-tight">
              Swap Tokens
            </h1>
            <span className="text-sm uppercase font-semibold tracking-wide text-purple-600 dark:text-purple-400">
              OKX DEX
            </span>
          </div>

          {error && (
            <div className="p-3 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 rounded-lg">
              {error}
            </div>
          )}

          <div className="space-y-4">
            {/* From Token Input */}
            <div className="bg-transparent rounded-lg p-4 ring-1 ring-gray-300 dark:ring-gray-700">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-gray-600 dark:text-gray-300">From</span>
                <span className="text-sm text-gray-600 dark:text-gray-300">
                  Balance: {/* Add balance fetching logic here */}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.0"
                  className="w-full bg-transparent text-2xl font-semibold text-gray-900 dark:text-white outline-none"
                  min="0"
                />
                <select
                  value={tokenA}
                  onChange={(e) => setTokenA(e.target.value as 'SOL' | 'USDC')}
                  className="bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-300 px-3 py-2 rounded-lg ml-3"
                >
                  <option value="SOL">SOL</option>
                  <option value="USDC">USDC</option>
                </select>
              </div>
            </div>

            {/* Swap button */}
            <button
              onClick={swapTokens}
              className="mx-auto p-2 bg-purple-600 text-white rounded-full hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading}
              aria-label="Swap tokens"
            >
              <ArrowUpDown size={20} />
            </button>

            {/* To Token Input */}
            <div className="bg-transparent rounded-lg p-4 ring-1 ring-gray-300 dark:ring-gray-700">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-gray-600 dark:text-gray-300">To</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-semibold text-gray-900 dark:text-white">
                  {/* Add estimated amount display here */}
                </span>
                <select
                  value={tokenB}
                  onChange={(e) => setTokenB(e.target.value as 'SOL' | 'USDC')}
                  className="bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-300 px-3 py-2 rounded-lg ml-3"
                >
                  <option value="USDC">USDC</option>
                  <option value="SOL">SOL</option>
                </select>
              </div>
            </div>

            {/* Swap action button */}
            <button
              onClick={handleSwap}
              disabled={!connected || loading}
              className="w-full py-3 bg-purple-600 text-white rounded-md font-semibold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <svg
                    className="animate-spin h-5 w-5 mr-3 text-white"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8z"
                    />
                  </svg>
                  Processing...
                </div>
              ) : connected ? (
                'Swap Now'
              ) : (
                'Connect Wallet'
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
