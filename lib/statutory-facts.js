// Canonical statutory/runtime facts used to detect drift across Insaya's
// legacy calculator UI, AI knowledge, and deterministic Case rules.
//
// Bundle 1 intentionally does not rewrite the legacy calculator runtime.
// Instead, this module establishes one frozen contract and release tests
// require every existing source to stay aligned until consumers migrate here.

export const STATUTORY_FACTS_2026 = Object.freeze({
  minWageHour: 10320,
  minWageMonth: 2156880,
  minWageDay: 82560,
  monthHours: 209,
  weeklyHoursForBenefits: 15,

  npRateWorker: 0.0475,
  npBaseMax: 6590000,
  npBaseMin: 410000,
  hiRateWorker: 0.03595,
  ltcRate: 0.1314,
  eiRateWorker: 0.009,

  uiDailyUpper: 68100,
  uiDailyLower: 66048,

  nightStart: "22:00",
  nightEnd: "06:00",
  legalDaily: 8,
  legalWeekly: 40,
  overtimeWeeklyCap: 12,
});

// Legacy index.html C26 names differ from the server-side names. Keep the
// mapping explicit so parity can be enforced without copying calculator code.
export const LEGACY_C26_FACT_MAP = Object.freeze({
  minWageHour: "minHour",
  minWageMonth: "minMonth",
  minWageDay: "minDay",
  monthHours: "monthHours",
  npRateWorker: "np",
  npBaseMax: "npMax",
  npBaseMin: "npMin",
  hiRateWorker: "hi",
  ltcRate: "ltc",
  eiRateWorker: "ei",
  uiDailyUpper: "uiUpper",
});

export function validateLegacyC26(legacy = {}) {
  const errors = [];
  for (const [canonicalKey, legacyKey] of Object.entries(LEGACY_C26_FACT_MAP)) {
    if (legacy?.[legacyKey] !== STATUTORY_FACTS_2026[canonicalKey]) {
      errors.push(`${legacyKey}: expected ${STATUTORY_FACTS_2026[canonicalKey]}, got ${legacy?.[legacyKey]}`);
    }
  }
  return { ok: errors.length === 0, errors };
}
