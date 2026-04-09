#!/usr/bin/env -S uv run

import json
from pathlib import Path
import subprocess
import re
import sys

import uvicorn
import requests
import cyclopts
from liquid import Environment, FileSystemLoader
from livereload import Server

from vizlib import API_URL, SAMPLE_DATA_FILE
from vizlib.server import app

cli = cyclopts.App()


DIST = Path(__file__).parent / 'dist'
RENDERED_INDEX = DIST / 'index.html'
PROD_API_URL = 'https://snek.taila15010.ts.net/api/data'
DEV_API_URL = 'http://127.0.0.1:5000/api/data'


def bundle() -> None:
    subprocess.run(
        ["npx", "esbuild", "src/index.js", "--bundle", "--minify", "--format=esm", "--outfile=dist/bundle.js"],
        check=True,
    )


@cli.default
def main(*, host: str = "127.0.0.1", port: int = 5000, reload: bool = False) -> None:
    uvicorn.run("vizlib.server:app", host=host, port=port, reload=reload, server_header=False)


@cli.command()
def render(environment: str = 'dev') -> None:
    """Render templates/index.html.liquid into dist/index.html for production."""
    rendering_environment = {
        'script_src': "./bundle.js",
        'dev': False,
        'api_url': DEV_API_URL if environment == 'dev' else PROD_API_URL,
    }

    DIST.mkdir(exist_ok=True)

    env = Environment(loader=FileSystemLoader("templates/"))
    template = env.get_template("index.html.liquid")
    rendered_template = template.render(**rendering_environment)
    RENDERED_INDEX.write_text(rendered_template)


@cli.command()
def dev(*, port: int = 3000) -> None:
    """Start dev server with livereload (bundled JS)."""
    DIST.mkdir(exist_ok=True)
    bundle()
    render()
    server = Server()
    server.watch("templates/index.html.liquid", render)
    server.watch("src/*.js", bundle)
    server.serve(root="./dist/", port=port, open_url_delay=None)


@cli.command()
def fetch_sample():
    resp = requests.get(API_URL)
    data = resp.json()
    SAMPLE_DATA_FILE.write_text(json.dumps(data, indent=2))


@cli.command()
def pingscan(*, ip_only: bool = False) -> None:
    """Scan local network and find the Raspberry Pi."""

    # 1. Discover local subnet via `ip route`
    result = subprocess.run(["ip", "route", "show"], capture_output=True, text=True, check=True)
    subnet = None
    for line in result.stdout.splitlines():
        m = re.match(r"(\d+\.\d+\.\d+\.\d+/\d+)\s+dev", line)
        if m and not line.startswith("default"):
            subnet = m.group(1)
            break

    if not subnet:
        if not ip_only:
            print("Could not determine local subnet from ip route")
        sys.exit(1)

    if not ip_only:
        print(f"Scanning {subnet} ...")

    # 2. Ping scan with nmap
    scan = subprocess.run(["nmap", "-sn", subnet], capture_output=True, text=True)

    if scan.returncode != 0:
        if not ip_only:
            print("nmap not found or failed. Install with: sudo apt install nmap")
        sys.exit(1)

    if not ip_only:
        print(scan.stdout)

    # 3. Highlight Pi candidates
    lines = scan.stdout.splitlines()
    pi_hosts = []
    current_host = None
    candidate_strings = ['raspberry pi', 'pi.hole', 'pihole', 'pi-hole']
    for line in lines:
        if line.startswith("Nmap scan report for"):
            current_host = line.removeprefix("Nmap scan report for ").strip()
        for candidate in candidate_strings:
            if (candidate in line.lower()) and current_host:
                pi_hosts.append(current_host)

    if pi_hosts:
        if ip_only:
            host = pi_hosts[0]
            m = re.search(r'\((\d+\.\d+\.\d+\.\d+)\)', host)
            print(m.group(1) if m else host)
        else:
            print("=== Raspberry Pi candidates ===")
            for h in pi_hosts:
                print(f"  {h}")
    else:
        if not ip_only:
            print("No Raspberry Pi MAC vendor match found — check hostnames above.")
        sys.exit(1)


if __name__ == "__main__":
    cli()
