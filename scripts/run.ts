import { runOnce } from "../src/loop/runOnce.js";

const dryRun = process.argv.includes("--dry");

runOnce({ dryRun })
  .then((result) => {
    const equity = result.ledgerSnapshot.equityCurve.at(-1)?.equity;
    console.log(
      `[${result.cycleId}] action=${result.proposal.action} symbol=${result.proposal.symbol} ` +
        `approved=${result.verdict.approved}${dryRun ? " (dry run — no ledger change)" : ""}`,
    );
    console.log(`  verdict: ${result.verdict.reason}`);
    console.log(`  equity: $${equity?.toFixed ? equity.toFixed(2) : equity}`);
  })
  .catch((err) => {
    console.error("Cycle failed:", err);
    process.exitCode = 1;
  });
