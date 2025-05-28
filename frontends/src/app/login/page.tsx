'use client';
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowUpDown } from 'lucide-react';
import LandingNav from '@/components/LandingNav';
import { useRouter } from 'next/navigation';

const tokenMap = {
  'so11111111111111111111111111111111111111112':'SOL',
  '0x382bb369d343125bfb2117af9c149795c6c65c50': 'HT',
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 'WETH',
  '0x6b175474e89094c44da98b954eedeac495271d0f': 'DAI',
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'USDC',
  '0xdac17f958d2ee523a2206206994597c13d831ec7': 'USDT',
  '0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0': 'MATIC',
  '0x514910771af9ca656af840dff83e8264ecf986ca': 'LINK',
  '0x0d8775f648430679a709e98d2b0cb6250d2887ef': 'BAT',
  '0x111111111117dc0aa78b770fa6a738034120c302': '1INCH',
  '0xc00e94cb662c3520282e6f5717214004a7f26888': 'COMP',
  '0x6f259637dcd74c767781e37bc6133cd6a68aa161': 'HT (Heco)',
  '0x408e41876cccdc0f92210600ef50372656052a38': 'REN',
  '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984': 'UNI',
  '0x0bc529c00c6401aef6d220be8c6ea1667f6ad93e': 'YFI',
  '0x853d955acef822db058eb8505911ed77f175b99e': 'FRAX',
  '0x4fabb145d64652a948d72533023f6e7a623c7c53': 'BUSD',
  '0xe9e7cea3dedca5984780bafc599bd69add087d56': 'BUSD (BSC)',
  '0x2ba592f78db6436527729929aaf6c908497cb200': 'CREAM',
  '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9': 'AAVE',
};

export default function MarketTokenPage() {
  const router = useRouter();
  const [tokens, setTokens] = useState([]);
  const [filteredTokens, setFilteredTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState(null);
  const [sortAsc, setSortAsc] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get('http://localhost:3000/market-token');
        setTokens(res.data);
        setFilteredTokens(res.data);
      } catch (err) {
        console.error('Failed to fetch token data', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    const lowerSearch = search.toLowerCase();
    setFilteredTokens(
      tokens.filter(item => {
        const address = item.token?.tokenContractAddress?.toLowerCase() || '';
        const tokenName = tokenMap[address]?.toLowerCase() || '';
        return tokenName.includes(lowerSearch) || address.includes(lowerSearch);
      })
    );
  }, [search, tokens]);

  const handleSort = (field) => {
    const asc = sortField === field ? !sortAsc : true;
    setSortField(field);
    setSortAsc(asc);
    setFilteredTokens(prev => [...prev].sort((a, b) => {
      const aValue = parseNumber(a.result?.[field]) || 0;
      const bValue = parseNumber(b.result?.[field]) || 0;
      return asc ? aValue - bValue : bValue - aValue;
    }));
  };

  const parseNumber = (value) => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const cleaned = value.replace(/[^0-9.]/g, '');
      return parseFloat(cleaned) || 0;
    }
    return 0;
  };

  const formatCurrency = (value) => {
    const number = parseNumber(value);
    if (number === 0) return '$0';
    return new Intl.NumberFormat('en-US', {
      notation: 'compact',
      compactDisplay: 'short',
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }).format(number);
  };

  const handleTokenClick = (chainIndex, address) => {
    router.push(`/tokendetails/${chainIndex}/${encodeURIComponent(address)}`);
  };

  return (
    <div className="p-4 max-w-5xl mx-auto min-h-screen">
      <LandingNav />
      {/* <h1 className="text-3xl  mb-6 mt-24 text-center dark:text-gray-100">
      Market Analytics
      </h1> */}

      <Input
        placeholder="Search by token name"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-6 w-fit max-w-sm mt-24  dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder:text-gray-400"
      />

      <div className="overflow-x-auto max-w-5xl mx-auto overflow-y-auto rounded-lg border border-gray-300 dark:border-gray-700 shadow-sm max-h-[600px] scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent dark:scrollbar-thumb-gray-600 dark:scrollbar-track-gray-900">
        <Table className="min-w-[400px] border-collapse">
          <TableHeader className="bg-gray-50 dark:bg-gray-800">
            <TableRow>
              <TableHead className="border-r border-gray-300 dark:border-gray-700 dark:text-gray-300 px-4 py-3">
                Token Name
              </TableHead>
              {['price', 'marketCap', 'volume24h'].map((field) => (
                <TableHead
                  key={field}
                  className="border-r border-gray-300 dark:border-gray-700 cursor-pointer select-none dark:text-gray-300 px-4 py-3"
                  onClick={() => handleSort(field)}
                >
                  <div className="flex items-center">
                    {field === 'price' ? 'Price' : field === 'marketCap' ? 'Market Cap' : '24h Volume'}
                    <ArrowUpDown className="ml-2 w-4 h-4 dark:text-gray-400" />
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>

          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="hover:bg-gray-100 dark:hover:bg-gray-800">
                  <TableCell className="border-r border-gray-300 dark:border-gray-700 px-4 py-3">
                    <Skeleton className="h-4 w-32 dark:bg-gray-700" />
                  </TableCell>
                  <TableCell className="border-r border-gray-300 dark:border-gray-700 px-4 py-3">
                    <Skeleton className="h-4 w-20 dark:bg-gray-700" />
                  </TableCell>
                  <TableCell className="border-r border-gray-300 dark:border-gray-700 px-4 py-3">
                    <Skeleton className="h-4 w-24 dark:bg-gray-700" />
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <Skeleton className="h-4 w-24 dark:bg-gray-700" />
                  </TableCell>
                </TableRow>
              ))
            ) : (
              filteredTokens.map((item, i) => {
                const address = item.token?.tokenContractAddress?.toLowerCase() || '';
                return (
                  <TableRow
                    key={i}
                    className="hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer transition-colors"
                    onClick={() => handleTokenClick(item.token?.chainIndex, item.token?.tokenContractAddress)}
                  >
                    <TableCell className="border-r border-gray-300 dark:border-gray-700 px-4 py-3 break-all text-blue-600 dark:text-blue-400 hover:underline">
                      {tokenMap[address] || address || 'N/A'}
                    </TableCell>
                    <TableCell className="border-r border-gray-300 dark:border-gray-700 px-4 py-3 dark:text-gray-300">
                      {formatCurrency(item.result?.price)}
                    </TableCell>
                    <TableCell className="border-r border-gray-300 dark:border-gray-700 px-4 py-3 dark:text-gray-300">
                      {formatCurrency(item.result?.marketCap)}
                    </TableCell>
                    <TableCell className="px-4 py-3 dark:text-gray-300">
                      {item.result?.volume24H !== undefined ? formatCurrency(item.result.volume24H) : 'N/A'}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
