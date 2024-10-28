export default class FileOrganizer {

  constructor(files = [], folders = []){
    this.files = files;
    this.folders = folders;
  }

  // Method to organize files based on folders conditions
  get(){

    // Non-Unique Folders First
    this.folders = this.folders.sort((a, b) => {
      if(a.unique == b.unique)return 0;
      return !a.unique ? -1 : 1;
    });

    this.folders.forEach(folder => folder.files = []);

    for(let file of this.files){
      for(let folder of this.folders){
        if(this.#matchesCondition(file, folder.cond)){
          folder.files.push(file);
          if(folder.unique)break; // Stop when a unique folder is reached 
        }
      }
    }

    return this.folders;

  }

  // Helper function to evaluate single condition
  #evaluateSingleCondition(file, key, value){
    switch (key) {

      case 'fileTypes':
        return (value.length === 0) || value.includes(file.type);

      case 'regex':
        return value === true || new RegExp(value).test(file.name);

      case 'minVideosInParent':
        return file.videosInParent >= value;

      default:
        // Unknow key
        return false;
    }
  }

  // Recursive function to evaluate conditions
  #matchesCondition(file, cond){

    if(typeof cond !== 'object' || cond === null){
      return true;
    }

    for(let key in cond){

      const value = cond[key];

      if(key === 'or'){

        // 'or' condition: at least one sub-condition must be true
        let orResult = false;
        for(let subKey in value){
          const subValue = value[subKey];
          if(this.#matchesCondition(file, { [subKey]: subValue })){
            orResult = true;
            break;
          }
        }
        if(!orResult){
          return false;
        }

      }else if(key === 'and'){

        // 'and' condition: all sub-conditions must be true
        for(let subKey in value){
          const subValue = value[subKey];
          if(!this.#matchesCondition(file, { [subKey]: subValue })){
            return false;
          }
        }

      }else{
        // Evaluate single condition
        if(!this.#evaluateSingleCondition(file, key, value)){
          return false;
        }

      }

    }

    // All conditions passed
    return true;

  }

}