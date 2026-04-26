// ============================================================
//  CodeShare — Cloudflare Worker
//  code.dhirajbalakrishnan.dev
//
//  Routes:
//    GET  /        → Create form (homepage)
//    POST /new     → Create snippet, returns { id, url }
//    GET  /:id     → View snippet (read-only)
//
//  Storage: Cloudflare KV (binding: SNIPPETS)
//  TTL:     30 days auto-expiry
// ============================================================

const TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

/** Language metadata → CodeMirror mode + CDN file name */
const LANG_META = {
  java:       { label: 'Java',       mode: 'text/x-java',     cdnFile: 'clike'      },
  python:     { label: 'Python',     mode: 'text/x-python',   cdnFile: 'python'     },
  cpp:        { label: 'C++',        mode: 'text/x-c++src',   cdnFile: 'clike'      },
  javascript: { label: 'JavaScript', mode: 'text/javascript', cdnFile: 'javascript' },
  sql:        { label: 'SQL',        mode: 'text/x-sql',      cdnFile: 'sql'        },
};

// ─── Entry point ─────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const method = request.method;
    const path   = url.pathname;

    try {
      if (method === 'GET'  && path === '/')        return htmlRes(createPage(env));
      if (method === 'POST' && path === '/new')     return handleCreate(request, env, url);

      // View snippet: /[6-10 alphanumeric chars]
      const viewMatch = path.match(/^\/([a-z0-9]{6,10})$/i);
      if (method === 'GET' && viewMatch)            return handleView(viewMatch[1], env, url);

      return new Response('Not found', { status: 404 });
    } catch (err) {
      console.error('Worker error:', err);
      return new Response(`Server error: ${err.message}`, { status: 500 });
    }
  },
};

// ─── Handlers ────────────────────────────────────────────────

async function handleCreate(request, env, url) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonRes({ error: 'Invalid JSON body' }, 400);
  }

  const { code, title = '', language } = body;

  if (!code || typeof code !== 'string' || code.trim().length === 0) {
    return jsonRes({ error: 'code is required and must be a non-empty string' }, 400);
  }
  if (!LANG_META[language]) {
    return jsonRes({ error: `language must be one of: ${Object.keys(LANG_META).join(', ')}` }, 400);
  }
  if (code.length > 500_000) {
    return jsonRes({ error: 'Snippet too large (max 500 KB)' }, 413);
  }

  const id      = generateId();
  const payload = JSON.stringify({
    code:      code.trim(),
    title:     title.trim().slice(0, 120),
    language,
    createdAt: Date.now(),
  });

  await env.SNIPPETS.put(id, payload, { expirationTtl: TTL_SECONDS });

  return jsonRes({ id, url: `${url.origin}/${id}` }, 201);
}

async function handleView(id, env, url) {
  const raw = await env.SNIPPETS.get(id);
  if (!raw) return htmlRes(notFoundPage(env), 404);

  const snippet    = JSON.parse(raw);
  const expiresAt  = new Date(snippet.createdAt + TTL_SECONDS * 1000);
  const expiresStr = expiresAt.toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  return htmlRes(viewPage(snippet, id, expiresStr, url.origin, env));
}

// ─── Utility ─────────────────────────────────────────────────

/** Generate a 7-char lowercase alphanumeric ID (crypto-random) */
function generateId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(7)))
    .map(b => chars[b % chars.length])
    .join('');
}

function htmlRes(body, status = 200) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html;charset=UTF-8' },
  });
}

function jsonRes(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── Shared HTML assets ──────────────────────────────────────

const CDN = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16';

/** Returns link + script tags for CodeMirror + required language modes */
function cmAssets(languages) {
  const modeFiles   = [...new Set(languages.map(l => LANG_META[l]?.cdnFile).filter(Boolean))];
  const modeScripts = modeFiles
    .map(f => `  <script src="${CDN}/mode/${f}/${f}.min.js"><\/script>`)
    .join('\n');
  return `
  <link rel="stylesheet" href="${CDN}/codemirror.min.css">
  <link rel="stylesheet" href="${CDN}/theme/dracula.min.css">
  <script src="${CDN}/codemirror.min.js"><\/script>
${modeScripts}`;
}

/** CSS with custom properties for dark (default) and light themes */
function css() {
  return `
    :root {
      --bg:                  #0d1117;
      --surface:             #161b22;
      --border:              #30363d;
      --text:                #e6edf3;
      --text-muted:          #7d8590;
      --accent:              #58a6ff;
      --green:               #238636;
      --green-hover:         #2ea043;
      --btn-secondary-bg:    #21262d;
      --btn-secondary-hover: #30363d;
      --notice-bg:           #1c2128;
      --notice-accent:       #d29922;
      --notice-text:         #9e8a6c;
      --url-border:          #238636;
      --badge-bg:            #1f3a5f;
      --badge-text:          #58a6ff;
      --badge-border:        #1f4f8f;
    }
    [data-theme="light"] {
      --bg:                  #f6f8fa;
      --surface:             #ffffff;
      --border:              #d0d7de;
      --text:                #24292f;
      --text-muted:          #57606a;
      --accent:              #0969da;
      --green:               #2da44e;
      --green-hover:         #2c974b;
      --btn-secondary-bg:    #f6f8fa;
      --btn-secondary-hover: #eaeef2;
      --notice-bg:           #fff8c5;
      --notice-accent:       #9a6700;
      --notice-text:         #7d4e00;
      --url-border:          #2da44e;
      --badge-bg:            #ddf4ff;
      --badge-text:          #0969da;
      --badge-border:        #54aeff;
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      transition: background 0.2s, color 0.2s;
    }

    .header {
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 14px 24px;
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .header-logo  { font-size: 18px; font-weight: 700; color: var(--accent); text-decoration: none; }
    .header-sub   { font-size: 13px; color: var(--text-muted); }
    .header-right { margin-left: auto; display: flex; gap: 8px; align-items: center; }

    .container { max-width: 920px; margin: 28px auto; padding: 0 20px; }

    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
    .card-header {
      padding: 14px 20px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: flex-end;
      gap: 14px;
      flex-wrap: wrap;
    }

    .form-group          { display: flex; flex-direction: column; gap: 5px; }
    label                { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
    input[type="text"],
    select               { background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text); font-size: 14px; padding: 7px 11px; outline: none; transition: border-color 0.15s; }
    input[type="text"]:focus,
    select:focus         { border-color: var(--accent); }
    select option        { background: var(--surface); }

    .btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 600;
      cursor: pointer; border: none; transition: opacity 0.15s, transform 0.1s; text-decoration: none;
    }
    .btn:active          { transform: scale(0.97); }
    .btn-primary         { background: var(--green); color: #fff; }
    .btn-primary:hover   { background: var(--green-hover); }
    .btn-secondary       { background: var(--btn-secondary-bg); color: var(--text); border: 1px solid var(--border); }
    .btn-secondary:hover { background: var(--btn-secondary-hover); }
    .btn:disabled        { opacity: 0.5; cursor: not-allowed; }

    .CodeMirror {
      height: 460px !important;
      font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Courier New', monospace;
      font-size: 14px;
      line-height: 1.65;
    }

    .badge {
      display: inline-flex; align-items: center;
      padding: 3px 10px; border-radius: 20px; font-size: 12px; font-weight: 600;
      background: var(--badge-bg); color: var(--badge-text); border: 1px solid var(--badge-border);
    }

    .notice {
      background: var(--notice-bg); border: 1px solid var(--border);
      border-left: 3px solid var(--notice-accent); border-radius: 0 6px 6px 0;
      padding: 10px 14px; font-size: 13px; color: var(--notice-text); margin-bottom: 20px;
    }

    .url-box {
      display: none;
      background: var(--bg); border: 1px solid var(--url-border); border-radius: 8px;
      padding: 14px 18px; margin-top: 16px; gap: 12px; align-items: center; flex-wrap: wrap;
    }
    .url-box.visible { display: flex; }
    .url-box a       { color: var(--accent); font-family: monospace; font-size: 14px; word-break: break-all; flex: 1; }

    .spinner {
      display: none; width: 15px; height: 15px;
      border: 2px solid var(--border); border-top-color: var(--accent);
      border-radius: 50%; animation: spin 0.7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .footer { text-align: center; padding: 20px; font-size: 12px; color: var(--text-muted); }
    .footer a { color: var(--accent); text-decoration: none; }

    .centered { text-align: center; padding-top: 80px; }
    .centered .icon { font-size: 48px; margin-bottom: 16px; }
    .centered h1 { font-size: 22px; margin-bottom: 8px; }
    .centered p  { color: var(--text-muted); margin-bottom: 24px; }
  `;
}

/**
 * Shared theme-toggle JS injected into every page.
 * Reads/writes localStorage 'theme', flips data-theme on <html>,
 * updates the toggle button label, and switches all CodeMirror instances
 * registered in window._editors.
 */
function themeScript() {
  return `
    (function () {
      function cmTheme(t) { return t === 'light' ? 'default' : 'dracula'; }
      function updateBtn(t) {
        var b = document.getElementById('themeToggle');
        if (b) b.textContent = t === 'dark' ? '☀ Light' : '☽ Dark';
      }
      window.toggleTheme = function () {
        var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        try { localStorage.setItem('theme', next); } catch (e) {}
        updateBtn(next);
        (window._editors || []).forEach(function (ed) {
          ed.setOption('theme', cmTheme(next));
        });
      };
      var saved = 'dark';
      try { saved = localStorage.getItem('theme') || 'dark'; } catch (e) {}
      updateBtn(saved);
    })();
  `;
}


// Inline script for head — prevents flash of wrong theme before CSS loads
const FOUC_GUARD = `<script>try{document.documentElement.setAttribute('data-theme',localStorage.getItem('theme')||'dark')}catch(e){}<\/script>`;

// ─── Page templates ──────────────────────────────────────────

function createPage(env) {
  const allLangs = Object.keys(LANG_META);
  const options  = allLangs.map(l =>
    `<option value="${l}">${LANG_META[l].label}</option>`
  ).join('\n            ');

  const modeMap = JSON.stringify(
    Object.fromEntries(allLangs.map(l => [l, LANG_META[l].mode]))
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CodeShare — Share Code with Students</title>
  ${FOUC_GUARD}
  ${cmAssets(allLangs)}
  <style>${css()}</style>
</head>
<body>

  <header class="header">
    <a href="/" class="header-logo">⟨/⟩ CodeShare</a>
    <span class="header-sub"> &middot; ${env.SITE_DOMAIN}</span>
    <div class="header-right">
      <button class="btn btn-secondary" id="themeToggle" onclick="toggleTheme()">☀ Light</button>
    </div>
  </header>

  <main class="container">
    <div class="notice">
      ⚡ Snippets auto-delete after <strong>30 days</strong>. Paste code → pick language → click <strong>Share</strong> → send URL to students.
    </div>

    <div class="card">
      <div class="card-header">
        <div class="form-group" style="flex:1;min-width:220px;">
          <label for="title">Snippet Title</label>
          <input type="text" id="title" placeholder="e.g. BFS Solution — Session 12" maxlength="120" autocomplete="off">
        </div>
        <div class="form-group">
          <label for="language">Language</label>
          <select id="language">${options}</select>
        </div>
        <div class="form-group" style="justify-content:flex-end;">
          <button class="btn btn-primary" id="shareBtn" onclick="shareSnippet()">
            <span class="spinner" id="spinner"></span>
            <span id="btnText">Share →</span>
          </button>
        </div>
      </div>
      <div id="editor"></div>
    </div>

    <div class="url-box" id="urlBox">
      <span style="font-size:13px;color:#3fb950;font-weight:600;">✓ Snippet created!</span>
      <a href="#" id="snippetLink" target="_blank">—</a>
      <button class="btn btn-secondary" onclick="copyUrl(event)">Copy URL</button>
    </div>
  </main>

  <footer class="footer">
    Built for DSA & DE classes &nbsp;·&nbsp;
    <a href="https://${env.ROOT_DOMAIN}">${env.ROOT_DOMAIN}</a>
  </footer>

  <script>
    ${themeScript()}

    const MODES = ${modeMap};

    const editor = CodeMirror(document.getElementById('editor'), {
      mode:           'text/x-java',
      theme:          (function(){ try { return localStorage.getItem('theme') === 'light' ? 'default' : 'dracula'; } catch(e) { return 'dracula'; } })(),
      lineNumbers:    true,
      indentUnit:     4,
      tabSize:        4,
      indentWithTabs: false,
      lineWrapping:   false,
      autofocus:      true,
      extraKeys:      { Tab: cm => cm.execCommand('insertSoftTab') },
    });
    window._editors = [editor];

    document.getElementById('language').addEventListener('change', function () {
      editor.setOption('mode', MODES[this.value]);
    });

    async function shareSnippet() {
      const code = editor.getValue().trim();
      if (!code) { alert('Please paste some code first.'); return; }

      const btn     = document.getElementById('shareBtn');
      const spinner = document.getElementById('spinner');
      const btnText = document.getElementById('btnText');

      btn.disabled           = true;
      spinner.style.display  = 'block';
      btnText.textContent    = 'Sharing…';

      try {
        const res  = await fetch('/new', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            code,
            title:    document.getElementById('title').value,
            language: document.getElementById('language').value,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Server error');

        const linkEl       = document.getElementById('snippetLink');
        linkEl.href        = data.url;
        linkEl.textContent = data.url;

        const urlBox = document.getElementById('urlBox');
        urlBox.classList.add('visible');
        urlBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        btnText.textContent = 'Shared ✓';
      } catch (err) {
        alert('Failed to share: ' + err.message);
        btn.disabled          = false;
        spinner.style.display = 'none';
        btnText.textContent   = 'Share →';
      }
    }

    function copyUrl(event) {
      const url = document.getElementById('snippetLink').href;
      navigator.clipboard.writeText(url).then(() => {
        const btn = event.target;
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = 'Copy URL', 2000);
      });
    }
  </script>

</body>
</html>`;
}

function viewPage(snippet, id, expiresStr, origin, env) {
  const lang     = LANG_META[snippet.language] || LANG_META.java;
  const title    = snippet.title || 'Untitled Snippet';
  const shareUrl = `${origin}/${id}`;
  // Safely embed code as a JSON string (handles all special chars / XSS)
  const codeJson = JSON.stringify(snippet.code);
  const modeJson = JSON.stringify(lang.mode);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(title)} — CodeShare</title>
  <meta property="og:title"       content="${escHtml(title)}">
  <meta property="og:description" content="Code snippet shared via CodeShare">
  ${FOUC_GUARD}
  ${cmAssets([snippet.language])}
  <style>${css()}
    /* Remove cursor on read-only editor */
    .CodeMirror-cursor { display: none !important; }
  </style>
</head>
<body>

  <header class="header">
    <a href="/" class="header-logo">⟨/⟩ CodeShare</a>
    <span class="header-sub"> &middot; ${env.SITE_DOMAIN}</span>
    <div class="header-right">
      <button class="btn btn-secondary" id="themeToggle" onclick="toggleTheme()">☀ Light</button>
      <a href="/" class="btn btn-secondary">+ New Snippet</a>
    </div>
  </header>

  <main class="container">
    <div class="notice">
      ⏳ This snippet expires on <strong>${expiresStr}</strong>. Save the code locally before then.
    </div>

    <div class="card">
      <div class="card-header">
        <div style="flex:1;">
          <div style="font-size:18px;font-weight:700;color:var(--text);">${escHtml(title)}</div>
        </div>
        <span class="badge">${escHtml(lang.label)}</span>
        <button class="btn btn-secondary" onclick="copyCode(event)">Copy Code</button>
        <button class="btn btn-secondary" onclick="copyLink(event)">Copy Link</button>
      </div>
      <div id="viewer"></div>
    </div>
  </main>

  <footer class="footer">
    Built for DSA & DE classes &nbsp;·&nbsp;
    <a href="https://${env.ROOT_DOMAIN}">${env.ROOT_DOMAIN}</a>
  </footer>

  <script>
    ${themeScript()}

    const code     = ${codeJson};
    const shareUrl = ${JSON.stringify(shareUrl)};

    const viewer = CodeMirror(document.getElementById('viewer'), {
      value:        code,
      mode:         ${modeJson},
      theme:        (function(){ try { return localStorage.getItem('theme') === 'light' ? 'default' : 'dracula'; } catch(e) { return 'dracula'; } })(),
      lineNumbers:  true,
      readOnly:     true,
      lineWrapping: false,
    });
    window._editors = [viewer];

    function copyCode(event) {
      navigator.clipboard.writeText(code).then(() => {
        const btn = event.target;
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = 'Copy Code', 2000);
      });
    }

    function copyLink(event) {
      navigator.clipboard.writeText(shareUrl).then(() => {
        const btn = event.target;
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = 'Copy Link', 2000);
      });
    }
  </script>

</body>
</html>`;
}

function notFoundPage(env) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Snippet Not Found — CodeShare</title>
  ${FOUC_GUARD}
  <style>${css()}</style>
</head>
<body>
  <header class="header">
    <a href="/" class="header-logo">⟨/⟩ CodeShare</a>
    <div class="header-right">
      <button class="btn btn-secondary" id="themeToggle" onclick="toggleTheme()">☀ Light</button>
    </div>
  </header>
  <main class="container centered">
    <div class="icon">🔍</div>
    <h1>Snippet Not Found</h1>
    <p>This snippet may have expired (auto-deleted after 30 days) or the URL is incorrect.</p>
    <a href="/" class="btn btn-primary">Create a New Snippet</a>
  </main>
  <script>${themeScript()}<\/script>
</body>
</html>`;
}

// Escape HTML special chars for safe interpolation into HTML attributes / text
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

