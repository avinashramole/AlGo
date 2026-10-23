import { useState } from "react";
import { X } from "lucide-react";
import { useMarket } from "../../context/MarketContext";
import { cn, formatNumber, formatOi, formatPct, vwapTone } from "../../lib/format";
import { capStrikeWindow } from "../../lib/deskFeed";
import { exchangeSegmentFor, isCrudeUnderlying } from "../../lib/markets";

type ChainRow = {
  strike: number;
  atm?: boolean;
  callLtp: number;
  putLtp: number;
  callVwap?: number;
  putVwap?: number;
  callChg: number;
  putChg: number;
  callBuy?: number;
  callSell?: number;
  putBuy?: number;
  putSell?: number;
  callId?: number | string;
  putId?: number | string;
};

type Ticket = {
  option: "CE" | "PE";
  side: "BUY" | "SELL";
  row: ChainRow;
};

function optionTickPrice(value: unknown) {
  const n = Number(value);
  if (!(Number.isFinite(n) && n > 0)) return 0;
  return Math.round(n * 20) / 20;
}

function strikeLtp(row: ChainRow, option: "CE" | "PE") {
  return option === "CE" ? row.callLtp : row.putLtp;
}

export function OptionIdsTape({ lots = 1 }: { lots?: number }) {
  const { data, selectChain, order } = useMarket();
  const meta = data.optionMeta;
  const symbol = meta?.symbol || "NIFTY";
  const expiries = (meta?.expiries || []).slice(0, 4);
  const rows = capStrikeWindow(data.optionChain || []);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [noteFail, setNoteFail] = useState(false);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [ticketType, setTicketType] = useState<"MARKET" | "LIMIT">("LIMIT");
  const [ticketPrice, setTicketPrice] = useState("");
  const [ticketLots, setTicketLots] = useState(Math.max(1, lots));

  const lot = meta?.underlyings?.find((item) => item.id === symbol)?.lot || 65;
  const crude = isCrudeUnderlying(symbol);
  const liveRow = ticket ? rows.find((row) => row.strike === ticket.row.strike) || ticket.row : null;
  const liveLtp = ticket && liveRow ? strikeLtp(liveRow, ticket.option) : 0;
  const placeLots = Math.max(1, ticketLots);
  const qty = placeLots * lot;
  const dhanQty = crude ? placeLots : qty;

  const openTicket = (option: "CE" | "PE", side: "BUY" | "SELL", row: ChainRow) => {
    const tick = optionTickPrice(strikeLtp(row, option));
    setTicket({ option, side, row });
    setTicketType("LIMIT");
    setTicketPrice(tick > 0 ? String(tick) : "");
    setTicketLots(Math.max(1, lots));
    setNote("");
    setNoteFail(false);
  };

  const closeTicket = () => {
    if (busy) return;
    setTicket(null);
  };

  const trade = async () => {
    if (!ticket) return;
    const { option, side } = ticket;
    const row = liveRow || ticket.row;
    const key = `${row.strike}-${option}-${side}`;
    const ltp = strikeLtp(row, option);
    const useLimit = ticketType === "LIMIT";
    const limit = optionTickPrice(ticketPrice) || optionTickPrice(ltp);
    setBusy(key);
    setNote("");
    setNoteFail(false);
    if (useLimit && !(limit > 0)) {
      setNoteFail(true);
      setNote("Enter a Limit price");
      setBusy("");
      return;
    }
    try {
      const result = await order({
        symbol: `${symbol} ${row.strike} ${option}`,
        side,
        qty,
        lots: placeLots,
        lotSize: lot,
        price: useLimit ? limit : ltp,
        product: "MIS",
        type: useLimit ? "LIMIT" : "MARKET",
        brokerId: data.dhanFeed?.live ? "dhan" : data.activeBrokerId,
        kind: "option",
        option,
        strike: row.strike,
        expiry: meta?.expiry,
        exchangeSegment: exchangeSegmentFor(symbol),
        securityId: option === "CE" ? row.callId : row.putId,
      });
      const priceNote = useLimit ? `LIMIT @ ${limit}` : "MARKET";
      setNote(
        result.live
          ? `${result.afterMarketOrder ? "Queued at Dhan for next open (AMO)" : "Sent to Dhan"} · ${side} ${symbol} ${row.strike} ${option} · ${placeLots} lot · ${priceNote} · Dhan qty ${dhanQty}${crude ? ` (size ${lot})` : ""}`
          : result.warning || `Desk fill · ${side} ${symbol} ${row.strike} ${option} · ${placeLots} lot · ${priceNote} · Dhan qty ${dhanQty}${crude ? ` (size ${lot})` : ""}`,
      );
      setTicket(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Order failed";
      setNoteFail(true);
      setNote(message);
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="card p-3 md:flex md:min-h-0 md:flex-1 md:flex-col md:overflow-hidden md:p-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2 md:shrink-0">
        <div>
          <div className="text-sm font-bold">Options · next 4 expiries</div>
          <p className="text-xs text-slate-400">
            ATM ±5. BUY or SELL on a strike opens a Market or Limit ticket at that strike’s LTP.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {expiries.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => void selectChain(symbol, item)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold",
                meta?.expiry === item ? "bg-brand-500 text-white" : "border border-[var(--border)] bg-[var(--card)]",
              )}
            >
              {meta?.expiryLabels?.[item] || item}
            </button>
          ))}
        </div>
      </div>
      {note ? (
        <div className={cn("mb-2 break-words text-xs font-semibold", noteFail ? "text-down" : "text-slate-500")}>{note}</div>
      ) : null}
      {!rows.length ? (
        <div className="mb-2 text-xs font-semibold text-slate-500">Loading the current expiry…</div>
      ) : null}
      <div className="space-y-2 md:hidden">
        {rows.map((row) => {
          const callVwap = row.callVwap || row.callLtp;
          const putVwap = row.putVwap || row.putLtp;
          return (
            <div key={row.strike} className={cn("rounded-xl border border-[var(--border)] p-2", row.atm && "border-brand-500 bg-brand-50/80 dark:bg-brand-500/10")}>
              <div className="mb-2 text-center text-sm font-bold">
                {row.strike}
                {row.atm ? " ATM" : ""}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[10px] font-bold uppercase text-up">CE</div>
                  <div className="text-sm font-bold text-up">{formatNumber(row.callLtp)}</div>
                  <div className={cn("text-[11px] font-semibold", vwapTone(callVwap, row.callLtp))}>
                    VWAP {formatNumber(callVwap)}
                  </div>
                  <div className={cn("text-[10px]", row.callChg >= 0 ? "text-up" : "text-down")}>{formatPct(row.callChg)}</div>
                  <div className="mt-1 flex gap-1">
                    <SideButton busy={busy} id={`${row.strike}-CE`} side="BUY" onClick={() => openTicket("CE", "BUY", row)} />
                    <SideButton busy={busy} id={`${row.strike}-CE`} side="SELL" onClick={() => openTicket("CE", "SELL", row)} />
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-bold uppercase text-down">PE</div>
                  <div className="text-sm font-bold text-down">{formatNumber(row.putLtp)}</div>
                  <div className={cn("text-[11px] font-semibold", vwapTone(putVwap, row.putLtp))}>
                    VWAP {formatNumber(putVwap)}
                  </div>
                  <div className={cn("text-[10px]", row.putChg >= 0 ? "text-up" : "text-down")}>{formatPct(row.putChg)}</div>
                  <div className="mt-1 flex justify-end gap-1">
                    <SideButton busy={busy} id={`${row.strike}-PE`} side="BUY" onClick={() => openTicket("PE", "BUY", row)} />
                    <SideButton busy={busy} id={`${row.strike}-PE`} side="SELL" onClick={() => openTicket("PE", "SELL", row)} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="hidden min-h-0 flex-1 overflow-auto md:block">
        <table className="w-full min-w-[1100px] text-left text-xs">
        <thead className="sticky top-0 z-10 bg-[var(--card)] text-[10px] uppercase tracking-wide text-slate-400 shadow-[inset_0_-1px_0_var(--border)] [&_th]:bg-[var(--card)]">
          <tr>
            <th colSpan={7} className="pb-2 text-center font-bold text-up">
              CE
            </th>
            <th className="pb-2 text-center font-bold">Strike</th>
            <th colSpan={7} className="pb-2 text-center font-bold text-down">
              PE
            </th>
          </tr>
          <tr>
            <th className="pb-2 font-semibold">Buy</th>
            <th className="pb-2 font-semibold">VWAP</th>
            <th className="pb-2 font-semibold">LTP</th>
            <th className="pb-2 font-semibold">Sell</th>
            <th className="pb-2 font-semibold">Buyers</th>
            <th className="pb-2 font-semibold">Sellers</th>
            <th className="pb-2 font-semibold">%</th>
            <th className="pb-2 text-center font-semibold">Strike</th>
            <th className="pb-2 text-right font-semibold">%</th>
            <th className="pb-2 text-right font-semibold">Sellers</th>
            <th className="pb-2 text-right font-semibold">Buyers</th>
            <th className="pb-2 text-right font-semibold">Buy</th>
            <th className="pb-2 text-right font-semibold">VWAP</th>
            <th className="pb-2 text-right font-semibold">LTP</th>
            <th className="pb-2 text-right font-semibold">Sell</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.strike} className={cn("soft-row", row.atm && "bg-brand-50/80 dark:bg-brand-500/10")}>
              <td className="py-2">
                <SideButton busy={busy} id={`${row.strike}-CE`} side="BUY" onClick={() => openTicket("CE", "BUY", row)} />
              </td>
              <td className={cn("py-2 font-semibold", vwapTone(row.callVwap || row.callLtp, row.callLtp))}>
                {formatNumber(row.callVwap || row.callLtp)}
              </td>
              <td className="py-2 font-bold text-up">{formatNumber(row.callLtp)}</td>
              <td className="py-2">
                <SideButton busy={busy} id={`${row.strike}-CE`} side="SELL" onClick={() => openTicket("CE", "SELL", row)} />
              </td>
              <td className="py-2">{formatOi(row.callBuy || 0)}</td>
              <td className="py-2">{formatOi(row.callSell || 0)}</td>
              <td className={cn("py-2", row.callChg >= 0 ? "text-up" : "text-down")}>{formatPct(row.callChg)}</td>
              <td className="py-2 text-center">
                <div className={cn("inline-flex rounded-md px-2 py-1 font-bold", row.atm ? "bg-brand-500 text-white" : "bg-[var(--bg)]")}>
                  {row.strike}
                  {row.atm ? " ATM" : ""}
                </div>
              </td>
              <td className={cn("py-2 text-right", row.putChg >= 0 ? "text-up" : "text-down")}>{formatPct(row.putChg)}</td>
              <td className="py-2 text-right">{formatOi(row.putSell || 0)}</td>
              <td className="py-2 text-right">{formatOi(row.putBuy || 0)}</td>
              <td className="py-2 text-right">
                <div className="flex justify-end">
                  <SideButton busy={busy} id={`${row.strike}-PE`} side="BUY" onClick={() => openTicket("PE", "BUY", row)} />
                </div>
              </td>
              <td className={cn("py-2 text-right font-semibold", vwapTone(row.putVwap || row.putLtp, row.putLtp))}>
                {formatNumber(row.putVwap || row.putLtp)}
              </td>
              <td className="py-2 text-right font-bold text-down">{formatNumber(row.putLtp)}</td>
              <td className="py-2 text-right">
                <div className="flex justify-end">
                  <SideButton busy={busy} id={`${row.strike}-PE`} side="SELL" onClick={() => openTicket("PE", "SELL", row)} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>
      {ticket ? (
        <div className="desk-overlay z-40 md:items-end md:justify-end">
          <button type="button" className="absolute inset-0" aria-label="Close" onClick={closeTicket} />
          <div
            data-option-order-ticket="true"
            className="desk-sheet desk-sheet-sm relative z-10 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-xl"
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <div className={cn("text-sm font-bold", ticket.side === "BUY" ? "text-up" : "text-down")}>
                  {ticket.side} {symbol} {ticket.row.strike} {ticket.option}
                </div>
                <div className="text-xs text-slate-400">
                  LTP {formatNumber(liveLtp)}
                  {ticket.row.atm ? " · ATM" : ""} · {ticketType === "LIMIT" ? "Limit at this strike" : "Market at this strike"}
                </div>
              </div>
              <button type="button" className="icon-btn" onClick={closeTicket} aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <div className="mb-3 flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-1 py-1">
              {(["MARKET", "LIMIT"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  data-option-order-type={type}
                  onClick={() => {
                    setTicketType(type);
                    if (type === "LIMIT" && !optionTickPrice(ticketPrice)) {
                      const tick = optionTickPrice(liveLtp);
                      setTicketPrice(tick > 0 ? String(tick) : "");
                    }
                  }}
                  className={cn(
                    "h-8 flex-1 rounded-md px-2 text-xs font-bold",
                    ticketType === type ? "bg-brand-500 text-white" : "text-slate-500",
                  )}
                >
                  {type === "MARKET" ? "Market" : "Limit"}
                </button>
              ))}
            </div>
            {ticketType === "LIMIT" ? (
              <label className="mb-3 grid gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                Limit price
                <input
                  data-option-limit-price="true"
                  className="h-10 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 text-sm font-bold normal-case tracking-normal"
                  type="number"
                  min={0.05}
                  step={0.05}
                  placeholder="Strike LTP"
                  value={ticketPrice}
                  onChange={(event) => setTicketPrice(event.target.value)}
                />
              </label>
            ) : null}
            <label className="mb-3 grid gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
              Lots
              <input
                className="h-10 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 text-sm font-bold normal-case tracking-normal"
                type="number"
                min={1}
                value={ticketLots}
                onChange={(event) => setTicketLots(Math.max(1, Number(event.target.value) || 1))}
              />
              <span className="normal-case tracking-normal text-[11px] font-semibold text-slate-400">
                1 lot = Dhan qty {dhanQty}
                {crude ? ` · size ${lot}` : ""}
              </span>
            </label>
            {note && noteFail ? <p className="mb-2 text-xs font-semibold text-down">{note}</p> : null}
            <div className="flex gap-2">
              <button type="button" onClick={closeTicket} className="h-10 flex-1 rounded-xl border border-[var(--border)] text-sm font-semibold">
                Cancel
              </button>
              <button
                type="button"
                data-option-order-place="true"
                disabled={Boolean(busy)}
                onClick={() => void trade()}
                className={cn(
                  "h-10 flex-1 rounded-xl text-sm font-semibold text-white disabled:opacity-60",
                  ticket.side === "BUY" ? "bg-emerald-500" : "bg-rose-500",
                )}
              >
                {busy ? "Placing..." : `Place ${ticket.side}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SideButton({
  busy,
  id,
  side,
  onClick,
}: {
  busy: string;
  id: string;
  side: "BUY" | "SELL";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={Boolean(busy)}
      onClick={onClick}
      className={cn(
        "h-10 min-w-[3.25rem] flex-1 rounded-md px-2 text-xs font-bold text-white disabled:opacity-50 md:h-7 md:min-w-0 md:flex-none md:text-[10px]",
        side === "BUY" ? "bg-emerald-500" : "bg-rose-500",
      )}
    >
      {busy === `${id}-${side}` ? "..." : side}
    </button>
  );
}
