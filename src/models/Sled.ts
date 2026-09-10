/**
 * State, local and education (SLED) procurement (`/api/sled/opportunities/`, `/api/sled/forecasts/`).
 *
 * These endpoints use shape-on-demand: which fields appear depends on the `?shape=` query param, so EVERY field is optional.
 *
 * This data does not join to the federal data. There is no UEI, no PIID, no agency-hierarchy key and no NAICS/PSC crosswalk; `organization` here is three strings, not the federal 7-key office payload.
 */

/** The buyer — the government and the body within it. Not the federal office payload: no code resolution and no `organization_id` to join on. */
export interface SledOrganizationPayload {
  state?: string | null;
  /** `state`, `local` or `education`; null where the portal cannot distinguish. */
  level?: string | null;
  agency?: string | null;
}

/** Buyer contact as the portal publishes it. */
export interface SledContactPayload {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

/** Denormalized counts, costing no join. */
export interface SledMetaPayload {
  /**
   * Documents the record holds, EXCLUDING auto-generated portal cover sheets.
   *
   * This can be lower than `attachments.length` — a generated sheet is a file, not a document the agency wrote, so it is listed and flagged `is_generated_summary` but left out of the count. The count answers "does this record hold its solicitation package"; the array answers "what files exist".
   */
  attachment_count?: number | null;
  /** Substantive revisions, excluding `enrichment`. */
  revision_count?: number | null;
  last_revision_kind?: string | null;
  /** Whether the portal's own amendment marker moved at the emission behind `last_change_seen_at`. False means Tango inferred the change by diffing consecutive scrapes, which is the common case. */
  last_change_source_declared?: boolean | null;
}

/**
 * One document a solicitation advertises — metadata and extraction stats, never the body.
 *
 * `size_bytes` and `char_count` only mean something as a pair: 3 MB that yielded no characters is a scan awaiting OCR, 3 MB that yielded 40,000 is a specification, and neither number says that alone.
 */
export interface SledAttachmentPayload {
  name?: string | null;
  extension?: string | null;
  mime_type?: string | null;
  checksum?: string | null;
  /** The stored object's size. NULL means no blob is stored — never 0, which would read as an empty file. */
  size_bytes?: number | null;
  char_count?: number | null;
  word_count?: number | null;
  pages?: number | null;
  /** `completed`, `empty` or `failed`. `empty` is extraction succeeding with zero characters — almost always a scan awaiting OCR, a different problem from one that threw. */
  extraction_status?: string | null;
  download_status?: string | null;
  /** The stored object's checksum disagrees with what this record advertised — another solicitation's bytes under the same key. Served as a name and an existence, never as content. */
  is_contested?: boolean | null;
  /** An auto-generated portal cover sheet rather than a document the agency wrote. Excluded from `meta.attachment_count` and `has_documents`. */
  is_generated_summary?: boolean | null;
  first_seen_at?: string | null;
}

/**
 * One observed change to a solicitation.
 *
 * `observed_at` is the scrape that saw the change, not the date the agency made it — no state portal emits amendment notices, so `kind` is Tango's inference from the diff on about 95% of revisions and `source_declared` is true only where a portal's own amendment marker moved.
 */
export interface SledRevisionPayload {
  observed_at?: string | null;
  /** 1-based within the record; what to page the history by. */
  sequence?: number | null;
  /** `deadline_change`, `status_change`, `documents_added`, `documents_removed`, `documents_replaced`, `title_change`, `content_change` — plus `enrichment` on the nested revisions route only. */
  kind?: string | null;
  changed_fields?: string[] | null;
  /** The per-field before and after. Requires a Small plan or above; the key is absent below it. */
  changes?: Record<string, unknown> | null;
  source_declared?: boolean | null;
}

/** A `{min, max}` display range read off a forecast's free-text award band, with the portal's string kept beside it. */
export interface SledEstimatedValuePayload {
  min?: number | null;
  /** Null when the band names only one number — that is a floor, not an unbounded ceiling. */
  max?: number | null;
  /** The portal's free-text award band, verbatim. Always there to check the parse against. */
  raw?: string | null;
}

/**
 * A state, local or education solicitation.
 *
 * Two behaviors have no federal equivalent.
 *
 * `status` is Tango-derived and refreshed every fifteen minutes. `source_status` is the portal's own word, frozen at last capture, and most of what it calls open already has a passed deadline — so never filter liveness on it.
 *
 * A list request passing neither `status` nor `active` returns open solicitations only, while a detail request returns the solicitation whatever its status.
 */
export interface SledOpportunity {
  opportunity_id?: string;
  solicitation_number?: string | null;
  solicitation_type?: string | null;
  /** Where the type came from: `portal`, `title`, `description` or `none`. About half of type fill is inferred rather than published. */
  solicitation_type_source?: string | null;
  title?: string | null;
  /** Detail-only on the API — median around 550 characters, tail past 120,000. Reach it on a list with `verbose: true` or by naming it in a shape. */
  description?: string | null;
  state?: string | null;
  /** `state`, `local` or `education`; null on aggregator portals that cannot distinguish. */
  jurisdiction?: string | null;
  agency?: string | null;
  /** Tango-derived liveness: `open`, `closed`, `awarded`, `cancelled`, `unknown`. */
  status?: string | null;
  /** Which input decided `status`: `deadline_future`, `deadline_past`, `no_deadline`, `source_terminal`. */
  status_reason?: string | null;
  status_computed_at?: string | null;
  /** The portal's own status word, frozen at last capture. NOT liveness. */
  source_status?: string | null;
  source_url?: string | null;
  posted_date?: string | null;
  response_deadline?: string | null;
  /** The first deadline ever observed, which is what makes a moved deadline legible. */
  response_deadline_original?: string | null;
  bid_opening_date?: string | null;
  bid_opening_raw?: string | null;
  /** `{scheme, code}` entries over `nigp`, `unspsc`, `naics`, `text`, `unknown`. Scheme tagging is mid-migration, so roughly half of all entries carry no scheme. */
  category_codes?: unknown[] | null;
  has_documents?: boolean | null;
  /** When Tango first observed the solicitation. The polling primitive. */
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  /** When Tango OBSERVED the newest substantive change. A scrape date, not an amendment date. */
  last_change_seen_at?: string | null;
  modified?: string | null;
  /** The passage that matched, present only under `search` and only on rows that matched on their description. A title-or-agency match honestly carries none. */
  snippet?: string | null;
  organization?: SledOrganizationPayload | null;
  contact?: SledContactPayload | null;
  meta?: SledMetaPayload | null;
  attachments?: SledAttachmentPayload[] | null;
  revisions?: SledRevisionPayload[] | null;
  /** The platform's unparsed payload. Requires a Small plan or above, and explicitly unstable: its shape varies by portal platform and is not a contract at any plan. */
  raw?: Record<string, unknown> | null;
}

/** One observed change, as served by `/api/sled/opportunities/{opportunity_id}/revisions/`. */
export type SledOpportunityRevision = SledRevisionPayload;

/**
 * A planned state procurement.
 *
 * Forecasts carry no liveness at all: there is no deadline to have passed, so there is no `status` field and no `active` filter. `estimated_advertisement_date` is the START of the published quarter rather than a posting date.
 */
export interface SledForecast {
  forecast_id?: string;
  state?: string | null;
  agency?: string | null;
  title?: string | null;
  description?: string | null;
  /** The start of the published quarter, NOT a posting date. A large share of rows publish no quarter at all. */
  estimated_advertisement_date?: string | null;
  /** The portal's own words, verbatim — e.g. `"Q3 (Jan.-March 2027)"`. */
  estimated_advertisement_raw?: string | null;
  procurement_category?: string | null;
  procurement_method?: string | null;
  contract_term?: string | null;
  contract_number?: string | null;
  /** Incumbent vendor name as published. NOT resolved to a Tango entity. */
  incumbent_name?: string | null;
  mbe_dbe_goal?: string | null;
  delivery_location?: string | null;
  source_url?: string | null;
  source_status?: string | null;
  has_documents?: boolean | null;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  modified?: string | null;
  organization?: SledOrganizationPayload | null;
  contact?: SledContactPayload | null;
  estimated_value?: SledEstimatedValuePayload | null;
  /** Requires a Small plan or above, and unstable. */
  raw?: Record<string, unknown> | null;
}
