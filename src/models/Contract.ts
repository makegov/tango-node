import { RecipientProfile } from "./RecipientProfile.js";
import { Agency } from "./Agency.js";
import { Location } from "./Location.js";

export interface Contract {
  id: string;
  award_id: string;
  recipient_name: string;
  description: string;
  award_amount?: string | null;
  award_date?: string | null;
  fiscal_year?: number | null;
  recipient?: RecipientProfile | null;
  awarding_agency?: Agency | null;
  funding_agency?: Agency | null;
  place_of_performance?: Location | null;
}
