import { MessageSquare, Pencil, RefreshCw, Search, Trash2, Users as UsersIcon, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { deleteClient, listClients, saveClient, type ClientRow } from "../api/client";
import { cn, formatMobile, formatNumber } from "../lib/format";

type SizingKind = ClientRow["sizingKind"];
type TradeMode = ClientRow["tradeMode"];

export function Users() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [groups, setGroups] = useState<string[]>(["ALL"]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [savingId, setSavingId] = useState("");
  const [edit, setEdit] = useState<ClientRow | null>(null);
  const [groupFor, setGroupFor] = useState<ClientRow | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const result = await listClients();
      setClients(result.clients || []);
      setGroups(result.groups?.length ? result.groups : ["ALL"]);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load clients");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patchRow = async (id: string, payload: Parameters<typeof saveClient>[1]) => {
    setSavingId(id);
    setError("");
    try {
      const result = await saveClient(id, payload);
      setClients((current) => current.map((row) => (row.id === id ? result.client : row)));
      if (payload.group) {
        setGroups((current) => (current.includes(payload.group as string) ? current : [...current, String(payload.group)]));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save client");
      await load();
    } finally {
      setSavingId("");
    }
  };

  const onDelete = async (row: ClientRow) => {
    if (!window.confirm(`Delete ${row.name}? They will need to sign up again. This does not start LIVE trading.`)) return;
    setSavingId(row.id);
    setError("");
    try {
      await deleteClient(row.id);
      setClients((current) => current.filter((item) => item.id !== row.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete client");
    } finally {
      setSavingId("");
    }
  };

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return clients;
    return clients.filter((row) =>
      [row.name, row.email, row.mobile, row.brokerName, row.accountId, row.group, row.status].some((value) =>
        String(value || "").toLowerCase().includes(needle),
      ),
    );
  }, [clients, query]);

  const live = clients.filter((row) => row.status === "LIVE").length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">All clients</h1>
          <p className="text-sm text-slate-400">
            Member books, copy size, and WhatsApp / Telegram. REAL / LIVE here is this client only — it does not start Dhan LIVE on the desk.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--border)] px-3 text-sm font-semibold disabled:opacity-60"
        >
          <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Clients" value={clients.length} />
        <Stat label="LIVE books" value={live} />
        <Stat label="Paper only" value={clients.length - live} />
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
        <input
          className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] pl-9 pr-3 text-sm"
          placeholder="Search client, broker, account..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {error ? <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-down dark:bg-rose-950/40">{error}</div> : null}
      <section className="card overflow-x-auto p-0">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="border-b border-[var(--border)] text-[10px] font-bold uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Broker account</th>
              <th className="px-4 py-3">Order sizing</th>
              <th className="px-4 py-3">Mode</th>
              <th className="px-4 py-3">Copy</th>
              <th className="px-4 py-3">Static IP</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Margin</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const locked = savingId === row.id;
              return (
                <tr key={row.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-4 py-3 align-middle">
                    <div className="font-semibold">{row.name}</div>
                    <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{row.group || "ALL"}</div>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <BrokerCell row={row} />
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <div className="flex items-center gap-1.5">
                      <select
                        className="h-8 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-[11px] font-semibold"
                        value={row.sizingKind}
                        disabled={locked}
                        onChange={(event) => void patchRow(row.id, { sizingKind: event.target.value as SizingKind })}
                      >
                        <option value="multiplier">Multiplier</option>
                        <option value="lots">Lots</option>
                        <option value="fixed">Fixed</option>
                      </select>
                      <input
                        className="h-8 w-14 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-center text-sm font-semibold"
                        type="number"
                        min={0.1}
                        max={100}
                        step={0.1}
                        value={row.sizingValue}
                        disabled={locked}
                        onChange={(event) =>
                          setClients((current) =>
                            current.map((item) =>
                              item.id === row.id ? { ...item, sizingValue: Number(event.target.value) } : item,
                            ),
                          )
                        }
                        onBlur={(event) => void patchRow(row.id, { sizingValue: Number(event.target.value) })}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <select
                      className={cn(
                        "h-8 rounded-md border px-2 text-[11px] font-extrabold uppercase",
                        row.tradeMode === "real"
                          ? "border-blue-700 bg-blue-700 text-white dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100"
                          : "border-[var(--border)] bg-[var(--bg)] text-slate-600 dark:bg-slate-800 dark:text-slate-200",
                      )}
                      value={row.tradeMode}
                      disabled={locked}
                      onChange={(event) => void patchRow(row.id, { tradeMode: event.target.value as TradeMode })}
                    >
                      <option value="real">REAL</option>
                      <option value="paper">PAPER</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <CopySwitch on={row.copy} disabled={locked} onChange={(copy) => void patchRow(row.id, { copy })} />
                  </td>
                  <td className="px-4 py-3 align-middle text-xs text-slate-400">{row.staticIp || "Default"}</td>
                  <td className="px-4 py-3 align-middle">
                    <StatusPill live={row.status === "LIVE"} />
                  </td>
                  <td className="px-4 py-3 align-middle font-semibold">₹{formatNumber(row.margin, 2)}</td>
                  <td className="px-4 py-3 align-middle">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <ActionBtn onClick={() => setGroupFor(row)}>Groups</ActionBtn>
                      <ActionBtn onClick={() => setEdit(row)}>
                        <Pencil size={12} />
                        Edit
                      </ActionBtn>
                      <Link
                        to={`/chat?client=${encodeURIComponent(row.id)}`}
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--border)] px-2 text-[11px] font-semibold"
                      >
                        <MessageSquare size={12} />
                        Message
                      </Link>
                      <button
                        type="button"
                        disabled={locked}
                        className="inline-flex h-8 items-center justify-center rounded-md border border-rose-800 px-2 text-rose-400 disabled:opacity-50"
                        title="Delete"
                        onClick={() => void onDelete(row)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!filtered.length ? (
          <div className="px-4 py-8 text-center text-sm text-slate-400">
            No members yet. They appear here after Continue with Google or Create Account.
          </div>
        ) : null}
      </section>

      {edit ? (
        <EditModal
          row={edit}
          groups={groups}
          onClose={() => setEdit(null)}
          onSaved={(client) => {
            setClients((current) => current.map((row) => (row.id === client.id ? client : row)));
            setEdit(null);
          }}
        />
      ) : null}
      {groupFor ? (
        <GroupModal
          row={groupFor}
          groups={groups}
          onClose={() => setGroupFor(null)}
          onSaved={(client) => {
            setClients((current) => current.map((row) => (row.id === client.id ? client : row)));
            if (!groups.includes(client.group)) setGroups((current) => [...current, client.group]);
            setGroupFor(null);
          }}
        />
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <section className="card px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 flex items-center gap-2 text-2xl font-extrabold">
        <UsersIcon size={18} className="text-brand-500" />
        {value}
      </div>
    </section>
  );
}

function BrokerCell({ row }: { row: ClientRow }) {
  if (!row.linked) {
    return (
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-700 text-[10px] font-extrabold text-slate-200">
          P
        </span>
        <span>
          <span className="block text-[11px] font-extrabold tracking-wide">PAPER</span>
          <span className="block text-[11px] text-slate-500">No broker linked</span>
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span
        className="flex h-8 w-8 items-center justify-center rounded-md text-[11px] font-extrabold text-white"
        style={{ background: row.brokerColor || "#0f9d58" }}
      >
        {row.brokerName.slice(0, 1)}
      </span>
      <span>
        <span className="block text-[11px] font-extrabold tracking-wide">{row.brokerName}</span>
        <span className="block text-[11px] text-slate-500">{row.accountId || "Not linked"}</span>
      </span>
    </div>
  );
}

function StatusPill({ live }: { live: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide",
        live ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", live ? "bg-emerald-400" : "bg-slate-500")} />
      {live ? "LIVE" : "Paper only"}
    </span>
  );
}

function CopySwitch({ on, disabled, onChange }: { on: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      title={on ? "Copy on" : "Copy off"}
      onClick={() => onChange(!on)}
      className={cn("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50", on ? "bg-emerald-500" : "bg-slate-600")}
    >
      <span className={cn("inline-block h-5 w-5 rounded-full bg-white transition", on ? "translate-x-[22px]" : "translate-x-0.5")} />
    </button>
  );
}

function ActionBtn({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--border)] px-2 text-[11px] font-semibold"
    >
      {children}
    </button>
  );
}

function EditModal({
  row,
  groups,
  onClose,
  onSaved,
}: {
  row: ClientRow;
  groups: string[];
  onClose: () => void;
  onSaved: (client: ClientRow) => void;
}) {
  const [name, setName] = useState(row.name);
  const [mobile, setMobile] = useState(row.mobile || "");
  const [telegramId, setTelegramId] = useState(row.telegramId || "");
  const [brokerId, setBrokerId] = useState(row.brokerId);
  const [accountId, setAccountId] = useState(row.accountId || "");
  const [staticIp, setStaticIp] = useState(row.staticIp || "");
  const [group, setGroup] = useState(row.group || "ALL");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await saveClient(row.id, { name, mobile, telegramId, brokerId, accountId, staticIp, group });
      onSaved(result.client);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Edit ${row.name}`} onClose={onClose}>
      <form onSubmit={(event) => void onSubmit(event)} className="grid gap-3">
        <Field label="Name">
          <input className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm" value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="WhatsApp mobile">
          <input className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm" value={mobile} onChange={(event) => setMobile(event.target.value)} placeholder="10-digit mobile" />
        </Field>
        <Field label="Telegram chat id">
          <input className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm" value={telegramId} onChange={(event) => setTelegramId(event.target.value)} placeholder="Chat id from BotFather /start" />
        </Field>
        <Field label="Broker">
          <select className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm" value={brokerId} onChange={(event) => setBrokerId(event.target.value)}>
            <option value="paper">PAPER</option>
            <option value="dhan">DHAN</option>
            <option value="zerodha">ZERODHA</option>
            <option value="kotak">KOTAK</option>
            <option value="fyers">FYERS</option>
          </select>
        </Field>
        <Field label="Broker account / client id">
          <input className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm" value={accountId} onChange={(event) => setAccountId(event.target.value)} placeholder="Dhan client id" />
        </Field>
        <Field label="Static IP">
          <input className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm" value={staticIp} onChange={(event) => setStaticIp(event.target.value)} placeholder="Default" />
        </Field>
        <Field label="Group">
          <input className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm" list="client-groups" value={group} onChange={(event) => setGroup(event.target.value)} />
          <datalist id="client-groups">
            {groups.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
        </Field>
        {error ? <p className="text-xs font-semibold text-rose-500">{error}</p> : null}
        <p className="text-[11px] text-slate-500">
          {formatMobile(mobile)} · Saving REAL or Copy does not start Dhan LIVE.
        </p>
        <button type="submit" disabled={busy} className="h-10 rounded-xl bg-brand-500 text-sm font-semibold text-white">
          {busy ? "Saving..." : "Save"}
        </button>
      </form>
    </Modal>
  );
}

function GroupModal({
  row,
  groups,
  onClose,
  onSaved,
}: {
  row: ClientRow;
  groups: string[];
  onClose: () => void;
  onSaved: (client: ClientRow) => void;
}) {
  const [group, setGroup] = useState(row.group || "ALL");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await saveClient(row.id, { group });
      onSaved(result.client);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save group");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Groups" onClose={onClose}>
      <form onSubmit={(event) => void onSubmit(event)} className="grid gap-3">
        <div className="flex flex-wrap gap-1.5">
          {groups.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setGroup(item)}
              className={cn(
                "rounded-full border px-3 py-1 text-[11px] font-bold uppercase",
                group === item ? "border-brand-500 bg-brand-500/15 text-brand-400" : "border-[var(--border)] text-slate-400",
              )}
            >
              {item}
            </button>
          ))}
        </div>
        <Field label="Group name">
          <input className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm" value={group} onChange={(event) => setGroup(event.target.value)} />
        </Field>
        {error ? <p className="text-xs font-semibold text-rose-500">{error}</p> : null}
        <button type="submit" disabled={busy} className="h-10 rounded-xl bg-brand-500 text-sm font-semibold text-white">
          {busy ? "Saving..." : "Save group"}
        </button>
      </form>
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/50 p-3 md:items-center">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold">{title}</h2>
          <button type="button" className="text-slate-400" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-slate-400">
      {label}
      {children}
    </label>
  );
}
