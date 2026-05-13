/**
 * Public webhooks surface for `@makegov/tango-node`.
 *
 * Re-exports the signing helpers, the local `WebhookReceiver` used for
 * development / integration testing, and the offline `deliver`/`sign`
 * simulator for driving downstream receivers without provisioning a real
 * Tango alert.
 */

export {
  SIGNATURE_HEADER,
  SIGNATURE_PREFIX,
  generateSignature,
  parseSignatureHeader,
  verifySignature,
} from "./signing.js";

export {
  WebhookReceiver,
  withRunning,
  type Delivery,
  type WebhookReceiverOptions,
  type RunningReceiver,
} from "./receiver.js";

export { deliver, sign, stableStringify } from "./simulate.js";
export type {
  DeliverOptions,
  SignedRequest,
  SimulatePayload,
  SimulationResult,
} from "./simulate.js";
