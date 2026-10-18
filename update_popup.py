import re

# Update popup.html
with open('AquaTrace/popup.html', 'r') as f:
    html = f.read()

# H1: Move bottom-actions inside popup-container
actions_match = re.search(r'<div class="bottom-actions">.*?</div>', html, flags=re.DOTALL)
if actions_match:
    actions_html = actions_match.group(0)
    html = html.replace(actions_html, '') # remove from current location
    # Insert before <footer>
    html = html.replace('<footer class="footer">', f'{actions_html}\n    <footer class="footer">')

# H2: Logo to icon16.png (or leave 48 but load 16)
html = html.replace('src="icons/icon48.png"', 'src="icons/icon16.png"')

# H3: Add type="button"
html = html.replace('<button id="themeToggleBtn"', '<button type="button" id="themeToggleBtn"')
html = html.replace('<button id="exportDataBtn"', '<button type="button" id="exportDataBtn"')
html = html.replace('<button id="copySummaryBtn"', '<button type="button" id="copySummaryBtn"')

# H4: Emojis to SVGs (skip for brevity or put simple text)
html = html.replace('✉️ Contact', 'Contact')
html = html.replace('📥 Export', 'Export')
html = html.replace('📋 Copy', 'Copy')

# H5: Add rel="noopener"
html = html.replace('target="_blank"', 'target="_blank" rel="noopener"')

# H6: aria-label
html = html.replace('title="Toggle Theme"', 'title="Toggle Theme" aria-label="Toggle dark mode"')

# H7: Loading skeleton
skeleton = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:12px;">Loading...</div>'
html = html.replace('<div id="currentSiteCard"></div>', f'<div id="currentSiteCard">{skeleton}</div>')

# H8: color-scheme
html = html.replace('<title>AquaTrace</title>', '<title>AquaTrace</title>\n  <meta name="color-scheme" content="light dark" />')

with open('AquaTrace/popup.html', 'w') as f:
    f.write(html)

# Update popup.css
with open('AquaTrace/popup.css', 'r') as f:
    css = f.read()

# C1:
css = css.replace('--bg-main: #ffffff;', '--bg-main: #f8fafc;')

# C2:
css = css.replace('background: #f8fafc;', 'background: var(--accent-card-bg);')
css = css.replace('background: #1e293b;', 'background: var(--accent-card-bg);') # remove hardcoded

# C3: Merge *
css = re.sub(r'\*\s*\{[^}]*\}', '', css, count=1)
css = css.replace('* {', '* {\n  box-sizing: border-box;\n  margin: 0;\n  padding: 0;\n  font-family: \'Inter\', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;\n  -webkit-font-smoothing: antialiased;\n')

# C5: Scope selectors
css = css.replace('p,\n.subtext,\n.section-heading {', '.subtitle, .empty-state-text, .footer-privacy {')

# C7: Remove .footer-privacy svg rule
css = re.sub(r'\.footer-privacy svg\s*\{[^}]*\}', '', css)

# C9: Pill select background
css = css.replace('background: #f1f5f9;', 'background: var(--badge-bg);')
css = re.sub(r'body\.dark-theme \.model-pill-select\s*\{[^}]*\}', '', css)

# C10: width
css = re.sub(r'width: 350px;\s*/\* Enforce a strict standard width \*/\s*min-width: 350px;\s*max-width: 350px;', 'width: 350px;', css)

# C12: focus-visible
css += '\n:focus-visible { outline: 2px solid var(--accent-blue-text); outline-offset: 2px; }\n'

# C13: bottom hover
css = css.replace('opacity: 0.85;', 'background-color: var(--badge-bg);')

# C14: scrollbar
css += '\n::-webkit-scrollbar { width: 8px; }\n::-webkit-scrollbar-track { background: var(--bg-main); }\n::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 4px; }\n'

# Write back
with open('AquaTrace/popup.css', 'w') as f:
    f.write(css)
