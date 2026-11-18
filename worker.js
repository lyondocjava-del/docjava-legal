const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newCode() {
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  let s = "";
  for (const x of b) s += ALPHA[x % ALPHA.length];
  return s;
}

function parseSyms(text) {
  const out = new Set();
  for (const tok of String(text || "").split(/[\s,;]+/)) {
    const t = tok.trim().toUpperCase();
    if (/^[A-Z][A-Z0-9.\-]{0,11}$/.test(t) && t !== "SYMBOL" && t !== "SYMBOLS") out.add(t);
  }
  return [...out].sort();
}

const PAGE = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Watchlist</title>
<style>
body{font-family:system-ui,sans-serif;background:#0d1117;color:#e6edf3;max-width:640px;margin:2rem auto;padding:0 1rem}
h1{font-size:1.4rem;color:#44dd77}
.code{font-size:2.5rem;font-weight:700;letter-spacing:.3em;color:#fff;background:#161b22;border:1px solid #30363d;border-radius:8px;padding:.4rem 1rem;display:inline-block}
textarea{width:100%;box-sizing:border-box;background:#161b22;color:#e6edf3;border:1px solid #30363d;border-radius:8px;padding:.75rem;font-family:ui-monospace,monospace;font-size:1rem;min-height:200px}
button{background:#238636;color:#fff;border:0;border-radius:8px;padding:.6rem 1.4rem;font-size:1rem;cursor:pointer}button:hover{background:#2ea043}
input[type=text]{background:#161b22;color:#e6edf3;border:1px solid #30363d;border-radius:8px;padding:.5rem;font-family:ui-monospace,monospace;font-size:1rem;width:9rem;text-transform:uppercase}
.muted{color:#8b949e}.url{font-family:ui-monospace,monospace;word-break:break-all;background:#161b22;border:1px solid #30363d;border-radius:8px;padding:.5rem;font-size:.85rem}
#msg{margin-left:1rem;color:#44dd77}
a{color:#58a6ff}
</style></head><body>__BODY__</body></html>`;

function homePage() {
  return PAGE.replace("__BODY__", `
<h1>DocJava Stock Ticker &mdash; Watchlists</h1>
<p class="muted">Each watchlist has a 6-letter code. Enter the code, then edit the symbol list in your browser &mdash; every Roku pointed at it updates automatically.</p>
<p>
<form action="/go" method="get">
<input type="text" name="c" maxlength="6" placeholder="CODE" autofocus>
<button type="submit">Open</button>
</form></p>
<p>or</p>
<form action="/new" method="get"><button type="submit">Create a new watchlist</button></form>`);
}

function editPage(code, list, base) {
  const txtUrl = base + "/w/" + code + "/txt";
  const body = `
<h1>Watchlist</h1>
<p><span class="code">${code}</span></p>
<p class="muted">Symbols &mdash; comma, space, or one per line:</p>
<textarea id="t">${list.split(",").join("\n")}</textarea>
<p><button id="save">Save</button><span id="msg"></span></p>
<h3>On your Roku</h3>
<p class="muted">Press the info (&amp;) button in DocJava Stock Ticker and enter this URL:</p>
<p class="url">${txtUrl}</p>
<p class="muted">The app polls it once a minute; saved changes appear on every TV within about a minute.</p>
<p><a href="/">&larr; home</a></p>
<script>
document.getElementById("save").onclick = async () => {
  const r = await fetch("/api/w/${code}", { method:"POST", body: document.getElementById("t").value });
  const j = await r.json();
  document.getElementById("msg").textContent = j.ok ? "Saved " + j.count + " symbols" : "Error";
  setTimeout(() => document.getElementById("msg").textContent = "", 3000);
};
</script>`;
  return PAGE.replace("__BODY__", body);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const base = url.origin;

    if (path === "/") return new Response(homePage(), { headers: { "content-type": "text/html; charset=utf-8" } });
    if (path === "/new") return Response.redirect(base + "/w/" + newCode(), 302);
    if (path === "/go") {
      const c = (url.searchParams.get("c") || "").trim().toUpperCase();
      return Response.redirect(c ? base + "/w/" + c : base + "/", 302);
    }

    let m = path.match(/^\/w\/([A-Z0-9]{6})(\/txt)?$/i);
    if (m) {
      const code = m[1].toUpperCase();
      const v = (await env.WL.get("w:" + code)) || "";
      if (m[2]) return new Response(v + "\n", { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-cache" } });
      return new Response(editPage(code, v, base), { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    m = path.match(/^\/api\/w\/([A-Z0-9]{6})$/i);
    if (m) {
      const code = m[1].toUpperCase();
      if (request.method === "GET") {
        const v = (await env.WL.get("w:" + code)) || "";
        return new Response(JSON.stringify({ code, symbols: v }), { headers: { "content-type": "application/json" } });
      }
      if (request.method === "POST") {
        const body = await request.text();
        let list = body;
        try { const j = JSON.parse(body); if (j.symbols) list = j.symbols; } catch {}
        const syms = parseSyms(list);
        await env.WL.put("w:" + code, syms.join(","));
        return new Response(JSON.stringify({ ok: true, count: syms.length }), { headers: { "content-type": "application/json" } });
      }
    }

    return new Response("Not found", { status: 404 });
  }
};
