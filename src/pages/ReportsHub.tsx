import { useSearchParams } from "react-router-dom";
import { cn } from "../lib/format";
import { Orders } from "./Orders";
import { PositionsDesk } from "./PositionsDesk";
import { Reports } from "./Reports";

type ReportsTab = "reports" | "orders" | "positions";

function tabFromParams(value: string | null): ReportsTab {
  if (value === "orders") return "orders";
  if (value === "positions") return "positions";
  return "reports";
}

export function ReportsHub() {
  const [params, setParams] = useSearchParams();
  const tab = tabFromParams(params.get("tab"));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-bold">Reports</h1>
        <div className="desk-tabs">
          <button
            type="button"
            onClick={() => setParams({ tab: "orders" }, { replace: true })}
            className={cn(tab === "orders" ? "bg-navy-900 text-white" : "text-slate-400")}
          >
            Orders
          </button>
          <button
            type="button"
            onClick={() => setParams({ tab: "positions" }, { replace: true })}
            className={cn(tab === "positions" ? "bg-navy-900 text-white" : "text-slate-400")}
          >
            Position
          </button>
          <button
            type="button"
            onClick={() => setParams({}, { replace: true })}
            className={cn(tab === "reports" ? "bg-navy-900 text-white" : "text-slate-400")}
          >
            Reports
          </button>
        </div>
      </div>
      {tab === "orders" ? <Orders embedded /> : tab === "positions" ? <PositionsDesk embedded /> : <Reports embedded />}
    </div>
  );
}
