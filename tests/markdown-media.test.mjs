import test from "node:test";
import assert from "node:assert/strict";
import { hasYouTubeEmbed,parseMarkdownImage,parseYouTubeIframe,referencedDraftImages,youtubeEmbed } from "../src/markdown-media.js";

test("pending image count follows body and cover references",()=>{
  const images=[{id:"body"},{id:"cover"},{id:"deleted"}];
  assert.deepEqual(referencedDraftImages(images,"![图](asset://body)","asset://cover").map(image=>image.id),["body","cover"]);
  assert.deepEqual(referencedDraftImages(images,"","asset://cover").map(image=>image.id),["cover"]);
  assert.deepEqual(referencedDraftImages(images,"",""),[]);
});

test("parses blog images and only approved YouTube embeds",()=>{
  assert.deepEqual(parseMarkdownImage("![步骤截图](https://img.example.com/guide/001.png)"),{alt:"步骤截图",src:"https://img.example.com/guide/001.png"});
  assert.equal(parseYouTubeIframe('<iframe src="https://www.youtube-nocookie.com/embed/abc" title="演示"></iframe>').title,"演示");
  assert.equal(parseYouTubeIframe('<iframe src="https://example.com/embed/abc"></iframe>'),null);
});

test("YouTube insertion matches the blog's video-over-cover detection",()=>{
  const embed=youtubeEmbed("https://youtu.be/VBTcElfDvTg?t=5");
  assert.match(embed,/youtube-nocookie\.com\/embed\/VBTcElfDvTg/);
  assert.ok(hasYouTubeEmbed(embed));
  assert.equal(parseYouTubeIframe(embed.split("\n")[1]).src,"https://www.youtube-nocookie.com/embed/VBTcElfDvTg");
  assert.equal(youtubeEmbed("https://evil.example/watch?v=VBTcElfDvTg"),null);
  assert.equal(youtubeEmbed("javascript:alert(1)"),null);
  assert.equal(hasYouTubeEmbed("普通正文"),false);
});
