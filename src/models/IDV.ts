import type { FiscalYearObligation } from "./Contract.js";
import { RecipientProfile } from "./RecipientProfile.js";

export interface IDV {
  uuid: string;
  key: string;
  piid?: string | null;
  award_date?: string | null;
  description?: string | null;

  recipient?: RecipientProfile | null;

  /** The API always sends null on an IDV (read as `[]` by the client's shaped response), because an IDV's transactions report a running lifetime total rather than each action's obligation. Accepted in `shape` for parity with contracts. Requires Tango API 5.11.0. */
  obligations_by_fiscal_year?: FiscalYearObligation[] | null;

  // Vehicle membership rollups (present on `/api/vehicles/{uuid}/awardees/`).
  title?: string | null;
  order_count?: number | null;
  idv_obligations?: string | null;
  idv_contracts_value?: string | null;
}
