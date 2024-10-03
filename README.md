# DavDebrid

A self-hosted WebDAV server for Debrid-Link, automatically organizing your media files (Movies/TV Shows) for seamless integration with your media center. Changes are detected in 30sec, allowing updates to instantly appear in your Plex library. The rclone mount is optimized to minimize bandwidth usage from debrid.

## Installation

### Run with Docker

```bash
docker run -d \
  --name=davdebrid \
  -p 8080:8080 \
  --restart unless-stopped \
  -e DEBRID_ID=debridlink \
  -e DEBRID_API_KEY=apikey \
  -e DATA_FOLDER=/data \
  -v /path/to/data:/data \
  arvida42/davdebrid:latest
```

Your server is available on http://localhost:8080

You can mount it locally with rclone by using the following command:
```bash
export RCLONE_CONFIG_DAV_TYPE=webdav
export RCLONE_CONFIG_DAV_URL=http://localhost:8080
export RCLONE_CONFIG_DAV_VENDOR=other
rclone mount dav: /mnt/dav \
  --dir-cache-time 5s \
  --allow-other \
  --vfs-cache-mode full \
  --vfs-cache-max-size 500M \
  --vfs-read-chunk-size 4M \
  --vfs-read-chunk-size-limit 256M \
  --vfs-fast-fingerprint \
  --read-only \
  --allow-non-empty
```

### Run with Docker Compose and Mount with Rclone

1. Download the [`downloader-compose.yml`](./docker-compose.yml) file.
2. Edit the `DEBRID_API_KEY`. You can obtain it from [Debrid-Link API Key](https://debrid-link.com/webapp/apikey).
3. By default, the mount point is set to a Docker volume (`davdebrid-mnt`). You can change this to a local folder if preferred.
4. Run the following command to start the services:
  ```bash
  docker compose up -d
  ```

### Run with Docker Compose, Mount with Rclone, and Run the Plex Server

1. Download the [`downloader-compose-plex.yml`](./docker-compose-plex.yml) file.
2. Edit the `DEBRID_API_KEY`. You can get it from [Debrid-Link API Key](https://debrid-link.com/webapp/apikey).
3. Edit the `PLEX_CLAIM`. You can obtain it from [Plex Claim Token](https://plex.tv/claim).
4. Run the following command to start the services:
  ```bash
  docker compose -f docker-compose-plex.yml up -d
  ```
5. To automatically update your Plex library when changes are detected in Debrid. Go to Plex at http://localhost:32400, open Developer Tools, run the command `localStorage.myPlexAccessToken` and copy the result into the `PLEX_TOKEN` setting.
6. Restart the services with the updated configuration:
  ```bash
  docker compose -f docker-compose-plex.yml up -d
  ```
7. In Plex settings, under Library, set the following options to "**never**":
  - Generate video preview thumbnails
  - Generate chapter thumbnails
  - Analyze audio tracks for loudness
8. Finally, configure Plex to use your WebDAV mount. The WebDAV is mounted at `/mnt/dav`.

## Configuration

All configurations are documented in the [config.js file](./src/lib/config.js)