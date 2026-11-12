import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createPluginRuntime,PRESETS} from '../runtime.mjs';
import {createReanchor,FIRST_DRIFT_MESSAGE,secondDriftReminder,GENTLE_MENTOR_MESSAGE} from '../reanchor.mjs';
const event=(text,turn=1)=>({type:'assistant/message',data:{turn,message:{content:[{type:'text',text}]}}});
test('five thresholds, upstream default at center',()=>assert.deepEqual(PRESETS,[0.05,0.1,0.2,0.3,0.4]));
test('gentle mentor pauses after two reminders and a third-drift human escalation',()=>{
 const injected=[],humans=[],changes=[];
 const mentor=createReanchor({inject:x=>injected.push(x),escalate:x=>humans.push(x),onStateChange:x=>changes.push(x)});
 mentor.observe('s',{type:'user/message',data:{id:'original',source:{kind:'user'},content:[{type:'text',text:'The mission is unchanged.'}]}});
 mentor.observe('s',{type:'turn/start',data:{turn:7}});
 assert.equal(mentor.drift('s',{drift_detected:true,turn:7}),'injected');
 assert.equal(mentor.drift('s',{drift_detected:true,turn:7}),'injected');
 assert.equal(mentor.drift('s',{drift_detected:true,turn:7}),'human');
 assert.equal(mentor.drift('s',{drift_detected:true,turn:7}),'awaiting-reset-decision');
 assert.equal(injected.length,2);assert.equal(humans.length,1);
 // Feature 5: drift 1 is exactly the first-drift sentence; drift 2 carries the plan (no amendments yet).
 assert.equal(injected[0].reminder,FIRST_DRIFT_MESSAGE);
 assert.equal(injected[1].reminder,secondDriftReminder({plan:'The mission is unchanged.',amendments:[]}));
 assert.ok(injected[1].reminder.includes('Current plan:\n\nThe mission is unchanged.'));
 assert.deepEqual(changes.at(-1),{sessionId:'s',turn:7,driftCount:3,carry:3,decisionPending:true,escalated:true});
});

test('reset choice starts a fresh reminder allowance on the next turn',()=>{
 const injected=[],humans=[];
 const mentor=createReanchor({inject:x=>injected.push(x),escalate:x=>humans.push(x)});
 mentor.observe('s',{type:'user/message',data:{source:{kind:'user'},content:[{type:'text',text:'Keep the plan'}]}});
 mentor.observe('s',{type:'turn/start',data:{turn:1}});
 for(let i=0;i<3;i++)mentor.drift('s',{drift_detected:true,turn:1});
 const decision=mentor.decide('s',true);
 assert.equal(decision.accepted,true);assert.equal(decision.carry,0);assert.equal(decision.driftCount,0);
 mentor.observe('s',{type:'turn/start',data:{turn:2}});
 assert.equal(mentor.drift('s',{drift_detected:true,turn:2}),'injected');
 assert.equal(injected.length,3);assert.equal(humans.length,1);
});

test('declining reset carries three strikes so the next drift escalates immediately',()=>{
 const humans=[];
 const mentor=createReanchor({inject:()=>{},escalate:x=>humans.push(x)});
 mentor.observe('s',{type:'user/message',data:{source:{kind:'user'},content:[{type:'text',text:'Keep the plan'}]}});
 mentor.observe('s',{type:'turn/start',data:{turn:1}});
 for(let i=0;i<3;i++)mentor.drift('s',{drift_detected:true,turn:1});
 const decision=mentor.decide('s',false);
 assert.equal(decision.accepted,true);assert.equal(decision.carry,3);
 mentor.observe('s',{type:'turn/start',data:{turn:2}});
 assert.equal(mentor.drift('s',{drift_detected:true,turn:2}),'human');
 assert.equal(humans.length,2);assert.equal(mentor.snapshot('s').driftCount,4);
});

test('persisted carry survives runtime recreation without falsifying SOUP measurements',()=>{
 const humans=[];
 const mentor=createReanchor({inject:()=>{},escalate:x=>humans.push(x),initialState:{s:{carry:3,decisionPending:false}}});
 mentor.observe('s',{type:'user/message',data:{source:{kind:'user'},content:[{type:'text',text:'Keep the plan'}]}});
 mentor.observe('s',{type:'turn/start',data:{turn:9}});
 assert.equal(mentor.drift('s',{drift_detected:true,turn:9}),'human');
 assert.equal(humans[0].detections,4);
});
test('stale asynchronous drift is suppressed instead of reattributed to a later turn',()=>{
 const injected=[],stale=[];
 const mentor=createReanchor({inject:x=>injected.push(x),escalate:()=>{},reportStale:x=>stale.push(x)});
 mentor.observe('s',{type:'user/message',data:{source:{kind:'user'},content:[{type:'text',text:'Keep the original plan'}]}});
 mentor.observe('s',{type:'turn/start',data:{turn:1}});
 mentor.observe('s',{type:'turn/start',data:{turn:2}});
 assert.equal(mentor.drift('s',{drift_detected:true,turn:1}),'stale-turn');
 assert.equal(injected.length,0);assert.equal(stale.length,1);
});
test('direct SOUP Python worker: three independent windows cause 2 reminders and one escalation',async()=>{
 const injected=[],humans=[],notices=[],errors=[];
 let resolveComplete;const complete=new Promise(resolve=>resolveComplete=resolve);
 const p=createPluginRuntime({python:process.env.SOUP_PYTHON||'/home/qdev/llm-runtime/tools/venvs/soup/bin/python',baselineCount:1,windowCount:1,
  inject:x=>injected.push(x),escalate:x=>humans.push(x),
  notify:x=>{notices.push(x);if(notices.length===3)resolveComplete()},onError:e=>{errors.push(e);resolveComplete()}});
 p.observe('s',{type:'turn/start',data:{turn:1}});
 p.observe('s',{type:'user/message',data:{id:'1',source:{kind:'user'},content:[{type:'text',text:'Stay with the plan'}]}});
 p.observe('s',event('keep following the plan'));
 // Each Python child is asynchronous. Allow each window to finish before issuing the next.
 for(let n=1;n<=3;n++){
  p.observe('s',event('different unrelated output topic'));
  const target=n;let until=Date.now()+8000;
  while(notices.length<target&&!errors.length&&Date.now()<until)await new Promise(r=>setTimeout(r,30));
  assert.equal(notices.length,target,errors[0]?.message||'SOUP did not report');
 }
 await complete;
 assert.deepEqual(errors,[]);assert.equal(injected.length,2);assert.equal(humans.length,1);
 p.dispose();
});

test('canonical native DSH plugin identity matches Cordis registration and package description',()=>{
 const pkg=JSON.parse(readFileSync(fileURLToPath(new URL('../package.json',import.meta.url)),'utf8'));
 const patch=readFileSync(fileURLToPath(new URL('../cordis.patch.yml',import.meta.url)),'utf8');
 assert.equal(pkg.name,'qdev-trajectory-drift-soup');
 assert.equal(pkg.version,'0.7.0');
 assert.match(pkg.description,/trajectory drift/i);
 assert.equal(pkg.exports['./client'],'./client.js');
 assert.equal(pkg.exports['./icon'],'./icon.svg');
 assert.equal(pkg.dsh.client.platform,'web');
 assert.match(patch,/id: qdev-trajectory-drift-soup/);
 assert.match(patch,/name: qdev-trajectory-drift-soup/);
 assert.equal(pkg.main,'./dist/index.js');
});
test('second-drift reminder lists plan amendments one "- " line each, after the plan',()=>{
 const text=secondDriftReminder({plan:'Ship the card.',amendments:['Keep the chart.','Drop the footnote.']});
 assert.equal(text,[GENTLE_MENTOR_MESSAGE,'','Current plan:','','Ship the card.','','Plan amendments:','- Keep the chart.','- Drop the footnote.'].join('\n'));
});
