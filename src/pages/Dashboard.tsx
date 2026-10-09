import { useState } from "react";
import { AISignal } from "../components/dashboard/AISignal";
import { InstitutionalFlow } from "../components/dashboard/InstitutionalFlow";
import { MarketDNA } from "../components/dashboard/MarketDNA";
import { PriceChart } from "../components/dashboard/PriceChart";
import { RecentSignals } from "../components/dashboard/RecentSignals";
import { SentimentGauge } from "../components/dashboard/SentimentGauge";
import { TickerStrip } from "../components/dashboard/TickerStrip";
import { TradeModal } from "../components/dashboard/TradeModal";

export function Dashboard() {
  const [reviewOpen, setReviewOpen] = useState(false);

  return (
    <div className="space-y-3" data-home-layout="tapes">
      <TickerStrip />
      <PriceChart />
      <AISignal onReview={() => setReviewOpen(true)} />
      <MarketDNA />
      <SentimentGauge />
      <InstitutionalFlow />
      <RecentSignals />
      <TradeModal open={reviewOpen} onClose={() => setReviewOpen(false)} />
    </div>
  );
}
