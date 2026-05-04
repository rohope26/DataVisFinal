#!/usr/bin/env python3
import argparse
import csv
import json
import time
import urllib.request

CSV_URL = "https://media.githubusercontent.com/media/metmuseum/openaccess/master/MetObjects.csv"
DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json"
}

def main():
    parser = argparse.ArgumentParser(description="Build a local Met dataset JSON from Open Access CSV.")
    parser.add_argument("--source", choices=["csv"], default="csv", help="Only CSV mode is supported.")
    parser.add_argument("--output", default="met_objects_all.json", help="Output JSON filename.")
    args = parser.parse_args()
    run_csv_mode(args)

def parse_int(value):
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return int(text)
    except ValueError:
        return None

def run_csv_mode(args):
    print("Downloading Open Access CSV stream...")
    request = urllib.request.Request(CSV_URL, headers=DEFAULT_HEADERS)
    started = time.time()

    with urllib.request.urlopen(request, timeout=120) as response:
        lines = (line.decode("utf-8", errors="replace") for line in response)
        reader = csv.DictReader(lines)

        all_rows = []
        for i, row in enumerate(reader):
            if i % 10000 == 0 and i > 0:
                print(f"  ...processed {i:,} rows, kept {len(all_rows):,} so far")

            country = (row.get("Country") or "").strip()
            object_begin = parse_int(row.get("Object Begin Date"))

            if country and object_begin is not None:
                all_rows.append(
                    {
                        "objectID": parse_int(row.get("Object ID")),
                        "title": row.get("Title"),
                        "department": row.get("Department"),
                        "country": country,
                        "culture": row.get("Culture"),
                        "period": row.get("Period"),
                        "objectDate": row.get("Object Date"),
                        "objectBeginDate": object_begin,
                        "objectEndDate": parse_int(row.get("Object End Date")),
                        "classification": row.get("Classification"),
                        "isHighlight": (row.get("Is Highlight") or "").strip().lower() == "true",
                        "isPublicDomain": (row.get("Is Public Domain") or "").strip().lower() == "true",
                        "primaryImageSmall": row.get("Primary Image Small"),
                        "objectURL": row.get("Object URL")
                    }
                )

    if not all_rows:
        raise RuntimeError("No rows with country + numeric objectBeginDate found in CSV.")

    print(f"Done reading CSV. Total records with country + date: {len(all_rows):,}")

    payload = {
        "source": CSV_URL,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "totalRecordsWithCountryAndDate": len(all_rows),
        "records": all_rows
    }

    print(f"Writing {len(all_rows):,} records to {args.output}...")
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    elapsed = time.time() - started
    print(f"Done. Wrote {len(all_rows):,} records to '{args.output}' in {elapsed:.1f}s")

if __name__ == "__main__":
    main()