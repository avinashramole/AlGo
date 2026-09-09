import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Settings as Gear, MessageSquare, Search, Send, UserPlus, Users } from "lucide-react";
import {
  addMessagingContact,
  broadcastMessaging,
  getMessaging,
  getMessagingThread,
  saveMessagingConfig,
  sendMessaging,
  type MessagingConversation,
  type MessagingMessage,
} from "../api/client";
import { cn, formatMobile } from "../lib/format";

type SendVia = "both" | "whatsapp" | "telegram";

export function Chat() {
  const [sendVia, setSendVia] = useState<SendVia>("both");
  const [whatsappReady, setWhatsappReady] = useState(false);
  const [telegramReady, setTelegramReady] = useState(false);
  const [conversations, setConversations] = useState<MessagingConversation[]>([]);
  const [query, setQuery] = useState("");
  const [channelFilter, setChannelFilter] = useState<"all" | "whatsapp" | "telegram">("all");
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState<MessagingMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);

  const load = useCallback(async () => {
    const row = await getMessaging();
    setSendVia(row.sendVia);
    setWhatsappReady(Boolean(row.whatsapp?.ready));
    setTelegramReady(Boolean(row.telegram?.ready));
    setConversations(row.conversations || []);
  }, []);

  useEffect(() => {
    void load().catch((err) => setNote(err instanceof Error ? err.message : "Could not load messages"));
  }, [load]);

  const selected = conversations.find((row) => row.id === selectedId) || null;

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    void getMessagingThread(selectedId)
      .then((row) => setMessages(row.messages || []))
      .catch(() => setMessages([]));
  }, [selectedId]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return conversations.filter((row) => {
      if (channelFilter === "whatsapp" && !row.channels.includes("whatsapp")) return false;
      if (channelFilter === "telegram" && !row.channels.includes("telegram")) return false;
      if (!needle) return true;
      return [row.name, row.mobile, row.broker, row.telegramId].some((value) =>
        String(value || "").toLowerCase().includes(needle),
      );
    });
  }, [channelFilter, conversations, query]);

  const pickVia = async (next: SendVia) => {
    setSendVia(next);
    try {
      await saveMessagingConfig({ sendVia: next });
    } catch {
      /* keep the local choice even if save fails */
    }
  };

  const onSend = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedId || !draft.trim()) return;
    setBusy(true);
    setNote("");
    try {
      const result = await sendMessaging({ contactId: selectedId, text: draft.trim(), via: sendVia });
      setMessages((current) => [...current, result.message]);
      setDraft("");
      if (result.warnings?.length) setNote(result.warnings.join(" "));
      await load();
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Send failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="-m-3 flex min-h-[calc(100dvh-7.5rem)] flex-col overflow-hidden border-y border-[var(--border)] bg-[var(--card)] md:-m-4 md:min-h-[calc(100dvh-5rem)] md:rounded-none">
      <header className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-3 py-2.5 md:px-4">
        <h1 className="text-base font-bold md:text-lg">Messaging integrations</h1>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill kind="whatsapp" ready={whatsappReady} />
          <StatusPill kind="telegram" ready={telegramReady} />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Send via</span>
          <div className="flex overflow-hidden rounded-lg border border-[var(--border)]">
            <ViaButton active={sendVia === "both"} onClick={() => void pickVia("both")}>
              Both
            </ViaButton>
            <ViaButton active={sendVia === "whatsapp"} onClick={() => void pickVia("whatsapp")} title="WhatsApp">
              <WhatsAppIcon />
            </ViaButton>
            <ViaButton active={sendVia === "telegram"} onClick={() => void pickVia("telegram")} title="Telegram">
              <TelegramIcon />
            </ViaButton>
          </div>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 text-sm font-semibold"
            onClick={() => setShowConfig(true)}
          >
            <Gear size={14} />
            Configure
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className={cn("flex w-full shrink-0 flex-col border-[var(--border)] md:w-[320px] md:border-r", selectedId ? "hidden md:flex" : "flex")}>
          <div className="flex items-center justify-between px-3 pt-3">
            <div>
              <div className="text-sm font-bold">Messages</div>
              <div className="text-[11px] text-slate-400">{conversations.length} client conversations</div>
            </div>
            <div className="flex gap-1">
              <button type="button" className="icon-btn" title="Add contact" onClick={() => setShowContact(true)}>
                <UserPlus size={16} />
              </button>
              <button type="button" className="icon-btn" title="Configure" onClick={() => setShowConfig(true)}>
                <Gear size={16} />
              </button>
            </div>
          </div>
          <div className="px-3 pt-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] pl-9 pr-3 text-sm outline-none"
                placeholder="Search clients or number"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="mt-2 flex gap-1">
              <FilterChip on={channelFilter === "whatsapp"} onClick={() => setChannelFilter(channelFilter === "whatsapp" ? "all" : "whatsapp")}>
                <WhatsAppIcon />
                WhatsApp
              </FilterChip>
              <FilterChip on={channelFilter === "telegram"} onClick={() => setChannelFilter(channelFilter === "telegram" ? "all" : "telegram")}>
                <TelegramIcon />
                Telegram
              </FilterChip>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto py-2">
            {filtered.length ? (
              filtered.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setSelectedId(row.id)}
                  className={cn(
                    "flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-[var(--bg)]",
                    selectedId === row.id ? "bg-brand-50 dark:bg-brand-500/10" : "",
                  )}
                >
                  <span className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white", avatarTone(row.name))}>
                    {(row.name || "?").slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{row.name}</span>
                      <span className="shrink-0 text-[10px] text-slate-400">{formatWhen(row.lastAt)}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                      {row.broker || "T2S"}
                      {row.mobile ? ` · ${row.mobile}` : ""}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-slate-500">{row.preview}</span>
                    <span className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      {row.channels.includes("whatsapp") ? "WA" : ""}
                      {row.channels.includes("whatsapp") && row.channels.includes("telegram") ? " · " : ""}
                      {row.channels.includes("telegram") ? "TG" : ""}
                    </span>
                  </span>
                </button>
              ))
            ) : (
              <p className="px-4 py-8 text-center text-sm text-slate-400">No clients yet. Add a contact or wait for a member signup.</p>
            )}
          </div>
        </aside>

        <section className={cn("min-h-0 flex-1 flex-col", selectedId ? "flex" : "hidden md:flex")}>
          {selected ? (
            <>
              <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3">
                <button type="button" className="text-sm font-semibold text-brand-500 md:hidden" onClick={() => setSelectedId("")}>
                  Back
                </button>
                <span className={cn("flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white", avatarTone(selected.name))}>
                  {selected.name.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold">{selected.name}</div>
                  <div className="truncate text-[11px] text-slate-400">
                    {selected.broker || "T2S"}
                    {selected.mobile ? ` · ${formatMobile(selected.mobile)}` : ""}
                    {selected.telegramId ? ` · TG ${selected.telegramId}` : ""}
                  </div>
                </div>
              </div>
              <div className="min-h-0 flex-1 space-y-2 overflow-auto bg-[var(--bg)] p-4">
                {messages.length ? (
                  messages.map((item) => (
                    <div
                      key={item.id}
                      className={cn("max-w-[80%] rounded-2xl px-3 py-2 text-sm", item.mine ? "ml-auto bg-brand-500 text-white" : "bg-[var(--card)]")}
                    >
                      <div>{item.text}</div>
                      <div className={cn("mt-1 text-[10px]", item.mine ? "text-white/70" : "text-slate-400")}>
                        {formatWhen(item.at)}
                        {item.via ? ` · ${item.via}` : ""}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="py-10 text-center text-sm text-slate-400">No messages yet. Send the first note on WhatsApp or Telegram.</p>
                )}
              </div>
              <form onSubmit={(event) => void onSend(event)} className="flex gap-2 border-t border-[var(--border)] p-3">
                <input
                  className="h-10 flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 text-sm outline-none"
                  placeholder="Type a message"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                />
                <button type="submit" disabled={busy || !draft.trim()} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white disabled:opacity-50">
                  <Send size={14} />
                  Send
                </button>
              </form>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-500 dark:bg-brand-500/15">
                <MessageSquare size={28} />
              </span>
              <div>
                <div className="text-lg font-bold">T2S Messaging</div>
                <p className="mt-1 max-w-sm text-sm text-slate-400">Select a client to view messages and start a secure conversation.</p>
              </div>
              <button
                type="button"
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-500 px-5 text-sm font-semibold text-white"
                onClick={() => setShowBroadcast(true)}
              >
                <Users size={16} />
                New broadcast
              </button>
            </div>
          )}
        </section>
      </div>

      {note ? <div className="border-t border-[var(--border)] px-4 py-2 text-xs font-semibold text-amber-600">{note}</div> : null}

      {showConfig ? (
        <ConfigModal
          sendVia={sendVia}
          onClose={() => setShowConfig(false)}
          onSaved={async (next) => {
            setSendVia(next);
            setShowConfig(false);
            await load();
          }}
        />
      ) : null}
      {showContact ? (
        <ContactModal
          onClose={() => setShowContact(false)}
          onSaved={async (id) => {
            setShowContact(false);
            await load();
            setSelectedId(id);
          }}
        />
      ) : null}
      {showBroadcast ? (
        <BroadcastModal
          sendVia={sendVia}
          onClose={() => setShowBroadcast(false)}
          onSent={async (msg) => {
            setShowBroadcast(false);
            setNote(msg);
            await load();
          }}
        />
      ) : null}
    </div>
  );
}

function ConfigModal({
  sendVia,
  onClose,
  onSaved,
}: {
  sendVia: SendVia;
  onClose: () => void;
  onSaved: (sendVia: SendVia) => Promise<void>;
}) {
  const [via, setVia] = useState<SendVia>(sendVia);
  const [whatsappToken, setWhatsappToken] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [telegramToken, setTelegramToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await saveMessagingConfig({
        sendVia: via,
        ...(whatsappToken.trim() ? { whatsappToken: whatsappToken.trim() } : {}),
        ...(phoneNumberId.trim() ? { phoneNumberId: phoneNumberId.trim() } : {}),
        ...(telegramToken.trim() ? { telegramToken: telegramToken.trim() } : {}),
      });
      await onSaved(via);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Configure messaging" onClose={onClose}>
      <form onSubmit={(event) => void onSubmit(event)} className="grid gap-3">
        <p className="text-xs text-slate-400">
          WhatsApp uses Meta Cloud API (access token + phone number ID). Telegram uses a BotFather token. Leave a field blank to keep the saved value. This does not start LIVE trading.
        </p>
        <Field label="Default send via">
          <select className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm" value={via} onChange={(event) => setVia(event.target.value as SendVia)}>
            <option value="both">Both</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="telegram">Telegram</option>
          </select>
        </Field>
        <Field label="WhatsApp access token">
          <input className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm" type="password" value={whatsappToken} onChange={(event) => setWhatsappToken(event.target.value)} placeholder="EAAB…" />
        </Field>
        <Field label="WhatsApp phone number ID">
          <input className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm" value={phoneNumberId} onChange={(event) => setPhoneNumberId(event.target.value)} placeholder="123456789012345" />
        </Field>
        <Field label="Telegram bot token">
          <input className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm" type="password" value={telegramToken} onChange={(event) => setTelegramToken(event.target.value)} placeholder="123456:ABC…" />
        </Field>
        {error ? <p className="text-xs font-semibold text-rose-500">{error}</p> : null}
        <button type="submit" disabled={busy} className="h-10 rounded-xl bg-brand-500 text-sm font-semibold text-white">
          {busy ? "Saving..." : "Save"}
        </button>
      </form>
    </Modal>
  );
}

function ContactModal({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [telegramId, setTelegramId] = useState("");
  const [broker, setBroker] = useState("DHAN");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await addMessagingContact({ name, mobile, telegramId, broker });
      await onSaved(result.contact.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add contact");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Add contact" onClose={onClose}>
      <form onSubmit={(event) => void onSubmit(event)} className="grid gap-3">
        <Field label="Name">
          <input className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm" value={name} onChange={(event) => setName(event.target.value)} placeholder="Client name" />
        </Field>
        <Field label="WhatsApp mobile">
          <input className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm" value={mobile} onChange={(event) => setMobile(event.target.value)} placeholder="10-digit mobile" />
        </Field>
        <Field label="Telegram chat id">
          <input className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm" value={telegramId} onChange={(event) => setTelegramId(event.target.value)} placeholder="123456789 or @username" />
        </Field>
        <Field label="Broker / desk">
          <input className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm" value={broker} onChange={(event) => setBroker(event.target.value)} />
        </Field>
        {error ? <p className="text-xs font-semibold text-rose-500">{error}</p> : null}
        <button type="submit" disabled={busy} className="h-10 rounded-xl bg-brand-500 text-sm font-semibold text-white">
          {busy ? "Saving..." : "Add contact"}
        </button>
      </form>
    </Modal>
  );
}

function BroadcastModal({
  sendVia,
  onClose,
  onSent,
}: {
  sendVia: SendVia;
  onClose: () => void;
  onSent: (note: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await broadcastMessaging({ text, via: sendVia });
      await onSent(`Broadcast sent to ${result.sent} client${result.sent === 1 ? "" : "s"}${result.failed ? ` · ${result.failed} skipped` : ""}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Broadcast failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="New broadcast" onClose={onClose}>
      <form onSubmit={(event) => void onSubmit(event)} className="grid gap-3">
        <textarea
          className="min-h-28 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 text-sm outline-none"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Message every client on the selected channel"
        />
        {error ? <p className="text-xs font-semibold text-rose-500">{error}</p> : null}
        <button type="submit" disabled={busy || !text.trim()} className="h-10 rounded-xl bg-brand-500 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "Sending..." : "Send broadcast"}
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
          <button type="button" className="text-sm font-semibold text-slate-400" onClick={onClose}>
            Close
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

function StatusPill({ kind, ready }: { kind: "whatsapp" | "telegram"; ready: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold",
        ready
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
          : "border-[var(--border)] bg-[var(--bg)] text-slate-500",
      )}
    >
      {kind === "whatsapp" ? <WhatsAppIcon /> : <TelegramIcon />}
      {kind === "whatsapp" ? "WhatsApp" : "Telegram"} • {ready ? "CONNECTED" : "SETUP REQUIRED"}
    </span>
  );
}

function ViaButton({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 min-w-8 items-center justify-center px-2.5 text-xs font-bold",
        active ? "bg-brand-500 text-white" : "bg-[var(--card)] text-slate-500",
      )}
    >
      {children}
    </button>
  );
}

function FilterChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[10px] font-bold uppercase tracking-wide",
        on ? "border-brand-500 bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-blue-200" : "border-[var(--border)] text-slate-400",
      )}
    >
      {children}
    </button>
  );
}

function formatWhen(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function avatarTone(name?: string) {
  const tones = [
    "bg-sky-600",
    "bg-violet-600",
    "bg-emerald-600",
    "bg-amber-600",
    "bg-rose-600",
    "bg-indigo-600",
    "bg-teal-600",
    "bg-orange-600",
  ];
  const text = String(name || "?");
  let hash = 0;
  for (const ch of text) hash = (hash + ch.charCodeAt(0)) % tones.length;
  return tones[hash];
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path
        fill="#25D366"
        d="M12.04 2C6.58 2 2.15 6.4 2.15 11.83c0 1.97.55 3.8 1.5 5.37L2 22l4.96-1.6a10.1 10.1 0 0 0 5.08 1.37h.01c5.46 0 9.89-4.4 9.89-9.84C21.94 6.4 17.5 2 12.04 2zm5.76 14.16c-.24.68-1.4 1.25-1.94 1.33-.5.07-1.13.1-1.82-.11-.42-.13-.95-.31-1.64-.6-2.89-1.25-4.77-4.16-4.92-4.35-.14-.19-1.18-1.57-1.18-3 0-1.42.75-2.12 1.01-2.41.26-.29.57-.36.76-.36h.55c.17 0 .41-.07.64.49.24.58.82 2 .89 2.14.07.15.12.32.02.51-.09.19-.14.32-.27.49-.14.17-.29.38-.41.51-.14.15-.28.31-.12.6.16.29.72 1.19 1.55 1.93 1.07.95 1.97 1.25 2.28 1.4.3.14.48.12.66-.07.18-.19.75-.87.95-1.17.2-.29.4-.24.67-.14.27.1 1.71.81 2 .95.29.15.48.22.55.34.07.12.07.7-.17 1.38z"
      />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path fill="#2AABEE" d="M21.5 4.3 18.2 20.1c-.24 1.1-.9 1.37-1.82.85l-5.03-3.7-2.43 2.33c-.27.27-.5.5-.1.98h.01l.01.01 3.64-5.54 7.55-6.82c.33-.3-.07-.46-.51-.17L7.4 13.16 3.76 12c-1.01-.31-1.03-.99.22-1.48L20.2 3.55c.84-.33 1.57.2 1.3.75z" />
    </svg>
  );
}
