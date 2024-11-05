# DavDebrid

A self-hosted WebDAV server for Debrid-Link, automatically organizing your media files (Movies/TV Shows) for seamless integration with your media center. Changes are detected in 30sec, allowing updates to instantly appear in your Plex library. The rclone mount is optimized to minimize bandwidth usage from debrid.

## Installation

### Run with Docker

```bash
# Create a volume
docker volume create davdebrid_data

# Run the container
docker run -d \
  --name=davdebrid \
  -p 8080:8080 \
  --restart unless-stopped \
  -e DEBRID_ID=debridlink \
  -e DEBRID_API_KEY=apikey \
  -e DATA_FOLDER=/data \
  -v davdebrid_data:/data \
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
  --allow-non-empty
```

### Run with Docker Compose and Mount with Rclone

1. Download the [`downloader-compose.yml`](./docker-compose.yml) file.
2. Edit the `DEBRID_API_KEY`. You can obtain it from [Debrid-Link API Key](https://debrid-link.com/webapp/apikey).
3. By default, the mount point is set to a Docker volume (`davdebrid-mnt`). You can change this to a local directory if preferred.
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

### Server

All server configurations are documented in the [config.js file](./src/lib/config.js)

### Folder organizing

When you mount the WebDAV server, you’ll find a `Config` directory containing two files:

- **`config.yml`**: This is the default configuration file for your directories. It provides base settings and is read-only, so it cannot be modified.
- **`config.custom.yml`**: This is your customizable configuration file. You can edit it to define and apply your own organization rules for directories, which will override the default configuration.

Each directory configuration is processed sequentially in the order specified in the configuration file.

#### Folder Properties
- **`name`**: The display name for the directory at the root of your WebDAV.
- **`unique`**: Specifies whether the directory is unique. Files in non-unique directories can also appear in other matching directories. Files cannot appear in more than one unique directory.
- **`cond`**: The condition used to determine which files are in the directory.

#### Condition Types
- **`regex`**: Matches files based on the specified regex pattern.
- **`minVideosInParent`**: Requires that the file be located within a parent directory containing at least `n` video files.
- **`fileTypes`**: Defines the acceptable file types (e.g., `video`, `subtitle`, `music`, `image`, `unknown`).
- **`or`**: Applies an `OR` logic across the listed conditions.
- **`and`**: Applies an `AND` logic across conditions. This is the default behavior and doesn’t need to be explicitly specified.


For example, the default organization rules:

```yaml
# Default Configuration - Cannot be Overwritten
# To customize, please edit the 'config.custom.yml' file.

# Folder Organizer Conditions
# Files available on the debrid service will be organized into directories based on specified conditions.
# If a file matches a 'unique' directory condition, no further `unique` directory conditions will be checked for that file.

directories:

  # This directory contains all files, regardless of type.
  # Since this is not a unique condition, files may also appear in other applicable directories.
  - name: 'All'
    unique: false
    cond: {}

  # This directory contains only video and subtitle files that match the specified regex 
  # or are located within a parent directory containing more than six video files 
  # (e.g., torrent with multiple videos).
  - name: 'Shows'
    unique: true
    cond:
      or:
        regex: '[0-9]+E[0-9]+|[0-9]+x[0-9]+'
        minVideosInParent: 6
      fileTypes:
        - 'video'
        - 'subtitle'

  # This directory contains all remaining video and subtitle files that do not match the conditions of previous unique directories (Shows).
  - name: 'Movies'
    unique: true
    cond:
      fileTypes:
        - 'video'
        - 'subtitle'

```