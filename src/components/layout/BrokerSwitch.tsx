import { Link } from "react-router-dom";
import { useMarket } from "../../context/MarketContext";
import { brokerSelectLabel, canActivateBroker } from "../../lib/brokers";
import { headerBrokerLabel } from "../../lib/format";

export function BrokerSwitch() {
  const { data, activate } = useMarket();
  const brokers = data.brokers || [];
  const active = brokers.find((item) => item.id === data.activeBrokerId) || brokers.find((item) => item.active) || brokers[0];

  return (
    <div className="flex items-center gap-2">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="hidden max-w-[7rem] truncate text-xs font-extrabold sm:inline">{active?.name || "Dhan"}</span>
        {active ? (
          <span className="hidden rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-extrabold text-brand-500 sm:inline">
            ACTIVE
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
        className="h-9 max-w-[9rem] rounded-lg border border-[var(--border)] bg-[var(--bg)] px-1.5 text-[11px] font-semibold outline-none sm:max-w-[160px] md:max-w-[220px] md:px-2 md:text-xs"
        value={active?.id || "dhan"}
        onChange={(event) => {
          void activate(event.target.value).catch(() => undefined);
        }}
        title="Default order broker"
      >
        {brokers.map((item) => (
          <option key={item.id} value={item.id} disabled={!canActivateBroker(item)}>
            {brokerSelectLabel(item)}
          </option>
        ))}
      </select>
      <Link to="/brokers" className="hidden text-[11px] font-semibold text-brand-500 lg:inline">
        Brokers
      </Link>
    </div>
  );
}
