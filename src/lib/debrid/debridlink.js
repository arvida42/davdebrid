import {createHash} from 'crypto';
import {ERROR} from './const.js';
import {wait, fileType} from '../util.js';
import Debrid from './debrid.js';

export default class DebridLink extends Debrid {

  static id = 'debridlink';
  static name = 'Debrid-Link';
  static shortName = 'DL';

  #apiKey;
  #ip;

  constructor(userConfig){
    super(userConfig);
    this.#apiKey = userConfig.debridApiKey;
    this.#ip = userConfig.ip || '';
  }

  async getRecentFiles(){
    return this.getFiles(1, 20);
  }

  async getFiles(maxPages, perPage){
    maxPages = maxPages || 30;
    perPage = perPage || 100;
    const files = [];
    const query = {perPage};
    let res = await this.#request('GET', '/seedbox/list', {query});
    const pagination = res.pagination;
    const promises = [Promise.resolve(res)];
    for(let page = 1; page < Math.min(pagination.pages, maxPages); page++){
      promises.push(this.#request('GET', '/seedbox/list', {query: {...query, page}}));
    }
    return (await Promise.all(promises)).reduce((files, res) => {
      for(let torrent of res.value){
        for(let file of torrent.files){
          if(file.downloadPercent == 100){
            files.push({
              name: file.name,
              size: file.size,
              type: fileType(file.name),
              url: file.downloadUrl,
              id: file.id,
              lastModified: new Date(torrent.created * 1000),
              parent: {
                id: torrent.id,
                name: torrent.name
              }
            });
          }
        }
      }
      return files;
    }, []);

  }

  async getDownload(file){
    return file.url;
  }

  async getUserHash(){
    return createHash('md5').update(this.#apiKey).digest('hex');
  }

  async #request(method, path, opts){

    opts = opts || {};
    opts = Object.assign(opts, {
      method,
      headers: Object.assign(opts.headers || {}, {
        'user-agent': 'DebridDav',
        'accept': 'application/json',
        'authorization': `Bearer ${this.#apiKey}`
      }),
      query: Object.assign({ip: this.#ip}, opts.query || {})
    });

    if(method == 'POST'){
      if(opts.body instanceof FormData){
        opts.body.append('ip', this.#ip);
      }else{
        opts.body = JSON.stringify(Object.assign({ip: this.#ip}, opts.body || {}));
        opts.headers['content-type'] = 'application/json';
      }
    }

    const url = `https://debrid-link.com/api/v2${path}?${new URLSearchParams(opts.query).toString()}`;
    const res = await fetch(url, opts);
    const data = await res.json();

    if(!data.success){
      switch(data.error || ''){
        case 'badToken':
          throw new Error(ERROR.EXPIRED_API_KEY);
        case 'maxLink':
        case 'maxLinkHost':
        case 'maxData':
        case 'maxDataHost':
        case 'maxTorrent':
        case 'torrentTooBig':
        case 'freeServerOverload':
          throw new Error(ERROR.NOT_PREMIUM);
        default:
          throw new Error(`Invalid DL api result: ${JSON.stringify(data)}`);
      }
    }

    return data;

  }

}