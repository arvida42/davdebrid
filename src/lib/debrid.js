import debridlink from "./debrid/debridlink.js";
import alldebrid from "./debrid/alldebrid.js";
export {ERROR} from './debrid/const.js';

const debrid = {debridlink, alldebrid};

export function instance(userConfig){

  userConfig.debridId = userConfig.debridId.toLowerCase();

  if(!debrid[userConfig.debridId]){
    throw new Error(`Debrid service "${userConfig.debridId} not exists`);
  }
  
  return new debrid[userConfig.debridId](userConfig);
}