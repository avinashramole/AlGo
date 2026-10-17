import { useSearchParams } from "react-router-dom";
import { useMarket } from "../context/MarketContext";
import { tabFromParams } from "../lib/bookTabs";
import { hasPaperActivity } from "../lib/paperBook";
import { cn } from "../lib/format";
import { MasterReport } from "./MasterReport";
import { Orders } from "./Orders";
import { PaperTrading } from "./PaperTrading";
import { PositionsDesk } from "./PositionsDesk";
import { Reports } from "./Reports";

export function ReportsHub() {
  const [params, setParams] = useSearchParams();
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-bold">Position & Orders</h1>
        <div className="desk-tabs" data-reports-tabs="position-order-reports">
          <button
            type="button"
            onClick={() => setParams({ tab: "positions" }, { replace: true })}
            className={cn(tab === "positions" ? "bg-white text-[#0f2744] shadow-sm" : "text-slate-400")}
          >
            Position
          </button>
          <button
            type="button"
            onClick={() => setParams({ tab: "orders" }, { replace: true })}
            className={cn(tab === "orders" ? "bg-white text-[#0f2744] shadow-sm" : "text-slate-400")}
          >
            Orders
          </button>
          {showPaper ? (
            <button
              type="button"
              data-paper-tab="true"
              onClick={() => setParams({ tab: "paper" }, { replace: true })}
              className={cn(tab === "paper" ? "bg-white text-[#0f2744] shadow-sm" : "text-slate-400")}
            >
              Paper
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setParams({ tab: "reports" }, { replace: true })}
            className={cn(tab === "reports" ? "bg-white text-[#0f2744] shadow-sm" : "text-slate-400")}
          >
            Reports
          </button>
          <button
            type="button"
            data-master-tab="true"
            onClick={() => setParams({ tab: "master" }, { replace: true })}
            className={cn(tab === "master" ? "bg-white text-[#0f2744] shadow-sm" : "text-slate-400")}
          >
            Master report
          </button>
        </div>
      </div>
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
