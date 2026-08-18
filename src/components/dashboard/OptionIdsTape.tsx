import { useEffect, useMemo, useState } from "react";
import { getContracts, type OptionStrikeContract } from "../../api/client";
import { useMarket } from "../../context/MarketContext";

export function OptionIdsTape() {
  const { data, order } = useMarket();
  const symbol = data.optionMeta?.symbol || "NIFTY";
  const [rows, setRows] = useState<OptionStrikeContract[]>([]);
  const [counts, setCounts] = useState({ options: 0, strikes: 0, futures: 0 });
  const [expiry, setExpiry] = useState("");
  const [strikeQuery, setStrikeQuery] = useState("");
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setError("");
    void getContracts(symbol)
      .then((catalog) => {
        if (cancelled) return;
        setRows(catalog.optionStrikes || []);
        setCounts({
          options: catalog.counts?.options || 0,
          strikes: catalog.counts?.strikes || 0,
          futures: catalog.counts?.futures || 0,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load option IDs");
      });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  const expiries = useMemo(
    () => [...new Set(rows.map((row) => row.expiry).filter(Boolean))],
    [rows],
  );

  const visible = useMemo(() => {
    const wanted = strikeQuery.trim();
    return rows.filter((row) => {
      if (expiry && row.expiry !== expiry) return false;
      if (wanted && !String(row.strike).includes(wanted)) return false;
      return true;
    });
  }, [rows, expiry, strikeQuery]);

  const trade = async (row: OptionStrikeContract, option: "CE" | "PE", side: "BUY" | "SELL") => {
    const securityId = option === "CE" ? row.callId : row.putId;
    if (!securityId) return;
    const key = `${row.expiry}-${row.strike}-${option}-${side}`;
    setBusy(key);
    setNote("");
    try {
      const result = await order({
        symbol: `${row.root} ${row.strike} ${option}`,
        side,
        qty: row.qty || row.lot,
        lots: 1,
        price: 0,
        product: "MIS",
        type: "MARKET",
        brokerId: data.activeBrokerId,
        option,
        strike: row.strike,
        expiry: row.expiry,
        securityId,
        exchangeSegment: row.segment,
      });
      setNote(
        result.live
          ? `Sent to Dhan · ${side} ${row.root} ${row.strike} ${option} · ID ${securityId}`
          : result.warning || `Desk fill · ${side} ${row.root} ${row.strike} ${option} · ID ${securityId}`,
      );
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Order failed");
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="card overflow-x-auto p-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-sm font-bold">Index options · every live ID</div>
          <p className="text-xs text-slate-400">
            {symbol} · {counts.options} OPTIDX IDs · {counts.strikes} strikes · {counts.futures} futures. BUY/SELL is 1
            lot MIS on Dhan when LIVE.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-8 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 text-xs font-semibold"
            value={expiry}
            onChange={(event) => setExpiry(event.target.value)}
          >
            <option value="">All expiries</option>
            {expiries.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <input
            className="h-8 w-28 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 text-xs font-semibold"
            placeholder="Strike"
            value={strikeQuery}
            onChange={(event) => setStrikeQuery(event.target.value)}
          />
        </div>
      </div>
      {error ? <div className="mb-2 text-xs font-semibold text-down">{error}</div> : null}
      {note ? <div className="mb-2 text-xs font-semibold text-slate-500">{note}</div> : null}
      {!rows.length ? (
        <p className="text-xs text-slate-400">Loading Dhan option security IDs from the scrip master…</p>
      ) : (
        <table className="w-full min-w-[820px] text-left text-xs">
          <thead className="text-[10px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="pb-2 font-semibold">Expiry</th>
              <th className="pb-2 font-semibold">Strike</th>
              <th className="pb-2 font-semibold">CE ID</th>
              <th className="pb-2 text-right font-semibold">CE</th>
              <th className="pb-2 font-semibold">PE ID</th>
              <th className="pb-2 text-right font-semibold">PE</th>
            </tr>
          </thead>
          <tbody>
            {visible.slice(0, 400).map((row) => (
              <tr key={`${row.root}-${row.expiry}-${row.strike}`} className="soft-row">
                <td className="py-2 text-slate-500">{row.expiry}</td>
                <td className="py-2 font-bold">{row.strike}</td>
                <td className="py-2 font-mono font-bold">{row.callId || "—"}</td>
                <td className="py-2 text-right">
                  {row.callId ? (
                    <MiniTrade
                      busy={busy}
                      id={`${row.expiry}-${row.strike}-CE`}
                      onBuy={() => void trade(row, "CE", "BUY")}
                      onSell={() => void trade(row, "CE", "SELL")}
                    />
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-2 font-mono font-bold">{row.putId || "—"}</td>
                <td className="py-2 text-right">
                  {row.putId ? (
                    <MiniTrade
                      busy={busy}
                      id={`${row.expiry}-${row.strike}-PE`}
                      onBuy={() => void trade(row, "PE", "BUY")}
                      onSell={() => void trade(row, "PE", "SELL")}
                    />
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {visible.length > 400 ? (
        <p className="mt-2 text-[11px] text-slate-400">
          Showing 400 of {visible.length} strikes. Filter by expiry or strike to see the rest.
        </p>
      ) : null}
    </section>
  );
}

function MiniTrade({
  busy,
  id,
  onBuy,
  onSell,
}: {
  busy: string;
  id: string;
  onBuy: () => void;
  onSell: () => void;
}) {
  return (
    <div className="inline-flex gap-1">
      <button
        type="button"
        disabled={Boolean(busy)}
        onClick={onBuy}
        className="h-7 rounded-md bg-emerald-500 px-2 text-[10px] font-bold text-white disabled:opacity-50"
      >
        {busy === `${id}-BUY` ? "..." : "BUY"}
      </button>
      <button
        type="button"
        disabled={Boolean(busy)}
        onClick={onSell}
        className="h-7 rounded-md bg-rose-500 px-2 text-[10px] font-bold text-white disabled:opacity-50"
      >
        {busy === `${id}-SELL` ? "..." : "SELL"}
      </button>
    </div>
  );
}
