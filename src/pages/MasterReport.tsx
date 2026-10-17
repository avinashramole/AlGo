import { useEffect, useMemo, useState } from "react";
import {
  downloadMasterReport,
  getMasterReportPeople,
  MASTER_MONTH_PRESETS,
  type MasterReportPerson,
} from "../api/client";
import { ReportsBookTabs } from "../components/desk/ReportsBookTabs";
import { showDeskToast } from "../lib/deskToast";
import { formatMobile } from "../lib/format";
import { isNativeHybrid } from "../lib/hybrid";
import { catchDeskError } from "../lib/liveSite";

export function MasterReportPage() {
  return (
    <div className="space-y-2" data-master-report-page="true">
      <ReportsBookTabs active="master" />
      <MasterReport />
    </div>
  );
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function localYmd(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function shiftMonthsYmd(months: number, date = new Date()) {
  const next = new Date(date);
  next.setMonth(next.getMonth() - months);
  return localYmd(next);
}

export function MasterReport() {
  const [admin, setAdmin] = useState<MasterReportPerson | null>(null);
  const [users, setUsers] = useState<MasterReportPerson[]>([]);
  const [includeAdmin, setIncludeAdmin] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [range, setRange] = useState<"custom" | "months">("months");
  const [months, setMonths] = useState(1);
  const [from, setFrom] = useState(shiftMonthsYmd(1));
  const [to, setTo] = useState(localYmd());
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const nativePdf = isNativeHybrid();

  useEffect(() => {
    let alive = true;
    void getMasterReportPeople()
      .then((row) => {
        if (!alive) return;
        setAdmin(row.admin);
        setUsers(row.users || []);
        setPicked((row.users || []).map((item) => item.id));
      })
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Could not load accounts");
      });
    return () => {
      alive = false;
    };
  }, []);

  const applyMonths = (span: number) => {
    setRange("months");
    setMonths(span);
    setFrom(shiftMonthsYmd(span));
    setTo(localYmd());
  };

  const selected = useMemo(() => {
    const count = (includeAdmin ? 1 : 0) + picked.length;
    return count;
  }, [includeAdmin, picked]);

  const toggleUser = (id: string) => {
    setPicked((ids) => (ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]));
  };

  const download = (mode?: "download" | "share") => {
    if (!selected) {
      setError("Select admin or at least one user.");
      return;
    }
    setBusy(mode || "download");
    setError("");
    void downloadMasterReport(
      {
        includeAdmin,
        userIds: picked,
        range,
        months,
        from,
        to,
      },
      "pdf",
      mode,
    )
      .catch((err) => {
        setError(catchDeskError(err, "Could not download the master report"));
        showDeskToast(catchDeskError(err, "Could not download the master report"));
      })
      .finally(() => setBusy(""));
  };

  return (
    <div className="space-y-3" data-master-report="true">
      <section className="card p-4">
        <div className="text-sm font-bold">Master report</div>
        <p className="mt-1 text-xs text-slate-400">
          Custom dates or 1 / 3 / 6 / 12 months. Pick admin and how many users to include. One PDF.
        </p>
        <div className="mt-3 flex flex-wrap gap-2" data-master-range="true">
          {MASTER_MONTH_PRESETS.map((span) => (
            <button
              key={span}
              type="button"
              onClick={() => applyMonths(span)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                range === "months" && months === span
                  ? "border-brand-500 bg-brand-500 text-white"
                  : "border-[var(--border)]"
              }`}
            >
              {span} month{span === 1 ? "" : "s"}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setRange("custom")}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              range === "custom" ? "border-brand-500 bg-brand-500 text-white" : "border-[var(--border)]"
            }`}
          >
            Custom date
          </button>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="block text-xs font-semibold">
            From
            <input
              type="date"
              className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm font-normal"
              value={from}
              onChange={(event) => {
                setRange("custom");
                setFrom(event.target.value);
              }}
            />
          </label>
          <label className="block text-xs font-semibold">
            To
            <input
              type="date"
              className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm font-normal"
              value={to}
              onChange={(event) => {
                setRange("custom");
                setTo(event.target.value);
              }}
            />
          </label>
        </div>
      </section>

      <section className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-bold">Accounts in this PDF</div>
          <div className="text-xs font-semibold text-slate-400">{selected} selected</div>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm font-semibold" data-master-admin="true">
          <input type="checkbox" checked={includeAdmin} onChange={(event) => setIncludeAdmin(event.target.checked)} />
          Admin {admin ? `· ${admin.name}` : ""}
        </label>
        {admin ? (
          <p className="ml-6 text-xs text-slate-400">
            {admin.email || "—"} · {formatMobile(admin.mobile)}
          </p>
        ) : null}
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="text-xs font-bold uppercase text-slate-400">Users</div>
          <button
            type="button"
            className="text-xs font-semibold text-brand-500"
            onClick={() => setPicked(picked.length === users.length ? [] : users.map((row) => row.id))}
          >
            {picked.length === users.length && users.length ? "Clear users" : "Select all users"}
          </button>
        </div>
        <div className="mt-2 max-h-64 space-y-2 overflow-y-auto">
          {users.map((row) => (
            <label key={row.id} className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={picked.includes(row.id)} onChange={() => toggleUser(row.id)} />
              <span>
                <span className="font-semibold">{row.name}</span>
                <span className="block text-xs text-slate-400">
                  {row.email || "—"} · {formatMobile(row.mobile)}
                </span>
              </span>
            </label>
          ))}
          {!users.length ? <p className="text-xs text-slate-400">No users yet.</p> : null}
        </div>
      </section>

      {error ? <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-down">{error}</div> : null}

      <div className="flex flex-wrap items-center gap-3">
        {nativePdf ? (
          <>
            <button
              type="button"
              data-master-download="pdf"
              disabled={Boolean(busy) || !selected}
              onClick={() => download("download")}
              className="h-10 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy === "download" ? "Preparing..." : `Download ${selected} in one PDF`}
            </button>
            <button
              type="button"
              data-master-share="pdf"
              disabled={Boolean(busy) || !selected}
              onClick={() => download("share")}
              className="h-10 rounded-xl border border-brand-500 px-4 text-sm font-semibold text-brand-500 disabled:opacity-50"
            >
              {busy === "share" ? "Preparing..." : "Share PDF"}
            </button>
          </>
        ) : (
          <button
            type="button"
            data-master-download="pdf"
            disabled={Boolean(busy) || !selected}
            onClick={() => download()}
            className="h-10 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Preparing..." : `Download ${selected} account${selected === 1 ? "" : "s"} in one PDF`}
          </button>
        )}
      </div>
    </div>
  );
}
