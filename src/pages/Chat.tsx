export function Chat() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-3 text-xl font-bold">Desk Chat</h1>
      <section className="card flex min-h-[420px] flex-col p-4">
        <div className="flex-1 space-y-3 text-sm">
          <Bubble from="Risk" text="VIX crushed 3%. Prefer defined-risk spreads." />
          <Bubble from="Algo" text="VWAP Depth confidence 91% on 24500 CE." />
          <Bubble from="You" text="Reviewing the ticket now." mine />
        </div>
        <input
          className="mt-4 h-10 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 text-sm outline-none"
          placeholder="Message the desk..."
        />
      </section>
    </div>
  );
}

function Bubble({ from, text, mine }: { from: string; text: string; mine?: boolean }) {
  return (
    <div className={`max-w-[80%] rounded-xl px-3 py-2 ${mine ? "ml-auto bg-brand-500 text-white" : "bg-[var(--bg)]"}`}>
      {!mine && <div className="text-[10px] font-bold uppercase text-slate-400">{from}</div>}
      <div>{text}</div>
    </div>
  );
}
