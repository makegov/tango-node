import { describe, it, expect } from "vitest";
import {
  ORGANIZATION_SCHEMA,
  OTA_SCHEMA,
  OTIDV_SCHEMA,
  SUBAWARD_SCHEMA,
  PROTEST_SCHEMA,
  PROTEST_DOCKET_SCHEMA,
  GSA_ELIBRARY_CONTRACT_SCHEMA,
  GSA_ELIBRARY_IDV_REF_SCHEMA,
  ITDASHBOARD_INVESTMENT_SCHEMA,
  VEHICLE_METRICS_SCHEMA,
  ORGANIZATION_OFFICE_SCHEMA,
  EXPLICIT_SCHEMAS,
} from "../../src/shapes/explicitSchemas.js";

/**
 * Parity tests for the explicit field schemas ported from the Python SDK
 * (tango-python's tango/shapes/explicit_schemas.py).
 *
 * For each schema we assert:
 *   1. It is exported (covered implicitly by import resolution).
 *   2. Field count matches the Python source.
 *   3. A representative set of 3-5 fields is present.
 */

describe("Ported explicit schemas — parity with Python SDK", () => {
  it("ORGANIZATION_SCHEMA has 6 fields and the expected canonical names", () => {
    expect(Object.keys(ORGANIZATION_SCHEMA)).toHaveLength(6);
    expect(ORGANIZATION_SCHEMA.key).toBeDefined();
    expect(ORGANIZATION_SCHEMA.fh_key).toBeDefined();
    expect(ORGANIZATION_SCHEMA.name).toBeDefined();
    expect(ORGANIZATION_SCHEMA.short_name).toBeDefined();
    expect(ORGANIZATION_SCHEMA.level).toBeDefined();
    expect(ORGANIZATION_SCHEMA.fh_key.isOptional).toBe(false);
    expect(ORGANIZATION_SCHEMA.level.type).toBe("int");
  });

  it("OTA_SCHEMA has 7 fields including recipient expansion", () => {
    expect(Object.keys(OTA_SCHEMA)).toHaveLength(7);
    expect(OTA_SCHEMA.key.isOptional).toBe(false);
    expect(OTA_SCHEMA.piid).toBeDefined();
    expect(OTA_SCHEMA.total_contract_value.type).toBe("Decimal");
    expect(OTA_SCHEMA.obligated.type).toBe("Decimal");
    expect(OTA_SCHEMA.recipient.nestedModel).toBe("RecipientProfile");
  });

  it("OTIDV_SCHEMA has 8 fields including idv_type and recipient", () => {
    expect(Object.keys(OTIDV_SCHEMA)).toHaveLength(8);
    expect(OTIDV_SCHEMA.key.isOptional).toBe(false);
    expect(OTIDV_SCHEMA.idv_type).toBeDefined();
    expect(OTIDV_SCHEMA.idv_type.type).toBe("dict");
    expect(OTIDV_SCHEMA.recipient.nestedModel).toBe("RecipientProfile");
    expect(OTIDV_SCHEMA.award_date.type).toBe("date");
  });

  it("SUBAWARD_SCHEMA has 5 fields with prime and subaward recipients", () => {
    expect(Object.keys(SUBAWARD_SCHEMA)).toHaveLength(5);
    expect(SUBAWARD_SCHEMA.id).toBeDefined();
    expect(SUBAWARD_SCHEMA.award_key).toBeDefined();
    expect(SUBAWARD_SCHEMA.amount.type).toBe("Decimal");
    expect(SUBAWARD_SCHEMA.prime_recipient.nestedModel).toBe("RecipientProfile");
    expect(SUBAWARD_SCHEMA.subaward_recipient.nestedModel).toBe("RecipientProfile");
  });

  it("PROTEST_SCHEMA has 18 fields including dockets and organization expansions", () => {
    expect(Object.keys(PROTEST_SCHEMA)).toHaveLength(18);
    expect(PROTEST_SCHEMA.case_id.isOptional).toBe(false);
    expect(PROTEST_SCHEMA.title).toBeDefined();
    expect(PROTEST_SCHEMA.filed_date.type).toBe("datetime");
    expect(PROTEST_SCHEMA.dockets.isList).toBe(true);
    expect(PROTEST_SCHEMA.dockets.nestedModel).toBe("ProtestDocket");
    expect(PROTEST_SCHEMA.organization.nestedModel).toBe("OrganizationOffice");
  });

  it("PROTEST_DOCKET_SCHEMA has 16 fields", () => {
    expect(Object.keys(PROTEST_DOCKET_SCHEMA)).toHaveLength(16);
    expect(PROTEST_DOCKET_SCHEMA.docket_number).toBeDefined();
    expect(PROTEST_DOCKET_SCHEMA.case_number).toBeDefined();
    expect(PROTEST_DOCKET_SCHEMA.filed_date.type).toBe("datetime");
    expect(PROTEST_DOCKET_SCHEMA.docket_url.type).toBe("str");
    expect(PROTEST_DOCKET_SCHEMA.digest).toBeDefined();
  });

  it("GSA_ELIBRARY_CONTRACT_SCHEMA has 9 fields with idv ref and recipient expansions", () => {
    expect(Object.keys(GSA_ELIBRARY_CONTRACT_SCHEMA)).toHaveLength(9);
    expect(GSA_ELIBRARY_CONTRACT_SCHEMA.uuid.isOptional).toBe(false);
    expect(GSA_ELIBRARY_CONTRACT_SCHEMA.contract_number).toBeDefined();
    expect(GSA_ELIBRARY_CONTRACT_SCHEMA.schedule.type).toBe("str");
    expect(GSA_ELIBRARY_CONTRACT_SCHEMA.idv.nestedModel).toBe("GsaElibraryIdvRef");
    expect(GSA_ELIBRARY_CONTRACT_SCHEMA.recipient.nestedModel).toBe("RecipientProfile");
  });

  it("GSA_ELIBRARY_IDV_REF_SCHEMA has 2 fields (key + award_date)", () => {
    expect(Object.keys(GSA_ELIBRARY_IDV_REF_SCHEMA)).toHaveLength(2);
    expect(GSA_ELIBRARY_IDV_REF_SCHEMA.key).toBeDefined();
    expect(GSA_ELIBRARY_IDV_REF_SCHEMA.award_date.type).toBe("date");
  });

  it("ITDASHBOARD_INVESTMENT_SCHEMA has 22 fields including dynamic expansions", () => {
    expect(Object.keys(ITDASHBOARD_INVESTMENT_SCHEMA)).toHaveLength(22);
    expect(ITDASHBOARD_INVESTMENT_SCHEMA.uii.isOptional).toBe(false);
    expect(ITDASHBOARD_INVESTMENT_SCHEMA.investment_title).toBeDefined();
    expect(ITDASHBOARD_INVESTMENT_SCHEMA.updated_time.type).toBe("datetime");
    expect(ITDASHBOARD_INVESTMENT_SCHEMA.cio_evaluation.isList).toBe(true);
    expect(ITDASHBOARD_INVESTMENT_SCHEMA.organization.nestedModel).toBe(
      "OrganizationOffice",
    );
  });

  it("VEHICLE_METRICS_SCHEMA has 12 numeric fields", () => {
    expect(Object.keys(VEHICLE_METRICS_SCHEMA)).toHaveLength(12);
    expect(VEHICLE_METRICS_SCHEMA.avg_offers_received.type).toBe("float");
    expect(VEHICLE_METRICS_SCHEMA.award_concentration_hhi.type).toBe("float");
    expect(VEHICLE_METRICS_SCHEMA.using_agency_count.type).toBe("int");
    expect(VEHICLE_METRICS_SCHEMA.recent_orders_24mo.type).toBe("int");
    expect(VEHICLE_METRICS_SCHEMA.obligation_to_ceiling_ratio.type).toBe("float");
  });

  it("ORGANIZATION_OFFICE_SCHEMA has 7 fields", () => {
    expect(Object.keys(ORGANIZATION_OFFICE_SCHEMA)).toHaveLength(7);
    expect(ORGANIZATION_OFFICE_SCHEMA.organization_id).toBeDefined();
    expect(ORGANIZATION_OFFICE_SCHEMA.office_code).toBeDefined();
    expect(ORGANIZATION_OFFICE_SCHEMA.office_name).toBeDefined();
    expect(ORGANIZATION_OFFICE_SCHEMA.agency_code).toBeDefined();
    expect(ORGANIZATION_OFFICE_SCHEMA.department_name).toBeDefined();
  });

  it("EXPLICIT_SCHEMAS registers the newly ported schemas under the canonical model names", () => {
    expect(EXPLICIT_SCHEMAS.Organization).toBe(ORGANIZATION_SCHEMA);
    expect(EXPLICIT_SCHEMAS.OTA).toBe(OTA_SCHEMA);
    expect(EXPLICIT_SCHEMAS.OTIDV).toBe(OTIDV_SCHEMA);
    expect(EXPLICIT_SCHEMAS.Subaward).toBe(SUBAWARD_SCHEMA);
    expect(EXPLICIT_SCHEMAS.Protest).toBe(PROTEST_SCHEMA);
    expect(EXPLICIT_SCHEMAS.ProtestDocket).toBe(PROTEST_DOCKET_SCHEMA);
    expect(EXPLICIT_SCHEMAS.GsaElibraryContract).toBe(GSA_ELIBRARY_CONTRACT_SCHEMA);
    expect(EXPLICIT_SCHEMAS.GsaElibraryIdvRef).toBe(GSA_ELIBRARY_IDV_REF_SCHEMA);
    expect(EXPLICIT_SCHEMAS.ITDashboardInvestment).toBe(ITDASHBOARD_INVESTMENT_SCHEMA);
    expect(EXPLICIT_SCHEMAS.VehicleMetrics).toBe(VEHICLE_METRICS_SCHEMA);
    expect(EXPLICIT_SCHEMAS.OrganizationOffice).toBe(ORGANIZATION_OFFICE_SCHEMA);
  });
});
