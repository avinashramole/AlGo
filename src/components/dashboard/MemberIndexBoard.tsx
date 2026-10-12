import { cn, formatQuote, quoteDayChange, quoteTone, tapeScriptTitle, tapeSessionLabel } from "../../lib/format";
import { MEMBER_TAPE_UNDERLYINGS } from "../../lib/markets";
import type { MemberIndexQuote } from "../../api/client";
import { DeskTape, TapeCell } from "./DeskTape";
import { TapeTodayChange } from "./TapeTodayChange";

const REQUIRED = [
  ...MEMBER_TAPE_UNDERLYINGS.map((row) => ({
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

  const cards = withRequiredCards(indices);
  return (
    <DeskTape
      kicker="Market tape"
      extra={tapeSessionLabel(cards.map((row) => row.symbol))}
      testId="member-tape"
    >
      {cards.map((item) => {
        const day = quoteDayChange(item);
        const tone = quoteTone(day.change);
        const showDeriv = item.symbol !== "INDIA VIX";
        const futureLtp = item.future || item.price;
        return (
          <TapeCell
            key={item.symbol}
            title={tapeScriptTitle(item.name || item.symbol, item.lot)}
            value={formatQuote(item.price)}
            tone={tone}
          >
            <TapeTodayChange change={day.change} changePct={day.changePct} />
            {showDeriv ? (
              <div className="mt-2 grid grid-cols-1 gap-1 text-[10px]">
                <div>
                  <div className="uppercase tracking-wide text-slate-400">Fut</div>
                  <div className={cn("px font-bold", tone)}>{formatQuote(futureLtp)}</div>
                </div>
              </div>
            ) : null}
          </TapeCell>
        );
      })}
    </DeskTape>
  );
}
