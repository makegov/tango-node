import { describe, it, expect } from "vitest";
import { ShapeConfig } from "../../src/config.js";

describe("ShapeConfig presets", () => {
  it("IDVS_COMPREHENSIVE does not include base_and_exercised_options_value", () => {
    // base_and_exercised_options_value is a Contract field, not an IDV field.
    // Including it causes the API to return 400 Invalid shape on /api/idvs/{key}/.
    expect(ShapeConfig.IDVS_COMPREHENSIVE).not.toContain(
      "base_and_exercised_options_value",
    );
  });

  it("IDVS_COMPREHENSIVE matches the Python SDK's preset field list", () => {
    // Mirror of tango-python's tango/models.py::ShapeConfig.IDVS_COMPREHENSIVE.
    // Keep these in sync — they're part of the SDK contract.
    const expected =
      "key,piid,award_date,description,fiscal_year,total_contract_value,obligated," +
      "idv_type,multiple_or_single_award_idv,type_of_idc,period_of_performance(start_date,last_date_to_order)," +
      "recipient(display_name,legal_business_name,uei,cage)," +
      "awarding_office(*),funding_office(*),place_of_performance(*),parent_award(key,piid)," +
      "competition(*),legislative_mandates(*),transactions(*),subawards_summary(*)";
    expect(ShapeConfig.IDVS_COMPREHENSIVE).toBe(expected);
  });
});
