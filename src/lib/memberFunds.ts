export type MemberFundsWallet = {
  balance?: number;
  brokerBalance?: number;
  brokerUsed?: number;
};

export function memberDeskFunds(desk?: { wallet?: MemberFundsWallet } | null) {
  const wallet = Number(desk?.wallet?.balance) || 0;
  const broker = Number(desk?.wallet?.brokerBalance);
  const used = Number(desk?.wallet?.brokerUsed);
  if (Number.isFinite(broker)) {
    const usedAmt = Number.isFinite(used) ? Math.max(0, used) : 0;
    return { capital: broker + usedAmt, available: Math.max(0, broker) };
  }
  return { capital: wallet, available: wallet };
}
