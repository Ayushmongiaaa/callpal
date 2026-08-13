"""Write the calls in the local database out to seed_calls.json.

Run this on a machine where analysis works — your own laptop — after analyzing
the calls you want the deployed site to open with:

    cd backend && python export_seed.py

Then commit `seed_calls.json`. Every future deployment boots with those calls
already in its library, so the live site is never an empty shell, and it costs
no API requests to do it.

The point of exporting rather than writing the file by hand is that these stay
real: genuine output from this pipeline, not a plausible-looking imitation of
it. Re-run this whenever you want to refresh what the demo opens with.
"""

import json
import os
import sys

import store

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "seed_calls.json")

# Enough to fill every page — library, trends, comparison — without bloating the
# repository. Transcripts are the large part; three is a few hundred KB.
MAX_CALLS = 3

# How far back to look for those three. Re-analyzing the same call while testing
# is completely normal, so the newest three rows are often the same call three
# times — which would seed the demo with three identical companies.
SCAN = 40


def main() -> int:
    store.init()

    library = store.recent(limit=SCAN)

    if not library:
        print("No calls in the local database yet.")
        print("Analyze a call or two first, then run this again.")
        return 1

    out = []
    seen = set()
    skipped = 0

    for row in library:
        if len(out) >= MAX_CALLS:
            break

        # One call per company and quarter. The demo should show a range of
        # companies, not the same one repeated.
        key = (row.get("ticker") or row.get("company") or "", row.get("quarter") or "")
        if key in seen:
            skipped += 1
            continue
        seen.add(key)

        call = store.get(row["id"])
        if not call:
            continue

        out.append(
            {
                # The id comes from the library row, not from get(): get()
                # returns the call's contents, not its identity.
                "id": row["id"],
                "analysis": call["analysis"],
                "chunks": call["chunks"],
                "transcript": call["transcript"],
                "source": call.get("source") or "transcript",
            }
        )

    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=1)

    size = os.path.getsize(OUT) / 1024
    print(f"Wrote {len(out)} call(s) to seed_calls.json  ({size:.0f} KB)")
    for call in out:
        a = call["analysis"]
        print(f"  · {a.get('company', '?')} — {a.get('quarter', '?')}")

    if skipped:
        print(f"\nSkipped {skipped} repeat analysis(es) of a call already included.")

    if len(out) < 2:
        print(
            "\nOnly one company here. Analyze a couple of others and run this "
            "again — the Compare and Trends pages need more than one to show "
            "anything."
        )

    print("\nCommit that file and every deployment will boot with these calls.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
