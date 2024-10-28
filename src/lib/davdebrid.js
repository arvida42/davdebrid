import {basename, join as pathJoin} from 'path';
import cache from './cache.js';
import * as debrid from './debrid.js';
import config from './config.js';
import {wait, indexByKey, fileType} from './util.js';
import FileOrganizer from './fileOrganizer.js';
import * as fs from 'node:fs/promises';
import { parse } from 'yaml';

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
  }

  async listFiles(path){

    if(path === '/'){

      const directories = await this.#getDirectories();

      return directories.map(dir => ({
        name: dir.name,
        size: 0,
        type: 'folder' 
      })).concat({
        name: 'Config',
        size: 0,
        type: 'folder'
      });

    }else if(path === '/Config/'){

      return this.#getConfigFiles();

    }else if(path.endsWith('/')){

      const [files, directories] = await Promise.all([this.#getFiles(), this.#getDirectories()]);

      const dirName = basename(path);
      const fileOrganizer = new FileOrganizer(files, directories);

      const dir = fileOrganizer.get().find(dir => dir.name == dirName);

      if(!dir){
        throw new Error(debrid.ERROR.NOT_FOUND);
      }

      return dir.files;

    }else {

      const files = await (path.startsWith('/Config/') ? this.#getConfigFiles() : this.#getFiles());
      const fileName = basename(path);
      const file = files.find(file => file.name == fileName);
      if(!file){
        console.log(fileName);
        throw new Error(debrid.ERROR.NOT_FOUND);
      }

      return [file];

    }
    
  }

  async getFileUrl(path){

    const fileName = basename(path);

    if(path.startsWith('/Config/')){

      const files = await this.#getConfigFiles();
      const file = files.find(file => file.name == fileName);

      if(!file){
        throw new Error(debrid.ERROR.NOT_FOUND);
      }

      return file.url;

    }else{

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
    const sectionLocationRegex = new RegExp(`\/(${this.directories.map(dir => dir.name).join('|')})`);

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
      await wait(25);
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

  async #getConfigFiles(){
    let files = await fs.readdir(`${config.dataFolder}/config`);
    files = await Promise.all(files.map(async file => {
      const stat = await fs.stat(pathJoin(`${config.dataFolder}/config`, file));
      if(stat.isFile()){
        return {
          name: file,
          size: stat.size,
          type: fileType(file),
          lastModified: stat.mtime,
          url: `${config.dataFolder}/config/${file}`
        }
      }
      return false;
    }));

    return files.filter(Boolean);
  }

  async #getDirectories(){
    try {
      const customConfig = await this.#getConfigFromFile(pathJoin(config.dataFolder, 'config', 'config.custom.yml'));
      if(customConfig && customConfig.directories && customConfig.directories.length > 0)return customConfig.directories;
    }catch(err){
      console.log('Error on config.custom.yml, fallback to config.yml', err);
    }
    const defaultConfig = await this.#getConfigFromFile(pathJoin(config.dataFolder, 'config', 'config.yml'));
    return defaultConfig.directories;
  }

  async #getConfigFromFile(path){
    const data = await fs.readFile(path, {encoding: 'utf8'});
    const parsed = parse(data);
    return parsed;
  }

}