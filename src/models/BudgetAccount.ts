/** One FY-specific File C source row behind a {@link BudgetSourceAnomaly}. Every property is optional. */
export interface BudgetSourceAnomalyRow {
  fiscal_period?: number | string | null;
  piid?: string | null;
  parent_piid?: string | null;
  tas?: string | null;
  reporting_agency_id?: string | null;
  transaction_obligated_amount?: number | string | null;
  file_c_source?: string | null;
}

/** Where a {@link BudgetSourceAnomaly} was observed in the upstream spending data. */
export interface BudgetSourceAnomalySource {
  dataset?: string | null;
  fiscal_year?: number | null;
  rows?: BudgetSourceAnomalyRow[] | null;
}

/**
 * A source-data inconsistency the API detected on a budget account row, and what it did about it.
 *
 * `action` is `"capped"` when a served value was clamped to its bound (`reported_value` is what the source said, `served_value` is what the row carries), or `"flagged"` when the value is served as reported and only annotated.
 * `code` is an open string: today's codes are `contract_exceeds_obligations`, `assistance_exceeds_obligations`, and `contract_without_obligations`, and more may be added without notice.
 * Every property is optional and may be null.
 */
export interface BudgetSourceAnomaly {
  code?: string | null;
  field?: string | null;
  bound_field?: string | null;
  action?: "capped" | "flagged" | (string & {}) | null;
  reported_value?: number | string | null;
  served_value?: number | string | null;
  likely_cause?: string | null;
  affected_fields?: string[] | null;
  message?: string | null;
  source?: BudgetSourceAnomalySource | null;
}

/**
 * Federal account x fiscal year budget rollup.
 *
 * One row per `(federal_account_symbol, fiscal_year)` covering the full budget
 * lifecycle (requested -> enacted -> apportioned -> obligated -> outlayed),
 * pre-computed ratios + trends, the contract/assistance/unlinked breakdown, and
 * request-vs-actual contract spend.
 *
 * `/api/budget/accounts/` uses shape-on-demand: which fields appear depends on
 * the `?shape=` query param, so EVERY field is optional regardless of the
 * OpenAPI schema's nominal "required" assertions. Mirrors the API
 * `BudgetAccount` schema.
 */
export interface BudgetAccount {
  id?: number;
  federal_account_symbol?: string;
  fiscal_year?: number;
  /** File A fiscal period (1-12) this account-year's figures run through; the latest fiscal year is partial until it reaches 12. Null when the row has no File A data. */
  data_through_period?: number | null;
  agency_code?: string | null;
  agency_name?: string | null;
  bureau_name?: string | null;
  account_title?: string | null;
  bea_category?: string | null;
  on_off_budget?: string | null;
  subfunction_code?: string | null;
  /** Account category: `"budgetary"` or `"credit_financing"` today. Treat as an open string. */
  account_category?: string | null;

  // Lifecycle
  requested_ba?: number | null;
  enacted_ba?: number | null;
  apportioned?: number | null;
  obligated_total?: number | null;
  outlayed_total?: number | null;
  unobligated_balance?: number | null;

  // Contract / assistance / unlinked breakdown
  contract_obligated?: number | null;
  contract_outlayed?: number | null;
  n_contracts?: number | null;
  n_unique_contract_recipients?: number | null;
  assistance_obligated?: number | null;
  assistance_outlayed?: number | null;
  n_grants?: number | null;
  n_unique_grant_recipients?: number | null;
  unlinked_obligated?: number | null;
  contract_share_of_obligated?: number | null;
  contract_share_of_obligated_capped?: number | null;
  contract_share_capped_flag?: boolean;
  assistance_share_of_obligated?: number | null;
  assistance_share_of_obligated_capped?: number | null;
  assistance_share_capped_flag?: boolean;
  /** Source-data inconsistencies detected on this row; `[]` when the row is clean. */
  source_anomalies?: BudgetSourceAnomaly[] | null;

  // Forward-look
  next_year_requested_ba?: number | null;
  ba_growth_next_year?: number | null;
  ba_growth_next_year_pct?: number | null;

  // Ratios
  enacted_to_requested_pct?: number | null;
  enacted_to_requested_pct_capped?: number | null;
  enacted_to_requested_pct_capped_flag?: boolean;
  apportioned_to_enacted_pct?: number | null;
  apportioned_to_enacted_pct_capped?: number | null;
  apportioned_to_enacted_pct_capped_flag?: boolean;
  obligated_to_apportioned_pct?: number | null;
  obligated_to_apportioned_pct_capped?: number | null;
  obligated_to_apportioned_pct_capped_flag?: boolean;
  obligated_to_enacted_pct?: number | null;
  obligated_to_enacted_pct_capped?: number | null;
  obligated_to_enacted_pct_capped_flag?: boolean;
  outlayed_to_obligated_pct?: number | null;
  outlayed_to_obligated_pct_capped?: number | null;
  outlayed_to_obligated_pct_capped_flag?: boolean;
  unobligated_pct?: number | null;

  // Trends
  enacted_ba_yoy_pct?: number | null;
  obligated_yoy_pct?: number | null;
  contract_obligated_yoy_pct?: number | null;
  enacted_ba_5yr_cagr?: number | null;
  contract_obligated_5yr_cagr?: number | null;

  // Request-vs-actual
  requested_contractual_services?: number | null;
  requested_personnel_share?: number | null;
  actual_vs_requested_contract?: number | null;
  actual_vs_requested_contract_capped?: number | null;
  actual_vs_requested_contract_capped_flag?: boolean;

  // Provenance + narrative
  appendix_pdf_url?: string | null;
  account_narrative_excerpt?: string | null;
  top_contract_recipients?: unknown[] | null;
  top_grant_recipients?: unknown[] | null;
  created?: string;
  modified?: string;
}
