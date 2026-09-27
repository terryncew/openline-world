"""Fixture study for RESEARCH-COMMONS-001 (labeled demonstration fixture).

Reads input.csv (tide readings transcribed from the harbor log fixture),
computes the mean tide height, and prints exactly one JSON line on stdout.
Stdlib only: csv, json, sys. No network, no file writes, no imports beyond
the standard library.
"""
import csv
import json
import sys


def main() -> int:
    readings = []
    with open("input.csv", newline="", encoding="utf-8") as f:
        # Comment lines (starting with '#') are labels, not data.
        rows = (line for line in f if not line.lstrip().startswith("#"))
        for row in csv.DictReader(rows):
            readings.append(float(row["height_m"]))
    if not readings:
        print(json.dumps({"error": "no readings"}))
        return 1
    mean_height = sum(readings) / len(readings)
    print(json.dumps({
        "mean_tide_height_m": round(mean_height, 2),
        "n": len(readings),
        "period": "2026-Q3",
        "source": "harbor-log readings CSV (fixture transcription)",
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
