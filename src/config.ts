import "dotenv/config";

export interface AppConfig {
  anthropicApiKey: string;
  anthropicModel: string;
  bitget: {
    apiKey?: string;
    secretKey?: string;
    passphrase?: string;
    readOnly: boolean;
    paperTrading: boolean;
  };
  risk: {
    maxPositionUsd: number;
    maxDailyLossUsd: number;
    maxDrawdownPct: number;
    symbolWhitelist: string[];
  };
  ledger: {
    startingCashUsd: number;
  };
}

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required env var ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

export function loadAppConfig(): AppConfig {
  return {
    anthropicApiKey: required("ANTHROPIC_API_KEY", process.env.ANTHROPIC_API_KEY),
    anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",
    bitget: {
      apiKey: process.env.BITGET_API_KEY || undefined,
      secretKey: process.env.BITGET_SECRET_KEY || undefined,
      passphrase: process.env.BITGET_PASSPHRASE || undefined,
      // Session 1 default architecture (see README): virtual ledger marked to live public
      // prices. No Bitget credentials are read or required for this. Flip these only when
      // you deliberately wire up Demo (--paper-trading) or live trading in a later session.
      readOnly: true,
      paperTrading: false,
    },
    risk: {
      maxPositionUsd: Number(process.env.RISK_MAX_POSITION_USD ?? 500),
      maxDailyLossUsd: Number(process.env.RISK_MAX_DAILY_LOSS_USD ?? 100),
      maxDrawdownPct: Number(process.env.RISK_MAX_DRAWDOWN_PCT ?? 10),
      symbolWhitelist: (
        process.env.RISK_SYMBOL_WHITELIST ??
        "rNVDAUSDT,rTSLAUSDT,rAAPLUSDT,BTCUSDT,ETHUSDT"
      )
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    },
    ledger: {
      startingCashUsd: Number(process.env.LEDGER_STARTING_CASH_USD ?? 10000),
    },
  };
}
