import { ClipboardList } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { AISignal } from "../components/dashboard/AISignal";
import { InstitutionalFlow } from "../components/dashboard/InstitutionalFlow";
import { MarketDNA } from "../components/dashboard/MarketDNA";
import { PriceChart } from "../components/dashboard/PriceChart";
import { RecentSignals } from "../components/dashboard/RecentSignals";
import { SentimentGauge } from "../components/dashboard/SentimentGauge";
import { TickerStrip } from "../components/dashboard/TickerStrip";
import { TradeModal } from "../components/dashboard/TradeModal";
import { HomeOverview } from "../components/home/HomeOverview";
import { useAuth } from "../context/AuthContext";
import { useMarket } from "../context/MarketContext";

export function Dashboard() {
  const [reviewOpen, setReviewOpen] = useState(false);
  const { user } = useAuth();
  const { data } = useMarket();
  const broker = (data.brokers || []).find((item) => item.id === data.activeBrokerId) || (data.brokers || [])[0];
  const capital = Number(broker?.funds || 0);
  const available = Math.max(0, capital - Number(broker?.marginUsed || 0));
  const pnl = Number(data.report?.netPnl || data.report?.realizedPnl || 0);

  return (
    <div className="space-y-3" data-home-layout="tapes">
      <HomeOverview
        name={user?.name}
        capital={capital}
        available={available}
        pnl={pnl}
        algosTo="/algo"
        ordersTo="/reports?tab=orders"
        positionsTo="/reports?tab=positions"
        masterTo="/master-report"
        tape={<TickerStrip />}
      />
      <Link
        to="/master-report"
        data-master-home="true"
        className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-brand-500 text-sm font-extrabold text-white"
      >
        <ClipboardList size={16} />
        Master report
      </Link>
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
