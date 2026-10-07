/**
 * Trip Recap — Cloudflare Email Worker.
 *
 * Cloudflare Email Routing hands every email sent to your address (e.g.
 * trips@calvi.dev) to this Worker, which posts the raw email to Trip Recap.
 * Trip Recap reads the booking, adds the trips and logs it under Settings.
 *
 * Settings → Variables and Secrets:
 *   TRIP_RECAP_URL  e.g. https://trips.calvi.dev   (text)
 *   APP_TOKEN       same value as APP_TOKEN in Trip Recap's .env  (secret)
 *
 * Setup guide: docs/EMAIL_FORWARDING.md
 */
export default {
  async email(message, env) {
    const raw = await new Response(message.raw).arrayBuffer();
    let res;
    try {
      res = await fetch(`${env.TRIP_RECAP_URL.replace(/\/$/, "")}/api/inbound-email`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.APP_TOKEN}`,
          "Content-Type": "message/rfc822",
        },
        body: raw,
      });
    } catch (e) {
      // Bounce instead of silently losing the email: you'll get a delivery-failure notice.
      message.setReject(`Trip Recap unreachable: ${e}`);
      return;
    }
    if (!res.ok) message.setReject(`Trip Recap answered ${res.status}`);
  },
};
