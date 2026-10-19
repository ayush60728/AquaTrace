# Changelog

All notable changes to AquaTrace will be documented in this file.

## Unreleased
### Added
- Shopping product context for optional, user-initiated AON product matches on Amazon and Flipkart.
- Up to three clearly labeled sponsored offer cards with HTTPS tracking links,
  source labels, prices, descriptions, and optional product images.

### Privacy
- Offer searches send only product title, category, displayed price, and currency
  after explicit user action. URLs, seller/account data, page text, cookies, AI
  conversation data, and local history are excluded.

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
