#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "loguru",
# ]
# ///

import os
import pwd
import shutil
import stat
import subprocess
import sys
from pathlib import Path

from loguru import logger

REPO = "https://github.com/TheDataLeek/toronto-viz.git"
INSTALL_DIR = Path("/opt/toronto-viz")
SERVICE_NAME = "toronto-viz"


def main() -> None:
    user, home = service_user()
    logger.info("Starting toronto-viz install")
    logger.info("  repo:    {}", REPO)
    logger.info("  target:  {}", INSTALL_DIR)
    logger.info("  service: {}", SERVICE_NAME)
    logger.info("  user:    {} (home: {})", user, home)

    ensure_uv()
    sync_repo(user)

    run_sh = INSTALL_DIR / "deploy" / "run.sh"
    run_sh.chmod(run_sh.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

    logger.info("Syncing dependencies (no-dev)...")
    run("uv", "sync", "--no-dev", "--project", str(INSTALL_DIR), as_user=user)
    logger.info("Dependencies synced")

    logger.info("Installing systemd service unit (User={})...", user)
    install_service(user)

    logger.info("Install complete. Service status:")
    subprocess.run(["systemctl", "status", SERVICE_NAME, "--no-pager"], check=False)


def service_user() -> tuple[str, Path]:
    """Return (username, home) for the real caller.

    When invoked via `sudo`, SUDO_USER holds the original user's name.
    Fall back to the current process owner.
    """
    name = os.environ.get("SUDO_USER") or pwd.getpwuid(os.getuid()).pw_name
    entry = pwd.getpwnam(name)
    return name, Path(entry.pw_dir)


def ensure_uv() -> None:
    if shutil.which("uv"):
        logger.info("uv already installed: {}", capture("uv", "--version"))
        return

    logger.info("uv not found — installing...")
    env = os.environ.copy()
    if os.getuid() == 0:
        # Running as root: install to /usr/local/bin so all users can find it
        env["UV_INSTALL_DIR"] = "/usr/local/bin"
        logger.info("  target: /usr/local/bin (system-wide)")
    else:
        logger.info("  target: ~/.local/bin")

    subprocess.run("curl -LsSf https://astral.sh/uv/install.sh | sh", shell=True, env=env, check=True)

    if os.getuid() != 0:
        local_bin = Path.home() / ".local" / "bin"
        os.environ["PATH"] = f"{local_bin}:{os.environ['PATH']}"

    logger.info("uv installed: {}", capture("uv", "--version"))


def sync_repo(user: str) -> None:
    if (INSTALL_DIR / ".git").exists():
        logger.info("Repo exists — pulling latest...")
        before = capture("git", "-C", str(INSTALL_DIR), "rev-parse", "--short", "HEAD", as_user=user)
        run("git", "-C", str(INSTALL_DIR), "pull", "--ff-only", as_user=user)
        after = capture("git", "-C", str(INSTALL_DIR), "rev-parse", "--short", "HEAD", as_user=user)
        if before == after:
            logger.info("Already up to date ({})", after)
        else:
            logger.info("Updated {} → {}", before, after)
    else:
        logger.info("Cloning repo to {} ...", INSTALL_DIR)
        INSTALL_DIR.mkdir(parents=True, exist_ok=True)
        entry = pwd.getpwnam(user)
        os.chown(INSTALL_DIR, entry.pw_uid, entry.pw_gid)
        run("git", "clone", REPO, str(INSTALL_DIR), as_user=user)
        rev = capture("git", "-C", str(INSTALL_DIR), "rev-parse", "--short", "HEAD", as_user=user)
        logger.info("Cloned at {}", rev)


def install_service(user: str) -> None:
    template = (INSTALL_DIR / "deploy" / f"{SERVICE_NAME}.service").read_text()
    unit = template.replace("__SERVICE_USER__", user)
    dest = Path(f"/etc/systemd/system/{SERVICE_NAME}.service")
    dest.write_text(unit)
    logger.info("Wrote {}", dest)

    run("systemctl", "daemon-reload")
    logger.info("Enabling {} ...", SERVICE_NAME)
    run("systemctl", "enable", SERVICE_NAME)
    logger.info("Restarting {} ...", SERVICE_NAME)
    run("systemctl", "restart", SERVICE_NAME)

    enable_funnel()


def enable_funnel() -> None:
    if not shutil.which("tailscale"):
        logger.warning("tailscale not found — skipping funnel setup")
        logger.warning("  Install tailscale, then run: sudo tailscale funnel 5000")
        return

    logger.info("Enabling Tailscale Funnel on port 5000...")
    run("tailscale", "funnel", "5000")
    logger.info("Funnel enabled — service is publicly accessible via Tailscale")


def run(*cmd: str, as_user: str | None = None, check: bool = True) -> subprocess.CompletedProcess:
    full = ["sudo", "-u", as_user, *cmd] if as_user else list(cmd)
    return subprocess.run(full, check=check)


def capture(*cmd: str, as_user: str | None = None) -> str:
    full = ["sudo", "-u", as_user, *cmd] if as_user else list(cmd)
    return subprocess.run(full, capture_output=True, text=True, check=True).stdout.strip()


if __name__ == "__main__":
    main()
