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
    const res = await this.#request('GET', '/v4.1/magnet/status');
    if(res.data.magnets.length === 0){
      return [];
    }
    return this.#getFilesByMagnets(res.data.magnets.slice(0, 30)); 
  }

  async getFiles(){
    const res = await this.#request('GET', '/v4.1/magnet/status');
    if(res.data.magnets.length === 0){
      return [];
    }
    return this.#getFilesByMagnets(res.data.magnets); 
  }

  async getDownload(file){
    if(!file.url){
      console.log(file);
      throw new Error(`No url available in alldebrid file object`);
    }
    const query = {link: file.url};
    const res = await this.#request('GET', '/v4/link/unlock', {query});
    return res.data.link;
  }

  async getUserHash(){
    return createHash('md5').update(this.#apiKey).digest('hex');
  }

  async #getFilesByMagnets(magnets){
    const res = await this.#request('GET', '/v4/magnet/files', {query: {id: magnets.map(magnet => magnet.id)}});
    const magnetById = magnets.reduce((acc, magnet) => {
      acc[magnet.id] = magnet;
      return acc;
    }, {});
    const files = [];
    for(let magnet of res.data.magnets){
      magnet = Object.assign(magnetById[magnet.id], magnet);
      files.push(...this.#getFilesFromNode(magnet.files).map((file, index) => {
        file.id = `${magnet.id}:${index}`,
        file.lastModified = new Date(magnet.completionDate * 1000);
        file.parent = {
          id: magnet.id,
          name: magnet.filename
        };
        return file;
      }));
    }
    return files;
  }

  #getFilesFromNode(node){
    const files = [];
    for(let file of node){
      if(file.e){
        files.push(...this.#getFilesFromNode(file.e));
      }else{
        files.push({
          name: file.n,
          size: file.s,
          type: fileType(file.n),
          url: file.l,
          id: ``,
          lastModified: ``,
          parent: {}
        });
      }
    }
    return files;
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

    const queryParts = [];
    for(const [key, value] of Object.entries(opts.query)){
      if(Array.isArray(value)){
        value.forEach(v => queryParts.push(`${key}[]=${encodeURIComponent(v)}`));
      }else{
        queryParts.push(`${key}=${encodeURIComponent(value)}`);
      }
    }

    const url = `https://api.alldebrid.com${path}?${queryParts.join('&')}`;
    const res = await fetch(url, opts);
    const data = await res.json();

    if(data.status != 'success'){
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