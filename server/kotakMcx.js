const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function splitKotakCsvLine(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (const ch of String(line || "")) {
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function ymdFromKotakMcxToken(token) {
  const hit = String(token || "")
    .toUpperCase()
    .match(/^(\d{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d{2})$/);
  if (!hit) return "";
  const month = MONTHS.indexOf(hit[2]) + 1;
  if (month < 1) return "";
  return `20${hit[3]}-${String(month).padStart(2, "0")}-${hit[1]}`;
}

export function parseKotakMcxCrudeMaster(text) {
  const lines = String(text || "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return { futCodes: [], optionExpiries: [], options: [] };
  const header = splitKotakCsvLine(lines[0]).map((col) => col.trim());
  const idx = (name) => header.findIndex((col) => col === name);
  const iName = idx("pSymbolName");
  const iTrd = idx("pTrdSymbol");
  const iType = idx("pInstType") >= 0 ? idx("pInstType") : idx("pInstName");
  const iOpt = idx("pOptionType");
  const iTok = idx("pSymbol");
  const iExp = header.findIndex((col) => col === "lExpiryDate" || col === "pExpiryDate");
  const futs = [];
  const options = [];
  for (const line of lines.slice(1)) {
    const cols = splitKotakCsvLine(line);
    const name = String(iName >= 0 ? cols[iName] : "").toUpperCase().trim();
    const trd = String(iTrd >= 0 ? cols[iTrd] : "").toUpperCase().trim();
    const type = String(iType >= 0 ? cols[iType] : "").toUpperCase().trim();
    const opt = String(iOpt >= 0 ? cols[iOpt] : "").toUpperCase().trim();
    if (name !== "CRUDEOIL" && !trd.startsWith("CRUDEOIL")) continue;
    if (name.includes("CRUDEOILM") || trd.includes("CRUDEOILM")) continue;
    const token = String(iTok >= 0 ? cols[iTok] : "").trim();
    const optionHit = trd.match(/^CRUDEOIL(\d{2}(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\d{2})(\d{3,6})(CE|PE)$/);
    if (optionHit && (type === "OPTFUT" || type === "OPT" || opt === "CE" || opt === "PE")) {
      options.push({
        token,
        code: trd,
        expiry: ymdFromKotakMcxToken(optionHit[1]),
        strike: Number(optionHit[2]),
        option: optionHit[3],
      });
      continue;
    }
    if (type && type !== "FUTCOM" && type !== "FUT") continue;
    if (opt && opt !== "XX") continue;
    futs.push({
      token,
      code: trd,
      expiry: Number(iExp >= 0 ? cols[iExp] : 0) || 0,
    });
  }
  futs.sort((a, b) => a.expiry - b.expiry);
  const futCodes = [];
  for (const row of futs.slice(0, 2)) {
    if (row.code) futCodes.push(row.code);
    if (row.token) futCodes.push(row.token);
  }
  const optionExpiries = [...new Set(options.map((row) => row.expiry).filter(Boolean))].sort();
  return { futCodes: [...new Set(futCodes)], optionExpiries, options };
}

export function pickKotakCrudeFutCodes(text) {
  return parseKotakMcxCrudeMaster(text).futCodes;
}

export function kotakMcxMasterUrls(date = new Date()) {
  return [0, 1, 2].map((offset) => {
    const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
      new Date(date.getTime() - offset * 86_400_000),
    );
    return `https://lapi.kotaksecurities.com/wso2-scripmaster/v1/prod/${ymd}/transformed/mcx_fo.csv`;
  });
}

let kotakMcxMasterCache = { at: 0, codes: [], optionExpiries: [], options: [] };
const KOTAK_MCX_MASTER_TTL_MS = 6 * 60 * 60 * 1000;

export function resetKotakMcxMasterCache() {
  kotakMcxMasterCache = { at: 0, codes: [], optionExpiries: [], options: [] };
}

export function kotakCrudeOptionExpiries() {
  return kotakMcxMasterCache.optionExpiries || [];
}

export function lookupKotakCrudeOptionCode({ strike, option, expiry } = {}) {
  const px = Number(strike);
  const opt = String(option || "").toUpperCase();
  if (!(px > 0) || (opt !== "CE" && opt !== "PE")) return "";
  const rows = kotakMcxMasterCache.options || [];
  const ymd = String(expiry || "").slice(0, 10);
  const month = ymd.slice(0, 7);
  return (
    rows.find((row) => row.strike === px && row.option === opt && row.expiry === ymd)?.code ||
    rows.find((row) => row.strike === px && row.option === opt && month && row.expiry.startsWith(month))?.code ||
    rows.find((row) => row.strike === px && row.option === opt)?.code ||
    ""
  );
}

export async function ensureKotakMcxMaster(fetchImpl = fetch) {
  if (kotakMcxMasterCache.codes.length && Date.now() - kotakMcxMasterCache.at < KOTAK_MCX_MASTER_TTL_MS) {
    return kotakMcxMasterCache;
  }
  for (const url of kotakMcxMasterUrls()) {
    try {
      const res = await fetchImpl(url, { headers: { Accept: "text/csv, */*" } });
      if (!res?.ok) continue;
      const text = typeof res.text === "function" ? await res.text() : "";
      const parsed = parseKotakMcxCrudeMaster(text);
      if (!parsed.futCodes.length && !parsed.options.length) continue;
      kotakMcxMasterCache = { at: Date.now(), ...parsed, codes: parsed.futCodes };
      return kotakMcxMasterCache;
    } catch {
      /* next dated MCX file */
    }
  }
  return kotakMcxMasterCache;
}
