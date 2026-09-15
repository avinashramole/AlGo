#!/usr/bin/env python3
"""Split nginx location / proxy-to-4000 into static dist + /api/ proxy. Idempotent."""
from __future__ import annotations

import pathlib
import re
import sys

SEARCH_ROOTS = [
    pathlib.Path("/etc/nginx/conf.d"),
    pathlib.Path("/etc/nginx/sites-enabled"),
    pathlib.Path("/etc/nginx/nginx.conf"),
]

NEW_BLOCK = """
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_connect_timeout 2s;
        proxy_send_timeout 15s;
        proxy_read_timeout 15s;
    }

    location / {
        root /opt/t2s/dist;
        try_files $uri $uri/ /index.html;
    }
""".rstrip()

LOCATION_RE = re.compile(
    r"location\s+/\s*\{(?:[^{}]|\{[^{}]*\})*proxy_pass\s+http://127\.0\.0\.1:4000[^;]*;(?:[^{}]|\{[^{}]*\})*\}",
    re.DOTALL,
)


def iter_confs():
    seen = set()
    for root in SEARCH_ROOTS:
        if root.is_file():
            yield root
            continue
        if not root.is_dir():
            continue
        for path in sorted(root.rglob("*")):
            if path.suffix in {".conf", ".inc", ""} and path.is_file():
                key = str(path.resolve())
                if key in seen:
                    continue
                seen.add(key)
                yield path


def already_split(text: str) -> bool:
    return "root /opt/t2s/dist" in text and "location /api/" in text


def patch_text(text: str) -> str:
    if already_split(text):
        return text
    if "proxy_pass http://127.0.0.1:4000" not in text:
        return text
    next_text, count = LOCATION_RE.subn(NEW_BLOCK, text, count=8)
    return next_text if count else text


def main() -> int:
    changed = 0
    scanned = 0
    for path in iter_confs():
        try:
            original = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        scanned += 1
        updated = patch_text(original)
        if updated == original:
            continue
        bak = path.with_suffix(path.suffix + ".bak-t2s504")
        if not bak.exists():
            bak.write_text(original, encoding="utf-8")
        path.write_text(updated, encoding="utf-8")
        print(f"patched {path}")
        changed += 1
    print(f"scanned:{scanned} patched:{changed}")
    return 0 if scanned else 1


if __name__ == "__main__":
    sys.exit(main())
