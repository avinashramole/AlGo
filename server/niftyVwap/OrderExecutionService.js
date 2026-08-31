export function OrderExecutionService(deps = {}) {
  return {
    async enter(payload) {
      if (typeof deps.place === "function") return deps.place(payload);
      return { error: "No order adapter" };
    },
    async exit(payload) {
      if (typeof deps.exit === "function") return deps.exit(payload);
      return { error: "No exit adapter" };
    },
  };
}
