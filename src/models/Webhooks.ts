export interface WebhookSubscriptionPayloadRecord {
  event_type: string;
  subject_type?: string | null;
  subject_ids?: string[];
  // Legacy compatibility (v1)
  resource_ids?: string[];
}

export interface WebhookSubscriptionPayload {
  records: WebhookSubscriptionPayloadRecord[];
}

export interface WebhookSubscription {
  id: string;
  endpoint?: string;
  subscription_name: string;
  payload: WebhookSubscriptionPayload | null;
  created_at: string;
}

export interface WebhookEndpoint {
  id: string;
  name: string;
  callback_url: string;
  secret?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WebhookEventType {
  event_type: string;
  default_subject_type: string;
  description: string;
  schema_version: number;
}

export interface WebhookSubjectTypeDefinition {
  subject_type: string;
  description: string;
  id_format: string;
  status: string;
}

export interface WebhookEventTypesResponse {
  event_types: WebhookEventType[];
  subject_types: string[];
  subject_type_definitions: WebhookSubjectTypeDefinition[];
}

export interface WebhookTestDeliveryResult {
  success: boolean;
  status_code?: number;
  response_time_ms?: number;
  endpoint_url?: string;
  message?: string;
  error?: string;
  response_body?: string;
  test_payload?: Record<string, unknown>;
}

export interface WebhookSampleSubject {
  subject_type: string;
  subject_id: string;
}

export interface WebhookSampleDelivery {
  timestamp: string;
  events: Array<Record<string, unknown>>;
}

export interface WebhookSamplePayloadSingleResponse {
  event_type: string;
  sample_delivery: WebhookSampleDelivery;
  sample_subjects: WebhookSampleSubject[];
  sample_subscription_requests: Record<string, unknown>;
  signature_header: string;
  note: string;
}

export interface WebhookSamplePayloadAllResponse {
  samples: Record<
    string,
    {
      sample_delivery: WebhookSampleDelivery;
      sample_subjects: WebhookSampleSubject[];
      sample_subscription_requests: Record<string, unknown>;
    }
  >;
  usage: string;
  signature_header: string;
  note: string;
}

export type WebhookSamplePayloadResponse = WebhookSamplePayloadSingleResponse | WebhookSamplePayloadAllResponse;
