from html.parser import HTMLParser
import base64
import hashlib
from pathlib import Path
import json
import re
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
errors = []

class AppParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.csp = None
        self.external_scripts = []
        self.external_styles = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "meta" and attrs.get("http-equiv", "").lower() == "content-security-policy":
            self.csp = attrs.get("content", "")
        if tag == "script" and attrs.get("src"):
            self.external_scripts.append(attrs["src"])
        if tag == "link" and "stylesheet" in attrs.get("rel", "").lower().split():
            href = attrs.get("href", "")
            if href.startswith(("http://", "https://")):
                self.external_styles.append(href)

html_path = ROOT / "index.html"
html = html_path.read_text(encoding="utf-8")
parser = AppParser()
parser.feed(html)

if not parser.csp:
    errors.append("Missing Content-Security-Policy meta tag")
else:
    directives = {}
    for part in parser.csp.split(";"):
        bits = part.strip().split()
        if bits:
            directives[bits[0]] = bits[1:]
    required = {
        "default-src": ["'self'"],
        "object-src": ["'none'"],
        "base-uri": ["'self'"],
        "form-action": ["'self'"],
        "connect-src": ["'self'", "https://pmrrslmkrulhuapxtltm.supabase.co", "https://open.er-api.com"],
    }
    for name, values in required.items():
        if directives.get(name) != values:
            errors.append(f"CSP directive {name} must be exactly {' '.join(values)}")
    script_policy = directives.get("script-src", [])
    if "'unsafe-inline'" in script_policy or "'unsafe-eval'" in script_policy:
        errors.append("CSP script-src must not allow unsafe-inline or unsafe-eval")

    inline_sources = re.findall(r"<script\b(?![^>]*\bsrc=)[^>]*>(.*?)</script\s*>", html, flags=re.I | re.S)
    expected_hashes = {
        "'sha256-" + base64.b64encode(hashlib.sha256(source.encode("utf-8")).digest()).decode("ascii") + "'"
        for source in inline_sources
    }
    declared_hashes = {token for token in script_policy if token.startswith("'sha256-")}
    if expected_hashes != declared_hashes:
        errors.append("CSP script hashes do not exactly match the inline JavaScript")

if parser.external_scripts != ["./currency.js", "./auth.js", "./learning.js"]:
    errors.append("Only approved first-party auth.js and learning.js scripts may be loaded externally: " + ", ".join(parser.external_scripts))
if parser.external_styles:
    errors.append("External stylesheets are not allowed: " + ", ".join(parser.external_styles))

inline_source = "\n".join(re.findall(r"<script\b(?![^>]*\bsrc=)[^>]*>(.*?)</script\s*>", html, flags=re.I | re.S))
if re.search(r"\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon)\b", inline_source):
    errors.append("The app must not send financial data through browser network APIs")

export_start = html.find("function exportData()")
import_start = html.find("function importData(e)")
chat_start = html.find("const chatKey=")
if export_start < 0 or import_start < 0 or chat_start < 0:
    errors.append("Missing export, import, or chat storage functions")
else:
    export_section = html[export_start:import_start]
    import_section = html[import_start:chat_start]
    if "localStorage.getItem(chatKey())" not in export_section:
        errors.append("Backup export must include the active assistant chat history")
    if "entries[chatKey()]" not in import_section or "persistEntries(entries)" not in import_section:
        errors.append("Backup restore must restore chat history together with financial records")
if "function persistEntries(entries)" not in html:
    errors.append("Missing safe storage write helper")

scripts = re.findall(r"<script\b(?![^>]*\bsrc=)[^>]*>(.*?)</script\s*>", html, flags=re.I | re.S)
if not scripts:
    errors.append("No inline JavaScript found")
else:
    for index, source in enumerate(scripts):
        (Path("/tmp") / f"saymosaldo-inline-{index}.js").write_text(source, encoding="utf-8")

try:
    json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
except Exception as exc:
    errors.append(f"manifest.json is not valid JSON: {exc}")

try:
    sitemap = ET.parse(ROOT / "sitemap.xml")
    locations = [node.text for node in sitemap.findall(".//{*}loc")]
    if "https://11saymo.github.io/saymosaldo-app/privacy.html" not in locations:
        errors.append("sitemap.xml must include the privacy policy URL")
except Exception as exc:
    errors.append(f"sitemap.xml is not valid XML: {exc}")

privacy_path = ROOT / "privacy.html"
if not privacy_path.is_file():
    errors.append("Missing privacy.html")
else:
    privacy_html = privacy_path.read_text(encoding="utf-8")
    privacy_parser = AppParser()
    privacy_parser.feed(privacy_html)
    if not privacy_parser.csp:
        errors.append("Missing Content-Security-Policy in privacy.html")
    if re.search(r"<script\b", privacy_html, flags=re.I):
        errors.append("privacy.html must not contain scripts")
    if privacy_parser.external_scripts or privacy_parser.external_styles:
        errors.append("privacy.html must not load external scripts or stylesheets")

for filename in ("index.html", "sw.js", "manifest.json", "auth.js", "currency.js"):
    content = (ROOT / filename).read_text(encoding="utf-8")
    if re.search(r"\bservice_role\b|\bsb_secret_[A-Za-z0-9_]+", content, flags=re.I):
        errors.append(f"Possible privileged Supabase key found in {filename}")


sw_content = (ROOT / "sw.js").read_text(encoding="utf-8")
if "e.request.method!=='GET'||url.origin!==location.origin" not in sw_content:
    errors.append("Service worker must only intercept same-origin GET requests")
if "./privacy.html" not in sw_content or "./404.html" not in sw_content or "./auth.js" not in sw_content or "./learning.js" not in sw_content or "./currency.js" not in sw_content:
    errors.append("Service worker must include the privacy and not-found pages in its app shell cache")

auth_path = ROOT / "auth.js"
if not auth_path.is_file():
    errors.append("Missing auth.js")
else:
    auth_content = auth_path.read_text(encoding="utf-8")
    for required_text in ("username-auth", "auth/v1/token?grant_type=password", "reset_password", "rest/v1/user_data", "sb_publishable_"):
        if required_text not in auth_content:
            errors.append(f"auth.js is missing required account flow element: {required_text}")
    if "service_role" in auth_content or "sb_secret_" in auth_content:
        errors.append("Privileged Supabase credentials must never appear in auth.js")

privacy_content = (ROOT / "privacy.html").read_text(encoding="utf-8") if (ROOT / "privacy.html").is_file() else ""
if "не зашифрованы отдельным паролем" not in privacy_content:
    errors.append("Privacy policy must disclose that local app data is not separately encrypted")

# Public launch assets must exist and the GitHub Pages 404 route must be useful.
try:
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    for icon in manifest.get("icons", []):
        icon_path = icon.get("src", "")
        if icon_path and not (ROOT / icon_path.removeprefix("./")).is_file():
            errors.append(f"Missing PWA icon referenced by manifest.json: {icon_path}")
except Exception:
    pass

not_found_path = ROOT / "404.html"
if not not_found_path.is_file():
    errors.append("Missing 404.html for GitHub Pages")
else:
    not_found_html = not_found_path.read_text(encoding="utf-8")
    if "Content-Security-Policy" not in not_found_html:
        errors.append("Missing Content-Security-Policy in 404.html")
    if re.search(r"<script\b", not_found_html, flags=re.I):
        errors.append("404.html must not contain scripts")
    if 'href="./"' not in not_found_html:
        errors.append("404.html must provide a link back to the app")

if errors:
    print("Release validation failed:")
    for error in errors:
        print(f"- {error}")
    sys.exit(1)

print(f"Release validation passed. Checked CSP, {len(scripts)} inline script(s), manifest, sitemap, and public-client secret patterns.")
