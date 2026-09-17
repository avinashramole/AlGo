export function dhanErrorBlob(error) {
  return `${error?.message || ""} ${JSON.stringify(error?.body || {})}`;
}

export function dhanFundsNeed(error) {
  const match = dhanErrorBlob(error).match(/add Rs\.?\s*([\d,]+(?:\.\d+)?)/i);
  return match ? match[1].replace(/,/g, "") : "";
}

export function isDhanFundsReject(error) {
  return /insufficient funds/i.test(dhanErrorBlob(error));
}

export function isDhanBrokerReject(error) {
  const blob = dhanErrorBlob(error);
  return Boolean(error?.live) || /DH-\d+|Order_Error|insufficient funds|exceeds the maximum quantity/i.test(blob);
}

export function dhanPlaceErrorMessage(error, ipLine, body) {
  if (isDhanFundsReject(error)) {
    const amt = dhanFundsNeed(error);
    return amt
      ? `Dhan received this order and rejected it. Add ₹${amt} in the Dhan account, then BUY/SELL again.`
      : "Dhan received this order and rejected it. Add funds in the Dhan account, then BUY/SELL again.";
  }
  const raw = error?.body ? JSON.stringify(error.body).slice(0, 280) : "";
  const sent = body
    ? `sent ${body.transactionType} ${body.exchangeSegment} ${body.productType} ${body.orderType} qty ${body.quantity}`
    : "";
  const lead = String(error?.message || "Dhan order failed").replace(/\s+·\s+getIP[\s\S]*$/, "");
  return [lead, ipLine, sent, raw ? `raw ${raw}` : ""].filter(Boolean).join(" · ");
}
