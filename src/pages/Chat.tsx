import { useState, type FormEvent } from "react";
import { sendChat } from "../api/client";
import { useMarket } from "../context/MarketContext";

export function Chat() {
  const { data, refresh } = useMarket();
  const [text, setText] = useState("");
  const messages = data.chat.length
    ? data.chat
    : [
        { from: "Risk", text: "VIX crushed 3%. Prefer defined-risk spreads.", mine: false },
        { from: "Algo", text: "VWAP Depth confidence 91% on 24500 CE.", mine: false },
        { from: "You", text: "Reviewing the ticket now.", mine: true },
      ];

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    try {
      await sendChat(text.trim());
      await refresh();
    } catch {
      /* offline demo */
    }
    setText("");
  };

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-3 text-xl font-bold">Desk Chat</h1>
      <section className="card flex min-h-[420px] flex-col p-4">
        <div className="flex-1 space-y-3 text-sm">
          {messages.map((item, i) => (
            <Bubble key={`${item.text}-${i}`} from={item.from} text={item.text} mine={item.mine} />
          ))}
        </div>
        <form onSubmit={(event) => void onSubmit(event)}>
          <input
            className="mt-4 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 text-sm outline-none"
            placeholder="Message the desk..."
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </form>
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
