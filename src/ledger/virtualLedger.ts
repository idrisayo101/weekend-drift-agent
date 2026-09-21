/**
 * Self-built virtual paper-trading ledger, marked to real live Bitget prices.
 *
 * This is the Session 1 default architecture (see build reference §3, option 3): the
 * agent reads real market data and makes real decisions, but fills are recorded here
 * rather than routed through Bitget's order book. Chosen over Bitget's own Demo
 * (--paper-trading) sandbox because rToken support in that sandbox is unconfirmed, and
 * over a live Agentic account because that requires a conscious OAuth + real-funds step
 * this project isn't taking by default. Both remain swappable later — see README.
 */

export type Side = "long" | "short";

export interface Position {
  symbol: string;
  side: Side;
  qty: number;
  entryPrice: number;
  openedAt: string; // ISO timestamp
}

export interface ClosedTrade extends Position {
  exitPrice: number;
  closedAt: string;
  realizedPnl: number;
}

export interface EquitySnapshot {
  timestamp: string;
  cash: number;
  unrealizedPnl: number;
  equity: number;
}

export interface VirtualLedgerJSON {
  startingCash: number;
  cash: number;
  positions: [string, Position][];
  closedTrades: ClosedTrade[];
  equityCurve: EquitySnapshot[];
  peakEquity: number;
}

export class VirtualLedger {
  private cash: number;
  private readonly startingCash: number;
  private positions: Map<string, Position>;
  private closedTrades: ClosedTrade[];
  private equityCurve: EquitySnapshot[];
  private peakEquity: number;

  constructor(startingCashUsd: number) {
    this.cash = startingCashUsd;
    this.startingCash = startingCashUsd;
    this.positions = new Map();
    this.closedTrades = [];
    this.equityCurve = [];
    this.peakEquity = startingCashUsd;
  }

  hasPosition(symbol: string): boolean {
    return this.positions.has(symbol);
  }

  getPosition(symbol: string): Position | undefined {
    return this.positions.get(symbol);
  }

  /** Opens a paper position. Cash is debited by qty * price as cost basis (no leverage in Session 1). */
  open(symbol: string, side: Side, qty: number, price: number, timestamp = new Date().toISOString()): Position {
    if (this.positions.has(symbol)) {
      throw new Error(
        `Position already open on ${symbol} — close it before opening a new one ` +
          `(Session 1 ledger is single-position-per-symbol; extend this if a sub-theme needs scaling in/out).`,
      );
    }
    const cost = qty * price;
    this.cash -= cost;
    const position: Position = { symbol, side, qty, entryPrice: price, openedAt: timestamp };
    this.positions.set(symbol, position);
    return position;
  }

  close(symbol: string, exitPrice: number, timestamp = new Date().toISOString()): ClosedTrade {
    const position = this.positions.get(symbol);
    if (!position) {
      throw new Error(`No open position on ${symbol} to close.`);
    }
    const direction = position.side === "long" ? 1 : -1;
    const realizedPnl = direction * (exitPrice - position.entryPrice) * position.qty;
    this.cash += position.qty * position.entryPrice + realizedPnl;
    const trade: ClosedTrade = { ...position, exitPrice, closedAt: timestamp, realizedPnl };
    this.closedTrades.push(trade);
    this.positions.delete(symbol);
    return trade;
  }

  /** Marks all open positions to the given price map and records an equity snapshot. */
  markToMarket(prices: Record<string, number>, timestamp = new Date().toISOString()): EquitySnapshot {
    let unrealizedPnl = 0;
    for (const position of this.positions.values()) {
      const price = prices[position.symbol];
      if (price === undefined) continue;
      const direction = position.side === "long" ? 1 : -1;
      unrealizedPnl += direction * (price - position.entryPrice) * position.qty;
    }
    const equity = this.cash + this.sumOpenCostBasis() + unrealizedPnl;
    this.peakEquity = Math.max(this.peakEquity, equity);
    const snapshot: EquitySnapshot = { timestamp, cash: this.cash, unrealizedPnl, equity };
    this.equityCurve.push(snapshot);
    return snapshot;
  }

  private sumOpenCostBasis(): number {
    let sum = 0;
    for (const p of this.positions.values()) sum += p.qty * p.entryPrice;
    return sum;
  }

  currentDrawdownPct(): number {
    const latest = this.equityCurve.at(-1);
    if (!latest || this.peakEquity <= 0) return 0;
    return ((this.peakEquity - latest.equity) / this.peakEquity) * 100;
  }

  realizedPnlToday(nowIso: string = new Date().toISOString()): number {
    const today = nowIso.slice(0, 10);
    return this.closedTrades
      .filter((t) => t.closedAt.slice(0, 10) === today)
      .reduce((sum, t) => sum + t.realizedPnl, 0);
  }

  snapshot() {
    const latestEquity = this.equityCurve.at(-1)?.equity ?? this.startingCash;
    return {
      startingCash: this.startingCash,
      cash: this.cash,
      equity: latestEquity,
      openPositions: [...this.positions.values()],
      closedTrades: this.closedTrades,
      equityCurve: this.equityCurve,
      peakEquity: this.peakEquity,
      currentDrawdownPct: this.currentDrawdownPct(),
    };
  }

  toJSON(): VirtualLedgerJSON {
    return {
      startingCash: this.startingCash,
      cash: this.cash,
      positions: [...this.positions.entries()],
      closedTrades: this.closedTrades,
      equityCurve: this.equityCurve,
      peakEquity: this.peakEquity,
    };
  }

  static fromJSON(data: VirtualLedgerJSON): VirtualLedger {
    const ledger = new VirtualLedger(data.startingCash);
    ledger.cash = data.cash;
    ledger.positions = new Map(data.positions);
    ledger.closedTrades = data.closedTrades;
    ledger.equityCurve = data.equityCurve;
    ledger.peakEquity = data.peakEquity;
    return ledger;
  }
}
