import { Department } from "./Department.js";
export interface Agency {
  code: string;
  name: string;
  abbreviation?: string | null;
  department?: Department | null;
}
