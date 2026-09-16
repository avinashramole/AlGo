import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Alert } from "react-native";
import { activateBroker, backtestAlgo, connectBroker, createAlgo, deleteAlgo, disconnectBroker, getSnapshot, placeOrder, cancelOrder, selectOptionChain, squareOff, toggleAlgo, updateAlgo, type BacktestOptions, type Snapshot } from "./api";
import { useAuth } from "./AuthContext";
import { fallbackSnapshot } from "./fallback";

type MarketContextValue = {
  data: Snapshot;
  live: boolean;
  refresh: () => Promise<void>;
  toggle: (id: string, enabled?: boolean) => Promise<void>;
  order: (payload: Record<string, unknown>) => Promise<{ ok: boolean; live?: boolean; warning?: string; snapshot?: Snapshot }>;
  connect: (id: string, payload: { clientId: string; apiKey?: string; accessToken?: string }) => Promise<void>;
  disconnect: (id: string) => Promise<void>;
  activate: (id: string) => Promise<void>;
  selectChain: (symbol: string, expiry?: string) => Promise<void>;
  saveAlgo: (payload: Record<string, unknown>) => Promise<void>;
  removeAlgo: (id: string) => Promise<void>;
  backtest: (id: string, options?: BacktestOptions) => Promise<void>;
  cancel: (id: string) => Promise<void>;
  closePosition: (id: string) => Promise<void>;
};

const MarketContext = createContext<MarketContextValue | null>(null);

export function MarketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const admin = user?.role === "admin";
  const [data, setData] = useState<Snapshot>(fallbackSnapshot);
  const [live, setLive] = useState(false);
  const snapshotGen = useRef(0);
  const dataRef = useRef(data);
  const liveRef = useRef(live);
  const pendingToggles = useRef(new Map<string, { enabled: boolean; status: Snapshot["algos"][number]["status"] }>());

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    liveRef.current = live;
  }, [live]);

  const patchAlgo = (id: string, patch: Partial<Snapshot["algos"][number]>) => {
    setData((current) => {
      const next = {
        ...current,
        algos: (current.algos || []).map((row) => (row.id === id ? { ...row, ...patch } : row)),
      };
      dataRef.current = next;
      return next;
    });
  };

  const mergeSnapshot = (incoming: Snapshot) => {
    const pending = pendingToggles.current;
    const algos = (incoming.algos || []).map((row) => {
      const hold = pending.get(row.id);
      if (!hold) return row;
      if (Boolean(row.enabled) === hold.enabled) pending.delete(row.id);
      return { ...row, enabled: hold.enabled, status: hold.status };
    });
    const next = { ...incoming, algos };
    dataRef.current = next;
    setData(next);
  };

  const refresh = useCallback(async () => {
    const gen = ++snapshotGen.current;
    try {
      const next = await getSnapshot();
      if (gen !== snapshotGen.current) return;
      mergeSnapshot(next);
      setLive(true);
    } catch {
      if (gen !== snapshotGen.current) return;
      if (!liveRef.current) setLive(false);
    }
  }, []);

  useEffect(() => {
    if (!admin) {
      setLive(false);
      return;
    }
    void refresh();
    const id = setInterval(() => {
      void refresh();
    }, 2500);
    return () => clearInterval(id);
  }, [admin, refresh]);

  const value = useMemo(
    () => ({
      data,
      live,
      refresh,
      toggle: async (id: string, enabled?: boolean) => {
        const previous = (dataRef.current.algos || []).find((row) => row.id === id);
        if (!previous) {
          Alert.alert("Paper / live", "Strategy not found");
          return;
        }
        const nextEnabled = enabled === undefined ? !previous.enabled : enabled;
        if (nextEnabled === Boolean(previous.enabled)) return;
        if (previous.runMode === "backtest" && nextEnabled) {
          Alert.alert("Paper / live", "Backtest strategies do not go live. Use Run backtest.");
          return;
        }
        if (nextEnabled && previous.runMode !== "backtest" && !dataRef.current.dhanFeed?.live) {
          Alert.alert(
            "Paper / live",
            previous.runMode === "paper"
              ? "Paper trading uses the live Dhan feed. Connect Access Token on Brokers first."
              : "Start live needs Dhan LIVE — real CE/PE and futures orders only.",
          );
          return;
        }
        const status = nextEnabled ? (previous.runMode === "paper" ? "PAPER" : "LIVE") : "PAUSED";
        pendingToggles.current.set(id, { enabled: nextEnabled, status });
        snapshotGen.current += 1;
        patchAlgo(id, { enabled: nextEnabled, status });
        try {
          const result = await toggleAlgo(id, nextEnabled);
          const next = result.algo;
          if (next?.id) patchAlgo(next.id, { ...next, enabled: nextEnabled, status });
        } catch (err) {
          pendingToggles.current.delete(id);
          patchAlgo(id, previous);
          Alert.alert("Paper / live", err instanceof Error ? err.message : "Could not start");
        }
      },
      order: async (payload: Record<string, unknown>) => {
        try {
          const result = await placeOrder(payload);
          if (result.snapshot) mergeSnapshot(result.snapshot);
          else await refresh();
          const status = String(result.order?.status || "").toUpperCase();
          if (result.error || result.ok === false || status === "REJECTED") {
            throw new Error(result.error || result.order?.reason || "Dhan did not place this order.");
          }
          return result;
        } catch (err) {
          await refresh();
          throw err;
        }
      },
      connect: async (id: string, payload: { clientId: string; apiKey?: string; accessToken?: string }) => {
        const result = await connectBroker(id, payload);
        if (result.snapshot) mergeSnapshot(result.snapshot);
        else await refresh();
      },
      disconnect: async (id: string) => {
        const result = await disconnectBroker(id);
        if (result.snapshot) mergeSnapshot(result.snapshot);
        else await refresh();
      },
      activate: async (id: string) => {
        const result = await activateBroker(id);
        if (result.snapshot) mergeSnapshot(result.snapshot);
        else await refresh();
      },
      selectChain: async (symbol: string, expiry?: string) => {
        const result = await selectOptionChain(symbol, expiry);
        if (result.snapshot) mergeSnapshot(result.snapshot);
        else await refresh();
      },
      saveAlgo: async (payload: Record<string, unknown>) => {
        const id = String(payload.id || "");
        const result = id ? await updateAlgo(id, payload) : await createAlgo(payload);
        if (result.snapshot) mergeSnapshot(result.snapshot);
        else await refresh();
      },
      removeAlgo: async (id: string) => {
        const result = await deleteAlgo(id);
        if (result.snapshot) mergeSnapshot(result.snapshot);
        else await refresh();
      },
      backtest: async (id: string, options?: BacktestOptions) => {
        const result = await backtestAlgo(id, options);
        if (result.snapshot) mergeSnapshot(result.snapshot);
        else await refresh();
      },
      cancel: async (id: string) => {
        try {
          const result = await cancelOrder(id);
          if (result.snapshot) mergeSnapshot(result.snapshot);
          else await refresh();
        } catch {
          /* offline */
        }
      },
      closePosition: async (id: string) => {
        try {
          const result = await squareOff(id);
          if (result.snapshot) mergeSnapshot(result.snapshot);
          else await refresh();
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
