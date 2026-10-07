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
        <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--card)] p-0.5 text-xs font-bold">
          <button
            type="button"
            onClick={() => setParams({ tab: "orders" }, { replace: true })}
            className={cn("rounded-md px-3 py-1.5", tab === "orders" ? "bg-brand-500 text-white" : "text-slate-400")}
          >
            Orders
          </button>
          <button
            type="button"
            onClick={() => setParams({ tab: "positions" }, { replace: true })}
            className={cn("rounded-md px-3 py-1.5", tab === "positions" ? "bg-brand-500 text-white" : "text-slate-400")}
          >
            Position
          </button>
          <button
            type="button"
            onClick={() => setParams({}, { replace: true })}
            className={cn("rounded-md px-3 py-1.5", tab === "reports" ? "bg-brand-500 text-white" : "text-slate-400")}
          >
            Reports
          </button>
        </div>
      </div>
      {tab === "orders" ? <Orders embedded /> : tab === "positions" ? <PositionsDesk embedded /> : <Reports embedded />}
    </div>
  );
}
