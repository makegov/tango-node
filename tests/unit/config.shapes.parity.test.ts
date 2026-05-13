import { describe, it, expect } from "vitest";
import { ShapeConfig } from "../../src/config.js";

/**
 * Parity tests for ShapeConfig presets vs the Python SDK
 * (tango-python's tango/models.py::ShapeConfig).
 *
 * These presets are part of the SDK contract — keep both SDKs in sync.
 */

describe("ShapeConfig parity with Python SDK", () => {
  describe("new presets are exported as non-empty strings", () => {
    const newKeys = [
      "PROTESTS_MINIMAL",
      "OTAS_MINIMAL",
      "OTIDVS_MINIMAL",
      "SUBAWARDS_MINIMAL",
      "GSA_ELIBRARY_CONTRACTS_MINIMAL",
      "ORGANIZATIONS_MINIMAL",
      "VEHICLE_ORDERS_MINIMAL",
      "ITDASHBOARD_INVESTMENTS_MINIMAL",
      "ITDASHBOARD_INVESTMENTS_COMPREHENSIVE",
    ] as const;

    it.each(newKeys)("%s is exported and non-empty", (key) => {
      const value = (ShapeConfig as Record<string, string>)[key];
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    });
  });

  it("PROTESTS_MINIMAL matches Python", () => {
    expect(ShapeConfig.PROTESTS_MINIMAL).toBe(
      "case_id,case_number,title,source_system,outcome,filed_date",
    );
  });

  it("OTAS_MINIMAL matches Python", () => {
    expect(ShapeConfig.OTAS_MINIMAL).toBe(
      "key,piid,award_date,recipient(display_name,uei),description,total_contract_value,obligated",
    );
  });

  it("OTIDVS_MINIMAL matches Python", () => {
    expect(ShapeConfig.OTIDVS_MINIMAL).toBe(
      "key,piid,award_date,recipient(display_name,uei),description,total_contract_value,obligated,idv_type",
    );
  });

  it("SUBAWARDS_MINIMAL matches Python", () => {
    expect(ShapeConfig.SUBAWARDS_MINIMAL).toBe(
      "award_key,prime_recipient(uei,display_name),subaward_recipient(uei,display_name)",
    );
  });

  it("GSA_ELIBRARY_CONTRACTS_MINIMAL matches Python", () => {
    expect(ShapeConfig.GSA_ELIBRARY_CONTRACTS_MINIMAL).toBe(
      "uuid,contract_number,schedule,recipient(display_name,uei),idv(key,award_date)",
    );
  });

  it("ORGANIZATIONS_MINIMAL matches Python", () => {
    expect(ShapeConfig.ORGANIZATIONS_MINIMAL).toBe(
      "key,fh_key,name,level,type,short_name",
    );
  });

  it("VEHICLE_ORDERS_MINIMAL matches Python", () => {
    expect(ShapeConfig.VEHICLE_ORDERS_MINIMAL).toBe(
      "key,piid,award_date,obligated,total_contract_value,description,recipient(display_name,uei)",
    );
  });

  it("ITDASHBOARD_INVESTMENTS_MINIMAL matches Python", () => {
    expect(ShapeConfig.ITDASHBOARD_INVESTMENTS_MINIMAL).toBe(
      "uii,agency_name,bureau_name,investment_title," +
        "type_of_investment,part_of_it_portfolio,updated_time,url",
    );
  });

  it("ITDASHBOARD_INVESTMENTS_COMPREHENSIVE matches Python", () => {
    expect(ShapeConfig.ITDASHBOARD_INVESTMENTS_COMPREHENSIVE).toBe(
      "uii,agency_code,agency_name,bureau_code,bureau_name," +
        "investment_title,type_of_investment,part_of_it_portfolio," +
        "updated_time,url",
    );
  });

  describe("existing presets corrected to match Python", () => {
    it("ENTITIES_COMPREHENSIVE includes the federal_obligations(*) expansion", () => {
      expect(ShapeConfig.ENTITIES_COMPREHENSIVE).toContain("federal_obligations(*)");
    });

    it("ENTITIES_COMPREHENSIVE matches Python", () => {
      const expected =
        "uei,legal_business_name,dba_name,cage_code," +
        "business_types,primary_naics,naics_codes,psc_codes," +
        "email_address,entity_url,description,capabilities,keywords," +
        "physical_address,mailing_address," +
        "federal_obligations(*),congressional_district";
      expect(ShapeConfig.ENTITIES_COMPREHENSIVE).toBe(expected);
    });

    it("VEHICLES_MINIMAL matches Python", () => {
      const expected =
        "uuid,solicitation_identifier,is_synthetic_solicitation,program_acronym," +
        "organization_id,organization,vehicle_type,description," +
        "idv_count,awardee_count,order_count,total_obligated," +
        "vehicle_obligations,vehicle_contracts_value,latest_award_date," +
        "solicitation_title,solicitation_date";
      expect(ShapeConfig.VEHICLES_MINIMAL).toBe(expected);
    });

    it("VEHICLES_COMPREHENSIVE drops competition_details(*) and matches Python", () => {
      // competition_details was removed from the Vehicle shape in v0.6.0.
      expect(ShapeConfig.VEHICLES_COMPREHENSIVE).not.toContain("competition_details");

      const expected =
        "uuid,solicitation_identifier,is_synthetic_solicitation,agency_id,program_acronym," +
        "organization_id,organization(*),vehicle_type,who_can_use," +
        "solicitation_title,solicitation_description,solicitation_date,opportunity_id," +
        "naics_code,psc_code,set_aside," +
        "fiscal_year,award_date,latest_award_date,last_date_to_order," +
        "description,idv_count,awardee_count,order_count,total_obligated," +
        "vehicle_obligations,vehicle_contracts_value," +
        "type_of_idc,contract_type,metrics(*)";
      expect(ShapeConfig.VEHICLES_COMPREHENSIVE).toBe(expected);
    });
  });
});
