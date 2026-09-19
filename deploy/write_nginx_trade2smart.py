#!/usr/bin/env python3
"""Write nginx config that Chrome can open (HTTP + HTTPS).

nginx must not `root` a path under /root — the nginx user cannot read it,
which returns 500 and makes https://trade2smart.com look like a refused tab.
Static files go to /var/www/trade2smart. /api/ goes to Node on 127.0.0.1:4000.
main() always writes listen 443 ssl (Let's Encrypt, or a 30-day self-signed cert)
so Chrome HSTS does not show ERR_CONNECTION_REFUSED.
AlmaLinux 8 ships Python 3.6 — keep this file 3.6-safe (no future annotations).
"""
import argparse
import subprocess
from pathlib import Path

from typing import Optional, Tuple

DEFAULT_WEBROOT = "/var/www/trade2smart"
CERT_DIR = Path("/etc/letsencrypt/live/trade2smart.com")
SELF_SIGNED_CRT = Path("/etc/nginx/t2s-selfsigned.crt")
SELF_SIGNED_KEY = Path("/etc/nginx/t2s-selfsigned.key")


def _pair_in(folder: Path) -> Optional[Tuple[Path, Path]]:
    if not folder:
        return None
    fullchain = folder / "fullchain.pem"
    privkey = folder / "privkey.pem"
    if fullchain.exists() and privkey.exists():
        return fullchain, privkey
    chains = sorted(folder.glob("fullchain*.pem"))
    keys = sorted(folder.glob("privkey*.pem"))
    if chains and keys:
        return chains[-1], keys[-1]
    return None


def cert_files(cert_dir: Path = CERT_DIR) -> Optional[Tuple[Path, Path]]:
    direct = _pair_in(Path(cert_dir))
    if direct:
        return direct
    if Path(cert_dir) != CERT_DIR:
        return None
    live = Path("/etc/letsencrypt/live")
    if live.is_dir():
        named = _pair_in(live / "trade2smart.com") or _pair_in(live / "www.trade2smart.com")
        if named:
            return named
        for folder in sorted(live.iterdir()):
            found = _pair_in(folder)
            if found:
                return found
    archive = Path("/etc/letsencrypt/archive")
    if archive.is_dir():
        for folder in sorted(archive.iterdir()):
            found = _pair_in(folder)
            if found:
                return found
    return None


def ensure_self_signed(crt: Path = SELF_SIGNED_CRT, key: Path = SELF_SIGNED_KEY) -> Tuple[Path, Path]:
    if crt.exists() and key.exists():
        return crt, key
    crt.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "openssl",
            "req",
            "-x509",
            "-nodes",
            "-newkey",
            "rsa:2048",
            "-days",
            "30",
            "-keyout",
            str(key),
            "-out",
            str(crt),
            "-subj",
            "/CN=trade2smart.com",
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )
    return crt, key


def _proxy_block(target: str, send_timeout: str = "15s", read_timeout: str = "15s") -> str:
    return f"""        proxy_pass {target};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_connect_timeout 2s;
        proxy_send_timeout {send_timeout};
        proxy_read_timeout {read_timeout};"""


def server_locations(webroot: str) -> str:
    login = _proxy_block("http://127.0.0.1:3999", "8s", "8s")
    api = _proxy_block("http://127.0.0.1:4000", "15s", "15s")
    return f"""
    client_max_body_size 2m;

    location = /api/health {{
{login}
    }}

    location = /api/login {{
{login}
    }}

    location = /api/me {{
{login}
    }}

    location ^~ /api/auth/google {{
{login}
    }}

    location ^~ /api/auth/otp/ {{
{login}
    }}

    location = /api/auth/reset {{
{login}
    }}

    location = /api/auth/signup {{
{login}
    }}

    location ^~ /api/auth/thumb {{
{login}
    }}

    location /api/ {{
{api}
    }}

    location / {{
        root {webroot};
        try_files $uri $uri/ /index.html;
    }}
""".rstrip()


def render_nginx_conf(
    webroot: str = DEFAULT_WEBROOT,
    cert_dir: Path = CERT_DIR,
    ssl_pair: Optional[Tuple[Path, Path]] = None,
) -> str:
    locations = server_locations(webroot)
    certs = ssl_pair or cert_files(cert_dir)
    if certs:
        fullchain, privkey = certs
        http_server = """
server {
    listen 80;
    listen [::]:80;
    server_name trade2smart.com www.trade2smart.com;
    return 301 https://$host$request_uri;
}
""".rstrip()
        https_server = f"""
server {{
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name trade2smart.com www.trade2smart.com;
    ssl_certificate {fullchain};
    ssl_certificate_key {privkey};
    ssl_protocols TLSv1.2;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
{locations}
}}
""".rstrip()
    else:
        http_server = f"""
server {{
    listen 80;
    listen [::]:80;
    server_name trade2smart.com www.trade2smart.com;
{locations}
}}
""".rstrip()
        https_server = ""

    return (
        "# Generated by deploy/write_nginx_trade2smart.py\n"
        "# Static files from /var/www/trade2smart (nginx cannot read /root/download/algo).\n"
        "# Login/health go to 127.0.0.1:3999 so Chrome can sign in if quotes on :4000 hang.\n"
        "# Other /api/ goes to Node on 127.0.0.1:4000.\n"
        "\n"
        "upstream t2s_api {\n"
        "    server 127.0.0.1:4000 fail_timeout=3s max_fails=2;\n"
        "}\n"
        f"{http_server}\n"
        f"{https_server}\n"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--webroot", default=DEFAULT_WEBROOT)
    parser.add_argument("--cert-dir", default=str(CERT_DIR))
    parser.add_argument("--out", default="/etc/nginx/conf.d/trade2smart.conf")
    args = parser.parse_args()
    certs = cert_files(Path(args.cert_dir))
    kind = "letsencrypt"
    if not certs:
        certs = ensure_self_signed()
        kind = "selfsigned"
    text = render_nginx_conf(args.webroot, Path(args.cert_dir), ssl_pair=certs)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text, encoding="utf-8")
    print(f"wrote {out} certs={kind} {certs[0]}")


if __name__ == "__main__":
    main()
