# Docker Setup

This project can be run with Docker and Docker Compose. This includes:
- The Next.js admin portal app
- SuperTokens Core
- PostgreSQL database for SuperTokens Core
- Persistent volumes for audit logs

## Quick Start

1. Clone the repository
2. Run with Docker Compose:
   ```bash
   docker compose up -d
   ```
3. Access the app at [http://localhost:3000](http://localhost:3000)
4. Login with the default admin credentials (see environment variables below)

## Default Credentials

The docker-compose.yml contains default credentials for testing. **CHANGE THESE IN PRODUCTION**.

| Service | Default Value |
|---|---|
| Admin Email | admin@example.com |
| Admin Password | change-me-strong-password-min-12-chars |
| Session Secret | change-me-this-should-be-at-least-32-characters-long |
| Core API Key | core-api-key-change-me |
| Postgres Password | supertokens_password |

## Environment Variables

You can customize the setup by creating a `.env` file or modifying the environment section in `docker-compose.yml`. See `.env.example` for all available options.

## Volumes

The following volumes are created for persistence:
- `postgres_data` - PostgreSQL data for SuperTokens Core
- `supertokens_data` - SuperTokens Core data
- `audit_data` - Audit log SQLite database (`/app/data` in container)

## Useful Commands

```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f app
docker compose logs -f supertokens-core

# Stop all services
docker compose down

# Stop and remove volumes (WARNING: deletes all data)
docker compose down -v

# Rebuild the app after code changes
docker compose build app
docker compose up -d app
```

## Troubleshooting

1. **App can't connect to SuperTokens Core**: Ensure `SUPERTOKENS_CONNECTION_URI` points to `http://supertokens-core:3567` (internal Docker network). The app and core must be on the same network.

2. **Health check fails**: The SuperTokens Core image may not have `wget` installed. If the health check fails, you can remove or adjust it in docker-compose.yml.

3. **Audit DB permissions**: The app runs as non-root user (uid 1001) and the `/app/data` directory is owned by that user. If you have permission issues, ensure the volume is properly mounted.

4. **Better-sqlite3 native module**: The Dockerfile builds native modules in the deps stage. If you run into issues on Apple Silicon, you may need to specify the platform: `docker compose --platform linux/amd64 up`.
