import { X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMarket } from "../../context/MarketContext";
import { cn } from "../../lib/format";
import {
  INDICATORS,
  OPERATORS,
  PATTERNS,
  SOURCES,
  STRATEGY_SYMBOLS,
  TIMEFRAMES,
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
  niftyFirstCandleTrail,
  isNiftyTestKind,
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
  onClose: () => void;
};

const fieldClass = "h-8 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 text-[13px] font-semibold";

export function StrategyBuilder({ open, algo, onClose }: Props) {
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
      setForm({ ...emptyStrategy("nifty-first-candle"), brokerId: data.activeBrokerId || "dhan", runMode: "live" });
    }
    setError("");
  }, [open, algo, data.activeBrokerId]);

  const connected = (data.brokers || []).filter((item) => item.connected);
  const liveBrokers = (data.brokers || []).filter((item) => item.id !== "paper");
  const kind = (form.kind || "indicator") as StrategyKind;
  const editing = Boolean(algo);
  const title = editing ? String(algo?.name || "Edit strategy") : "Add strategy";

  const lotSize = lotForSymbol(form.symbol);
  const lots = form.lots || 1;
  const vwap = isNiftyVwapKind(form);
  const reversal = isNiftyVwapReversalKind(form);
  const hedge = isNiftyVwapHedgeKind(form);
  const firstCandle = isNiftyFirstCandleKind(form);
  const crudeFirst = isCrudeFirstCandleKind(form) || isCrudeFirstCandleKind(algo || undefined);
  const niftyTest = isNiftyTestKind(form);
  const engine = isNiftyOptionEngineKind(form);
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
    if (crudeFirst) {
      const requested = Number(form.maxTradesPerDay);
      const maxTrades = Number.isFinite(requested) && requested >= 1 ? Math.max(1, Math.min(20, Math.round(requested))) : 5;
      const tf = form.timeframe || "5m";
      return `CRUDE OIL ${tf} · monthly ATM · ${lots} lot × 100 = ${lots * 100} qty · max ${maxTrades} trades · MCX until ${form.endTimeIst || "23:15"} IST`;
    }
    if (isNiftyFirstCandleKind(form)) {
      const start = form.dailyLiveIst || "09:00";
      const firstBar = form.firstBarStartIst || "09:00";
      const tf = form.timeframe || "5m";
      const evalAt = firstCandleEntryIst(firstBar, tf, form.entryEvaluationIst);
      const expiry = form.expiryKind === "monthly" ? "monthly" : "weekly";
      const maxTrades = Number(form.maxTradesPerDay) > 1 ? Number(form.maxTradesPerDay) : 5;
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
  }, [form, lotSize, lots, crudeFirst]);

  const set = (patch: Partial<AlgoStrategy>) => setForm((current) => ({ ...current, ...patch }));

  const submit = async () => {
    if (!String(form.name || "").trim()) {
      setError("Give the strategy a name.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await saveAlgo(
        crudeFirst
          ? {
              ...form,
              id: algo?.id,
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
          : { ...form, id: algo?.id },
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save strategy");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const lotsHint = hedge
    ? "Primary 1 · hedge 2"
    : form.symbol === "CRUDEOIL"
      ? `qty ${lots}`
      : `${lots * lotSize} qty`;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-3 md:items-center">
      <div className="card max-h-[92vh] w-full max-w-md overflow-y-auto p-3" data-edit-strategy={editing ? algo?.id || "open" : "new"}>
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-bold">{title}</div>
            <div className="truncate text-[11px] text-slate-400">{preview}</div>
          </div>
          <button type="button" onClick={onClose} className="icon-btn">
            <X size={16} />
          </button>
        </div>

        {editing ? null : (
        <div className="mb-2 grid grid-cols-2 gap-1.5">
          <TypeCard
            active={crudeFirst}
            title="CRUDE 5m first candle"
            text="MCX ATM CE/PE from the crude future candle."
            onClick={() => {
              const next = emptyStrategy("crude-first-candle");
              set({
                ...next,
                name: form.name || "CRUDE OIL 5m first candle",
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
            active={kind === "nifty-first-candle"}
            title="NIFTY 5m first candle"
            text="ATM CE/PE from the NIFTY future candle."
            onClick={() =>
              set({
                ...emptyStrategy("nifty-first-candle"),
                name: form.name || "NIFTY 5m first candle",
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

        {editing ? null : (
        <div className="mb-2 grid grid-cols-3 gap-1.5">
          {RUN_MODES.map((mode) => (
            <TypeCard
              key={mode.id}
              active={(form.runMode || "live") === mode.id}
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

        {!engine && !crudeFirst && !niftyTest && !firstCandle && !editing ? (
        <div className="mb-2 grid grid-cols-2 gap-1.5">
          <TypeCard
            active={(form.instrument || "future") === "future"}
            title="Index future"
            text="Current-month future at LTP"
            onClick={() => set({ instrument: "future" })}
          />
          <TypeCard
            active={form.instrument === "option"}
            title="Option CE / PE"
            text="ATM ± 2 from the option tape"
            onClick={() => set({ instrument: "option", optionType: form.optionType || "CE", strikeOffset: form.strikeOffset || 0 })}
          />
        </div>
        ) : null}

        <section className="overflow-hidden rounded-xl border border-[var(--border)]">
          <SettingsHead>Strategy</SettingsHead>
          <SettingsRow label="Name">
            <input className={fieldClass} value={form.name || ""} onChange={(event) => set({ name: event.target.value })} placeholder="Strategy name" />
          </SettingsRow>
          {crudeFirst ? (
            <SettingsRow label="Trade limit">
              <div data-trade-limit="crude">
                <input
                  type="number"
                  min={1}
                  max={20}
                  inputMode="numeric"
                  aria-label="Trade limit"
                  className={fieldClass}
                  value={Math.max(1, Math.round(Number(form.maxTradesPerDay) || 5))}
                  onChange={(event) => set({ maxTradesPerDay: Math.max(1, Math.min(20, Math.round(Number(event.target.value) || 1))) })}
                />
              </div>
            </SettingsRow>
          ) : null}
          {!engine && !crudeFirst && !niftyTest && form.instrument === "option" ? (
            <>
              <SettingsRow label="Call / Put">
                <div className="grid grid-cols-2 gap-1">
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
              </SettingsRow>
              <SettingsRow label="Strike" title={liveOptionHint(form, data)}>
                <select className={fieldClass} value={form.strikeOffset ?? 0} onChange={(event) => set({ strikeOffset: Number(event.target.value) })}>
                  {OPTION_OFFSETS.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.label}
                    </option>
                  ))}
                </select>
              </SettingsRow>
            </>
          ) : null}

          {engine || crudeFirst || niftyTest ? null : (
          <SettingsRow label="Underlying">
            <select
              className={fieldClass}
              value={form.symbol || "NIFTY"}
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
          </SettingsRow>
          )}
          {engine || crudeFirst || niftyTest ? null : (
          <SettingsRow label="Side">
            <select className={fieldClass} value={form.side || "BUY"} onChange={(event) => set({ side: event.target.value as AlgoStrategy["side"] })}>
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
              <option value="BOTH">BOTH</option>
            </select>
          </SettingsRow>
          )}
          <SettingsRow label="Lots" title={lotsHint}>
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
          </SettingsRow>
          <SettingsRow label="Timeframe">
            <select
              className={fieldClass}
              value={reversal || hedge ? "15m" : vwap ? "5m" : form.timeframe || "5m"}
              disabled={engine && !firstCandle}
              onChange={(event) => {
                const timeframe = event.target.value;
                if (firstCandle || crudeFirst) {
                  set({
                    timeframe,
                    entryEvaluationIst: firstCandleEntryIst(form.firstBarStartIst, timeframe, form.entryEvaluationIst),
                  });
                  return;
                }
                set({ timeframe });
              }}
            >
              {(reversal || hedge ? ["15m"] : vwap ? ["5m"] : firstCandle || crudeFirst || niftyTest ? ["1m", "5m", "15m"] : TIMEFRAMES).map((row) => (
                <option key={row} value={row}>
                  {row}
                </option>
              ))}
            </select>
          </SettingsRow>
          <SettingsRow label="Broker" title={form.runMode === "live" ? "Saving does not start LIVE." : "Paper fills are virtual."}>
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
          </SettingsRow>

          {engine || niftyTest || crudeFirst ? null : kind === "indicator" ? (
            <>
              <SettingsHead>Rules</SettingsHead>
              <SettingsRow label="Indicator">
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
              </SettingsRow>
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
            </>
          ) : engine || niftyTest || crudeFirst ? null : (
            <>
              <SettingsHead>Rules</SettingsHead>
              <SettingsRow label="Pattern">
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
              </SettingsRow>
              {form.pattern === "ORB" ? (
                <SettingsRow label="Range">
                  <select className={fieldClass} value={form.rangeMinutes || 15} onChange={(event) => set({ rangeMinutes: Number(event.target.value) })}>
                    <option value={15}>First 15 minutes</option>
                    <option value={30}>First 30 minutes</option>
                    <option value={60}>First 60 minutes</option>
                  </select>
                </SettingsRow>
              ) : null}
              {form.pattern === "BREAKOUT" || form.pattern === "SR_BOUNCE" ? (
                <NumberField label="Lookback" value={form.lookback || 20} onChange={(lookback) => set({ lookback })} />
              ) : null}
            </>
          )}

          {vwap ? (
            <>
              <SettingsHead>Risk</SettingsHead>
              <div className="grid grid-cols-2 [&_label:nth-child(even)]:border-l">
                <NumberField label="Stop %" value={form.initialSlPct || 20} step={1} onChange={(initialSlPct) => set({ initialSlPct, slPct: initialSlPct })} />
                <NumberField label="Target %" value={form.targetPct || 40} step={1} onChange={(targetPct) => set({ targetPct })} />
                <NumberField label="Trail on %" value={form.trailingActivationPct || 10} step={1} onChange={(trailingActivationPct) => set({ trailingActivationPct })} />
                <NumberField label="Trail step %" value={form.trailingStepPct || 3} step={0.5} onChange={(trailingStepPct) => set({ trailingStepPct })} />
                <NumberField label="VWAP exit" value={form.vwapExitCandles || 5} step={1} onChange={(vwapExitCandles) => set({ vwapExitCandles })} />
                <NumberField label="EOD mins" value={form.eodSquareOffMinutes ?? 10} step={1} onChange={(eodSquareOffMinutes) => set({ eodSquareOffMinutes })} />
              </div>
            </>
          ) : reversal ? (
            <>
              <SettingsHead>Risk</SettingsHead>
              <div className="grid grid-cols-2 [&_label:nth-child(even)]:border-l">
                <NumberField label="Stop %" value={form.initialSlPct || 15} step={1} onChange={(initialSlPct) => set({ initialSlPct, slPct: initialSlPct })} />
                <NumberField label="Target %" value={form.targetPct || 30} step={1} onChange={(targetPct) => set({ targetPct })} />
                <NumberField label="EOD mins" value={form.eodSquareOffMinutes ?? 10} step={1} onChange={(eodSquareOffMinutes) => set({ eodSquareOffMinutes })} />
              </div>
            </>
          ) : niftyTest ? (
            <>
              <SettingsHead>Schedule</SettingsHead>
              <div className="grid grid-cols-2 [&_label:nth-child(even)]:border-l">
                <SettingsRow label="Start">
                  <input
                    name="nifty test"
                    className={fieldClass}
                    value={form.startTimeIst || "09:15"}
                    onChange={(event) => set({ startTimeIst: event.target.value })}
                    placeholder="09:15"
                  />
                </SettingsRow>
                <SettingsRow label="End">
                  <input className={fieldClass} value={form.endTimeIst || "15:15"} onChange={(event) => set({ endTimeIst: event.target.value })} placeholder="15:15" />
                </SettingsRow>
              </div>
            </>
          ) : firstCandle || crudeFirst ? (
            <>
              <SettingsHead>Schedule</SettingsHead>
              <div className="grid grid-cols-2 [&_label:nth-child(even)]:border-l">
                <SettingsRow label="Start LIVE">
                  <input className={fieldClass} value={form.dailyLiveIst || "09:00"} onChange={(event) => set({ dailyLiveIst: event.target.value })} placeholder="09:00" />
                </SettingsRow>
                <SettingsRow label="First candle">
                  <input className={fieldClass} value={form.firstBarStartIst || "09:00"} onChange={(event) => set({ firstBarStartIst: event.target.value })} placeholder="09:00" />
                </SettingsRow>
                <SettingsRow label="Evaluate">
                  <input className={fieldClass} value={firstCandleEntryIst(form.firstBarStartIst, form.timeframe, form.entryEvaluationIst)} onChange={(event) => set({ entryEvaluationIst: event.target.value })} placeholder={firstCandleEntryIst(form.firstBarStartIst, form.timeframe)} />
                </SettingsRow>
                <SettingsRow label="End">
                  <input className={fieldClass} value={form.endTimeIst || (crudeFirst ? "23:15" : "15:15")} onChange={(event) => set({ endTimeIst: event.target.value })} placeholder={crudeFirst ? "23:15" : "15:15"} />
                </SettingsRow>
              </div>
              <SettingsRow label="Expiry">
                {crudeFirst ? (
                  <input className={fieldClass} value="Monthly MCX" readOnly />
                ) : (
                  <select className={fieldClass} value={form.expiryKind || "weekly"} onChange={(event) => set({ expiryKind: event.target.value as "weekly" | "monthly" })}>
                    <option value="weekly">Nearest weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                )}
              </SettingsRow>
              <SettingsRow label="Strike" title={liveOptionHint(form, data)}>
                <select className={fieldClass} value={form.strikeOffset ?? 0} onChange={(event) => set({ strikeOffset: Number(event.target.value) })}>
                  {OPTION_OFFSETS.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.label}
                    </option>
                  ))}
                </select>
              </SettingsRow>
              <SettingsHead>Risk</SettingsHead>
              {crudeFirst ? null : (
                <div className="sr-only" data-trailing-sl="nifty-first-candle">
                  Trailing SL
                </div>
              )}
              <div className="grid grid-cols-2 [&_label:nth-child(even)]:border-l">
                <NumberField label="Stop %" value={form.initialSlPct || 20} step={1} onChange={(initialSlPct) => set({ initialSlPct, slPct: initialSlPct })} />
                <NumberField label="Target %" value={form.targetPct || 40} step={1} onChange={(targetPct) => set({ targetPct })} />
                {crudeFirst ? null : (
                  <>
                    <NumberField
                      label="Trail to buy"
                      value={niftyFirstCandleTrail(form).activation}
                      step={1}
                      onChange={(trailingActivationPct) => {
                        const trail = niftyFirstCandleTrail(form);
                        set({ trailingActivationPct, trailingEveryPct: trail.every, trailingShiftPct: trail.shift, trailingStepPct: trail.shift });
                      }}
                    />
                    <NumberField
                      label="Trail every"
                      value={niftyFirstCandleTrail(form).every}
                      step={1}
                      onChange={(trailingEveryPct) => {
                        const trail = niftyFirstCandleTrail(form);
                        set({ trailingActivationPct: trail.activation, trailingEveryPct, trailingShiftPct: trail.shift, trailingStepPct: trail.shift });
                      }}
                    />
                    <NumberField
                      label="Trail shift"
                      value={niftyFirstCandleTrail(form).shift}
                      step={1}
                      onChange={(trailingShiftPct) => {
                        const trail = niftyFirstCandleTrail(form);
                        set({ trailingActivationPct: trail.activation, trailingEveryPct: trail.every, trailingShiftPct, trailingStepPct: trailingShiftPct });
                      }}
                    />
                    <NumberField label="Max trades" value={Number(form.maxTradesPerDay) > 1 ? Number(form.maxTradesPerDay) : 5} step={1} onChange={(maxTradesPerDay) => set({ maxTradesPerDay: Math.max(1, maxTradesPerDay) })} />
                  </>
                )}
                <NumberField label="EOD mins" value={form.eodSquareOffMinutes ?? 10} step={1} onChange={(eodSquareOffMinutes) => set({ eodSquareOffMinutes })} />
              </div>
            </>
          ) : hedge ? null : (
            <>
              <SettingsHead>Rules</SettingsHead>
              {String(form.symbol || algo?.symbol || "").toUpperCase() === "CRUDEOIL" || /crude/i.test(String(form.name || algo?.name || "")) ? (
                <SettingsRow label="Trade limit">
                  <div data-trade-limit="crude">
                    <input
                      type="number"
                      min={1}
                      max={20}
                      inputMode="numeric"
                      aria-label="Trade limit"
                      className={fieldClass}
                      value={Math.max(1, Math.round(Number(form.maxTradesPerDay) || 5))}
                      onChange={(event) => set({ maxTradesPerDay: Math.max(1, Math.min(20, Math.round(Number(event.target.value) || 1))) })}
                    />
                  </div>
                </SettingsRow>
              ) : null}
              <div className="border-t border-[var(--border)] px-3 py-2">
                <ConditionGroupEditor
                  label="BUY when"
                  group={form.buyConditions || groupsFromFlat(form).buyConditions}
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
              </div>
              <div className="border-t border-[var(--border)] px-3 py-2">
                <ConditionGroupEditor
                  label="SELL when"
                  group={form.sellConditions || groupsFromFlat(form).sellConditions}
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
              </div>
            </>
          )}

          {engine || crudeFirst || firstCandle || vwap || reversal ? null : (
            <>
              <SettingsHead>Risk</SettingsHead>
              <div className="grid grid-cols-2 [&_label:nth-child(even)]:border-l">
                <NumberField label="Stop %" value={form.slPct || 0.4} step={0.05} onChange={(slPct) => set({ slPct })} />
                <NumberField label="Target %" value={form.targetPct || 0.8} step={0.05} onChange={(targetPct) => set({ targetPct })} />
              </div>
            </>
          )}
        </section>

        {error ? <p className="mt-2 text-xs font-semibold text-down">{error}</p> : null}

        <div className="mt-2 flex gap-2">
          <button type="button" onClick={onClose} className="h-8 flex-1 rounded-md border border-[var(--border)] text-sm font-semibold">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="h-8 flex-1 rounded-md bg-brand-500 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Saving..." : algo ? "Save" : "Add strategy"}
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
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
        {onRemove ? (
          <button type="button" onClick={onRemove} className="text-[10px] font-bold uppercase text-slate-400">
            Remove
          </button>
        ) : null}
      </div>
      <div className="grid gap-1.5 md:grid-cols-4">
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
          <div className="flex h-8 items-center text-xs font-semibold text-slate-400">vs {SOURCES.find((row) => row.id === right)?.label}</div>
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
        "rounded-lg border px-2 py-1.5 text-left",
        active ? "border-brand-500 bg-brand-50/80 dark:bg-brand-500/10" : "border-[var(--border)] bg-[var(--bg)]",
      )}
    >
      <div className="text-xs font-bold">{title}</div>
      <div className="mt-0.5 line-clamp-2 text-[10px] text-slate-400">{text}</div>
    </button>
  );
}

function SettingsHead({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-t border-[var(--border)] bg-[var(--bg)] px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400 first:border-t-0">
      {children}
    </div>
  );
}

function SettingsRow({ label, title, children }: { label: string; title?: string; children: ReactNode }) {
  return (
    <label className="flex items-center gap-2 border-t border-[var(--border)] px-2.5 py-1.5" title={title}>
      <span className="w-[5.5rem] shrink-0 text-xs text-slate-500">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </label>
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
    <SettingsRow label={label}>
      <input className={fieldClass} type="number" step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </SettingsRow>
  );
}
