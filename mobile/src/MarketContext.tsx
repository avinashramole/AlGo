import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { activateBroker, connectBroker, createAlgo, deleteAlgo, disconnectBroker, getSnapshot, placeOrder, selectOptionChain, toggleAlgo, updateAlgo, type Snapshot } from "./api";
import { fallbackSnapshot } from "./fallback";

type MarketContextValue = {
  data: Snapshot;
  live: boolean;
  refresh: () => Promise<void>;
  toggle: (id: string) => Promise<void>;
  order: (payload: Record<string, unknown>) => Promise<void>;
  connect: (id: string, payload: { clientId: string; apiKey?: string; accessToken?: string }) => Promise<void>;
  disconnect: (id: string) => Promise<void>;
  activate: (id: string) => Promise<void>;
  selectChain: (symbol: string, expiry?: string) => Promise<void>;
  saveAlgo: (payload: Record<string, unknown>) => Promise<void>;
  removeAlgo: (id: string) => Promise<void>;
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
      connect: async (id: string, payload: { clientId: string; apiKey?: string; accessToken?: string }) => {
        const result = await connectBroker(id, payload);
        if (result.snapshot) setData(result.snapshot);
        else await refresh();
      },
      disconnect: async (id: string) => {
        const result = await disconnectBroker(id);
        if (result.snapshot) setData(result.snapshot);
        else await refresh();
      },
      activate: async (id: string) => {
        const result = await activateBroker(id);
        if (result.snapshot) setData(result.snapshot);
        else await refresh();
      },
      selectChain: async (symbol: string, expiry?: string) => {
        const result = await selectOptionChain(symbol, expiry);
        if (result.snapshot) setData(result.snapshot);
        else await refresh();
      },
      saveAlgo: async (payload: Record<string, unknown>) => {
        const id = String(payload.id || "");
        const result = id ? await updateAlgo(id, payload) : await createAlgo(payload);
        if (result.snapshot) setData(result.snapshot);
        else await refresh();
      },
      removeAlgo: async (id: string) => {
        const result = await deleteAlgo(id);
        if (result.snapshot) setData(result.snapshot);
        else await refresh();
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
