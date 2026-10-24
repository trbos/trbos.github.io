type Game={id:string;name:string;url:string;aliases?:string[]};
const ORIGIN='https://trbos.github.io/';
export const gameNameKey=(value:string)=>value.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
export function readGameCatalog(source:string):Game[]{
  const entries=[...source.matchAll(/Object\.freeze\((\{"id":[^\r\n]+?\})\)/g)].map(m=>JSON.parse(m[1]));
  if(!entries.length||entries.some(g=>!g||typeof g.id!=='string'||!/^[a-z0-9][a-z0-9-]{0,79}$/.test(g.id)||typeof g.name!=='string'||typeof g.url!=='string')||new Set(entries.map(g=>g.id)).size!==entries.length)throw Error('invalid_catalog');
  return entries;
}
function route(value:string){try{const u=new URL(value,ORIGIN);if(u.origin===new URL(ORIGIN).origin&&/^#\/games\/[a-z0-9-]+$/.test(u.hash))return u.origin+'/games/'+u.hash.slice(8)+'/';return u.origin+u.pathname.replace(/\/+$/,'')+'/';}catch{return null;}}
export function findExistingGame(games:Game[],name:string,url?:string|null){
  // Recognize ordinary request phrasing before paying a worker to rediscover
  // an existing game. Never strip sequel numbers or version/edition words.
  const title=name.trim().replace(/^(?:(?:can|could) you\s+)?(?:(?:please|pls)\s+)?add\s+(?:the game\s+)?/i,'').replace(/\s+(?:please|pls)[.!]?$/i,'');
  const keys=new Set([gameNameKey(name),gameNameKey(title)].filter(Boolean)),link=url?route(url):null;
  return games.find(g=>[g.name,g.id,...g.aliases||[]].some(n=>keys.has(gameNameKey(n)))||(link&&route(g.url)===link))||null;
}
