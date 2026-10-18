import re
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent / 'AquaTrace'
HTML_PATH = BASE_DIR / 'methodology.html'
CSS_PATH = BASE_DIR / 'methodology.css'

html = HTML_PATH.read_text()

# 1. Add viewport and favicon exactly once.
head_insert = (
    '<meta charset="UTF-8" />\n'
    '  <meta name="viewport" content="width=device-width, initial-scale=1">\n'
    '  <link rel="icon" href="icons/icon16.png">'
)
html = re.sub(r'<meta charset="UTF-8" />(?:\n\s*<meta name="viewport"[^>]*>)?(?:\n\s*<link rel="icon"[^>]*>)?', head_insert, html, count=1)

# 2. Extract and replace inline styles
style_match = re.search(r'<style>(.*?)</style>', html, flags=re.DOTALL)
if style_match:
    styles = style_match.group(1)
    html = html.replace(style_match.group(0), '<link rel="stylesheet" href="methodology.css" />')
    
    CSS_PATH.write_text(''':root {
  --bg-main: #ffffff;
  --text-main: #1a2b3c;
  --text-heading: #0d3b66;
  --code-bg: #eaf3ff;
  --badge-bg: #eafff0;
  --badge-border: #b8f0cc;
  --table-border: #e0ecf9;
  --table-header-bg: #f4f9ff;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg-main: #0f172a;
    --text-main: #f8fafc;
    --text-heading: #93c5fd;
    --code-bg: #1e293b;
    --badge-bg: #064e3b;
    --badge-border: #047857;
    --table-border: #334155;
    --table-header-bg: #1e293b;
  }
}
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  max-width: 640px;
  margin: 40px auto;
  padding: 0 20px;
  background-color: var(--bg-main);
  color: var(--text-main);
  line-height: 1.6;
}
h1, h2 { color: var(--text-heading); }
h2 { margin-top: 28px; font-size: 17px; }
code {
  background: var(--code-bg);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 13px;
}
.privacy-badge {
  background: var(--badge-bg);
  border: 1px solid var(--badge-border);
  border-radius: 8px;
  padding: 12px 16px;
  margin: 16px 0;
}
.table-wrapper { overflow-x: auto; margin: 12px 0; }
table { border-collapse: collapse; width: 100%; font-size: 13px; }
td, th { border: 1px solid var(--table-border); padding: 6px 10px; text-align: left; }
th { background: var(--table-header-bg); }
''')

# 3. Replace the old What's New block with a changelog link.
whats_new_pattern = r'<h2>✨ What\'s New in Version 1\.1\.0</h2>.*?</ul>'
html = re.sub(whats_new_pattern, '<p><a href="#version-history">View changelog</a></p>', html, flags=re.DOTALL)

# 4. Replace the token-counting copy with one canonical, well-formed version.
tokenizer_section_pattern = r'(<h2>1\. Counting tokens</h2>)\s*<p>.*?</p>\s*<p>.*?</p>'
tokenizer_section_replacement = '''{heading}
  <p>
    We use <code>gpt-tokenizer</code>, a JavaScript implementation of OpenAI's
    real tokenizer. The bundled tokenizer uses the same byte-pair-encoding scheme
    as GPT-4o and is also used as a proxy for the GPT-5 profile until a GPT-5
    tokenizer is available. It counts tokens in whatever text is typed into the
    chat box and whatever text gets added to the page in response.
  </p>
  <p>
    For GPT-4o Mini and GPT-4o, this is the model's <strong>actual</strong>
    tokenizer, so counts are exact. The GPT-5 profile currently reuses the
    bundled GPT-4o tokenizer until a GPT-5 tokenizer is available. For Claude and
    Gemini models, neither Anthropic nor Google publish an installable tokenizer
    library, so we reuse the OpenAI tokenizer as a stand-in. Token boundaries will
    differ slightly from what those models really use internally, but total counts
    land in a similar range for ordinary English text.
  </p>'''
html = re.sub(
    tokenizer_section_pattern,
    lambda match: tokenizer_section_replacement.format(heading=match.group(1)),
    html,
    count=1,
    flags=re.DOTALL,
)

# 5. Replace Section 6 with one canonical version.
section6_pattern = r'<h2>6\. Exporting your data</h2>.*?<h2>Bottom line</h2>'
section6_replacement = '''<h2>6. Exporting your data</h2>
  <p>The extension includes an export feature to download usage data as a CSV. It contains: Site, Model, Prompts, Input Tokens, Output Tokens, Water (mL) Low/High, Energy (Wh), and CO₂ (g). The Copy Summary action copies the selected site's prompt and response totals to the clipboard. The popup also keeps up to 100 local conversation summaries and shows a seven-day token trend; conversation text is never stored.</p>

  <h2>Bottom line</h2>'''
html = re.sub(section6_pattern, section6_replacement, html, count=1, flags=re.DOTALL)

# 6. Wrap tables only when they are not already wrapped.
html = re.sub(r'(?<!<div class="table-wrapper">)<table>', '<div class="table-wrapper"><table>', html)
html = re.sub(r'</table>(?!</div>)', '</table></div>', html)

# 7. Normalize only the model-list GPT-5 wording without changing phrases such
# as "GPT-5 profile" or "GPT-5 tokenizer".
html = re.sub(r'GPT-5\s*(?:\(when available\))+', 'GPT-5 (when available)', html)
html = html.replace('<td>GPT-5</td>', '<td>GPT-5 (when available)</td>')
html = html.replace('GPT-4o Mini, GPT-5</td>', 'GPT-4o Mini, GPT-5 (when available)</td>')

# 8. Keep exactly one response-settling caveat.
caveat = '<p><em>Caveat:</em> Long reasoning responses (like those from o1 or DeepSeek R1) that pause for more than 1.5s mid-generation may get split into two tokenize events, which can occasionally result in undercounting.</p>'
html = re.sub(r'\s*<p><em>Caveat:</em>.*?</p>', '', html, flags=re.DOTALL)
section2_pattern = r'(<h2>2\. Detecting when a response finished</h2>\s*<p>.*?</p>)'
html = re.sub(section2_pattern, lambda match: f'{match.group(1)}\n  {caveat}', html, count=1, flags=re.DOTALL)

# 9. Add the changelog anchor exactly once and keep version history canonical.
html = html.replace('<h2>Version History & Features</h2>', '<h2 id="version-history">Version History & Features</h2>')
history_pattern = r'(<h2 id="version-history">Version History & Features</h2>).*?\s*(<p><strong>Version 1\.0\.0</strong>)'
history_replacement = '''<h2 id="version-history">Version History & Features</h2>
  <p><strong>Version 1.2.0</strong> (Current)</p>
  <ul>
    <li>Added site-specific assistant-response adapters for supported AI sites.</li>
    <li>Added live current-model detection when the popup is opened.</li>
    <li>Added local conversation history and seven-day token trends.</li>
    <li>Broadened model detection beyond button text to include accessible labels, titles, test IDs, and model headings.</li>
  </ul>

  <p><strong>Version 1.1.1</strong></p>
  <ul>
    <li>Prevented concurrent prompts from overwriting each other's stored totals.</li>
    <li>Improved capture of streamed response text that updates existing DOM text nodes.</li>
    <li>Added a working Copy Summary action for the selected site.</li>
  </ul>

  <p><strong>Version 1.1.0</strong></p>
  <ul>
    <li>Added support for DeepSeek V3 and DeepSeek R1 models</li>
    <li>Implemented CSV export functionality for all usage data</li>
    <li>Updated energy estimates with latest research data</li>
    <li>Enhanced company-specific WUE and carbon intensity calculations for Chinese infrastructure</li>
    <li>Improved UI with better dark theme support</li>
  </ul>
'''
html = re.sub(
    history_pattern,
    lambda match: f'{history_replacement}\n  {match.group(2)}',
    html,
    count=1,
    flags=re.DOTALL,
)

HTML_PATH.write_text(html)
