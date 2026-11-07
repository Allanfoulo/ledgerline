# Settings and Convex backend

## Goal

Add a Settings page for the Twelve Data key and connect the personal journal to Convex. Replay uses a server-side Convex action to request candles, so the provider key is not returned to the browser after saving.

## Proposed first version

- Add Settings to the existing navigation, with a password field and controls to save, replace, and remove the Twelve Data key. Show whether a key is configured, never its value.
- Add sign-in and protect every key operation and market-data request by the authenticated user identity. Store each user's key encrypted, with a separate encryption secret configured in Convex deployment environment variables. Do not log keys or expose them through queries.
- Move the Twelve Data request from the browser into a Convex action. Validate requested FX pairs and date ranges, return only candle data, and show useful errors without revealing the key.
- Use Convex to store trade and day notes for the authenticated user, so journal changes persist across devices. Continue to identify the current fixed trades as sample data.
- Configure Convex locally in the current D: workspace. Creating or selecting a Convex project and setting its deployment secret require an authenticated Convex account; never ask the user to paste passwords or API keys into chat.

## Verification

Build the React app, check the backend function types and access rules, and exercise settings, saved notes, and replay once a Convex deployment and provider key are available. Until then, clearly indicate setup is required.
