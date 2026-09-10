import {
  Globe2,
  Link2,
  Plus,
  RefreshCw,
  Server,
  ShieldCheck,
  Unlink,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  addStaticIp,
  assignStaticIp,
  deleteStaticIp,
  listClients,
  listStaticIps,
  testStaticIp,
  unassignStaticIp,
  type ClientRow,
  type EgressAccountRow,
  type EgressAssignment,
  type EgressIpCard,
  type IpManagementSnapshot,
} from "../api/client";
import { cn } from "../lib/format";

const emptySnap: IpManagementSnapshot = {
  slots: [],
  stats: { ipv4: 0, ipv6: 0, healthy: 0, assignments: 0, brokersCovered: 0, serverDefault: 0 },
  ips: [],
  accounts: [],
  unassigned: [],
};

const SERVER_DEFAULT = "";

type FamilyFilter = "ipv4" | "ipv6";

function statusBadge(status: EgressIpCard["status"]) {
  if (status === "healthy") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        Healthy
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-400">
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-500/40 bg-slate-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
      Not tested
    </span>
  );
}

function BrokerChip({ name, color, dim }: { name: string; color?: string; dim?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg)] px-1.5 py-1 text-[10px] font-extrabold uppercase tracking-wide",
        dim && "opacity-80",
      )}
    >
      <span className="h-3.5 w-3.5 shrink-0 rounded-[3px]" style={{ background: color || "#64748b" }} />
      {name}
    </span>
  );
}

export function IpManagement() {
  const [data, setData] = useState<IpManagementSnapshot>(emptySnap);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [family, setFamily] = useState<FamilyFilter>("ipv4");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(true);
  const [testing, setTesting] = useState("");
  const [managingId, setManagingId] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [manageFor, setManageFor] = useState<EgressIpCard | null>(null);

  const apply = (next: IpManagementSnapshot) => {
    setData(next);
    setManageFor((current) => (current ? next.ips.find((row) => row.address === current.address) || null : null));
    if (next.accounts?.length) {
      setClients((current) => {
        if (!current.length) return current;
        const byId = new Map(next.accounts.map((row) => [row.userId, row]));
        return current.map((row) => {
          const account = byId.get(row.id);
          return account ? { ...row, staticIp: account.staticIp, accountId: account.accountId || row.accountId } : row;
        });
      });
    }
  };

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [ips, book] = await Promise.all([listStaticIps(), listClients().catch(() => null)]);
      apply(ips);
      if (book?.clients) setClients(book.clients);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load IP inventory");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cards = useMemo(() => data.ips.filter((row) => row.family === family), [data.ips, family]);
  const addressCount = family === "ipv4" ? data.stats.ipv4 : data.stats.ipv6;
  const manageIps = useMemo(() => {
    const rows = data.ips.map((row) => row.address);
    for (const account of data.accounts || []) {
      if (account.staticIp && !rows.includes(account.staticIp)) rows.push(account.staticIp);
    }
    return rows;
  }, [data.ips, data.accounts]);

  const run = async (work: () => Promise<IpManagementSnapshot>, okNote?: string) => {
    setError("");
    setNote("");
    try {
      apply(await work());
      if (okNote) setNote(okNote);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update IP");
      return false;
    }
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">IP management</h1>
          <p className="text-sm text-slate-400">Broker-wise static egress allocation and account control</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--card)] p-0.5 text-xs font-bold">
            {(["ipv4", "ipv6"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFamily(item)}
                className={cn(
                  "rounded-md px-3 py-1.5 uppercase",
                  family === item ? "bg-brand-500 text-white" : "text-slate-400",
                )}
              >
                {item === "ipv4" ? "IPv4" : "IPv6"}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-xs font-semibold"
          >
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-500 px-3 text-xs font-semibold text-white"
          >
            <Plus size={14} />
            Add static IP
          </button>
        </div>
      </div>

      {error ? <p className="text-sm font-semibold text-down">{error}</p> : null}
      {note ? <p className="text-sm font-semibold text-up">{note}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<Globe2 size={22} />}
          label={`IP ${family === "ipv4" ? "4" : "6"} ADDRESSES`}
          value={String(addressCount)}
          hint="Egress inventory"
        />
        <StatCard icon={<ShieldCheck size={22} />} label="HEALTHY" value={String(data.stats.healthy)} hint="Last bind test passed" />
        <StatCard
          icon={<Link2 size={22} />}
          label="ASSIGNMENTS"
          value={String(data.stats.assignments)}
          hint={`${data.stats.brokersCovered} broker${data.stats.brokersCovered === 1 ? "" : "s"} covered`}
        />
        <StatCard icon={<Server size={22} />} label="SERVER DEFAULT" value={String(data.stats.serverDefault)} hint="Accounts without static IP" />
      </div>

      {busy && !data.ips.length ? <p className="text-sm text-slate-400">Loading IP inventory…</p> : null}
      {!busy && !cards.length ? (
        <section className="card p-6 text-sm text-slate-400">
          No {family === "ipv4" ? "IPv4" : "IPv6"} addresses yet. Use Add static IP to put a broker whitelist address in inventory.
        </section>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {cards.map((card) => (
          <IpCard
            key={card.address}
            card={card}
            testing={testing === card.address}
            onTest={async () => {
              setTesting(card.address);
              await run(() => testStaticIp(card.address), card.address + " bind test finished");
              setTesting("");
            }}
            onManage={() => setManageFor(card)}
            onUnlink={(userId) => void run(() => unassignStaticIp(userId), "Account moved back to server default")}
          />
        ))}
      </div>

      <AccountAssignmentsTable
        accounts={data.accounts || []}
        manageIps={manageIps}
        managingId={managingId}
        onAssign={async (userId, address) => {
          setManagingId(userId);
          const account = (data.accounts || []).find((row) => row.userId === userId);
          const brokerId = account?.brokerId || undefined;
          const ok = address
            ? await run(() => assignStaticIp(address, { userId, brokerId }), `${account?.name || "Account"} assigned to ${address}`)
            : await run(() => unassignStaticIp(userId), `${account?.name || "Account"} moved back to server default`);
          setManagingId("");
          return ok;
        }}
      />

      {addOpen ? (
        <AddIpModal
          family={family}
          onClose={() => setAddOpen(false)}
          onSave={async (address, label) => {
            if (await run(() => addStaticIp({ address, label }), `${address} added to inventory`)) setAddOpen(false);
          }}
        />
      ) : null}
      {manageFor ? (
        <ManageModal
          card={manageFor}
          clients={clients}
          unassigned={data.unassigned}
          onClose={() => setManageFor(null)}
          onAssign={(userId, brokerId) => void run(() => assignStaticIp(manageFor.address, { userId, brokerId }), "Assignment saved")}
          onUnlink={(userId) => void run(() => unassignStaticIp(userId))}
          onDelete={async () => {
            if (await run(() => deleteStaticIp(manageFor.address), "Static IP removed")) setManageFor(null);
          }}
        />
      ) : null}
    </div>
  );
}

function accountStatusPill(status: EgressAccountRow["status"]) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        Active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-500/35 bg-slate-500/10 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-slate-400">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
      Inactive
    </span>
  );
}

function AccountAssignmentsTable({
  accounts,
  manageIps,
  managingId,
  onAssign,
}: {
  accounts: EgressAccountRow[];
  manageIps: string[];
  managingId: string;
  onAssign: (userId: string, address: string) => Promise<boolean | void>;
}) {
  return (
    <section className="card overflow-hidden">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <h2 className="text-sm font-semibold">All account assignments</h2>
      </div>
      <div className="max-h-[28rem] overflow-auto">
        <table className="min-w-[920px] w-full text-left">
          <thead className="sticky top-0 z-10 bg-[var(--card)]">
            <tr className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
              <th className="px-4 py-3 font-bold">Account</th>
              <th className="px-4 py-3 font-bold">Broker</th>
              <th className="px-4 py-3 font-bold">Client ID</th>
              <th className="px-4 py-3 font-bold">Assigned IP</th>
              <th className="px-4 py-3 font-bold">Status</th>
              <th className="px-4 py-3 font-bold">Manage</th>
            </tr>
          </thead>
          <tbody>
            {accounts.length ? (
              accounts.map((row) => (
                <tr key={row.userId} className="border-t border-[var(--border)]">
                  <td className="px-4 py-3 align-middle">
                    <div className="text-sm font-semibold">{row.name}</div>
                    <div className="text-[11px] capitalize text-slate-500">{row.kind}</div>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    {row.brokerName ? (
                      <BrokerChip name={row.brokerName} color={row.brokerColor} />
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                        <span className="h-3.5 w-3.5 rounded-[3px] border border-[var(--border)] bg-[var(--bg)]" />
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-middle text-xs text-slate-400">{row.accountId || "—"}</td>
                  <td className="px-4 py-3 align-middle text-xs">
                    {row.staticIp ? (
                      <span className="font-medium">{row.staticIp}</span>
                    ) : (
                      <span className="italic text-slate-500">Server default</span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-middle">{accountStatusPill(row.status)}</td>
                  <td className="px-4 py-3 align-middle">
                    <select
                      className="h-9 w-full min-w-[11rem] rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 text-xs font-semibold"
                      value={row.staticIp || SERVER_DEFAULT}
                      disabled={managingId === row.userId}
                      onChange={(event) => void onAssign(row.userId, event.target.value)}
                    >
                      <option value={SERVER_DEFAULT}>Server default</option>
                      {manageIps.map((address) => (
                        <option key={address} value={address}>
                          {address}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={6}>
                  No member accounts yet. New clients on All clients appear here with Server default until you assign a static IP.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StatCard({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string; hint: string }) {
  return (
    <section className="card flex items-center gap-4 p-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-slate-400">{icon}</div>
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</div>
        <div className="text-3xl font-bold leading-tight">{value}</div>
        <div className="text-xs text-slate-400">{hint}</div>
      </div>
    </section>
  );
}

function IpCard({
  card,
  testing,
  onTest,
  onManage,
  onUnlink,
}: {
  card: EgressIpCard;
  testing: boolean;
  onTest: () => void;
  onManage: () => void;
  onUnlink: (userId: string) => void;
}) {
  return (
    <section className="card flex flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full border border-brand-500/40 text-brand-500">
            <Globe2 size={16} />
          </div>
          <div>
            <div className="text-base font-bold tracking-tight">{card.address}</div>
            <div className="text-[11px] text-slate-400">
              {card.family === "ipv4" ? "IPv4" : "IPv6"} · {card.label}
            </div>
          </div>
        </div>
        {statusBadge(card.status)}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 border-b border-[var(--border)] pb-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Assigned</div>
          <div className="text-2xl font-bold">{card.assignedCount}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Broker slots used</div>
          <div className="text-2xl font-bold">
            {card.slotsUsed}/{card.slotsMax}
          </div>
        </div>
      </div>

      <div className="mt-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">Assigned accounts</div>
      <div className="mt-2 min-h-[4.5rem] space-y-2">
        {card.assigned.length ? (
          card.assigned.map((row) => (
            <div key={`${row.userId}-${row.brokerId}`} className="flex items-center justify-between gap-2 rounded-xl bg-[var(--bg)] px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-[11px] font-extrabold uppercase tracking-wide" style={{ color: row.brokerColor || undefined }}>
                  {row.brokerName}
                </div>
                <div className="truncate text-sm font-semibold">{row.name}</div>
                <div className="truncate text-[11px] text-slate-500">{row.accountId || "child —"}</div>
              </div>
              <button type="button" className="icon-btn" title="Unassign" onClick={() => onUnlink(row.userId)}>
                <Unlink size={14} />
              </button>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-[var(--border)] px-3 py-6 text-center text-xs text-slate-500">
            No account assigned
          </div>
        )}
      </div>

      <div className="mt-4 text-[10px] font-bold uppercase tracking-wide text-slate-500">Available broker slots</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {card.availableSlots.map((slot) => (
          <BrokerChip key={slot.id} name={slot.name} color={slot.color} />
        ))}
      </div>
      {card.lastTestError && card.status === "failed" ? (
        <p className="mt-3 text-[11px] text-rose-400">{card.lastTestError}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onTest}
          disabled={testing}
          className="h-9 rounded-lg border border-[var(--border)] px-3 text-xs font-semibold"
        >
          {testing ? "Testing…" : "Test IP"}
        </button>
        <button type="button" onClick={onManage} className="h-9 rounded-lg bg-brand-500 px-3 text-xs font-semibold text-white">
          Manage assignments
        </button>
      </div>
    </section>
  );
}

function AddIpModal({
  family,
  onClose,
  onSave,
}: {
  family: FamilyFilter;
  onClose: () => void;
  onSave: (address: string, label: string) => Promise<void>;
}) {
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState(family === "ipv4" ? "IPv4" : "IPv6");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave(address.trim(), label.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add IP");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Add static IP" onClose={onClose}>
      <p className="text-xs text-slate-400">
        Put a broker-whitelist IPv4 or IPv6 in inventory. Assigning a client does not start LIVE trading.
      </p>
      <form className="mt-3 space-y-3" onSubmit={(event) => void submit(event)}>
        <label className="block text-xs font-semibold">
          Address
          <input
            className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder={family === "ipv4" ? "136.243.168.130" : "2001:db8::1"}
            required
          />
        </label>
        <label className="block text-xs font-semibold">
          Label
          <input
            className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Quantity"
          />
        </label>
        {error ? <p className="text-xs font-semibold text-down">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 rounded-lg border border-[var(--border)] px-3 text-xs font-semibold">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="h-9 rounded-lg bg-brand-500 px-3 text-xs font-semibold text-white">
            {busy ? "Saving…" : "Add IP"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ManageModal({
  card,
  clients,
  unassigned,
  onClose,
  onAssign,
  onUnlink,
  onDelete,
}: {
  card: EgressIpCard;
  clients: ClientRow[];
  unassigned: EgressAssignment[];
  onClose: () => void;
  onAssign: (userId: string, brokerId: string) => void;
  onUnlink: (userId: string) => void;
  onDelete: () => void;
}) {
  const [userId, setUserId] = useState(unassigned[0]?.userId || clients[0]?.id || "");
  const picked = clients.find((row) => row.id === userId);
  const [brokerId, setBrokerId] = useState(picked?.brokerId && picked.brokerId !== "paper" ? picked.brokerId : card.availableSlots[0]?.id || "dhan");

  const choices = clients.filter((row) => row.brokerId !== "paper");
  const slotOptions = [
    ...card.availableSlots,
    ...card.assigned.map((row) => ({ id: row.brokerId, name: row.brokerName, color: row.brokerColor })),
  ].filter((slot, index, rows) => rows.findIndex((item) => item.id === slot.id) === index);

  return (
    <Modal title={`Manage ${card.address}`} onClose={onClose}>
      <p className="text-xs text-slate-400">
        One account per broker on this IP. Same broker cannot share this address. Unassign returns the account to the server default IP.
      </p>
      <div className="mt-3 space-y-2">
        {card.assigned.map((row) => (
          <div key={row.userId} className="flex items-center justify-between rounded-xl bg-[var(--bg)] px-3 py-2">
            <div>
              <div className="text-[11px] font-extrabold uppercase" style={{ color: row.brokerColor }}>
                {row.brokerName}
              </div>
              <div className="text-sm font-semibold">{row.name}</div>
            </div>
            <button type="button" className="text-xs font-semibold text-down" onClick={() => onUnlink(row.userId)}>
              Unassign
            </button>
          </div>
        ))}
      </div>
      <form
        className="mt-4 grid gap-2 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (userId) onAssign(userId, brokerId);
        }}
      >
        <label className="text-xs font-semibold sm:col-span-2">
          Client
          <select
            className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm"
            value={userId}
            onChange={(event) => {
              const next = event.target.value;
              setUserId(next);
              const row = clients.find((item) => item.id === next);
              if (row?.brokerId && row.brokerId !== "paper") setBrokerId(row.brokerId);
            }}
          >
            <option value="">Select client</option>
            {choices.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name} · {row.brokerName}
                {row.staticIp ? ` · ${row.staticIp}` : " · default"}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold sm:col-span-2">
          Broker slot
          <select
            className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm"
            value={brokerId}
            onChange={(event) => setBrokerId(event.target.value)}
          >
            {slotOptions.map((slot) => (
              <option key={slot.id} value={slot.id}>
                {slot.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="h-9 rounded-lg bg-brand-500 text-xs font-semibold text-white sm:col-span-2">
          Assign to this IP
        </button>
      </form>
      <button
        type="button"
        disabled={card.assigned.length > 0}
        onClick={onDelete}
        className="mt-3 h-9 w-full rounded-lg border border-rose-300 text-xs font-semibold text-down disabled:opacity-40 dark:border-rose-900"
      >
        Delete IP from inventory
      </button>
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/60 p-3 md:items-center">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="text-sm font-bold">{title}</div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
