# Trip Recap

A self-hosted, Flighty-style travel log. It tracks flights plus trains, drives, buses
and ferries, and it counts **how many days and nights you spent in every country and city**.

- 🗺️ **3D globe map** (MapLibre) of every trip: glowing great-circle arcs for flights and dashed lines for ground
  trips. Places you stayed are small, even dots. Tap a trip to see its details card (route, times, distance, flight). It switches to a flat map with one tap. A built-in world outline means the globe
  works even if the online map tiles can't load.
- ➕ **Add trips by hand.** Airport search runs on a built-in IATA database (~7,900 airports).
  Train, drive, bus and ferry stops are searched on OpenStreetMap.
- 📅 **Days per country and city**, filterable by year. **Where you slept** is a share bar of nights per
  country (nights abroad up top). **Day by day** is a year calendar with every night coloured by its country;
  tap a day to see where you were. You also get a list of stays and a Schengen 90/180 counter.
- 🌙 **Nightly iPhone check-in.** A Shortcuts automation posts your location every
  night, which fills the gaps between trips. See [docs/IPHONE_SHORTCUT.md](docs/IPHONE_SHORTCUT.md).
- 🚗 **Auto-detected trips.** When two check-ins in a row are in different cities more than 50 km apart,
  a trip is created between them. It's assumed to be a drive, or a flight if it's over 1,000 km. Moves you
  already logged (by hand or from Gmail) are skipped. Edited auto trips are kept as you left them, and
  deleted ones don't come back.
- 🧳 **Trip groups, automatic.** Each time you
  leave home (the city where you've spent the most nights) and come back becomes one group, named after
  the countries you visited. A group shows as one card with its dates, legs, km and flags, and its route
  is highlighted on the map. New legs join the journey that's still open. Use **Edit groups** to change them by hand; trips you ungroup stay ungrouped.
- ✈️ **Flighty import.** Upload Flighty's CSV export in Settings. You get real departure and arrival
  times (actual first, then scheduled), airlines, aircraft and seats, and diversions handled. Re-importing
  updates flights in place. Real flights replace the trips guessed from check-ins and keep their groups.
  Ground legs between flights that don't connect (e.g. Hannover → Düsseldorf) are added as guesses you can edit.
  Where your flights already place you, they beat country-only check-ins.
- 📨 **Email forwarding** (like Flighty): forward booking emails to e.g. trips@calvi.dev, by hand or with a
  Gmail filter. A Cloudflare Email Worker hands them to the app. It reads airline markup, or uses Claude for the text
  and PDF e-tickets, and skips flights you already have. See [docs/EMAIL_FORWARDING.md](docs/EMAIL_FORWARDING.md).
- 📧 **Gmail import.** It reads airline and rail booking emails through their schema.org markup.
  It can also use Claude for emails that don't have that markup.
- 📊 **Stats**: distance, time in the air, airports, airlines, top routes.
- 🔄 **Hands-off.** The app refreshes itself when you open it and every minute. Auto trips and groups are
  rebuilt after every import, check-in or email. Settings shows each source (check-in, email, Flighty) with a
  status light and when it last delivered.
- 📱 Installable on your home screen (PWA), with a dark map UI.

## How days are counted

Your location only changes when something happens: a trip departs, a trip arrives, or a check-in comes in.

| | Meaning |
|---|---|
| **Night** | Where you were at the end of the day. A red-eye or multi-day drive still underway at midnight counts as *in transit* and goes to no place. |
| **Day** | Every place you were in during that day. A travel day counts for **both** ends. This is how most residency and Schengen rules count days. |

Check-ins win over trips. Planned (future) trips show in the list but don't count until they happen.
The logic is in `src/lib/stays.ts`, with tests in `test/stays.test.ts`.

## Why not Google Maps?

You don't need it. The map is MapLibre with free OpenFreeMap vector tiles on top of a built-in Natural Earth world outline.
Place search and reverse geocoding use OpenStreetMap Nominatim, and airports come from a bundled
dataset. So there's no API key, no billing account and no quota to manage.

## Running it

```bash
cp .env.example .env.local     # set APP_TOKEN at minimum
npm install
npm run dev                    # http://localhost:3000
npm test                       # day-counting tests
```

Data lives in SQLite at `$DATA_DIR/trip-recap.db` (default `./data`).

### Deploy on a Raspberry Pi / home server (docker compose)

```bash
git clone https://github.com/Calvidev/Trip-Recap.git && cd Trip-Recap
cp .env.example .env && nano .env      # set APP_TOKEN and APP_URL
docker compose up -d --build           # app on port 3100
# one-off import of an existing location log:
curl -X POST --data-binary @ubicaciones.csv -H "Content-Type: text/csv" \
  -H "Authorization: Bearer $APP_TOKEN" http://localhost:3100/api/checkins/import
```

### Deploy elsewhere

Use any host with a persistent disk: Fly.io, Railway, Render with a disk, a VPS, or a home server.
**Vercel's serverless filesystem won't keep the SQLite file.**

```bash
docker build -t trip-recap .
docker run -d -p 3000:3000 -v trip-data:/data \
  -e APP_TOKEN=... -e APP_URL=https://trips.example.com trip-recap
```

The iPhone Shortcut needs to reach the app over HTTPS from the internet. A cheap VPS
with Caddy works. So does a home server behind Tailscale Funnel or a Cloudflare Tunnel.

## Gmail import setup

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project and **enable the Gmail API**.
2. **OAuth consent screen**: choose *External*, add yourself as a test user, and add the scope `gmail.readonly`.
3. **Credentials → Create OAuth client ID → Web application**. Add the redirect URI
   `https://YOUR-APP/api/gmail/callback`.
4. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `APP_URL`, then restart.
5. In the app, go to **Settings → Connect Gmail → Sync now**.

How emails are parsed:
1. It searches for itinerary, confirmation, boarding-pass and e-ticket subjects, in English and Spanish.
2. It reads schema.org `FlightReservation` / `TrainReservation` / `BusReservation` markup. Most
   airlines and OTAs include it, since it powers Gmail's own trip cards. This step is free and exact.
3. If an email has no markup and `ANTHROPIC_API_KEY` is set, Claude extracts the legs. It skips
   marketing emails and cancellations.
4. Trips are de-duplicated by mode + number + date + route, so booking, check-in and boarding-pass
   emails for the same flight produce one trip. Each email is processed only once.

To sync automatically, have a cron job call it:
```bash
curl -X POST -H "Authorization: Bearer $APP_TOKEN" https://YOUR-APP/api/gmail/sync
```
(Or add that as a second step in the nightly Shortcut.)

## API

All endpoints need the `tr_token` cookie or `Authorization: Bearer $APP_TOKEN`.

| Method | Path | |
|---|---|---|
| GET | `/api/data` | all trips + check-ins (also your backup) |
| POST | `/api/trips` | add trip |
| PUT/DELETE | `/api/trips/:id` | edit / delete |
| POST | `/api/checkin` | `{lat, lon, date?, time?, city?, country?}` |
| DELETE | `/api/checkins/:id` | |
| GET | `/api/airports?q=` | airport search |
| GET | `/api/geocode?q=` | place search (OSM) |
| POST | `/api/gmail/sync` | import from Gmail |

## Ideas / next steps

- Import Flighty's CSV export or a TripIt feed
- Reverse-geocode check-ins against Google Maps Timeline exports for past years
- Real road distance for drives (OSRM)
