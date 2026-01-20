import { RecipientProfile } from "./RecipientProfile.js";

export interface IDV {
  uuid: string;
  key: string;
  piid?: string | null;
  award_date?: string | null;
  description?: string | null;

  recipient?: RecipientProfile | null;

  // Vehicle membership rollups (present on `/api/vehicles/{uuid}/awardees/`).
  title?: string | null;
  order_count?: number | null;
  idv_obligations?: string | null;
  idv_contracts_value?: string | null;
}
