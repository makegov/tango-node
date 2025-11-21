export const DEFAULT_BASE_URL = "https://tango.makegov.com";

export const ShapeConfig = {
  // Default for listContracts()
  CONTRACTS_MINIMAL: "key,piid,award_date,recipient(display_name),description,total_contract_value",

  // Default for listEntities()
  ENTITIES_MINIMAL: "uei,legal_business_name,cage_code,business_types",

  // Default for getEntity()
  ENTITIES_COMPREHENSIVE:
    "uei,legal_business_name,dba_name,cage_code,business_types,primary_naics," +
    "naics_codes,psc_codes,email_address,entity_url,description,capabilities," +
    "keywords,physical_address,mailing_address,federal_obligations," +
    "congressional_district",

  // Default for listForecasts()
  FORECASTS_MINIMAL: "id,title,anticipated_award_date,fiscal_year,naics_code,status",

  // Default for listOpportunities()
  OPPORTUNITIES_MINIMAL: "opportunity_id,title,solicitation_number,response_deadline,active",

  // Default for listNotices()
  NOTICES_MINIMAL: "notice_id,title,solicitation_number,posted_date",

  // Default for listGrants()
  GRANTS_MINIMAL: "grant_id,opportunity_number,title,status(*),agency_code",
} as const;
