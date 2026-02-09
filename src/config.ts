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

  // Default for listIdvs()
  IDVS_MINIMAL: "key,piid,award_date,recipient(display_name,uei),description,total_contract_value,obligated,idv_type",

  // Default for getIdv()
  IDVS_COMPREHENSIVE:
    "key,piid,award_date,description,fiscal_year,total_contract_value,base_and_exercised_options_value,obligated," +
    "idv_type,multiple_or_single_award_idv,type_of_idc,period_of_performance(start_date,last_date_to_order)," +
    "recipient(display_name,legal_business_name,uei,cage_code)," +
    "awarding_office(*),funding_office(*),place_of_performance(*),parent_award(key,piid)," +
    "competition(*),legislative_mandates(*),transactions(*),subawards_summary(*)",

  // Default for listVehicles()
  VEHICLES_MINIMAL:
    "uuid,solicitation_identifier,organization_id,awardee_count,order_count," +
    "vehicle_obligations,vehicle_contracts_value,solicitation_title,solicitation_date",

  // Default for getVehicle()
  VEHICLES_COMPREHENSIVE:
    "uuid,solicitation_identifier,agency_id,organization_id,vehicle_type,who_can_use," +
    "solicitation_title,solicitation_description,solicitation_date,naics_code,psc_code,set_aside," +
    "fiscal_year,award_date,last_date_to_order,awardee_count,order_count,vehicle_obligations,vehicle_contracts_value," +
    "type_of_idc,contract_type,competition_details(*)",

  // Default for listVehicleAwardees()
  VEHICLE_AWARDEES_MINIMAL: "uuid,key,piid,award_date,title,order_count,idv_obligations,idv_contracts_value,recipient(display_name,uei)",
} as const;
