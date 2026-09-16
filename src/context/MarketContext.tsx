import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  activateBroker,
  assignAlgoBroker,
  cancelOrder,
  connectBroker,
  createAlgo,
  deleteAlgo,
  disconnectBroker,
  enableDhanAuto,
  getDeskMtm,
  getSnapshot,
  getDeskFeed,
  placeOrder,
  refreshDhanToken,
  selectOptionChain,
  squareOff,
  toggleAlgo,
  updateAlgo,
  backtestAlgo,
  type BacktestOptions,
  type PlaceOrderResult,
  type Snapshot,
} from "../api/client";
import { useAuth } from "./AuthContext";
import {
  dnaScores,
  indices,
  initialAlgos,
  ohlc,
  optionChain,
  watchlist,
  marketWatch,
} from "../data/mock";
import { defaultBrokers } from "../lib/brokers";
import { isRemotePreviewHost, PREVIEW_DESK_MESSAGE } from "../lib/deskHost";
import { keepStrikeWindow, patchById } from "../lib/deskFeed";

const fallback: Snapshot = {
  indices,
  ohlc,
  dnaScores,
  optionChain,
  algos: initialAlgos,
  positions: [],
  closedTrades: [],
  signals: [],
  watchlist,
  fiiDii: { fii: { buy: 0, sell: 0, net: 0 }, dii: { buy: 0, sell: 0, net: 0 } },
  marketWatch,
  featuredSignal: {
    action: "BUY",
    symbol: "",
    strategy: "",
    expiry: "—",
    confidence: 0,
    risk: "—",
    metrics: [
      { label: "VWAP", value: 0 },
      { label: "DEPTH", value: 0 },
      { label: "OI", value: 0 },
      { label: "VOLUME", value: 0 },
    ],
  },
  sentiment: 50,
  orders: [],
  notifications: [],
  chat: [],
  settings: {},
  totalPnl: 0,
  pnlByBroker: {},
  brokers: defaultBrokers,
  activeBrokerId: "dhan",
  mainBrokerId: "dhan",
  marketStatus: "OPEN",
  serverTime: new Date().toISOString(),
  dhanFeed: {
    live: false,
    source: "idle",
    lastTickAt: null,
    error: null,
    tokenHint: null,
    profileName: null,
    quoteCount: 0,
  },
  futures: [],
  contracts: {
    indices: [
      { root: "NIFTY", parent: "NIFTY 50", symbol: "NIFTY 50", kind: "index", segment: "IDX_I", lot: 65, tradable: false },
      { root: "BANKNIFTY", parent: "BANKNIFTY", symbol: "BANKNIFTY", kind: "index", segment: "IDX_I", lot: 30, tradable: false },
      { root: "FINNIFTY", parent: "FINNIFTY", symbol: "FINNIFTY", kind: "index", segment: "IDX_I", lot: 60, tradable: false },
      { root: "SENSEX", parent: "SENSEX", symbol: "SENSEX", kind: "index", segment: "IDX_I", lot: 20, tradable: false },
      { root: "CRUDEOIL", parent: "CRUDEOIL", symbol: "CRUDEOIL", kind: "index", segment: "MCX_COMM", lot: 100, tradable: false },
    ],
    futures: [],
    optionCount: 0,
  },
  optionMeta: {
    symbol: "NIFTY",
    expiry: "2026-08-25",
    expiries: ["2026-08-25", "2026-09-01", "2026-09-08"],
    spot: 24580.25,
    pcr: 0.86,
    maxPain: 24500,
    atmIv: 12.4,
    source: "demo",
    lastAt: null,
    expiryLabel: "Tue, 25 Aug 2026",
            underlyings: [
      { id: "NIFTY", label: "NIFTY", lot: 65 },
      { id: "BANKNIFTY", label: "BANKNIFTY", lot: 30 },
      { id: "FINNIFTY", label: "FINNIFTY", lot: 60 },
      { id: "SENSEX", label: "SENSEX", lot: 20 },
      { id: "CRUDEOIL", label: "CRUDE OIL", lot: 100 },
    ],
  },
};

const DESK_CACHE_KEY = "t2s-last-desk";

function readCachedDesk(): Snapshot | null {
  try {
    const raw = sessionStorage.getItem(DESK_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Snapshot>;
    if (!Array.isArray(parsed.algos)) return null;
    return { ...fallback, ...parsed, algos: parsed.algos };
  } catch {
    return null;
  }
}

function writeCachedDesk(next: Snapshot) {
  try {
    sessionStorage.setItem(
      DESK_CACHE_KEY,
      JSON.stringify({
        algos: next.algos,
        dhanFeed: next.dhanFeed,
        brokers: next.brokers,
        activeBrokerId: next.activeBrokerId,
        mainBrokerId: next.mainBrokerId,
        marketStatus: next.marketStatus,
        serverTime: next.serverTime,
        positions: next.positions,
        closedTrades: next.closedTrades || [],
        orders: next.orders,
      }),
    );
  } catch {
    /* ignore quota */
  }
}

type MarketContextValue = {
  data: Snapshot;
  live: boolean;
  refresh: () => Promise<void>;
  toggle: (id: string, enabled?: boolean) => Promise<void>;
  setAll: (enabled: boolean) => Promise<void>;
  order: (payload: Record<string, unknown>) => Promise<PlaceOrderResult>;
  connect: (
    id: string,
    payload: { clientId?: string; apiKey?: string; accessToken?: string; sessionToken?: string },
  ) => Promise<void>;
  enableAuto: (payload: {
    clientId?: string;
    loginId?: string;
    pin?: string;
    password?: string;
    totpSecret?: string;
  }) => Promise<void>;
  refreshToken: (payload?: {
    clientId?: string;
    loginId?: string;
    pin?: string;
    password?: string;
    totpSecret?: string;
  }) => Promise<void>;
  disconnect: (id: string) => Promise<void>;
  activate: (id: string) => Promise<void>;
  routeAlgo: (id: string, brokerId: string) => Promise<void>;
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
  const [data, setData] = useState<Snapshot>(() => readCachedDesk() || fallback);
  const [live, setLive] = useState(() => Boolean(readCachedDesk()));
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
      writeCachedDesk(next);
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
    writeCachedDesk(next);
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
        return {
          ...row,
          ...next,
          enabled,
          status,
        };
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
        orders: feed.orders ? patchById(current.orders || [], feed.orders) : current.orders,
        closedTrades: feed.closedTrades ? patchById(current.closedTrades || [], feed.closedTrades) : current.closedTrades,
        report: current.report,
        chat: current.chat,
        notifications: current.notifications,
        settings: current.settings,
        contracts: current.contracts,
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

  const refreshMtm = useCallback(async () => {
    try {
      const mtm = await getDeskMtm();
      setData((current) => {
        const byId = new Map((mtm.positions || []).map((row) => [row.id, row]));
        if (!byId.size) return current;
        const positions = (current.positions || []).map((row) => {
          const next = byId.get(row.id);
          return next ? { ...row, ltp: next.ltp, pnl: next.pnl } : row;
        });
        const next = { ...current, positions };
        dataRef.current = next;
        return next;
      });
    } catch {
      /* keep last snapshot */
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
    const feedId = window.setInterval(() => {
      void refreshFeed();
    }, 2000);
    const snapId = window.setInterval(() => {
      void refresh();
    }, 30000);
    return () => {
      window.clearInterval(feedId);
      window.clearInterval(snapId);
    };
  }, [admin, refresh, refreshFeed]);

  const liveOpen = Boolean(data.dhanFeed?.live) && (data.positions || []).some((row) => row.live || row.brokerId === "dhan");
  useEffect(() => {
    if (!admin || !liveOpen) return;
    void refreshMtm();
    const id = window.setInterval(() => {
      void refreshMtm();
    }, 300);
    return () => window.clearInterval(id);
  }, [admin, liveOpen, refreshMtm]);

  const value = useMemo(
    () => ({
      data,
      live,
      refresh,
      toggle: async (id: string, enabled?: boolean) => {
        const previous = (dataRef.current.algos || []).find((row) => row.id === id);
        if (!previous) throw new Error("Strategy not found");
        const nextEnabled = enabled === undefined ? !previous.enabled : enabled;
        if (nextEnabled === Boolean(previous.enabled)) return;
        if (previous.runMode === "backtest" && nextEnabled) {
          throw new Error("Backtest strategies do not go live. Use Run backtest.");
        }
        if (nextEnabled && previous.runMode !== "backtest" && !dataRef.current.dhanFeed?.live) {
          throw new Error(
            previous.runMode === "paper"
              ? "Paper trading uses the live Dhan feed. Connect Access Token on Brokers first."
              : "Start live needs Dhan LIVE — real CE/PE and futures orders only.",
          );
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
          throw err;
        }
      },
      setAll: async (enabled: boolean) => {
        const rows = (dataRef.current.algos || []).filter((row) => {
          if (row.runMode === "backtest") return false;
          return Boolean(row.enabled) !== enabled;
        });
        if (!rows.length) return;
        if (enabled && !dataRef.current.dhanFeed?.live) {
          throw new Error("Start live needs Dhan LIVE — real CE/PE and futures orders only.");
        }
        snapshotGen.current += 1;
        for (const row of rows) {
          const status = enabled ? (row.runMode === "paper" ? "PAPER" : "LIVE") : "PAUSED";
          pendingToggles.current.set(row.id, { enabled, status });
          patchAlgo(row.id, { enabled, status });
        }
        const results = await Promise.allSettled(rows.map((row) => toggleAlgo(row.id, enabled)));
        const failed: string[] = [];
        results.forEach((result, index) => {
          const row = rows[index];
          const status = enabled ? (row.runMode === "paper" ? "PAPER" : "LIVE") : "PAUSED";
          if (result.status === "fulfilled" && result.value.algo?.id) {
            patchAlgo(result.value.algo.id, { ...result.value.algo, enabled, status });
            return;
          }
          pendingToggles.current.delete(row.id);
          patchAlgo(row.id, row);
          if (result.status === "rejected") {
            failed.push(result.reason instanceof Error ? result.reason.message : String(result.reason || row.name));
          } else if (result.status === "fulfilled" && result.value.algo == null) {
            failed.push(`${row.name} was not found`);
          }
        });
        if (failed.length) throw new Error(failed[0]);
      },
      order: async (payload: Record<string, unknown>) => {
        if (isRemotePreviewHost()) {
          throw new Error(PREVIEW_DESK_MESSAGE);
        }
        let applied = false;
        try {
          const result = await placeOrder(payload);
          if (result.snapshot) {
            mergeSnapshot(result.snapshot);
            applied = true;
          } else await refresh();
          const status = String(result.order?.status || "").toUpperCase();
          if (result.error || result.ok === false || status === "REJECTED") {
            throw new Error(result.error || result.order?.reason || "Dhan did not place this order.");
          }
          return result;
        } catch (err) {
          if (!applied) await refresh();
          throw err;
        }
      },
      connect: async (
        id: string,
        payload: { clientId?: string; apiKey?: string; accessToken?: string; sessionToken?: string },
      ) => {
        const result = await connectBroker(id, payload);
        if (result.snapshot) mergeSnapshot(result.snapshot);
        else await refresh();
      },
      enableAuto: async (payload: {
        clientId?: string;
        loginId?: string;
        pin?: string;
        password?: string;
        totpSecret?: string;
      }) => {
        const result = await enableDhanAuto(payload);
        if (result.snapshot) mergeSnapshot(result.snapshot);
        else await refresh();
      },
      refreshToken: async (payload = {}) => {
        const result = await refreshDhanToken(payload);
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
      routeAlgo: async (id: string, brokerId: string) => {
        await assignAlgoBroker(id, brokerId);
        await refresh();
      },
      selectChain: async (symbol: string, expiry?: string) => {
        const result = await selectOptionChain(symbol, expiry);
        if (result.snapshot) mergeSnapshot(result.snapshot);
        else await refresh();
      },
      saveAlgo: async (payload: Record<string, unknown>) => {
        const id = String(payload.id || "");
        const result = id ? await updateAlgo(id, payload) : await createAlgo(payload);
        if (result.snapshot) {
          mergeSnapshot(result.snapshot);
          return;
        }
        if (result.algo) {
          setData((current) => {
            const next = result.algo as Snapshot["algos"][number];
            const algos = current.algos || [];
            const exists = algos.some((row) => row.id === next.id);
            return {
              ...current,
              algos: exists ? algos.map((row) => (row.id === next.id ? { ...row, ...next } : row)) : [next, ...algos],
            };
          });
        }
        void refresh();
      },
      removeAlgo: async (id: string) => {
        const result = await deleteAlgo(id);
        if (result.snapshot) {
          mergeSnapshot(result.snapshot);
          return;
        }
        setData((current) => ({
          ...current,
          algos: (current.algos || []).filter((row) => row.id !== id),
        }));
        void refresh();
      },
      backtest: async (id: string, options?: BacktestOptions) => {
        const result = await backtestAlgo(id, options);
        if (result.snapshot) mergeSnapshot(result.snapshot);
        else await refresh();
      },
      cancel: async (id: string) => {
        const result = await cancelOrder(id);
        if (result.snapshot) mergeSnapshot(result.snapshot);
        else await refresh();
      },
      closePosition: async (id: string) => {
        const result = await squareOff(id);
        if (result.snapshot) mergeSnapshot(result.snapshot);
        else await refresh();
      },
    }),
    [data, live, refresh],
  );

  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>;
}

export function useMarket() {
  const context = useContext(MarketContext);
  if (!context) throw new Error("useMarket must be used within MarketProvider");
  return context;
}
