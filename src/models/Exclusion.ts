/**
 * SAM.gov exclusion (debarment) record (`/api/exclusions/`).
 *
 * The endpoint uses shape-on-demand: which fields appear depends on the
 * `?shape=` query param, so EVERY field is optional.
 *
 * `is_currently_excluded` is derived at query time from the
 * activate/termination dates — use the `active` filter to select on it.
 */
export interface Exclusion {
  exclusion_key?: string;
  classification_type?: string | null;
  exclusion_type?: string | null;
  exclusion_program?: string | null;
  display_name?: string | null;
  entity_name?: string | null;
  entity_uei?: string | null;
  uei?: string | null;
  cage_code?: string | null;
  npi?: string | null;
  ct_code?: string | null;
  prefix?: string | null;
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  suffix?: string | null;
  excluding_agency_code?: string | null;
  excluding_agency_name?: string | null;
  activate_date?: string | null;
  termination_date?: string | null;
  termination_type?: string | null;
  create_date?: string | null;
  update_date?: string | null;
  delisted_at?: string | null;
  is_currently_excluded?: boolean | null;
  is_fascsa_order?: boolean | null;
  additional_comments?: string | null;
  evs_investigation_status?: string | null;
  dnb_open_data?: string | null;
  primary_address?: Record<string, unknown> | null;
  secondary_address?: Record<string, unknown> | null;
  more_locations?: unknown;
  references?: unknown;
  vessel_call_sign?: string | null;
  vessel_flag?: string | null;
  vessel_grt?: string | null;
  vessel_owner?: string | null;
  vessel_tonnage?: string | null;
  vessel_type?: string | null;
}
