import { EntityBasic } from "./Entity.js";

/**
 * Office payload returned for `awarding_office` / `funding_office` on a
 * contract. Mirrors the API `OrganizationOfficePayload` schema.
 */
export interface OrganizationOfficePayload {
  organization_id?: string | null;
  office_code?: string | null;
  office_name?: string | null;
  agency_code?: string | null;
  agency_name?: string | null;
  department_code?: number | null;
  department_name?: string | null;
}

/** Place-of-performance payload (API `PlaceOfPerformance` schema). */
export interface PlaceOfPerformance {
  country_code?: string | null;
  country_name?: string | null;
  state_code?: string | null;
  state_name?: string | null;
  city_name?: string | null;
  zip_code?: string | null;
}

/** Subaward rollup attached to a contract (API `SubawardsSummary` schema). */
export interface SubawardsSummary {
  count?: number | null;
  total_amount?: number | null;
}

/**
 * Legislative-mandate flags attached to a contract (API `LegislativeMandates`
 * schema). Each value is an opaque object as returned by the API.
 */
export interface LegislativeMandates {
  clinger_cohen_act_planning?: Record<string, unknown> | null;
  construction_wage_rate_requirements?: Record<string, unknown> | null;
  employment_eligibility_verification?: Record<string, unknown> | null;
  interagency_contracting_authority?: Record<string, unknown> | null;
  labor_standards?: Record<string, unknown> | null;
  materials_supplies_articles_equipment?: Record<string, unknown> | null;
  other_statutory_authority?: Record<string, unknown> | null;
  service_contract_inventory?: Record<string, unknown> | null;
}

/** Reference to a parent award (IDV) (API `ParentAwardReference` schema). */
export interface ParentAwardReference {
  key?: string | null;
  piid?: string | null;
}

/**
 * Contract list/detail item.
 *
 * `/api/contracts/` uses shape-on-demand: which fields appear in a response
 * depends on the `?shape=` query param, so EVERY field is optional regardless
 * of the OpenAPI schema's nominal "required" assertions.
 *
 * Field set mirrors the API `ContractList` schema (`ContractListSerializer`).
 */
export interface Contract {
  key?: string;
  piid?: string | null;
  award_date?: string | null;
  fiscal_year?: number;
  obligated?: number | null;
  base_and_exercised_options_value?: number | null;
  total_contract_value?: number | null;
  naics_code?: number | null;
  psc_code?: string | null;
  set_aside?: string;
  solicitation_identifier?: string | null;
  description?: string | null;
  awarding_office?: OrganizationOfficePayload;
  funding_office?: OrganizationOfficePayload;
  recipient?: EntityBasic;
  parent_award?: ParentAwardReference;
  legislative_mandates?: LegislativeMandates;
  place_of_performance?: PlaceOfPerformance;
  subawards_summary?: SubawardsSummary;

  /** @deprecated Never returned by the API; removed in v2.0.0. */
  id?: string;
  /** @deprecated Never returned by the API; removed in v2.0.0. */
  award_id?: string;
  /** @deprecated Never returned by the API. Use `recipient.display_name`. Removed in v2.0.0. */
  recipient_name?: string;
  /** @deprecated Never returned by the API. Use `obligated` / `total_contract_value`. Removed in v2.0.0. */
  award_amount?: string | null;
  /** @deprecated Never returned by the API. Use `awarding_office`. Removed in v2.0.0. */
  awarding_agency?: unknown;
  /** @deprecated Never returned by the API. Use `funding_office`. Removed in v2.0.0. */
  funding_agency?: unknown;
}
