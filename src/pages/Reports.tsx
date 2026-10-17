import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SideBadge } from "../components/desk/Badges";
import { downloadDeskReport, getPositionsDesk, type PositionLedger } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useMarket } from "../context/MarketContext";
import { brokerName } from "../lib/brokers";
import { showDeskToast } from "../lib/deskToast";
import { isNativeHybrid } from "../lib/hybrid";
import { catchDeskError } from "../lib/liveSite";
import { displayOrderReason, isEntryWhy, isExitHitReason } from "../lib/exitReason";
import { cn, formatInr, formatIst, formatMobile, formatNumber, hasDhanQuotes, liveBookCopy, deskStrategyName, whyColClass } from "../lib/format";
import { liveDailyPnl } from "../lib/dailyPnl";
import { isLiveBrokerTrade } from "../lib/paperBook";

export function Reports({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth();
  const { data } = useMarket();
  const navigate = useNavigate();
  const report = data.report;
  const daily = liveDailyPnl(report?.daily, report?.tradeBook);
  const [ledgers, setLedgers] = useState<PositionLedger[]>([]);

  useEffect(() => {
    let alive = true;
    const load = () => {
      void getPositionsDesk()
        .then((desk) => {
          if (!alive) return;
          setLedgers([desk.master, ...(desk.clients || [])].filter(Boolean));
        })
        .catch(() => undefined);
    };
    load();
    const id = window.setInterval(load, 4000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const download = (format: "pdf" | "xlsx", mode?: "download" | "share") => {
    void downloadDeskReport(format, mode).catch((error) => {
      showDeskToast(catchDeskError(error, "Could not download the branded proposal report"));
    });
  };
  const nativePdf = isNativeHybrid();

  if (!report) {
    return (
      <div className="card p-8 text-center">
        <div className="text-base font-bold">Report is loading</div>
        <p className="mt-1 text-sm text-slate-400">Connect the API to see P&L, trade book, and strategy contribution.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        {embedded ? null : (
        <div>
          <h1 className="text-xl font-bold">Reports</h1>
          <p className="text-sm text-slate-400">
            {liveBookCopy(data.dhanFeed?.live, hasDhanQuotes(data))}
          </p>
        </div>
        )}
        <div className="flex items-center gap-3">
          {nativePdf ? (
            <>
              <button
                type="button"
                data-report-download="pdf"
                onClick={() => download("pdf", "download")}
                className="h-10 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white"
              >
                Download
              </button>
              <button
                type="button"
                data-report-share="pdf"
                onClick={() => download("pdf", "share")}
                className="h-10 rounded-xl border border-brand-500 px-4 text-sm font-semibold text-brand-500"
              >
                Share
              </button>
            </>
          ) : (
            <button
              type="button"
              data-report-download="pdf"
              onClick={() => download("pdf")}
              className="h-10 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white"
            >
              Download PDF
            </button>
          )}
          <button
            type="button"
            data-report-download="xlsx"
            onClick={() => download("xlsx")}
            className="h-10 rounded-xl border border-brand-500 px-4 text-sm font-semibold text-brand-500"
          >
            Download Excel
          </button>
          <button
            type="button"
            data-master-report-menu="true"
            onClick={() => navigate("/master-report")}
            className="h-10 rounded-xl border border-[var(--border)] px-4 text-sm font-semibold"
          >
            Master report
          </button>
        </div>
      </div>
      <section className="card overflow-x-auto p-0" data-profit-people="true">
        <div className="px-4 pt-4 text-sm font-bold">Profit</div>
        <table className="mt-2 w-full min-w-[720px] text-left text-sm">
          <thead className="bg-[var(--bg)] text-[11px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Mobile</th>
              <th className="px-4 py-3 font-semibold">Broker</th>
              <th className="px-4 py-3 font-semibold">Position</th>
            </tr>
          </thead>
          <tbody>
            {(ledgers.length ? ledgers : [
              {
                id: "self",
                name: user?.name || "Admin",
                email: user?.email || "",
                mobile: user?.mobile || "",
                brokerName: brokerName(data.brokers, data.activeBrokerId),
                position: user?.role === "user" ? "User" : "Admin",
              } as PositionLedger,
            ]).map((row) => (
              <tr key={row.id} className="soft-row">
                <td className="px-4 py-3 font-semibold">{row.name || row.title}</td>
                <td className="px-4 py-3">{row.email || "—"}</td>
                <td className="px-4 py-3">{formatMobile(row.mobile)}</td>
                <td className="px-4 py-3">{row.brokerName || "—"}</td>
                <td className="px-4 py-3 font-bold uppercase tracking-wide">
                  {row.position || (row.kind === "master" ? "Admin" : "User")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="card p-4" data-daily-pnl="true">
        <div className="mb-1 text-sm font-bold">Daily P&L</div>
        <div className="mb-2 text-xs text-slate-400">Last 5 trading days</div>
        <div className="space-y-2">
          {daily.map((row) => (
            <div key={row.date} className="flex justify-between text-sm">
              <span className="font-semibold">
                {row.date}
                {row.trades ? ` · ${row.trades} trades` : ""}
              </span>
              <span className={row.pnl >= 0 ? "text-up" : "text-down"}>{formatInr(row.pnl)}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="card overflow-x-auto">
        <div className="px-4 pt-4 text-sm font-bold">Trade book</div>
        <p className="px-4 pt-1 text-xs text-slate-400">Admin and user closed trades. Trade logs clear daily at 8:00 AM IST.</p>
        <table className="mt-2 w-full min-w-[860px] text-left text-sm">
          <thead className="bg-[var(--bg)] text-[11px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3 font-semibold">Closed</th>
              <th className="px-4 py-3 font-semibold">Symbol</th>
              <th className="px-4 py-3 font-semibold">Side</th>
              <th className="px-4 py-3 text-right font-semibold">Qty</th>
              <th className="px-4 py-3 text-right font-semibold">Entry</th>
              <th className="px-4 py-3 text-right font-semibold">Exit</th>
              <th className="px-4 py-3 text-right font-semibold">P&L</th>
              <th className="px-4 py-3 font-semibold">Strategy</th>
              <th className={cn("px-4 py-3 font-semibold", whyColClass)}>Why</th>
              <th className="px-4 py-3 font-semibold">Broker</th>
            </tr>
          </thead>
          <tbody>
            {(report.tradeBook || []).filter((row) => isLiveBrokerTrade(row)).map((row) => (
              <tr key={row.id} className="soft-row">
                <td className="px-4 py-3 text-xs text-slate-500">{formatIst(row.closedAt)}</td>
                <td className="px-4 py-3 font-semibold">{row.symbol}</td>
                <td className="px-4 py-3">
                  <SideBadge side={row.side} />
                </td>
                <td className="px-4 py-3 text-right">{row.qty}</td>
                <td className="px-4 py-3 text-right">{formatNumber(row.entry)}</td>
                <td className="px-4 py-3 text-right">{formatNumber(row.exit)}</td>
                <td className={cn("px-4 py-3 text-right font-semibold", row.pnl >= 0 ? "text-up" : "text-down")}>{formatInr(row.pnl)}</td>
                <td className="px-4 py-3 font-semibold">{deskStrategyName(row.strategy, data.algos) || "—"}</td>
                <td
                  className={cn(
                    "px-4 py-3 text-xs font-semibold",
                    whyColClass,
                    isExitHitReason(displayOrderReason(row))
                      ? "text-brand-500"
                      : isEntryWhy(displayOrderReason(row))
                        ? "text-up"
                        : "text-slate-500",
                  )}
                >
                  {displayOrderReason(row) || "—"}
                </td>
                <td className="px-4 py-3">{brokerName(data.brokers, row.brokerId)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
