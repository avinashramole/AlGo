import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Users, X } from "lucide-react";
import { saveOptionChainMap, type ClientRow } from "../api/client";
import { OptionIdsTape } from "../components/dashboard/OptionIdsTape";
import { TickerStrip } from "../components/dashboard/TickerStrip";
import { useMarket } from "../context/MarketContext";
import { loadClientList, peekClientList } from "../lib/clientsCache";
import { catchDeskError } from "../lib/liveSite";
import { cn, dhanFeedLabel, formatNumber, formatQuote, hasDhanQuotes, isMcxSessionOpen, isNseSessionOpen } from "../lib/format";
import { capStrikeWindow } from "../lib/deskFeed";
import { isCrudeUnderlying, isMcxUnderlying, OPTION_UNDERLYINGS } from "../lib/markets";

type MappingScope = "master" | "clients" | "both";

export function Options() {
  const { data, selectChain, refresh } = useMarket();
  const meta = data.optionMeta;
  const underlyings = meta?.underlyings?.length ? meta.underlyings : OPTION_UNDERLYINGS;
  const rows = capStrikeWindow(data.optionChain || []);
  const [lots, setLots] = useState(1);
  const [mapOpen, setMapOpen] = useState(false);
  const atm = rows.find((row) => row.atm);
  const spot = meta?.spot || data.indices[0]?.price || 0;
  const lotSize = underlyings.find((item) => item.id === meta?.symbol)?.lot || 65;
  const qty = Math.max(1, lots) * lotSize;
  const isCrude = isCrudeUnderlying(meta?.symbol);
  const isMcx = isMcxUnderlying(meta?.symbol);
  const sessionOpen = isMcx ? isMcxSessionOpen() : isNseSessionOpen();
  const sessionHours = isMcx ? "MCX 09:00–23:30 IST" : "NSE 09:15–15:30 IST";
  const dhanQuotes = hasDhanQuotes(data);
  const sourceLabel = dhanFeedLabel(data, sessionOpen);
  const expiryLabel = meta?.expiryLabel || meta?.expiry || "—";
  const mappedCount = Array.isArray(data.optionChainMap?.mappedClientIds) ? data.optionChainMap.mappedClientIds.length : 0;
  const mapScope = data.optionChainMap?.mappingScope || "both";

  return (
    <div className="flex min-h-0 flex-col gap-3 md:h-full md:overflow-hidden">
      <div className="shrink-0 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">Option Chain</h1>
            <p className="text-sm text-slate-400">
              {meta?.symbol || "NIFTY"} · Expiry {expiryLabel} · Spot {formatQuote(spot)} · ATM{" "}
              {atm ? formatNumber(atm.strike, 0) : "—"} · PCR {meta?.pcr != null ? meta.pcr.toFixed(2) : "—"} · ATM ±5 ·{" "}
              {sourceLabel}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setMapOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-xs font-semibold"
              data-option-chain-map="true"
            >
              <Users size={14} />
              Copy trade
              <span className="text-slate-400">{mappedCount}</span>
            </button>
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
                1 lot = Dhan qty {isCrude ? Math.max(1, lots) : qty}
                {isCrude ? ` · size ${lotSize}` : ""}
              </span>
            </label>
          </div>
        </div>
        <TickerStrip selectedId={meta?.symbol} onSelect={(chainId) => void selectChain(chainId)} />
        <div
          className={cn(
            "rounded-xl px-4 py-2 text-sm font-semibold",
            dhanQuotes ? "bg-emerald-50 text-up dark:bg-emerald-950/40" : "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
          )}
        >
          {data.dhanFeed?.live ? (
            sessionOpen ? (
            <>
              BUY/SELL on a strike opens Market or Limit at that strike’s price. Orders go to Dhan
              {mapScope === "master"
                ? " on the admin broker only."
                : mapScope === "clients"
                  ? " on mapped client brokers — not the admin account for copies."
                  : mappedCount
                    ? ` and copies ${mappedCount} mapped client${mappedCount === 1 ? "" : "s"}.`
                    : ". Copy ON clients receive BUY/SELL on their brokers. Tick names under Copy trade to limit who copies."}{" "}
              Confirm in the{" "}
              <Link to="/reports?tab=orders" className="underline">
                order book
              </Link>{" "}
              and the Dhan app.
            </>
            ) : (
            <>
              {sessionHours} is closed. Last Dhan quotes stay on the chain. BUY/SELL is sent to Dhan as an after-market order for next open. Confirm in the{" "}
              <Link to="/reports?tab=orders" className="underline">
                order book
              </Link>{" "}
              and the Dhan app AMO tab.
            </>
            )
          ) : dhanQuotes ? (
            <>
              Last Dhan quotes stay after NSE 15:30 and MCX 23:30 IST. BUY/SELL waits until Dhan ticks again.
            </>
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
      </div>
      <OptionIdsTape lots={lots} />
      {mapOpen ? (
        <MapClientsModal
          mappingScope={mapScope}
          mappedClientIds={data.optionChainMap?.mappedClientIds || []}
          onClose={() => setMapOpen(false)}
          onSaved={() => {
            setMapOpen(false);
            void refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function MapClientsModal({
  mappingScope,
  mappedClientIds,
  onClose,
  onSaved,
}: {
  mappingScope: MappingScope;
  mappedClientIds: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const seeded = peekClientList();
  const [clients, setClients] = useState<ClientRow[]>(seeded?.clients || []);
  const [scope, setScope] = useState<MappingScope>(mappingScope || "both");
  const [picked, setPicked] = useState<string[]>(mappedClientIds || []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(Boolean(seeded?.clients.length));

  const load = useCallback(async () => {
    try {
      const result = await loadClientList(true);
      setClients(result.clients || []);
      setError("");
    } catch (err) {
      setError(catchDeskError(err, "Could not load clients"));
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!loaded) return;
    const live = new Set(clients.map((row) => row.id));
    setPicked((current) => current.filter((id) => live.has(id)));
  }, [loaded, clients]);

  const toggleId = (id: string) => {
    setPicked((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await saveOptionChainMap({ mappedClientIds: picked, mappingScope: scope });
      onSaved();
    } catch (err) {
      setError(catchDeskError(err, "Could not save mapping"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="desk-overlay z-40">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div className="desk-sheet relative z-10 flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-xl">
        <div className="flex items-center justify-between px-3 py-2">
          <h2 className="text-sm font-bold">Copy trade · option chain</h2>
          <button type="button" className="text-slate-400" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-hidden px-3 pb-3">
          <div className="flex items-center gap-3 rounded-xl bg-[var(--bg)] px-4 py-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--card)] text-slate-400">
              <Users size={16} />
            </div>
            <div>
              <div className="text-sm font-bold">Manual BUY / SELL</div>
              <div className="text-xs text-slate-400">Pick clients, or leave empty so Copy ON users follow the admin</div>
            </div>
          </div>
          <label className="grid gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Mapping scope
            <select
              className="h-11 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 text-sm font-semibold normal-case tracking-normal text-[var(--text)]"
              value={scope}
              onChange={(event) => setScope(event.target.value as MappingScope)}
            >
              <option value="both">Master + selected clients</option>
              <option value="master">Master only</option>
              <option value="clients">Selected clients only</option>
            </select>
          </label>
          <p className="text-[11px] font-semibold leading-snug text-slate-500">
            {scope === "master"
              ? "Orders go to the admin broker only. Copy ON and mapped clients do not receive a copy."
              : scope === "clients"
                ? "Admin stays on the signal only. Live copies go to Copy ON or selected clients on their own brokers — not a second admin lot."
                : picked.length
                  ? "Admin broker and the selected clients both receive the live order."
                  : "Admin broker plus every Copy ON client (copy trade). Tick names to copy only those clients."}
          </p>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {clients.map((row) => {
              const checked = picked.includes(row.id);
              return (
                <label
                  key={row.id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5"
                >
                  <input type="checkbox" checked={checked} onChange={() => toggleId(row.id)} />
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">
                    {(row.name || "?").trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{row.name}</span>
                    <span className="block text-[11px] text-slate-400">
                      {row.brokerName} · {row.linked || row.tradeMode === "real" ? "Active account" : "Paper account"}
                      {row.copy ? " · Copy ON" : ""}
                    </span>
                  </span>
                </label>
              );
            })}
            {!clients.length ? (
              <p className="py-6 text-center text-sm text-slate-400">
                {loaded ? "No clients yet. Add one on User & IP Manager first." : "Loading clients…"}
              </p>
            ) : null}
          </div>
          {error ? <p className="text-xs font-semibold text-down">{error}</p> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--border)] px-3 py-2">
          <button type="button" onClick={onClose} className="h-8 rounded-lg px-3 text-xs font-semibold">
            Cancel
          </button>
          <button type="button" disabled={busy} onClick={() => void save()} className="h-8 rounded-lg bg-brand-500 px-3 text-xs font-semibold text-white disabled:opacity-60">
            {busy ? "Saving..." : "Save mapping"}
          </button>
        </div>
      </div>
    </div>
  );
}
