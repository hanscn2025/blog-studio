const draftImages=new Map();

export function registerDraftImages(images=[]){
  draftImages.clear();
  for(const image of images)if(image.id&&image.src)draftImages.set(image.id,image.src);
}

export function referencedDraftImages(images=[],content="",cover=""){
  return images.filter(image=>image.id&&(content.includes(`asset://${image.id}`)||cover===`asset://${image.id}`));
}

export function resolveDraftImage(src=""){
  const id=src.match(/^asset:\/\/(.+)$/)?.[1];
  return id?draftImages.get(id)||src:src;
}

export function parseMarkdownImage(line){
  const match=line.trim().match(/^!\[([^\]]*)\]\((https?:\/\/[^\s)]+|[^\s)]+)\)$/);
  if(!match)return null;
  return {alt:match[1],src:resolveDraftImage(match[2])};
}

export function parseYouTubeIframe(line){
  if(!line.includes("<iframe"))return null;
  const src=line.match(/\bsrc=["']([^"']+)["']/i)?.[1];
  if(!src)return null;
  try{
    const url=new URL(src);
    if(!["www.youtube.com","youtube.com","www.youtube-nocookie.com","youtube-nocookie.com"].includes(url.hostname))return null;
    return {src:url.href,title:line.match(/\btitle=["']([^"']*)["']/i)?.[1]||"YouTube 视频"};
  }catch{return null}
}

export function youtubeEmbed(urlText){
  try{
    const url=new URL(urlText);
    let id;
    if(["youtu.be","www.youtu.be"].includes(url.hostname))id=url.pathname.slice(1).split("/")[0];
    else if(["youtube.com","www.youtube.com","m.youtube.com","youtube-nocookie.com","www.youtube-nocookie.com"].includes(url.hostname))id=url.pathname==="/watch"?url.searchParams.get("v"):url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1];
    if(url.protocol!=="https:"||!id||!/^[a-zA-Z0-9_-]{11}$/.test(id))return null;
    return `<div class="video-container">\n<iframe loading="lazy" width="560" height="315" src="https://www.youtube-nocookie.com/embed/${id}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>\n</div>`;
  }catch{return null}
}

export function hasYouTubeEmbed(content=""){
  return /(?:youtube(?:-nocookie)?\.com\/embed\/|youtu\.be\/)/i.test(content);
}
