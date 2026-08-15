(() => {
  var u = {
    "gpt-4o-mini": {
      label: "GPT-4o Mini",
      whPerToken: 1e-4,
      tokenizerAccuracy: "exact",
      company: "microsoft"
    },
    "gpt-4o": {
      label: "GPT-4o",
      whPerToken: 6e-4,
      tokenizerAccuracy: "exact",
      company: "microsoft"
    },
    "gpt-5": {
      label: "GPT-5",
      whPerToken: .0025,
      tokenizerAccuracy: "exact",
      company: "microsoft"
    },
    "claude-sonnet": {
      label: "Claude Sonnet",
      whPerToken: 6e-4,
      tokenizerAccuracy: "approx",
      company: "amazon"
    },
    "claude-opus": {
      label: "Claude Opus",
      whPerToken: .0018,
      tokenizerAccuracy: "approx",
      company: "amazon"
    },
    "gemini-flash": {
      label: "Gemini Flash",
      whPerToken: 12e-5,
      tokenizerAccuracy: "approx",
      company: "google"
    },
    "gemini-pro": {
      label: "Gemini Pro",
      whPerToken: 8e-4,
      tokenizerAccuracy: "approx",
      company: "google"
    },
    "deepseek-v3": {
      label: "DeepSeek V3",
      whPerToken: .001,
      tokenizerAccuracy: "approx",
      company: "china"
    },
    "deepseek-r1": {
      label: "DeepSeek R1",
      whPerToken: .0029,
      tokenizerAccuracy: "approx",
      company: "china"
    }
  },
    f = {
      amazon: {
        low: .15,
        high: 1.8
      },
      microsoft: {
        low: .3,
        high: 1.52
      },
      google: {
        low: .5,
        high: 1.2
      },
      china: {
        low: 1,
        high: 3
      }
    },
    x = {
      amazon: 445,
      microsoft: 445,
      google: 445,
      china: 555
    },
    k = {
      "chatgpt.com": "gpt-4o",
      "chat.openai.com": "gpt-4o",
      "claude.ai": "claude-sonnet",
      "gemini.google.com": "gemini-flash",
      "chat.deepseek.com": "deepseek-v3"
    },
    y = "gpt-4o-mini";
  var w = {
    "chatgpt.com": "ChatGPT",
    "chat.openai.com": "ChatGPT",
    "claude.ai": "Claude",
    "gemini.google.com": "Gemini",
    "chat.deepseek.com": "DeepSeek"
  },
    T = {
      amazon: "AWS",
      microsoft: "Microsoft Azure",
      google: "Google",
      china: "China's national grid"
    };
  function E(t) {
    return !!(t && (w[t] || k[t]))
  }

  async function S() {
    let e = (await chrome.storage.local.get("waterTrackerState")).waterTrackerState || {
      bySite: {}
    };
    return e.bySite || (e.bySite = {}),
      Object.values(e.bySite).forEach(o => {
        u[o.modelId] || (o.modelId = y)
      }),
      e
  }

  function I() {
    return new Promise(t => {
      try {
        chrome.tabs.query({
          active: !0,
          currentWindow: !0
        },
          e => {
            try {
              let o = e && e[0] && e[0].url;
              t(o ? new URL(o).hostname : null)
            } catch {
              t(null)
            }
          })
      } catch {
        t(null)
      }
    })
  }

  function A(t) {
    let e = t / 500;
    return e < .001 ? "\u2248 0.1% of a 500 mL water bottle" : e < 1 ? `\u2248 ${(e * 100).toFixed(1)}% of a 500 mL water bottle` : `\u2248 ${e.toFixed(1)} water bottles (500 mL)`
  }

  function M(t) {
    return Object.entries(u).map(([e, o]) => `<option value="${e}" ${e === t ? "selected" : ""}>${o.label}</option>`).join("")
  }

  function B(t, e) {
    let o = u[e.modelId],
      s = f[o.company],
      a = e.promptTokens + e.responseTokens,
      n = a * o.whPerToken,
      p = n * s.low,
      l = n * s.high,
      b = n / 1e3 * x[o.company],
      r = w[t] || t,
      d = T[o.company] || o.company,
      m = o.tokenizerAccuracy === "exact" ? "Exact tokenizer" : "Approximate tokenizer",
      g = Math.min(Math.max(l / 20 * 100, 15), 100),
      h = e.userOverride ? `Manually selected \xB7 <a href="#" id="autoDetectLink" data-site="${t}">Use auto-detect</a>` : "Auto-detected from page";
    return `
    <div class="site-card" data-site="${t}">
      <div class="site-card-header">
        <div class="site-info-left">
          <div class="site-icon-box">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          <div class="site-title-area">
            <span class="site-name">${r}</span>
            <div class="status-indicator">
              <span class="status-dot"></span>
              <span class="status-text">Tracking</span>
            </div>
          </div>
        </div>
        <div class="model-pill-container">
          <select class="model-pill-select" id="modelSelect" data-site="${t}">
            ${M(e.modelId)}
          </select>
          <svg class="model-pill-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
        </div>
      </div>
      <div class="tokenizer-banner">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
        <span>${m} &middot; ${h}</span>
      </div>
      <div class="dashboard-grid">
        <div class="metric-card">
          <div class="metric-header">
            <svg class="metric-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            <span class="metric-label">Prompts</span>
          </div>
          <div class="metric-value">${e.prompts}</div>
        </div>
        <div class="metric-card">
          <div class="metric-header">
            <svg class="metric-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 10 4 15 9 20"></polyline><path d="M20 4v7a4 4 0 0 1-4 4H4"></path></svg>
            <span class="metric-label">Prompt Tokens</span>
          </div>
          <div class="metric-value">${e.promptTokens.toLocaleString()}</div>
        </div>
        <div class="metric-card">
          <div class="metric-header">
            <svg class="metric-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 14 20 9 15 4"></polyline><path d="M4 20v-7a4 4 0 0 1 4-4h12"></path></svg>
            <span class="metric-label">Response Tokens</span>
          </div>
          <div class="metric-value">${e.responseTokens.toLocaleString()}</div>
        </div>
        <div class="metric-card accent">
          <div class="metric-header">
            <svg class="metric-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
            <span class="metric-label">Total Tokens</span>
          </div>
          <div class="metric-value">${a.toLocaleString()}</div>
        </div>
      </div>
    </div>
    <div class="impact-section">
      <h3 class="section-title">Environmental Impact</h3>
      <div class="water-hero-card">
        <div class="water-card-top">
          <div class="water-card-left">
            <div class="badge-icon water-badge">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="#2563eb">
                <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
              </svg>
            </div>
            <span class="water-label">Water</span>
          </div>
          <div class="water-value">${p.toFixed(2)}&ndash;${l.toFixed(1)} mL</div>
        </div>
        <div class="water-subtext">${A(l)} &middot; based on ${d}'s reported water efficiency</div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width: ${g}%;"></div>
        </div>
      </div>
      <div class="impact-sub-grid">
        <div class="sub-impact-card">
          <div class="badge-icon energy-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#f59e0b">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
          </div>
          <div class="sub-impact-text">
            <span class="sub-impact-label">Energy</span>
            <span class="sub-impact-value">${n.toFixed(3)} Wh</span>
          </div>
        </div>
        <div class="sub-impact-card">
          <div class="badge-icon co2-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"></path>
              <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"></path>
            </svg>
          </div>
          <div class="sub-impact-text">
            <span class="sub-impact-label">CO2e</span>
            <span class="sub-impact-value">${b.toFixed(2)} g</span>
          </div>
        </div>
      </div>
      <button class="reset-site-btn" id="siteResetBtn" data-site="${t}">
        Reset ${r} count
      </button>
      <div class="action-links-row">
        <button id="resetAllBtn" class="reset-all-link">Reset everything</button>
        <a href="#" id="methodologyLink" class="methodology-link">Methodology <span>&rarr;</span></a>
      </div>
    </div>
  `
  }

  function _() {
    return `
    <div class="empty-state-card">
      <div class="empty-icon-wrapper"><span style="font-size: 24px;">\u{1F4A7}</span></div>
      <h3>No active AI chat detected</h3>
      <p class="empty-state-text">
        Open ChatGPT, Claude, or Gemini and send a message -- this popup will
        automatically start tracking that site.
      </p>
      <button id="resetAllBtn" class="reset-site-btn" style="margin-top: 16px;">Reset everything</button>
      <div class="action-links-row" style="justify-content: center; margin-top: 12px;">
        <a href="#" id="methodologyLink" class="methodology-link">Methodology <span>&rarr;</span></a>
      </div>
    </div>
  `
  }

  async function c(t) {
    let e = await S(),
      o = Object.keys(e.bySite),
      s = await I(),
      a = t || null;
    // Show all supported sites, not just ones with data
    // Use a Set to track seen display names and avoid duplicates
    let allSites = Object.keys(w);
    let seenNames = new Set();
    let uniqueSites = allSites.filter(site => {
      let displayName = w[site];
      if (seenNames.has(displayName)) {
        return false;
      }
      seenNames.add(displayName);
      return true;
    });
    a || (E(s) ? a = s : o.length > 0 && (a = o[o.length - 1]));
    let n = document.getElementById("siteSwitcherContainer");
    if (uniqueSites.length > 1) {
      n.style.display = "block";
      let i = document.getElementById("siteSwitcher");
      i.innerHTML = uniqueSites.map(v => `<option value="${v}" ${v === a ? "selected" : ""}>${w[v] || v}</option>`).join(""),
        i.value = a
    } else n.style.display = "none";
    let p = document.getElementById("currentSiteCard"),
      l = !!e.bySite[a],
      b = a === s && E(s),
      r = e.bySite[a] || {
        modelId: k[a] || y,
        prompts: 0,
        promptTokens: 0,
        responseTokens: 0,
        userOverride: !1
      };
    !a || !l && !b ? p.innerHTML = _() : p.innerHTML = B(a,
      r);
    let d = document.getElementById("modelSelect");
    d && (d.value = r.modelId,
      d.addEventListener("change",
        async i => {
          await chrome.runtime.sendMessage({
            type: "SET_MODEL",
            site: i.target.dataset.site,
            modelId: i.target.value
          }),
            c(a)
        }));
    let m = document.getElementById("autoDetectLink");
    m && m.addEventListener("click",
      async i => {
        i.preventDefault(),
          await chrome.runtime.sendMessage({
            type: "USE_AUTO_DETECT",
            site: i.target.dataset.site
          }),
          c(a)
      });
    let g = document.getElementById("siteResetBtn");
    g && g.addEventListener("click",
      async i => {
        await chrome.runtime.sendMessage({
          type: "RESET_SITE",
          site: i.target.dataset.site
        }),
          c(a)
      });
    let h = document.getElementById("resetAllBtn");
    h && h.addEventListener("click",
      async () => {
        await chrome.runtime.sendMessage({
          type: "RESET_ALL"
        }),
          c()
      })
  }

  document.addEventListener('DOMContentLoaded', () => {
    const exportBtn = document.getElementById('exportDataBtn');

    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        try {
          // 1. Fetch all tracked data from local storage
          chrome.storage.local.get('waterTrackerState', (result) => {
            try {
              const state = result.waterTrackerState;
              
              // Check if there's data to export
              if (!state || !state.bySite || Object.keys(state.bySite).length === 0) {
                alert('No data to export yet. Visit AI platforms and send some messages first!');
                return;
              }

              // 2. Generate CSV content
              const csvRows = [];
              
              // CSV Header
              csvRows.push('Site,Model,Prompts,Input Tokens,Output Tokens,Water (mL) Low,Water (mL) High,Energy (Wh),CO2 (g)');
              
              // CSV Data Rows
              Object.entries(state.bySite).forEach(([site, data]) => {
                const modelInfo = u[data.modelId];
                if (!modelInfo) return;
                
                const totalTokens = data.promptTokens + data.responseTokens;
                const energyWh = totalTokens * modelInfo.whPerToken;
                const wueRange = f[modelInfo.company];
                const waterLow = (energyWh * wueRange.low).toFixed(2);
                const waterHigh = (energyWh * wueRange.high).toFixed(2);
                const co2 = ((energyWh / 1000) * x[modelInfo.company]).toFixed(2);
                
                const siteName = w[site] || site;
                const row = [
                  siteName,
                  modelInfo.label,
                  data.prompts,
                  data.promptTokens,
                  data.responseTokens,
                  waterLow,
                  waterHigh,
                  energyWh.toFixed(4),
                  co2
                ].join(',');
                
                csvRows.push(row);
              });
              
              const csvContent = csvRows.join('\n');

              // 3. Create a blob download link
              const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);

              const downloadAnchor = document.createElement('a');
              downloadAnchor.href = url;

              // 4. Generate timestamped filename
              const timestamp = new Date().toISOString().split('T')[0];
              downloadAnchor.download = `aquatrace_footprint_${timestamp}.csv`;

              // 5. Trigger download & cleanup
              document.body.appendChild(downloadAnchor);
              downloadAnchor.click();

              document.body.removeChild(downloadAnchor);
              URL.revokeObjectURL(url);
              
            } catch (err) {
              console.error('Export failed:', err);
              alert('Export failed. Please try again or check the console for details.');
            }
          });
        } catch (err) {
          console.error('Storage access failed:', err);
          alert('Could not access data. Please check extension permissions.');
        }
      });
    }
  });


  document.getElementById("siteSwitcher").addEventListener("change",
    t => c(t.target.value));
  var L = document.getElementById("themeToggleBtn");
  L && L.addEventListener("click",
    () => {
      document.body.classList.toggle("dark-theme");
      try {
        localStorage.setItem("theme",
          document.body.classList.contains("dark-theme") ? "dark" : "light")
      } catch { }
    });
  try {
    localStorage.getItem("theme") === "dark" && document.body.classList.add("dark-theme")
  } catch { }

  var C = ["methodologyLink",
    "footerMethodologyLink"];
  C.forEach(t => {
    document.addEventListener("click",
      e => {
        e.target && e.target.id === t && (e.preventDefault(),
          chrome.tabs.create({
            url: chrome.runtime.getURL("methodology.html")
          }))
      })
  });
  c();
})();