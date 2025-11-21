export interface Notice {
  notice_id: string;
  title: string;
  solicitation_number?: string | null;
  description?: string | null;
  posted_date?: string | null;
  naics_code?: string | null;
}
