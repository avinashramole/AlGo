import { useEffect, useMemo, useState } from "react";
import { getMemberDesk, type DeskOrder, type MemberDesk, type MemberPosition } from "../api/client";
import { EmptyState, FilterChips, Money, PhoneCard, Segmented, StatusPill } from "../components/phone/PhoneUi";
import { cn, formatInr, formatIst, formatNumber, formatRupee } from "../lib/format";

type View = "positions" | "orders" | "reports";
type PositionTab = "open" | "closed";
type OrderTab = "all" | "pending" | "completed" | "rejected";

export function MemberOrders() {
  return <MemberBook view="orders" />;
}

export function MemberPositions() {
  return <MemberBook view="positions" />;
}

export function MemberReports() {
  return <MemberBook view="reports" />;
}

function MemberBook({ view }: { view: View }) {
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

  const positions = desk?.positions || [];
  const closed = desk?.report?.tradeBook || [];
  const orders = useMemo(() => uniqueOrders([...(desk?.orders || []), ...(desk?.orderHistory || [])]), [desk]);
  const report = desk?.report;
  const openPnl = positions.reduce((sum, row) => sum + Number(row.pnl || 0), 0);
  const yesterday = (report?.daily || []).slice(-2, -1)[0]?.pnl || 0;

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
        <div className="grid grid-cols-2 gap-2">
          <div className="card p-3">
            <div className="text-[11px] font-semibold text-slate-400">Total P&L</div>
            <Money value={positionTab === "open" ? openPnl : report?.realizedPnl || 0} className="mt-1 block text-lg" />
          </div>
          <div className="card p-3">
            <div className="text-[11px] font-semibold text-slate-400">Yesterday's P&L</div>
            <Money value={yesterday} className="mt-1 block text-lg" />
          </div>
        </div>
        {positionTab === "open" ? (
          positions.length ? (
            <div className="space-y-2">
              {positions.map((row) => (
                <PositionCard key={row.id} row={row} />
              ))}
            </div>
          ) : (
            <EmptyState title="No open positions" text="Copied live trades will show here." />
          )
        ) : closed.length ? (
          <div className="space-y-2">
            {closed.map((row) => (
              <PhoneCard key={row.id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold">{row.symbol}</div>
                    <div className="mt-0.5 text-[11px] text-slate-400">
                      {row.side} · {row.qty} · {formatNumber(row.entry)} → {formatNumber(row.exit)}
                    </div>
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
          <EmptyState title="No orders" text="Copied broker orders will appear in this book." />
        )}
      </div>
    );
  }

  const maxDaily = Math.max(1, ...(report?.daily || []).map((row) => Math.abs(row.pnl)));
  return (
    <div className="space-y-3" data-member-book="reports">
      <div className="grid grid-cols-3 gap-2">
        <div className="card p-3 text-center">
          <div className="text-xl font-extrabold">{report?.trades || 0}</div>
          <div className="text-[11px] text-slate-400">Total trades</div>
        </div>
        <div className="card p-3 text-center">
          <div className="text-xl font-extrabold">{report?.winRate || 0}%</div>
          <div className="text-[11px] text-slate-400">Win rate</div>
        </div>
        <div className="card p-3 text-center">
          <Money value={report?.netPnl || 0} className="block text-lg" />
          <div className="text-[11px] text-slate-400">Net P&L</div>
        </div>
      </div>
      <PhoneCard className="p-4">
        <div className="mb-3 text-sm font-bold">P&L history</div>
        <div className="flex h-28 items-end gap-1">
          {(report?.daily || []).slice(-14).map((row) => (
            <div key={row.date} className="flex h-full flex-1 flex-col justify-end" title={`${row.date} ${formatInr(row.pnl)}`}>
              <div
                className={cn("w-full rounded-sm", row.pnl >= 0 ? "bg-up" : "bg-down")}
                style={{ height: `${Math.max(8, (Math.abs(row.pnl) / maxDaily) * 100)}%` }}
              />
            </div>
          ))}
          {!(report?.daily || []).length ? <p className="text-xs text-slate-400">No daily P&L yet.</p> : null}
        </div>
      </PhoneCard>
      <div className="grid grid-cols-2 gap-2">
        <div className="card p-3">
          <div className="text-[11px] text-slate-400">Gross profit</div>
          <div className="mt-1 text-sm font-extrabold text-up">{formatRupee(Math.max(0, report?.grossPnl || 0))}</div>
        </div>
        <div className="card p-3">
          <div className="text-[11px] text-slate-400">Gross loss</div>
          <div className="mt-1 text-sm font-extrabold text-down">{formatRupee(Math.min(0, report?.realizedPnl || 0))}</div>
        </div>
      </div>
    </div>
  );
}

function PositionCard({ row }: { row: MemberPosition }) {
  return (
    <PhoneCard className="p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-bold">{row.symbol}</div>
          <div className="mt-0.5 text-[11px] text-slate-400">
            {row.type} · {row.qty} qty · LTP {formatNumber(row.ltp)}
          </div>
          {row.strategy ? <div className="mt-1 text-[11px] text-slate-400">{row.strategy}</div> : null}
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
    <PhoneCard className="p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-bold">{row.symbol}</div>
          <div className="mt-0.5 text-[11px] font-semibold text-slate-500">
            {row.side} {row.qty} @ {formatNumber(row.price)}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">{row.createdAt ? formatIst(row.createdAt) : ""}</div>
          {row.reason ? <div className="mt-1 text-[11px] text-down">Reason: {row.reason}</div> : null}
        </div>
        <StatusPill label={status || "ORDER"} tone={tone} />
      </div>
    </PhoneCard>
  );
}

function uniqueOrders(rows: DeskOrder[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (!row?.id || seen.has(row.id)) return false;
    seen.add(row.id);
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
