# Add trips by forwarding emails (like Flighty)

Send booking emails to your own address, for example **trips@calvi.dev**. Trip Recap
reads them and adds the flights, trains and buses.

```
Gmail ──(filter auto-forwards)──▶ trips@calvi.dev ──Cloudflare Email Routing──▶ Email Worker ──▶ trips.calvi.dev
```

All of this is free on Cloudflare. Trip Recap only sees the emails you send it,
not your whole inbox.

How emails are read:
1. Airline schema.org markup, when the email has it. This is free and exact.
2. Otherwise Claude reads the text and any **PDF attachments** (e-tickets, boarding passes).
   This step only runs if `ANTHROPIC_API_KEY` is set in `.env`.
3. A flight you already have (from Flighty, an earlier email or added by hand) isn't added twice.
   Guessed trips are replaced by the real flight.

Each email and what happened to it shows under **Settings → Email forwarding**.

---

## 1. Turn on Cloudflare Email Routing

> ⚠️ Email Routing takes over the domain's **MX records**. If `calvi.dev` already
> receives email somewhere else (Google Workspace, iCloud, …), don't do this on the
> root domain. Use a subdomain instead, e.g. `trips@in.calvi.dev`, in the
> same screen.

Cloudflare dashboard → **calvi.dev** → **Email** → **Email Routing** → **Get started / Enable**.
Accept the DNS records it adds (MX + TXT).

## 2. Create the Email Worker

**Email** → **Email Routing** → **Email Workers** → **Create**:

1. Name it `trip-recap-inbound` and start from the "Allowlist senders" or blank template.
2. Replace the code with [`cloudflare/email-worker/worker.js`](../cloudflare/email-worker/worker.js) and **Deploy**.
3. Worker → **Settings** → **Variables and Secrets**:
   - `TRIP_RECAP_URL` = `https://trips.calvi.dev` (Text)
   - `APP_TOKEN` = the value of `APP_TOKEN` in `~/Trip-Recap/.env` (**Secret**)
     On the Pi: `grep APP_TOKEN ~/Trip-Recap/.env`

(Or from a computer with Node: `cd cloudflare/email-worker && npx wrangler deploy && npx wrangler secret put APP_TOKEN`.)

## 3. Route the address to the Worker

**Email Routing** → **Routing rules** → **Create address**:
- Custom address: `trips` (→ trips@calvi.dev)
- Action: **Send to a Worker** → `trip-recap-inbound`

**Test it:** forward any flight confirmation to trips@calvi.dev, then open Trip Recap →
Settings → Email forwarding. The email shows up with its result. If something
goes wrong, Cloudflare bounces the email back to you with the reason.

Optional: add `INBOUND_EMAIL_ADDRESS=trips@calvi.dev` to `.env` so Settings shows the address.

## 4. Let Gmail forward automatically

**a. Add the forwarding address.** Gmail on a computer → ⚙️ **See all settings** →
**Forwarding and POP/IMAP** → **Add a forwarding address** → `trips@calvi.dev`.
Gmail emails a confirmation code to that address. It shows up in **Trip Recap →
Settings → Email forwarding** within a few seconds. Copy the code back into Gmail.

Leave "Disable forwarding" selected on that page. You only want the filter below to
forward, not every email.

**b. Create the filter.** Paste this into Gmail's search bar, then click the filter icon (⚙ ▾) → **Create filter**:

```
from:(aeromexico.com OR vivaaerobus.com OR volaris.com OR united.com OR aa.com OR delta.com OR southwest.com OR alaskaair.com OR jetblue.com OR aircanada.com OR copaair.com OR avianca.com OR latam.com OR britishairways.com OR ba.com OR iberia.com OR lufthansa.com OR klm.com OR airfrance.com OR turkishairlines.com OR thy.com OR flypgs.com OR sunexpress.com OR emirates.com OR qatarairways.com OR ryanair.com OR easyjet.com OR expedia.com OR booking.com OR despegar.com OR trip.com OR kayak.com OR amtrak.com OR renfe.com OR bahn.de OR trainline.com OR flixbus.com) subject:(confirmación OR confirmation OR itinerario OR itinerary OR reserva OR reservation OR booking OR "e-ticket" OR "boarding pass" OR "pase de abordar" OR "tarjeta de embarque" OR boleto OR billete)
```

→ **Forward it to:** `trips@calvi.dev` → **Create filter**.

The filter only applies to **new** emails. For an older one, open it and forward it by hand.
Your past flights are already covered by the Flighty import.

Add airlines to the `from:` list whenever you fly a new one. Promotional emails that get
through are ignored ("No trip found").

## Troubleshooting

| Symptom | Fix |
|---|---|
| Bounce: "Trip Recap answered 401" | `APP_TOKEN` in the Worker doesn't match `.env` |
| Bounce: "unreachable" / 5xx | Is the app up? `curl -I https://trips.calvi.dev/login` |
| "No trip found" for a real booking | Set `ANTHROPIC_API_KEY` in `.env` and `docker compose up -d` |
| "Couldn't place airports" | Add the trip by hand. The email named a place the app couldn't find. |
| Nothing at all arrives | Check Email Routing → **Activity log** in Cloudflare |
