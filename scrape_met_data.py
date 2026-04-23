#!/usr/bin/env python3
import argparse
import csv
import json
import random
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
  parser.add_argument("--sample-size", type=int, default=2500, help="Number of objects to sample.")
  parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducibility.")
  parser.add_argument("--output", default="met_objects_sample.json", help="Output JSON filename.")
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

  with urllib.request.urlopen(request, timeout=60) as response:
    lines = (line.decode("utf-8", errors="replace") for line in response)
    reader = csv.DictReader(lines)

    all_rows = []
    for row in reader:
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

  random.seed(args.seed)
  sample_size = min(args.sample_size, len(all_rows))
  sampled = random.sample(all_rows, sample_size)

  payload = {
    "source": CSV_URL,
    "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "sampleSizeRequested": args.sample_size,
    "sampleSizeFetched": sample_size,
    "recordsWithCountryAndDateAvailable": len(all_rows),
    "recordsWithCountryAndDate": len(sampled),
    "stats": {
      "csv_rows_kept_for_pool": len(all_rows),
      "csv_rows_sampled": len(sampled)
    },
    "records": sampled
  }

  with open(args.output, "w", encoding="utf-8") as f:
    json.dump(payload, f, ensure_ascii=False, indent=2)

  elapsed = time.time() - started
  print(f"Wrote {len(sampled)} filtered records to {args.output} in {elapsed:.1f}s")


if __name__ == "__main__":
  main()
