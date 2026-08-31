export function PaperTradingAdapter({ placeOrder, squareOff } = {}) {
  return {
    mode: "paper",
    place(payload) {
      return placeOrder({
        ...payload,
        brokerId: "paper",
        type: "MARKET",
        product: "MIS",
      });
    },
    exit(position) {
      return squareOff(position.id);
    },
  };
}
