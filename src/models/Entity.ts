import { Location } from "./Location.js";

/**
 * Minimal entity reference returned in nested contexts (e.g. a contract's
 * `recipient`). Mirrors the API `EntityBasic` schema.
 */
export interface EntityBasic {
  uei?: string;
  display_name?: string;
}

export interface Entity {
  key: string;
  display_name: string;
  uei?: string | null;
  cage_code?: string | null;
  legal_business_name?: string | null;
  business_types?: string[] | null;
  physical_address?: Location | null;
}
