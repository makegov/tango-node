# Changelog

All notable changes to `@makegov/tango-node` will be documented in this file.

This project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Vehicles endpoints: `listVehicles`, `getVehicle`, and `listVehicleAwardees` (supports shaping + flattening). (refs `makegov/tango#1327`)
- IDV endpoints: `listIdvs`, `getIdv`, `listIdvAwards`, `listIdvChildIdvs`, `listIdvTransactions`, `getIdvSummary`, `listIdvSummaryAwards`. (refs `makegov/tango#1327`)
- Webhooks v2 client support: event type discovery, subscription CRUD, endpoint management, test delivery, and sample payload helpers. (refs `makegov/tango#1275`)

### Changed

- HTTP client now supports PATCH/PUT/DELETE for non-GET endpoints.
- `joiner` is now respected when unflattening `flat=true` responses on supported endpoints.

## [0.1.0] - 2025-11-21

- Initial Node.js port of the Tango Python SDK.
- Basic project scaffolding for client, models, and shapes.
- ESM + TypeScript build configuration.

## [0.1.4] - 2025-11-21

- Added tests and cleaned up formatting and structure of SDK.
