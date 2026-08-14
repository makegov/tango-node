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
  DIBBS_RFQ_SCHEMA,
  DIBBS_RFP_SCHEMA,
  DIBBS_AWARD_SCHEMA,
  EXCLUSION_SCHEMA,
  SBIR_TOPIC_SCHEMA,
  SBIR_SOLICITATION_SCHEMA,
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

  it("SUBAWARD_SCHEMA matches the server's SubawardSerializer", () => {
    // 4 core identifiers + 10 denormalized lookup fields + 8 expandable objects
    expect(Object.keys(SUBAWARD_SCHEMA)).toHaveLength(22);

    // Fields the previous (incorrect) port declared but the server has never
    // exposed — guard against regressions to the broken shape.
    expect(SUBAWARD_SCHEMA.id).toBeUndefined();
    expect(SUBAWARD_SCHEMA.amount).toBeUndefined();

    // Core identifiers from the canonical serializer.
    expect(SUBAWARD_SCHEMA.key).toBeDefined();
    expect(SUBAWARD_SCHEMA.award_key).toBeDefined();
    expect(SUBAWARD_SCHEMA.piid).toBeDefined();
    expect(SUBAWARD_SCHEMA.piid.type).toBe("str");
    expect(SUBAWARD_SCHEMA.usaspending_permalink.type).toBe("str");

    // Denormalized lookup fields (sampled).
    expect(SUBAWARD_SCHEMA.prime_awardee_uei.type).toBe("str");
    expect(SUBAWARD_SCHEMA.recipient_uei.type).toBe("str");
    expect(SUBAWARD_SCHEMA.recipient_business_types.isList).toBe(true);

    // Expandable nested objects.
    expect(SUBAWARD_SCHEMA.prime_recipient.nestedModel).toBe("RecipientProfile");
    expect(SUBAWARD_SCHEMA.subaward_recipient.nestedModel).toBe("RecipientProfile");
    expect(SUBAWARD_SCHEMA.awarding_office.nestedModel).toBe("AwardOffice");
    expect(SUBAWARD_SCHEMA.funding_office.nestedModel).toBe("AwardOffice");
    expect(SUBAWARD_SCHEMA.place_of_performance.nestedModel).toBe(
      "SubawardPlaceOfPerformance",
    );
    expect(SUBAWARD_SCHEMA.subaward_details.nestedModel).toBe("SubawardDetails");
    expect(SUBAWARD_SCHEMA.fsrs_details.nestedModel).toBe("FsrsDetails");
    expect(SUBAWARD_SCHEMA.highly_compensated_officers.isList).toBe(true);
    expect(SUBAWARD_SCHEMA.highly_compensated_officers.nestedModel).toBe(
      "HighlyCompensatedOfficer",
    );
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

describe("DIBBS / exclusions / SBIR explicit schemas — parity with Python SDK", () => {
  it("DIBBS_RFQ_SCHEMA covers the contract's 16 shape nodes with a nested organization", () => {
    expect(Object.keys(DIBBS_RFQ_SCHEMA)).toHaveLength(16);
    expect(DIBBS_RFQ_SCHEMA.uuid).toBeDefined();
    expect(DIBBS_RFQ_SCHEMA.quantity.type).toBe("int");
    expect(DIBBS_RFQ_SCHEMA.return_by_date.type).toBe("date");
    expect(DIBBS_RFQ_SCHEMA.is_open.type).toBe("bool");
    expect(DIBBS_RFQ_SCHEMA.organization.nestedModel).toBe("DibbsOrganization");
  });

  it("DIBBS_RFP_SCHEMA covers the contract's 12 shape nodes", () => {
    expect(Object.keys(DIBBS_RFP_SCHEMA)).toHaveLength(12);
    expect(DIBBS_RFP_SCHEMA.buyer_code).toBeDefined();
    expect(DIBBS_RFP_SCHEMA.closes_date.type).toBe("date");
    expect(DIBBS_RFP_SCHEMA.tech_docs_url).toBeDefined();
    expect(DIBBS_RFP_SCHEMA.organization.nestedModel).toBe("DibbsOrganization");
  });

  it("DIBBS_AWARD_SCHEMA covers the contract's 17 shape nodes with awardee + organization", () => {
    expect(Object.keys(DIBBS_AWARD_SCHEMA)).toHaveLength(17);
    expect(DIBBS_AWARD_SCHEMA.total_contract_price.type).toBe("Decimal");
    expect(DIBBS_AWARD_SCHEMA.delivery_order_counter.type).toBe("int");
    expect(DIBBS_AWARD_SCHEMA.awardee.nestedModel).toBe("DibbsAwardee");
    expect(DIBBS_AWARD_SCHEMA.organization.nestedModel).toBe("DibbsOrganization");
  });

  it("EXCLUSION_SCHEMA covers the contract's 39 shape fields", () => {
    expect(Object.keys(EXCLUSION_SCHEMA)).toHaveLength(39);
    expect(EXCLUSION_SCHEMA.exclusion_key).toBeDefined();
    expect(EXCLUSION_SCHEMA.is_currently_excluded.type).toBe("bool");
    expect(EXCLUSION_SCHEMA.is_fascsa_order.type).toBe("bool");
    expect(EXCLUSION_SCHEMA.activate_date.type).toBe("date");
    expect(EXCLUSION_SCHEMA.primary_address.type).toBe("dict");
    expect(EXCLUSION_SCHEMA.vessel_call_sign).toBeDefined();
  });

  it("SBIR_TOPIC_SCHEMA covers the contract's 22 shape nodes with 3 nested expands", () => {
    expect(Object.keys(SBIR_TOPIC_SCHEMA)).toHaveLength(22);
    expect(SBIR_TOPIC_SCHEMA.topic_id).toBeDefined();
    expect(SBIR_TOPIC_SCHEMA.listed_open.type).toBe("bool");
    expect(SBIR_TOPIC_SCHEMA.solicitation.nestedModel).toBe("SbirTopicSolicitationRef");
    expect(SBIR_TOPIC_SCHEMA.opportunity.nestedModel).toBe("SbirTopicOpportunityRef");
    expect(SBIR_TOPIC_SCHEMA.grant.nestedModel).toBe("SbirTopicGrantRef");
  });

  it("SBIR_SOLICITATION_SCHEMA covers the contract's 17 shape nodes with list expands", () => {
    expect(Object.keys(SBIR_SOLICITATION_SCHEMA)).toHaveLength(17);
    expect(SBIR_SOLICITATION_SCHEMA.solicitation_id).toBeDefined();
    expect(SBIR_SOLICITATION_SCHEMA.out_of_cycle.type).toBe("bool");
    expect(SBIR_SOLICITATION_SCHEMA.topics.isList).toBe(true);
    expect(SBIR_SOLICITATION_SCHEMA.topics.nestedModel).toBe("SbirSolicitationTopicRef");
    expect(SBIR_SOLICITATION_SCHEMA.documents.isList).toBe(true);
    expect(SBIR_SOLICITATION_SCHEMA.documents.nestedModel).toBe("SbirSolicitationDocument");
  });

  it("EXPLICIT_SCHEMAS registers the six resources and their nested refs", () => {
    expect(EXPLICIT_SCHEMAS.DibbsRfq).toBe(DIBBS_RFQ_SCHEMA);
    expect(EXPLICIT_SCHEMAS.DibbsRfp).toBe(DIBBS_RFP_SCHEMA);
    expect(EXPLICIT_SCHEMAS.DibbsAward).toBe(DIBBS_AWARD_SCHEMA);
    expect(EXPLICIT_SCHEMAS.Exclusion).toBe(EXCLUSION_SCHEMA);
    expect(EXPLICIT_SCHEMAS.SbirTopic).toBe(SBIR_TOPIC_SCHEMA);
    expect(EXPLICIT_SCHEMAS.SbirSolicitation).toBe(SBIR_SOLICITATION_SCHEMA);
    expect(EXPLICIT_SCHEMAS.DibbsOrganization).toBeDefined();
    expect(EXPLICIT_SCHEMAS.DibbsAwardee).toBeDefined();
    expect(EXPLICIT_SCHEMAS.SbirTopicGrantRef).toBeDefined();
    expect(EXPLICIT_SCHEMAS.SbirTopicOpportunityRef).toBeDefined();
    expect(EXPLICIT_SCHEMAS.SbirTopicSolicitationRef).toBeDefined();
    expect(EXPLICIT_SCHEMAS.SbirSolicitationDocument).toBeDefined();
    expect(EXPLICIT_SCHEMAS.SbirSolicitationTopicRef).toBeDefined();
  });
});
