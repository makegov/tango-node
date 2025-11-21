import { Location } from "./Location.js";
export interface Entity {
  key: string;
  display_name: string;
  uei?: string | null;
  cage_code?: string | null;
  legal_business_name?: string | null;
  business_types?: string[] | null;
  physical_address?: Location | null;
}
