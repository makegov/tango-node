import { Location } from "./Location.js";
export interface RecipientProfile {
  uei?: string | null;
  cage_code?: string | null;
  display_name?: string | null;
  legal_business_name?: string | null;
  parent_uei?: string | null;
  parent_name?: string | null;
  business_types?: string[] | null;
  location?: Location | null;
}
