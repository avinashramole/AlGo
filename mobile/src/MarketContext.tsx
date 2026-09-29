import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Alert } from "react-native";
import { activateBroker, backtestAlgo, connectBroker, createAlgo, deleteAlgo, disconnectBroker, getDeskFeed, getSnapshot, placeOrder, cancelOrder, selectOptionChain, squareOff, toggleAlgo, updateAlgo, type BacktestOptions, type Snapshot } from "./api";
import { useAuth } from "./AuthContext";
import { keepStrikeWindow, patchById } from "./deskFeed";
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

  const clearStrategyOrders = (name: string) => {
    const strategy = String(name || "").trim();
    if (!strategy) return;
    setData((current) => {
      const orders = (current.orders || []).filter((row) => row.strategy !== strategy);
      if (orders.length === (current.orders || []).length) return current;
      const next = { ...current, orders };
      dataRef.current = next;
      return next;
    });
  };

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
    const current = dataRef.current;
    const algos = (incoming.algos || []).map((row) => {
      const hold = pending.get(row.id);
      if (!hold) return row;
      if (Boolean(row.enabled) === hold.enabled) pending.delete(row.id);
      return { ...row, enabled: hold.enabled, status: hold.status };
    });
    const sameDesk =
      current.optionMeta?.symbol === incoming.optionMeta?.symbol &&
      current.optionMeta?.expiry === incoming.optionMeta?.expiry;
    const optionChain = sameDesk
      ? keepStrikeWindow(current.optionChain || [], incoming.optionChain || [])
      : incoming.optionChain || [];
    const next = { ...incoming, algos, optionChain };
    dataRef.current = next;
    setData(next);
  };

  const applyFeed = (feed: Partial<Snapshot>) => {
    const pending = pendingToggles.current;
    setData((current) => {
      const incomingAlgos = feed.algos || [];
      const byId = new Map(incomingAlgos.map((row) => [row.id, row]));
      const algos = (current.algos || []).map((row) => {
        const next = byId.get(row.id);
        if (!next) return row;
        const hold = pending.get(row.id);
        const enabled = hold ? hold.enabled : next.enabled;
        const status = hold ? hold.status : next.status;
        if (hold && Boolean(next.enabled) === hold.enabled) pending.delete(row.id);
        return { ...row, ...next, enabled, status };
      });
      const sameDesk =
        current.optionMeta?.symbol === (feed.optionMeta?.symbol || current.optionMeta?.symbol) &&
        current.optionMeta?.expiry === (feed.optionMeta?.expiry || current.optionMeta?.expiry);
      const optionChain = sameDesk
        ? keepStrikeWindow(current.optionChain || [], feed.optionChain || current.optionChain || [])
        : feed.optionChain || current.optionChain;
      const next = {
        ...current,
        ...feed,
        algos,
        optionChain,
        optionMeta: feed.optionMeta ? { ...current.optionMeta, ...feed.optionMeta } : current.optionMeta,
        positions: feed.positions ? patchById(current.positions || [], feed.positions) : current.positions,
        orders: Array.isArray(feed.orders) ? feed.orders : current.orders,
        report: current.report,
        brokers: current.brokers,
      };
      dataRef.current = next;
      return next;
    });
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

  const refreshFeed = useCallback(async () => {
    const gen = snapshotGen.current;
    try {
      const feed = await getDeskFeed();
      if (gen !== snapshotGen.current) return;
      applyFeed(feed);
      setLive(true);
    } catch {
      if (gen !== snapshotGen.current) return;
    }
  }, []);

  useEffect(() => {
    if (!admin) {
      setLive(false);
      return;
    }
    void refresh();
    const feedId = setInterval(() => {
      void refreshFeed();
    }, 2000);
    const snapId = setInterval(() => {
      void refresh();
    }, 30000);
    return () => {
      clearInterval(feedId);
      clearInterval(snapId);
    };
  }, [admin, refresh, refreshFeed]);

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
          if (nextEnabled) clearStrategyOrders(previous.name);
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
        const wantedSymbol = String(symbol || "NIFTY").toUpperCase();
        const wantedExpiry = String(expiry || "").slice(0, 10);
        snapshotGen.current += 1;
        setData((current) => {
          const sameSymbol = String(current.optionMeta?.symbol || "").toUpperCase() === wantedSymbol;
          const currentExpiry = String(current.optionMeta?.expiries?.[0] || "").slice(0, 10);
          const nextExpiry = wantedExpiry || (sameSymbol ? currentExpiry : current.optionMeta?.expiry);
          const next = {
            ...current,
            optionMeta: {
              ...current.optionMeta,
              symbol: wantedSymbol,
              expiry: nextExpiry || current.optionMeta?.expiry,
            },
            optionChain:
              sameSymbol && (!wantedExpiry || wantedExpiry === String(current.optionMeta?.expiry || "").slice(0, 10))
                ? current.optionChain
                : [],
          };
          dataRef.current = next;
          return next;
        });
        const result = await selectOptionChain(wantedSymbol, expiry);
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
