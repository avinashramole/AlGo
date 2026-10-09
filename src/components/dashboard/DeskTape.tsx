import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/format";

export function DeskTape({
  kicker,
  extra,
  testId,
  children,
}: {
  kicker: string;
  extra?: ReactNode;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <section className="card overflow-x-auto p-0" data-desk-tape={testId || kicker.toLowerCase().replace(/\s+/g, "-")}>
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-1.5">
        <div className="desk-kicker">{kicker}</div>
        {extra ? <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{extra}</div> : null}
      </div>
      <div className="tape-strip">{children}</div>
    </section>
  );
}

type TapeCellProps = {
  title: string;
  value?: ReactNode;
  detail?: ReactNode;
  tone?: string;
  children?: ReactNode;
} & (
  | ({ onClick: () => void } & ButtonHTMLAttributes<HTMLButtonElement>)
  | ({ onClick?: undefined } & HTMLAttributes<HTMLDivElement>)
);

export function TapeCell({ title, value, detail, tone, children, onClick, className, ...rest }: TapeCellProps) {
  const body = (
    <>
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{title}</div>
      {value != null ? <div className={cn("px mt-1 text-lg font-extrabold leading-none", tone)}>{value}</div> : null}
      {detail != null ? <div className={cn("mt-1 text-[11px] font-semibold", tone || "text-slate-400")}>{detail}</div> : null}
      {children}
    </>
  );
  const cellClass = cn("tape-cell text-left", onClick && "cursor-pointer hover:bg-[var(--card-muted)]", className);
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cellClass} {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}>
        {body}
      </button>
    );
  }
  return (
    <div className={cellClass} {...(rest as HTMLAttributes<HTMLDivElement>)}>
      {body}
    </div>
  );
}
