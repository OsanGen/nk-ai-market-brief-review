// Velvet Rope: wrap a rendered brief HTML file in a client-side-encrypted gate.
//
// The brief is AES-256-GCM encrypted with a key derived (PBKDF2-SHA-256) from a
// shared access code. The committed/hosted file contains only ciphertext + the
// gate UI, so there is nothing readable to steal without the code. WebCrypto is
// used on BOTH sides (Node's global crypto.subtle here, window.crypto.subtle in
// the browser) so the parameters are guaranteed to match.
//
// Usage: SITE_PASSCODE="DAR9-EF6L-LQYY" node scripts/protect-site.mjs <in.html> [out.html]
// Two access paths share the one code:
//   - Magic link:  <url>#k=DAR9EF6LLQYY   (auto-unlocks, remembers device)
//   - Bare URL:    type the code once     (remembers device)

import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const PBKDF2_ITERATIONS = 300000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

// Normalize an access code: uppercase, keep only A-Z0-9 (so "dar9-ef6l-lqyy",
// "DAR9 EF6L LQYY", and "DAR9EF6LLQYY" all derive the same key).
export function normalizeCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const toB64 = (bytes) => Buffer.from(bytes).toString("base64");

async function deriveKey(subtle, code, salt) {
  const material = await subtle.importKey("raw", new TextEncoder().encode(code), "PBKDF2", false, ["deriveKey"]);
  return subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptHtml(plaintextHtml, code, { subtle = globalThis.crypto.subtle, randomBytes } = {}) {
  const rand = randomBytes ?? ((n) => globalThis.crypto.getRandomValues(new Uint8Array(n)));
  const normalized = normalizeCode(code);
  if (normalized.length < 8) throw new Error("access code must be at least 8 alphanumeric characters");
  const salt = rand(SALT_BYTES);
  const iv = rand(IV_BYTES);
  const key = await deriveKey(subtle, normalized, salt);
  const ct = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintextHtml)));
  return {
    v: 1,
    kdf: "PBKDF2",
    hash: "SHA-256",
    iter: PBKDF2_ITERATIONS,
    salt: toB64(salt),
    iv: toB64(iv),
    ct: toB64(ct)
  };
}

// The gate document: masthead "held frame", one forgiving code field, magic-link
// + remembered-device auto-unlock, calm grey error, no external requests.
export function gateHtml(payload) {
  const payloadJson = JSON.stringify(payload).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="robots" content="noindex,nofollow">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'">
<meta name="theme-color" content="#000000">
<meta property="og:type" content="website">
<meta property="og:title" content="NK AI Market Brief">
<meta property="og:description" content="Private access. Passcode required.">
<meta property="og:image" content="og-card.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="apple-touch-icon" href="nk-icon.png">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' fill='%23000'/%3E%3Ctext x='32' y='42' font-family='Helvetica,Arial,sans-serif' font-size='28' font-weight='700' fill='%23fff' text-anchor='middle'%3ENK%3C/text%3E%3C/svg%3E">
<title>NK AI Market Brief</title>
<style>
  :root { --bg:#fff; --ink:#0b0b0c; --muted:#6b6b70; --faint:#9a9aa0; --slot:#d6d6da; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0a0a0b; --ink:#f5f5f6; --muted:#9a9aa0; --faint:#6b6b70; --slot:#3a3a3d; } }
  * { box-sizing: border-box; }
  html, body { margin:0; height:100%; background:var(--bg); color:var(--ink); font-family:"Helvetica Neue", Helvetica, Arial, sans-serif; }
  .wrap { max-width:1040px; margin:0 auto; padding:24px 18px; min-height:100%; display:flex; flex-direction:column; }
  .masthead { font-weight:700; text-transform:uppercase; font-size:clamp(28px,8vw,60px); line-height:1.0; letter-spacing:.01em; margin:8vh 0 0; }
  .rule { border:0; border-top:2px solid var(--ink); margin:14px 0 10px; }
  .folio { display:flex; justify-content:space-between; font-size:11px; text-transform:uppercase; letter-spacing:.22em; font-weight:600; color:var(--muted); }
  .access { margin-top:18vh; }
  .label { font-size:11px; text-transform:uppercase; letter-spacing:.24em; font-weight:600; color:var(--muted); margin:0 0 12px; }
  #code { width:100%; max-width:340px; background:transparent; border:0; border-bottom:1px solid var(--ink); color:var(--ink);
          font-family:inherit; font-size:26px; font-weight:500; letter-spacing:.28em; padding:6px 2px; outline:none; caret-color:var(--ink); }
  #code::placeholder { color:var(--slot); letter-spacing:.28em; }
  .status { min-height:1.4em; margin-top:12px; font-size:11px; text-transform:uppercase; letter-spacing:.22em; font-weight:600; color:var(--muted); }
  .colophon { margin-top:auto; padding-top:24px; font-size:11px; color:var(--faint); }
  .shake { animation:shake .09s ease; }
  @keyframes shake { 0%{transform:translateX(0)} 30%{transform:translateX(-6px)} 70%{transform:translateX(5px)} 100%{transform:translateX(0)} }
  @media (prefers-reduced-motion: reduce) { .shake { animation:none; } }
  body.unlocking { transition:opacity .18s ease; opacity:0; }
</style>
</head>
<body>
  <main class="wrap" id="gate">
    <p class="folio"><span>NK AI Market Brief</span><span>Private</span></p>
    <h1 class="masthead">NK AI Market Brief</h1>
    <hr class="rule">
    <section class="access">
      <p class="label" id="greeting">Passcode</p>
      <input id="code" type="text" inputmode="text" autocomplete="off" autocorrect="off" autocapitalize="characters"
             spellcheck="false" aria-label="Access code" placeholder="••••-••••-••••">
      <p class="status" id="status"></p>
    </section>
    <p class="colophon">Private brief for Norma Kamali. This device will remember you.</p>
  </main>
  <script id="payload" type="application/json">${payloadJson}</script>
  <script>
  (function () {
    var STORE = "nk-brief-access-v1";
    var payload = JSON.parse(document.getElementById("payload").textContent);
    var input = document.getElementById("code");
    var status = document.getElementById("status");
    var greeting = document.getElementById("greeting");
    var gate = document.getElementById("gate");
    var busy = false;
    var enc = new TextEncoder(), dec = new TextDecoder();
    function b64(s){ var bin=atob(s), a=new Uint8Array(bin.length); for(var i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i); return a; }
    function norm(v){ return String(v||"").toUpperCase().replace(/[^A-Z0-9]/g,""); }
    async function keyFrom(code){
      var m = await crypto.subtle.importKey("raw", enc.encode(code), "PBKDF2", false, ["deriveKey"]);
      return crypto.subtle.deriveKey({name:"PBKDF2", salt:b64(payload.salt), iterations:payload.iter, hash:payload.hash}, m,
        {name:"AES-GCM", length:256}, false, ["decrypt"]);
    }
    async function tryCode(code, remember){
      var norml = norm(code);
      if (norml.length < 8) return false;
      try {
        var key = await keyFrom(norml);
        var pt = await crypto.subtle.decrypt({name:"AES-GCM", iv:b64(payload.iv)}, key, b64(payload.ct));
        var html = dec.decode(pt);
        if (remember) { try { localStorage.setItem(STORE, norml); } catch(e){} }
        reveal(html);
        return true;
      } catch (e) { return false; }
    }
    function reveal(html){
      document.body.classList.add("unlocking");
      setTimeout(function(){ document.open(); document.write(html); document.close(); }, 180);
    }
    function fail(){
      status.textContent = "Try again";
      gate.classList.remove("shake"); void gate.offsetWidth; gate.classList.add("shake");
      input.value = ""; input.focus();
    }
    async function submit(){
      if (busy) return; busy = true;
      status.textContent = "\\u00A0";
      var ok = await tryCode(input.value, true);
      busy = false;
      if (!ok) fail();
    }
    input.addEventListener("keydown", function(e){ if (e.key === "Enter") submit(); });
    // Auto-submit once a full-length code is present (12 alnum chars); still allows Enter.
    input.addEventListener("input", function(){ if (norm(input.value).length >= 12) submit(); });

    // 1) Magic link: key in the URL #fragment. Norma taps, types nothing.
    var frag = (location.hash || "").replace(/^#/, "");
    var m = /(?:^|&)k=([^&]+)/.exec(frag);
    if (m) {
      greeting.textContent = "Welcome, Norma";
      history.replaceState(null, "", location.pathname + location.search);
      tryCode(decodeURIComponent(m[1]), true).then(function(ok){ if(!ok){ greeting.textContent="Passcode"; input.focus(); } });
    } else {
      // 2) Remembered device.
      var saved = null; try { saved = localStorage.getItem(STORE); } catch(e){}
      if (saved) { tryCode(saved, false).then(function(ok){ if(!ok){ try{localStorage.removeItem(STORE);}catch(e){} input.focus(); } }); }
      else { input.focus(); }
    }
  })();
  </script>
  <noscript><p style="max-width:640px;margin:12vh auto;font-family:Helvetica,Arial,sans-serif;">This private brief needs JavaScript to open. Please use Safari or Chrome.</p></noscript>
</body>
</html>
`;
}

// CLI entry (pathToFileURL handles spaces in the repo path).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , inPath, outPath] = process.argv;
  const code = process.env.SITE_PASSCODE;
  if (!inPath) throw new Error("usage: SITE_PASSCODE=... node scripts/protect-site.mjs <in.html> [out.html]");
  if (!code) throw new Error("SITE_PASSCODE env var is required");
  const html = await readFile(inPath, "utf8");
  const payload = await encryptHtml(html, code);
  const gate = gateHtml(payload);
  // Self-check BEFORE writing: no visible content words from the brief may
  // appear in the gate. Strip style/script blocks and markup first so shared
  // CSS vocabulary does not false-positive.
  const contentText = html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  // Sentence-level probes: distinctive text runs from the brief must be absent
  // from the gate. Single common words collide with gate boilerplate (og:type
  // "website", copy); 30+ character runs cannot.
  const probes = contentText
    .split(/\s{2,}|\n/)
    .map((run) => run.trim())
    .filter((run) => run.length >= 30)
    .slice(0, 25);
  const leaked = probes.filter((probe) => gate.includes(probe));
  if (leaked.length) throw new Error(`refusing to write: plaintext leaked into gate ("${leaked[0].slice(0, 60)}...")`);
  const out = outPath || inPath;
  await writeFile(out, gate, "utf8");
  console.log(`protected ${out} (${payload.ct.length} b64 chars ciphertext, code len ${normalizeCode(code).length})`);
}
