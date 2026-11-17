# Changelog

All notable changes to The Canvasium are documented in this file.

## [0.2.0] - 2026-11-17

### Added
- Added a hierarchical provider/model selector to the floating prompt bar, with drill-down into a provider's model list and a back navigation action.
- Added runtime model discovery for installed Ollama models and a non-secret `GET /api/v1/models` catalogue endpoint.
- Added optional concurrent OpenAI and OpenAI-compatible provider configuration so users can switch between local and commercial model families without exposing credentials to the browser.
- Added a provider abstraction for AI inference, keeping model selection independent of the Canvasium planner.
- Made Ollama the default local LLM runtime, using its OpenAI-compatible chat API.
- Added configurable local model selection through `AI_MODEL` and `OLLAMA_BASE_URL`.
- Added a commercial OpenAI-compatible provider mode for future hosted LLM integrations without changing the canvas planner contract.
- Added an MCP endpoint at `POST /mcp` with JSON-RPC initialization, ping, tool discovery, and the initial `canvas_plan` tool.
- Added optional MCP bearer-token protection through `MCP_API_KEY` and an enable/disable switch through `MCP_ENABLED`.
- Added versioned REST endpoints for health, runtime capability discovery, and canvas planning.
- Added runtime capability metadata for AI providers, MCP, REST APIs, and ready-mode integration modules.
- Documented local LLM installation, commercial provider activation, MCP clients, API contracts, and integration security.

### Changed
- Changed the Fastify planner from OpenAI-key-required behavior to local-first inference.
- Kept deterministic starter plans available for explicit offline mode.
- Preserved the existing `POST /api/plan` route for compatibility.
- Updated `.env.example` to use Ollama defaults and server-side optional commercial credentials.
- Updated the README with the new architecture, setup instructions, API/MCP details, and module readiness status.

### Security
- Provider and MCP credentials remain server-side.
- The browser sends only the selected provider ID and model ID; provider credentials remain server-side.
- Model output continues to be validated against the shared Canvasium plan schema.
- MCP should remain on a private network unless TLS, authentication, rate limiting, and audit controls are configured.

### Notes
- Ollama must be installed and running separately; this repository does not bundle model weights.
- The initial MCP implementation exposes the canvas planning tool. Additional tools, resources, prompts, and external-system adapters remain future extensions.
- “Ready-mode” denotes defined integration boundaries and capability discovery, not a claim that every listed external integration is already connected.
- Automated build, typecheck, and protocol conformance tests have not yet been run as part of this documentation and integration update.
