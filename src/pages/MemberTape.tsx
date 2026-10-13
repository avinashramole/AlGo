import { useEffect, useState } from "react";
import { getMemberQuotes, type MemberIndexQuote } from "../api/client";
import { MemberIndexBoard } from "../components/dashboard/MemberIndexBoard";

export function MemberTape() {
  const [indices, setIndices] = useState<MemberIndexQuote[]>([]);
  const [quoteNote, setQuoteNote] = useState("");

  useEffect(() => {
    let alive = true;
    const load = () => {
      void getMemberQuotes()
        .then((quotes) => {
          if (!alive) return;
          setIndices(quotes.indices || []);
          setQuoteNote(quotes.reason || "");
        })
        .catch(() => undefined);
    };
    load();
    const id = window.setInterval(load, 2000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  return (
    <div className="space-y-3" data-member-tape-page="true" data-market-tape="page">
      <div>
        <h1 className="text-lg font-bold">Market tape</h1>
        <p className="text-sm text-slate-400">Live index and MCX quotes.</p>
      </div>
      <MemberIndexBoard indices={indices} note={quoteNote} />
    </div>
  );
}
