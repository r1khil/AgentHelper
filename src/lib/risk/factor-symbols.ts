/**
 * The ETFs behind the factor regression. Kept in a module of its own, with no imports, so the price
 * job's symbol list can include them without pulling in the risk model.
 */
export const FACTOR_ETFS = ["SPY", "IWM", "IVE", "IVW", "MTUM", "TLT", "UUP", "USO"] as const;
