# Contabo VPS deployment

The supported Contabo setup uses host Nginx, private Docker application ports, MongoDB Atlas, and private Redis.

Follow the [canonical VPS deployment guide](vps-deployment-guide.md). It references the actual production Compose file, scripts, HTTPS setup, existing Atlas data preservation, manual GitHub release workflow, rollback, and off-server backup/restore procedure.

Provider-specific preparation: obtain the VPS IP and SSH access from Contabo, provision an Ubuntu server with enough build memory, configure a non-root deployment account, and point your chosen hostname at the IP. Verify provider and host firewalls allow SSH/HTTP/HTTPS. The same runbook works for another VPS provider.

The earlier duplicated Compose and shell-script examples have been superseded by the checked-in files. Use HTTPS on your chosen hostname; a particular temporary DNS provider is not required. Review billing and cancellation independently in your provider account.