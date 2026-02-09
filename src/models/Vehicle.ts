export interface Vehicle {
  uuid: string;
  solicitation_identifier: string;
  agency_id?: string | null;
  organization_id?: string | null;

  // Choice fields are returned as {code, description} objects when shaped.
  vehicle_type?: Record<string, unknown> | null;
  who_can_use?: Record<string, unknown> | null;
  type_of_idc?: Record<string, unknown> | null;
  contract_type?: Record<string, unknown> | null;

  agency_details?: Record<string, unknown> | null;
  descriptions?: string[] | null;
  fiscal_year?: number | null;

  solicitation_title?: string | null;
  solicitation_description?: string | null;
  solicitation_date?: string | null;
  naics_code?: number | null;
  psc_code?: string | null;
  set_aside?: string | null;

  award_date?: string | null;
  last_date_to_order?: string | null;

  awardee_count?: number | null;
  order_count?: number | null;
  vehicle_obligations?: string | null;
  vehicle_contracts_value?: string | null;
}
