import { MessageSquare, Pencil, Plus, RefreshCw, Search, Trash2, UserPlus, Users as UsersIcon, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { createClient, deleteClient, saveClient, type ClientBroker, type ClientRow } from "../api/client";
import { loadClientList, peekClientList } from "../lib/clientsCache";
import { cn, formatMobile, formatNumber } from "../lib/format";

type SizingKind = ClientRow["sizingKind"];
type TradeMode = ClientRow["tradeMode"];

export function Users() {
  const seeded = peekClientList();
  const [clients, setClients] = useState<ClientRow[]>(seeded?.clients || []);
  const [groups, setGroups] = useState<string[]>(seeded?.groups?.length ? seeded.groups : ["ALL"]);
  const [brokers, setBrokers] = useState<ClientBroker[]>(seeded?.brokers || []);
  const [assignedIps, setAssignedIps] = useState<Record<string, string[]>>(seeded?.assignedIps || {});
  const [knownIps, setKnownIps] = useState<string[]>(seeded?.knownIps || []);
  const [strategies, setStrategies] = useState<Array<{ id: string; name: string }>>(seeded?.strategies || []);
  const [defaultUntil, setDefaultUntil] = useState(seeded?.defaultUntil || defaultUntilDate);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(!seeded?.clients.length);
  const [query, setQuery] = useState("");
  const [savingId, setSavingId] = useState("");
  const [edit, setEdit] = useState<ClientRow | null>(null);
  const [groupFor, setGroupFor] = useState<ClientRow | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    const hadRows = Boolean(peekClientList()?.clients.length);
    if (!hadRows) setBusy(true);
    try {
      const result = await loadClientList(true);
      setClients(result.clients || []);
      setGroups(result.groups?.length ? result.groups : ["ALL"]);
      setBrokers(result.brokers || []);
      setAssignedIps(result.assignedIps || {});
      setKnownIps(result.knownIps || []);
      setStrategies(result.strategies || []);
      if (result.defaultUntil) setDefaultUntil(result.defaultUntil);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load clients");
    } finally {
      setBusy(false);
    }
  }, []);

  const location = useLocation();

  useEffect(() => {
    void load();
    const onVis = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [load, location.key]);

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
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={busy}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--border)] px-3 text-sm font-semibold disabled:opacity-60"
          >
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
            Refresh
          </button>
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white"
            onClick={() => setShowAdd(true)}
          >
            <Plus size={16} />
            Add client
          </button>
        </div>
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
                    {row.subscriptionUntil ? (
                      <div className="text-[10px] text-slate-500">Valid {row.subscriptionUntil}</div>
                    ) : null}
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
        {busy && !clients.length ? (
          <div className="px-4 py-8 text-center text-sm text-slate-400">Loading clients…</div>
        ) : !filtered.length ? (
          <div className="px-4 py-8 text-center text-sm text-slate-400">
            No members yet. They appear here after Continue with Google or Create Account.
          </div>
        ) : null}
      </section>

      {showAdd ? (
        <AddClientModal
          brokers={brokers}
          groups={groups}
          assignedIps={assignedIps}
          knownIps={knownIps}
          strategies={strategies}
          defaultUntil={defaultUntil}
          onClose={() => setShowAdd(false)}
          onSaved={(client) => {
            setClients((current) => [...current, client].sort((a, b) => a.name.localeCompare(b.name)));
            setShowAdd(false);
            void load();
          }}
        />
      ) : null}
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

function defaultUntilDate() {
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function AddClientModal({
  brokers,
  groups,
  assignedIps,
  knownIps,
  strategies,
  defaultUntil,
  onClose,
  onSaved,
}: {
  brokers: ClientBroker[];
  groups: string[];
  assignedIps: Record<string, string[]>;
  knownIps: string[];
  strategies: Array<{ id: string; name: string }>;
  defaultUntil: string;
  onClose: () => void;
  onSaved: (client: ClientRow) => void;
}) {
  const catalog = brokers.length
    ? brokers
    : [
        { id: "dhan", name: "DHAN", segments: ["All segments", "EQ", "F&O"] },
        { id: "upstox", name: "UPSTOX", segments: ["All segments", "UPSTOX"] },
        { id: "paper", name: "PAPER", segments: ["All segments"] },
      ];
  const [copy, setCopy] = useState(true);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [accountId, setAccountId] = useState("master");
  const [brokerId, setBrokerId] = useState("dhan");
  const [sizingKind, setSizingKind] = useState<SizingKind>("multiplier");
  const [sizingValue, setSizingValue] = useState("1");
  const [tradeMode, setTradeMode] = useState<TradeMode>("paper");
  const [subscriptionMode, setSubscriptionMode] = useState<NonNullable<ClientRow["subscriptionMode"]>>("copy");
  const [subscriptionUntil, setSubscriptionUntil] = useState(defaultUntil || defaultUntilDate());
  const [mappedStrategy, setMappedStrategy] = useState("");
  const [instantAlerts, setInstantAlerts] = useState(true);
  const [eveningPnl, setEveningPnl] = useState(false);
  const [notifyWhatsApp, setNotifyWhatsApp] = useState(true);
  const [notifyTelegram, setNotifyTelegram] = useState(false);
  const [telegramId, setTelegramId] = useState("");
  const [staticIp, setStaticIp] = useState("");
  const [pickedGroups, setPickedGroups] = useState<string[]>([]);
  const [segments, setSegments] = useState<string[]>(["All segments"]);
  const [brokerToken, setBrokerToken] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const broker = catalog.find((row) => row.id === brokerId) || catalog[0];
  const takenIps = assignedIps[brokerId] || [];
  const ipChoices = knownIps.filter((ip) => !takenIps.includes(ip));
  const groupChoices = [...new Set([...groups, ...pickedGroups])].filter((item) => item && item !== "ALL");
  const segmentChoices = broker?.segments?.length ? broker.segments : ["All segments"];

  const toggle = (list: string[], value: string, allLabel?: string) => {
    if (allLabel && value === allLabel) return [allLabel];
    const next = list.includes(value) ? list.filter((item) => item !== value) : [...list.filter((item) => item !== allLabel), value];
    return next.length ? next : allLabel ? [allLabel] : [];
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await createClient({
        name,
        mobile,
        email,
        accountId,
        brokerId,
        sizingKind,
        sizingValue: Number(sizingValue),
        tradeMode,
        copy,
        subscriptionMode,
        subscriptionUntil,
        mappedStrategy,
        groups: pickedGroups,
        segments,
        notifications: {
          instantAlerts,
          eveningPnl,
          whatsapp: notifyWhatsApp,
          telegram: notifyTelegram,
        },
        telegramId,
        brokerToken,
        notes,
        staticIp,
      });
      onSaved(result.client);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create client");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/60 p-3 md:items-center">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/15 text-brand-500">
              <UserPlus size={18} />
            </span>
            <div>
              <h2 className="text-base font-bold">Add client account</h2>
              <p className="text-xs text-slate-400">Connect and configure a new trading account</p>
            </div>
          </div>
          <button type="button" className="text-slate-400" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={(event) => void onSubmit(event)} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-auto px-5 py-4">
            <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3">
              <div>
                <div className="text-sm font-semibold">Copy trading</div>
                <div className="text-xs text-slate-400">{copy ? "ON · Master orders will be copied" : "OFF · This client will not copy desk orders"}</div>
              </div>
              <CopySwitch on={copy} onChange={setCopy} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Client name">
                <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Ramesh Kumar" />
              </Field>
              <Field label="Mobile">
                <input className={inputClass} value={mobile} onChange={(event) => setMobile(event.target.value)} placeholder="9xxxxxxxxx" />
                <span className="font-normal text-[11px] text-slate-500">Client portal login number · initial password 1234</span>
              </Field>
              <Field label="Email">
                <input className={inputClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="client@email.com" />
              </Field>
              <Field label="Broker Client ID">
                <input className={inputClass} value={accountId} onChange={(event) => setAccountId(event.target.value)} placeholder="master" />
              </Field>
              <Field label="Broker">
                <select
                  className={inputClass}
                  value={brokerId}
                  onChange={(event) => {
                    const next = event.target.value;
                    setBrokerId(next);
                    const row = catalog.find((item) => item.id === next);
                    setSegments(row?.segments?.includes("All segments") ? ["All segments"] : row?.segments?.slice(0, 1) || ["All segments"]);
                    setStaticIp("");
                  }}
                >
                  {catalog.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Order sizing method">
                <select className={inputClass} value={sizingKind} onChange={(event) => setSizingKind(event.target.value as SizingKind)}>
                  <option value="multiplier">Master quantity multiplier</option>
                  <option value="lots">Fixed lots</option>
                  <option value="fixed">Fixed quantity</option>
                </select>
              </Field>
            </div>
            <Field label="Order multiplier">
              <input className={inputClass} type="number" min={0.1} max={100} step={0.1} value={sizingValue} onChange={(event) => setSizingValue(event.target.value)} />
            </Field>
            <Field label="Order mode">
              <select className={inputClass} value={tradeMode} onChange={(event) => setTradeMode(event.target.value as TradeMode)}>
                <option value="paper">Paper</option>
                <option value="real">Real</option>
              </select>
              <span className="font-normal text-[11px] text-slate-500">
                Add broker credentials below before enabling real orders. Real mode does not start Dhan LIVE on the desk.
              </span>
            </Field>
            <Field label="Subscription mode">
              <select
                className={inputClass}
                value={subscriptionMode}
                onChange={(event) => setSubscriptionMode(event.target.value as NonNullable<ClientRow["subscriptionMode"]>)}
              >
                <option value="copy">Copy Master only</option>
                <option value="strategy">Mapped strategies only</option>
                <option value="both">Copy Master + strategies</option>
              </select>
              <span className="font-normal text-[11px] text-slate-500">
                Choose whether this client receives mapped strategy orders, manual Copy Master orders, or both.
              </span>
            </Field>
            <Field label="Subscription valid through">
              <input className={inputClass} type="date" value={subscriptionUntil} onChange={(event) => setSubscriptionUntil(event.target.value)} />
              <span className="font-normal text-[11px] text-slate-500">
                Copy execution automatically turns off after this date. New clients default to 30 days.
              </span>
            </Field>
            <Field label="Mapped strategy">
              <input
                className={inputClass}
                list="mapped-strategies"
                value={mappedStrategy}
                onChange={(event) => setMappedStrategy(event.target.value)}
                placeholder="Optional strategy name"
              />
              <datalist id="mapped-strategies">
                {strategies.map((row) => (
                  <option key={row.id} value={row.name} />
                ))}
              </datalist>
            </Field>
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Client notifications</div>
              <div className="grid gap-2 sm:grid-cols-2">
                <CheckRow label="Instant trade alerts" checked={instantAlerts} onChange={setInstantAlerts} />
                <CheckRow label="Evening P&L report" checked={eveningPnl} onChange={setEveningPnl} />
                <CheckRow label="WhatsApp" checked={notifyWhatsApp} onChange={setNotifyWhatsApp} />
                <CheckRow label="Telegram" checked={notifyTelegram} onChange={setNotifyTelegram} />
              </div>
            </div>
            <Field label="Telegram Chat ID">
              <input className={inputClass} value={telegramId} onChange={(event) => setTelegramId(event.target.value)} placeholder="e.g. 123456789" />
              <span className="font-normal text-[11px] text-slate-500">
                Filled automatically after the client starts your bot, or enter it manually.
              </span>
            </Field>
            <Field label="Order egress IP">
              <select className={inputClass} value={staticIp} onChange={(event) => setStaticIp(event.target.value)}>
                <option value="">Default (server main IP)</option>
                {ipChoices.map((ip) => (
                  <option key={ip} value={ip}>
                    {ip}
                  </option>
                ))}
              </select>
              <span className="font-normal text-[11px] text-slate-500">IPs already assigned to another account on this broker are hidden.</span>
            </Field>
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Client groups</div>
              <div className="flex flex-wrap gap-1.5">
                {groupChoices.map((item) => (
                  <Chip key={item} on={pickedGroups.includes(item)} onClick={() => setPickedGroups(toggle(pickedGroups, item))}>
                    {item}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Allowed trading segments</div>
              <div className="flex flex-wrap gap-1.5">
                {segmentChoices.map((item) => (
                  <Chip
                    key={item}
                    on={segments.includes(item)}
                    onClick={() => setSegments(toggle(segments, item, "All segments"))}
                  >
                    {item}
                  </Chip>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-[var(--border)] p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{broker?.name || "Broker"} credentials</div>
              <Field label="Access Token *">
                <input
                  className={inputClass}
                  type="password"
                  value={brokerToken}
                  onChange={(event) => setBrokerToken(event.target.value)}
                  placeholder="•••••"
                  autoComplete="off"
                />
                <span className="font-normal text-[11px] text-slate-500">
                  {brokerId === "upstox" ? "Upstox daily access token" : "Broker access token. Required for Real mode. This does not start Dhan LIVE."}
                </span>
              </Field>
            </div>
            <Field label="Internal notes">
              <textarea
                className="min-h-24 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 text-sm"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Account notes, preferences or operational context"
              />
            </Field>
            {error ? <p className="text-xs font-semibold text-rose-500">{error}</p> : null}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
            <button type="button" className="h-10 rounded-xl border border-[var(--border)] px-4 text-sm font-semibold" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" disabled={busy} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white disabled:opacity-60">
              <Plus size={16} />
              {busy ? "Creating..." : "Create client"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wide",
        on ? "border-brand-500 bg-brand-500/15 text-brand-400" : "border-[var(--border)] text-slate-400",
      )}
    >
      {children}
    </button>
  );
}

function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

const inputClass = "h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm";

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
            <option value="upstox">UPSTOX</option>
            <option value="zerodha">ZERODHA</option>
            <option value="kotak">KOTAK</option>
            <option value="angelone">ANGELONE</option>
            <option value="aliceblue">ALICEBLUE</option>
            <option value="sharekhan">SHAREKHAN</option>
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
