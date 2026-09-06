import test from 'node:test';
import assert from 'node:assert/strict';
import '../directory-policy.js';

test('directory ranks sponsor, verified, region, field then stable name/id without mutation', () => {
  const items = [
    {id:'ordinary', n:'A', loc:'Seoul', tags:['wage']},
    {id:'verified', n:'Z', v:true},
    {id:'sponsor', n:'Z', featured:true},
    {id:'both', n:'Z', featured:true, v:true},
    {id:'field', n:'A', tags:['wage']},
    {id:'region', n:'Z', loc:'Seoul'},
  ];
  assert.deepEqual(globalThis.INSAYA_DIRECTORY.rank(items, {region:'Seoul',field:'wage'}).map(x=>x.id),
    ['both','sponsor','verified','ordinary','region','field']);
  assert.equal(items[0].id, 'ordinary');
  assert.equal(globalThis.INSAYA_DIRECTORY.verified({v:'false'}), false);
  assert.equal(globalThis.INSAYA_DIRECTORY.sponsored({featured:0}), false);
});

test('SQLite public directory applies policy after filter and excludes opted-out entries', async () => {
  process.env.DB_PATH = ':memory:';
  const {nomusa} = await import('../lib/repo.js');
  for (const row of [{id:'a',n:'A',loc:'서울'}, {id:'v',n:'Z',loc:'서울',v:true},
    {id:'s',n:'Z',loc:'서울',featured:true}, {id:'hidden',loc:'서울',featured:true,opted_out:true},
    {id:'other',loc:'부산',featured:true}]) nomusa.upsert(row);
  assert.deepEqual(nomusa.publicList({region:'서울'}).map(x=>x.id), ['s','v','a']);
});

test('PostgreSQL adapter uses the same ordering and literal region filter without migrations', async () => {
  const {default:pg} = await import('pg');
  const originalQuery=pg.Pool.prototype.query;
  const saved={STORAGE_DRIVER:process.env.STORAGE_DRIVER,DATABASE_URL:process.env.DATABASE_URL};
  process.env.STORAGE_DRIVER='postgres';process.env.DATABASE_URL='postgresql://127.0.0.1/unused_directory_fixture';
  pg.Pool.prototype.query=async function(sql){
    assert.match(sql,/WHERE opted_out=FALSE/);
    return {rows:[{doc:{id:'a',n:'A',loc:'서울'},featured:false},
      {doc:{id:'v',n:'Z',loc:'서울',v:true},featured:false},
      {doc:{id:'s',n:'Z',loc:'서울'},featured:true}]};
  };
  let runtime;
  try {
    runtime=await import('../lib/runtime-repo.js?directory-parity');
    assert.deepEqual((await runtime.nomusa.publicList({region:'서울'})).map(x=>x.id),['s','v','a']);
    assert.deepEqual(await runtime.nomusa.publicList({region:'%'}),[]);
  } finally {
    await runtime?.closeRuntimeStorage();pg.Pool.prototype.query=originalQuery;
    for(const [key,value] of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  }
});
