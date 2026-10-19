import type { OpportunityAttachment } from "./Opportunity.js";

export interface Notice {
  notice_id: string;
  title: string;
  solicitation_number?: string | null;
  description?: string | null;
  posted_date?: string | null;
  naics_code?: string | null;
  /** Every attachment on the notice, links included. */
  attachment_count?: number | null;
  /** Attachments whose `type` is `file`. An attachment of any other type counts only in `attachment_count`, so `file_count + link_count` need not equal it. Null until the notice has been counted: read null as unknown, not zero. Requires Tango API 5.9.0. */
  file_count?: number | null;
  /** Attachments whose `type` is `link`. Null until the notice has been counted. Requires Tango API 5.9.0. */
  link_count?: number | null;
  attachments?: OpportunityAttachment[] | null;
}
