import { Link } from "react-router-dom";
import { useMarket } from "../../context/MarketContext";
import { headerBrokerLabel } from "../../lib/format";

export function BrokerSwitch() {
  const { data, activate } = useMarket();
  const connected = (data.brokers || []).filter((item) => item.connected);
  const active = connected.find((item) => item.id === data.activeBrokerId) || connected[0];

  const others = connected.filter((item) => item.id !== active?.id);

  return (
    <div className="flex items-center gap-2">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="hidden max-w-[7rem] truncate text-xs font-extrabold sm:inline">{active?.name || "Dhan"}</span>
        {active ? (
          <span className="hidden rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-extrabold text-brand-500 sm:inline">
            DEFAULT
          </span>
        ) : null}
        {active ? (
          <span className="hidden rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-extrabold text-up dark:bg-emerald-950/40 md:inline">
            {headerBrokerLabel({
              brokerId: active.id,
              brokerName: active.name,
              live: active.id === "dhan" ? Boolean(data.dhanFeed?.live) : Boolean(active.liveFeed || active.status === "LIVE"),
              hasQuotes: true,
            })}
          </span>
        ) : null}
      </div>
      <select
        className="h-9 max-w-[5.75rem] rounded-lg border border-[var(--border)] bg-[var(--bg)] px-1.5 text-[11px] font-semibold outline-none sm:max-w-[120px] md:max-w-[160px] md:px-2 md:text-xs"
        value={active?.id || "dhan"}
        onChange={(event) => {
          void activate(event.target.value).catch(() => undefined);
        }}
        title="Default order broker"
      >
        {active ? (
          <option value={active.id}>{active.liveFeed ? `${active.name} LIVE` : active.name}</option>
        ) : null}
        {others.map((item) => (
          <option key={item.id} value={item.id}>
            {item.liveFeed ? `${item.name} LIVE` : item.name}
          </option>
        ))}
      </select>
      <Link to="/brokers" className="hidden text-[11px] font-semibold text-brand-500 lg:inline">
        Brokers
      </Link>
    </div>
  );
}
