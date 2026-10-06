/** What job a document does inside its solicitation package, as the API labels it. */
export type AttachmentDocRole = "requirement" | "instructions" | "pricing" | "terms" | "reference" | "unknown";

/** One document attached to a federal opportunity or notice (the `attachments(...)` expand). */
export interface OpportunityAttachment {
  attachment_id?: string | null;
  resource_id?: string | null;
  name?: string | null;
  /** `file` for a document, `link` for a URL the notice lists. Only a file has extracted text. */
  type?: string | null;
  mime_type?: string | null;
  file_size?: number | null;
  posted_date?: string | null;
  url?: string | null;
  extracted_text?: string | null;
  /**
   * The document's role in the package. Requires a Pro plan or above and must be named explicitly — `attachments(*)` does not carry it.
   *
   * The key is absent on attachments that have not been labeled.
   */
  doc_role?: AttachmentDocRole;
  /** The runner-up role, or null when there is none. Same plan gate and naming rule as `doc_role`. */
  doc_role_alt?: AttachmentDocRole | null;
}

/**
 * Counts on an opportunity (the `meta(...)` expand).
 *
 * `files_count` and `links_count` are null until the opportunity has been counted, so read null as unknown, not zero.
 */
export interface OpportunityMeta {
  notices_count?: number | null;
  /** Every attachment across the opportunity's notices, links included. */
  attachments_count?: number | null;
  /** Attachments whose `type` is `file`. An attachment of any other type counts only in `attachments_count`, so `files_count + links_count` need not equal it. Requires Tango API 5.9.0. */
  files_count?: number | null;
  /** Attachments whose `type` is `link`. Requires Tango API 5.9.0. */
  links_count?: number | null;
  notice_type?: Record<string, unknown> | null;
}

export interface Opportunity {
  opportunity_id: string;
  title: string;
  solicitation_number?: string | null;
  description?: string | null;
  response_deadline?: string | null;
  active?: boolean | null;
  naics_code?: string | null;
  psc_code?: string | null;
  attachments?: OpportunityAttachment[] | null;
  meta?: OpportunityMeta | null;
}
