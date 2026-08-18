import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getSnapshot, placeOrder, toggleAlgo, type Snapshot } from "./api";
import { fallbackSnapshot } from "./fallback";

type MarketContextValue = {
  data: Snapshot;
  live: boolean;
  refresh: () => Promise<void>;
  toggle: (id: string) => Promise<void>;
  order: (payload: Record<string, unknown>) => Promise<void>;
};

const MarketContext = createContext<MarketContextValue | null>(null);

export function MarketProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Snapshot>(fallbackSnapshot);
  const [live, setLive] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = await getSnapshot();
      setData(next);
      setLive(true);
    } catch {
      setLive(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => {
      void refresh();
    }, 2500);
    return () => clearInterval(id);
  }, [refresh]);

  const value = useMemo(
    () => ({
      data,
      live,
      refresh,
      toggle: async (id: string) => {
        try {
          await toggleAlgo(id);
          await refresh();
        } catch {
          setData((current) => ({
            ...current,
            algos: current.algos.map((algo) =>
              algo.id === id
                ? { ...algo, enabled: !algo.enabled, status: algo.enabled ? "PAUSED" : "LIVE" }
                : algo,
            ),
          }));
        }
      },
      order: async (payload: Record<string, unknown>) => {
        try {
          await placeOrder(payload);
          await refresh();
        } catch {
          /* offline */
        }
      },
    }),
    [data, live, refresh],
  );

  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>;
}

export function useMarket() {
  const context = useContext(MarketContext);
  if (!context) throw new Error("useMarket");
  return context;
}
