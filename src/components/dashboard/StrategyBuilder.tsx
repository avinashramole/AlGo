import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { FirstCandleTimeframeBar } from "./FirstCandleTimeframeBar";
import { useMarket } from "../../context/MarketContext";
import { cn, formatNumber, fundsCaption } from "../../lib/format";
import {
  INDICATORS,
  OPERATORS,
  PATTERNS,
  SOURCES,
  STRATEGY_SYMBOLS,
  TEST1_SCRIPTS,
  firstCandleMinutes,
  firstCandleTimeframeSelect,
  firstCandleTimeframeValue,
  defaultConditions,
  emptyStrategy,
  formatConditionGroup,
  groupsFromFlat,
  MAX_CONDITION_ROWS,
  contractLabel,
  firstCandleEntryIst,
  strikeOffsetLabel,
  lotForSymbol,
  RUN_MODES,
  OPTION_OFFSETS,
  isNiftyVwapKind,
  isNiftyVwapReversalKind,
  isNiftyVwapHedgeKind,
  isCrudeFirstCandleKind,
  isNiftyFirstCandleKind,
  showsFirstCandleTimeframe,
  NIFTY_FIRST_CANDLE_NAME,
  CRUDE_FIRST_CANDLE_NAME,
  niftyFirstCandleTrail,
  isNiftyTestKind,
  isNiftyTest1Kind,
  isNiftyTest2Kind,
  isMultiIndexReversalKind,
  isShivamT2sKind,
  MULTI_INDEX_REVERSAL_NAME,
  MULTI_INDEX_SCRIPTS,
  MULTI_INDEX_OFFSETS,
  SHIVAM_T2S_NAME,
  SHIVAM_T2S_SCRIPTS,
  DESK_TIMEFRAME_PRESETS,
  isNiftyOptionEngineKind,
  type AlgoStrategy,
  type ConditionJoin,
  type ConditionOp,
  type ConditionRow,
  type ConditionSource,
  type StrategyKind,
} from "../../lib/strategies";

type Props = {
  open: boolean;
  algo?: AlgoStrategy | null;
  testDesk?: boolean;
  onClose: () => void;
};

const fieldClass = "mt-0.5 h-8 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-xs font-semibold";

const TEST2_SCRIPT_LABEL = "Script · NIFTY BANKNIFTY SENSEX";

function DeskTimeframeSelect({
  label,
  timeframe,
  mark,
  onPick,
}: {
  label: string;
  timeframe?: string;
  mark: "shivam-index" | "shivam-ce" | "shivam-pe";
  onPick: (timeframe: string) => void;
}) {
  const selected = firstCandleTimeframeSelect(timeframe);
  return (
    <label className="text-xs font-semibold text-slate-500" data-shivam-timeframe={mark}>
      {label}
      <select
        className={fieldClass}
        value={selected}
        onChange={(event) => {
          const picked = event.target.value;
          onPick(
            firstCandleTimeframeValue(
              picked,
              picked === "custom" ? (selected === "custom" ? firstCandleMinutes(timeframe) : 20) : undefined,
            ),
          );
        }}
      >
        {DESK_TIMEFRAME_PRESETS.map((row) => (
          <option key={row} value={row}>
            {row === "1H" ? "1hr" : row}
          </option>
        ))}
        <option value="custom">Custom</option>
      </select>
      {selected === "custom" ? (
        <span className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-slate-500" data-first-candle-custom-minutes="true">
          Minutes 1–60
          <input
            className="h-8 w-20 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-xs font-semibold text-[var(--text)]"
            type="number"
            min={1}
            max={60}
            value={firstCandleMinutes(timeframe)}
            onChange={(event) => onPick(firstCandleTimeframeValue("custom", Number(event.target.value)))}
          />
        </span>
      ) : null}
    </label>
  );
}

function Test2ScriptSelect({
  value,
  mark,
  onPick,
}: {
  value?: string;
  mark: string;
  onPick: (symbol: string) => void;
}) {
  return (
    <label className="block text-xs font-bold text-brand-600 dark:text-orange-300">
      {TEST2_SCRIPT_LABEL}
      <select data-test2-scripts={mark} className={`${fieldClass} border-brand-500`} value={value || "NIFTY"} onChange={(event) => onPick(event.target.value)}>
        <option value="NIFTY">NIFTY · CE/PE</option>
        <option value="BANKNIFTY">BANKNIFTY · CE/PE</option>
        <option value="FINNIFTY">FINNIFTY · CE/PE</option>
        <option value="SENSEX">SENSEX · CE/PE</option>
        <option value="CRUDEOIL">CRUDE OIL · CE/PE</option>
        <option value="NATURALGAS">NATURAL GAS · CE/PE</option>
        <option value="COPPER">COPPER · CE/PE</option>
      </select>
    </label>
  );
}

export function StrategyBuilder({ open, algo, testDesk = false, onClose }: Props) {
  const { data, saveAlgo } = useMarket();
  const [form, setForm] = useState(emptyStrategy("nifty-first-candle"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    if (algo) {
      const kind = (
        isNiftyVwapHedgeKind(algo)
          ? "nifty-vwap-hedge"
          : isNiftyVwapReversalKind(algo)
            ? "nifty-vwap-reversal"
            : isCrudeFirstCandleKind(algo)
              ? "crude-first-candle"
              : isNiftyFirstCandleKind(algo)
                ? "nifty-first-candle"
              : isMultiIndexReversalKind(algo)
                ? "multi-index-reversal"
              : isShivamT2sKind(algo)
                ? "shivam-t2s"
              : isNiftyTest2Kind(algo)
                ? "nifty-test2"
              : isNiftyTest1Kind(algo)
                ? "nifty-test1"
              : isNiftyTestKind(algo)
                ? "nifty-test"
              : isNiftyVwapKind(algo)
                ? "nifty-vwap"
                : algo.kind || "indicator"
      ) as StrategyKind;
      const synthesized = groupsFromFlat(algo);
      const crude = kind === "crude-first-candle";
      const trail = kind === "nifty-first-candle" ? niftyFirstCandleTrail(algo) : null;
      setForm({
        ...emptyStrategy(kind),
        ...algo,
        kind,
        ...(trail
          ? {
              trailingActivationPct: trail.activation,
              trailingEveryPct: trail.every,
              trailingShiftPct: trail.shift,
              trailingStepPct: trail.shift,
            }
          : {}),
        ...((kind === "nifty-first-candle" || crude)
          ? {
              entryEvaluationIst: firstCandleEntryIst(algo.firstBarStartIst, algo.timeframe, algo.entryEvaluationIst),
            }
          : {}),
        ...(crude
          ? {
              indicator: "CRUDE_FIRST_CANDLE",
              strategyType: "CRUDE_FIRST_CANDLE_5M",
              symbol: "CRUDEOIL",
              instrument: "option",
              pattern: undefined,
              rangeMinutes: undefined,
              buyConditions: undefined,
              sellConditions: undefined,
              buyLeft: undefined,
              buyOp: undefined,
              buyRight: undefined,
              buyValue: undefined,
              sellLeft: undefined,
              sellOp: undefined,
              sellRight: undefined,
              sellValue: undefined,
            }
          : {
              buyConditions: algo.buyConditions?.rows?.length ? algo.buyConditions : synthesized.buyConditions,
              sellConditions: algo.sellConditions?.rows?.length ? algo.sellConditions : synthesized.sellConditions,
            }),
      });
    } else {
      setForm({
        ...emptyStrategy(testDesk ? "shivam-t2s" : "nifty-first-candle"),
        brokerId: testDesk ? "paper" : data.activeBrokerId || "dhan",
        runMode: testDesk ? "paper" : "live",
        testDesk,
      });
    }
    setError("");
  }, [open, algo, data.activeBrokerId, testDesk]);

  const connected = (data.brokers || []).filter((item) => item.connected);
  const liveBrokers = (data.brokers || []).filter((item) => item.id !== "paper");
  const kind = (form.kind || "indicator") as StrategyKind;
  const editing = Boolean(algo);
  const title = editing ? String(algo?.name || "Edit strategy") : testDesk ? "Add test strategy" : "Add strategy";

  const lotSize = lotForSymbol(form.symbol);
  const lots = form.lots || 1;
  const vwap = isNiftyVwapKind(form);
  const reversal = isNiftyVwapReversalKind(form);
  const hedge = isNiftyVwapHedgeKind(form);
  const firstCandle = isNiftyFirstCandleKind(form);
  const crudeFirst = isCrudeFirstCandleKind(form) || isCrudeFirstCandleKind(algo || undefined);
  const firstCandleTf = showsFirstCandleTimeframe(form) || showsFirstCandleTimeframe(algo || undefined) || firstCandle || crudeFirst;
  const niftyTest = isNiftyTestKind(form);
  const test1 = isNiftyTest1Kind(form) || isNiftyTest1Kind(algo || undefined);
  const test2 = isNiftyTest2Kind(form) || isNiftyTest2Kind(algo || undefined);
  const mir = isMultiIndexReversalKind(form) || isMultiIndexReversalKind(algo || undefined);
  const shivam = isShivamT2sKind(form) || isShivamT2sKind(algo || undefined);
  const engine = isNiftyOptionEngineKind(form) || test1 || test2;
  const preview = useMemo(() => {
    if (isNiftyVwapHedgeKind(form)) {
      return `NIFTY weekly ATM · 1 lot primary + 2 lots opposite once · last closed 15m vs VWAP · primary +40% · −20% hedge · +5% account exit · daily LIVE 09:20 IST`;
    }
    if (isNiftyVwapReversalKind(form)) {
      return `NIFTY weekly ATM CE/PE · ${lots} lot × ${lotSize} = ${lots * lotSize} qty · last closed 15m vs VWAP · BUY at next 15m open · SL ${form.initialSlPct || 15}% / TGT ${form.targetPct || 30}% · daily LIVE 09:20 IST`;
    }
    if (isNiftyTestKind(form)) {
      return `Nifty Test · NIFTY FUT · ${form.timeframe || "5m"} · live feed while started · current candle above open → BUY · below open → SELL · SL ${form.slPct || 0.4}% / TGT ${form.targetPct || 0.8}%`;
    }
    if (isNiftyTest2Kind(form) || test2) {
      const style = form.holdStyle === "intraday" ? "intraday" : "btst";
      const root = form.symbol || "NIFTY";
      const sellOpt = form.sellExpiryKind === "weekly" ? "weekly" : "monthly";
      const hedgeOpt = form.hedgeExpiryKind === "monthly" ? "monthly" : "weekly";
      const hold =
        style === "intraday"
          ? `${root} INTRADAY · enter ${form.startTimeIst || "09:35"} IST · square-off ${form.endTimeIst || "15:15"} IST · MIS same day`
          : `${root} BTST · buy today ${form.startTimeIst || "09:35"} IST · sell tomorrow ${form.exitTimeIst || "15:15"} IST · NRML overnight`;
      return `TEST2 · ${hold} · SELL ${sellOpt} CE+PE premium ≥${form.sellPremium || 80} · BUY ${hedgeOpt} CE+PE premium ≥${form.hedgePremium || 20} · hedge SL ${form.hedgeSlPct || 20}% · overall +${form.overallTargetPct ?? 5}% exits all`;
    }
    if (isShivamT2sKind(form) || shivam) {
      const script = SHIVAM_T2S_SCRIPTS.find((row) => row.id === form.symbol) || SHIVAM_T2S_SCRIPTS[0];
      return `Shivam T2S · ${script.label} ${script.futures} · IDX ${form.indexTimeframe || "5m"} CE ${form.ceTimeframe || "5m"} PE ${form.peTimeframe || "5m"} · ATM auto · SL ${form.slValue || 20}${form.slMode === "points" ? " pts" : "%"} / TGT ${form.targetValue || 40}${form.targetMode === "points" ? " pts" : "%"} · max ${form.maxTradesPerDay || 5} trades/day · ${form.runMode === "live" ? "Live Dhan · admin + mapped brokers" : "Paper"} · map clients`;
    }
    if (isMultiIndexReversalKind(form) || mir) {
      const script = MULTI_INDEX_SCRIPTS.find((row) => row.id === form.symbol) || MULTI_INDEX_SCRIPTS[0];
      const basis = form.combinedTargetBasis === "combined" ? "combined premium" : "original premium";
      return `Multi-Index Reversal · ${script.label} ${script.exchange} · ${form.timeframe || "15m"} · offset ${form.strikeOffset ?? 0} · TGT ${form.initialTargetPct || 40}% · reverse −${form.reversalLossPct || 20}% ×${form.reversalQtyMultiple || 2} · combined +${form.combinedTargetPct || 20}% ${basis} · paper until Live`;
    }
    if (isNiftyTest1Kind(form) || test1) {
      const body = Math.round((Number(form.minBodyPct) || 0.9) * 100);
      const wick = Math.round((Number(form.maxWickPct) || 0.1) * 100);
      return `TEST1 · ${form.symbol || "NIFTY"} ${form.timeframe || "5m"} ATM CE/PE · after ${form.startTimeIst || "09:30"} IST · green body ≥${body}% · wick ≤${wick}% · BUY once per candle · TGT ${form.targetMultiple || 1}× signal ${form.targetSource === "range" ? "range" : "body"} from fill · SL candle low`;
    }
    if (crudeFirst) {
      const requested = Number(form.maxTradesPerDay);
      const maxTrades = Number.isFinite(requested) && requested >= 1 ? Math.max(1, Math.min(20, Math.round(requested))) : 5;
      const tf = form.timeframe || "5m";
      return `CRUDE OIL ${tf} · monthly ATM · FUT+CE green and PE red → BUY CE · FUT+PE green and CE red → BUY PE · SL ${form.initialSlPct || 20}% / TGT ${form.targetPct || 40}% · ${lots} lot × 100 = ${lots * 100} qty · max ${maxTrades} trades · MCX until ${form.endTimeIst || "23:15"} IST`;
    }
    if (isNiftyFirstCandleKind(form)) {
      const start = form.dailyLiveIst || "09:00";
      const firstBar = form.firstBarStartIst || "09:00";
      const tf = form.timeframe || "5m";
      const evalAt = firstCandleEntryIst(firstBar, tf, form.entryEvaluationIst);
      const expiry = form.expiryKind === "monthly" ? "monthly" : "weekly";
      const maxTrades = Number.isFinite(Number(form.maxTradesPerDay)) && Number(form.maxTradesPerDay) >= 1
        ? Math.max(1, Math.min(20, Math.round(Number(form.maxTradesPerDay))))
        : 5;
      const trail = niftyFirstCandleTrail(form);
      return `NIFTY ${tf} · ${strikeOffsetLabel(form.strikeOffset)} ${expiry} · ${lots} lot × ${lotSize} = ${lots * lotSize} qty · up to ${maxTrades} trades · ${firstBar}–${evalAt} IST · SL ${form.initialSlPct || 20}% / TGT ${form.targetPct || 40}% · trailing SL +${trail.activation}% to buy, then +${trail.shift}% every +${trail.every}% · LIVE ${start} IST`;
    }
    if (isNiftyVwapKind(form)) {
      return `NIFTY ATM CE/PE · ${lots} lot × ${lotSize} = ${lots * lotSize} qty · 5m VWAP · SL ${form.initialSlPct || 20}% / TGT ${form.targetPct || 40}%`;
    }
    const buy = formatConditionGroup(form.buyConditions, {
      left: form.buyLeft,
      op: form.buyOp,
      right: form.buyRight,
      value: form.buyValue,
    });
    const sell = formatConditionGroup(form.sellConditions, {
      left: form.sellLeft,
      op: form.sellOp,
      right: form.sellRight,
      value: form.sellValue,
    });
    return `${contractLabel(form)} · ${lots} lot × ${lotSize} = ${lots * lotSize} qty · BUY when ${buy} · SELL when ${sell}`;
  }, [form, lotSize, lots, crudeFirst, test1, test2, mir, shivam]);

  const set = (patch: Partial<AlgoStrategy>) => setForm((current) => ({ ...current, ...patch }));
  const setFirstCandleTimeframe = (picked: string, customMinutes?: number) => {
    const alreadyCustom = firstCandleTimeframeSelect(form.timeframe) === "custom";
    const timeframe = firstCandleTimeframeValue(
      picked,
      picked === "custom" ? (alreadyCustom ? firstCandleMinutes(form.timeframe) : customMinutes ?? 20) : customMinutes,
    );
    set({
      timeframe,
      barMinutes: firstCandleMinutes(timeframe),
      entryEvaluationIst: firstCandleEntryIst(form.firstBarStartIst, timeframe, form.entryEvaluationIst),
    });
  };
  const pickTest2Script = (symbol: string) => {
    const row = TEST1_SCRIPTS.find((item) => item.id === symbol) || TEST1_SCRIPTS[0];
    const mcx = row.session === "mcx";
    set({
      symbol: row.id,
      lotSize: row.lot,
      qty: (form.lots || 1) * row.lot,
      endTimeIst: mcx ? "23:15" : form.endTimeIst || "15:15",
      sellExpiryKind: mcx ? "monthly" : form.sellExpiryKind || "monthly",
      hedgeExpiryKind: mcx ? "monthly" : form.hedgeExpiryKind || "weekly",
      instrument: "option",
      side: "BOTH",
    });
  };

  const submit = async () => {
    if (shivam) {
      if (!SHIVAM_T2S_SCRIPTS.some((row) => row.id === (form.symbol || "NIFTY"))) {
        setError("Pick NIFTY, BANKNIFTY, FINNIFTY, SENSEX, CRUDEOIL, COPPER, or NATURALGAS.");
        return;
      }
      if (!(Number(form.slValue) > 0) || !(Number(form.targetValue) > 0)) {
        setError("Stop-loss and target must be greater than 0.");
        return;
      }
    } else if (mir) {
      if (!MULTI_INDEX_SCRIPTS.some((row) => row.id === (form.symbol || "NIFTY"))) {
        setError("Pick NIFTY 50, BANK NIFTY, FINNIFTY, or SENSEX.");
        return;
      }
      const offset = Math.round(Number(form.strikeOffset) || 0);
      if (offset < -4 || offset > 4) {
        setError("Strike offset must be between -4 and +4.");
        return;
      }
    } else if (!String(form.name || "").trim()) {
      setError("Give the strategy a name.");
      return;
    }
    setBusy(true);
    setError("");
    const seal = (payload: Record<string, unknown>) => {
      if (shivam) {
        const live = payload.runMode === "live";
        return {
          ...payload,
          testDesk: true,
          runMode: payload.runMode === "backtest" ? "backtest" : live ? "live" : "paper",
          brokerId: live
            ? payload.brokerId && payload.brokerId !== "paper"
              ? payload.brokerId
              : data.activeBrokerId || "dhan"
            : "paper",
          liveAuthorized: live,
        };
      }
      if (testDesk) {
        const live = payload.runMode === "live";
        return {
          ...payload,
          testDesk: true,
          runMode: payload.runMode === "backtest" ? "backtest" : live ? "live" : "paper",
          brokerId: live
            ? payload.brokerId && payload.brokerId !== "paper"
              ? payload.brokerId
              : data.activeBrokerId || "dhan"
            : "paper",
        };
      }
      return { ...payload, testDesk: Boolean(payload.testDesk) };
    };
    try {
      await saveAlgo(
        seal(
        shivam
          ? {
              ...form,
              id: algo?.id,
              name: SHIVAM_T2S_NAME,
              kind: "shivam-t2s",
              strategyType: "SHIVAM_T2S",
              indicator: "SHIVAM_T2S",
              symbol: SHIVAM_T2S_SCRIPTS.some((row) => row.id === form.symbol) ? form.symbol : "NIFTY",
              instrument: "option",
              side: "BUY",
              ceTimeframe: firstCandleTimeframeValue(String(form.ceTimeframe || "5m")),
              peTimeframe: firstCandleTimeframeValue(String(form.peTimeframe || "5m")),
              indexTimeframe: firstCandleTimeframeValue(String(form.indexTimeframe || "5m")),
              timeframe: firstCandleTimeframeValue(String(form.indexTimeframe || form.timeframe || "5m")),
              strikePolicy: "ATM",
              strikeOffset: 0,
              slMode: form.slMode === "points" ? "points" : "percentage",
              targetMode: form.targetMode === "points" ? "points" : "percentage",
              capitalMode: form.capitalMode === "percent" ? "percent" : "amount",
              liveAuthorized: form.runMode === "live",
              runMode: form.runMode === "backtest" ? "backtest" : form.runMode === "live" ? "live" : "paper",
              brokerId:
                form.runMode === "live"
                  ? form.brokerId && form.brokerId !== "paper"
                    ? form.brokerId
                    : data.activeBrokerId || "dhan"
                  : "paper",
              testDesk: true,
              enabled: Boolean(algo?.enabled),
            }
          : mir
          ? {
              ...form,
              id: algo?.id,
              name: MULTI_INDEX_REVERSAL_NAME,
              kind: "multi-index-reversal",
              strategyType: "MULTI_INDEX_REVERSAL",
              indicator: "MULTI_INDEX_REVERSAL",
              symbol: MULTI_INDEX_SCRIPTS.some((row) => row.id === form.symbol) ? form.symbol : "NIFTY",
              instrument: "option",
              side: "BUY",
              timeframe: firstCandleTimeframeValue(String(form.timeframe || "15m")),
              strikeOffset: Math.max(-4, Math.min(4, Math.round(Number(form.strikeOffset) || 0))),
              initialTargetPct: Number(form.initialTargetPct) > 0 ? Number(form.initialTargetPct) : 40,
              reversalLossPct: Number(form.reversalLossPct) > 0 ? Number(form.reversalLossPct) : 20,
              reversalQtyMultiple: Number(form.reversalQtyMultiple) >= 1 ? Number(form.reversalQtyMultiple) : 2,
              combinedTargetPct: Number(form.combinedTargetPct) > 0 ? Number(form.combinedTargetPct) : 20,
              combinedTargetBasis: form.combinedTargetBasis === "combined" ? "combined" : "original",
              maxCycleLossPct: Math.max(0, Number(form.maxCycleLossPct) || 0),
              runMode: form.runMode === "live" ? "live" : form.runMode === "backtest" ? "backtest" : "paper",
              brokerId: form.runMode === "live" ? form.brokerId || data.activeBrokerId || "dhan" : "paper",
              enabled: Boolean(algo?.enabled),
            }
          : test2
          ? {
              ...form,
              id: algo?.id,
              name: "TEST2",
              kind: "nifty-test2",
              strategyType: "NIFTY_TEST2",
              indicator: "NIFTY_TEST2",
              symbol: form.symbol || "NIFTY",
              instrument: "option",
              side: "BOTH",
              timeframe: "5m",
              sellExpiryKind: form.sellExpiryKind === "weekly" ? "weekly" : "monthly",
              hedgeExpiryKind: form.hedgeExpiryKind === "monthly" ? "monthly" : "weekly",
              holdStyle: form.holdStyle === "intraday" ? "intraday" : "btst",
              product: form.holdStyle === "intraday" ? "MIS" : "NRML",
              holdOvernight: form.holdStyle !== "intraday",
              intradayOnly: form.holdStyle === "intraday",
              eodSquareOffMinutes: form.holdStyle === "intraday" ? 15 : 0,
            }
          : test1
          ? {
              ...form,
              id: algo?.id,
              name: "TEST1",
              kind: "nifty-test1",
              strategyType: "NIFTY_TEST1",
              indicator: "NIFTY_TEST1",
              symbol: form.symbol || "NIFTY",
              instrument: "option",
              strikeOffset: 0,
              side: "BUY",
              timeframe: firstCandleTimeframeValue(String(form.timeframe || "5m")),
            }
          : crudeFirst
          ? {
              ...form,
              id: algo?.id,
              name: CRUDE_FIRST_CANDLE_NAME,
              kind: "crude-first-candle",
              strategyType: "CRUDE_FIRST_CANDLE_5M",
              indicator: "CRUDE_FIRST_CANDLE",
              symbol: "CRUDEOIL",
              instrument: "option",
              pattern: undefined,
              rangeMinutes: undefined,
              buyConditions: undefined,
              sellConditions: undefined,
              buyLeft: undefined,
              buyOp: undefined,
              buyRight: undefined,
              buyValue: undefined,
              sellLeft: undefined,
              sellOp: undefined,
              sellRight: undefined,
              sellValue: undefined,
            }
          : firstCandle
          ? {
              ...form,
              id: algo?.id,
              name: NIFTY_FIRST_CANDLE_NAME,
              kind: "nifty-first-candle",
              strategyType: "NIFTY_FIRST_CANDLE_5M",
              indicator: "NIFTY_FIRST_CANDLE",
            }
          : { ...form, id: algo?.id },
        ),
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save strategy");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="desk-overlay">
      <div
        className="desk-sheet card p-3"
        data-edit-strategy={editing ? algo?.id || "open" : "new"}
        data-test2-edit={test2 ? "true" : "false"}
        data-mir-strategy={mir ? "true" : undefined}
        data-shivam-strategy={shivam ? "true" : undefined}
        data-ui={test2 ? "test2-script-v5" : undefined}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-bold sm:text-base">{title}</div>
            {editing ? null : (
              <div className="desk-help line-clamp-2 text-[11px] text-slate-400">
                {testDesk ? "Algo Test keeps its own book. Start paper or live, then map clients to copy their brokers. " : ""}
                {preview}
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} className="icon-btn">
            <X size={16} />
          </button>
        </div>

        {test2 ? (
          <div className="mb-2">
            <Test2ScriptSelect value={form.symbol} mark="top" onPick={pickTest2Script} />
          </div>
        ) : null}

        {editing ? null : testDesk ? (
        <div className="grid grid-cols-2 gap-1.5">
          <TypeCard
            active={shivam}
            title="SHIVAM T2S"
            text="Live trading strategy on Algo Test. NIFTY (or another index) future green + CE green buys CE. Future red + PE green buys PE. Doji skips. ATM auto from the instrument master. Paper or Live Dhan after Start. Live entries go to the admin broker and mapped user brokers. Capital management uses Dhan funds and the live lot size. Map clients on the card to copy users. Card shows ● ● ● or NO Trade."
            onClick={() => {
              const next = emptyStrategy("shivam-t2s");
              set({
                ...next,
                name: SHIVAM_T2S_NAME,
                runMode: form.runMode === "live" ? "live" : "paper",
                brokerId: form.runMode === "live" ? data.activeBrokerId || "dhan" : "paper",
                liveAuthorized: form.runMode === "live",
                testDesk: true,
                lots: form.lots || 1,
                capitalMode: form.capitalMode || "amount",
                capitalValue: form.capitalValue ?? 50000,
                enabled: false,
              });
            }}
          />
          <TypeCard
            active={kind === "nifty-first-candle"}
            title="NIFTY"
            text="Algo Test copy of NIFTY 5m first candle. Paper or Live after Start. Map clients on the card to copy user brokers."
            onClick={() =>
              set({
                ...emptyStrategy("nifty-first-candle"),
                name: NIFTY_FIRST_CANDLE_NAME,
                runMode: form.runMode === "live" ? "live" : "paper",
                brokerId: form.runMode === "live" ? data.activeBrokerId || "dhan" : "paper",
                testDesk: true,
                lots: form.lots || 1,
                lotSize,
                qty: (form.lots || 1) * lotSize,
                enabled: false,
              })
            }
          />
          <TypeCard
            active={test1}
            title="TEST1"
            text="Algo Test copy of TEST1. Paper or Live after Start. Map clients on the card to copy user brokers."
            onClick={() =>
              set({
                ...emptyStrategy("nifty-test1"),
                name: "TEST1",
                runMode: form.runMode === "live" ? "live" : "paper",
                brokerId: form.runMode === "live" ? data.activeBrokerId || "dhan" : "paper",
                testDesk: true,
                lots: form.lots || 1,
                lotSize,
                qty: (form.lots || 1) * lotSize,
                enabled: false,
              })
            }
          />
          <TypeCard
            active={mir}
            title="MULTI-INDEX"
            text="Algo Test copy of Multi-Index. Paper or Live after Start. Map clients on the card to copy user brokers."
            onClick={() => {
              const next = emptyStrategy("multi-index-reversal");
              set({
                ...next,
                name: MULTI_INDEX_REVERSAL_NAME,
                runMode: form.runMode === "live" ? "live" : "paper",
                brokerId: form.runMode === "live" ? data.activeBrokerId || "dhan" : "paper",
                testDesk: true,
                lots: form.lots || 1,
                lotSize: next.lotSize,
                qty: (form.lots || 1) * Number(next.lotSize || 65),
                enabled: false,
              });
            }}
          />
        </div>
        ) : (
        <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-3">
          <TypeCard
            active={crudeFirst}
            title="CRUDE OIL"
            text="Pick 5m, 15m, 30m, 1hr, or custom 1–60 minutes. Checks every completed Crude future candle until a signal. Crude green + ATM CE green → BUY CE. Crude red + ATM PE green → BUY PE. Doji skips that candle. MCX. Paused until Start."
            onClick={() => {
              const next = emptyStrategy("crude-first-candle");
              set({
                ...next,
                name: CRUDE_FIRST_CANDLE_NAME,
                runMode: form.runMode || "live",
                brokerId: (form.runMode || "live") === "live" ? data.activeBrokerId || "dhan" : "paper",
                lots: form.lots || 1,
                lotSize: next.lotSize,
                qty: (form.lots || 1) * Number(next.lotSize || 100),
                enabled: false,
              });
            }}
          />
          <TypeCard
            active={test2}
            title="TEST2"
            text="Pick an NSE index or MCX script, then choose monthly or weekly options. Intraday (MIS same-day) or BTST (NRML overnight). Sell CE+PE ≥ premium, buy hedge CE+PE ≥ premium. Hedge SL 20%."
            onClick={() =>
              set({
                ...emptyStrategy("nifty-test2"),
                name: "TEST2",
                runMode: form.runMode || "live",
                brokerId: (form.runMode || "live") === "live" ? data.activeBrokerId || "dhan" : "paper",
                lots: form.lots || 1,
                lotSize,
                qty: (form.lots || 1) * lotSize,
                enabled: false,
              })
            }
          />
          <TypeCard
            active={test1}
            title="TEST1"
            text="Pick an NSE index or MCX script and a timeframe. After 09:30 IST, buy that script's current ATM CE or PE when that option candle is green with body ≈90% and wicks ≈10%. Target is 100% of that body from the fill. SL is the signal candle low. One order per candle."
            onClick={() =>
              set({
                ...emptyStrategy("nifty-test1"),
                name: "TEST1",
                runMode: form.runMode || "live",
                brokerId: (form.runMode || "live") === "live" ? data.activeBrokerId || "dhan" : "paper",
                lots: form.lots || 1,
                lotSize,
                qty: (form.lots || 1) * lotSize,
                enabled: false,
              })
            }
          />
          <TypeCard
            active={mir}
            title="MULTI-INDEX"
            text="NIFTY 50, BANK NIFTY, FINNIFTY, or SENSEX. Completed candle: index green + CE green buys CE. Index red + PE green buys PE. Initial target 40%. At −20% plus opposite index candle, buy 2× the other side and keep both. Combined target 20%. Default paper."
            onClick={() => {
              const next = emptyStrategy("multi-index-reversal");
              set({
                ...next,
                name: MULTI_INDEX_REVERSAL_NAME,
                runMode: "paper",
                brokerId: "paper",
                lots: form.lots || 1,
                lotSize: next.lotSize,
                qty: (form.lots || 1) * Number(next.lotSize || 65),
                enabled: false,
              });
            }}
          />
          {shivam ? (
          <TypeCard
            active={shivam}
            title="SHIVAM T2S"
            text="Algo Test only. NIFTY (or another index) future green + CE green buys CE. Future red + PE green buys PE. Doji skips. ATM auto from the instrument master. Paper or Live Dhan after Start. Live entries go to the admin broker and mapped user brokers. Map clients on the card to copy users. Card shows ● ● ● or NO Trade."
            onClick={() => {
              const next = emptyStrategy("shivam-t2s");
              set({
                ...next,
                name: SHIVAM_T2S_NAME,
                runMode: "paper",
                brokerId: "paper",
                liveAuthorized: false,
                testDesk: true,
                lots: form.lots || 1,
                enabled: false,
              });
            }}
          />
          ) : null}
          <TypeCard
            active={kind === "nifty-first-candle"}
            title="NIFTY"
            text="Pick 5m, 15m, 30m, 1hr, or custom 1–60 minutes. NIFTY FUT green + ATM CE green → BUY ATM CE. NIFTY FUT red + ATM PE green → BUY ATM PE. Doji skips that candle. SL 20% / target 40%. LIVE at 09:00 IST."
            onClick={() =>
              set({
                ...emptyStrategy("nifty-first-candle"),
                name: NIFTY_FIRST_CANDLE_NAME,
                runMode: form.runMode || "live",
                brokerId: (form.runMode || "live") === "live" ? data.activeBrokerId || "dhan" : "paper",
                lots: form.lots || 1,
                lotSize,
                qty: (form.lots || 1) * lotSize,
                enabled: false,
              })
            }
          />
        </div>
        )}

        {mir || shivam ? (
        <div className="mt-1.5 grid grid-cols-2 gap-1.5" data-mir-trade-mode="true" data-shivam-trade-mode={shivam ? "true" : undefined}>
          <TypeCard
            active={(form.runMode || "paper") !== "live"}
            title="Paper"
            text="Uses the live feed. Fills stay virtual — they never go to a broker."
            onClick={() => set(shivam ? { runMode: "paper", brokerId: "paper", liveAuthorized: false } : { runMode: "paper", brokerId: "paper" })}
          />
          <TypeCard
            active={form.runMode === "live"}
            title="Live"
            text="Real CE/PE orders go to the selected broker after you press Start. Saving does not start LIVE."
            onClick={() =>
              set(
                shivam
                  ? { runMode: "live", brokerId: data.activeBrokerId || "dhan", liveAuthorized: true }
                  : { runMode: "live", brokerId: data.activeBrokerId || "dhan" },
              )
            }
          />
        </div>
        ) : (
        <div className="mt-1.5 grid grid-cols-3 gap-1.5" data-strategy-trade-mode="true">
          {RUN_MODES.map((mode) => (
            <TypeCard
              key={mode.id}
              active={(form.runMode || (testDesk ? "paper" : "live")) === mode.id}
              title={mode.title}
              text={mode.text}
              onClick={() =>
                set({
                  runMode: mode.id,
                  brokerId: mode.id === "live" ? data.activeBrokerId || "dhan" : "paper",
                })
              }
            />
          ))}
        </div>
        )}

        {shivam ? (
          <div className="mt-2.5 space-y-1.5 rounded-lg border border-brand-500/40 bg-[var(--bg)] px-2.5 py-2" data-shivam-capital="true">
            <div className="text-[11px] font-extrabold uppercase tracking-wide text-brand-600">Capital management</div>
            <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-4">
              <label className="text-xs font-semibold text-slate-500">
                Lots per entry
                <input
                  className={fieldClass}
                  type="number"
                  min={1}
                  value={lots}
                  onChange={(event) => {
                    const nextLots = Math.max(1, Number(event.target.value) || 1);
                    set({ lots: nextLots });
                  }}
                />
              </label>
              <label className="text-xs font-semibold text-slate-500">
                Capital
                <select className={fieldClass} value={form.capitalMode || "amount"} onChange={(event) => set({ capitalMode: event.target.value === "percent" ? "percent" : "amount" })}>
                  <option value="amount">Amount ₹</option>
                  <option value="percent">Percent of funds</option>
                </select>
              </label>
              <NumberField label={form.capitalMode === "percent" ? "Allocation %" : "Allocation ₹"} value={form.capitalValue ?? 50000} step={form.capitalMode === "percent" ? 1 : 1000} onChange={(capitalValue) => set({ capitalValue })} />
              <label className="text-xs font-semibold text-slate-500">
                Dhan funds
                <input
                  className={fieldClass}
                  readOnly
                  value={(() => {
                    const dhan = (data.brokers || []).find((row) => row.id === "dhan");
                    return dhan && Number(dhan.funds) > 0 ? fundsCaption(dhan) : "Connect Dhan LIVE";
                  })()}
                />
              </label>
            </div>
            <label className="block text-xs font-semibold text-slate-500">
              <input
                type="checkbox"
                className="mr-2 align-middle"
                checked={form.autoSizeLots === true}
                onChange={(event) => set({ autoSizeLots: event.target.checked })}
              />
              Auto-size lots down to the calculated maximum (off = reject oversized requests)
            </label>
            <p className="text-[11px] font-semibold leading-snug text-slate-500">
              {(() => {
                const dhan = (data.brokers || []).find((row) => row.id === "dhan");
                const funds = Number(dhan?.funds || 0);
                const capitalValue = Number(form.capitalValue ?? 50000);
                const allocation = form.capitalMode === "percent" ? funds * (capitalValue / 100) : capitalValue;
                const approved = funds > 0 ? Math.min(allocation, funds) : allocation;
                return `Approved allocation ₹${formatNumber(Math.max(0, approved), 0)}. Max lots use live premium × instrument-master lot size — never a hardcoded NIFTY size. Requested lots ${lots} are rejected if they exceed that maximum unless auto-size is on.`;
              })()}
            </p>
          </div>
        ) : null}

        {shivam ? (
          <div className="mt-2.5 grid grid-cols-2 gap-1.5 lg:grid-cols-3" data-shivam-name-broker="true">
            <label className="text-xs font-semibold text-slate-500">
              Strategy name
              <input className={fieldClass} value={SHIVAM_T2S_NAME} readOnly />
            </label>
            <label className="text-xs font-semibold text-slate-500" data-shivam-broker="true">
              Broker
              <select
                className={fieldClass}
                value={form.runMode === "live" ? form.brokerId || "dhan" : "paper"}
                disabled={form.runMode !== "live"}
                onChange={(event) => set({ brokerId: event.target.value })}
              >
                {(form.runMode === "live" ? liveBrokers : connected.filter((item) => item.id === "paper")).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {item.liveFeed ? " · LIVE" : item.connected && item.id !== "dhan" ? " · connected" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-500" data-trade-limit="daily" data-shivam-daily-limit="true">
              Daily trade limit
              <input
                type="number"
                min={1}
                max={100}
                inputMode="numeric"
                aria-label="Daily trade limit"
                className={fieldClass}
                value={Math.max(1, Math.round(Number(form.maxTradesPerDay) || 5))}
                onChange={(event) =>
                  set({
                    maxTradesPerDay: Math.max(1, Math.min(100, Math.round(Number(event.target.value) || 1))),
                  })
                }
              />
            </label>
          </div>
        ) : null}

        {vwap || reversal || hedge || test2 || shivam ? null : (
          <FirstCandleTimeframeBar
            timeframe={form.timeframe}
            mark={crudeFirst ? "crude" : firstCandle ? "nifty" : test1 ? "test1" : mir ? "mir" : "form"}
            onPick={firstCandleTf ? setFirstCandleTimeframe : (timeframe) => set({ timeframe, barMinutes: firstCandleMinutes(timeframe) })}
          />
        )}

        <label className={cn("mt-2.5 block text-xs font-semibold text-slate-500", (editing || test2 || mir || shivam) && "sm:hidden", (test2 || mir || shivam) && "hidden")}>
          Strategy name
          <input
            className={fieldClass}
            value={shivam ? SHIVAM_T2S_NAME : mir ? MULTI_INDEX_REVERSAL_NAME : test2 ? "TEST2" : test1 ? "TEST1" : firstCandle ? NIFTY_FIRST_CANDLE_NAME : crudeFirst ? CRUDE_FIRST_CANDLE_NAME : form.name || ""}
            onChange={(event) =>
              set({
                name: shivam
                  ? SHIVAM_T2S_NAME
                  : mir
                  ? MULTI_INDEX_REVERSAL_NAME
                  : test2
                  ? "TEST2"
                  : test1
                    ? "TEST1"
                    : firstCandle
                      ? NIFTY_FIRST_CANDLE_NAME
                      : crudeFirst
                        ? CRUDE_FIRST_CANDLE_NAME
                        : event.target.value,
              })
            }
            readOnly={shivam || mir || test2 || test1 || firstCandle || crudeFirst}
            placeholder="My NIFTY VWAP"
          />
        </label>

        {shivam ? null : (
        <label className="mt-2.5 block text-xs font-semibold text-slate-500" data-trade-limit="daily">
          Daily trade limit
          <input
            type="number"
            min={1}
            max={20}
            inputMode="numeric"
            aria-label="Daily trade limit"
            className={fieldClass}
            value={Math.max(1, Math.round(Number(form.maxTradesPerDay) || (isNiftyTest2Kind(form) || test2 ? 1 : 5)))}
            onChange={(event) =>
              set({
                maxTradesPerDay: Math.max(1, Math.min(20, Math.round(Number(event.target.value) || 1))),
              })
            }
          />
          <span className="desk-help mt-1 block font-medium text-slate-400">
            Orders this strategy can place today, from 1 to 20. Saving does not start LIVE.
          </span>
        </label>
        )}

        {test2 ? (
          <div className="mt-2.5 space-y-1.5">
            <div className="grid grid-cols-2 gap-1.5">
              <label className="text-xs font-semibold text-slate-500">
                SELL option
                <select
                  data-test2-sell-option
                  className={fieldClass}
                  value={form.sellExpiryKind || "monthly"}
                  disabled={(TEST1_SCRIPTS.find((row) => row.id === form.symbol) || TEST1_SCRIPTS[0]).session === "mcx"}
                  onChange={(event) => set({ sellExpiryKind: event.target.value === "weekly" ? "weekly" : "monthly" })}
                >
                  <option value="monthly">Monthly CE + PE</option>
                  <option value="weekly">Weekly CE + PE</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-500">
                BUY hedge option
                <select
                  data-test2-hedge-option
                  className={fieldClass}
                  value={form.hedgeExpiryKind || "weekly"}
                  disabled={(TEST1_SCRIPTS.find((row) => row.id === form.symbol) || TEST1_SCRIPTS[0]).session === "mcx"}
                  onChange={(event) => set({ hedgeExpiryKind: event.target.value === "monthly" ? "monthly" : "weekly" })}
                >
                  <option value="weekly">Weekly CE + PE</option>
                  <option value="monthly">Monthly CE + PE</option>
                </select>
              </label>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <NumberField label="SELL premium ≥" value={form.sellPremium ?? 80} step={5} onChange={(sellPremium) => set({ sellPremium })} />
              <NumberField label="BUY premium ≥" value={form.hedgePremium ?? 20} step={1} onChange={(hedgePremium) => set({ hedgePremium })} />
              <NumberField label="Hedge SL %" value={form.hedgeSlPct ?? 20} step={1} onChange={(hedgeSlPct) => set({ hedgeSlPct })} />
            </div>
          </div>
        ) : null}

        {mir ? (
          <div className="mt-2.5 space-y-1.5" data-mir-settings="true">
            <div className="desk-help rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-2 text-[11px] font-semibold text-slate-500">
              Index maps its exchange automatically. Completed {form.timeframe || "15m"} candles only: index green + CE green buys CE. Index red + PE green buys PE. Initial target {form.initialTargetPct || 40}%. At −{form.reversalLossPct || 20}% plus the opposite index candle, buy {form.reversalQtyMultiple || 2}× the other side and keep both. Combined target {form.combinedTargetPct || 20}% on {form.combinedTargetBasis === "combined" ? "combined premium" : "original premium"}. Saving does not start trading.
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <label className="text-xs font-semibold text-slate-500">
                Index
                <select
                  data-mir-index
                  className={fieldClass}
                  value={form.symbol || "NIFTY"}
                  onChange={(event) => {
                    const row = MULTI_INDEX_SCRIPTS.find((item) => item.id === event.target.value) || MULTI_INDEX_SCRIPTS[0];
                    set({
                      symbol: row.id,
                      lotSize: row.lot,
                      qty: (form.lots || 1) * row.lot,
                      instrument: "option",
                      side: "BUY",
                    });
                  }}
                >
                  {MULTI_INDEX_SCRIPTS.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.label} · {row.exchange}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-500">
                Exchange
                <input
                  data-mir-exchange
                  className={fieldClass}
                  value={(MULTI_INDEX_SCRIPTS.find((row) => row.id === form.symbol) || MULTI_INDEX_SCRIPTS[0]).exchange}
                  readOnly
                />
              </label>
            </div>
          </div>
        ) : shivam ? (
          <div className="mt-2.5 space-y-1.5" data-shivam-settings="true">
            <div className="desk-help rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-2 text-[11px] font-semibold text-slate-500">
              Do not trade a doji on the index, future, or option candle. BUY CE: index green, future green, CE green. BUY PE: index red, future red, PE green. ATM strike is always auto-selected from the live future/index and changes with the market. Lot size comes from the live instrument master. Re-entries count as another daily trade. Rejected orders do not.
            </div>
            <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-4" data-shivam-timeframes="true">
              <DeskTimeframeSelect
                label="Index timeframe"
                timeframe={form.indexTimeframe || form.timeframe}
                mark="shivam-index"
                onPick={(timeframe) => set({ indexTimeframe: timeframe, timeframe, barMinutes: firstCandleMinutes(timeframe) })}
              />
              <DeskTimeframeSelect
                label="CE timeframe"
                timeframe={form.ceTimeframe || "5m"}
                mark="shivam-ce"
                onPick={(ceTimeframe) => set({ ceTimeframe })}
              />
              <DeskTimeframeSelect
                label="PE timeframe"
                timeframe={form.peTimeframe || "5m"}
                mark="shivam-pe"
                onPick={(peTimeframe) => set({ peTimeframe })}
              />
              <label className="text-xs font-semibold text-slate-500">
                Script
                <select
                  className={fieldClass}
                  value={form.symbol || "NIFTY"}
                  data-shivam-script="true"
                  onChange={(event) => {
                    const row = SHIVAM_T2S_SCRIPTS.find((item) => item.id === event.target.value) || SHIVAM_T2S_SCRIPTS[0];
                    set({
                      symbol: row.id,
                      instrument: "option",
                      side: "BUY",
                      expiryKind: row.session === "mcx" ? "monthly" : "weekly",
                    });
                  }}
                >
                  {SHIVAM_T2S_SCRIPTS.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.label} · {row.futures}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-500">
                Futures
                <input className={fieldClass} value={(SHIVAM_T2S_SCRIPTS.find((row) => row.id === form.symbol) || SHIVAM_T2S_SCRIPTS[0]).futures} readOnly />
              </label>
              <label className="text-xs font-semibold text-slate-500">
                Strike
                <input className={fieldClass} value="ATM auto" readOnly data-shivam-atm="true" />
              </label>
              <label className="text-xs font-semibold text-slate-500">
                CE confirm
                <input className={fieldClass} value="GREEN" readOnly />
              </label>
              <label className="text-xs font-semibold text-slate-500">
                PE confirm
                <input className={fieldClass} value="GREEN" readOnly />
              </label>
              <label className="text-xs font-semibold text-slate-500">
                SL mode
                <select className={fieldClass} value={form.slMode || "percentage"} onChange={(event) => set({ slMode: event.target.value === "points" ? "points" : "percentage" })}>
                  <option value="percentage">Percentage</option>
                  <option value="points">Points</option>
                </select>
              </label>
              <NumberField label={form.slMode === "points" ? "SL points" : "SL %"} value={form.slValue ?? 20} step={0.5} onChange={(slValue) => set({ slValue, slPct: slValue, initialSlPct: slValue })} />
              <label className="text-xs font-semibold text-slate-500">
                Target mode
                <select className={fieldClass} value={form.targetMode || "percentage"} onChange={(event) => set({ targetMode: event.target.value === "points" ? "points" : "percentage" })}>
                  <option value="percentage">Percentage</option>
                  <option value="points">Points</option>
                </select>
              </label>
              <NumberField label={form.targetMode === "points" ? "Target points" : "Target %"} value={form.targetValue ?? 40} step={0.5} onChange={(targetValue) => set({ targetValue, targetPct: targetValue })} />
            </div>
          </div>
        ) : test1 && !test2 ? (
          <div className="mt-2.5 space-y-1.5">
            <div className="desk-help rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-2 text-[11px] font-semibold text-slate-500">
              Choose the script from the dropdown. TEST1 buys only that script's current ATM CE or PE. After 09:30 IST, a completed {form.timeframe || "5m"} green candle with body ≈90% and wicks ≈10% buys once. Target is 100% of that body from the actual fill. Stop is the signal candle low.
            </div>
            <label className="block text-xs font-semibold text-slate-500">
              Script · ATM option
              <select
                data-test1-scripts
                className={fieldClass}
                value={form.symbol || "NIFTY"}
                onChange={(event) => {
                  const row = TEST1_SCRIPTS.find((item) => item.id === event.target.value) || TEST1_SCRIPTS[0];
                  set({
                    symbol: row.id,
                    lotSize: row.lot,
                    qty: (form.lots || 1) * row.lot,
                    expiryKind: row.expiryKind,
                    endTimeIst: row.session === "mcx" ? "23:15" : "15:15",
                    instrument: "option",
                    strikeOffset: 0,
                    side: "BUY",
                  });
                }}
              >
                {TEST1_SCRIPTS.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.label} · ATM CE/PE
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : niftyTest ? (
          <div className="desk-help mt-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-2 text-[11px] font-semibold text-slate-500">
            Locked to the NIFTY future. While Nifty Test is started, the live feed is checked the whole session. Price above the current candle open buys. Price below that open sells. Saving does not start it.
          </div>
        ) : crudeFirst || firstCandle || test2 || mir || shivam ? null : engine ? (
          <div className="desk-help mt-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-2 text-[11px] font-semibold text-slate-500">
            {hedge
              ? "Locked to NIFTY weekly ATM options on the 15-minute chart. Completed candle only: open below VWAP and close above → BUY 1 lot CE. Open above VWAP and close below → BUY 1 lot PE. Primary +40% books that option (no stop). −20% buys 2 lots of the opposite option once. Combined P&L of +5% of starting capital exits everything. LIVE starts automatically at 09:20 IST on session days. Saving or restarting t2s does not start LIVE."
              : reversal
              ? "Locked to NIFTY weekly ATM options (not monthly) on the 15-minute chart. After a 15m candle closes: open below VWAP and close above → BUY weekly ATM CE. Open above VWAP and close below → BUY weekly ATM PE. LIVE starts automatically at 09:20 IST on session days. Saving or restarting t2s does not start LIVE."
              : "Locked to NIFTY ATM options on the 5-minute chart. Side is chosen by the first futures close versus VWAP (CE if above, PE if below). Saving does not start trading — use Start paper or Start live on the algo card."}
          </div>
        ) : (
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <TypeCard
            active={(form.instrument || "future") === "future"}
            title="Index future"
            text="Trade the current-month future at live LTP"
            onClick={() => set({ instrument: "future" })}
          />
          <TypeCard
            active={form.instrument === "option"}
            title="Option CE / PE"
            text="ATM ± 2 from the live option tape. Paper fills virtual. Live sends the same contract to Dhan."
            onClick={() => set({ instrument: "option", optionType: form.optionType || "CE", strikeOffset: form.strikeOffset || 0 })}
          />
        </div>
        )}

        {!engine && !crudeFirst && !niftyTest && !mir && !shivam && form.instrument === "option" ? (
          <div className="mt-2.5 grid gap-2 md:grid-cols-2">
            <div>
              <div className="text-xs font-semibold text-slate-500">Call or put</div>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {(["CE", "PE"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => set({ optionType: option })}
                    className={cn(
                      "h-8 rounded-md border text-xs font-bold",
                      (form.optionType || "CE") === option
                        ? option === "CE"
                          ? "border-emerald-500 bg-emerald-50 text-up dark:bg-emerald-950/40"
                          : "border-rose-400 bg-rose-50 text-down dark:bg-rose-950/40"
                        : "border-[var(--border)] bg-[var(--bg)]",
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
            <label className="text-xs font-semibold text-slate-500">
              Strike
              <select
                className={fieldClass}
                value={form.strikeOffset ?? 0}
                onChange={(event) => set({ strikeOffset: Number(event.target.value) })}
              >
                {OPTION_OFFSETS.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.label}
                  </option>
                ))}
              </select>
              <span className="desk-help mt-1 block font-medium text-slate-400">{liveOptionHint(form, data)}</span>
            </label>
          </div>
        ) : null}

        {shivam ? null : (
        <div className="mt-1.5 grid grid-cols-2 gap-1.5 lg:grid-cols-4">
          {editing && !test2 ? (
          <label className="hidden text-xs font-semibold text-slate-500 sm:block">
            Strategy name
            <input
              className={fieldClass}
              value={mir ? MULTI_INDEX_REVERSAL_NAME : test1 ? "TEST1" : firstCandle ? NIFTY_FIRST_CANDLE_NAME : crudeFirst ? CRUDE_FIRST_CANDLE_NAME : form.name || ""}
              onChange={(event) =>
                set({
                  name: mir
                    ? MULTI_INDEX_REVERSAL_NAME
                    : test1
                    ? "TEST1"
                    : firstCandle
                      ? NIFTY_FIRST_CANDLE_NAME
                      : crudeFirst
                        ? CRUDE_FIRST_CANDLE_NAME
                        : event.target.value,
                })
              }
              readOnly={mir || test1 || firstCandle || crudeFirst}
              placeholder="My NIFTY VWAP"
            />
          </label>
          ) : null}
          {engine || mir || shivam ? null : (
          <label className="text-xs font-semibold text-slate-500">
            Underlying
            <select
              className={fieldClass}
              value={crudeFirst ? "CRUDEOIL" : niftyTest ? "NIFTY" : form.symbol || "NIFTY"}
              disabled={engine || niftyTest || crudeFirst}
              onChange={(event) => {
                const symbol = event.target.value;
                const nextLot = lotForSymbol(symbol);
                const nextLots = form.lots || 1;
                set({ symbol, lots: nextLots, lotSize: nextLot, qty: nextLots * nextLot });
              }}
            >
              {STRATEGY_SYMBOLS.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.id} · 1 lot = {row.lot} qty
                </option>
              ))}
            </select>
          </label>
          )}
          {engine || mir || shivam ? null : (
          <label className="text-xs font-semibold text-slate-500">
            Side
            <select className={fieldClass} value={niftyTest ? "BOTH" : form.side || "BUY"} disabled={engine || niftyTest || crudeFirst} onChange={(event) => set({ side: event.target.value as AlgoStrategy["side"] })}>
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
              <option value="BOTH">BOTH</option>
            </select>
          </label>
          )}
          {shivam ? null : (
          <label className="text-xs font-semibold text-slate-500">
            Lots
            <input
              className={fieldClass}
              type="number"
              min={1}
              value={hedge ? 1 : lots}
              disabled={hedge}
              onChange={(event) => {
                const nextLots = Math.max(1, Number(event.target.value) || 1);
                set({ lots: nextLots, lotSize, qty: nextLots * lotSize });
              }}
            />
            <span className="desk-help mt-1 block font-medium text-slate-400">
              {hedge
                ? "Primary 1 lot (65) · hedge 2 lots (130) · max 3 lots"
                : form.symbol === "CRUDEOIL"
                  ? `1 lot · Dhan qty ${lots} (size ${lotSize})`
                  : `1 lot = ${lotSize} qty · order qty ${lots * lotSize}`}
            </span>
          </label>
          )}
          {vwap || reversal || hedge || test2 ? (
          <label className="text-xs font-semibold text-slate-500">
            Timeframe
            <select
              className={fieldClass}
              value={reversal || hedge ? "15m" : "5m"}
              disabled
            >
              <option value={reversal || hedge ? "15m" : "5m"}>{reversal || hedge ? "15m" : "5m"}</option>
            </select>
          </label>
          ) : null}
          <label className="text-xs font-semibold text-slate-500">
            Broker
            <select
              className={fieldClass}
              value={form.runMode === "live" ? form.brokerId || "dhan" : "paper"}
              disabled={form.runMode !== "live"}
              onChange={(event) => set({ brokerId: event.target.value })}
            >
              {(form.runMode === "live" ? liveBrokers : connected.filter((item) => item.id === "paper")).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.liveFeed ? " · LIVE" : item.connected && item.id !== "dhan" ? " · connected" : ""}
                </option>
              ))}
            </select>
            <span className="desk-help mt-1 block font-medium text-slate-400">
              {form.runMode !== "live"
                ? "Paper uses live quotes. Fills are virtual — they never go to a broker."
                : "Live orders go to this broker after you connect it on Brokers. Saving does not start LIVE."}
            </span>
          </label>
        </div>
        )}

        {engine || niftyTest || crudeFirst || mir || shivam ? null : kind === "indicator" ? (
          <div className="mt-2.5 grid gap-2 md:grid-cols-2">
            <label className="text-xs font-semibold text-slate-500 md:col-span-2">
              Indicator
              <select
                className={fieldClass}
                value={form.indicator || "VWAP"}
                onChange={(event) => {
                  const indicator = event.target.value;
                  const next = defaultConditions("indicator", indicator, form.pattern);
                  set({ indicator, ...next, ...groupsFromFlat(next) });
                }}
              >
                {INDICATORS.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.label}
                  </option>
                ))}
              </select>
            </label>
            {form.indicator === "RSI" ? <NumberField label="RSI period" value={form.period || 14} onChange={(period) => set({ period })} /> : null}
            {form.indicator === "EMA" ? (
              <>
                <NumberField label="Fast EMA" value={form.fast || 9} onChange={(fast) => set({ fast })} />
                <NumberField label="Slow EMA" value={form.slow || 21} onChange={(slow) => set({ slow })} />
              </>
            ) : null}
            {form.indicator === "SUPERTREND" ? (
              <>
                <NumberField label="ATR period" value={form.period || 10} onChange={(period) => set({ period })} />
                <NumberField label="Multiplier" value={form.multiplier || 3} onChange={(multiplier) => set({ multiplier })} />
              </>
            ) : null}
          </div>
        ) : (
          <div className="mt-2.5 grid gap-2 md:grid-cols-2">
            <label className="text-xs font-semibold text-slate-500 md:col-span-2">
              Price action
              <select
                className={fieldClass}
                value={form.pattern || "ORB"}
                onChange={(event) => {
                  const pattern = event.target.value;
                  const next = defaultConditions("price-action", form.indicator, pattern);
                  set({ pattern, ...next, ...groupsFromFlat(next) });
                }}
              >
                {PATTERNS.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.label}
                  </option>
                ))}
              </select>
            </label>
            {form.pattern === "ORB" ? (
              <label className="text-xs font-semibold text-slate-500">
                Opening range
                <select className={fieldClass} value={form.rangeMinutes || 15} onChange={(event) => set({ rangeMinutes: Number(event.target.value) })}>
                  <option value={15}>First 15 minutes</option>
                  <option value={30}>First 30 minutes</option>
                  <option value={60}>First 60 minutes</option>
                </select>
              </label>
            ) : null}
            {form.pattern === "BREAKOUT" || form.pattern === "SR_BOUNCE" ? (
              <NumberField label="Lookback bars" value={form.lookback || 20} onChange={(lookback) => set({ lookback })} />
            ) : null}
          </div>
        )}

        {vwap ? (
          <div className="mt-2.5 space-y-2">
            <p className="desk-help text-[11px] font-semibold text-slate-400">
              Close above / close below use the last completed 5m candle only. BUY CE when futures close above VWAP. BUY PE when futures close below VWAP. ATM option must also close above its own VWAP.
            </p>
            <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-4">
              <NumberField label="Initial stop %" value={form.initialSlPct || 20} step={1} onChange={(initialSlPct) => set({ initialSlPct, slPct: initialSlPct })} />
              <NumberField label="Target %" value={form.targetPct || 40} step={1} onChange={(targetPct) => set({ targetPct })} />
              <NumberField label="Trail activate %" value={form.trailingActivationPct || 10} step={1} onChange={(trailingActivationPct) => set({ trailingActivationPct })} />
              <NumberField label="Trail step %" value={form.trailingStepPct || 3} step={0.5} onChange={(trailingStepPct) => set({ trailingStepPct })} />
              <NumberField label="VWAP exit candles" value={form.vwapExitCandles || 5} step={1} onChange={(vwapExitCandles) => set({ vwapExitCandles })} />
              <NumberField label="EOD square-off (min before 15:30)" value={form.eodSquareOffMinutes ?? 10} step={1} onChange={(eodSquareOffMinutes) => set({ eodSquareOffMinutes })} />
            </div>
          </div>
        ) : reversal ? (
          <div className="mt-2.5 space-y-2">
            <p className="desk-help text-[11px] font-semibold text-slate-400">
              Entry only after the 15-minute NIFTY futures candle closes. OPEN below VWAP and CLOSE above VWAP buys weekly ATM CE. OPEN above VWAP and CLOSE below VWAP buys weekly ATM PE. Never monthly. Option stop 15% / target 30%. One position. Square-off before 15:30.
            </p>
            <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-4">
              <NumberField label="Stop %" value={form.initialSlPct || 15} step={1} onChange={(initialSlPct) => set({ initialSlPct, slPct: initialSlPct })} />
              <NumberField label="Target %" value={form.targetPct || 30} step={1} onChange={(targetPct) => set({ targetPct })} />
              <NumberField label="EOD square-off (min before 15:30)" value={form.eodSquareOffMinutes ?? 10} step={1} onChange={(eodSquareOffMinutes) => set({ eodSquareOffMinutes })} />
            </div>
          </div>
        ) : test2 ? (
          <div className="mt-2.5 space-y-2">
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => set({ holdStyle: "btst", product: "NRML", holdOvernight: true, intradayOnly: false, eodSquareOffMinutes: 0 })}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left",
                  form.holdStyle !== "intraday" ? "border-brand-500 bg-brand-50/80 dark:bg-brand-500/10" : "border-[var(--border)] bg-[var(--bg)]",
                )}
              >
                <div className="text-xs font-bold">BTST</div>
                <div className="mt-0.5 text-[10px] text-slate-400">Buy today · sell tomorrow · NRML</div>
              </button>
              <button
                type="button"
                onClick={() => set({ holdStyle: "intraday", product: "MIS", holdOvernight: false, intradayOnly: true, eodSquareOffMinutes: 15 })}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left",
                  form.holdStyle === "intraday" ? "border-brand-500 bg-brand-50/80 dark:bg-brand-500/10" : "border-[var(--border)] bg-[var(--bg)]",
                )}
              >
                <div className="text-xs font-bold">Intraday</div>
                <div className="mt-0.5 text-[10px] text-slate-400">Same-day square-off · MIS</div>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-4">
              <label className="text-xs font-semibold text-slate-500">
                Enter (IST)
                <input className={fieldClass} value={form.startTimeIst || "09:35"} onChange={(event) => set({ startTimeIst: event.target.value })} placeholder="09:35" />
              </label>
              <label className="text-xs font-semibold text-slate-500">
                {form.holdStyle === "intraday" ? "Square-off (IST)" : "Last entry (IST)"}
                <input className={fieldClass} value={form.endTimeIst || "15:15"} onChange={(event) => set({ endTimeIst: event.target.value })} placeholder="15:15" />
              </label>
              {form.holdStyle === "intraday" ? null : (
                <label className="text-xs font-semibold text-slate-500">
                  Sell tomorrow (IST)
                  <input className={fieldClass} value={form.exitTimeIst || "15:15"} onChange={(event) => set({ exitTimeIst: event.target.value })} placeholder="15:15" />
                </label>
              )}
              <NumberField label="Overall SL ₹" value={form.overallSl ?? 30000} step={1000} onChange={(overallSl) => set({ overallSl })} />
              <NumberField label="Overall profit %" value={form.overallTargetPct ?? 5} step={0.5} onChange={(overallTargetPct) => set({ overallTargetPct, overallTarget: 0 })} />
            </div>
          </div>
        ) : niftyTest ? (
          <div className="mt-2.5 space-y-2">
            <p className="desk-help text-[11px] font-semibold text-slate-400">
              No first-candle check. While Nifty Test is started, every live Nifty future tick is checked. Current candle close above its open → BUY. Close below its open → SELL. Equal open is no trade.
            </p>
            <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-4">
              <label className="text-xs font-semibold text-slate-500">
                nifty test
                <input
                  name="nifty test"
                  className={fieldClass}
                  value={form.startTimeIst || "09:15"}
                  onChange={(event) => set({ startTimeIst: event.target.value })}
                  placeholder="09:15"
                />
              </label>
              <label className="text-xs font-semibold text-slate-500">
                End time (IST)
                <input className={fieldClass} value={form.endTimeIst || "15:15"} onChange={(event) => set({ endTimeIst: event.target.value })} placeholder="15:15" />
              </label>
            </div>
          </div>
        ) : mir ? (
          <div className="mt-2.5 grid grid-cols-2 gap-1.5 lg:grid-cols-4" data-mir-targets="true">
            <label className="text-xs font-semibold text-slate-500">
              Strike offset
              <select
                data-mir-offset
                className={fieldClass}
                value={form.strikeOffset ?? 0}
                onChange={(event) => set({ strikeOffset: Number(event.target.value) })}
              >
                {MULTI_INDEX_OFFSETS.map((offset) => (
                  <option key={offset} value={offset}>
                    {offset === 0 ? "ATM (0)" : offset > 0 ? `ATM +${offset}` : `ATM ${offset}`}
                  </option>
                ))}
              </select>
            </label>
            <NumberField label="Initial target %" value={form.initialTargetPct ?? 40} step={1} onChange={(initialTargetPct) => set({ initialTargetPct, targetPct: initialTargetPct })} />
            <NumberField label="Reversal loss %" value={form.reversalLossPct ?? 20} step={1} onChange={(reversalLossPct) => set({ reversalLossPct })} />
            <NumberField label="Reversal qty ×" value={form.reversalQtyMultiple ?? 2} step={1} onChange={(reversalQtyMultiple) => set({ reversalQtyMultiple })} />
            <NumberField label="Combined target %" value={form.combinedTargetPct ?? 20} step={1} onChange={(combinedTargetPct) => set({ combinedTargetPct })} />
            <label className="text-xs font-semibold text-slate-500">
              Combined target basis
              <select
                data-mir-basis
                className={fieldClass}
                value={form.combinedTargetBasis || "original"}
                onChange={(event) => set({ combinedTargetBasis: event.target.value === "combined" ? "combined" : "original" })}
              >
                <option value="original">Original Position Premium</option>
                <option value="combined">Combined Premium</option>
              </select>
            </label>
            <NumberField label="Max cycle loss % (0 off)" value={form.maxCycleLossPct ?? 0} step={1} onChange={(maxCycleLossPct) => set({ maxCycleLossPct: Math.max(0, maxCycleLossPct) })} />
            <NumberField label="EOD square-off (min)" value={form.eodSquareOffMinutes ?? 15} step={1} onChange={(eodSquareOffMinutes) => set({ eodSquareOffMinutes })} />
          </div>
        ) : test1 ? (
          <div className="mt-2.5 grid grid-cols-2 gap-1.5 lg:grid-cols-4">
            <label className="text-xs font-semibold text-slate-500">
              Start check (IST)
              <input className={fieldClass} value={form.startTimeIst || "09:30"} onChange={(event) => set({ startTimeIst: event.target.value })} placeholder="09:30" />
            </label>
            <label className="text-xs font-semibold text-slate-500">
              End time (IST)
              <input className={fieldClass} value={form.endTimeIst || "15:15"} onChange={(event) => set({ endTimeIst: event.target.value })} placeholder="15:15" />
            </label>
            <NumberField label="Min body %" value={Math.round((Number(form.minBodyPct) || 0.9) * 100)} step={1} onChange={(pct) => set({ minBodyPct: Math.max(0.5, Math.min(0.99, pct / 100)) })} />
            <NumberField label="Max wick %" value={Math.round((Number(form.maxWickPct) || 0.1) * 100)} step={1} onChange={(pct) => set({ maxWickPct: Math.max(0.01, Math.min(0.5, pct / 100)) })} />
            <NumberField label="Target × body" value={Number(form.targetMultiple) || 1} step={0.1} onChange={(targetMultiple) => set({ targetMultiple })} />
            <label className="text-xs font-semibold text-slate-500">
              Target from
              <select className={fieldClass} value={form.targetSource || "body"} onChange={(event) => set({ targetSource: event.target.value as "body" | "range" })}>
                <option value="body">Signal body</option>
                <option value="range">Signal range</option>
              </select>
            </label>
            <NumberField label="EOD square-off (min)" value={form.eodSquareOffMinutes ?? 15} step={1} onChange={(eodSquareOffMinutes) => set({ eodSquareOffMinutes })} />
          </div>
        ) : firstCandleTf ? (
          <div className="mt-2.5 space-y-2" data-first-candle-settings={crudeFirst ? "crude" : "nifty"}>
            {crudeFirst ? (
              <p className="desk-help text-[11px] font-semibold text-slate-400">
                Same custom timeframe on Crude FUT, CE, and PE. FUT + CE green and PE red buys CE. FUT + PE green and CE red buys PE. Set your own stop % and target %.
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-4">
              <label className="text-xs font-semibold text-slate-500">
                Start LIVE (IST)
                <input className={fieldClass} value={form.dailyLiveIst || "09:00"} onChange={(event) => set({ dailyLiveIst: event.target.value })} placeholder="09:00" />
              </label>
              <label className="text-xs font-semibold text-slate-500">
                {crudeFirst ? "Start check (IST)" : "First candle start (IST)"}
                <input className={fieldClass} value={form.firstBarStartIst || "09:00"} onChange={(event) => set({ firstBarStartIst: event.target.value })} placeholder="09:00" />
              </label>
              <label className="text-xs font-semibold text-slate-500">
                {crudeFirst ? `First ${form.timeframe || "5m"} close, then every ${form.timeframe || "5m"}` : "Entry evaluation (IST)"}
                <input className={fieldClass} value={firstCandleEntryIst(form.firstBarStartIst, form.timeframe, form.entryEvaluationIst)} onChange={(event) => set({ entryEvaluationIst: event.target.value })} placeholder={firstCandleEntryIst(form.firstBarStartIst, form.timeframe)} />
              </label>
              <label className="text-xs font-semibold text-slate-500">
                End time (IST)
                <input className={fieldClass} value={form.endTimeIst || (crudeFirst ? "23:15" : "15:15")} onChange={(event) => set({ endTimeIst: event.target.value })} placeholder={crudeFirst ? "23:15" : "15:15"} />
              </label>
              <label className="text-xs font-semibold text-slate-500">
                Expiry
                {crudeFirst ? (
                  <input className={fieldClass} value="Monthly MCX" readOnly />
                ) : (
                <select className={fieldClass} value={form.expiryKind || "weekly"} onChange={(event) => set({ expiryKind: event.target.value as "weekly" | "monthly" })}>
                  <option value="weekly">Nearest weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
                )}
              </label>
              <label className="text-xs font-semibold text-slate-500">
                Strike
                <select className={fieldClass} value={form.strikeOffset ?? 0} onChange={(event) => set({ strikeOffset: Number(event.target.value) })}>
                  {OPTION_OFFSETS.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.label}
                    </option>
                  ))}
                </select>
                <span className="desk-help mt-1 block font-medium text-slate-400">{liveOptionHint(form, data)}</span>
              </label>
              <NumberField label="Stop %" value={form.initialSlPct || 20} step={1} onChange={(initialSlPct) => set({ initialSlPct, slPct: initialSlPct })} />
              <NumberField label="Target %" value={form.targetPct || 40} step={1} onChange={(targetPct) => set({ targetPct })} />
              {crudeFirst ? null : (
              <>
              <p className="desk-help text-[11px] font-semibold text-slate-400 lg:col-span-4" data-trailing-sl="nifty-first-candle">
                Trailing SL: at this profit the stop moves to the buy price. Each further gain of the next percent lifts the stop by the shift percent. A pullback does not lower the stop.
              </p>
              <NumberField
                label="Trailing SL to buy price at %"
                value={niftyFirstCandleTrail(form).activation}
                step={1}
                onChange={(trailingActivationPct) => {
                  const trail = niftyFirstCandleTrail(form);
                  set({ trailingActivationPct, trailingEveryPct: trail.every, trailingShiftPct: trail.shift, trailingStepPct: trail.shift });
                }}
              />
              <NumberField
                label="Trailing SL every %"
                value={niftyFirstCandleTrail(form).every}
                step={1}
                onChange={(trailingEveryPct) => {
                  const trail = niftyFirstCandleTrail(form);
                  set({ trailingActivationPct: trail.activation, trailingEveryPct, trailingShiftPct: trail.shift, trailingStepPct: trail.shift });
                }}
              />
              <NumberField
                label="Trailing SL shift %"
                value={niftyFirstCandleTrail(form).shift}
                step={1}
                onChange={(trailingShiftPct) => {
                  const trail = niftyFirstCandleTrail(form);
                  set({ trailingActivationPct: trail.activation, trailingEveryPct: trail.every, trailingShiftPct, trailingStepPct: trailingShiftPct });
                }}
              />
              </>
              )}
              <NumberField label={crudeFirst ? "EOD square-off (min before 23:30)" : "EOD square-off (min before 15:30)"} value={form.eodSquareOffMinutes ?? 10} step={1} onChange={(eodSquareOffMinutes) => set({ eodSquareOffMinutes })} />
            </div>
          </div>
        ) : shivam ? null : hedge ? (
          <p className="desk-help mt-2.5 text-[11px] font-semibold text-slate-400">
            Completed 15-minute NIFTY futures candle only. Open below VWAP and close above buys 1 lot weekly ATM CE. Open above VWAP and close below buys 1 lot weekly ATM PE. Primary target is fill × 1.40. There is no stop on the primary. At fill × 0.80 buy 2 lots of the opposite ATM weekly option once. Exit every open leg when realized + unrealized − charges reaches 5% of cycle starting capital.
          </p>
        ) : (
        <div className="mt-2.5 space-y-2">
          <ConditionGroupEditor
            label="BUY when"
            group={
              form.buyConditions ||
              groupsFromFlat(form).buyConditions
            }
            onChange={(buyConditions) =>
              set({
                buyConditions,
                buyLeft: buyConditions.rows[0]?.left,
                buyOp: buyConditions.rows[0]?.op,
                buyRight: buyConditions.rows[0]?.right,
                buyValue: buyConditions.rows[0]?.value,
              })
            }
          />
          <ConditionGroupEditor
            label="SELL when"
            group={
              form.sellConditions ||
              groupsFromFlat(form).sellConditions
            }
            onChange={(sellConditions) =>
              set({
                sellConditions,
                sellLeft: sellConditions.rows[0]?.left,
                sellOp: sellConditions.rows[0]?.op,
                sellRight: sellConditions.rows[0]?.right,
                sellValue: sellConditions.rows[0]?.value,
              })
            }
          />
          <p className="desk-help text-[11px] font-semibold text-slate-400">
            Add extra rows for multiple conditions. AND means every row must be true. OR means any one row can fire. Close above / close below use the last completed candle only.
          </p>
        </div>

        )}

        {engine || crudeFirst || mir || shivam ? null : (
        <div className="mt-2.5 grid gap-2 md:grid-cols-2">
          <NumberField label="Stop loss %" value={form.slPct || 0.4} step={0.05} onChange={(slPct) => set({ slPct })} />
          <NumberField label="Target %" value={form.targetPct || 0.8} step={0.05} onChange={(targetPct) => set({ targetPct })} />
        </div>
        )}

        {form.runMode === "live" ? (
          <p className="desk-help mt-3 text-[11px] font-semibold text-amber-600">
            {hedge || reversal
              ? "NIFTY 15m VWAP hedge and NIFTY 15m VWAP reversal go LIVE automatically at 09:20 IST on session days. Saving this form or restarting t2s does not start LIVE."
              : crudeFirst
              ? "CRUDE OIL stays off until you press Start strategy. Saving this form or restarting t2s does not start LIVE and does not place an order."
              : firstCandle
              ? "NIFTY goes LIVE automatically at 09:00 IST on session days. Saving this form or restarting t2s does not start LIVE."
              : niftyTest
              ? "nifty test stays off until you press Start strategy. Orders are NIFTY futures. Saving this form does not place orders."
              : mir
              ? "Multi-Index Reversal stays paper until you choose Live and press Start. Saving this form does not start LIVE and does not place an order."
              : shivam
              ? "Shivam T2S stays on Algo Test. Choose Live, then press Start live to send real CE/PE orders to the admin broker and mapped user brokers. Saving this form does not start LIVE and does not place an order."
              : "Live stays off until you press Start strategy on the algo card. Saving this form does not place orders."}
          </p>
        ) : null}

        {error ? <p className="mt-3 text-sm font-semibold text-down">{error}</p> : null}

        <div className="mt-3 flex gap-2">
          <button type="button" onClick={onClose} className="h-8 flex-1 rounded-lg border border-[var(--border)] text-xs font-semibold">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="h-8 flex-1 rounded-lg bg-brand-500 text-xs font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Saving..." : algo ? "Save changes" : "Add strategy"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConditionGroupEditor({
  label,
  group,
  onChange,
}: {
  label: string;
  group: { join?: ConditionJoin; rows?: ConditionRow[] };
  onChange: (next: { join: ConditionJoin; rows: ConditionRow[] }) => void;
}) {
  const join: ConditionJoin = group.join === "or" ? "or" : "and";
  const rows =
    group.rows?.length
      ? group.rows
      : [{ left: "price" as const, op: "close_above" as const, right: "vwap" as const, value: 0 }];

  const updateRow = (index: number, patch: ConditionRow) => {
    const next = rows.map((row, i) => (i === index ? patch : row));
    onChange({ join, rows: next });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
        <div className="flex gap-1">
          {(["and", "or"] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onChange({ join: id, rows })}
              className={cn(
                "h-7 rounded-md px-2 text-[10px] font-bold uppercase",
                join === id ? "bg-brand-500 text-white" : "border border-[var(--border)] bg-[var(--bg)] text-slate-500",
              )}
            >
              {id}
            </button>
          ))}
        </div>
      </div>
      {rows.map((row, index) => (
        <ConditionRowFields
          key={`${label}-${index}`}
          label={index === 0 ? label : join === "or" ? "OR" : "AND"}
          left={row.left}
          op={row.op}
          right={row.right}
          value={row.value || 0}
          onRemove={rows.length > 1 ? () => onChange({ join, rows: rows.filter((_, i) => i !== index) }) : undefined}
          onChange={(patch) => updateRow(index, patch)}
        />
      ))}
      {rows.length < MAX_CONDITION_ROWS ? (
        <button
          type="button"
          onClick={() =>
            onChange({
              join,
              rows: [...rows, { left: "price", op: "close_above", right: "vwap", value: 0 }],
            })
          }
          className="h-8 rounded-lg border border-dashed border-[var(--border)] px-3 text-[11px] font-semibold text-slate-500"
        >
          + Add condition
        </button>
      ) : null}
    </div>
  );
}

function ConditionRowFields({
  label,
  left,
  op,
  right,
  value,
  onChange,
  onRemove,
}: {
  label: string;
  left: ConditionSource;
  op: ConditionOp;
  right: ConditionSource;
  value: number;
  onChange: (next: { left: ConditionSource; op: ConditionOp; right: ConditionSource; value: number }) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
        {onRemove ? (
          <button type="button" onClick={onRemove} className="text-[10px] font-bold uppercase text-slate-400">
            Remove
          </button>
        ) : null}
      </div>
      <div className="grid gap-2 md:grid-cols-4">
        <select
          className={fieldClass}
          value={left}
          onChange={(event) => onChange({ left: event.target.value as ConditionSource, op, right, value })}
        >
          {SOURCES.filter((row) => row.id !== "value").map((row) => (
            <option key={row.id} value={row.id}>
              {row.label}
            </option>
          ))}
        </select>
        <select className={fieldClass} value={op} onChange={(event) => onChange({ left, op: event.target.value as ConditionOp, right, value })}>
          {OPERATORS.map((row) => (
            <option key={row.id} value={row.id}>
              {row.label}
            </option>
          ))}
        </select>
        <select
          className={fieldClass}
          value={right}
          onChange={(event) => onChange({ left, op, right: event.target.value as ConditionSource, value })}
        >
          {SOURCES.map((row) => (
            <option key={row.id} value={row.id}>
              {row.label}
            </option>
          ))}
        </select>
        {right === "value" ? (
          <input
            className={fieldClass}
            type="number"
            value={value}
            onChange={(event) => onChange({ left, op, right, value: Number(event.target.value) })}
          />
        ) : (
          <div className="flex h-8 items-center text-[11px] font-semibold text-slate-400">vs {SOURCES.find((row) => row.id === right)?.label}</div>
        )}
      </div>
    </div>
  );
}

function strikeStep(symbol?: string) {
  const id = String(symbol || "NIFTY").toUpperCase();
  if (id.includes("BANK") || id.includes("SENSEX")) return 100;
  return 50;
}

function liveOptionHint(
  form: Partial<AlgoStrategy>,
  data: {
    optionMeta?: { symbol?: string; expiry?: string; expiryLabel?: string; spot?: number };
    optionChain?: Array<{ strike: number; atm?: boolean; callLtp?: number; putLtp?: number }>;
  },
) {
  const symbol = form.symbol || "NIFTY";
  const option = form.optionType === "PE" ? "PE" : "CE";
  const offset = Math.max(-5, Math.min(5, Math.round(Number(form.strikeOffset) || 0)));
  const step = strikeStep(symbol);
  const sameDesk = data.optionMeta?.symbol === symbol;
  const rows = sameDesk ? data.optionChain || [] : [];
  const atm = rows.find((row) => row.atm);
  const spot = sameDesk ? Number(data.optionMeta?.spot) : 0;
  const atmPrice = atm ? Number(atm.strike) : spot > 0 ? Math.round(spot / step) * step : 0;
  const want = atmPrice > 0 ? atmPrice + offset * step : 0;
  if (!sameDesk) {
    return `Open Options on ${symbol} to see live ${strikeOffsetLabel(offset)} ${option} LTP`;
  }
  if (!(atmPrice > 0)) return "Waiting for ATM on the option tape";
  const row = rows.find((item) => Number(item.strike) === want);
  if (!row) return `${symbol} ${want} ${option} · no ${strikeOffsetLabel(offset)} strike on this tape`;
  const ltp = option === "PE" ? Number(row.putLtp) : Number(row.callLtp);
  const expiry = data.optionMeta?.expiryLabel || data.optionMeta?.expiry || "";
  return ltp > 0
    ? `${symbol} ${row.strike} ${option} · ${strikeOffsetLabel(offset)} · LTP ${ltp}${expiry ? ` · ${expiry}` : ""}`
    : `${symbol} ${row.strike} ${option} · ${strikeOffsetLabel(offset)} · waiting for LTP`;
}

function TypeCard({ active, title, text, onClick }: { active: boolean; title: string; text: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border px-2 py-1.5 text-left",
        active ? "border-brand-500 bg-brand-50/80 dark:bg-brand-500/10" : "border-[var(--border)] bg-[var(--bg)]",
      )}
    >
      <div className="text-xs font-bold">{title}</div>
      <div className="desk-help mt-1 text-[11px] text-slate-400">{text}</div>
    </button>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
}) {
  return (
    <label className="text-xs font-semibold text-slate-500">
      {label}
      <input className={fieldClass} type="number" step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}
