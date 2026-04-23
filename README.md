# Met Open Access D3 Choropleth

This project is a static D3 app that visualizes where artifacts in The Metropolitan Museum of Art collection come from.

## What it does

- Loads local data from `met_objects_sample.json`
- Builds a world choropleth map (country color = number of artifacts)
- Includes a period filter:
  - Ancient (before 500 CE)
  - Medieval (500-1499)
  - Early Modern (1500-1799)
  - Modern (1800-1944)
  - Contemporary (1945+)

## Run locally

Because this is a static app, you can open `index.html` directly or use any static server.

## Deploy to GitHub Pages

1. Push this folder to a GitHub repository.
2. In the repository settings, enable **Pages**.
3. Set the source to your main branch and root directory.
4. Open the generated Pages URL.

## Notes

- The app does not call the live API; it reads from your local JSON file.
- If you want a fresh dataset, regenerate `met_objects_sample.json` with:
  - `python3 scrape_met_data.py --source csv --sample-size 20000 --output met_objects_sample.json`
- Country names are normalized where possible, but some records may not match perfectly to world map naming.
