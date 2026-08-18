import { useState } from "react";
import { Link } from "react-router-dom";
import { useMarket } from "../context/MarketContext";
import { cn, formatNumber, formatOi, formatPct } from "../lib/format";

export function Options() {
  const { data, selectChain, order } = useMarket();
  const meta = data.optionMeta;
  const underlyings = meta?.underlyings || [
    { id: "NIFTY", label: "NIFTY", lot: 65 },
    { id: "BANKNIFTY", label: "BANKNIFTY", lot: 30 },
    { id: "FINNIFTY", label: "FINNIFTY", lot: 60 },
    { id: "SENSEX", label: "SENSEX", lot: 20 },
  ];
  const rows = data.optionChain || [];
  const maxOi = Math.max(1, ...rows.map((row) => Math.max(row.callOi || 0, row.putOi || 0)));
  const [busy, setBusy] = useState("");
  const [lots, setLots] = useState(1);
  const [note, setNote] = useState("");

  const atm = rows.find((row) => row.atm);
  const spot = meta?.spot || data.indices[0]?.price || 0;
  const pcrText = meta?.pcr != null ? meta.pcr.toFixed(2) : "—";
  const atmIvText = meta?.atmIv ? `${meta.atmIv.toFixed(1)}%` : "—";
  const lotSize = underlyings.find((item) => item.id === meta?.symbol)?.lot || 65;
  const qty = Math.max(1, lots) * lotSize;

  const trade = async (option: "CE" | "PE", action: "BUY" | "SELL", row: (typeof rows)[number]) => {
    const key = `${row.strike}-${option}-${action}`;
    setBusy(key);
    setNote("");
    try {
      const ltp = option === "CE" ? row.callLtp : row.putLtp;
      const symbol = `${meta?.symbol || "NIFTY"} ${row.strike} ${option}`;
      const securityId = option === "CE" ? row.callId : row.putId;
      const result = await order({
        symbol,
        side: action,
        qty,
        price: ltp,
        product: "MIS",
        type: "MARKET",
        brokerId: data.activeBrokerId,
        option,
        strike: row.strike,
        expiry: meta?.expiry,
        securityId: securityId ? String(securityId) : undefined,
        exchangeSegment: String(meta?.symbol || "").toUpperCase().includes("SENSEX") ? "BSE_FNO" : "NSE_FNO",
      });
      if (result.live) {
        setNote(`Sent to Dhan · ${action} ${symbol} · ${lots} lot × ${lotSize} = ${qty} qty · see Order book`);
      } else {
        setNote(
          result.warning ||
            `Desk fill only · ${action} ${symbol} · ${lots} lot × ${lotSize} = ${qty} qty @ ${formatNumber(ltp)}`,
        );
      }
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Order failed");
    } finally {
      setBusy("");
    }
  };

  const sourceLabel = meta?.source === "dhan" ? "DHAN LIVE" : data.dhanFeed?.live ? "DHAN · DEMO FALLBACK" : "DEMO";
  const expiryLabel = meta?.expiryLabel || meta?.expiry || "—";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Option Chain</h1>
          <p className="text-sm text-slate-400">
            {meta?.symbol || "NIFTY"} · Expiry {expiryLabel} · Spot {formatNumber(spot)} · {sourceLabel}
            {meta?.contractIds ? ` · ${meta.contractIds} security IDs` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {underlyings.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => void selectChain(item.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold",
                meta?.symbol === item.id ? "bg-brand-500 text-white" : "border border-[var(--border)] bg-[var(--card)]",
              )}
            >
              {item.label} · {item.lot}
            </button>
          ))}
          <select
            className="h-8 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 text-xs font-semibold"
            value={meta?.expiry || ""}
            onChange={(event) => void selectChain(meta?.symbol || "NIFTY", event.target.value)}
          >
            {(meta?.expiries || []).map((expiry) => (
              <option key={expiry} value={expiry}>
                {meta?.expiryLabels?.[expiry] || expiry}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs font-semibold">
            Lots
            <input
              className="h-7 w-14 rounded border border-[var(--border)] bg-[var(--bg)] px-2 font-bold"
              type="number"
              min={1}
              value={lots}
              onChange={(event) => setLots(Math.max(1, Number(event.target.value) || 1))}
            />
            <span className="text-slate-400">
              1 lot = {lotSize} · qty {qty}
            </span>
          </label>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Spot" value={formatNumber(spot)} />
        <Stat label="ATM" value={atm ? String(atm.strike) : "—"} />
        <Stat label="PCR" value={pcrText} />
        <Stat label="Max pain" value={meta?.maxPain ? formatNumber(meta.maxPain, 0) : "—"} />
        <Stat label="ATM IV" value={atmIvText} />
      </div>
      <div
        className={cn(
          "rounded-xl px-4 py-2 text-sm font-semibold",
          data.dhanFeed?.live ? "bg-emerald-50 text-up dark:bg-emerald-950/40" : "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
        )}
      >
        {data.dhanFeed?.live ? (
          meta?.contractIds ? (
            <>
              BUY/SELL goes to Dhan ({meta.contractIds} contracts ready). Confirm in the{" "}
              <Link to="/orders" className="underline">
                order book
              </Link>{" "}
              and the Dhan app. Order APIs need a static IP whitelist at Dhan.
            </>
          ) : (
            <>
              Dhan is LIVE, but this chain still has no contract IDs. Wait a few seconds for the scrip list, then BUY/SELL
              again. If it keeps failing, pick the Dhan expiry on this page.
            </>
          )
        ) : (
          <>
            Desk fill only until Dhan is LIVE. Paste Access Token on{" "}
            <Link to="/brokers" className="underline">
              Brokers
            </Link>
            , then BUY/SELL again.
          </>
        )}
      </div>
      {note ? <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm font-semibold">{note}</div> : null}
      <section className="card overflow-x-auto">
        <table className="w-full min-w-[1280px] text-left text-xs">
          <thead className="bg-[var(--bg)] text-[10px] uppercase tracking-wide text-slate-400">
            <tr>
              <th colSpan={7} className="px-3 py-2 text-center font-bold text-up">
                CALLS
              </th>
              <th className="px-3 py-2 text-center font-bold">Strike</th>
              <th colSpan={7} className="px-3 py-2 text-center font-bold text-down">
                PUTS
              </th>
            </tr>
            <tr>
              <th className="px-3 py-2 font-semibold">OI</th>
              <th className="px-3 py-2 font-semibold">Volume</th>
              <th className="px-3 py-2 font-semibold">IV</th>
              <th className="px-3 py-2 font-semibold">LTP</th>
              <th className="px-3 py-2 font-semibold">Chg</th>
              <th className="px-3 py-2 font-semibold">ID</th>
              <th className="px-3 py-2 font-semibold">Trade</th>
              <th className="px-3 py-2 text-center font-semibold">Strike</th>
              <th className="px-3 py-2 text-right font-semibold">Trade</th>
              <th className="px-3 py-2 text-right font-semibold">ID</th>
              <th className="px-3 py-2 text-right font-semibold">Chg</th>
              <th className="px-3 py-2 text-right font-semibold">LTP</th>
              <th className="px-3 py-2 text-right font-semibold">IV</th>
              <th className="px-3 py-2 text-right font-semibold">Volume</th>
              <th className="px-3 py-2 text-right font-semibold">OI</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.strike} className={cn("soft-row", row.atm && "bg-brand-50/80 dark:bg-brand-500/10")}>
                <td className="px-3 py-2">
                  <OiBar value={row.callOi || 0} max={maxOi} side="call" />
                  <div className="font-semibold">{formatOi(row.callOi || 0)}</div>
                </td>
                <td className="px-3 py-2 text-slate-500">{formatOi(row.callVol || 0)}</td>
                <td className="px-3 py-2">{row.callIv ? `${row.callIv.toFixed(1)}` : "—"}</td>
                <td className="px-3 py-2 font-bold text-up">{formatNumber(row.callLtp)}</td>
                <td className={cn("px-3 py-2", row.callChg >= 0 ? "text-up" : "text-down")}>{formatPct(row.callChg)}</td>
                <td className="px-3 py-2 font-mono text-[10px] text-slate-500">{row.callId || "—"}</td>
                <td className="px-3 py-2">
                  <TradeButtons
                    busy={busy}
                    strike={row.strike}
                    option="CE"
                    onTrade={(action) => void trade("CE", action, row)}
                  />
                </td>
                <td className="px-3 py-2 text-center">
                  <div className={cn("inline-flex rounded-md px-2 py-1 font-bold", row.atm ? "bg-brand-500 text-white" : "bg-[var(--bg)]")}>
                    {row.strike}
                    {row.atm ? " ATM" : ""}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end">
                    <TradeButtons
                      busy={busy}
                      strike={row.strike}
                      option="PE"
                      onTrade={(action) => void trade("PE", action, row)}
                    />
                  </div>
                </td>
                <td className="px-3 py-2 text-right font-mono text-[10px] text-slate-500">{row.putId || "—"}</td>
                <td className={cn("px-3 py-2 text-right", row.putChg >= 0 ? "text-up" : "text-down")}>{formatPct(row.putChg)}</td>
                <td className="px-3 py-2 text-right font-bold text-down">{formatNumber(row.putLtp)}</td>
                <td className="px-3 py-2 text-right">{row.putIv ? `${row.putIv.toFixed(1)}` : "—"}</td>
                <td className="px-3 py-2 text-right text-slate-500">{formatOi(row.putVol || 0)}</td>
                <td className="px-3 py-2 text-right">
                  <div className="font-semibold">{formatOi(row.putOi || 0)}</div>
                  <OiBar value={row.putOi || 0} max={maxOi} side="put" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="text-xs text-slate-400">
        Buy / Sell is a MIS market order for {lots} lot ({qty} qty). Every strike shows its Dhan security ID. It reaches
        Dhan only while the live Access Token is connected. Otherwise the fill stays on this desk.
      </p>
    </div>
  );
}

function TradeButtons({
  busy,
  strike,
  option,
  onTrade,
}: {
  busy: string;
  strike: number;
  option: "CE" | "PE";
  onTrade: (action: "BUY" | "SELL") => void;
}) {
  return (
    <div className="inline-flex gap-1">
      <button
        type="button"
        disabled={Boolean(busy)}
        onClick={() => onTrade("BUY")}
        className="h-7 rounded-md bg-emerald-500 px-2 text-[10px] font-bold text-white disabled:opacity-50"
      >
        {busy === `${strike}-${option}-BUY` ? "..." : "BUY"}
      </button>
      <button
        type="button"
        disabled={Boolean(busy)}
        onClick={() => onTrade("SELL")}
        className="h-7 rounded-md bg-rose-500 px-2 text-[10px] font-bold text-white disabled:opacity-50"
      >
        {busy === `${strike}-${option}-SELL` ? "..." : "SELL"}
      </button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-[11px] font-semibold uppercase text-slate-400">{label}</div>
      <div className="mt-1 text-lg font-bold">{value}</div>
    </div>
  );
}

function OiBar({ value, max, side }: { value: number; max: number; side: "call" | "put" }) {
  const width = Math.max(8, Math.round((value / max) * 100));
  return (
    <div className="mb-1 h-1.5 w-full overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
      <div className={cn("h-full rounded", side === "call" ? "bg-emerald-400" : "ml-auto bg-rose-400")} style={{ width: `${width}%` }} />
    </div>
  );
}
