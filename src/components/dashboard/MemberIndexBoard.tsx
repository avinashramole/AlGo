import { cn, formatChange, formatPct, formatQuote, indexTapeLabel, quoteTone } from "../../lib/format";
import { OPTION_UNDERLYINGS } from "../../lib/markets";
import type { MemberIndexQuote } from "../../api/client";
import { DeskTape, TapeCell } from "./DeskTape";

const REQUIRED = [
  ...OPTION_UNDERLYINGS.map((row) => ({
    symbol: row.id === "NIFTY" ? "NIFTY 50" : row.id,
    name: row.label,
    lot: row.lot,
  })),
  { symbol: "INDIA VIX", name: "VIX", lot: 0 },
];

function withRequiredCards(indices: MemberIndexQuote[]) {
  const bySymbol = new Map(indices.map((row) => [row.symbol, row]));
  return REQUIRED.map((card) => {
    const hit = bySymbol.get(card.symbol) || (card.symbol === "NIFTY 50" ? bySymbol.get("NIFTY") : undefined);
    return (
      hit || {
        symbol: card.symbol,
        name: card.name,
        price: 0,
        change: 0,
        changePct: 0,
        spark: [],
        future: 0,
        futureExpiry: "",
        lot: card.lot,
      }
    );
  });
}

export function MemberIndexBoard({ indices, note }: { indices: MemberIndexQuote[]; note?: string }) {
  if (!indices.length) {
    return (
      <DeskTape kicker="Market tape" extra="Member" testId="member-tape">
        <TapeCell title="Quotes" value="—" detail={note || "Desk live tape will fill here from the admin broker until you install your own on Profile."} />
      </DeskTape>
    );
  }

  return (
    <DeskTape kicker="Market tape" extra="Tap lot" testId="member-tape">
      {withRequiredCards(indices).map((item) => {
        const tone = quoteTone(item.change);
        const showDeriv = item.symbol !== "INDIA VIX";
        return (
          <TapeCell
            key={item.symbol}
            title={`${item.name || item.symbol}${item.lot ? ` · ${item.lot}` : ""}`}
            value={formatQuote(item.price)}
            detail={`${formatChange(item.change)} (${formatPct(item.changePct)}) · ${indexTapeLabel(item.symbol)}`}
            tone={tone}
          >
            {showDeriv ? (
              <div className="mt-2 grid grid-cols-2 gap-1 text-[10px]">
                <div>
                  <div className="uppercase tracking-wide text-slate-400">Fut</div>
                  <div className={cn("px font-bold", tone)}>{formatQuote(item.future || item.price)}</div>
                </div>
                <div>
                  <div className="uppercase tracking-wide text-slate-400">Lot</div>
                  <div className="font-bold">{item.lot || "—"}</div>
                </div>
              </div>
            ) : null}
          </TapeCell>
        );
      })}
    </DeskTape>
  );
}
