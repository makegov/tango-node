export const DEFAULT_BASE_URL = "https://tango.makegov.com";

export const ShapeConfig = {
  // Default for listContracts()
  CONTRACTS_MINIMAL: "key,piid,award_date,recipient(display_name),description,total_contract_value",

  // Default for listEntities()
  ENTITIES_MINIMAL: "uei,legal_business_name,cage_code,business_types",

  // Default for getEntity()
  ENTITIES_COMPREHENSIVE:
    "uei,legal_business_name,dba_name,cage_code," +
    "business_types,primary_naics,naics_codes,psc_codes," +
    "email_address,entity_url,description,capabilities,keywords," +
    "physical_address,mailing_address," +
    "federal_obligations(*),congressional_district",

  // Default for listForecasts()
  FORECASTS_MINIMAL: "id,title,anticipated_award_date,fiscal_year,naics_code,status",

  // Default for listOpportunities()
  OPPORTUNITIES_MINIMAL: "opportunity_id,title,solicitation_number,response_deadline,active",

  // Default for listNotices()
  NOTICES_MINIMAL: "notice_id,title,solicitation_number,posted_date",

  // Default for listProtests()
  PROTESTS_MINIMAL: "case_id,case_number,title,source_system,outcome,filed_date",

  // Default for listGrants()
  GRANTS_MINIMAL: "grant_id,opportunity_number,title,status(*),agency_code",

  // Default for listIdvs()
  IDVS_MINIMAL: "key,piid,award_date,recipient(display_name,uei),description,total_contract_value,obligated,idv_type",

  // Default for getIdv()
  IDVS_COMPREHENSIVE:
    "key,piid,award_date,description,fiscal_year,total_contract_value,obligated," +
    "idv_type,multiple_or_single_award_idv,type_of_idc,period_of_performance(start_date,last_date_to_order)," +
    "recipient(display_name,legal_business_name,uei,cage)," +
    "awarding_office(*),funding_office(*),place_of_performance(*),parent_award(key,piid)," +
    "competition(*),legislative_mandates(*),transactions(*),subawards_summary(*)",

  // Default for listVehicles()
  VEHICLES_MINIMAL:
    "uuid,solicitation_identifier,is_synthetic_solicitation,program_acronym," +
    "organization_id,organization,vehicle_type,description," +
    "idv_count,awardee_count,order_count,total_obligated," +
    "vehicle_obligations,vehicle_contracts_value,latest_award_date," +
    "solicitation_title,solicitation_date",

  // Default for getVehicle()
  VEHICLES_COMPREHENSIVE:
    "uuid,solicitation_identifier,is_synthetic_solicitation,agency_id,program_acronym," +
    "organization_id,organization(*),vehicle_type,who_can_use," +
    "solicitation_title,solicitation_description,solicitation_date,opportunity_id," +
    "naics_code,psc_code,set_aside," +
    "fiscal_year,award_date,latest_award_date,last_date_to_order," +
    "description,idv_count,awardee_count,order_count,total_obligated," +
    "vehicle_obligations,vehicle_contracts_value," +
    "type_of_idc,contract_type,metrics(*)",

  // Default for listVehicleAwardees()
  VEHICLE_AWARDEES_MINIMAL: "uuid,key,piid,award_date,title,order_count,idv_obligations,idv_contracts_value,recipient(display_name,uei)",

  // Default for listVehicleOrders()
  VEHICLE_ORDERS_MINIMAL:
    "key,piid,award_date,obligated,total_contract_value,description,recipient(display_name,uei)",

  // Default for listOrganizations()
  ORGANIZATIONS_MINIMAL: "key,fh_key,name,level,type,short_name",

  // Default for listOtas()
  OTAS_MINIMAL:
    "key,piid,award_date,recipient(display_name,uei),description,total_contract_value,obligated",

  // Default for listOtidvs()
  OTIDVS_MINIMAL: "key,piid,award_date,recipient(display_name,uei),description,total_contract_value,obligated,idv_type",

  // Default for listSubawards()
  // Note: API does not accept "id" or "amount" in shape (unknown_field). Use only accepted fields.
  SUBAWARDS_MINIMAL:
    "award_key,prime_recipient(uei,display_name),subaward_recipient(uei,display_name)",

  // Default for listGsaElibraryContracts()
  GSA_ELIBRARY_CONTRACTS_MINIMAL:
    "uuid,contract_number,schedule,recipient(display_name,uei),idv(key,award_date)",

  // Default for listItdashboardInvestments()
  // Free-tier safe: matches the API's INVESTMENT_LIST_DEFAULT_SHAPE.
  ITDASHBOARD_INVESTMENTS_MINIMAL:
    "uii,agency_name,bureau_name,investment_title," +
    "type_of_investment,part_of_it_portfolio,updated_time,url",

  // Default for getItdashboardInvestment()
  // Free-tier safe: matches the API's INVESTMENT_RETRIEVE_DEFAULT_SHAPE.
  ITDASHBOARD_INVESTMENTS_COMPREHENSIVE:
    "uii,agency_code,agency_name,bureau_code,bureau_name," +
    "investment_title,type_of_investment,part_of_it_portfolio," +
    "updated_time,url",

  // Default for listDibbsRfqs()
  DIBBS_RFQS_MINIMAL:
    "uuid,solicitation,nsn,part_number,nomenclature,quantity,issue_date,return_by_date,is_open",

  // Default for listDibbsRfps()
  DIBBS_RFPS_MINIMAL:
    "uuid,solicitation,nsn,part_number,nomenclature,issued_date,closes_date,is_open",

  // Default for listDibbsAwards(). total_contract_price is the ORDER total
  // repeated per line item — never sum it across rows.
  DIBBS_AWARDS_MINIMAL:
    "uuid,award_number,solicitation,nsn,part_number,nomenclature," +
    "awardee_cage,award_date,total_contract_price",

  // Default for listExclusions()
  EXCLUSIONS_MINIMAL:
    "exclusion_key,display_name,entity_name,uei,classification_type,exclusion_type," +
    "excluding_agency_name,activate_date,termination_date,is_currently_excluded",

  // Default for listSbirTopics()
  SBIR_TOPICS_MINIMAL:
    "topic_id,topic_number,title,agency,activity,year," +
    "solicitation_number,open_date,close_date,listed_open",

  // Default for listSbirSolicitations()
  SBIR_SOLICITATIONS_MINIMAL:
    "solicitation_id,solicitation_number,title,program,activity," +
    "cycle_name,solicitation_status,year,start_date,end_date",
} as const;
