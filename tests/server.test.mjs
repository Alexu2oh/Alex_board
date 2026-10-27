import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../server.mjs';

test('boards persist objects independently and reject invalid inputs', async t => {
  const app = createServer({ database: ':memory:' });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.address().port}`;
  const created = await fetch(`${base}/api/boards`, {method:'POST'}).then(r => r.json());
  assert.match(created.id, /^[A-Za-z0-9_-]{32,}$/);
  const url = `${base}/api/boards/${created.id}/objects`;
  const send = object => fetch(url,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(object)});
  assert.equal((await send({id:'one',type:'sticky',x:2,y:3,text:'привет'})).status,200);
  assert.equal((await send({id:'two',type:'chord',x:5,y:6,chord:'Am'})).status,200);
  assert.equal((await send({id:'circle',type:'circle',x:7,y:8,color:'blue'})).status,200);
  assert.equal((await send({id:'square',type:'square',x:9,y:10,color:'pink'})).status,200);
  assert.equal((await send({id:'line',type:'stroke',x:0,y:0,color:'green',points:[[1,2],[3,4]]})).status,200);
  assert.equal((await send({id:'bad',type:'nope',x:0,y:0})).status,400);
  const board=await fetch(`${base}/api/boards/${created.id}`).then(r=>r.json());
  assert.deepEqual(board.objects.map(o=>o.id).sort(),['circle','line','one','square','two']);
  assert.equal(board.objects.find(o=>o.id==='line').color,'green');
  assert.equal(board.objects.find(o=>o.id==='circle').color,'blue');
  assert.equal((await fetch(`${url}/one`,{method:'DELETE'})).status,200);
  assert.equal((await fetch(`${base}/api/boards/${created.id}`,{method:'DELETE'})).status,200);
  assert.equal((await fetch(`${base}/api/boards/${created.id}`)).status,404);
  assert.equal((await fetch(`${base}/api/boards/not-a-board`)).status,404);
});

test('events reach listeners of the board', async t => {
  const app=createServer({database:':memory:'});
  await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
  t.after(()=>app.close());
  const base=`http://127.0.0.1:${app.address().port}`;
  const id=(await fetch(`${base}/api/boards`,{method:'POST'}).then(r=>r.json())).id;
  const controller=new AbortController();
  t.after(()=>controller.abort());
  const response=await fetch(`${base}/api/boards/${id}/events`,{signal:controller.signal});
  const reader=response.body.getReader();
  await reader.read();
  await fetch(`${base}/api/boards/${id}/objects`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({id:'x',type:'text',x:1,y:2,text:'hello'})});
  const event=new TextDecoder().decode((await reader.read()).value);
  assert.match(event,/"id":"x"/);
});

test('a board survives server restart', async t => {
  const dir=mkdtempSync(join(tmpdir(),'fraza-')), database=join(dir,'boards.sqlite');
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  let app=createServer({database});
  await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
  let base=`http://127.0.0.1:${app.address().port}`;
  const id=(await fetch(`${base}/api/boards`,{method:'POST'}).then(r=>r.json())).id;
  await fetch(`${base}/api/boards/${id}/objects`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({id:'saved',type:'sticky',x:1,y:2,text:'Урок'})});
  await new Promise(resolve=>app.close(resolve));
  app=createServer({database});
  await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
  base=`http://127.0.0.1:${app.address().port}`;
  const board=await fetch(`${base}/api/boards/${id}`).then(r=>r.json());
  assert.equal(board.objects[0].text,'Урок');
  await new Promise(resolve=>app.close(resolve));
});
