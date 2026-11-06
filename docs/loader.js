'use strict';
window.KG42=(()=>{
 const data=new Map(),pending=new Map();let assets={};
 function register(key,value){if(data.has(key))throw Error('Duplicate data shard: '+key);data.set(key,value);}
 function configure(map){assets=map;}
 function get(key){
  if(data.has(key))return Promise.resolve(data.get(key));
  if(pending.has(key))return pending.get(key);
  const path=assets[key];if(!path||!/^data\/[a-zA-Z0-9_.-]+\.js$/.test(path))return Promise.reject(Error('Unknown data shard: '+key));
  const promise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=path;
   script.onload=()=>data.has(key)?resolve(data.get(key)):reject(Error('Empty data shard: '+key));
   script.onerror=()=>{pending.delete(key);script.remove();reject(Error('Unable to load '+path+'. Reopen the complete release folder or retry.'));};
   document.head.appendChild(script);});pending.set(key,promise);return promise;
 }
 return {register,configure,get};
})();
