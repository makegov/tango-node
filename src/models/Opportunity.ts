export interface Opportunity {
  opportunity_id: string;
  title: string;
  solicitation_number?: string | null;
  description?: string | null;
  response_deadline?: string | null;
  active?: boolean | null;
  naics_code?: string | null;
  psc_code?: string | null;
}
