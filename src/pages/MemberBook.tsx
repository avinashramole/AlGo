import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { downloadMemberReport, getMemberDesk, type DeskOrder, type MemberDesk, type MemberPosition } from "../api/client";
import { catchDeskError } from "../lib/liveSite";
import { EmptyState, FilterChips, Money, PhoneCard, Segmented, StatusPill } from "../components/phone/PhoneUi";
import { displayOrderReason, isExitHitReason } from "../lib/exitReason";
import { cn, formatIst, formatNumber } from "../lib/format";
import { liveDailyPnl } from "../lib/dailyPnl";
import { hasPaperActivity, isLiveBrokerTrade, memberIsPaperTrade } from "../lib/paperBook";

type View = "positions" | "orders" | "reports" | "paper";
type PositionTab = "open" | "closed";
type OrderTab = "all" | "pending" | "completed" | "rejected";

export function MemberOrders() {
  return (
    <div className="space-y-2" data-member-orders-page="true">
      <h1 className="text-lg font-bold">Orders</h1>
      <MemberBook view="orders" />
    </div>
  );
}

export function MemberPositions() {
  const [params, setParams] = useSearchParams();
  const [showPaper, setShowPaper] = useState(() => params.get("tab") === "paper");
  const paper = showPaper && params.get("tab") === "paper";
  const onDesk = useCallback((next: MemberDesk | null) => {
    setShowPaper(Boolean(next && hasPaperActivity({
      orders: [...(next.orders || []), ...(next.orderHistory || [])],
      positions: next.positions,
      closedTrades: next.report?.tradeBook,
      tradeMode: next.tradeMode,
      brokerId: next.brokerId,
    })));
  }, []);
  const downloadPdf = () => {
    void downloadMemberReport("pdf").catch((error) => {
      window.alert(catchDeskError(error, "Could not download your trade report"));
    });
  };
  return (
    <div className="space-y-2" data-member-positions-page="true">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-bold">{paper ? "Paper" : "Position"}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {showPaper ? (
            <button
              type="button"
              data-paper-tab="true"
              onClick={() => setParams(paper ? {} : { tab: "paper" }, { replace: true })}
              className={cn(
                "h-10 rounded-xl px-4 text-sm font-semibold",
                paper ? "bg-white text-[#0f2744] shadow-sm" : "text-slate-400",
              )}
            >
              Paper
            </button>
          ) : null}
          {paper ? null : (
            <button
              type="button"
              data-member-report-download="pdf"
              onClick={downloadPdf}
              className="h-10 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white"
            >
              Download PDF
            </button>
          )}
        </div>
      </div>
      <MemberBook view={paper ? "paper" : "positions"} onDesk={onDesk} />
    </div>
  );
}

export function MemberReports() {
  const [params] = useSearchParams();
  const tab = params.get("tab");
  if (tab === "orders") return <Navigate to="/orders" replace />;
  if (tab === "paper") return <Navigate to="/positions?tab=paper" replace />;
  return <Navigate to="/positions" replace />;
}

function MemberBook({ view, onDesk }: { view: View; onDesk?: (desk: MemberDesk | null) => void }) {
  const [desk, setDesk] = useState<MemberDesk | null>(null);
  const [query, setQuery] = useState("");
  const [positionTab, setPositionTab] = useState<PositionTab>("open");
  const [orderTab, setOrderTab] = useState<OrderTab>("all");

  useEffect(() => {
    let alive = true;
    const load = () => {
      void getMemberDesk()
        .then((next) => {
          if (alive) setDesk(next);
        })
        .catch(() => undefined);
    };
    load();
    const id = window.setInterval(load, 3000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    onDesk?.(desk);
  }, [desk, onDesk]);

  const allOrders = useMemo(() => uniqueOrders([...(desk?.orders || []), ...(desk?.orderHistory || [])]), [desk]);
  const paper = view === "paper";
  const keep = (row: { paper?: boolean; brokerId?: string; sim?: boolean; live?: boolean }) =>
    paper ? memberIsPaperTrade(row, desk) : isLiveBrokerTrade(row) && !memberIsPaperTrade(row, desk);
  const positions = (desk?.positions || []).filter(keep);
  const closed = (desk?.report?.tradeBook || []).filter(keep);
  const orders = allOrders.filter(keep);
  const report = desk?.report;
  const daily = liveDailyPnl(report?.daily, closed);
  const openPnl = positions.reduce((sum, row) => sum + Number(row.pnl || 0), 0);
  const yesterday = daily.slice(-2, -1)[0]?.pnl || 0;

  if (view === "positions") {
    return (
      <div className="space-y-3" data-member-book="positions">
        <Segmented
          value={positionTab}
          onChange={setPositionTab}
          options={[
            { id: "open", label: `Open (${positions.length})` },
            { id: "closed", label: `Closed (${closed.length})` },
          ]}
          wide
        />
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Total P&L" value={<Money value={positionTab === "open" ? openPnl : report?.realizedPnl || 0} />} />
          <Stat label="Yesterday's P&L" value={<Money value={yesterday} />} />
        </div>
        {positionTab === "open" ? (
          positions.length ? (
            <div className="space-y-2">
              {positions.map((row) => (
                <PositionCard key={row.id} row={row} />
              ))}
            </div>
          ) : (
            <EmptyState title="No open positions" text="Live broker positions will show here." />
          )
        ) : closed.length ? (
          <div className="space-y-2">
            {closed.map((row) => (
              <PhoneCard key={row.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold">{row.symbol}</div>
                    <div className="mt-0.5 text-xs text-slate-400">
                      Buy {row.buyQty || row.qty || 0} @ {formatNumber(row.buyPrice || row.entry)} · Sell {row.sellQty || row.qty || 0} @ {formatNumber(row.sellPrice || row.exit)}
                    </div>
                    {row.product ? <div className="mt-0.5 text-xs text-slate-400">{row.product}</div> : null}
                    <BookMeta row={row} />
                  </div>
                  <Money value={row.pnl} className="text-sm" />
                </div>
              </PhoneCard>
            ))}
          </div>
        ) : (
          <EmptyState title="No closed trades" text="Today's squared-off book is empty." />
        )}
      </div>
    );
  }

  if (view === "orders") {
    const filtered = orders.filter((row) => matchesOrder(row, orderTab, query));
    return (
      <div className="space-y-3" data-member-book="orders">
        <label className="card flex h-11 items-center px-3">
          <input
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search symbol or order id"
          />
        </label>
        <FilterChips
          value={orderTab}
          onChange={setOrderTab}
          options={[
            { id: "all", label: "All" },
            { id: "pending", label: "Pending" },
            { id: "completed", label: "Completed" },
            { id: "rejected", label: "Rejected" },
          ]}
        />
        {filtered.length ? (
          <div className="space-y-2">
            {filtered.map((row) => (
              <OrderCard key={row.id} row={row} />
            ))}
          </div>
        ) : (
          <EmptyState title="No orders" text="Live broker orders will appear in this book." />
        )}
      </div>
    );
  }

  if (view === "paper") {
    const filtered = orders.filter((row) => matchesOrder(row, orderTab, query));
    return (
      <div className="space-y-3" data-member-book="paper" data-paper-book="true">
        <p className="text-sm text-slate-400">Virtual paper fills at the live LTP. These rows are not sent to the broker.</p>
        <Segmented
          value={positionTab}
          onChange={setPositionTab}
          options={[
            { id: "open", label: `Open (${positions.length})` },
            { id: "closed", label: `Closed (${closed.length})` },
          ]}
          wide
        />
        {positionTab === "open" ? (
          positions.length ? (
            <div className="space-y-2">
              {positions.map((row) => (
                <PositionCard key={row.id} row={row} />
              ))}
            </div>
          ) : (
            <EmptyState title="No paper positions" text="Start paper trading to see virtual positions here." />
          )
        ) : closed.length ? (
          <div className="space-y-2">
            {closed.map((row) => (
              <PhoneCard key={row.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold">{row.symbol}</div>
                    <div className="mt-0.5 text-xs text-slate-400">
                      Buy {row.buyQty || row.qty || 0} @ {formatNumber(row.buyPrice || row.entry)} · Sell {row.sellQty || row.qty || 0} @ {formatNumber(row.sellPrice || row.exit)}
                    </div>
                    <BookMeta row={row} />
                  </div>
                  <Money value={row.pnl} className="text-sm" />
                </div>
              </PhoneCard>
            ))}
          </div>
        ) : (
          <EmptyState title="No paper closes" text="Squared-off paper trades will show here." />
        )}
        <FilterChips
          value={orderTab}
          onChange={setOrderTab}
          options={[
            { id: "all", label: "All" },
            { id: "pending", label: "Pending" },
            { id: "completed", label: "Completed" },
            { id: "rejected", label: "Rejected" },
          ]}
        />
        {filtered.length ? (
          <div className="space-y-2">
            {filtered.map((row) => (
              <OrderCard key={row.id} row={row} />
            ))}
          </div>
        ) : (
          <EmptyState title="No paper orders" text="Paper trading orders will appear here." />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3" data-member-book="reports">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Realized P&L" value={<Money value={report?.realizedPnl || 0} />} />
        <Stat label="Unrealized MTM" value={<Money value={report?.unrealizedPnl || 0} />} />
        <Stat label="Net P&L" value={<Money value={report?.netPnl || 0} />} />
        <Stat label="Win rate" value={`${report?.winRate || 0}%`} />
      </div>
      <section className="card p-4">
        <div className="mb-1 text-sm font-bold">Daily P&L</div>
        <div className="mb-2 text-xs text-slate-400">Last 5 trading days</div>
        <div className="space-y-2">
          {daily.map((row) => (
            <div key={row.date} className="flex justify-between text-sm">
              <span className="font-semibold">{row.date}</span>
              <Money value={row.pnl} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function BookMeta({
  row,
}: {
  row: { strategy?: string; role?: string; reason?: string; exitReason?: string };
}) {
  const afterExit = displayOrderReason(row) || "—";
  return (
    <div className="mt-2 grid grid-cols-2 gap-2 text-xs" data-book-meta="strategy-exit">
      <div>
        <div className="uppercase tracking-wide text-slate-400">Strategy</div>
        <div className="font-semibold text-slate-600">{row.strategy || "—"}</div>
      </div>
      <div>
        <div className="uppercase tracking-wide text-slate-400">After exit</div>
        <div className={cn("font-semibold", isExitHitReason(afterExit) ? "text-brand-500" : afterExit === "—" ? "text-slate-500" : "text-down")}>
          {afterExit}
        </div>
      </div>
    </div>
  );
}

function PositionCard({ row }: { row: MemberPosition }) {
  return (
    <PhoneCard className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-bold">{row.symbol}</div>
          <div className="mt-0.5 text-xs text-slate-400">
            {row.type} · {row.qty} qty · Avg {formatNumber(row.avg)} · LTP {formatNumber(row.ltp)}
          </div>
          <BookMeta row={row} />
        </div>
        <Money value={row.pnl} className="text-sm" />
      </div>
    </PhoneCard>
  );
}

function OrderCard({ row }: { row: DeskOrder }) {
  const status = String(row.status || "").toUpperCase();
  const tone = /REJECT|FAIL/.test(status) ? "down" : /FILL|TRADE|COMPLETE/.test(status) ? "up" : /PEND|OPEN|PARTIAL|TRANSIT/.test(status) ? "paper" : "muted";
  return (
    <PhoneCard className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-bold">{row.symbol}</div>
          <div className="mt-0.5 text-xs font-semibold text-slate-500">
            {row.side} {row.qty} @ {formatNumber(row.price)}
          </div>
          <div className="mt-1 text-xs text-slate-400">{row.createdAt ? formatIst(row.createdAt) : ""}</div>
          <BookMeta row={row} />
        </div>
        <StatusPill label={status || "ORDER"} tone={tone} />
      </div>
    </PhoneCard>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="card p-4">
      <div className="text-[11px] font-semibold uppercase text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}

function uniqueOrders(rows: DeskOrder[]) {
  const seen = new Set<string>();
  const contracts = new Set<string>();
  return rows.filter((row) => {
    if (!row?.id || seen.has(row.id)) return false;
    seen.add(row.id);
    const pendingZero =
      /PEND|TRANSIT|OPEN/i.test(String(row.status || "")) &&
      !(Number(row.price) > 0) &&
      !row.live;
    if (pendingZero) {
      const key = `${String(row.symbol || "").toUpperCase()}|${row.side}|${row.qty}`;
      if (contracts.has(key)) return false;
      contracts.add(key);
    }
    return true;
  });
}

function matchesOrder(row: DeskOrder, tab: OrderTab, query: string) {
  const status = String(row.status || "").toUpperCase();
  const hay = `${row.symbol || ""} ${row.id || ""}`.toLowerCase();
  if (query.trim() && !hay.includes(query.trim().toLowerCase())) return false;
  if (tab === "pending") return /PEND|OPEN|PARTIAL|TRANSIT/.test(status);
  if (tab === "completed") return /FILL|TRADE|COMPLETE/.test(status);
  if (tab === "rejected") return /REJECT|FAIL|CANCEL/.test(status);
  return true;
}
