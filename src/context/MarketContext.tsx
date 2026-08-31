import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  activateBroker,
  assignAlgoBroker,
  cancelOrder,
  connectBroker,
  createAlgo,
  deleteAlgo,
  disconnectBroker,
  enableDhanAuto,
  getSnapshot,
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
import {
  dnaScores,
  fiiDii,
  indices,
  initialAlgos,
  ohlc,
  optionChain,
  positions,
  recentSignals,
  watchlist,
  marketWatch,
} from "../data/mock";
import { defaultBrokers } from "../lib/brokers";
import { isRemotePreviewHost, PREVIEW_DESK_MESSAGE } from "../lib/deskHost";

const fallback: Snapshot = {
  indices,
  ohlc,
  dnaScores,
  optionChain,
  algos: initialAlgos,
  positions,
  signals: recentSignals,
  watchlist,
  fiiDii,
  marketWatch,
  featuredSignal: {
    action: "BUY",
    symbol: "NIFTY 24,500 CE",
    strategy: "VWAP Depth",
    expiry: "25 Aug",
    confidence: 91,
    risk: "LOW",
    metrics: [
      { label: "VWAP", value: 92 },
      { label: "DEPTH", value: 99 },
      { label: "OI", value: 84 },
      { label: "VOLUME", value: 78 },
    ],
  },
  sentiment: 91,
  orders: [],
  notifications: [],
  chat: [],
  settings: {},
  totalPnl: positions.reduce((sum, row) => sum + row.pnl, 0),
  pnlByBroker: { dhan: positions.reduce((sum, row) => sum + row.pnl, 0) },
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
    ],
  },
};

type MarketContextValue = {
  data: Snapshot;
  live: boolean;
  refresh: () => Promise<void>;
  toggle: (id: string) => Promise<void>;
  order: (payload: Record<string, unknown>) => Promise<PlaceOrderResult>;
  connect: (id: string, payload: { clientId: string; apiKey?: string; accessToken?: string }) => Promise<void>;
  enableAuto: (payload: { clientId: string; pin: string; totpSecret: string }) => Promise<void>;
  refreshToken: (payload?: { clientId?: string; pin?: string; totpSecret?: string }) => Promise<void>;
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
  const [data, setData] = useState<Snapshot>(fallback);
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
    const id = window.setInterval(() => {
      void refresh();
    }, 2000);
    return () => window.clearInterval(id);
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
        } catch (err) {
          await refresh();
          throw err;
        }
      },
      order: async (payload: Record<string, unknown>) => {
        if (isRemotePreviewHost()) {
          throw new Error(PREVIEW_DESK_MESSAGE);
        }
        const result = await placeOrder(payload);
        if (result.snapshot) setData(result.snapshot);
        else await refresh();
        const status = String(result.order?.status || "").toUpperCase();
        if (result.error || result.ok === false || status === "REJECTED") {
          throw new Error(result.error || result.order?.reason || "Dhan did not place this order.");
        }
        return result;
      },
      connect: async (id: string, payload: { clientId: string; apiKey?: string; accessToken?: string }) => {
        const result = await connectBroker(id, payload);
        if (result.snapshot) setData(result.snapshot);
        else await refresh();
      },
      enableAuto: async (payload: { clientId: string; pin: string; totpSecret: string }) => {
        const result = await enableDhanAuto(payload);
        if (result.snapshot) setData(result.snapshot);
        else await refresh();
      },
      refreshToken: async (payload = {}) => {
        const result = await refreshDhanToken(payload);
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
      routeAlgo: async (id: string, brokerId: string) => {
        await assignAlgoBroker(id, brokerId);
        await refresh();
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
      backtest: async (id: string, options?: BacktestOptions) => {
        const result = await backtestAlgo(id, options);
        if (result.snapshot) setData(result.snapshot);
        else await refresh();
      },
      cancel: async (id: string) => {
        const result = await cancelOrder(id);
        if (result.snapshot) setData(result.snapshot);
        else await refresh();
      },
      closePosition: async (id: string) => {
        const result = await squareOff(id);
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
  if (!context) throw new Error("useMarket must be used within MarketProvider");
  return context;
}
