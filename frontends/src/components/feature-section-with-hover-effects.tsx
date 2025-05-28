import { cn } from "@/lib/utils";
import {
  IconAdjustmentsBolt,
  IconCloud,
  IconCurrencyDollar,
  IconEaseInOut,
  IconHeart,
  IconHelp,
  IconRouteAltLeft,
  IconTerminal2,
} from "@tabler/icons-react";

export function FeaturesSectionWithHoverEffects() {
  const features = [
    {
      title: "🔁 Cross-Chain Arbitrage Engine",
      description:
        "Detects and executes arbitrage opportunities across multiple blockchains like Ethereum, Solana, BNB Chain, and more",
      icon: <IconTerminal2 />,
    },
    {
      title: "⚡ Real-Time Price Monitoring",
      description:
        "Continuously tracks token prices on multiple DEXs (like Uniswap, Jupiter, PancakeSwap) with millisecond-level updates.",
      icon: <IconEaseInOut />,
    },
    {
      title: "🤖 AI-Powered Trade Execution",
      description:
        "Uses SendAI to optimize decision-making, prioritize trades, and reduce failed transactions or slippage.",
      icon: <IconCurrencyDollar />,
    },
    {
      title: "📊 Profit Optimization Algorithm",
      description: "Calculates gas fees, bridge fees, and slippage to ensure every trade is actually profitable before execution.",
      icon: <IconCloud />,
    },
    {
      title: "🔐 Secure Multi-Wallet Integration",
      description: "Supports multiple wallets (e.g., MetaMask, Phantom) and ensures secure key handling with encrypted storage.",
      icon: <IconRouteAltLeft />,
    },
    {
      title: "🌉 Built-In Bridge Support",
      description:
        "Uses fast, trusted bridges (like Wormhole or LayerZero) to move tokens between chains in seconds.",
      icon: <IconHelp />,
    },
    {
      title: "📈 Analytics Dashboard",
      description:
        "Visualize trades, profits, gas fees, token flow, and arbitrage paths through an interactive dashboard.",
      icon: <IconAdjustmentsBolt />,
    },
    {
      title: "🛠️ Custom Strategy Configuration",
      description: "Set your own risk thresholds, trade limits, chain pairs, and token filters — fully customizable.",
      icon: <IconHeart />,
    },
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4  relative z-10 py-10 max-w-7xl mx-auto">
      {features.map((feature, index) => (
        <Feature key={feature.title} {...feature} index={index} />
      ))}
    </div>
  );
}

const Feature = ({
  title,
  description,
  icon,
  index,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  index: number;
}) => {
  return (
    <div
      className={cn(
        "flex flex-col lg:border-r  py-10 relative group/feature dark:border-neutral-800",
        (index === 0 || index === 4) && "lg:border-l dark:border-neutral-800",
        index < 4 && "lg:border-b dark:border-neutral-800"
      )}
    >
      {index < 4 && (
        <div className="opacity-0 group-hover/feature:opacity-100 transition duration-200 absolute inset-0 h-full w-full bg-gradient-to-t from-neutral-100 dark:from-neutral-800 to-transparent pointer-events-none" />
      )}
      {index >= 4 && (
        <div className="opacity-0 group-hover/feature:opacity-100 transition duration-200 absolute inset-0 h-full w-full bg-gradient-to-b from-neutral-100 dark:from-neutral-800 to-transparent pointer-events-none" />
      )}
      <div className="mb-4 relative z-10 px-10 text-neutral-600 dark:text-neutral-400">
        {icon}
      </div>
      <div className="text-lg font-bold mb-2 relative z-10 px-10">
        <div className="absolute left-0 inset-y-0 h-6 group-hover/feature:h-8 w-1 rounded-tr-full rounded-br-full bg-neutral-300 dark:bg-neutral-700 group-hover/feature:bg-blue-500 transition-all duration-200 origin-center" />
        <span className="group-hover/feature:translate-x-2 transition duration-200 inline-block text-neutral-800 dark:text-neutral-100">
          {title}
        </span>
      </div>
      <p className="text-sm text-neutral-600 dark:text-neutral-300 max-w-xs relative z-10 px-10">
        {description}
      </p>
    </div>
  );
};
