# Image-assisted execution plans

**Status:** Approved on 2026-11-17 and implemented locally on `feature/image-assisted-plans`; authenticated provider verification remains deferred.

## Purpose

Reduce journaling friction by turning a user-uploaded pre-market chart into an editable execution-plan draft. Support any trading strategy; no strategy's vocabulary or trading rules are built into the extraction logic.

## Workflow

1. From Execution Plans, choose an image and optionally select an existing strategy. Manual planning remains available.
2. Analyze the chart with the selected strategy's name, rules, and user-defined signal descriptions as context. The selected strategy must belong to the authenticated owner. Explain which external provider receives the image and strategy context before analysis.
3. Show the image next to an editable draft. Suggest instrument, timeframe, bias, entry, protective stop, target, and invalidation area when visible. Preserve invalidation and stop as separate concepts. Identify chart annotations that may correspond to the selected strategy's signals, with evidence and approximate locations when supported.
4. Mark each suggestion as directly visible or an interpretation, and mark uncertainty. Leave unreadable or absent values blank. Let the user correct, accept, or discard suggestions. Never assume that price action following a setup was known before entry.
5. Save a draft with the original image and selected strategy context; committing follows the existing immutable plan-version flow and validation. Record the actual commit timestamp, not the image creation time. Do not represent image suggestions as verified market evidence.
6. Linked Print reviews can show the plan image, the confirmed plan fields and strategy context alongside execution facts.

## Data and boundaries

- Extend strategies with optional user-authored descriptions and signal definitions, preserving existing name/rules and existing strategies.
- Store original images in private owner-scoped Convex storage. Validate type and size, authorize reads, and support removing an uncommitted attachment. Do not expose permanent public URLs.
- Save the strategy identifier and a snapshot of the definitions used for each committed plan version so later edits to a strategy do not rewrite its history.
- Represent extracted values as untrusted proposals in provider-neutral domain types. A server-side adapter handles each vision provider; the application selects a configured provider and model without exposing credentials to the browser. Start with Google's hosted Gemma 4 free tier. Adding another provider must not change the plan domain or require migrating existing committed plans. Record the provider and model used as provenance. Validate provider output against a strict schema and bound image size and response content. Handle unavailable service, invalid output, timeout, and retry without losing manual draft edits. Never silently switch providers or send an image to another provider without the user's choice.
- Support optional fields and ranges: the existing plan model does not yet provide structured entry, target, invalidation range, strategy snapshot, or image references. Add these without changing the meaning of existing plan versions.
- Any location indicated on the uploaded image is approximate, user-correctable, and relative to that image. Do not turn it into a live chart drawing or assume exact candle timestamps.

## Design and acceptance

On wide screens, show the uploaded chart and extracted draft side by side; stack them on phones. Give every input a clear label and make the original image and uncertainty visible. The user can create a plan without a strategy or an image. Analysis requires an explicit user action; never place a broker order.

Verify ownership isolation, upload validation, unknown/ambiguous extraction, strategy snapshot preservation, draft editing and immutable commitment, distinction between invalidation and stop, provider failures and retry, and responsive keyboard-accessible interaction. Run the existing test suite and production build, then check the signed-in flow with a sample image. Deploy only after the implementation is ready and the target is confirmed.

## Open decision

The initial provider is Google's Gemini API with Gemma 4, subject to confirming image requests work with the user's key. Provider charges, limits, and image handling depend on the selected provider and tier. Future providers require explicit configuration and user selection.

## Local implementation record — 2026-11-18

Implemented on the dedicated feature branch. The plan form accepts private PNG, JPEG, and WebP uploads (up to 8 MB), keeps a compressed Convex preview separate from the original, and allows a saved immutable strategy version to be selected as analysis context. Strategies now support descriptions and versioned signal definitions. Chart analysis uses a provider-neutral proposal shape and a server-side Google Gemma adapter; provider keys are encrypted server-side. Suggestions remain editable, distinguish visible values from interpretation, preserve approximate image locations and price ranges, and must pass validation before being applied to the editable plan. Commit/revision snapshots retain linked images, strategy definitions, and accepted analysis provenance.

Verification: 66 Node tests pass; Convex and app TypeScript no-emit checks pass; Vite production bundling succeeds with writes disabled. The Impeccable detector reports existing CSS token advisories. The parent workspace `.env.local` contains `VITE_CONVEX_URL` and `CONVEX_DEPLOYMENT`; Vite was started on port 5176 with the URL loaded without printing it, and the host returned HTTP 200. The isolated browser service returned `ERR_CONNECTION_REFUSED` for its own `127.0.0.1` and `ERR_SOCKS_CONNECTION_FAILED` for `host.docker.internal`, so signed-in visual verification remains pending. Convex schema/functions have not been deployed. Generated API codegen ended with `fetch failed`. No image was sent to Google; the real Gemma upload test remains intentionally deferred to the final step.
