"use client"

import { useParams } from "next/navigation"
import CryptoMarketChart from "@/components/ui/crypto-market-chart"

export default function TokenDetailsPage() {
  const { chainindex, address } = useParams()

  return (
    <div className="max-w-4xl mt-20 mx-auto p-4">
 

      <CryptoMarketChart chainindex={chainindex as string} address={address as string} />
    </div>
  )
}