# Changelog

All notable changes to AquaTrace will be documented in this file.

## [2.0.1] - 2026-10-21
### Changed
- Updated the public privacy-policy page and linked the extension popup to its
  GitHub Pages URL.
- Clarified local processing, AON data transfer, third-party sharing, retention,
  security, sponsored links, and Chrome Web Store Limited Use disclosures.
- Bumped the extension version for the Chrome Web Store submission.

## [2.0.0] - 2026-10-20
### Added
- Reorganized the popup into **Shopping** and **AI Footprints** tabs, with
  Shopping selected by default on each popup open. AI footprint metrics, local
  history, export, reset, Copy Summary and methodology actions live in the AI
  Footprints tab. The selected tab is transient; every new popup opens on
  Shopping.
- One-time opt-in automatic AON sponsored suggestions on Amazon.in, Amazon.com,
  and Flipkart, without requiring popup clicks for each page.
- A slim collapsible Shadow DOM offer bar with up to three clearly labeled
  sponsored offer cards containing HTTPS action links, source labels, prices,
  titles, and optional product images.
- Product-context priority, cleaned Amazon `k`/Flipkart `q` fallback queries,
  and bounded title/category retries.
- First-install/upgrade onboarding page with one unchecked opt-in checkbox and
  the plain-language disclosure. The old popup-only preference is reset once
  for consent to automatic shopping/search requests; later reloads keep the choice.
- The popup can also show the current or latest sponsored suggestions when opened;
  the in-page offer bar does not depend on opening it.
- Ten-minute session query caching, concurrent-request deduplication, and a
  persistent cap of 50 query attempts per UTC day per browser profile.
- Dependency-free release validation/packaging with `python3 build.py` and
  automated background/UI integration fixtures for the nine acceptance flows.

### Privacy
- Automatic offer searches remain off until the user enables
  `aonAutoMatchesEnabled`. Searches send only product title, category,
  displayed price, and currency, or cleaned shopping search keywords or a
  generic request when product context is missing. URLs, seller/account data, page text, cookies,
  AI conversation data, and local history are excluded.
- Unchecking the popup setting removes the bar immediately, aborts in-flight
  requests, and blocks queued fallbacks and manual popup refreshes. Errors and
  empty responses hide the bar without clearing the last non-empty offers
  retained for the current session.
- Live AON queries omit credentials/referrers and never send an Authorization
  header. HTTP 200 errors are rejected, and only trace IDs are logged.

### Fixed
- Prefer the page breadcrumb over JSON-LD and generic menus for categories;
  reject categories longer than 60 characters.
- Preserve direct HTTPS offer links verbatim, reject URL credentials, render
  offer text via textContent, and default missing action labels to “View deal”.
- Existing AI token tracking, models, history, export and Copy Summary remain
  separate; the AI content bundle is unchanged.

## [1.2.0] - 2026-10-18
### Added
- Site-specific assistant-response adapters for supported AI sites.
- Live current-model detection when the popup is opened.
- Local conversation history and seven-day token trends.

### Fixed
- Broadened model detection beyond button text to include accessible labels, titles, test IDs, and model headings.

## [1.1.1] - 2026-10-18
### Added
- Working Copy Summary action for the selected site.

### Fixed
- Serialized background state updates so simultaneous prompts from multiple tabs are not lost.
- Captured streamed response text when sites update existing DOM text nodes.
- Made Copy Summary use the stored prompt and response token fields.
- Reset a site's model to its host default when switching back to auto-detection.

## [1.1.0] - 2026-08-15
### Added
- Support for DeepSeek V3 and DeepSeek R1 models.
- CSV export functionality for all usage data.

### Changed
- Updated energy estimates with the latest research data.
- Enhanced company-specific WUE and carbon intensity calculations for Chinese infrastructure.
- Improved UI with better dark theme support and refactored CSS tokens.
- Methodology UI now fully supports dark mode and responsive tables.

## [1.0.0] - Initial Release
### Added
- Tracking support for ChatGPT, Claude, and Gemini.
- Company-specific WUE ranges (Amazon, Microsoft, Google).
- Per-site independent tracking.
- Real-time token counting using the GPT tokenizer.
- Local-only privacy-first architecture.
