import http from 'http';
import {basename} from 'path';
import {vacuum as vacuumCache, clean as cleanCache} from './lib/cache.js';
import config from './lib/config.js';
import * as debrid from './lib/debrid.js';
import Debriddav from './lib/davdebrid.js';

const server = http.createServer(async (req, res) => {

  try {

    if(basename(req.url).startsWith('.') || req.url == '/favicon.ico'){
      res.writeHead(404);
      res.end('Ignored file');
      return;
    }

    console.log(`${req.method}: ${req.url}`);

    if(config.user && config.pass){

      // Basic authentication
      const authHeader = req.headers['authorization'];
      if (!authHeader || !authHeader.startsWith('Basic ')) {
        res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="WebDAV"' });
        res.end('Unauthorized');
        return;
      }

      const encodedCredentials = authHeader.split(' ')[1];
      const decodedCredentials = Buffer.from(encodedCredentials, 'base64').toString('utf8');
      const [user, pass] = decodedCredentials.split(':', 2);

      if(user !== config.user || pass !== config.pass){
        res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="WebDAV"' });
        res.end('Unauthorized');
        return;
      }

    }

    const path = decodeURIComponent(req.url);
    const debridIp = config.debridIp || (req.socket.remoteAddress.startsWith('::ffff:') ? req.socket.remoteAddress.substring(7) : req.socket.remoteAddress);
    const {debridId, debridApiKey} = config;

    if(!debridId || !debridApiKey){
      console.log(`debridId and debridApiKey are required`);
      res.writeHead(500);
      res.end('Server not configured');
      return;
    }

    if(req.headers['sec-fetch-mode']){
      console.log(`Using DavDebrid in a browser is not supported. Please use a dedicated WebDAV client instead.`);
    }

    const dav = new Debriddav({debridId, debridApiKey, debridIp});

    if(req.method === 'PROPFIND'){

      const files = await dav.listFiles(path);
      const xmlResponse = generatePropfindResponse(path, files);

      res.writeHead(207, {
        'Content-Type': 'application/xml; charset="utf-8"',
      });
      res.end(xmlResponse);

    }else if(req.method === 'GET'){

      if(path == '/'){
        res.writeHead(400);
        res.end(`Using DavDebrid in a browser is not supported. Please use a dedicated WebDAV client instead.`);
        return;
      }

      const fileUrl = await dav.getFileUrl(path);

      if(fileUrl){
        const parsed = new URL(fileUrl);
        const cut = (value) => value ?  `${value.substr(0, 5)}******${value.substr(-5)}` : '';
        console.log(`${req.url} : Redirect: ${parsed.protocol}//${parsed.host}${cut(parsed.pathname)}${cut(parsed.search)}`);
        res.writeHead(302, { Location: fileUrl });
        res.end();
      }else{
        res.writeHead(404);
        res.end('File Not Found');
      }

    }else if(req.method === 'OPTIONS'){

      // Handle OPTIONS method
      res.writeHead(200, {
          'Allow': 'OPTIONS, PROPFIND, GET',
          'DAV': '1',
          'MS-Author-Via': 'DAV',
      });
      res.end();

    }else{

      // Method not allowed
      res.writeHead(405, { Allow: 'OPTIONS, PROPFIND, GET' });
      res.end('Method Not Allowed');

    }

  }catch(err){

    console.log(err);

    switch(err.message){
      case debrid.ERROR.EXPIRED_API_KEY:
      case debrid.ERROR.TWO_FACTOR_AUTH:
        res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="WebDAV"' });
        res.end(err.message);
        break;
      case debrid.ERROR.NOT_PREMIUM:
      case debrid.ERROR.ACCESS_DENIED:
        res.writeHead(403);
        res.end(err.message);
        break;
      case debrid.ERROR.NOT_FOUND:
        res.writeHead(404);
        res.end(err.message);
        break;
      default:
        res.writeHead(500);
        res.end('Error, check logs');
    }

  }

});

// Function to generate PROPFIND XML response
function generatePropfindResponse(requestPath, files) {
  let res = '<?xml version="1.0" encoding="utf-8"?>\n';
  res += '<d:multistatus xmlns:d="DAV:">\n';
  res += files.map((file) => {
    const isCollection = file.type === 'folder';
    const href = (requestPath + (requestPath.endsWith('/') ? '' : '/') + file.name + (isCollection ? '/' : '')).split('/').map(encodeURIComponent).join('/');
    const props = [`<d:displayname>${file.name.replace(/&/g, '&amp;')}</d:displayname>`];
    if(isCollection){
      props.push(`<d:resourcetype><d:collection/></d:resourcetype>`);
    }else{
      props.push(`<d:resourcetype></d:resourcetype>`);
      if(file.contentType){
        props.push(`<d:getcontentlength>${file.contentType}</d:getcontentlength>`);
      }
    }
    if(file.size > 0){
      props.push(`<d:getcontentlength>${file.size}</d:getcontentlength>`);
    }
    if(file.lastModified){
      props.push(`<d:getlastmodified>${new Date(file.lastModified).toUTCString()}</d:getlastmodified>`);
    }
    if(file.contentType){
      props.push(`<d:getcontentlength>${file.contentType}</d:getcontentlength>`);
    }
    if(file.etag){
      props.push(`<d:getetag>${file.etag}</d:getcontentlength>`);
    }
    return `<d:response>
              <d:href>${href}</d:href>
              <d:propstat>
                <d:prop>${props.join('')}</d:prop>
                <d:status>HTTP/1.1 200 OK</d:status>
              </d:propstat>
            </d:response>`;
  }).join('\n');
  res += '</d:multistatus>';
  return res;
}

// Start server on port 8080
server.listen(config.port, () => {
  console.log('WebDAV server is running on port 8080');

  const intervals = [];

  vacuumCache().catch(err => console.log(`Failed to vacuum cache:`, err));
  intervals.push(setInterval(() => vacuumCache(), 86400e3*7));

  cleanCache().catch(err => console.log(`Failed to clean cache:`, err));
  intervals.push(setInterval(() => cleanCache(), 3600e3));

  if(config.debridId && config.debridApiKey && config.plexUrl && config.plexToken){
    console.log('Watching for change to update the Plex library');
    const dav = new Debriddav(config);
    dav.updatePlexOnChange().catch(err => console.log(`Failed to update plex on change:`, err));
    intervals.push(setInterval(() => dav.updatePlexOnChange(), (config.checkNewFilesInterval + 1) * 1000));
  }

  if(!config.user || !config.pass){
    console.log(`!!!! Server is running without authentification, be carefull, don't expose it publicly !!!`);
  }

  function closeGracefully(signal) {
    console.log(`Received signal to terminate: ${signal}`);
    intervals.forEach(interval => clearInterval(interval));
    server.close(() => {
      console.log('Server closed');
      process.kill(process.pid, signal);
    });
  }
  process.once('SIGINT', closeGracefully);
  process.once('SIGTERM', closeGracefully);
});