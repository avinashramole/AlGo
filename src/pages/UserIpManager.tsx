import { useSearchParams } from "react-router-dom";
import { cn } from "../lib/format";
import { IpManagement } from "./IpManagement";
import { Users } from "./Users";

export function UserIpManager() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "ips" ? "ips" : "users";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-bold">User & IP Manager</h1>
        <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--card)] p-0.5 text-xs font-bold">
          <button
            type="button"
            onClick={() => setParams({}, { replace: true })}
            className={cn("rounded-md px-3 py-1.5", tab === "users" ? "bg-brand-500 text-white" : "text-slate-400")}
          >
            Users
          </button>
          <button
            type="button"
            onClick={() => setParams({ tab: "ips" }, { replace: true })}
            className={cn("rounded-md px-3 py-1.5", tab === "ips" ? "bg-brand-500 text-white" : "text-slate-400")}
          >
            IPs
          </button>
        </div>
      </div>
      {tab === "ips" ? <IpManagement embedded /> : <Users embedded />}
    </div>
  );
}
