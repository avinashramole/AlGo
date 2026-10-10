import { useSearchParams } from "react-router-dom";
import { cn } from "../lib/format";
import { Orders } from "./Orders";
import { PositionsDesk } from "./PositionsDesk";
import { Reports } from "./Reports";

type ReportsTab = "positions" | "orders" | "reports";

function tabFromParams(value: string | null): ReportsTab {
  if (value === "orders") return "orders";
  if (value === "reports") return "reports";
  return "positions";
}

export function ReportsHub() {
  const [params, setParams] = useSearchParams();
  const tab = tabFromParams(params.get("tab"));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-bold">Reports</h1>
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
          <button
            type="button"
            onClick={() => setParams({ tab: "reports" }, { replace: true })}
            className={cn(tab === "reports" ? "bg-white text-[#0f2744] shadow-sm" : "text-slate-400")}
          >
            Reports
          </button>
        </div>
      </div>
      {tab === "orders" ? <Orders embedded /> : tab === "reports" ? <Reports embedded /> : <PositionsDesk embedded />}
    </div>
  );
}
