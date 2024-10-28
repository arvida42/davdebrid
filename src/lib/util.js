import {setTimeout} from 'timers/promises';

export function wait(ms){
  return setTimeout(ms);
}

export function fileType(filename){
  const extension = filename?.split('.').pop();
  const types = {
    video: [
      "3g2",
      "3gp",
      "avi",
      "flv",
      "mkv",
      "mk3d",
      "mov",
      "mp2",
      "mp4",
      "m4v",
      "mpe",
      "mpeg",
      "mpg",
      "mpv",
      "webm",
      "wmv",
      "ogm",
      "ts",
      "m2ts"
    ],
    subtitle: [
      "srt",
      "sub",
      "sbv",
      "mpsub"
    ],
    music: [
      'mp3', 
      'wav', 
      'flac', 
      'aac', 
      'ogg', 
      'wma'
    ],
    image: [
      'jpg', 
      'jpeg', 
      'png', 
      'gif', 
      'bmp', 
      'tiff',
      'webp', 
      'svg', 
      'heic', 
      'heif', 
      'raw'
    ]
  };  
  for(let type in types){
    if(types[type].includes(extension)){
      return type;
    }
  }
  return 'unknow';
}

export function indexByKey(arr, key){
  return arr.reduce((acc, item) => {
    acc[item[key]] = item;
    return acc;
  }, {});
}