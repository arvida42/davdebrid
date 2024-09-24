import {basename} from 'path';
import cache from './cache.js';
import * as debrid from './debrid.js';
import config from './config.js';
import {wait, indexByKey} from './util.js';

const actionInProgress = {
  getFiles: {}
};

const filesStats = {

};

export default class Davdebrid {

  #debrid;
  #config;

  constructor(config){
    this.#config = config;
    this.#debrid = debrid.instance(config);
    this.mediaGroups = [
      {
        name: 'Shows',
        regex: /S[0-9]+E[0-9]+|[0-9]+x[0-9]+/,
        videosInParent: 6,
        files: []  
      },
      {
        name: 'Movies',
        regex: true,
        videosInParent: 0,
        files: []
      }
    ];
  }

  async listFiles(path){

    const files = await this.#getFiles();

    const mediaGroups = [].concat(...this.mediaGroups);

    if(path === '/'){

      return mediaGroups.map(mediaGroup => ({
        name: mediaGroup.name,
        size: 0,
        type: 'folder' 
      }));

    }else if(path.endsWith('/')){

      const folderName = basename(path);
      const mediaGroup =  mediaGroups.find(mediaGroup => mediaGroup.name == folderName);
      if(!mediaGroup){
        throw new Error(debrid.ERROR.NOT_FOUND);
      }

      const countVideosByParent = files.reduce((stats, file) => {
        stats[file.parent.id] = stats[file.parent.id] || 0;
        if(file.type == 'video')stats[file.parent.id]++;
        return stats;
      }, {});

      for(let file of files){
        if(!['video', 'subtitle'].includes(file.type)){
          continue;
        }
        for(let mg of mediaGroups){
          if((mg.regex === true || file.name.match(mg.regex)) || (mg.videosInParent > 0 && countVideosByParent[file.parent.id] >= mg.videosInParent)){
            mg.files.push(file);
            break;
          }
        }
      }

      return mediaGroup.files;

    }else {

      const fileName = basename(path);
      const file = files.find(file => file.name == fileName);
      if(!file){
        throw new Error(debrid.ERROR.NOT_FOUND);
      }

      return [file];

    }
    
  }

  async getFileUrl(path){

    const fileName = basename(path);
    const cacheKey = `debridFileUrl:${await this.#debrid.getUserHash()}:${fileName}`;

    let fileUrl = await cache.get(cacheKey);
    if(fileUrl){
      return fileUrl;
    }

    const files = await this.#getFiles();
    const file = files.find(file => file.name == fileName);
    if(!file){
      throw new Error(debrid.ERROR.NOT_FOUND);
    }

    fileUrl = await this.#debrid.getDownload(file);

    await cache.set(cacheKey, fileUrl, 3600);

    return fileUrl;

  }

  async updatePlexOnChange(){

    const {plexToken, plexUrl} = this.#config;
    const updatedLocations = [];

    if(!plexToken || !plexUrl){
      return updatedLocations;
    }
    
    const cacheKey = `plexUpdateFileStats:${await this.#debrid.getUserHash()}`;
    const oldStats = (await cache.get(cacheKey)) || {count: 0, size: 0};
    const files = await this.#getFiles();
    const activeStats = files.reduce((acc, file) => {
      acc.count++;
      acc.size += file.size;
      return acc;
    }, {count: 0, size: 0});

    if(activeStats.size == oldStats.size && activeStats.count == oldStats.count){
      return updatedLocations;
    }

    await cache.set(cacheKey, activeStats, {ttl: 86400});

    console.log(`Updating plex library ...`);
    const headers = {'X-Plex-Token': plexToken, Accept: 'application/json'};

    const sections = await fetch(`${plexUrl}/library/sections`, {headers}).then(res => res.json());
    const sectionLocationRegex = new RegExp(`\/(${this.mediaGroups.map(mg => mg.name).join('|')})`);

    // rclone --dir-cache-time 5s
    await wait(5000);

    for(const section of sections.MediaContainer.Directory){
      const location = section.Location.find(l => l.path.match(sectionLocationRegex));
      if(location){
        console.log(`Update plex library ${section.title} ${location.path}`);
        await fetch(`${plexUrl}/library/sections/${location.id}/refresh`, {headers});
        updatedLocations.push(location);
      }
    }

    return updatedLocations;

  }

  async #getFiles(){

    const userHash = await this.#debrid.getUserHash();
    const cacheKey = `debridFiles:${userHash}`;
    const recentFilesCheckCacheKey = `debridRecentFilesCheckCacheKey:${userHash}`;

    while(actionInProgress.getFiles[cacheKey]){
      await wait(50);
    }
    actionInProgress.getFiles[cacheKey] = true;

    try {

      let [storedDate, files] = (await cache.get(cacheKey)) || [];

      if(!files || (new Date() - new Date(storedDate)) > config.checkAllFilesInterval * 1000){

        files = await this.#debrid.getFiles();
        console.log(`${this.#debrid.shortName} : ${files.length} files found from debrid API`);

        await cache.set(cacheKey, [new Date(), files], {ttl: config.checkAllFilesInterval});
        await cache.set(recentFilesCheckCacheKey, new Date(), {ttl: config.checkNewFilesInterval});

      }else{

        // console.log(`${this.#debrid.shortName} : ${files.length} files found from cache`);

        const newFileChecked = await cache.get(recentFilesCheckCacheKey);

        if(!newFileChecked){
          // console.log(`${this.#debrid.shortName} : Check for recent new files`);
          await cache.set(recentFilesCheckCacheKey, new Date(), {ttl: config.checkNewFilesInterval});
          const recentFiles = await this.#debrid.getRecentFiles();
          const fileById = indexByKey(files, 'id');
          const newFiles = recentFiles.filter(recentFile => !fileById[recentFile.id]);
          if(newFiles.length){
            console.log(`${this.#debrid.shortName} : ${newFiles.length} new recent files found from debrid API`);
            files.unshift(...newFiles);
            await cache.set(cacheKey, [storedDate, files], {ttl: config.checkAllFilesInterval});
          }
        }

      }

      return files || [];

    }finally{

      actionInProgress.getFiles[cacheKey] = false;

    }

  }

}