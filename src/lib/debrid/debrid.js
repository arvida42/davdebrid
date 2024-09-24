export default class Debrid {

  static id = '';
  static name = '';
  static shortName = '';

  constructor(userConfig){
    Object.assign(this, this.constructor);
  }

  async getRecentFiles(){
    return [];
  }

  async getFiles(){
    return [];
  }

  async getDownload(){
    throw new Error(`Not implemented`);
  }

  async getUserHash(){
    throw new Error(`Not implemented`);
  }

}