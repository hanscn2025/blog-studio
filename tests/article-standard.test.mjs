import test from "node:test";
import assert from "node:assert/strict";
import { articleListForDisplay,normalizeRepositoryStatus,reconcilePublishedArticle,serializeArticle,sortArticlesForDisplay,validateArticle } from "../src/article-standard.js";

test("generates Hans Blog compatible Markdown and rejects GitHub-incompatible content",()=>{
  const article={title:"测试",slug:"test-post",date:"2026-09-30 10:00:00",updated:"",description:"说明",cover:"https://img.example.com/cover.jpg",category:"建站与部署",tags:"GitHub, Markdown",channels:["indie-site-blog"],keywords:"",comments:true,toc:true,video_as_cover:true,content:"## 一、测试\n\n![测试图片](https://img.example.com/test.png)"};
  assert.deepEqual(validateArticle(article),[]);
  assert.match(serializeArticle(article),/categories:\n  - "建站与部署"/);
  assert.ok(validateArticle({...article,content:"# 重复标题\n\n![](local.png)"}).length>=2);
});

test("blocks publishing while clipboard images are still local",()=>{
  const errors=validateArticle({title:"测试",slug:"test",date:"2026-10-08 10:00:00",content:"![截图](data:image/png;base64,AAAA)"});
  assert.ok(errors.includes("仍有本地暂存图片未上传图床"));
  assert.ok(validateArticle({title:"测试",slug:"test",date:"2026-10-08 10:00:00",content:"![截图](asset://draft-1)"}).includes("仍有本地暂存图片未上传图床"));
  assert.ok(validateArticle({title:"测试",slug:"test",date:"2026-10-08 10:00:00",cover:"asset://cover-1",content:"正文"}).includes("封面图片尚未上传图床"));
});

test("marks an exact published draft as a repository article without hiding different local edits",()=>{
  const draft={title:"test000",slug:"test000",date:"2026-10-12 12:00:00",content:"正文",status:"草稿"};
  const remote={file:"source/_posts/test000.md",content:serializeArticle(draft)};
  assert.deepEqual(reconcilePublishedArticle(draft,remote),{...draft,file:remote.file,status:"已提交 GitHub",remote:true});
  assert.equal(reconcilePublishedArticle({...draft,content:"尚未提交的改动"},remote).status,"草稿");
});

test("article list prefers GitHub metadata after the draft has been published",()=>{
  const local={file:"source/_posts/test000.md",title:"test000",updated:"",remote:true};
  const remote={file:local.file,title:"test000",updated:"2026-10-12 11:11:00",remote:true};
  assert.deepEqual(articleListForDisplay(local,[remote]),[remote]);
  assert.deepEqual(articleListForDisplay({...local,remote:false},[remote]),[{...local,remote:false}]);
  assert.deepEqual(articleListForDisplay({title:"",slug:"",content:""},[remote]),[remote]);
});

test("old browser records do not claim a GitHub commit is live",()=>{
  assert.deepEqual(normalizeRepositoryStatus({remote:true,status:"已发布",file:"source/_posts/test.md"}),{remote:true,status:"已提交 GitHub",file:"source/_posts/test.md"});
  assert.deepEqual(normalizeRepositoryStatus({status:"草稿"}),{status:"草稿"});
});

test("article list sorts all by creation date, but pinned view by top",()=>{
  const articles=[
    {title:"Old pinned",file:"old.md",date:"2024-01-01 00:00:00",updated:"2027-01-01 00:00:00",top:22},
    {title:"New",file:"new.md",date:"2026-10-12 11:11:00",top:0},
    {title:"Recent pinned",file:"recent.md",date:"2025-01-01 00:00:00",top:10},
  ];
  assert.deepEqual(sortArticlesForDisplay(articles).map(item=>item.title),["New","Recent pinned","Old pinned"]);
  assert.deepEqual(sortArticlesForDisplay(articles.filter(item=>item.top>0),true).map(item=>item.title),["Old pinned","Recent pinned"]);
  assert.equal(articles[0].title,"Old pinned");
});
