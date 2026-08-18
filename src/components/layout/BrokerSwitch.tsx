import { Link } from "react-router-dom";
import { useMarket } from "../../context/MarketContext";

export function BrokerSwitch() {
  const { data, activate } = useMarket();
  const connected = (data.brokers || []).filter((item) => item.connected);
  const active = connected.find((item) => item.id === data.activeBrokerId) || connected[0];

  return (
    <div className="flex items-center gap-2">
      <select
        className="h-9 max-w-[160px] rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 text-xs font-semibold outline-none"
        value={active?.id || "dhan"}
        onChange={(event) => {
          void activate(event.target.value).catch(() => undefined);
        }}
        title="Active order broker"
      >
        {connected.map((item) => (
          <option key={item.id} value={item.id}>
            {item.liveFeed ? `${item.name} LIVE` : item.name}
          </option>
        ))}
      </select>
      {data.dhanFeed?.live && (
        <span className="rounded bg-emerald-50 px-1.5 py-1 text-[10px] font-extrabold text-up dark:bg-emerald-950/40">
          DHAN LIVE
        </span>
      )}
      <Link to="/brokers" className="text-[11px] font-semibold text-brand-500">
        Brokers
      </Link>
    </div>
  );
}
