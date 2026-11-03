#!/usr/bin/env python3
"""
Regenerates ai_catalog_fallback.json, the AI component catalog bundled with the LS.

1. Fetches every ballerina/ai version and the ballerinax/ai.* packages that depend on it from Ballerina Central,
   and writes them to the "modules" section.
2. Runs the generateAiCatalogFallback Gradle task, which pulls and compiles each module version the catalog can
   select and writes its AI components to the "components" section. Versions already in the file are not scanned
   again.

Run it before a release, or after new AI connectors are published. Needs a JDK that the LS Gradle wrapper supports.

Usage:
    python3 scripts/update_ai_catalog_fallback.py
"""

import json
import os
import subprocess
import sys
import urllib.request
from pathlib import Path

CENTRAL_REST = "https://api.central.ballerina.io/2.0/registry/packages/ballerina/ai"
CENTRAL_GRAPHQL = "https://api.central.ballerina.io/2.0/graphql"
LS_ROOT = Path(__file__).resolve().parent.parent / "packages" / "ballerina-language-server"
CATALOG_FILE = (
    LS_ROOT / "flow-model-generator" / "modules" / "flow-model-generator-core"
    / "src" / "main" / "resources" / "ai_catalog_fallback.json"
)
GENERATOR_TASK = ":flow-model-generator:flow-model-generator-core:generateAiCatalogFallback"


def fetch_json(url, data=None):
    headers = {"Content-Type": "application/json"} if data else {}
    with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=headers)) as resp:
        return json.loads(resp.read().decode())


def semver_key(version):
    return [int(part) for part in version.split(".")]


def fetch_modules():
    versions = sorted(fetch_json(CENTRAL_REST), key=semver_key)
    print(f"Found {len(versions)} ballerina/ai versions")

    aliases = {"v" + v.replace(".", "_"): v for v in versions}
    parts = [
        f'{alias}: package(orgName: "ballerina", packageName: "ai", version: "{v}") '
        f"{{ dependentPackages {{ organization name version }} }}"
        for alias, v in aliases.items()
    ]
    query = json.dumps({"query": "query Package { " + " ".join(parts) + " }"}).encode()
    result = fetch_json(CENTRAL_GRAPHQL, query)["data"]

    # Every version gets a key, even with no dependents, so the generator scans ballerina/ai at that version.
    return {
        version: [
            {"org": d["organization"], "name": d["name"], "version": d["version"]}
            for d in (result.get(alias) or {}).get("dependentPackages", [])
            if d["organization"] == "ballerinax" and d["name"].startswith("ai.")
        ]
        for alias, version in aliases.items()
    }


def main():
    modules = fetch_modules()
    components = {}
    if CATALOG_FILE.exists():
        components = json.loads(CATALOG_FILE.read_text(encoding="utf-8")).get("components", {})
    catalog = {"modules": modules, "components": components}
    CATALOG_FILE.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {sum(len(m) for m in modules.values())} module entries to {CATALOG_FILE}")

    print("Scanning module versions without components (this pulls packages from Central)...")
    gradlew = LS_ROOT / ("gradlew.bat" if os.name == "nt" else "gradlew")
    result = subprocess.run([str(gradlew), GENERATOR_TASK], cwd=LS_ROOT)
    components = json.loads(CATALOG_FILE.read_text(encoding="utf-8")).get("components", {})
    print(f"{len(components)} module versions have components")
    if result.returncode != 0:
        print("Some module versions could not be scanned; see 'Could not scan' in the output above.")
    sys.exit(result.returncode)


if __name__ == "__main__":
    main()
