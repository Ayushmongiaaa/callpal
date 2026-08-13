"""Pre-analyzed calls, loaded into an empty database on boot.

Why this exists
---------------

Two facts about free hosting make the deployed app look broken through no fault
of its own:

1. **The disk is ephemeral.** A free instance sleeps after inactivity, and every
   restart rebuilds the SQLite file empty. Anything analyzed yesterday is gone.
2. **The transcript provider throttles by IP, not just by key.** Free hosts put
   many tenants behind one shared address, so requests get refused regardless of
   this key's own usage — and no amount of code changes whose address the
   request comes from.

Between them, a visitor could open the live site, find an empty library, try the
company search, and hit a wall — while the app itself is working perfectly.

Seeding removes that entirely. A handful of real analyses load on every boot, so
the library, the trends, the comparison view and the alerts are always populated
and every page has something to show.

What this is not
----------------

These are not written by hand or invented to look good. `export_seed.py`
produces this file from calls that were genuinely analyzed by this pipeline, on
a machine where the provider works. It is the same output, computed once instead
of on every cold start — never a mock-up standing in for one.

Seeds never overwrite real work: loading is skipped entirely if the database
already has calls in it.
"""

import json
import os

SEED_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "seed_calls.json")


def load(store) -> int:
    """Insert the seed calls if the library is empty. Returns how many landed."""
    if not os.path.exists(SEED_PATH):
        return 0

    # Never touch a database that already has something in it.
    if store.stats().get("calls", 0) > 0:
        return 0

    try:
        with open(SEED_PATH, "r", encoding="utf-8") as fh:
            calls = json.load(fh)
    except (ValueError, OSError):
        # A malformed seed file must not stop the API from starting. An app that
        # boots with an empty library is a much smaller problem than one that
        # does not boot.
        return 0

    if not isinstance(calls, list):
        return 0

    added = 0

    for call in calls:
        if not isinstance(call, dict):
            continue

        analysis = call.get("analysis")
        transcript = call.get("transcript") or ""
        chunks = call.get("chunks") or []

        if not isinstance(analysis, dict) or not transcript:
            continue

        try:
            store.save(
                call.get("id") or f"seed-{added}",
                analysis,
                chunks,
                transcript,
                call.get("source") or "transcript",
            )
            added += 1
        except Exception:  # noqa: BLE001 - one bad row must not stop the rest
            continue

    return added
