import { Link } from "react-router-dom";
import { useMarket } from "../../context/MarketContext";

export function BrokerSwitch() {
  const { data, activate } = useMarket();
  const connected = (data.brokers || []).filter((item) => item.connected);
  const active = connected.find((item) => item.id === data.activeBrokerId) || connected[0];

  return (
    <div className="flex items-center gap-2">
      <select
        className="h-9 max-w-[5.75rem] rounded-lg border border-[var(--border)] bg-[var(--bg)] px-1.5 text-[11px] font-semibold outline-none sm:max-w-[120px] md:max-w-[160px] md:px-2 md:text-xs"
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
        <span className="hidden rounded bg-emerald-50 px-1.5 py-1 text-[10px] font-extrabold text-up dark:bg-emerald-950/40 sm:inline">
          DHAN LIVE
        </span>
      )}
      <Link to="/brokers" className="hidden text-[11px] font-semibold text-brand-500 lg:inline">
        Brokers
      </Link>
    </div>
  );
}
