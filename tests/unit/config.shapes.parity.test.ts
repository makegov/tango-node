import { describe, it, expect } from "vitest";
import { ShapeConfig } from "../../src/config.js";
import { ShapeParser } from "../../src/shapes/parser.js";
import { SchemaRegistry } from "../../src/shapes/schema.js";

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

  describe("DIBBS / exclusions / SBIR presets (Python v1.3.0)", () => {
    it("DIBBS_RFQS_MINIMAL matches Python", () => {
      expect(ShapeConfig.DIBBS_RFQS_MINIMAL).toBe(
        "uuid,solicitation,nsn,part_number,nomenclature,quantity,issue_date,return_by_date,is_open",
      );
    });

    it("DIBBS_RFPS_MINIMAL matches Python", () => {
      expect(ShapeConfig.DIBBS_RFPS_MINIMAL).toBe(
        "uuid,solicitation,nsn,part_number,nomenclature,issued_date,closes_date,is_open",
      );
    });

    it("DIBBS_AWARDS_MINIMAL matches Python", () => {
      expect(ShapeConfig.DIBBS_AWARDS_MINIMAL).toBe(
        "uuid,award_number,solicitation,nsn,part_number,nomenclature," +
          "awardee_cage,award_date,total_contract_price",
      );
    });

    it("EXCLUSIONS_MINIMAL matches Python", () => {
      expect(ShapeConfig.EXCLUSIONS_MINIMAL).toBe(
        "exclusion_key,display_name,entity_name,uei,classification_type,exclusion_type," +
          "excluding_agency_name,activate_date,termination_date,is_currently_excluded",
      );
    });

    it("SBIR_TOPICS_MINIMAL matches Python", () => {
      expect(ShapeConfig.SBIR_TOPICS_MINIMAL).toBe(
        "topic_id,topic_number,title,agency,activity,year," +
          "solicitation_number,open_date,close_date,listed_open",
      );
    });

    it("SBIR_SOLICITATIONS_MINIMAL matches Python", () => {
      expect(ShapeConfig.SBIR_SOLICITATIONS_MINIMAL).toBe(
        "solicitation_id,solicitation_number,title,program,activity," +
          "cycle_name,solicitation_status,year,start_date,end_date",
      );
    });

    const presetToModel = [
      ["DIBBS_RFQS_MINIMAL", "DibbsRfq"],
      ["DIBBS_RFPS_MINIMAL", "DibbsRfp"],
      ["DIBBS_AWARDS_MINIMAL", "DibbsAward"],
      ["EXCLUSIONS_MINIMAL", "Exclusion"],
      ["SBIR_TOPICS_MINIMAL", "SbirTopic"],
      ["SBIR_SOLICITATIONS_MINIMAL", "SbirSolicitation"],
    ] as const;

    it.each(presetToModel)("%s parses and every field exists on %s", (presetName, modelName) => {
      const parser = new ShapeParser();
      const registry = new SchemaRegistry();
      const shape = (ShapeConfig as Record<string, string>)[presetName];
      const spec = parser.parse(shape);
      const schema = registry.getSchema(modelName);
      for (const field of spec.fields) {
        expect(schema.fields[field.name], `${modelName}.${field.name}`).toBeDefined();
      }
    });
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
