export default class FileOrganizer {

  constructor(files = [], directories = []){
    this.files = files;
    this.directories = directories;
  }

  // Method to organize files based on directories conditions
  get(){

    // Non-Unique Folders First
    this.directories = this.directories.sort((a, b) => {
      if(a.unique == b.unique)return 0;
      return !a.unique ? -1 : 1;
    });

    this.directories.forEach(dir => dir.files = []);

    for(let file of this.files){
      for(let dir of this.directories){
        if(this.#matchesCondition(file, dir.cond)){
          dir.files.push(file);
          if(dir.unique)break; // Stop when a unique directory is reached 
        }
      }
    }

    return this.directories;

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