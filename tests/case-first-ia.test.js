import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import {fileURLToPath} from 'node:url';
import {createProductEntryHandler,prepareProductHomeHtml} from '../lib/product-home.js';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
test('public entry pages render canonical links without SaaS authentication',async()=>{
  const app=express();
  for(const entry of ['worker','employer','tools'])app.get(`/${entry}.html`,createProductEntryHandler(root,`${entry}.html`,{env:{SITE_URL:'https://preview.example'}}));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  try{for(const entry of ['worker','employer','tools']){
    const response=await fetch(`http://127.0.0.1:${server.address().port}/${entry}.html`),html=await response.text();
    assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-cache/);
    assert.ok(html.includes(`href="https://preview.example/${entry}.html"`));
    assert.equal((html.match(/src="\/global-navigation.js"/g)||[]).length,1);
  }}finally{await new Promise(r=>server.close(r));}
});

test('home serves Case-first content before enhancement and preserves every Core 5 route',()=>{
  const html=prepareProductHomeHtml(fs.readFileSync(path.join(root,'index.html'),'utf8'));
  const hero=html.indexOf('내 상황 이야기하기'),worker=html.indexOf('근로자입니다'),tools=html.indexOf('바로 필요한 도구'),expert=html.indexOf('전문가 도움이 필요하다면');
  assert.ok(hero<worker&&worker<tools&&tools<expert);
  assert.equal((html.match(/src="\/global-navigation.js"/g)||[]).length,1);
  const entry=fs.readFileSync(path.join(root,'worker.html'),'utf8');
  for(const slug of ['wage','dismissal','retirement','worktime','annual-leave'])assert.ok(entry.includes(`href="/${slug}-intake"`));
});
