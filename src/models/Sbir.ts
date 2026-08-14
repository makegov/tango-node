/**
 * SBIR/STTR records (`/api/sbir/topics/`, `/api/sbir/solicitations/`).
 *
 * These endpoints use shape-on-demand: which fields appear depends on the
 * `?shape=` query param, so EVERY field is optional.
 */

/**
 * SBIR/STTR topic.
 *
 * `listed_open` reflects the source listing rather than a computed window.
 */
export interface SbirTopic {
  topic_id?: string;
  topic_node_id?: string | number | null;
  topic_number?: string | null;
  title?: string | null;
  description?: string | null;
  agency?: string | null;
  activity?: string | null;
  year?: number | null;
  solicitation_number?: string | null;
  solicitation_status?: string | null;
  release_date?: string | null;
  open_date?: string | null;
  close_date?: string | null;
  due_dates_text?: string | null;
  listed_open?: boolean | null;
  topic_url?: string | null;
  official_solicitation_url?: string | null;
  doc_source?: string | null;
  source_last_updated?: string | null;
  solicitation?: Record<string, unknown> | null;
  opportunity?: Record<string, unknown> | null;
  grant?: Record<string, unknown> | null;
}

/** DoD DSIP SBIR/STTR solicitation. */
export interface SbirSolicitation {
  solicitation_id?: string;
  solicitation_number?: string | null;
  solicitation_cycle_id?: string | null;
  title?: string | null;
  program?: string | null;
  activity?: string | null;
  cycle?: string | null;
  cycle_name?: string | null;
  solicitation_status?: string | null;
  out_of_cycle?: boolean | null;
  year?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  sol_download_url?: string | null;
  source_last_updated?: string | null;
  topics?: Record<string, unknown>[] | null;
  documents?: Record<string, unknown>[] | null;
}
