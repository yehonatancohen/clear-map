"""Build public/data/polygons.min.json from public/data/polygons.json.

Rounds coordinates to 5 decimals (~1 m) and drops consecutive duplicates.
Rounding is deterministic, so borders shared by neighbouring zones stay
identical and polygon unions don't grow slivers. Cuts the compressed download
from ~1.1 MB to ~0.4 MB. Only the frontend copy is minified; the backend and
screenshot service keep the full-precision file.

    python scripts/minify-polygons.py
"""
import json
from pathlib import Path

PRECISION = 5
DATA = Path(__file__).resolve().parent.parent / "public" / "data"

src = json.loads((DATA / "polygons.json").read_text(encoding="utf-8"))
out = {}
for name, entry in src.items():
    entry = dict(entry)
    points = []
    for lat, lng in entry.get("polygon") or []:
        p = [round(lat, PRECISION), round(lng, PRECISION)]
        if not points or points[-1] != p:
            points.append(p)
    entry["polygon"] = points
    out[name] = entry

dest = DATA / "polygons.min.json"
dest.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"{len(out)} zones → {dest.name} ({dest.stat().st_size / 1e6:.2f} MB)")
