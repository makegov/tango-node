import type { OrganizationOfficePayload } from "./Contract.js";

/** One awardee named in an announcement. */
export interface AwardAnnouncementAwardee {
  name?: string | null;
  /** Official releases print no UEI, so this is set only where one was resolved. */
  uei?: string | null;
  location?: string | null;
  /** Whether the release states the awardee is a small business. Generated announcements state neither, so it is `null` on them. */
  small_business?: boolean | null;
}

/**
 * Award announcement (`/api/news/award_announcements/`) from one of two sources, named on every row by `source`.
 *
 * `official_release` rows are the awards of $7.5 million or more that the Department of War publishes in its daily contracts release, with the text as published.
 *
 * `makegov_generated` rows cover new civilian IDVs of $25 million or more and every new OTA and OT IDV. They are written by MakeGov from FPDS data with a language model and are not government text.
 *
 * The endpoint uses shape-on-demand: which fields appear depends on the `?shape=` query param, so EVERY field is optional.
 *
 * Date fields are typed as the API's ISO strings; a shaped response from the client parses them to `Date` and normalizes decimals to strings.
 */
export interface AwardAnnouncement {
  uuid?: string;
  /** `official_release` or `makegov_generated`. */
  source?: string | null;
  source_name?: string | null;
  /** Link to the published release. `null` on a generated announcement. */
  source_url?: string | null;
  source_record_id?: string | null;
  published_date?: string | null;
  award_date?: string | null;
  title?: string | null;
  /** The announcement's text. A paragraph can pass 16,000 characters, so a list carries it only when named in `shape`. */
  text?: string | null;
  /** The announced dollar figure. Read it with `value_kind`: figures of different kinds are not comparable. */
  amount?: string | null;
  /** What `amount` is, e.g. `face_value`, `ceiling`, `combined_ceiling`, `estimated_value`, `modification_value`, `cumulative_face_value` or `unknown`. */
  value_kind?: string | null;
  obligated_at_award?: string | null;
  /** What the announcement announces, e.g. `new_award`, `modification`, `option_exercise`, `order`, `correction` or `unknown`. */
  action_type?: string | null;
  announcement_type?: string | null;
  award_kind?: string | null;
  awardee_count?: number | null;
  /** Contract numbers named in the announcement, reduced to upper-case letters and digits. */
  piids?: string[] | null;
  award_uuids?: string[] | null;
  /** Announces a civilian award. */
  civilian?: boolean | null;
  /** The section header of the official release as printed, e.g. `NAVY`. `null` on a generated announcement. */
  component?: string | null;
  contracting_activity?: string | null;
  /** Announces a modification to an existing contract. */
  is_modification?: boolean | null;
  /** Names more than one awardee. */
  is_multiple_award?: boolean | null;
  /** DoD's published corrections to this announcement, in publish order. */
  corrections?: Array<Record<string, unknown>> | null;
  /** DoD later withdrew the announcement. A list hides it unless `include_withdrawn` is `true`; retrieving it by `uuid` always works. */
  is_withdrawn?: boolean | null;
  /** The awardees. Not in the list default; expand with `awardees(*)`. */
  awardees?: AwardAnnouncementAwardee[] | null;
  /** The awarding organization. Not in the list default; expand with `organization(*)`. */
  organization?: OrganizationOfficePayload | null;
}
