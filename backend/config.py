"""Environment lookups that notice when .env has changed.

`uvicorn --reload` watches Python files, not .env, so adding a key to .env and
waiting for a reload silently does nothing — the process keeps the environment
it started with and the app reports the key as missing. That is a confusing
failure: the file plainly contains the key.

`setting()` re-reads .env whenever a name is absent from the environment, so a
key added while the server is running is picked up on the next request instead
of needing a manual restart.
"""

import os

from dotenv import load_dotenv

ENV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")

_placeholders = {"", "your-key-here", "paste_your_key_here", "changeme"}


def setting(name: str, default: str = "") -> str:
    value = os.getenv(name, "").strip()

    if value in _placeholders:
        # Absent or still a placeholder: the file may have been edited since
        # this process started.
        load_dotenv(ENV_PATH, override=True)
        value = os.getenv(name, "").strip()

    return default if value in _placeholders else value
