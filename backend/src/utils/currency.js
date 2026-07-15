// ai_calls.cost_cents is USD-cents (Sonnet pricing — see claudeService.js).
// Every human-facing amount and every DKK-denominated budget must convert
// through this rate. Override with USD_TO_DKK_RATE in env (mid-2026 spot ≈ 6.54).
const USD_TO_DKK_RATE = parseFloat(process.env.USD_TO_DKK_RATE) || 6.5;

function usdCentsToDkk(usdCents) {
  return (Number(usdCents) / 100) * USD_TO_DKK_RATE;
}

module.exports = { USD_TO_DKK_RATE, usdCentsToDkk };
