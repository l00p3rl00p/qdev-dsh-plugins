import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createReanchor,FIRST_DRIFT_MESSAGE,secondDriftReminder,GENTLE_MENTOR_MESSAGE} from '../reanchor.mjs';
import {applyMentorEdit,MENTOR_FIELDS} from '../mentor-context.mjs';

// Spec B1-B5: the escalation bypass. Drives the same drift path the runtime uses (createReanchor.drift).
const planEvent=(text)=>({type:'user/message',data:{id:'original',source:{kind:'user'},content:[{type:'text',text}]}});

function harness({bypass=false}={}){
  const injected=[],humans=[],registered=[];
  const mentor=createReanchor({
    inject:x=>injected.push(x),
    escalate:x=>humans.push(x),
    bypassFor:()=>bypass,
    onRegister:x=>registered.push(x),
    contextFor:()=>({}),
  });
  mentor.observe('s',planEvent('The mission is unchanged.'));
  mentor.observe('s',{type:'turn/start',data:{turn:7}});
  const drift=()=>mentor.drift('s',{drift_detected:true,turn:7});
  return {drift,injected,humans,registered};
}

test('bypass off: the existing escalation still happens on the third drift',()=>{
  const {drift,humans}=harness({bypass:false});
  assert.equal(drift(),'injected');
  assert.equal(drift(),'injected');
  assert.equal(drift(),'human');
  assert.equal(humans.length,1);
});

test('bypass on: never escalates, however many drifts occur',()=>{
  const {drift,humans}=harness({bypass:true});
  for(let i=0;i<25;i++) assert.equal(drift(),'injected');
  assert.equal(humans.length,0);
});

test('bypass on: drift 1 and drifts 2-9 send the first-drift sentence',()=>{
  const {drift,injected}=harness({bypass:true});
  for(let i=0;i<9;i++) drift();
  for(let i=0;i<9;i++) assert.equal(injected[i].reminder,FIRST_DRIFT_MESSAGE,`drift ${i+1}`);
});

test('bypass on: every 10th drift sends the full second-drift message with the plan',()=>{
  const {drift,injected}=harness({bypass:true});
  for(let i=0;i<20;i++) drift();
  const full=secondDriftReminder({message:GENTLE_MENTOR_MESSAGE,plan:'The mission is unchanged.',amendments:[]});
  assert.equal(injected[9].reminder,full,'drift 10');
  assert.equal(injected[19].reminder,full,'drift 20');
  assert.equal(injected[10].reminder,FIRST_DRIFT_MESSAGE,'drift 11 goes back to the first sentence');
});

test('register: one entry per drift, in order, whether bypassed or not',()=>{
  const {drift,registered}=harness({bypass:true});
  for(let i=0;i<12;i++) drift();
  assert.equal(registered.length,12);
  assert.deepEqual(registered.map(r=>r.drift),[1,2,3,4,5,6,7,8,9,10,11,12]);
  assert.equal(registered[9].sent,'full');
  assert.equal(registered[0].sent,'first');
});

test('register: a normal (bypass off) drift is also recorded',()=>{
  const {drift,registered}=harness({bypass:false});
  drift();
  drift();
  assert.equal(registered.length,2);
  assert.equal(registered[0].sent,'first');
  assert.equal(registered[1].sent,'full');
});

// Spec B1 and B6: the per-chat switch is a saved Mentor field, and only the two valid values are accepted.
test('per-chat bypass is a saved Mentor field (spec B1)',()=>{
  assert.ok(MENTOR_FIELDS.includes('escalationBypass'));
  assert.deepEqual(applyMentorEdit({},'escalationBypass',true),{escalationBypass:true});
  assert.deepEqual(applyMentorEdit({escalationBypass:true},'escalationBypass',null),{});
});

test('per-chat bypass rejects a non-boolean value',()=>{
  assert.throws(()=>applyMentorEdit({},'escalationBypass','yes'));
});

// Review finding: the bypass cadence must accumulate across turns, not restart at each turn/start.
test('bypass on: the 10th drift sends the full message even when the drifts span two turns',()=>{
  const injected=[];
  const mentor=createReanchor({inject:x=>injected.push(x),escalate:()=>{},bypassFor:()=>true,contextFor:()=>({})});
  mentor.observe('s',planEvent('The mission is unchanged.'));
  const full=secondDriftReminder({message:GENTLE_MENTOR_MESSAGE,plan:'The mission is unchanged.',amendments:[]});
  for(const turn of [7,8]){
    mentor.observe('s',{type:'turn/start',data:{turn}});
    for(let i=0;i<5;i++) assert.equal(mentor.drift('s',{drift_detected:true,turn}),'injected');
  }
  assert.equal(injected.length,10);
  for(let i=0;i<9;i++) assert.equal(injected[i].reminder,FIRST_DRIFT_MESSAGE,`drift ${i+1}`);
  assert.equal(injected[9].reminder,full,'drift 10 (the 5th of turn 8)');
  assert.equal(injected[9].attempt,10);
});

test('bypass on: two chats count their drifts separately',()=>{
  const injected=[];
  const mentor=createReanchor({inject:x=>injected.push(x),escalate:()=>{},bypassFor:()=>true,contextFor:()=>({})});
  for(const id of ['a','b']) mentor.observe(id,planEvent('Plan '+id));
  for(const turn of [1,2]) for(const id of ['a','b']){
    mentor.observe(id,{type:'turn/start',data:{turn}});
    for(let i=0;i<3;i++) mentor.drift(id,{drift_detected:true,turn});
  }
  // 6 drifts each, so neither chat has reached its 10th: no full message may appear.
  assert.equal(injected.length,12);
  assert.ok(injected.every(x=>x.reminder===FIRST_DRIFT_MESSAGE));
});
