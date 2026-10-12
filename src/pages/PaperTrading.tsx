import { Orders } from "./Orders";
import { PositionsDesk } from "./PositionsDesk";

export function PaperTrading({ embedded = false }: { embedded?: boolean }) {
  return (
    <div className="space-y-3" data-paper-book="true">
      {embedded ? null : <h1 className="text-xl font-bold">Paper trading</h1>}
      <p className="text-sm text-slate-400">
        Virtual paper fills at the live LTP. These rows are not sent to the broker.
      </p>
      <PositionsDesk embedded book="paper" />
      <Orders embedded book="paper" />
    </div>
  );
}
