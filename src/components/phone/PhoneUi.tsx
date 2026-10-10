import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn, formatInr, formatRupee } from "../../lib/format";

export function initials(name?: string) {
  const parts = String(name || "T").trim().split(/\s+/).filter(Boolean);
  const letters = (parts[0]?.[0] || "T") + (parts[1]?.[0] || "");
  return letters.toUpperCase();
}

export function Avatar({ name, size = "md" }: { name?: string; size?: "sm" | "md" | "lg" }) {
  const box = size === "lg" ? "h-14 w-14 text-lg" : size === "sm" ? "h-8 w-8 text-[11px]" : "h-10 w-10 text-sm";
  return (
    <div className={cn("flex items-center justify-center rounded-full bg-brand-500 font-extrabold text-white", box)}>
      {initials(name)}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  wide,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ id: T; label: string }>;
  wide?: boolean;
}) {
  return (
    <div className={cn("flex rounded-full bg-[#eef2f7] p-1", wide && "w-full")} data-phone-tabs="true">
      {options.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={cn(
            "h-9 flex-1 rounded-full px-3 text-xs font-bold transition-colors",
            value === item.id ? "bg-white text-[#0f2744] shadow-sm" : "text-slate-400",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function FilterChips<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ id: T; label: string }>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-semibold",
            value === item.id ? "bg-brand-500 text-white" : "bg-white text-slate-500 ring-1 ring-[var(--border)]",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function MetricTile({
  label,
  value,
  signed,
  onClick,
}: {
  label: string;
  value: string;
  signed?: number;
  onClick?: () => void;
}) {
  const tone = signed == null ? "" : signed > 0 ? "text-up" : signed < 0 ? "text-down" : "text-[var(--text)]";
  const body = (
    <>
      <div className="text-[11px] font-semibold text-slate-400">{label}</div>
      <div className={cn("mt-1 truncate text-sm font-extrabold", tone)}>{value}</div>
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="card min-w-0 p-3 text-left">
        {body}
      </button>
    );
  }
  return <div className="card min-w-0 p-3">{body}</div>;
}

export function QuickLink({
  to,
  label,
  icon: Icon,
}: {
  to: string;
  label: string;
  icon: LucideIcon;
}) {
  return (
    <Link to={to} className="card flex flex-col items-center gap-2 px-2 py-3 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
        <Icon size={18} />
      </span>
      <span className="text-[11px] font-bold text-slate-600">{label}</span>
    </Link>
  );
}

export function SectionHead({
  title,
  action,
  to,
}: {
  title: string;
  action?: string;
  to?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-sm font-extrabold">{title}</h2>
      {action && to ? (
        <Link to={to} className="text-[11px] font-semibold text-brand-500">
          {action}
        </Link>
      ) : null}
    </div>
  );
}

export function SettingsRow({
  icon: Icon,
  label,
  detail,
  to,
  onClick,
  danger,
}: {
  icon: LucideIcon;
  label: string;
  detail?: string;
  to?: string;
  onClick?: () => void;
  danger?: boolean;
}) {
  const inner = (
    <>
      <span
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-2xl",
          danger ? "bg-rose-50 text-down" : "bg-brand-50 text-brand-500",
        )}
      >
        <Icon size={18} />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className={cn("block text-sm font-bold", danger && "text-down")}>{label}</span>
        {detail ? <span className="block truncate text-[11px] text-slate-400">{detail}</span> : null}
      </span>
      {danger ? null : <ChevronRight size={16} className="text-slate-300" />}
    </>
  );
  if (to) {
    return (
      <Link to={to} className="flex items-center gap-3 px-4 py-3">
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3">
      {inner}
    </button>
  );
}

export function StatusPill({
  label,
  tone = "muted",
}: {
  label: string;
  tone?: "live" | "paper" | "stop" | "up" | "down" | "muted";
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase",
        tone === "live" && "status-live",
        tone === "paper" && "status-paper",
        tone === "stop" && "status-stop",
        tone === "up" && "bg-emerald-50 text-up",
        tone === "down" && "bg-rose-50 text-down",
        tone === "muted" && "bg-slate-100 text-slate-500",
      )}
    >
      {label}
    </span>
  );
}

export function Money({ value, signed = true, className }: { value: number; signed?: boolean; className?: string }) {
  const text = signed ? formatInr(value) : formatRupee(value);
  const tone = value > 0 ? "text-up" : value < 0 ? "text-down" : "";
  return <span className={cn("font-extrabold", tone, className)}>{text}</span>;
}

export function EmptyState({ title, text }: { title: string; text?: string }) {
  return (
    <div className="card px-4 py-8 text-center">
      <div className="text-sm font-bold">{title}</div>
      {text ? <p className="mt-1 text-xs text-slate-400">{text}</p> : null}
    </div>
  );
}

export function PhoneCard({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("card overflow-hidden", className)}>{children}</section>;
}
