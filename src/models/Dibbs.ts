/**
 * DLA DIBBS records (`/api/dibbs/rfqs/`, `/api/dibbs/rfps/`, `/api/dibbs/awards/`).
 *
 * These endpoints use shape-on-demand: which fields appear depends on the
 * `?shape=` query param, so EVERY field is optional.
 */

/** Buying-organization reference nested under DIBBS records. */
export interface DibbsOrganizationPayload {
  organization_id?: string | null;
  agency_code?: string | null;
  agency_name?: string | null;
  department_code?: string | null;
  department_name?: string | null;
  office_code?: string | null;
  office_name?: string | null;
}

/** Awardee entity reference nested under DIBBS awards. */
export interface DibbsAwardeePayload {
  cage_code?: string | null;
  legal_business_name?: string | null;
  uei?: string | null;
}

/**
 * DLA DIBBS request-for-quote solicitation.
 *
 * `is_open` is derived at query time from `return_by_date`, so it is not
 * filterable as a stored field — use the `open` filter instead.
 */
export interface DibbsRfq {
  uuid?: string;
  solicitation?: string | null;
  solicitation_formatted?: string | null;
  nsn?: string | null;
  part_number?: string | null;
  nomenclature?: string | null;
  purchase_request?: string | null;
  quantity?: number | null;
  unit_of_issue?: string | null;
  issue_date?: string | null;
  return_by_date?: string | null;
  status_code?: string | null;
  set_aside?: string | null;
  is_open?: boolean | null;
  document_url?: string | null;
  organization?: DibbsOrganizationPayload | null;
}

/**
 * DLA DIBBS request-for-proposal solicitation.
 *
 * `is_open` is derived at query time from `closes_date` — use the `open`
 * filter to select on it.
 */
export interface DibbsRfp {
  uuid?: string;
  solicitation?: string | null;
  nsn?: string | null;
  part_number?: string | null;
  nomenclature?: string | null;
  buyer_code?: string | null;
  issued_date?: string | null;
  closes_date?: string | null;
  is_open?: boolean | null;
  document_url?: string | null;
  tech_docs_url?: string | null;
  organization?: DibbsOrganizationPayload | null;
}

/**
 * DLA DIBBS award.
 *
 * WARNING: `total_contract_price` is the *order* total repeated on every line
 * item of the award — never sum it across rows, or you will multiply the
 * value by the line-item count.
 */
export interface DibbsAward {
  uuid?: string;
  award_number?: string | null;
  delivery_order_number?: string | null;
  delivery_order_counter?: number | null;
  solicitation?: string | null;
  purchase_request?: string | null;
  nsn?: string | null;
  part_number?: string | null;
  nomenclature?: string | null;
  awardee_cage?: string | null;
  award_date?: string | null;
  posted_date?: string | null;
  last_mod_posting_date?: string | null;
  total_contract_price?: string | null;
  total_contract_price_text?: string | null;
  awardee?: DibbsAwardeePayload | null;
  organization?: DibbsOrganizationPayload | null;
}
