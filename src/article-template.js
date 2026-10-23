// Site content must come from an authenticated backend, never from the Vite bundle.
export const detectedSiteProfile={engine:"",root:"",contentDir:"",template:"",categories:[],channels:[],usesCategories:false};
export const initialArticles=[];

export function createArticleFromTemplate(){
  const now=new Date(),pad=n=>String(n).padStart(2,"0");
  const date=`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:00`;
  return {title:"未命名文章",slug:"",date,updated:"",description:"",cover:"",category:"",tags:"",channels:[],keywords:"",top:0,featured:false,comments:true,toc:true,video_as_cover:true,status:"草稿",content:"",templateApplied:false};
}
