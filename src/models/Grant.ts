export interface Grant {
  grant_id: number;
  opportunity_number: string;
  title: string;
  agency_code?: string | null;
  status?: string | null;
  description?: string | null;
  last_updated?: string | null;
}
