import { X } from "lucide-react";
import { useState } from "react";
import { useMarket } from "../../context/MarketContext";
import { formatNumber } from "../../lib/format";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function TradeModal({ open, onClose }: Props) {
  const { order, data } = useMarket();
  const [busy, setBusy] = useState(false);
  if (!open) return null;

  const submit = async () => {
    setBusy(true);
    try {
      await order({
        symbol: data.featuredSignal.symbol,
        side: data.featuredSignal.action,
        qty: 75,
        price: 142.75,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="card w-full max-w-md p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-bold">Review Trade</div>
            <div className="text-xs text-slate-400">
              {data.featuredSignal.symbol} · {data.featuredSignal.action}
            </div>
          </div>
          <button type="button" onClick={onClose} className="icon-btn">
            <X size={16} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Product" value="MIS" />
          <Field label="Order type" value="MARKET" />
          <Field label="Quantity" value="75 (1 lot)" />
          <Field label="Est. premium" value={`₹${formatNumber(142.75)}`} />
          <Field label="Stop loss" value="118.40" />
          <Field label="Target" value="176.00" />
        </div>
        <div className="mt-4 rounded-lg bg-[var(--bg)] p-3 text-xs text-slate-500">
          Max risk ₹1,827.50 · Confidence {data.featuredSignal.confidence}% · Risk {data.featuredSignal.risk}
        </div>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onClose} className="h-10 flex-1 rounded-xl border border-[var(--border)] text-sm font-semibold">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className="h-10 flex-1 rounded-xl bg-brand-500 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Placing..." : "Place Order"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 font-semibold">{value}</div>
    </div>
  );
}
