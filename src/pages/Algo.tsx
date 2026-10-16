import { Activity, FileSpreadsheet, FileText, Pencil, Plus, RotateCcw, Trash2, Users, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { downloadBacktestReport, downloadShivamT2sReport, getAlgoLiveStatus, testAlgoBrokerOrder, updateAlgo, type ClientRow } from "../api/client";
import { loadClientList, peekClientList } from "../lib/clientsCache";
import { BacktestRange, BacktestRangeInline, type BacktestRangePayload } from "../components/dashboard/BacktestRange";
import { OneMinuteHistoryBar } from "../components/dashboard/OneMinuteHistoryBar";
import { SignalFeed } from "../components/dashboard/SignalFeed";
import { FirstCandleTimeframeBar } from "../components/dashboard/FirstCandleTimeframeBar";
import { StrategyBuilder } from "../components/dashboard/StrategyBuilder";
import { useMarket } from "../context/MarketContext";
import { uniqueOpenContracts } from "../lib/deskFeed";
import { catchDeskError } from "../lib/liveSite";
import { brokerName, defaultBrokers } from "../lib/brokers";
import { cn, formatInr, formatNumber } from "../lib/format";
import {
  contractLabel,
  isCrudeFirstCandleKind,
  isNiftyFirstCandleKind,
  niftyFirstCandleTrail,
  isNiftyTestKind,
  isNiftyTest1Kind,
  isNiftyTest2Kind,
  isMultiIndexReversalKind,
  isShivamT2sKind,
  MULTI_INDEX_SCRIPTS,
  isNiftyVwapHedgeKind,
  isNiftyVwapKind,
  isNiftyVwapReversalKind,
  isRetiredDeskStrategy,
  isTestDeskAlgo,
  firstCandleEntryIst,
  firstCandleMinutes,
  showsFirstCandleTimeframe,
  sortDeskAlgos,
  TEST2_SCRIPTS,
  type AlgoStrategy,
} from "../lib/strategies";

type DeskTab = "copy" | "tradingview";
type Filter = "all" | "nifty-first-candle" | "crudeoil" | "shivam-t2s";
type MappingScope = "master" | "clients" | "both";
type AlgoDesk = "live" | "test";

function belongsToDeskAlgo(
  row: { strategy?: string; strategyId?: string; testDesk?: boolean; copyUserId?: string },
  algo: AlgoStrategy,
) {
  if (Boolean(row.testDesk) !== Boolean(algo.testDesk)) return false;
  if (row.strategyId) return row.strategyId === algo.id;
  return row.strategy === algo.name;
}

function rupee(value: number) {
  const n = Number(value) || 0;
  const sign = n < 0 ? "-" : "";
  return `${sign}₹${formatNumber(Math.abs(n), 2)}`;
}

function moneyClass(value: number) {
  if (value > 0) return "text-up";
  if (value < 0) return "text-down";
  return "text-[var(--text)]";
}

function orderActivity(signal: string | undefined, fallback: string) {
  const text = String(signal || "")
    .replace(/^NO TRADE\s*·\s*/i, "")
    .replace(/\s*·\s*NO TRADE\b.*$/i, "")
    .trim();
  if (/\b(?:GREEN|RED)\b/i.test(text)) return text;
  if (!text || /^hold\b/i.test(text)) return fallback;
  return text;
}

function candleTone(value: string | undefined) {
  const color = String(value || "").toLowerCase();
  if (color === "green" || color === "red" || color === "doji") return color;
  return "";
}

function signalCandleColor(text: string, kind: "fut" | "ce" | "pe") {
  const raw = String(text || "");
  if (kind === "fut") {
    if (/\bFUT GREEN\b/i.test(raw) || /\b(?:NIFTY|CRUDE) FUT GREEN\b/i.test(raw)) return "green";
    if (/\bFUT RED\b/i.test(raw) || /\b(?:NIFTY|CRUDE) FUT RED\b/i.test(raw)) return "red";
    if (/\bDOJI\b/i.test(raw)) return "doji";
    return "";
  }
  const token = kind === "ce" ? "CE" : "PE";
  const hit = raw.match(new RegExp(`\\b${token}(?: \\d+)? (GREEN|RED|DOJI)\\b`, "i"));
  return candleTone(hit?.[1]);
}

function firstCandleDotColors(algo: AlgoStrategy) {
  const text = String(algo.lastSignal || "");
  const fut = candleTone(algo.futureColor) || signalCandleColor(text, "fut");
  const ce = candleTone(algo.ceColor) || signalCandleColor(text, "ce");
  const pe = candleTone(algo.peColor) || signalCandleColor(text, "pe");
  const crude = isCrudeFirstCandleKind(algo);
  const buy = /\bBUY CE\b/i.test(text) || (crude ? fut === "green" && ce === "green" && pe === "red" : fut === "green" && ce === "green")
    ? "CE"
    : /\bBUY PE\b/i.test(text) || (crude ? fut === "green" && pe === "green" && ce === "red" : fut === "red" && pe === "green")
      ? "PE"
      : "";
  return { fut, ce, pe, buy };
}

function ConditionDot({ label, color, ok }: { label: string; color: string; ok: boolean }) {
  return (
    <span className="inline-flex items-center gap-1" title={`${label} ${color || "—"}${ok ? " · ok" : ""}`}>
      <span
        className={cn(
          "inline-block h-2.5 w-2.5 rounded-full",
          ok ? "bg-emerald-500" : color === "doji" ? "bg-slate-400" : "bg-rose-500",
        )}
        data-dot-ok={ok ? "true" : "false"}
      />
      <span className="text-[10px] font-extrabold tracking-wide text-slate-500">{label}</span>
    </span>
  );
}

function shivamCardReady(algo: AlgoStrategy) {
  const vs = algo.shivamState || {};
  return Boolean(algo.enabled) && vs.cardReady === true && vs.cardSignal === "● ● ●";
}

function shivamActivityText(
  algo: AlgoStrategy,
  orders: Array<{
    side?: string;
    symbol?: string;
    status?: string;
    role?: string;
    reason?: string;
    createdAt?: string;
  }> = [],
) {
  const vs = algo.shivamState || {};
  const signal = orderActivity(algo.lastSignal, "");
  if (signal && !/^(NO Trade|● ● ●)$/i.test(signal)) return signal;
  const last = [...orders].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).at(0);
  if (last) {
    const line = [last.side, last.symbol, last.status, last.role === "broker-test" ? "test" : "", last.reason]
      .map((part) => String(part || "").trim())
      .filter(Boolean)
      .join(" · ");
    if (line) return line;
  }
  if (vs.lastError && vs.lastError !== "live-locked") return String(vs.lastError);
  return vs.cardSignal || (shivamCardReady(algo) ? "● ● ●" : "NO Trade");
}

function ShivamCandleDots({ algo }: { algo: AlgoStrategy }) {
  const vs = algo.shivamState || {};
  const idx = candleTone(vs.lastIndexColor || algo.indexColor);
  const fut = candleTone(vs.lastFutureColor || algo.futureColor);
  const ce = candleTone(vs.lastCeColor || algo.ceColor);
  const pe = candleTone(vs.lastPeColor || algo.peColor);
  return (
    <span
      className="inline-flex flex-wrap items-center gap-2 rounded bg-[var(--card-muted)] px-1.5 py-0.5"
      data-shivam-candles="idx-fut-opt"
    >
      <ConditionDot label="IDX" color={idx} ok={idx === "green" || idx === "red"} />
      <ConditionDot label="FUT" color={fut} ok={fut === "green" || fut === "red"} />
      <ConditionDot label="CE" color={ce} ok={ce === "green"} />
      <ConditionDot label="PE" color={pe} ok={pe === "green"} />
    </span>
  );
}

function ShivamSignalChip({ algo, onOpen }: { algo: AlgoStrategy; onOpen?: () => void }) {
  const ready = shivamCardReady(algo);
  return (
    <button
      type="button"
      data-shivam-signal={ready ? "ready" : "no-trade"}
      onClick={() => onOpen?.()}
      className={cn(
        "inline-flex items-center rounded bg-[var(--card-muted)] px-1.5 py-0.5 text-[11px] font-extrabold tracking-[0.2em]",
        ready ? "text-emerald-600" : "text-slate-500 tracking-normal",
      )}
    >
      {ready ? "● ● ●" : "NO Trade"}
    </button>
  );
}

function ShivamCapitalStrip({ algo }: { algo: AlgoStrategy }) {
  const { data } = useMarket();
  const vs = algo.shivamState || {};
  const dhan = (data.brokers || []).find((row) => row.id === "dhan");
  const funds = Number(dhan?.funds || 0);
  const capitalValue = Number(algo.capitalValue ?? 50000);
  const allocation = algo.capitalMode === "percent" ? funds * (capitalValue / 100) : capitalValue;
  const approved = funds > 0 ? Math.min(allocation, funds) : allocation;
  const used = Number(vs.sessionTrades || 0);
  const limit = dailyTradeLimit(algo);
  return (
    <div className="mt-2 rounded-lg border border-brand-500/30 bg-[var(--card-muted)] px-3 py-2 text-[11px] font-semibold leading-snug text-slate-600" data-shivam-capital="true">
      <div className="font-extrabold uppercase tracking-wide text-brand-600">Capital management</div>
      <div>
        {algo.capitalMode === "percent" ? `${formatNumber(capitalValue, 0)}% of funds` : `₹${formatNumber(capitalValue, 0)}`} · lots {algo.lots || 1}
        {vs.approvedLots ? ` · approved ${vs.approvedLots}` : ""}
        {vs.maxLots ? ` · max ${vs.maxLots}` : ""}
        {vs.lotSize ? ` · lot ${vs.lotSize}` : " · lot size from instrument master"}
      </div>
      <div>
        Dhan funds {funds > 0 ? `₹${formatNumber(funds, 0)}` : "connect LIVE"} · allocation ₹{formatNumber(Math.max(0, approved), 0)}
        {vs.orderValue ? ` · order ₹${formatNumber(Number(vs.orderValue), 2)}` : ""}
        {vs.requiredFunds ? ` · required ₹${formatNumber(Number(vs.requiredFunds), 2)}` : ""}
      </div>
      <div>
        Trades {used} / {limit} · remaining {Math.max(0, limit - used)} · {algo.runMode === "live" ? "Live Dhan · admin + mapped brokers" : "Paper"} · mapped {Array.isArray(algo.mappedClientIds) ? algo.mappedClientIds.length : 0}
      </div>
    </div>
  );
}

function ShivamTradeDetails({ algo, onClose }: { algo: AlgoStrategy; onClose: () => void }) {
  const vs = algo.shivamState || {};
  const when = (ms?: number) =>
    ms ? new Date(ms).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—";
  return (
    <div className="desk-overlay" data-shivam-details="true">
      <div className="desk-sheet card max-w-lg p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-bold">Shivam T2S trade details</div>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="grid gap-1 text-sm font-semibold text-slate-600">
          <div>Index {vs.indexLabel || algo.symbol} · {vs.futuresInstrument || `${algo.symbol} FUT`}</div>
          <div>{vs.option ? `BUY ${vs.option}` : "—"}</div>
          <div>Contract {vs.symbol || "—"} · ID {vs.securityId || "—"}</div>
          <div>ATM auto {vs.atmStrike || vs.strike || "—"} · Expiry {vs.expiry || "—"}</div>
          <div>Premium {Number(vs.premium || 0).toFixed(2)} · {when(vs.quoteAt)}</div>
          <div>Lots requested {vs.requestedLots || 0} · approved {vs.approvedLots || 0} · exchange lot {vs.lotSize || "—"}</div>
          <div>Order value ₹{Number(vs.orderValue || 0).toFixed(2)} · funds ₹{Number(vs.requiredFunds || 0).toFixed(2)}</div>
          <div>
            SL {Number(vs.slPrice || 0).toFixed(2)} ({vs.slStatus || "not broker-confirmed"}) · TGT {Number(vs.targetPrice || 0).toFixed(2)}
          </div>
          <div>Index {when(vs.indexBarTime)} · Future {when(vs.futureBarTime || vs.lastFutureBarTime)} · CE {when(vs.ceBarTime)} · PE {when(vs.peBarTime)}</div>
          <div>Doji on index, future, or option = no trade</div>
        </div>
      </div>
    </div>
  );
}

function FutureCandleChip({ algo }: { algo: AlgoStrategy }) {
  const { fut, ce, pe, buy } = firstCandleDotColors(algo);
  const futOk = fut === "green" || fut === "red";
  const ceOk = ce === "green";
  const peOk = pe === "green";
  return (
    <span
      className="inline-flex flex-wrap items-center gap-2 rounded bg-[var(--card-muted)] px-1.5 py-0.5"
      data-future-candle={fut || "none"}
      data-first-candle-dots={`${futOk ? "green" : "red"},${ceOk ? "green" : "red"},${peOk ? "green" : "red"}`}
      data-first-candle-buy={buy || ""}
    >
      <ConditionDot label="FUT" color={fut} ok={futOk} />
      <ConditionDot label="CE" color={ce} ok={ceOk} />
      <ConditionDot label="PE" color={pe} ok={peOk} />
      {buy ? (
        <span className="text-[10px] font-extrabold tracking-wide text-up">BUY {buy}</span>
      ) : null}
    </span>
  );
}

function MirMonitor({ algo }: { algo: AlgoStrategy }) {
  const vs = algo.mirState || {};
  const script = MULTI_INDEX_SCRIPTS.find((row) => row.id === (vs.symbol || algo.symbol)) || MULTI_INDEX_SCRIPTS[0];
  const lastBar = Number(vs.lastBarTime || 0);
  return (
    <div className="mt-2 grid gap-1 text-[11px] font-semibold text-slate-500" data-mir-monitor="true">
      <div>
        {script.label} {script.exchange} · state {String(vs.phase || "IDLE").replace(/_/g, " ")}
        {vs.reversalDone ? " · reversed" : ""}
      </div>
      {vs.originalOption ? (
        <div>
          Original {vs.originalStrike} {vs.originalOption} ×{vs.originalQty || 0} @ {Number(vs.originalAvg || 0).toFixed(2)}
          {vs.originalTarget ? ` · TGT ${Number(vs.originalTarget).toFixed(2)}` : ""}
        </div>
      ) : null}
      {vs.reversalOption ? (
        <div>
          Reversal {vs.reversalStrike} {vs.reversalOption} ×{vs.reversalQty || 0} @ {Number(vs.reversalAvg || 0).toFixed(2)}
        </div>
      ) : null}
      <div>
        Last candle {lastBar ? new Date(lastBar).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—"}
        {vs.lastError ? ` · ${vs.lastError}` : ""}
      </div>
    </div>
  );
}

function statusLabel(algo: AlgoStrategy) {
  if (algo.runMode === "backtest" || algo.status === "BACKTEST") return "RESEARCH";
  if (algo.enabled && algo.runMode === "live") return "LIVE";
  if (algo.enabled && algo.runMode === "paper") return "PAPER";
  if (algo.enabled && algo.status === "PAPER") return "PAPER";
  if (algo.enabled && algo.status === "LIVE") return "LIVE";
  return "STOPPED";
}

function kindMeta(algo: AlgoStrategy) {
  if (isNiftyVwapHedgeKind(algo)) {
    return {
      kind: "nifty-vwap-hedge" as const,
      category: "SYSTEMATIC NIFTY HEDGE",
      config: `15m: O<VWAP C>VWAP → CE · O>VWAP C<VWAP → PE · weekly ATM · +40% / −20% hedge · +5% · max ${dailyTradeLimit(algo)} trades/day · daily LIVE 09:20 IST`,
    };
  }
  if (isNiftyVwapReversalKind(algo)) {
    return {
      kind: "nifty-vwap-reversal" as const,
      category: "SYSTEMATIC NIFTY 15M",
      config: `Weekly ATM · 15m · SL ${algo.initialSlPct || 15}% / TGT ${algo.targetPct || 30}% · max ${dailyTradeLimit(algo)} trades/day · daily LIVE 09:20 IST`,
    };
  }
  if (isNiftyTest2Kind(algo)) {
    return {
      kind: "nifty-test2" as const,
      category: `TEST2 ${algo.symbol || "NIFTY"} PREMIUM STRANGLE`,
      config:
        algo.holdStyle === "intraday"
          ? `${algo.symbol || "NIFTY"} INTRADAY · enter ${algo.startTimeIst || "09:35"} IST · square-off ${algo.endTimeIst || "15:15"} IST · MIS same day · SELL ${algo.sellExpiryKind === "weekly" ? "weekly" : "monthly"} CE/PE premium ≥${algo.sellPremium || 80} · BUY ${algo.hedgeExpiryKind === "monthly" ? "monthly" : "weekly"} CE/PE premium ≥${algo.hedgePremium || 20} · hedge SL ${algo.hedgeSlPct || 20}% · max ${dailyTradeLimit(algo)} trades/day`
          : `${algo.symbol || "NIFTY"} BTST · buy today ${algo.startTimeIst || "09:35"} IST · sell tomorrow ${algo.exitTimeIst || "15:15"} IST · NRML overnight · SELL ${algo.sellExpiryKind === "weekly" ? "weekly" : "monthly"} CE/PE premium ≥${algo.sellPremium || 80} · BUY ${algo.hedgeExpiryKind === "monthly" ? "monthly" : "weekly"} CE/PE premium ≥${algo.hedgePremium || 20} · hedge SL ${algo.hedgeSlPct || 20}% · max ${dailyTradeLimit(algo)} trades/day`,
    };
  }
  if (isShivamT2sKind(algo)) {
    return {
      kind: "shivam-t2s" as const,
      category: "SHIVAM T2S",
      config: `${algo.symbol || "NIFTY"} · IDX ${algo.indexTimeframe || "5m"} CE ${algo.ceTimeframe || "5m"} PE ${algo.peTimeframe || "5m"} · ATM auto · max ${dailyTradeLimit(algo)} trades/day · ${algo.runMode === "live" ? "Live Dhan · admin + mapped brokers" : "Paper"} · map clients`,
    };
  }
  if (isMultiIndexReversalKind(algo)) {
    const script = MULTI_INDEX_SCRIPTS.find((row) => row.id === algo.symbol) || MULTI_INDEX_SCRIPTS[0];
    const offset = Number(algo.strikeOffset || 0);
    return {
      kind: "multi-index-reversal" as const,
      category: `MULTI-INDEX ${script.label} ${script.exchange} ${String(algo.timeframe || "15m").toUpperCase()}`,
      config: `${script.label} ${script.exchange} · ${algo.timeframe || "15m"} · ${offset ? `ATM${offset > 0 ? `+${offset}` : offset}` : "ATM"} · TGT ${algo.initialTargetPct || 40}% · reverse −${algo.reversalLossPct || 20}% ×${algo.reversalQtyMultiple || 2} · combined +${algo.combinedTargetPct || 20}% ${algo.combinedTargetBasis === "combined" ? "combined premium" : "original premium"} · max ${dailyTradeLimit(algo)} trades/day · ${algo.runMode === "live" ? "Live" : "Paper"}`,
    };
  }
  if (isNiftyTest1Kind(algo)) {
    const body = Math.round((Number(algo.minBodyPct) || 0.9) * 100);
    const wick = Math.round((Number(algo.maxWickPct) || 0.1) * 100);
    return {
      kind: "nifty-test1" as const,
      category: `TEST1 ${algo.symbol || "NIFTY"} ATM ${String(algo.timeframe || "5m").toUpperCase()}`,
      config: `${algo.symbol || "NIFTY"} ATM CE/PE only · after ${algo.startTimeIst || "09:30"} IST · green body ≥${body}% · wick ≤${wick}% · TGT 100% of signal ${algo.targetSource === "range" ? "range" : "body"} from fill · SL candle low · max ${dailyTradeLimit(algo)} trades/day · one order per ${algo.timeframe || "5m"}`,
    };
  }
  if (isNiftyTestKind(algo)) {
    const liveSide = algo.enabled && (algo.lastSignal === "BUY" || algo.lastSignal === "SELL") ? algo.lastSignal : "";
    return {
      kind: "nifty-test" as const,
      category: "NIFTY TEST",
      config: `NIFTY FUT · ${algo.timeframe || "5m"} · live feed while started · above open BUY · below open SELL · max ${dailyTradeLimit(algo)} trades/day${liveSide ? ` · ${liveSide}` : " · no signal"}`,
    };
  }
  if (isCrudeFirstCandleKind(algo)) {
    const maxTrades = dailyTradeLimit(algo);
    return {
      kind: "crude-first-candle" as const,
      category: `CRUDE OIL EVERY ${(algo.timeframe || "5m").toUpperCase()}`,
      config: `CRUDE FUT · every ${algo.timeframe || "5m"} · FUT+CE green and PE red → BUY CE · FUT+PE green and CE red → BUY PE · SL ${algo.initialSlPct || 20}% / TGT ${algo.targetPct || 40}% · max ${maxTrades} trades/day · MCX until ${algo.endTimeIst || "23:15"} IST`,
    };
  }
  if (isNiftyFirstCandleKind(algo)) {
    const maxTrades = dailyTradeLimit(algo);
    const trail = niftyFirstCandleTrail(algo);
    const tf = algo.timeframe || "5m";
    return {
      kind: "nifty-first-candle" as const,
      category: `SYSTEMATIC NIFTY FIRST ${tf.toUpperCase()}`,
      config: `NIFTY FUT · ${tf} · ${algo.expiryKind === "monthly" ? "Monthly" : "Weekly"} ${algo.strikeOffset ? `ATM${algo.strikeOffset > 0 ? "+" : ""}${algo.strikeOffset}` : "ATM"} · up to ${maxTrades} trades · SL ${algo.initialSlPct || 20}% / TGT ${algo.targetPct || 40}% · trailing SL +${trail.activation}% to buy, then +${trail.shift}% every +${trail.every}% · LIVE ${algo.dailyLiveIst || "09:00"} IST`,
    };
  }
  if (isNiftyVwapKind(algo)) {
    return {
      kind: "nifty-vwap" as const,
      category: "SYSTEMATIC NIFTY VWAP",
      config: `ATM options · 5m · SL ${algo.initialSlPct || 20}% / TGT ${algo.targetPct || 40}% · max ${dailyTradeLimit(algo)} trades/day`,
    };
  }
  if (algo.kind === "price-action") {
    return {
      kind: "price-action" as const,
      category: "SYSTEMATIC PRICE ACTION",
      config: `${algo.symbol || "NIFTY"} · ${algo.timeframe || "5m"} · ${algo.pattern || "ORB"} · max ${dailyTradeLimit(algo)} trades/day`,
    };
  }
  return {
    kind: "indicator" as const,
    category: "SYSTEMATIC INDICATOR",
    config: `${algo.symbol || "NIFTY"} · ${algo.timeframe || "5m"} · ${algo.indicator || "EMA"} · max ${dailyTradeLimit(algo)} trades/day`,
  };
}

export function AlgoTest() {
  return <Algo desk="test" />;
}

export function Algo({ desk = "live" }: { desk?: AlgoDesk }) {
  const testDesk = desk === "test";
  const navigate = useNavigate();
  const { data, toggle, setAll, removeAlgo, backtest, resetBacktest, unlockBacktest, closePosition, refresh, saveAlgo } = useMarket();
  const [tab, setTab] = useState<DeskTab>("copy");
  const [filter, setFilter] = useState<Filter>("all");
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editing, setEditing] = useState<AlgoStrategy | null>(null);
  const [busyId, setBusyId] = useState("");
  const [rangeId, setRangeId] = useState("");
  const [rangeError, setRangeError] = useState("");
  const [mapFor, setMapFor] = useState<AlgoStrategy | null>(null);
  const [knownClientIds, setKnownClientIds] = useState<Set<string> | null>(() => {
    const seeded = peekClientList()?.clients || [];
    return seeded.length ? new Set(seeded.map((row) => row.id)) : null;
  });
  useEffect(() => {
    let cancel = false;
    void loadClientList()
      .then((result) => {
        if (cancel) return;
        setKnownClientIds(new Set((result.clients || []).map((row) => row.id)));
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, []);

  const deskAlgos = data.algos.filter((row) => {
    if (isRetiredDeskStrategy(row)) return false;
    if (isShivamT2sKind(row)) return testDesk;
    return isTestDeskAlgo(row) === testDesk;
  });
  const rangeFor = deskAlgos.find((item) => item.id === rangeId) || null;
  const canStartAll = deskAlgos.some((row) => row.runMode !== "backtest" && !row.enabled);
  const canStopAll = deskAlgos.some((row) => row.enabled);

  const rows = sortDeskAlgos(deskAlgos).filter((algo) => {
    if (filter === "all") return true;
    if (filter === "shivam-t2s") return isShivamT2sKind(algo);
    if (filter === "crudeoil") {
      const symbol = String(algo.symbol || "").toUpperCase();
      return (
        isCrudeFirstCandleKind(algo) ||
        ((isNiftyTest1Kind(algo) || isNiftyTest2Kind(algo)) && ["CRUDEOIL", "NATURALGAS", "COPPER"].includes(symbol))
      );
    }
    if (isCrudeFirstCandleKind(algo)) return false;
    if (isNiftyTest2Kind(algo) || isNiftyTest1Kind(algo)) return !["CRUDEOIL", "NATURALGAS", "COPPER"].includes(String(algo.symbol || "").toUpperCase());
    if (isMultiIndexReversalKind(algo) || isShivamT2sKind(algo)) return true;
    return isNiftyFirstCandleKind(algo);
  }) as AlgoStrategy[];

  const openAdd = () => {
    setEditing(null);
    setBuilderOpen(true);
  };

  const remove = async (algo: AlgoStrategy) => {
    if (!window.confirm(`Delete ${algo.name}? This removes its orders, positions, and member plans on the admin desk and on user accounts.`)) return;
    await removeAlgo(algo.id);
  };

  const startOrPause = async (algo: AlgoStrategy) => {
    setBusyId(algo.id);
    try {
      await toggle(algo.id, !algo.enabled);
    } catch (err) {
      window.alert(catchDeskError(err, "Could not start"));
    } finally {
      setBusyId("");
    }
  };

  const startInMode = async (algo: AlgoStrategy, mode: "paper" | "live") => {
    const nextMode = testDesk && !isShivamT2sKind(algo) ? "paper" : mode;
    setBusyId(algo.id);
    try {
      if (algo.runMode !== nextMode) {
        await saveAlgo({
          id: algo.id,
          runMode: nextMode,
          brokerId: nextMode === "live" ? (algo.brokerId && algo.brokerId !== "paper" ? algo.brokerId : "dhan") : "paper",
          enabled: true,
          ...(testDesk ? { testDesk: true } : {}),
          ...(isShivamT2sKind(algo) ? { liveAuthorized: nextMode === "live" } : {}),
        });
        return;
      }
      await toggle(algo.id, true);
    } catch (err) {
      window.alert(catchDeskError(err, mode === "paper" ? "Could not start paper" : "Could not start live"));
    } finally {
      setBusyId("");
    }
  };

  const startOrStopAll = async (enabled: boolean) => {
    setBusyId("all");
    try {
      await setAll(enabled, { testDesk });
    } catch (err) {
      window.alert(catchDeskError(err, enabled ? "Could not start strategies" : "Could not stop strategies"));
    } finally {
      setBusyId("");
    }
  };

  const exitStrategy = async (algo: AlgoStrategy) => {
    const open = uniqueOpenContracts(
      (data.positions || []).filter((row) => belongsToDeskAlgo(row, algo) && !row.copyUserId),
    );
    if (!open.length) {
      window.alert("No open positions for this strategy.");
      return;
    }
    if (!window.confirm(`Exit ${open.length} open position${open.length === 1 ? "" : "s"} for ${algo.name}?`)) return;
    setBusyId(`exit-${algo.id}`);
    try {
      for (const row of open) {
        await closePosition(row.id);
      }
      await refresh();
    } catch (err) {
      window.alert(catchDeskError(err, "Could not exit position"));
    } finally {
      setBusyId("");
    }
  };

  const testBroker = async (algo: AlgoStrategy) => {
    const current = statusLabel(algo);
    setBusyId(`test-${algo.id}`);
    try {
      let check: Awaited<ReturnType<typeof getAlgoLiveStatus>> | null = null;
      try {
        check = await getAlgoLiveStatus(algo.id);
      } catch {
        check = null;
      }
      const label = check?.status || current;
      const contract = check?.contract?.symbol || "ATM CE";
      const broker = check?.brokerName || check?.brokerId || "Dhan";
      const ready = check?.brokerReady ? `${broker} is LIVE` : `${broker} is NOT LIVE`;
      if (
        !window.confirm(
          `Send 1 lot BUY ${contract} to ${broker} and mapped clients?\n\n${algo.name} is ${label}. ${ready}. Mapped clients copy 1 lot on their own broker. This is a real order if the broker is LIVE.`,
        )
      ) {
        return;
      }
      const result = await testAlgoBrokerOrder(algo.id, true);
      await refresh();
      const sent = result.contract?.symbol || contract;
      window.alert(result.queued || result.sentLive ? `Sent 1 lot BUY ${sent} to ${broker} and mapped clients.` : result.error || "Test order sent");
    } catch (err) {
      window.alert(catchDeskError(err, "Could not send test order"));
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="space-y-3" data-algo-desk={testDesk ? "test" : "live"}>
      <div className="desk-tabs" data-algo-tabs="true">
        <TabChip
          label="Copy Algos"
          on={!testDesk && tab !== "tradingview"}
          onClick={() => (testDesk ? navigate("/algo") : setTab("copy"))}
        />
        <TabChip
          label="Algo Test"
          on={testDesk}
          accent
          onClick={() => {
            if (!testDesk) navigate("/algo-test");
          }}
        />
        <TabChip
          label="TradingView Integration"
          on={!testDesk && tab === "tradingview"}
          onClick={() => (testDesk ? navigate("/algo") : setTab("tradingview"))}
        />
      </div>

      {tab === "tradingview" ? (
        <section className="card p-8">
          <h1 className="text-xl font-bold">TradingView Integration</h1>
          <p className="mt-1 text-sm text-slate-400">
            Webhook alerts stay on this tab later. Copy Algos on this desk are unchanged. This does not start LIVE.
          </p>
        </section>
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="desk-kicker">{testDesk ? "Isolated paper desk" : "Strategy blotter"}</div>
              <h1 className="text-xl font-bold">{testDesk ? "Algo Test" : "Algo Strategies"}</h1>
              <p className="text-sm text-slate-400">
                {testDesk
                  ? `${deskAlgos.filter((row) => row.enabled).length} paper · ${deskAlgos.length} test strategies · not live, not copy, not the main blotter`
                  : `${deskAlgos.filter((row) => row.enabled).length} live · ${deskAlgos.length} strategies`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setRangeError("");
                  void unlockBacktest().catch((err: unknown) =>
                    window.alert(catchDeskError(err, "Could not reset backtest")),
                  );
                }}
                title="Clears a stuck backtest lock (same as rm -f /opt/t2s/server/data/backtest.busy)"
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[var(--border)] px-4 text-sm font-semibold"
              >
                <RotateCcw size={16} />
                Reset backtest
              </button>
              <button
                type="button"
                disabled={busyId === "all" || !canStartAll}
                onClick={() => void startOrStopAll(true)}
                className="btn-go h-10 rounded-lg px-4 text-sm font-semibold disabled:opacity-60"
              >
                Start all
              </button>
              <button
                type="button"
                disabled={busyId === "all" || !canStopAll}
                onClick={() => void startOrStopAll(false)}
                className="btn-halt h-10 rounded-lg px-4 text-sm font-semibold disabled:opacity-60"
              >
                Stop all
              </button>
              <button type="button" onClick={openAdd} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-navy-900 px-4 text-sm font-semibold text-white">
                <Plus size={16} />
                Add strategy
              </button>
            </div>
          </div>
          <OneMinuteHistoryBar />
          <div className="flex flex-wrap gap-2">
            {(
              (testDesk
                ? [
                    ["all", "All"],
                    ["shivam-t2s", "SHIVAM T2S"],
                  ]
                : [
                    ["all", "All"],
                    ["nifty-first-candle", "NIFTY"],
                    ["crudeoil", "CRUDE OIL"],
                  ]) as [Filter, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-semibold",
                  filter === id ? "bg-brand-500 text-white" : "border border-[var(--border)] bg-[var(--card)]",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <SignalFeed testDesk={testDesk} />
          {rows.length ? (
            <div className="flex flex-col gap-4">
              {rows.map((algo) => (
                <AlgoCard
                  key={algo.id}
                  algo={algo}
                  orders={(data.orders || []).filter((row) => belongsToDeskAlgo(row, algo))}
                  clientIds={knownClientIds}
                  positions={uniqueOpenContracts(
                    (data.positions || []).filter((row) => belongsToDeskAlgo(row, algo) && !row.copyUserId),
                  )}
                  isolated={testDesk || isShivamT2sKind(algo)}
                  busy={busyId === algo.id || busyId === `exit-${algo.id}` || busyId === `reset-${algo.id}` || busyId === `report-${algo.id}` || busyId === `test-${algo.id}` || busyId === "all"}
                  rangeOpen={rangeId === algo.id}
                  rangeError={rangeId === algo.id ? rangeError : ""}
                  onEdit={() => {
                    setEditing(algo);
                    setBuilderOpen(true);
                  }}
                  onMap={() => setMapFor(algo)}
                  onBacktest={() => {
                    setRangeError("");
                    setRangeId(algo.id);
                  }}
                  onResetBacktest={() => {
                    setBusyId(`reset-${algo.id}`);
                    setRangeError("");
                    void resetBacktest(algo.id)
                      .catch((err: unknown) => window.alert(catchDeskError(err, "Could not reset backtest")))
                      .finally(() => setBusyId(""));
                  }}
                  onReport={(format) => {
                    setBusyId(`report-${algo.id}`);
                    const download = isShivamT2sKind(algo) ? downloadShivamT2sReport(algo.id, format) : downloadBacktestReport(algo.id, format);
                    void download
                      .catch((err: unknown) => window.alert(catchDeskError(err, "Could not download report")))
                      .finally(() => setBusyId(""));
                  }}
                  onCancelRange={() => {
                    setRangeId("");
                    setRangeError("");
                  }}
                  onRunBacktest={(payload) => {
                    setBusyId(algo.id);
                    setRangeError("");
                    void backtest(algo.id, payload)
                      .then(() => setRangeId(""))
                      .catch((err: unknown) => setRangeError(catchDeskError(err, "Backtest failed")))
                      .finally(() => setBusyId(""));
                  }}
                  onStart={() => void startOrPause(algo)}
                  onStartPaper={() => void startInMode(algo, "paper")}
                  onStartLive={() => void startInMode(algo, "live")}
                  onTestBroker={() => void testBroker(algo)}
                  onExit={() => void exitStrategy(algo)}
                  onDelete={() => void remove(algo)}
                />
              ))}
            </div>
          ) : (
            <section className="card p-8 text-center">
              <div className="text-base font-bold">No strategies in this view</div>
              <p className="mt-1 text-sm text-slate-400">
                {testDesk
                  ? "Add SHIVAM T2S or another test strategy. Shivam can paper or live-trade Dhan from this page. Map clients on the Shivam card to copy those users."
                  : "Add a NIFTY 5m or CRUDE OIL strategy to start the desk."}
              </p>
              <button type="button" onClick={openAdd} className="mt-4 h-10 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white">
                Add strategy
              </button>
            </section>
          )}
        </>
      )}

      <StrategyBuilder
        open={builderOpen}
        algo={editing}
        testDesk={testDesk}
        onClose={() => {
          setBuilderOpen(false);
          setEditing(null);
        }}
      />
      <BacktestRange
        open={Boolean(rangeFor)}
        name={rangeFor?.name}
        busy={Boolean(rangeFor && busyId === rangeFor.id)}
        error={rangeError}
        onClose={() => {
          setRangeId("");
          setRangeError("");
        }}
        onReset={() => {
          if (!rangeFor) return;
          setBusyId(`reset-${rangeFor.id}`);
          setRangeError("");
          void resetBacktest(rangeFor.id)
            .catch((err: unknown) => setRangeError(catchDeskError(err, "Could not reset backtest")))
            .finally(() => setBusyId(""));
        }}
        onRun={(payload: BacktestRangePayload) => {
          if (!rangeFor) return;
          setBusyId(rangeFor.id);
          setRangeError("");
          void backtest(rangeFor.id, payload)
            .then(() => setRangeId(""))
            .catch((err: unknown) => setRangeError(catchDeskError(err, "Backtest failed")))
            .finally(() => setBusyId(""));
        }}
      />
      {mapFor ? (
        <MapClientsModal
          algo={mapFor}
          onClose={() => setMapFor(null)}
          onSaved={() => setMapFor(null)}
        />
      ) : null}
    </div>
  );
}

function deskTfLabel(timeframe?: string) {
  const raw = String(timeframe || "5m").trim();
  if (raw === "1H" || raw === "1h" || raw === "1hr" || raw === "60m") return "1hr";
  return raw;
}

function CardTimeframe({ algo }: { algo: AlgoStrategy }) {
  const { refresh } = useMarket();
  const saved = algo.timeframe || "5m";
  const [draft, setDraft] = useState(saved);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setDraft(saved);
  }, [algo.id, saved]);

  const save = async (timeframe: string) => {
    setDraft(timeframe);
    if (timeframe === saved) return;
    setSaving(true);
    try {
      await updateAlgo(algo.id, {
        timeframe,
        barMinutes: firstCandleMinutes(timeframe),
        entryEvaluationIst: firstCandleEntryIst(algo.firstBarStartIst, timeframe, algo.entryEvaluationIst),
      });
      await refresh();
    } catch (err) {
      window.alert(catchDeskError(err, "Could not save timeframe"));
      setDraft(saved);
    } finally {
      setSaving(false);
    }
  };

  return (
    <FirstCandleTimeframeBar
      timeframe={draft}
      saving={saving}
      commitCustomOnBlur
      mark={isCrudeFirstCandleKind(algo) ? "crude" : "nifty"}
      onPick={(timeframe) => void save(timeframe)}
    />
  );
}

function dailyTradeLimit(algo: { maxTradesPerDay?: number; kind?: string; strategyType?: string; indicator?: string; name?: string }) {
  const fallback = algo.kind === "nifty-test2" ? 1 : 5;
  const n = Number(algo.maxTradesPerDay);
  if (!Number.isFinite(n)) return fallback;
  const max = isShivamT2sKind(algo) ? 100 : 20;
  return Math.max(1, Math.min(max, Math.round(n)));
}

function DailyTradeLimit({ algo }: { algo: AlgoStrategy }) {
  const { refresh } = useMarket();
  const saved = dailyTradeLimit(algo);
  const [value, setValue] = useState(String(saved));
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setValue(String(saved));
  }, [algo.id, saved]);

  const save = async () => {
    const cap = isShivamT2sKind(algo) ? 100 : 20;
    const next = Math.max(1, Math.min(cap, Math.round(Number(value) || saved)));
    setValue(String(next));
    if (next === saved) return;
    setSaving(true);
    try {
      await updateAlgo(algo.id, { maxTradesPerDay: next });
      await refresh();
    } catch (err) {
      window.alert(catchDeskError(err, "Could not save max trades"));
      setValue(String(saved));
    } finally {
      setSaving(false);
    }
  };

  return (
    <label className="mt-2 flex w-full flex-wrap items-center gap-2 text-sm font-bold text-[var(--text)]" data-trade-limit="daily">
      Daily trade limit
      <input
        type="number"
        min={1}
        max={isShivamT2sKind(algo) ? 100 : 20}
        inputMode="numeric"
        aria-label="Daily trade limit"
        className="h-10 w-24 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm font-bold text-[var(--text)]"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => void save()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void save();
          }
        }}
      />
      {saving ? (
        <span className="font-medium text-slate-400">Saving...</span>
      ) : isShivamT2sKind(algo) ? null : (
        <span className="font-medium text-slate-400">
          1–20 entries today. Hedge, reverse, and exit do not use this count.
        </span>
      )}
    </label>
  );
}

function pctOr(value: number | undefined, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(90, Math.round(n * 10) / 10) : fallback;
}

function CrudeLevels({ algo }: { algo: AlgoStrategy }) {
  const { refresh } = useMarket();
  const slSaved = pctOr(algo.initialSlPct, 20);
  const tgtSaved = pctOr(algo.targetPct, 40);
  const [sl, setSl] = useState(String(slSaved));
  const [tgt, setTgt] = useState(String(tgtSaved));
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setSl(String(slSaved));
    setTgt(String(tgtSaved));
  }, [algo.id, slSaved, tgtSaved]);

  const save = async () => {
    const nextSl = pctOr(Number(sl), slSaved);
    const nextTgt = pctOr(Number(tgt), tgtSaved);
    setSl(String(nextSl));
    setTgt(String(nextTgt));
    if (nextSl === slSaved && nextTgt === tgtSaved) return;
    setSaving(true);
    try {
      await updateAlgo(algo.id, { initialSlPct: nextSl, slPct: nextSl, targetPct: nextTgt });
      await refresh();
    } catch (err) {
      window.alert(catchDeskError(err, "Could not save SL / TGT"));
      setSl(String(slSaved));
      setTgt(String(tgtSaved));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2 flex w-full flex-wrap items-center gap-3 text-sm font-bold text-[var(--text)]" data-sl-tgt="crude">
      <label className="flex items-center gap-2">
        Stop %
        <input
          type="number"
          min={1}
          max={90}
          step={1}
          inputMode="decimal"
          aria-label="Crude stop percent"
          className="h-10 w-20 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm font-bold text-[var(--text)]"
          value={sl}
          onChange={(event) => setSl(event.target.value)}
          onBlur={() => void save()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void save();
            }
          }}
        />
      </label>
      <label className="flex items-center gap-2">
        Target %
        <input
          type="number"
          min={1}
          max={90}
          step={1}
          inputMode="decimal"
          aria-label="Crude target percent"
          className="h-10 w-20 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm font-bold text-[var(--text)]"
          value={tgt}
          onChange={(event) => setTgt(event.target.value)}
          onBlur={() => void save()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void save();
            }
          }}
        />
      </label>
      <span className="font-medium text-slate-400">{saving ? "Saving..." : "Custom % from the fill. Same values as Edit."}</span>
    </div>
  );
}

function Test2ExpiryBar({ algo }: { algo: AlgoStrategy }) {
  const { refresh } = useMarket();
  const [saving, setSaving] = useState(false);
  const script = TEST2_SCRIPTS.find((row) => row.id === algo.symbol) || TEST2_SCRIPTS[0];
  const mcx = script.session === "mcx";

  const save = async (patch: Partial<AlgoStrategy>) => {
    setSaving(true);
    try {
      await updateAlgo(algo.id, patch);
      await refresh();
    } catch (err) {
      window.alert(catchDeskError(err, "Could not save TEST2 expiry"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2 grid w-full grid-cols-1 gap-2 sm:grid-cols-2" data-test2-card-expiry>
      <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">
        SELL option
        <select
          className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 text-sm font-bold text-[var(--text)]"
          value={algo.sellExpiryKind || "monthly"}
          disabled={saving || mcx}
          onChange={(event) => void save({ sellExpiryKind: event.target.value === "weekly" ? "weekly" : "monthly" })}
        >
          <option value="monthly">Monthly CE + PE</option>
          <option value="weekly">Weekly CE + PE</option>
        </select>
      </label>
      <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">
        BUY hedge option
        <select
          className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 text-sm font-bold text-[var(--text)]"
          value={algo.hedgeExpiryKind || "weekly"}
          disabled={saving || mcx}
          onChange={(event) => void save({ hedgeExpiryKind: event.target.value === "monthly" ? "monthly" : "weekly" })}
        >
          <option value="weekly">Weekly CE + PE</option>
          <option value="monthly">Monthly CE + PE</option>
        </select>
      </label>
    </div>
  );
}

function brokerFilledOrder(row: { status?: string; filledQty?: number }) {
  const status = String(row.status || "").toUpperCase();
  if (Number(row.filledQty || 0) > 0) return true;
  return status === "FILLED" || status === "TRADED";
}

function AlgoCard({
  algo,
  clientIds,
  orders,
  positions,
  busy,
  rangeOpen,
  rangeError,
  isolated = false,
  onEdit,
  onMap,
  onBacktest,
  onResetBacktest,
  onReport,
  onCancelRange,
  onRunBacktest,
  onStart,
  onStartPaper,
  onStartLive,
  onTestBroker,
  onExit,
  onDelete,
}: {
  algo: AlgoStrategy;
  clientIds: Set<string> | null;
  orders: Array<{
    id: string;
    status?: string;
    filledQty?: number;
    side?: string;
    symbol?: string;
    role?: string;
    reason?: string;
    createdAt?: string;
  }>;
  positions: Array<{ type?: string; pnl?: number; live?: boolean; brokerId?: string }>;
  busy: boolean;
  rangeOpen: boolean;
  rangeError: string;
  isolated?: boolean;
  onEdit: () => void;
  onMap: () => void;
  onBacktest: () => void;
  onResetBacktest: () => void;
  onReport: (format: "pdf" | "xlsx") => void;
  onCancelRange: () => void;
  onRunBacktest: (payload: BacktestRangePayload) => void;
  onStart: () => void;
  onStartPaper: () => void;
  onStartLive: () => void;
  onTestBroker: () => void;
  onExit: () => void;
  onDelete: () => void;
}) {
  const [shivamDetails, setShivamDetails] = useState(false);
  const { data } = useMarket();
  const dhanLive = Boolean(data.dhanFeed?.live);
  const meta = kindMeta(algo);
  const shivam = isShivamT2sKind(algo);
  const liveMtm = positions.reduce((sum, row) => sum + Number(row.pnl || 0), 0);
  const mappedIds = algo.mappedClientIds || [];
  const mapped = clientIds ? mappedIds.filter((id) => clientIds.has(id)).length : mappedIds.length;
  const brokerMtm = positions.some((row) => row.live || row.brokerId === "dhan");
  const positionLabel = !positions.length
    ? "FLAT"
    : positions.every((row) => row.type === "SELL")
      ? "SHORT"
      : positions.every((row) => row.type !== "SELL")
        ? "LONG"
        : "MIXED";
  const filledOrders = orders.filter(brokerFilledOrder);
  const trades = Number(algo.lastBacktest?.trades || 0);
  const winRate = Number(algo.lastBacktest?.winRate ?? algo.winRate ?? 0);
  const drawdown = Number(algo.lastBacktest?.maxDrawdown || 0);
  const bookPnl = Number(algo.lastBacktest?.pnl ?? algo.pnl ?? 0);
  const activity = isNiftyVwapHedgeKind(algo)
    ? orderActivity(algo.enabled ? algo.lastSignal : "", algo.trade?.hint || "15m: O<VWAP C>VWAP → BUY CE · O>VWAP C<VWAP → BUY PE")
    : isNiftyTestKind(algo)
      ? algo.enabled && (algo.lastSignal === "BUY" || algo.lastSignal === "SELL")
        ? algo.lastSignal
        : "No signal"
    : isShivamT2sKind(algo)
      ? shivamActivityText(algo, orders)
    : isCrudeFirstCandleKind(algo) || isNiftyFirstCandleKind(algo) || isNiftyTest1Kind(algo) || isNiftyTest2Kind(algo) || isMultiIndexReversalKind(algo)
      ? orderActivity(algo.lastSignal, "Waiting for the next signal")
      : orderActivity(algo.enabled ? algo.lastSignal : "", "Waiting for the next signal");
  const status = statusLabel(algo);
  const contract = algo.instrument === "option" ? algo.trade?.label || contractLabel(algo) : `${algo.symbol || "NIFTY"} FUT`;

  return (
    <section className="card blotter-card flex w-full flex-col p-4" data-strategy-card={algo.id} data-live={status === "LIVE" ? "true" : "false"} data-run-status={status} data-mir-strategy={isMultiIndexReversalKind(algo) ? "true" : undefined} data-shivam-strategy={shivam ? "true" : undefined}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--card-muted)] text-slate-400">
            <Activity size={16} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-bold">{algo.name}</h2>
              {shivam ? (
                <>
                  <ShivamSignalChip algo={algo} onOpen={() => setShivamDetails(true)} />
                  <ShivamCandleDots algo={algo} />
                </>
              ) : isCrudeFirstCandleKind(algo) || isNiftyFirstCandleKind(algo) ? (
                <FutureCandleChip algo={algo} />
              ) : null}
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-extrabold tracking-wide",
                  status === "LIVE" ? "status-live" : status === "PAPER" ? "status-paper" : "status-stop",
                )}
              >
                {status}
              </span>
              <span className="rounded bg-[var(--card-muted)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                {positionLabel}
              </span>
              {isolated ? (
                <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-violet-700 dark:bg-violet-950/40 dark:text-violet-200">
                  Test
                </span>
              ) : null}
              {isolated && !shivam ? null : (
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide",
                  algo.clientVisible === false ? "bg-slate-200 text-slate-500" : "bg-emerald-50 text-up",
                )}
                data-client-visible={algo.clientVisible === false ? "hidden" : "visible"}
              >
                {algo.clientVisible === false ? "Hidden" : "Visible"}
              </span>
              )}
            </div>
            {isNiftyTest2Kind(algo) ? <Test2ExpiryBar algo={algo} /> : null}
            {shivam ? null : <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{meta.category}</div>}
            {shivam ? null : <div className="desk-help mt-2 text-sm text-slate-400">{meta.config}</div>}
            {algo.runMode === "live" ? (
              <div className="mt-1 text-[11px] font-semibold text-slate-500">
                Live broker: {brokerName(defaultBrokers, algo.brokerId || "dhan")}
              </div>
            ) : null}
            {shivam ? (
              <div
                className="mt-1 text-[11px] font-semibold text-slate-500"
                data-shivam-live-check={status === "LIVE" ? "live" : status === "PAPER" ? "paper" : "stopped"}
              >
                {status === "LIVE" ? "Strategy is LIVE" : status === "PAPER" ? "Strategy is PAPER — not live" : "Strategy is STOPPED — not live"}
                {dhanLive ? " · Dhan LIVE" : " · Dhan not LIVE"}
              </div>
            ) : null}
            {shivam ? (
              <div className="mt-1 text-[11px] font-semibold text-slate-500" data-shivam-tf="true">
                IDX {deskTfLabel(algo.indexTimeframe || algo.timeframe)} · CE {deskTfLabel(algo.ceTimeframe)} · PE {deskTfLabel(algo.peTimeframe)} · ATM auto
                {algo.shivamState?.atmStrike || algo.shivamState?.strike ? ` ${algo.shivamState?.atmStrike || algo.shivamState?.strike}` : ""}
              </div>
            ) : null}
            {shivam ? null : <div className="mt-1 text-[11px] font-semibold text-slate-500">{contract}</div>}
            {isMultiIndexReversalKind(algo) ? <MirMonitor algo={algo} /> : null}
            {isNiftyVwapHedgeKind(algo) && algo.trade?.hint && algo.trade.hint !== contract ? (
              <div className="mt-0.5 text-[11px] leading-snug text-slate-400">{algo.trade.hint}</div>
            ) : null}
          </div>
        </div>
        <div className="text-right">
          <div className="desk-kicker">Live MTM</div>
          <div className={cn("px text-xl font-extrabold leading-none", moneyClass(liveMtm))}>{rupee(liveMtm)}</div>
        </div>
      </div>
      {showsFirstCandleTimeframe(algo) ? <CardTimeframe algo={algo} /> : null}
      {shivam ? <ShivamCapitalStrip algo={algo} /> : null}
      {shivam ? (
        <div
          className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--card-muted)] px-3 py-2 text-xs font-semibold leading-snug text-[var(--text)]"
          data-latest-activity="true"
          data-shivam-activity="true"
        >
          <span className="font-bold uppercase tracking-[0.12em] text-slate-500">Latest activity</span>
          <div className="mt-1" data-shivam-activity-text="true">
            {activity}
          </div>
        </div>
      ) : null}
      <DailyTradeLimit algo={algo} />
      {isCrudeFirstCandleKind(algo) ? <CrudeLevels algo={algo} /> : null}

      <div className="metric-well mt-4 grid-cols-2 sm:grid-cols-4">
        <Metric label="Live MTM" value={rupee(liveMtm)} tone={moneyClass(liveMtm)} hint={positions.length ? `${brokerMtm ? "Dhan · " : ""}${positions.length} open` : "No open position"} />
        <Metric label="Total orders" value={String(filledOrders.length)} hint={filledOrders.length ? "Filled at the broker" : "No filled orders"} />
        <Metric label="Mapped clients" value={String(mapped)} hint={mapped ? "Eligible copy accounts" : "No accounts"} />
        <Metric label="Position" value={positionLabel} hint={positions.length ? `${positions.length} open` : "No exposure"} />
        {algo.lastBacktest?.from || algo.lastBacktest?.to ? (
          <>
            <Metric label="Start date" value={algo.lastBacktest.from || "—"} hint="Backtest from" />
            <Metric label="End date" value={algo.lastBacktest.to || "—"} hint="Backtest to" />
          </>
        ) : null}
        <Metric
          label="Backtest P&L"
          value={formatInr(bookPnl)}
          tone={moneyClass(bookPnl)}
          hint={algo.lastBacktest ? "Replay book, not live MTM" : "Run Backtest to fill this"}
        />
        <Metric
          label="Backtest trades"
          value={String(trades)}
          hint={
            isNiftyTest2Kind(algo)
              ? algo.lastBacktest?.storedTrades
                ? `${algo.lastBacktest.storedTrades} Dhan rolling days · skipped ${algo.lastBacktest.skippedDays || 0}`
                : `${algo.lastBacktest?.legs || trades * 4} legs · synth premiums`
              : algo.lastBacktest?.combos
                ? `${algo.lastBacktest.combos} session days · 4 legs each`
                : "Last replay fills"
          }
        />
        <Metric
          label="Backtest win rate"
          value={`${formatNumber(winRate, 1)}%`}
          hint={
            isNiftyTest2Kind(algo)
              ? algo.lastBacktest?.storedTrades
                ? "Winning combos on Dhan rolling days only"
                : "Synth model — not live proof"
              : "Winning fills / all fills"
          }
        />
        <Metric
          label="Backtest drawdown"
          value={rupee(drawdown)}
          tone={moneyClass(-Math.abs(drawdown))}
          hint={
            algo.lastBacktest?.maxDdFrom && algo.lastBacktest?.maxDdTo
              ? `Worst DD ${algo.lastBacktest.maxDdFrom} → ${algo.lastBacktest.maxDdTo}`
              : "Peak-to-trough of the replay equity"
          }
        />
      </div>

      {isNiftyTest2Kind(algo) && algo.lastBacktest && algo.lastBacktest.optionSource !== "stored" ? (
        <div className="mt-3 rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-[11px] font-semibold leading-snug text-amber-900 dark:bg-amber-950/40 dark:text-amber-200" data-test2-synth-banner>
          {algo.lastBacktest.optionHistory?.error === "dhan-not-live"
            ? `Dhan is not connected, so no rolling option tape for ${algo.symbol || "this script"} was downloaded. Open Brokers, connect Dhan LIVE, then run Backtest again.`
            : algo.lastBacktest.optionHistory?.truncated
              ? `Dhan rolling download hit the time cap after ${algo.lastBacktest.optionHistory.days || 0} new day${Number(algo.lastBacktest.optionHistory.days) === 1 ? "" : "s"}. Run Backtest again to keep filling the tape.`
              : algo.lastBacktest.optionHistory?.error
                ? `Dhan rolling download failed (${algo.lastBacktest.optionHistory.error}). Connect Dhan LIVE and run Backtest again.`
                : algo.lastBacktest.optionHistory?.source === "none"
                  ? `Dhan is connected but /charts/rollingoption returned no NIFTY bars. Check Dhan Data API access, then run Backtest again.`
                  : `No stored Dhan rolling days for ${algo.symbol || "this script"} (${Number(algo.lastBacktest.optionHistory?.completeDays || 0)} complete). Connect Dhan LIVE and run Backtest again — empty stub days are now retried.`}
          {Number(algo.lastBacktest.trades || 0)
            ? ` Meanwhile this card shows a research book: ${algo.lastBacktest.trades} combos · P&L ${formatInr(Number(algo.lastBacktest.pnl || 0))}.`
            : " 0 combos."}{" "}
          Not live option prints until the tape is stored.
        </div>
      ) : null}
      {isNiftyTest2Kind(algo) && algo.lastBacktest ? (
        <div className="metric-well mt-3 grid-cols-2 sm:grid-cols-4">
          <Metric label="Avg / trade" value={formatInr(Number(algo.lastBacktest.avgProfit || 0))} tone={moneyClass(Number(algo.lastBacktest.avgProfit || 0))} hint="After ₹80 combo cost" />
          <Metric label="Avg win" value={formatInr(Number(algo.lastBacktest.avgWin || 0))} tone="text-up" hint="Winning combos only" />
          <Metric label="Avg loss" value={formatInr(Number(algo.lastBacktest.avgLoss || 0))} tone="text-down" hint="Losing combos only" />
          <Metric
            label="Max win / loss"
            value={`${formatInr(Number(algo.lastBacktest.maxProfit || 0))} / ${formatInr(Number(algo.lastBacktest.maxLoss || 0))}`}
            hint={
              algo.lastBacktest.maxProfitDay || algo.lastBacktest.maxLossDay
                ? `Win ${algo.lastBacktest.maxProfitDay || "—"} · Loss ${algo.lastBacktest.maxLossDay || "—"}`
                : "Single combo extremes"
            }
          />
          <Metric
            label="Return / DD"
            value={formatNumber(Number(algo.lastBacktest.returnDd || 0), 2)}
            hint={
              algo.lastBacktest.maxDdFrom && algo.lastBacktest.maxDdTo
                ? `Max DD ${algo.lastBacktest.maxDdFrom} → ${algo.lastBacktest.maxDdTo}`
                : "Overall P&L ÷ |max drawdown|"
            }
          />
          <Metric label="Reward : Risk" value={formatNumber(Number(algo.lastBacktest.rewardRisk || 0), 2)} hint="|Avg win| ÷ |avg loss|" />
          <Metric
            label="Streaks"
            value={`${Number(algo.lastBacktest.maxWinStreak || 0)}W / ${Number(algo.lastBacktest.maxLoseStreak || 0)}L`}
            hint={algo.lastBacktest.maxTradesInDd ? `Max ${algo.lastBacktest.maxTradesInDd} combos in one DD` : "Max consecutive win / lose"}
          />
          <Metric label="Expectancy" value={formatInr(Number(algo.lastBacktest.expectancy || 0))} hint="₹ per combo (same as avg / trade)" />
          <Metric
            label="Required margin"
            value={formatInr(Number(algo.lastBacktest.requiredMargin || algo.lastBacktest.maxMargin || 0))}
            hint={`Peak combo block · avg ${formatInr(Number(algo.lastBacktest.avgMargin || 0))} · estimate, not live SPAN`}
          />
          <Metric
            label="Overall profit"
            value={`${formatNumber(Number(algo.lastBacktest.overallTargetPct || 5), 1)}%`}
            hint={
              Number(algo.lastBacktest.targetHits || 0)
                ? `${algo.lastBacktest.targetHits} combo${Number(algo.lastBacktest.targetHits) === 1 ? "" : "s"} hit daily target · exited all 4 legs`
                : "Daily 5% of required margin exits all legs"
            }
          />
          <Metric
            label="Return on margin"
            value={`${formatNumber(Number(algo.lastBacktest.rom || 0), 2)}%`}
            hint="Overall P&L ÷ avg required margin"
          />
        </div>
      ) : null}
      {isNiftyTest2Kind(algo) && algo.lastBacktest?.legStats?.length ? (
        <div className="metric-well mt-2 grid-cols-2 sm:grid-cols-4">
          {algo.lastBacktest.legStats.map((leg) => (
            <Metric
              key={leg.key || `${leg.side}-${leg.option}`}
              label={leg.label || `${leg.side || ""} ${leg.option || ""}`.trim() || "Leg"}
              value={formatInr(Number(leg.pnl || 0))}
              tone={moneyClass(Number(leg.pnl || 0))}
              hint={`${leg.trades || 0} fills · WR ${formatNumber(Number(leg.winRate || 0), 1)}% · avg ${formatInr(Number(leg.avgProfit || 0))}`}
            />
          ))}
        </div>
      ) : null}

      {shivam ? null : (
      <div className="mt-4 text-xs text-slate-400" data-latest-activity="true">
        <span className="font-bold uppercase tracking-[0.12em] text-slate-500">Latest activity</span>
        <div className="mt-1">{activity}</div>
        {algo.lastBacktest?.timeframe || algo.lastBacktest?.optionSource ? (
          <div className="mt-1 text-[11px] text-slate-500">
            {algo.lastBacktest.timeframe ? `Replay ${algo.lastBacktest.timeframe}` : ""}
            {algo.lastBacktest.from || algo.lastBacktest.to
              ? ` · ${algo.lastBacktest.from || "—"} → ${algo.lastBacktest.to || "—"}`
              : ""}
            {algo.lastBacktest.years
              ? ` · last ${algo.lastBacktest.years} year${Number(algo.lastBacktest.years) === 1 ? "" : "s"}`
              : algo.lastBacktest.months
                ? ` · last ${algo.lastBacktest.months} month${Number(algo.lastBacktest.months) === 1 ? "" : "s"}`
                : algo.lastBacktest.range === "month"
                  ? " · this month"
                  : ""}
            {algo.lastBacktest.reused || algo.lastBacktest.optionHistory?.reused
              ? " · reused stored Dhan rolling days"
              : ""}
            {algo.lastBacktest.optionHistory?.reusedDays
              ? ` · ${algo.lastBacktest.optionHistory.reusedDays} days from disk`
              : ""}
            {algo.lastBacktest.optionHistory?.days
              ? ` · downloaded ${algo.lastBacktest.optionHistory.days} new day${Number(algo.lastBacktest.optionHistory.days) === 1 ? "" : "s"}`
              : ""}
            {algo.lastBacktest.optionSource
              ? `${algo.lastBacktest.timeframe ? " · " : ""}option premiums: ${
                  algo.lastBacktest.optionSource === "stored"
                    ? "Dhan rolling options (trusted)"
                    : algo.lastBacktest.optionSource === "mixed"
                      ? "Dhan rolling + synth gaps"
                      : "synthesized from NIFTY futures"
                }`
              : ""}
            {algo.lastBacktest.optionHistory?.overwritten?.length
              ? ` · replaced ${algo.lastBacktest.optionHistory.overwritten.length} day${algo.lastBacktest.optionHistory.overwritten.length === 1 ? "" : "s"}`
              : ""}
            {algo.lastBacktest.holdStyle ? ` · ${algo.lastBacktest.holdStyle === "intraday" ? "intraday MIS" : "BTST NRML"}` : ""}
            {algo.lastBacktest.lotNote ? ` · ${algo.lastBacktest.lotNote}` : ""}
            {" · PDF + Excel ready"}
            {isNiftyTest2Kind(algo) ? (
              <div className="mt-1 text-[11px] leading-snug text-slate-500">
                {algo.lastBacktest.storedTrades
                  ? `Trusted book: ${algo.lastBacktest.storedTrades} stored Dhan rolling days. Already-downloaded days are reused from disk — only missing weekdays are fetched.`
                  : algo.lastBacktest.optionHistory?.error === "dhan-not-live"
                    ? "Dhan is not connected — Backtest could not call /charts/rollingoption. Connect Dhan, then run Backtest again."
                    : "No stored Dhan rolling tape yet. With Dhan connected, Backtest downloads WEEK/MONTH ATM wings and keeps them on disk. Run Backtest again to continue."}
                {algo.lastBacktest.optionHistory?.truncated ? " Download hit the time cap — run Backtest again to fill more days." : ""}
                {algo.lastBacktest.optionHistory?.days
                  ? ` Last run stored ${algo.lastBacktest.optionHistory.days} new rolling day${Number(algo.lastBacktest.optionHistory.days) === 1 ? "" : "s"}.`
                  : ""}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={onEdit} className="inline-flex h-9 items-center gap-1 rounded-full border border-[var(--border)] px-3 text-xs font-semibold">
          <Pencil size={12} />
          Edit
        </button>
        <button type="button" onClick={onBacktest} className="h-9 rounded-full border border-[var(--border)] px-3 text-xs font-semibold">
          {busy && rangeOpen ? "Testing..." : "Backtest"}
        </button>
        <button
          type="button"
          onClick={onResetBacktest}
          title="Clears a stuck backtest lock (same as rm -f /opt/t2s/server/data/backtest.busy)"
          className="inline-flex h-9 items-center gap-1 rounded-full border border-[var(--border)] px-3 text-xs font-semibold"
        >
          <RotateCcw size={12} />
          Reset
        </button>
        <button
          type="button"
          disabled={busy || (!shivam && !algo.lastBacktest)}
          onClick={() => onReport("pdf")}
          className="inline-flex h-9 items-center gap-1 rounded-full border border-[var(--border)] px-3 text-xs font-semibold disabled:opacity-60"
        >
          <FileText size={12} />
          PDF
        </button>
        <button
          type="button"
          disabled={busy || (!shivam && !algo.lastBacktest)}
          onClick={() => onReport("xlsx")}
          className="inline-flex h-9 items-center gap-1 rounded-full border border-[var(--border)] px-3 text-xs font-semibold disabled:opacity-60"
        >
          <FileSpreadsheet size={12} />
          Excel
        </button>
        <button type="button" onClick={onDelete} className="inline-flex h-9 items-center gap-1 rounded-full border border-rose-200 px-3 text-xs font-semibold text-down dark:border-rose-900">
          <Trash2 size={12} />
          Delete
        </button>
      </div>

      {rangeOpen ? (
        <div className="mt-3">
          <BacktestRangeInline busy={busy} error={rangeError} onCancel={onCancelRange} onReset={onResetBacktest} onRun={onRunBacktest} />
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
        <div className="flex flex-wrap items-center gap-2">
          {isolated && !shivam ? (
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Paper test only · no live · no copy
            </span>
          ) : (
            <>
          <button type="button" onClick={onMap} className="inline-flex h-10 items-center gap-1.5 text-sm font-semibold" data-shivam-map="true">
            <Users size={15} />
            Map clients
          </button>
          <ClientVisibleToggle algo={algo} />
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {shivam ? (
            <button
              type="button"
              disabled={busy}
              onClick={onTestBroker}
              className="h-10 rounded-xl border border-[var(--border)] px-3 text-sm font-semibold disabled:opacity-60"
              data-test-broker-order="true"
            >
              Test 1 order
            </button>
          ) : null}
          <button type="button" disabled={busy} onClick={onExit} className="h-10 rounded-xl px-3 text-sm font-semibold text-down disabled:opacity-60">
            Exit position
          </button>
          {algo.runMode === "backtest" ? (
            <button type="button" disabled className="h-10 rounded-lg bg-slate-200 px-4 text-sm font-semibold text-slate-500 dark:bg-slate-800">
              Research only
            </button>
          ) : algo.enabled ? (
            <button
              type="button"
              disabled={busy}
              onClick={onStart}
              className="btn-halt h-10 rounded-lg px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              Stop strategy
            </button>
          ) : isolated && !shivam ? (
            <button
              type="button"
              disabled={busy}
              onClick={onStartPaper}
              className="btn-go h-10 rounded-lg px-4 text-sm font-semibold text-white disabled:opacity-60"
              data-start-paper="true"
            >
              Start paper
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={onStartPaper}
                className="h-10 rounded-lg border border-[var(--border)] px-4 text-sm font-semibold disabled:opacity-60"
                data-start-paper="true"
              >
                Start paper
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onStartLive}
                className="btn-go h-10 rounded-lg px-4 text-sm font-semibold text-white disabled:opacity-60"
                data-start-live="true"
              >
                Start live
              </button>
            </>
          )}
        </div>
      </div>
      {isNiftyVwapHedgeKind(algo) || isNiftyVwapReversalKind(algo) ? (
        <div className="mt-2 text-[11px] text-slate-500">
          Saving or mapping clients does not start LIVE. LIVE arms automatically at 09:20 IST on session days.
        </div>
      ) : null}
      {shivam && shivamDetails ? <ShivamTradeDetails algo={algo} onClose={() => setShivamDetails(false)} /> : null}
    </section>
  );
}

function ClientVisibleToggle({ algo }: { algo: AlgoStrategy }) {
  const { refresh } = useMarket();
  const [busy, setBusy] = useState(false);
  const visible = algo.clientVisible !== false;

  const setVisible = async (next: boolean) => {
    if (next === visible || busy) return;
    setBusy(true);
    try {
      await updateAlgo(algo.id, { clientVisible: next });
      await refresh();
    } catch (err) {
      window.alert(catchDeskError(err, "Could not change strategy visibility"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex overflow-hidden rounded-xl border border-[var(--border)]" data-strategy-visibility="true">
      <button
        type="button"
        disabled={busy}
        onClick={() => void setVisible(true)}
        className={cn(
          "h-10 px-3 text-xs font-extrabold uppercase disabled:opacity-60",
          visible ? "bg-emerald-50 text-up" : "text-slate-400",
        )}
      >
        Visible
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => void setVisible(false)}
        className={cn(
          "h-10 px-3 text-xs font-extrabold uppercase disabled:opacity-60",
          !visible ? "bg-slate-200 text-slate-600" : "text-slate-400",
        )}
      >
        Hidden
      </button>
    </div>
  );
}

function MapClientsModal({ algo, onClose, onSaved }: { algo: AlgoStrategy; onClose: () => void; onSaved: () => void }) {
  const { refresh } = useMarket();
  const seeded = peekClientList();
  const [clients, setClients] = useState<ClientRow[]>(seeded?.clients || []);
  const [scope, setScope] = useState<MappingScope>(algo.mappingScope || "both");
  const [picked, setPicked] = useState<string[]>(algo.mappedClientIds || []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(Boolean(seeded?.clients.length));

  const load = useCallback(async () => {
    try {
      const result = await loadClientList(true);
      setClients(result.clients || []);
      setError("");
    } catch (err) {
      setError(catchDeskError(err, "Could not load clients"));
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!loaded) return;
    const live = new Set(clients.map((row) => row.id));
    setPicked((current) => current.filter((id) => live.has(id)));
  }, [loaded, clients]);

  const toggleId = (id: string) => {
    setPicked((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await updateAlgo(algo.id, { mappedClientIds: picked, mappingScope: scope });
      await refresh();
      onSaved();
    } catch (err) {
      setError(catchDeskError(err, "Could not save mapping"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="desk-overlay z-40">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div className="desk-sheet relative z-10 flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-xl">
        <div className="flex items-center justify-between px-3 py-2">
          <h2 className="text-sm font-bold">Map clients to strategy</h2>
          <button type="button" className="text-slate-400" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-hidden px-3 pb-3">
          <div className="flex items-center gap-3 rounded-xl bg-[var(--bg)] px-4 py-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--card)] text-slate-400">
              <Users size={16} />
            </div>
            <div>
              <div className="text-sm font-bold">{algo.name}</div>
              <div className="text-xs text-slate-400">Choose where this strategy will execute</div>
            </div>
          </div>
          <label className="grid gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Mapping scope
            <select
              className="h-11 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 text-sm font-semibold normal-case tracking-normal text-[var(--text)]"
              value={scope}
              onChange={(event) => setScope(event.target.value as MappingScope)}
            >
              <option value="both">Master + selected clients</option>
              <option value="master">Master only</option>
              <option value="clients">Selected clients only</option>
            </select>
          </label>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {clients.map((row) => {
              const checked = picked.includes(row.id);
              return (
                <label
                  key={row.id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5"
                >
                  <input type="checkbox" checked={checked} onChange={() => toggleId(row.id)} />
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">
                    {(row.name || "?").trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{row.name}</span>
                    <span className="block text-[11px] text-slate-400">
                      {row.brokerName} · {row.linked || row.tradeMode === "real" ? "Active account" : "Paper account"}
                    </span>
                  </span>
                </label>
              );
            })}
            {!clients.length ? (
              <p className="py-6 text-center text-sm text-slate-400">
                {loaded ? "No clients yet. Add one on User & IP Manager first." : "Loading clients…"}
              </p>
            ) : null}
          </div>
          {error ? <p className="text-xs font-semibold text-down">{error}</p> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--border)] px-3 py-2">
          <button type="button" onClick={onClose} className="h-8 rounded-lg px-3 text-xs font-semibold">
            Cancel
          </button>
          <button type="button" disabled={busy} onClick={() => void save()} className="h-8 rounded-lg bg-brand-500 px-3 text-xs font-semibold text-white disabled:opacity-60">
            {busy ? "Saving..." : "Save mapping"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TabChip({
  label,
  on,
  onClick,
  accent,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      data-algo-test-tab={accent ? "true" : undefined}
      onClick={onClick}
      className={cn(on ? (accent ? "bg-brand-500 text-white" : "bg-navy-900 text-white") : accent ? "text-brand-500" : "text-slate-400")}
    >
      {label}
    </button>
  );
}

function Metric({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className={cn("px mt-1 text-sm font-bold", tone)}>{value}</div>
      {hint ? <div className="text-[10px] text-slate-500">{hint}</div> : null}
    </div>
  );
}
