/** What job a document does inside its solicitation package, as the API labels it. */
export type AttachmentDocRole = "requirement" | "instructions" | "pricing" | "terms" | "reference" | "unknown";

/** One document attached to a federal opportunity or notice (the `attachments(...)` expand). */
export interface OpportunityAttachment {
  attachment_id?: string | null;
  resource_id?: string | null;
  name?: string | null;
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
}
