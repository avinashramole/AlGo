import { useSearchParams } from "react-router-dom";
import { MemberEnrollments } from "../components/users/MemberEnrollments";
import { cn } from "../lib/format";
import { IpManagement } from "./IpManagement";
import { Users } from "./Users";

type ManagerTab = "users" | "ips" | "enrollments";

function tabFromParams(value: string | null): ManagerTab {
  if (value === "ips") return "ips";
  if (value === "enrollments") return "enrollments";
  return "users";
}

export function UserIpManager() {
  const [params, setParams] = useSearchParams();
  const tab = tabFromParams(params.get("tab"));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-bold">User & IP Manager</h1>
        <div className="desk-tabs">
          <button
            type="button"
            onClick={() => setParams({}, { replace: true })}
            className={cn(tab === "users" ? "bg-navy-900 text-white" : "text-slate-400")}
          >
            Users
          </button>
          <button
            type="button"
            onClick={() => setParams({ tab: "ips" }, { replace: true })}
            className={cn(tab === "ips" ? "bg-navy-900 text-white" : "text-slate-400")}
          >
            IPs
          </button>
          <button
            type="button"
            onClick={() => setParams({ tab: "enrollments" }, { replace: true })}
            className={cn(tab === "enrollments" ? "bg-navy-900 text-white" : "text-slate-400")}
          >
            Enrollments
          </button>
        </div>
      </div>
      {tab === "ips" ? <IpManagement embedded /> : tab === "enrollments" ? <MemberEnrollments /> : <Users embedded />}
    </div>
  );
}
