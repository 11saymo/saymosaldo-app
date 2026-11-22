from html.parser import HTMLParser
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
        "connect-src": ["'self'"],
    }
    for name, values in required.items():
        if directives.get(name) != values:
            errors.append(f"CSP directive {name} must be exactly {' '.join(values)}")
    script_policy = directives.get("script-src", [])
    if "'unsafe-inline'" in script_policy or "'unsafe-eval'" in script_policy:
        errors.append("CSP script-src must not allow unsafe-inline or unsafe-eval")

if parser.external_scripts:
    errors.append("External script sources are not allowed: " + ", ".join(parser.external_scripts))
if parser.external_styles:
    errors.append("External stylesheets are not allowed: " + ", ".join(parser.external_styles))

scripts = re.findall(r"<script\b[^>]*>(.*?)</script\s*>", html, flags=re.I | re.S)
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

for filename in ("index.html", "sw.js", "manifest.json"):
    content = (ROOT / filename).read_text(encoding="utf-8")
    if re.search(r"\bservice_role\b|\bsb_secret_[A-Za-z0-9_]+", content, flags=re.I):
        errors.append(f"Possible privileged Supabase key found in {filename}")


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
    if not re.search(r'<meta[^>]+http-equiv=["\\']Content-Security-Policy["\\']', not_found_html, flags=re.I):
        errors.append("Missing Content-Security-Policy in 404.html")
    if re.search(r"<script\\b", not_found_html, flags=re.I):
        errors.append("404.html must not contain scripts")
    if 'href="./"' not in not_found_html:
        errors.append("404.html must provide a link back to the app")

if errors:
    print("Release validation failed:")
    for error in errors:
        print(f"- {error}")
    sys.exit(1)

print(f"Release validation passed. Checked CSP, {len(scripts)} inline script(s), manifest, sitemap, and public-client secret patterns.")
