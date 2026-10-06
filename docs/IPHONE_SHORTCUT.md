# Nightly location check-in (iPhone Shortcuts)

Once a night, your iPhone sends its location to Trip Recap. That records where
you slept, so your days per city and country stay correct even when you forget to log
a trip (road trips, staying with friends, a train you didn't add).

You need your app's URL (e.g. `https://trips.example.com`) and your `APP_TOKEN`.

## 1. Create the shortcut

Shortcuts app → **Shortcuts** tab → **+** → name it **Trip Check-in**.

1. Add **Get Current Location**.
2. Add **Format Date**: Date = *Current Date*, Format = *Custom*, `yyyy-MM-dd`.
3. Add **Get Contents of URL**:
   - URL: `https://YOUR-APP/api/checkin`
   - Tap **▸** to expand → Method **POST**
   - Headers → **Add new header**: `Authorization` = `Bearer YOUR_APP_TOKEN`
   - Request Body **JSON**, add fields:
     | Key | Type | Value |
     |---|---|---|
     | `latitude` | Text | *Current Location* → tap it → **Latitude** |
     | `longitude` | Text | *Current Location* → **Longitude** |
     | `date` | Text | *Formatted Date* |
4. (Optional) Add **Show Notification** with *Contents of URL* so you can see
   “Logged Lisbon, PT for 2026-10-06”.

Run it once by hand. It should show up under **Settings → Recent check-ins** in the app.

## 2. Run it every night

Shortcuts → **Automation** → **+** → **Time of Day**
- Time: **23:00** (or whenever you're usually where you'll sleep)
- Repeat: **Daily**
- Choose **Run Immediately** (and turn off *Notify When Run* if you like)
- Next → pick **Trip Check-in**.

## How it's counted

- A check-in means you were in that city on that date, and you stay there until
  your next trip or check-in.
- Check-ins take priority over trips. If a trip says Madrid but your phone was in
  Toledo that night, the night counts for Toledo.
- City and country come from OpenStreetMap. If that lookup fails, the app uses the
  city of the nearest airport instead.

## Troubleshooting

- **401**: the header must be exactly `Bearer <token>`, with one space after `Bearer`.
- **Location permission**: the first time the automation runs, iOS may ask to
  allow Shortcuts to use your location. Choose *Always Allow*.
- Check-ins can be deleted in Settings → Recent check-ins.

## Same endpoint, other tools

```bash
curl -X POST https://YOUR-APP/api/checkin \
  -H "Authorization: Bearer $APP_TOKEN" -H "Content-Type: application/json" \
  -d '{"lat": 38.72, "lon": -9.14, "date": "2026-10-06"}'
```
