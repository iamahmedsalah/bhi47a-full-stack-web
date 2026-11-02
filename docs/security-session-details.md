# Login history and session network details

Logout preserves `lastLoginAt` and `lastActiveAt`; `lastLogoutAt` marks logout.
The active-user query excludes a logout newer than activity. Old Unix-epoch
sentinels display as unavailable; the next successful login records a real date.
Do not replace missing historical dates with deployment time.

Staff tables/details, student details and security sessions use Africa/Cairo.
Sessions retain their original creation/expiry while `lastAuthenticatedAt`
records a verified repeat sign-in. Refreshing details does not record a login
or extend a session. No collection rewrite or migration is required.

## VPS public IP configuration

`172.18.0.1` is a Docker gateway/private address, so it cannot identify a visitor's
internet provider or approximate location. The API deliberately does not send
private addresses to the geolocation service or present them as visitor public IPs.

1. Confirm the running API's gateway:

   ```sh
   docker inspect "$(docker compose --env-file .env.prod -f docker-compose.prod.yml ps -q api)" --format '{{range .NetworkSettings.Networks}}{{.Gateway}}{{println}}{{end}}'
   ```

2. Confirm host Nginx uses the repository configuration, overwrites
   `X-Forwarded-For` with `$remote_addr`, and the API port is bound to loopback.
   Allow only that observed proxy peer in `.env.prod`. For the reported
   `172.18.0.1` gateway, after confirming it:

   ```dotenv
   TRUST_PROXY_CIDRS=172.18.0.1/32
   SESSION_IP_LOOKUP_ENABLED=true
   ```

   Do not trust every private address, every forwarded header, or all proxies.
   Check the gateway again after recreating the Docker network. If a CDN proxies
   the domain, configure Nginx real-IP handling for that CDN's exact trusted
   address ranges before expecting visitor addresses here.

3. Check the currently running API image before recreating it:

   ```sh
   docker inspect "$(docker compose --env-file .env.prod -f docker-compose.prod.yml ps -q api)" --format '{{.Config.Image}}'
   ```

   Preserve its release tag, or use the normal deployment workflow for this new
   code. An environment-only fix can recreate the API using the confirmed tag:

   ```sh
   RELEASE_TAG=YOUR_CONFIRMED_RELEASE_TAG docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --no-deps --force-recreate --wait api
   ```

   Verify these two settings in the actual running container without printing
   unrelated environment variables or secrets:

   ```sh
   docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T api node -e "console.log({trustedProxy:process.env.TRUST_PROXY_CIDRS||'(none)',ipLookup:process.env.SESSION_IP_LOOKUP_ENABLED||'true'})"
   ```

4. Open account security and **Refresh sessions** on each device. Only the
   requesting session's network metadata is refreshed; another device's location
   is never copied from the current visitor. Test once from Wi-Fi and once from
   a separate mobile network. Shared routers, carrier NAT and VPNs can legitimately
   produce the same public IP for different sessions. Sessions use unique IDs,
   never IP addresses, as identity.

## Provider, coordinates and physical connection

Public IP lookup uses a fixed HTTPS IPWhois endpoint, a 1.5-second timeout and
bounded caching. Failure never blocks verified sign-in. ISP falls back to the
reported organization; recognized Egyptian names show WE, Vodafone, Etisalat or
Orange while keeping the source name. Vercel edge location can also be enriched
with provider data. Provider and coordinates remain unavailable if the lookup
has no reliable data or is disabled. Coordinates describe the IP's estimated
location, not GPS or a street address.

Wi-Fi, mobile data and Ethernet cable labels use only the browser's physical
`connection.type` when supported (including prefixed APIs). `effectiveType: 4g`
is a speed estimate and must not be labeled as mobile data. Many browsers do
not expose a physical transport type. Their value stays unavailable even when
IP/provider data works. This browser hint is not authentication evidence.

References: [Express proxy configuration](https://expressjs.com/en/guide/behind-proxies/),
[Network Information API](https://wicg.github.io/netinfo/),
[IPWhois documentation](https://ipwhois.io/documentation).
