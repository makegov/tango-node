/**
 * Federal Register document (`/api/federal_register/`): a rule, proposed rule, notice or presidential document published since 1994.
 *
 * The endpoint uses shape-on-demand: which fields appear depends on the `?shape=` query param, so EVERY field is optional.
 *
 * A document is identified by `uuid`. `document_number` is not unique on its own: the Federal Register reused some numbers before 2016.
 *
 * `agencies`, `cfr_references`, `dockets` and `topics` are the Federal Register's own structures, served as published. `agencies` carries Federal Register agency slugs, not Tango organization keys.
 *
 * Date fields are typed as the API's ISO strings; a shaped response from the client parses them to `Date`.
 */
export interface FederalRegisterDocument {
  uuid?: string;
  document_number?: string | null;
  publication_date?: string | null;
  citation?: string | null;
  title?: string | null;
  /** `Notice`, `Rule`, `Proposed Rule`, `Presidential Document`, `Correction`, `Sunshine Act Document` or `Uncategorized Document`. Documents published before 2008 are mostly `Uncategorized Document`. */
  type?: string | null;
  subtype?: string | null;
  abstract?: string | null;
  action?: string | null;
  dates?: string | null;
  comments_close_on?: string | null;
  effective_on?: string | null;
  signing_date?: string | null;
  start_page?: number | null;
  end_page?: number | null;
  page_length?: number | null;
  volume?: number | null;
  /** Significant under Executive Order 12866. */
  significant?: boolean | null;
  toc_doc?: string | null;
  toc_subject?: string | null;
  correction_of?: string | null;
  corrections?: string[] | null;
  disposition_notes?: string | null;
  executive_order_notes?: string | null;
  executive_order_number?: string | null;
  presidential_document_number?: string | null;
  proclamation_number?: string | null;
  not_received_for_publication?: string | null;
  comment_url?: string | null;
  regulations_dot_gov_url?: string | null;
  html_url?: string | null;
  body_html_url?: string | null;
  pdf_url?: string | null;
  public_inspection_pdf_url?: string | null;
  raw_text_url?: string | null;
  agencies?: Array<Record<string, unknown>> | null;
  cfr_references?: Array<Record<string, unknown>> | null;
  dockets?: Array<Record<string, unknown>> | null;
  docket_ids?: string[] | null;
  topics?: string[] | null;
  regulation_id_numbers?: string[] | null;
  regulation_id_number_info?: Record<string, unknown> | null;
  regulations_dot_gov_info?: Record<string, unknown> | null;
  /** The document's plain text. Served by `getFederalRegisterDocument()` only, and only when named in `shape`; it can run to several MB. */
  full_text?: string | null;
}
