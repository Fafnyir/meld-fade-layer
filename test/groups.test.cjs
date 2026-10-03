'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const {FadeEngine} = require('../com.fafnyir.meldfade.sdPlugin/src/fade.cjs');
const {settings,groupLeaves,catalog} = require('../com.fafnyir.meldfade.sdPlugin/src/config.cjs');
function fixture(memory={}) {
 let time=0;
 const client=new EventEmitter();client.ready=true;
 client.items={s:{type:'scene',name:'Scene'},g:{type:'layer',name:'Group',parent:'s',visible:true},a:{type:'layer',name:'Group/A',parent:'s',visible:true,opacity:.6},b:{type:'layer',name:'Group/B',parent:'s',visible:true,opacity:1},h:{type:'layer',name:'Group/Hidden',parent:'s',visible:false},outside:{type:'layer',name:'Groupish/A',parent:'s',visible:true}};
 client.writes=[];client.setProperty=async(id,property,value)=>{client.writes.push({id,property,value});client.items[id][property]=value;client.onWrite?.(id,property,value)};
 const engine=new FadeEngine(client,{groupMemory:memory,now:()=>time,wait:async(ms)=>{time+=ms}});
 return {client,engine,s:settings({sceneId:'s',layerId:'g'}),memory};
}
test('Meld flattened path discovery excludes unrelated layers and intermediate folders',()=>{
 const {client}=fixture();client.items.n={type:'layer',name:'Group/Nested',parent:'s',visible:true};client.items.c={type:'layer',name:'Group/Nested/C',parent:'s',visible:true};
 assert.deepEqual(groupLeaves(client.items,'g').sort(),['a','b','c','h']);
 assert.ok(catalog(client.items).layers.find(x=>x.id==='g').name.endsWith('(group)'));
});
test('group fades only initially visible leaves and never writes the folder',async()=>{
 const {client,engine,s}=fixture();await engine.toggle(s);
 assert.ok(client.writes.every(w=>['a','b'].includes(w.id)));
 assert.equal(client.items.a.visible,false);assert.equal(client.items.b.visible,false);
 assert.equal(client.items.h.visible,false);assert.equal(client.items.g.visible,true);
 assert.equal(client.items.a.opacity,.6);assert.equal(engine.state('g').visible,false);
 await engine.toggle(s);
 assert.equal(client.items.a.visible,true);assert.equal(client.items.b.visible,true);assert.equal(client.items.h.visible,false);assert.equal(client.items.a.opacity,.6);
});
test('group membership survives engine restart while hidden',async()=>{
 const f=fixture();await f.engine.toggle(f.s);
 const next=new FadeEngine(f.client,{groupMemory:f.memory,now:()=>1000,wait:async()=>{}});
 // Zero-duration shortcut by controlling the clock across calls.
 let clock=0;next.now=()=>clock+=100;
 await next.toggle(f.s);
 assert.equal(f.client.items.a.visible,true);assert.equal(f.client.items.h.visible,false);
});
test('group reversal does not hide contents at the old endpoint',async()=>{
 const {client,engine,s}=fixture();let reversed=false;
 client.onWrite=(id,p,v)=>{if(!reversed&&id==='b'&&p==='opacity'&&v<.7&&v>0){reversed=true;engine.toggle(s)}};
 await engine.toggle(s);assert.ok(reversed);assert.equal(client.items.a.visible,true);assert.equal(client.items.a.opacity,.6);
 assert.ok(!client.writes.some(w=>w.property==='visible'&&!w.value));
});
test('overlapping child key cannot compete with active group',async()=>{
 const {engine,s}=fixture();const group=engine.toggle(s);
 await assert.rejects(engine.toggle({...s,layerId:'a'}),/already fading/);await group;
});
test('unknown all-hidden group does not reveal deliberately hidden children',async()=>{
 const {client,engine,s}=fixture();client.items.a.visible=false;client.items.b.visible=false;
 await assert.rejects(engine.toggle(s),/No visible group members/);assert.equal(client.writes.length,0);
});
test('group restore reuses remembered mask even after partial visibility failure',async()=>{
 const {client,engine,s}=fixture();await engine.toggle(s);client.items.a.visible=true;
 await engine.restore(s);assert.equal(client.items.b.visible,true);assert.equal(client.items.h.visible,false);
});
test('a hidden folder requires manual reveal instead of silently failing',async()=>{
 const {client,engine,s}=fixture();client.items.g.visible=false;
 await assert.rejects(engine.toggle(s),/Show the group folder/);assert.equal(client.writes.length,0);
});
