#!/usr/bin/env python3
"""Validate and package the checked-in extension; no source bundle regeneration.

The original background/popup/tokenizer sources and bundler are not in this
checkout. Existing bundles are release inputs, not regenerated from new stubs.
Requires Python 3.8+ and Node 18+; no package installation or network access.
"""

import hashlib
import json
import re
import subprocess
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
# Deliberately explicit: never include .opencode, attachments, local config,
# node_modules, test fixtures, previous zips, or anything else in the checkout.
RELEASE_FILES = (
    "manifest.json", "aon-config.js", "aquatrace-logo.svg",
    "dist/background.bundle.js", "dist/content.bundle.js", "dist/popup.bundle.js",
    "product-context.js", "shopping-offers.js", "shopping-history.js", "shopping-session.js",
    "onboarding.html", "onboarding.css", "onboarding.js",
    "popup.html", "popup.css", "methodology.html", "methodology.css", "CHANGELOG.md",
    "icons/icon16.png", "icons/icon48.png", "icons/icon128.png",
)


def main():
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["manifest_version"] == 3
    assert manifest["minimum_chrome_version"] == "114"
    assert re.fullmatch(r"\d+\.\d+\.\d+", manifest["version"])
    assert len(manifest["description"]) <= 132
    referenced = {manifest["background"]["service_worker"], manifest["action"]["default_popup"]}
    referenced.update(manifest["icons"].values())
    for script in manifest["content_scripts"]:
        referenced.update(script["js"])
    for html in ["popup.html", "onboarding.html", "methodology.html"]:
        text = (ROOT / html).read_text(encoding="utf-8")
        referenced.update(re.findall(r'<script\b[^>]*\bsrc="([^"]+)"', text))
        referenced.update(re.findall(r'<link\b[^>]*\bhref="([^"]+)"', text))
    assert referenced.issubset(RELEASE_FILES), f"Unpackaged references: {referenced - set(RELEASE_FILES)}"
    for name in RELEASE_FILES:
        assert (ROOT / name).is_file(), f"Missing release input: {name}"
        if name.endswith(".js"):
            subprocess.run(["node", "--check", name], cwd=ROOT, check=True)
    tests = sorted(str(path.relative_to(ROOT)) for path in (ROOT / "test").glob("*.test.js"))
    assert tests, "No regression tests found"
    subprocess.run(["node", "--test", *tests], cwd=ROOT, check=True)

    destination = ROOT / "build" / f'AquaTrace-{manifest["version"]}.zip'
    destination.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name in sorted(RELEASE_FILES):
            # Fixed timestamps and permissions make repeated builds byte-identical.
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, (ROOT / name).read_bytes())
    with zipfile.ZipFile(destination) as archive:
        assert archive.testzip() is None
        assert set(archive.namelist()) == set(RELEASE_FILES)
        assert json.loads(archive.read("manifest.json"))["version"] == manifest["version"]
    print(f"Validated and packaged {len(RELEASE_FILES)} files: {destination.relative_to(ROOT)}")
    print(f"SHA-256: {hashlib.sha256(destination.read_bytes()).hexdigest()}")
    print("Original bundle sources are absent; this packages the carefully patched runtime bundles.")


if __name__ == "__main__":
    main()
