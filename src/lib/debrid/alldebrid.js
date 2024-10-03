import {createHash} from 'crypto';
import {ERROR} from './const.js';
import {wait, fileType} from '../util.js';
import Debrid from './debrid.js';

export default class AllDebrid extends Debrid {

  static id = 'alldebrid';
  static name = 'AllDebrid';
  static shortName = 'AD';

  #apiKey;
  #ip;

  constructor(userConfig){
    super(userConfig);
    this.#apiKey = userConfig.debridApiKey;
    this.#ip = userConfig.ip || '';
  }

  async getRecentFiles(){
    return this.getFiles();
  }

  async getFiles(){
    const res = await this.#request('GET', '/magnet/status');
    const files = [];
    for(let magnet of res.data.magnets){
      if(magnet.status != 'Ready'){
        continue;
      }
      for(let index in magnet.links){
        let link = magnet.links[index];
        files.push({
          name: link.filename,
          size: link.size,
          type: fileType(link.filename),
          url: link.link,
          id: `${magnet.id}:${index}`,
          lastModified: new Date(magnet.completionDate * 1000),
          parent: {
            id: magnet.id,
            name: magnet.filename
          }
        });
      }
    }
    return files;   
  }

  async getDownload(file){
    const query = {link: file.url};
    const res = await this.#request('GET', '/link/unlock', {query});
    return res.data.link;
  }

  async getUserHash(){
    return createHash('md5').update(this.#apiKey).digest('hex');
  }

  async #request(method, path, opts){

    opts = opts || {};
    opts = Object.assign(opts, {
      method,
      headers: Object.assign({
        'user-agent': 'davdebrid',
        'accept': 'application/json',
        'authorization': `Bearer ${this.#apiKey}`
      }, opts.headers || {}),
      query: Object.assign({
        'agent': 'davdebrid',
        'ip': this.#ip
      }, opts.query || {})
    });

    const url = `https://api.alldebrid.com/v4${path}?${new URLSearchParams(opts.query).toString()}`;
    const res = await fetch(url, opts);
    const data = await res.json();

    if(data.status != 'success'){
      console.log(data);
      switch(data.error.code || ''){
        case 'AUTH_BAD_APIKEY':
        case 'AUTH_MISSING_APIKEY':
          throw new Error(ERROR.EXPIRED_API_KEY);
        case 'AUTH_BLOCKED':
          throw new Error(ERROR.TWO_FACTOR_AUTH);
        case 'MAGNET_MUST_BE_PREMIUM':
        case 'FREE_TRIAL_LIMIT_REACHED':
        case 'MUST_BE_PREMIUM':
          throw new Error(ERROR.NOT_PREMIUM);
        default:
          throw new Error(`Invalid AD api result: ${JSON.stringify(data)}`);
      }
    }

    return data;

  }

}