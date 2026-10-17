import { useSearchParams } from "react-router-dom";
import { ReportsBookTabs } from "../components/desk/ReportsBookTabs";
import { useMarket } from "../context/MarketContext";
import { tabFromParams } from "../lib/bookTabs";
import { hasPaperActivity } from "../lib/paperBook";
import { MasterReport } from "./MasterReport";
import { Orders } from "./Orders";
import { PaperTrading } from "./PaperTrading";
import { PositionsDesk } from "./PositionsDesk";
import { Reports } from "./Reports";

export function ReportsHub() {
  const [params] = useSearchParams();
  const { data } = useMarket();
  const showPaper = hasPaperActivity({
    orders: data.orders,
    positions: data.positions,
    closedTrades: data.closedTrades,
    algos: data.algos,
  });
  const tab = tabFromParams(params.get("tab"), showPaper);

  return (
    <div className="space-y-2">
      <ReportsBookTabs active={tab} />
      {tab === "orders" ? (
        <Orders embedded book="live" />
      ) : tab === "reports" ? (
        <Reports embedded />
      ) : tab === "master" ? (
        <MasterReport />
      ) : tab === "paper" ? (
        <PaperTrading embedded />
      ) : (
        <PositionsDesk embedded book="live" />
      )}
    </div>
  );
}
