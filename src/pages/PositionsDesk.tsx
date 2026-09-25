import { Activity, Crown, Inbox, RefreshCw, TrendingUp, UserRound, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { getPositionsDesk, type LedgerPosition, type PositionLedger, type PositionsDeskSnapshot } from "../api/client";
import { PortfolioSummary } from "../components/dashboard/PortfolioSummary";
import { useMarket } from "../context/MarketContext";
import { cn, formatNumber } from "../lib/format";

type ModeFilter = "all" | "paper" | "real";
type SegmentFilter = "all" | "indian" | "crypto";

const emptyDesk: PositionsDeskSnapshot = {
  master: {
    id: "master",
    name: "Master",
    kind: "master",
    title: "Master",
    subtitle: "PRIMARY MASTER ACCOUNT",
    tradeMode: "paper",
    positions: [],
    mtm: 0,
    realized: 0,
    open: 0,
  },
  clients: [],
  masterMtm: 0,
  clientMtm: 0,
  totalMtm: 0,
  openPositions: 0,
};

function rupee(value: number) {
  const n = Number(value) || 0;
  const sign = n < 0 ? "-" : "";
  return `${sign}₹${formatNumber(Math.abs(n), 2)}`;
}

function moneyClass(value: number) {
  if (value > 0) return "text-up";
  if (value < 0) return "text-down";
  return "text-[var(--text)]";
}

function matchesMode(row: LedgerPosition, accountMode: "paper" | "real", mode: ModeFilter) {
  if (mode === "all") return true;
  if (mode === "paper") return row.paper || accountMode === "paper";
  return !row.paper && accountMode === "real";
}

function filterRows(ledger: PositionLedger, mode: ModeFilter, segment: SegmentFilter) {
  return (ledger.positions || []).filter((row) => {
    if (!matchesMode(row, ledger.tradeMode, mode)) return false;
    if (segment !== "all" && row.segment !== segment) return false;
    return true;
  });
}

function showLedger(ledger: PositionLedger, mode: ModeFilter) {
  if (ledger.kind === "master") return true;
  if (mode === "all") return true;
  return ledger.tradeMode === mode;
}

function isClosedLedger(row: LedgerPosition) {
  return Boolean(row.closed) || Number(row.netQty || 0) === 0;
}

function asLiveLedgerPosition(row: {
  id: string;
  symbol: string;
  type: "BUY" | "SELL";
  qty: number;
  avg: number;
  ltp: number;
  pnl: number;
  product?: string;
  strategy?: string;
  brokerId?: string;
}): LedgerPosition {
  const type = row.type === "SELL" ? "SELL" : "BUY";
  const qty = Math.abs(Number(row.qty) || 0);
  const avg = Number(row.avg) || 0;
  return {
    id: String(row.id || ""),
    symbol: String(row.symbol || ""),
    product: String(row.product || "MIS").toUpperCase(),
    type,
    buyQty: type === "BUY" ? qty : 0,
    buyPrice: type === "BUY" ? avg : 0,
    sellQty: type === "SELL" ? qty : 0,
    sellPrice: type === "SELL" ? avg : 0,
    netQty: type === "SELL" ? -qty : qty,
    ltp: Number(row.ltp) || avg,
    realized: 0,
    mtm: Number(row.pnl) || 0,
    paper: row.brokerId === "paper",
    segment: /BTC|ETH|USDT|USDC|CRYPTO|BINANCE|DOGE|SOL/i.test(String(row.symbol || "")) ? "crypto" : "indian",
    strategy: String(row.strategy || ""),
    closed: false,
  };
}

function asClosedLiveLedgerPosition(row: {
  id: string;
  symbol: string;
  side?: "BUY" | "SELL";
  type?: "BUY" | "SELL";
  qty: number;
  entry: number;
  exit: number;
  pnl: number;
  product?: string;
  strategy?: string;
  brokerId?: string;
  paper?: boolean;
}): LedgerPosition {
  const type = String(row.type || row.side || "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY";
  const qty = Math.abs(Number(row.qty) || 0);
  const entry = Number(row.entry) || 0;
  const exit = Number(row.exit) || entry;
  const pnl = Number(row.pnl) || 0;
  return {
    id: String(row.id || ""),
    symbol: String(row.symbol || ""),
    product: String(row.product || "MIS").toUpperCase(),
    type,
    buyQty: qty,
    buyPrice: type === "BUY" ? entry : exit,
    sellQty: qty,
    sellPrice: type === "BUY" ? exit : entry,
    netQty: 0,
    ltp: exit,
    realized: pnl,
    mtm: pnl,
    paper: Boolean(row.paper || row.brokerId === "paper"),
    segment: /BTC|ETH|USDT|USDC|CRYPTO|BINANCE|DOGE|SOL/i.test(String(row.symbol || "")) ? "crypto" : "indian",
    strategy: String(row.strategy || ""),
    closed: true,
  };
}

export function PositionsDesk() {
  const { data, refresh, closePosition } = useMarket();
  const [desk, setDesk] = useState<PositionsDeskSnapshot>(emptyDesk);
  const [mode, setMode] = useState<ModeFilter>("all");
  const [segment, setSegment] = useState<SegmentFilter>("all");
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  const loadDesk = useCallback(async () => {
    try {
      const next = await getPositionsDesk();
      setDesk(next);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load position ledgers");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void loadDesk();
  }, [loadDesk]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void loadDesk();
    }, 4000);
    return () => window.clearInterval(id);
  }, [loadDesk]);

  const onRefresh = async () => {
    setLoading(true);
    try {
      await refresh();
      await loadDesk();
    } finally {
      setLoading(false);
    }
  };

  const liveMaster = useMemo(() => (data.positions || []).map(asLiveLedgerPosition), [data.positions]);
  const liveClosed = useMemo(
    () => (data.closedTrades || []).map(asClosedLiveLedgerPosition),
    [data.closedTrades],
  );

  const ledgers = useMemo(() => {
    const rows: Array<{ ledger: PositionLedger; positions: LedgerPosition[]; mtm: number; realized: number; unrealized: number }> = [];
    const useBrokerMtm = Number.isFinite(desk.master.brokerMtm);
    const closedById = new Map<string, LedgerPosition>();
    const closedSource = useBrokerMtm
      ? (desk.master.positions || []).filter(isClosedLedger)
      : [...(desk.master.positions || []).filter(isClosedLedger), ...liveClosed];
    for (const row of closedSource) {
      closedById.set(row.id, row);
    }
    const closedMaster = [...closedById.values()];
    const deskOpen = (desk.master.positions || []).filter((row) => !isClosedLedger(row));
    const openMaster = liveMaster.length ? liveMaster : deskOpen;
    const masterPositions = [...openMaster, ...closedMaster];
    const localMtm = masterPositions.reduce((sum, row) => sum + Number(row.mtm || 0), 0);
    const localRealized = closedMaster.reduce((sum, row) => sum + Number(row.realized || row.mtm || 0), 0);
    const brokerReady = Number.isFinite(desk.master.brokerMtm);
    const masterLedger: PositionLedger = {
      ...desk.master,
      positions: masterPositions,
      mtm: brokerReady ? Number(desk.master.brokerMtm) : localMtm,
      realized: brokerReady ? Number(desk.master.realized || 0) : localRealized,
      unrealized: brokerReady ? Number(desk.master.unrealized || 0) : localMtm - localRealized,
      open: openMaster.length,
      tradeMode: [...openMaster, ...closedMaster].some((row) => !row.paper) ? "real" : desk.master.tradeMode,
    };
    const books = [masterLedger, ...(desk.clients || [])].filter((item) => showLedger(item, mode));
    for (const ledger of books) {
      const positions = filterRows(ledger, mode, segment);
      const summed = positions.reduce((sum, row) => sum + Number(row.mtm || 0), 0);
      const useBook = Number.isFinite(ledger.brokerMtm) && mode !== "paper" && segment === "all";
      const realized = useBook
        ? Number(ledger.realized || 0)
        : positions.filter(isClosedLedger).reduce((sum, row) => sum + Number(row.realized || row.mtm || 0), 0);
      const unrealized = useBook
        ? Number(ledger.unrealized ?? Number(ledger.brokerMtm) - realized)
        : positions.filter((row) => !isClosedLedger(row)).reduce((sum, row) => sum + Number(row.mtm || 0), 0);
      rows.push({
        ledger,
        positions,
        mtm: useBook ? Number(ledger.brokerMtm) : summed,
        realized,
        unrealized,
      });
    }
    return rows;
  }, [desk, mode, segment, liveMaster, liveClosed]);

  const masterBlock = ledgers.find((row) => row.ledger.kind === "master");
  const clientBlocks = ledgers.filter((row) => row.ledger.kind === "client");
  const adminMtm = Number.isFinite(desk.master.brokerMtm) ? Number(desk.master.unrealized || 0) : masterBlock?.unrealized || 0;
  const adminPnl = Number.isFinite(desk.master.brokerMtm) ? Number(desk.master.realized || 0) : masterBlock?.realized || 0;
  const clientMtm = clientBlocks.reduce((sum, row) => sum + row.unrealized, 0);
  const clientPnl = clientBlocks.reduce((sum, row) => sum + row.realized, 0);
  const exitIds = (masterBlock?.positions || []).filter((row) => !isClosedLedger(row)).map((row) => row.id).filter(Boolean);

  const close = async (id: string, symbol: string) => {
    if (!window.confirm(`Square off ${symbol} at LTP?`)) return;
    setBusy(id);
    try {
      await closePosition(id);
      await loadDesk();
    } finally {
      setBusy("");
    }
  };

  const exitAll = async () => {
    if (!exitIds.length) return;
    if (!window.confirm(`Exit all ${exitIds.length} open master position${exitIds.length === 1 ? "" : "s"} at LTP?`)) return;
    setBusy("all");
    try {
      for (const id of exitIds) {
        await closePosition(id);
      }
      await loadDesk();
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Position</h1>
          <p className="text-sm text-slate-400">Portfolio, master book, and a live ledger for every client</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <ChipGroup>
            <Chip label="All modes" on={mode === "all"} onClick={() => setMode("all")} />
            <Chip label="Paper" on={mode === "paper"} onClick={() => setMode("paper")} />
            <Chip label="Real" on={mode === "real"} onClick={() => setMode("real")} />
          </ChipGroup>
          <ChipGroup>
            <Chip label="All" on={segment === "all"} onClick={() => setSegment("all")} />
            <Chip label="Indian" on={segment === "indian"} onClick={() => setSegment("indian")} />
            <Chip label="Crypto" on={segment === "crypto"} onClick={() => setSegment("crypto")} />
          </ChipGroup>
          <button
            type="button"
            onClick={() => void onRefresh()}
            disabled={loading}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 text-xs font-semibold disabled:opacity-60"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void exitAll()}
            disabled={!exitIds.length || busy === "all"}
            className="inline-flex h-9 items-center rounded-full border border-[var(--border)] bg-[var(--card)] px-3 text-xs font-semibold disabled:opacity-50"
          >
            {busy === "all" ? "Exiting..." : "Exit all"}
          </button>
        </div>
      </div>

      <PortfolioSummary />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<TrendingUp size={18} />} label="Admin MTM" value={rupee(adminMtm)} tone={moneyClass(adminMtm)} />
        <StatCard icon={<Wallet size={18} />} label="Admin P&L" value={rupee(adminPnl)} tone={moneyClass(adminPnl)} />
        <StatCard icon={<UserRound size={18} />} label="Client MTM" value={rupee(clientMtm)} tone={moneyClass(clientMtm)} />
        <StatCard icon={<Activity size={18} />} label="Client P&L" value={rupee(clientPnl)} tone={moneyClass(clientPnl)} />
      </div>

      {error ? <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-down dark:bg-rose-950/40">{error}</div> : null}

      {!ready && !liveMaster.length ? (
        <div className="card px-4 py-8 text-center text-sm text-slate-400">Loading client books…</div>
      ) : null}

      {ledgers.map(({ ledger, positions, mtm, realized, unrealized }) => (
        <LedgerCard
          key={ledger.id}
          ledger={ledger}
          positions={positions}
          mtm={unrealized}
          pnl={realized}
          net={mtm}
          busy={busy}
          onExit={ledger.kind === "master" ? close : undefined}
        />
      ))}
    </div>
  );
}

function ChipGroup({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-1.5">{children}</div>;
}

function Chip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-9 rounded-full px-3 text-xs font-semibold",
        on
          ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950"
          : "border border-[var(--border)] bg-[var(--card)] text-slate-500",
      )}
    >
      {label}
    </button>
  );
}

function StatCard({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone?: string }) {
  return (
    <div className="card p-4">
      <div className="text-slate-400">{icon}</div>
      <div className="mt-6 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className={cn("mt-2 text-2xl font-bold", tone)}>{value}</div>
    </div>
  );
}

function LedgerCard({
  ledger,
  positions,
  mtm,
  pnl,
  net,
  busy,
  onExit,
}: {
  ledger: PositionLedger;
  positions: LedgerPosition[];
  mtm: number;
  pnl: number;
  net: number;
  busy: string;
  onExit?: (id: string, symbol: string) => void;
}) {
  const initial = (ledger.title || "?").trim().charAt(0).toUpperCase();
  const openRows = positions.filter((row) => !isClosedLedger(row));
  const closedRows = positions.filter(isClosedLedger);
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--bg)] text-slate-500">
            {ledger.kind === "master" ? <Crown size={16} /> : <span className="text-sm font-bold">{initial}</span>}
          </div>
          <div>
            <div className="text-sm font-bold">{ledger.title}</div>
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{ledger.subtitle}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">MTM</div>
          <div className={cn("text-lg font-bold", moneyClass(mtm))}>{rupee(mtm)}</div>
          <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">P&L</div>
          <div className={cn("text-lg font-bold", moneyClass(pnl))}>{rupee(pnl)}</div>
          <div className="mt-1 text-[11px] text-slate-400">
            Net {rupee(net)} · {openRows.length} open{closedRows.length ? ` · ${closedRows.length} closed` : ""}
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] text-left text-sm">
          <thead className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
            <tr>
              <th className="px-4 py-3">Symbol</th>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3 text-right">Buy qty</th>
              <th className="px-4 py-3 text-right">Buy price</th>
              <th className="px-4 py-3 text-right">Sell qty</th>
              <th className="px-4 py-3 text-right">Sell price</th>
              <th className="px-4 py-3 text-right">Net qty</th>
              <th className="px-4 py-3 text-right">LTP</th>
              <th className="px-4 py-3 text-right">Realized</th>
              <th className="px-4 py-3 text-right">MTM</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {positions.length ? (
              positions.map((row) => (
                <tr key={row.id} className="soft-row">
                  <td className="px-4 py-3 font-semibold">{row.symbol}</td>
                  <td className="px-4 py-3 text-slate-500">{row.product}</td>
                  <td className="px-4 py-3 text-right">{row.buyQty || "—"}</td>
                  <td className="px-4 py-3 text-right">{row.buyQty ? formatNumber(row.buyPrice) : "—"}</td>
                  <td className="px-4 py-3 text-right">{row.sellQty || "—"}</td>
                  <td className="px-4 py-3 text-right">{row.sellQty ? formatNumber(row.sellPrice) : "—"}</td>
                  <td className="px-4 py-3 text-right font-semibold">{row.netQty}</td>
                  <td className="px-4 py-3 text-right">{formatNumber(row.ltp)}</td>
                  <td className={cn("px-4 py-3 text-right", moneyClass(row.realized))}>{rupee(row.realized)}</td>
                  <td className={cn("px-4 py-3 text-right font-semibold", moneyClass(row.mtm))}>{rupee(row.mtm)}</td>
                  <td className="px-4 py-3 text-right">
                    {onExit && !isClosedLedger(row) ? (
                      <button
                        type="button"
                        disabled={busy === row.id || busy === "all"}
                        onClick={() => onExit(row.id, row.symbol)}
                        className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                      >
                        {busy === row.id ? "..." : "Exit"}
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">{isClosedLedger(row) ? "Closed" : "—"}</span>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={11} className="px-4 py-12 text-center text-sm text-slate-400">
                  <div className="inline-flex flex-col items-center gap-2">
                    <Inbox size={22} />
                    No records found
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
