# Working Hours

A personal time tracker in the browser: start/stop a timer per project, add entries by hand,
see daily and weekly totals, export/import JSON and CSV. Data stays in this browser's localStorage.

## Run

    npm install
    npm run dev      # http://localhost:5173
    npm test
    npm run build    # static site in dist/ (relative paths, any static host)

## Notes

- Data is per browser and per address: localhost and a deployed URL have separate data.
  Move it with Settings & Data → Export JSON / Import JSON.
- Away detection works while the page is open (a background tab is fine). Chrome/Edge can
  also detect a locked screen when enabled in Settings.
- If Chrome's Memory Saver discards the tab, reopening it may ask about time you were not away;
  choose "Keep as work", or exclude the site from Memory Saver.
