export interface Forecast {
  id: number;
  title: string;
  description?: string | null;
  anticipated_award_date?: string | null;
  fiscal_year?: number | null;
  naics_code?: string | null;
  status?: string | null;
  is_active?: boolean | null;
  agency?: string | null;
}
