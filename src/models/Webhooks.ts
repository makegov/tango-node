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
  subscription_type?: "subject" | "filter";
  payload: WebhookSubscriptionPayload | null;
  query_type?: string | null;
  filter_definition?: Record<string, unknown> | null;
  frequency?: string | null;
  cron_expression?: string | null;
  is_active?: boolean;
  created_at: string;
}

/**
 * Create-input for `POST /api/webhooks/subscriptions/`.
 *
 * Two flavors, gated by `subscription_type`:
 *
 * - `"subject"` (default): match by event type + subject id(s). Requires
 *   `event_type`, `subject_type`, `subject_ids`.
 * - `"filter"`: match by saved query-param filters. Requires `query_type`
 *   (SINGULAR — e.g. `"contract"`, not `"contracts"`) and `filter_definition`.
 *
 * NOTE on field naming: this canonical endpoint takes `endpoint` (UUID).
 * The `/api/webhooks/endpoints/test-delivery/` endpoint instead takes
 * `endpoint_id`. The Tango API is inconsistent here; we reflect both forms.
 */
export interface WebhookSubscriptionCreateInput {
  subscription_name: string;
  endpoint: string;
  subscription_type?: "subject" | "filter";

  // subject-subscription fields
  event_type?: string;
  subject_type?: string;
  subject_ids?: string[];

  // filter-subscription fields
  query_type?: string;
  filter_definition?: Record<string, unknown>;
  frequency?: string;
  cron_expression?: string;

  is_active?: boolean;
  payload?: WebhookSubscriptionPayload;
}

export type WebhookSubscriptionUpdateInput = Partial<WebhookSubscriptionCreateInput>;

export interface WebhookEndpoint {
  id: string;
  name: string;
  callback_url: string;
  secret?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WebhookEndpointCreateInput {
  name: string;
  callback_url: string;
  is_active?: boolean;
}

export type WebhookEndpointUpdateInput = Partial<WebhookEndpointCreateInput>;

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
