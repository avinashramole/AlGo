import { useNavigate } from "react-router-dom";
import { useMarket } from "../../context/MarketContext";
import { type BookTab } from "../../lib/bookTabs";
import { cn } from "../../lib/format";
import { hasPaperActivity } from "../../lib/paperBook";

export function reportsBookPath(tab: BookTab) {
  if (tab === "master") return "/master-report";
  if (tab === "positions") return "/reports";
  return `/reports?tab=${tab}`;
}

export function ReportsBookTabs({ active }: { active: BookTab }) {
  const navigate = useNavigate();
  const { data } = useMarket();
  const showPaper = hasPaperActivity({
    orders: data.orders,
    positions: data.positions,
    closedTrades: data.closedTrades,
    algos: data.algos,
  });

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h1 className="text-lg font-bold">Position & Orders</h1>
      <div className="desk-tabs" data-reports-tabs="position-order-reports">
        <button
          type="button"
          onClick={() => navigate(reportsBookPath("positions"))}
          className={cn(active === "positions" ? "bg-white text-[#0f2744] shadow-sm" : "text-slate-400")}
        >
          Position
        </button>
        <button
          type="button"
          onClick={() => navigate(reportsBookPath("orders"))}
          className={cn(active === "orders" ? "bg-white text-[#0f2744] shadow-sm" : "text-slate-400")}
        >
          Orders
        </button>
        {showPaper ? (
          <button
            type="button"
            data-paper-tab="true"
            onClick={() => navigate(reportsBookPath("paper"))}
            className={cn(active === "paper" ? "bg-white text-[#0f2744] shadow-sm" : "text-slate-400")}
          >
            Paper
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => navigate(reportsBookPath("reports"))}
          className={cn(active === "reports" ? "bg-white text-[#0f2744] shadow-sm" : "text-slate-400")}
        >
          Reports
        </button>
        <button
          type="button"
          data-master-tab="true"
          onClick={() => navigate("/master-report")}
          className={cn(
            "bg-brand-500 text-white",
            active === "master" ? "shadow-sm" : "opacity-90",
          )}
        >
          Master report
        </button>
      </div>
    </div>
  );
}
