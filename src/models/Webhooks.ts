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

/**
 * Filter-based subscription via the convenience `/api/webhooks/alerts/` API.
 *
 * Note the field naming differs from the canonical subscriptions endpoint:
 * - `name` (here) vs `subscription_name` (canonical)
 * - `filters` (here) vs `filter_definition` (canonical)
 * - `query_type` is SINGULAR in both ("contract" not "contracts").
 */
export interface WebhookAlertCreateInput {
  name: string;
  query_type: string;
  filters: Record<string, unknown>;
  frequency?: string;
  cron_expression?: string;
}

export interface WebhookAlert {
  alert_id: string;
  name: string;
  query_type: string;
  filters: Record<string, unknown>;
  frequency: string;
  cron_expression: string | null;
  status: "active" | "paused";
  created_at: string;
  last_checked_at: string | null;
  match_count: number;
}

export interface WebhookEventType {
  event_type: string;
  description: string;
  schema_version: number;
}

export interface WebhookEventTypesResponse {
  event_types: WebhookEventType[];
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

export interface WebhookSampleDelivery {
  timestamp: string;
  events: Array<Record<string, unknown>>;
}

export interface WebhookSamplePayloadSingleResponse {
  event_type: string;
  sample_delivery: WebhookSampleDelivery;
  signature_header: string;
  note: string;
}

export interface WebhookSamplePayloadAllResponse {
  samples: Record<
    string,
    {
      sample_delivery: WebhookSampleDelivery;
    }
  >;
  usage: string;
  signature_header: string;
  note: string;
}

export type WebhookSamplePayloadResponse = WebhookSamplePayloadSingleResponse | WebhookSamplePayloadAllResponse;
