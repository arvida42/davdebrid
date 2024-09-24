export default {
  // WebDAV server port
  port: parseInt(process.env.PORT || 8080),
  // WebDAV server username
  user: process.env.USER,
  // WebDAV server password
  pass: process.env.PASS,
  // The debrid service to use
  debridId: process.env.DEBRID_ID || 'debridlink',
  // Your debrid api key
  debridApiKey: process.env.DEBRID_API_KEY || '',
  // Send your IP to debrid
  debridIp: process.env.DEBRID_IP || '',
  // Plex url to update your library when change are detected: http://host
  plexUrl: process.env.PLEX_URL || '',
  // Plex token to update your library when change are detected
  plexToken: process.env.PLEX_TOKEN || '',
  // Data folder for cache database ... Must be persistent in production
  dataFolder: process.env.DATA_FOLDER || '/tmp',
  // Partials scan from debrid API, only add recent detected files
  checkNewFilesInterval: Math.max(15, process.env.CHECK_NEW_FILES_INTERVAL || 30),
  // Full scan from debrid API, sync all files (deleted / added)
  checkAllFilesInterval: Math.max(60, process.env.CHECK_ALL_FILES_INTERVAL || 900)
}