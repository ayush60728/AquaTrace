const fs = require('fs');
let css = fs.readFileSync('AquaTrace/popup.css', 'utf8');

// Replace usages
css = css.replace(/--card-bg/g, '--bg-card');
css = css.replace(/--text-primary/g, '--text-main');

// Fix :root block
const rootRegex = /:root\s*\{[^}]*\}/;
const newRoot = `:root {
  --bg-main: #ffffff;
  --bg-card: #ffffff;
  --bg-input: #e2e8f0;
  --text-main: #0f172a;
  --text-secondary: #64748b;
  --text-muted: #94a3b8;
  --border-color: #e2e8f0;
  --primary-blue: #0052cc;
  --primary-blue-hover: #0043a8;
  --accent-blue-text: #2563eb;
  --badge-bg: #f1f5f9;
  --banner-bg: #f1f5f9;
  --accent-card-bg: #eff6ff;
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02);
}`;
css = css.replace(rootRegex, newRoot);

// Fix body.dark-theme block
const darkRegex = /body\.dark-theme\s*\{[^}]*\}/;
const newDark = `body.dark-theme {
  --bg-main: #0f172a;
  --bg-card: #1e293b;
  --bg-input: #334155;
  --text-main: #f8fafc;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;
  --border-color: #334155;
  --badge-bg: #334155;
  --banner-bg: #1e293b;
  --accent-card-bg: #1e3a8a;
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.3);
}`;
css = css.replace(darkRegex, newDark);

fs.writeFileSync('AquaTrace/popup.css', css);
console.log('CSS fixed.');
