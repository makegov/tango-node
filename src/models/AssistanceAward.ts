import type { FiscalYearObligation, OrganizationOfficePayload } from "./Contract.js";

/**
 * The four financial-assistance award groups, one endpoint each under `/api/assistance/`.
 *
 * An award lives under the group of its latest action's assistance type; if that type moves to another group, the award moves endpoints with the same `key`.
 */
export type AssistanceAwardGroup = "grants" | "loans" | "direct_payments" | "other";

/** A `{code, description}` pair: the award's GSDM assistance type, or one of the recipient's USAspending business types. */
export interface AssistanceCodeDescription {
  code?: string | null;
  description?: string | null;
}

/** The catalog entry for the award's primary assistance listing. Null when the catalog doesn't list the award's `cfda_number`. */
export interface AssistanceListingRef {
  number?: string | null;
  title?: string | null;
}

/**
 * An award's recipient: a shared recipient record under `Entity`'s field names. Every award to the recipient points at the same record, including recipients with no UEI.
 *
 * Null on aggregate and PII-redacted records (record types `1` and `3`).
 */
export interface AssistanceRecipient {
  /** Tango's recipient identifier; for a recipient with a UEI it is the entity's uuid. */
  uuid?: string | null;
  uei?: string | null;
  duns?: string | null;
  legal_business_name?: string | null;
  legal_business_name_raw?: string | null;
  county?: string | null;
  congressional_district?: string | null;
  congressional_district_original?: string | null;
  /** The recipient's highest owner as filed (`uei`, `duns`, `legal_business_name`, `legal_business_name_raw`). */
  highest_owner?: Record<string, unknown> | null;
  /** USAspending recipient-type codes, not SAM.gov's. */
  business_types?: AssistanceCodeDescription[] | null;
}

/** The recipient record's address, plus the two congressional districts filed on this award. Null when every key is empty. */
export interface AssistanceRecipientAddress {
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state_or_province_code?: string | null;
  zip_code?: string | null;
  zip_code_plus4?: string | null;
  country_code?: string | null;
  county_fips?: string | null;
  state_fips?: string | null;
  foreign_city_name?: string | null;
  foreign_province_name?: string | null;
  foreign_postal_code?: string | null;
  congressional_district_original?: string | null;
  congressional_district_current?: string | null;
}

/** Where an assistance award is performed. `country` is ISO 3166 alpha-3. */
export interface AssistancePlaceOfPerformance {
  country?: string | null;
  state_code?: string | null;
  state_name?: string | null;
  state_fips?: string | null;
  county_fips?: string | null;
  county_name?: string | null;
  city_name?: string | null;
  zip_code?: string | null;
  zip_plus_four?: string | null;
  code?: string | null;
  scope?: string | null;
  foreign_location?: string | null;
}

export interface AssistancePeriodOfPerformance {
  start_date?: string | null;
  current_end_date?: string | null;
}

/** The award's five highest-compensated officers, as filed. Null when none were. */
export interface AssistanceOfficers {
  highly_compensated_officer_1_name?: string | null;
  highly_compensated_officer_1_amount?: string | number | null;
  highly_compensated_officer_2_name?: string | null;
  highly_compensated_officer_2_amount?: string | number | null;
  highly_compensated_officer_3_name?: string | null;
  highly_compensated_officer_3_amount?: string | number | null;
  highly_compensated_officer_4_name?: string | null;
  highly_compensated_officer_4_amount?: string | number | null;
  highly_compensated_officer_5_name?: string | null;
  highly_compensated_officer_5_amount?: string | number | null;
}

/**
 * One action on an assistance award: an element of the `transactions(...)` expand, or a row of the `/transactions/` sub-route.
 *
 * Money fields arrive as JSON numbers; the client's shaped response parses them to decimal strings. The sub-route returns rows unshaped, as the API sends them.
 */
export interface AssistanceTransaction {
  key?: string;
  modification_number?: string | null;
  transaction_date?: string | null;
  action_type?: string | null;
  assistance_type_code?: string | null;
  correction_delete_indicator?: string | null;
  cfda_number?: string | null;
  obligated?: string | number | null;
  pragmatic_obligations?: string | number | null;
  non_federal_funding_amount?: string | number | null;
  indirect_cost_federal_share_amount?: string | number | null;
  face_value_of_loan?: string | number | null;
  loan_subsidy_cost?: string | number | null;
  award_amount_basis?: string | null;
  award_recipient_basis?: string | null;
  /** A number on the `/transactions/` sub-route, a string such as `"2027"` in the `transactions(...)` expand. */
  action_date_fiscal_year?: number | string | null;
  last_modified_date?: string | null;
  initial_report_date?: string | null;
}

/**
 * An award's money under one assistance listing: an element of the `listings(...)` expand, or a row of the `/listings/` sub-route. The primary listing comes first.
 */
export interface AssistanceAwardListing {
  cfda_number: string | null;
  is_primary?: boolean;
  obligated?: string | number | null;
  pragmatic_obligations?: string | number | null;
  non_federal_funding_amount?: string | number | null;
  indirect_cost_federal_share_amount?: string | number | null;
  face_value_of_loan?: string | number | null;
  loan_subsidy_cost?: string | number | null;
  transactions_count?: number | null;
  first_action_date?: string | null;
  last_action_date?: string | null;
}

/**
 * A financial-assistance award (`/api/assistance/{grants,loans,direct_payments,other}/`), from USAspending. All four groups share this shape.
 *
 * The endpoints use shape-on-demand: which fields appear depends on the `?shape=` query param, so EVERY field is optional.
 *
 * `key` is the award identifier every detail and sub-route URL takes; a retired key in `former_award_keys` still resolves to the award that carries it now.
 *
 * Date fields are typed as the API's ISO strings and money fields as the JSON numbers the API sends; a shaped response from the client parses dates to `Date` and money to decimal strings. To compare dollar amounts across the four groups, read `pragmatic_obligations`: the obligation for grants and payments, the subsidy cost for loans.
 */
export interface AssistanceAward {
  key?: string;
  fain?: string | null;
  uri?: string | null;
  award_date?: string | null;
  last_action_date?: string | null;
  last_modified_date?: string | null;
  fiscal_year?: number | null;
  /** The GSDM assistance type (`F001`-`F010`) with its description. */
  assistance_type?: AssistanceCodeDescription | null;
  /** `1` aggregate, `2` non-aggregate, `3` individual recipient (PII-redacted). */
  record_type?: string | null;
  /** The primary assistance listing (CFDA) number. */
  cfda_number?: string | null;
  assistance_listing?: AssistanceListingRef | null;
  title?: string | null;
  summary?: string | null;
  purposes_differ?: boolean | null;
  obligated?: string | number | null;
  pragmatic_obligations?: string | number | null;
  non_federal_funding_amount?: string | number | null;
  indirect_cost_federal_share_amount?: string | number | null;
  face_value_of_loan?: string | number | null;
  loan_subsidy_cost?: string | number | null;
  insurance_coverage_amount?: string | number | null;
  award_total_obligated?: string | number | null;
  award_total_outlayed?: string | number | null;
  award_total_non_federal_funding?: string | number | null;
  award_total_face_value_of_loan?: string | number | null;
  award_total_loan_subsidy_cost?: string | number | null;
  covid19_obligated?: string | number | null;
  covid19_outlayed?: string | number | null;
  iija_obligated?: string | number | null;
  iija_outlayed?: string | number | null;
  transactions_count?: number | null;
  listings_count?: number | null;
  assistance_types_count?: number | null;
  award_amount_basis?: string | null;
  award_recipient_basis?: string | null;
  /** `NON` (not Recovery Act) or `REC` (Recovery Act). */
  business_funds_indicator?: string | null;
  /** The Disaster Emergency Fund Codes as USAspending publishes them: free text such as `"AAK: Emergency P.L. 118-158"`, not a list. */
  disaster_emergency_fund_codes?: string | null;
  funding_opportunity_number?: string | null;
  funding_opportunity_goals_text?: string | null;
  sai_number?: string | null;
  /** Award IDs USAspending retired in favor of this award's `key`. */
  former_award_keys?: string[];
  treasury_accounts_funding_this_award?: string | null;
  federal_accounts_funding_this_award?: string | null;
  object_classes_funding_this_award?: string | null;
  program_activities_funding_this_award?: string | null;
  awarding_office?: OrganizationOfficePayload | null;
  funding_office?: OrganizationOfficePayload | null;
  recipient?: AssistanceRecipient | null;
  recipient_address?: AssistanceRecipientAddress | null;
  place_of_performance?: AssistancePlaceOfPerformance | null;
  period_of_performance?: AssistancePeriodOfPerformance | null;
  officers?: AssistanceOfficers | null;
  obligations_by_fiscal_year?: FiscalYearObligation[] | null;
  listings?: AssistanceAwardListing[];
  transactions?: AssistanceTransaction[];
}
