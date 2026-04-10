#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "loguru",
#   "rich",
# ]
# ///

import os
import pwd
import shlex
import shutil
import stat
import subprocess
from pathlib import Path
from typing import Union

import rich.console
import rich.padding
import rich.syntax
import rich.text
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
    run_cmd(["uv", "sync", "--no-dev", "--project", str(INSTALL_DIR)], as_user=user)
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
        logger.info(
            "uv already installed: {}",
            run_cmd(["uv", "--version"], show_output=False, silent=True),
        )
        return

    logger.info("uv not found — installing...")
    env = os.environ.copy()
    if os.getuid() == 0:
        # Running as root: install to /usr/local/bin so all users can find it
        env["UV_INSTALL_DIR"] = "/usr/local/bin"
        logger.info("  target: /usr/local/bin (system-wide)")
    else:
        logger.info("  target: ~/.local/bin")

    subprocess.run(
        "curl -LsSf https://astral.sh/uv/install.sh | sh",
        shell=True,
        env=env,
        check=True,
    )

    if os.getuid() != 0:
        local_bin = Path.home() / ".local" / "bin"
        os.environ["PATH"] = f"{local_bin}:{os.environ['PATH']}"

    logger.info(
        "uv installed: {}", run_cmd(["uv", "--version"], show_output=False, silent=True)
    )


def sync_repo(user: str) -> None:
    if (INSTALL_DIR / ".git").exists():
        logger.info("Repo exists — pulling latest...")
        before = run_cmd(
            ["git", "-C", str(INSTALL_DIR), "rev-parse", "--short", "HEAD"],
            as_user=user,
            show_output=False,
            silent=True,
        )
        run_cmd(
            ["git", "-C", str(INSTALL_DIR), "reset", "--hard", "HEAD"], as_user=user
        )
        run_cmd(["git", "-C", str(INSTALL_DIR), "pull", "--ff-only"], as_user=user)
        after = run_cmd(
            ["git", "-C", str(INSTALL_DIR), "rev-parse", "--short", "HEAD"],
            as_user=user,
            show_output=False,
            silent=True,
        )
        if before == after:
            logger.info("Already up to date ({})", after)
        else:
            logger.info("Updated {} → {}", before, after)
    else:
        logger.info("Cloning repo to {} ...", INSTALL_DIR)
        INSTALL_DIR.mkdir(parents=True, exist_ok=True)
        entry = pwd.getpwnam(user)
        os.chown(INSTALL_DIR, entry.pw_uid, entry.pw_gid)
        run_cmd(["git", "clone", REPO, str(INSTALL_DIR)], as_user=user)
        rev = run_cmd(
            ["git", "-C", str(INSTALL_DIR), "rev-parse", "--short", "HEAD"],
            as_user=user,
            show_output=False,
            silent=True,
        )
        logger.info("Cloned at {}", rev)


def install_service(user: str) -> None:
    template = (INSTALL_DIR / "deploy" / f"{SERVICE_NAME}.service").read_text()
    unit = template.replace("__SERVICE_USER__", user)
    dest = Path(f"/etc/systemd/system/{SERVICE_NAME}.service")
    dest.write_text(unit)
    logger.info("Wrote {}", dest)

    run_cmd(["systemctl", "daemon-reload"])
    logger.info("Enabling {} ...", SERVICE_NAME)
    run_cmd(["systemctl", "enable", SERVICE_NAME])
    logger.info("Restarting {} ...", SERVICE_NAME)
    run_cmd(["systemctl", "restart", SERVICE_NAME])


def run_cmd(
    cmd: Union[str, list[str]],
    *,
    as_user: str | None = None,
    show_output: bool = True,
    silent: bool = False,
    **subprocess_kwargs,
) -> str:
    console = rich.console.Console()

    if isinstance(cmd, (list, tuple)):
        cmd = " ".join(shlex.quote(str(c)) for c in cmd)
    if as_user:
        cmd = f"sudo -u {shlex.quote(as_user)} {cmd}"

    kwargs = {"shell": True, "capture_output": True, "text": True, **subprocess_kwargs}
    process = subprocess.run(cmd, **kwargs)
    output = process.stdout.strip()
    error = process.stderr.strip()

    if not silent:
        console.print(
            rich.console.Group(
                rich.text.Text("$~~>", end=" "),
                rich.text.Text(cmd, style="bold green"),
            )
        )

    if process.returncode != 0:
        console.print(
            rich.padding.Padding(rich.syntax.Syntax(error, "bash"), (0, 0, 0, 2))
        )
        console.print(
            rich.text.Text(
                "Unexpected error occurred while running the command.", style="bold red"
            )
        )
        raise SystemError(error)

    if show_output:
        if output:
            console.print(
                rich.padding.Padding(rich.syntax.Syntax(output, "bash"), (0, 0, 0, 2))
            )
        if error:
            console.print(
                rich.padding.Padding(rich.syntax.Syntax(error, "bash"), (0, 0, 0, 2))
            )
    elif not silent:
        console.print(
            rich.padding.Padding(
                rich.text.Text("result truncated", style="lightgrey"),
                (0, 0, 0, 2),
                style="dim",
            )
        )

    return output


if __name__ == "__main__":
    main()
