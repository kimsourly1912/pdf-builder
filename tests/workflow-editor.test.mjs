import assert from "node:assert/strict";
import test, {after} from "node:test";
import {createServer} from "vite";
const vite=await createServer({configFile:false,appType:"custom",server:{middlewareMode:true}});
after(()=>vite.close());
const {defaultGraph,graphIssues}=await vite.ssrLoadModule('/features/workflows/workflow.ts');
const tools=await vite.ssrLoadModule('/features/workflows/editor-tools.ts');
const {parseDraftGraph,parseGraph}=await vite.ssrLoadModule('/features/workflows/workflow.ts');
const workspace=await vite.ssrLoadModule('/features/workflows/workspace-tools.ts');
const {executionGuidance}=await vite.ssrLoadModule("/features/workflows/execution-guidance.ts");
const guide=await vite.ssrLoadModule("/features/workflows/guided-setup.ts");
const attention=await vite.ssrLoadModule("/features/hr/attention.ts");
function graph(){const g=defaultGraph();g.nodes.find(n=>n.kind==='assign_forms').config.forms=[{templateId:'form-1',roleId:'form_user'}];return g;}
test('contextual insertion preserves approved branch and does not mutate the saved graph',()=>{
 const original=graph(),before=structuredClone(original),node=tools.newStep('condition',{x:500,y:100},'extra');
 const inserted=tools.insertStep(original,node,'review','approved');
 assert.deepEqual(original,before);
 assert(inserted.edges.some(e=>e.source==='review'&&e.target==='extra'&&e.outcome==='approved'));
 assert(inserted.edges.some(e=>e.source==='extra'&&e.target==='account'&&e.outcome==='yes'));
 assert(inserted.edges.some(e=>e.source==='review'&&e.target==='stop'&&e.outcome==='rejected'));
 assert(graphIssues(inserted).some(issue=>issue.includes('yes and no')));
 assert.throws(()=>tools.insertStep(original,tools.newStep('create_account',{x:0,y:0},'bad'),'review','rejected'),/directly to Stop/);
 assert.throws(()=>tools.insertStep(original,tools.newStep('complete',{x:0,y:0},'bad'),'link'),/terminal/);
});
test('connections reject loops, occupied outputs and invalid review branches while permitting explicit reconnect',()=>{
 const g=graph();assert.match(tools.connectionIssue(g,'link','review','next','link-assign'),/loop/);
 assert.match(tools.connectionIssue(g,'review','account','rejected','review-stop'),/directly to Stop/);
 assert.match(tools.connectionIssue(g,'account','done','next'),/already has/);
 assert.equal(tools.connectionIssue(g,'account','assign','next','account-link'),null);
 assert.match(tools.connectionIssue(g,'account','upload','next','account-link'),/starting event/);
});
test('removal protects trigger and removes dangling edges without changing the source snapshot',()=>{
 const g=graph(),copy=structuredClone(g),removed=tools.removeSteps(g,['upload','link']);
 assert(removed.nodes.some(n=>n.id==='upload'));assert(!removed.nodes.some(n=>n.id==='link'));
 assert(!removed.edges.some(e=>e.source==='link'||e.target==='link'));assert.deepEqual(g,copy);
});
test('auto arrangement preserves graph semantics and stays bounded for incomplete cyclic drafts',()=>{
 const g=graph(),before=structuredClone(g),arranged=tools.arrangeGraph(g);
 assert.deepEqual(arranged.edges,g.edges);assert.deepEqual(g,before);assert.deepEqual(graphIssues(arranged),[]);
 assert.equal(new Set(arranged.nodes.map(n=>JSON.stringify(n.position))).size,arranged.nodes.length);
 const cyclic={...g,edges:[...g.edges,{id:'loop',source:'assign',target:'review',outcome:'next'}]};
 assert(tools.arrangeGraph(cyclic).nodes.every(n=>Number.isFinite(n.position.x)&&n.position.x<100000));
});
test('unfinished invitation and annotations persist in draft but strict publication parsing rejects an empty message',()=>{
 const g=graph();g.nodes.push({...tools.newStep('send_telegram',{x:0,y:0},'message'),label:'Invite candidate',note:'HR-only annotation',config:{message:''}});
 const draft=parseDraftGraph(g);assert(draft);assert.equal(draft.nodes.at(-1).config.message,'');assert.equal(draft.nodes.at(-1).note,'HR-only annotation');assert.equal(parseGraph(g),null);assert(graphIssues(draft).some(i=>i.includes('invitation')));
 assert.equal(parseDraftGraph({...g,nodes:[{...g.nodes[0],note:'x'.repeat(2001)}]}),null);
});
test('sample preview branches use sample decisions and never mutate the graph or produce real capabilities',()=>{
 const g=graph(),copy=structuredClone(g);g.nodes.push(tools.newStep('send_telegram',{x:0,y:0},'message'));g.edges=g.edges.filter(e=>e.id!=='assign-done');g.edges.push({id:'a-m',source:'assign',target:'message',outcome:'next'},{id:'m-d',source:'message',target:'done',outcome:'next'});
 const original=structuredClone(g),sample={name:'TEST Dara',email:'dara@example.test',source:'telegram',appliedPosition:'Accountant',approved:true,existingAccount:false,telegramConfirmed:true};
 const preview=workspace.previewWorkflow(g,sample,[{id:'form-1',name:'Employee particulars',roles:[]}]);assert(preview.steps.some(s=>s.id==='message'&&s.message.includes('TEST Dara')));assert.deepEqual(g,original);assert(!JSON.stringify(preview).includes('https://'));
 const rejected=workspace.previewWorkflow(g,{...sample,approved:false},[]);assert(rejected.steps.some(s=>s.id==='stop'));assert(!rejected.steps.some(s=>s.id==='account'));
 const deferred=workspace.previewWorkflow(g,{...sample,telegramConfirmed:false},[]);assert(!deferred.steps.some(s=>s.id==='done'));assert(deferred.steps.at(-1).result.includes('wait'));
 assert.deepEqual(copy,graph());
});
test('graph comparison ignores pinned form metadata and finds draft changes; legacy outputs are explicitly unavailable',()=>{
 const g=graph(),published=structuredClone(g);published.nodes.find(n=>n.kind==='assign_forms').config.forms[0].versionId='version-1';published.nodes.find(n=>n.kind==='assign_forms').config.forms[0].name='Form';assert.equal(workspace.graphIdentity(g),workspace.graphIdentity(published));
 const changed=structuredClone(g);changed.nodes[0].label='Start here';assert(workspace.graphChanges(g,changed).some(i=>i.includes('annotation')));
 assert.deepEqual(workspace.stepEvidence({context:{steps:{}}},g.nodes[0],'output'),[['Result','No result recorded for this step']]);
});

test('waiting steps have no chosen branch while completed legacy steps explicitly lack outcome evidence',()=>{
 const node=graph().nodes.find(n=>n.kind==='review_resume');
 const run={context:{steps:{[node.id]:{status:'waiting',attempts:1}}}};
 assert(workspace.stepEvidence(run,node,'output').some(([label,value])=>label==='Branch'&&value==='No branch result recorded yet'));
 run.context.steps[node.id].status='completed';
 assert(workspace.stepEvidence(run,node,'output').some(([label,value])=>label==='Branch'&&value.includes('older execution')));
 run.context.steps[node.id].outcome='approved';
 assert(workspace.stepEvidence(run,node,'output').some(([label,value])=>label==='Branch'&&value==='approved'));
});

test('execution waiting guidance never calls human review stuck and distinguishes delayed worker activity',()=>{
 const now=Date.parse('2026-10-03T12:00:00Z');const run={graph:graph(),currentNodeId:'review',status:'waiting_review',updatedAt:'2026-10-01T12:00:00Z',context:{steps:{},reviewStartedAt:'2026-10-01T12:00:00Z'}};
 assert.match(executionGuidance(run,now).title,/HR review.*2 days/);assert.match(executionGuidance(run,now).action,/no automatic timeout/);
 run.context.waitingFor='telegram';assert.match(executionGuidance(run,now).title,/Telegram confirmation/);assert(!executionGuidance(run,now).title.includes('2 days'));
 run.context.waitingFor='telegram_retry';assert.match(executionGuidance(run,now).title,/Telegram retry/);
 delete run.context.waitingFor;run.currentNodeId='account';run.status='queued';assert.equal(executionGuidance(run,now).title,'Processing may be delayed');
 run.updatedAt='2026-10-03T11:59:00Z';assert.equal(executionGuidance(run,now).title,'Waiting for processing');
 run.status='completed';assert.match(executionGuidance(run,now).title,/completed/);
});

test('guided setup preserves preset review gates and resumes only an unchanged preset structure',()=>{
 const targets=[{templateId:'form-1',roleId:'form_user',versionId:'old-pin',name:'Old name'}];
 for(const purpose of ['approval','telegram','manual']) {
  const g=guide.guidedGraph(purpose,targets);assert.deepEqual(graphIssues(g),[]);assert.equal(guide.guidedPurpose(g),purpose);
  const assign=g.nodes.find(n=>n.kind==='assign_forms');if(assign)assert.deepEqual(assign.config.forms,[{templateId:'form-1',roleId:'form_user'}]);
  const changed=structuredClone(g);changed.nodes[0].label='Custom start';assert.equal(guide.guidedPurpose(changed),null);
  const rewired=structuredClone(g);rewired.edges.pop();assert.equal(guide.guidedPurpose(rewired),null);
 }
 const options=[{id:'form-1',name:'Form',roles:[{id:'form_user',name:'User'}]}];
 assert.equal(guide.guidedFormIssues('approval',targets,options).length,0);
 assert(guide.guidedFormIssues('manual',[],options).length);assert(guide.guidedFormIssues('manual',[{templateId:'form-1',roleId:'missing'}],options).length);
 assert(guide.guidedFormIssues('manual',[targets[0],targets[0]],options).length);assert.deepEqual(guide.guidedFormIssues('telegram',[],[]),[]);
});

test('attention tasks use evidence rather than manual stages, keep contact actions unique and preserve archived history',()=>{
 const item={id:'c1',name:'TEST Dara',email:'dara@example.test',selectedCv:{id:'cv1',fileName:'CV.pdf',receivedAt:'2026-10-01T00:00:00Z',archived:false},facts:{verified:false,reviewStarted:false,preparationCurrent:false},issues:[],activity:[],forms:[],run:null,stage:'accepted'};
 assert.deepEqual(attention.candidateAttention(item).map(t=>t.type),['cv_review']);
 item.facts.verified=true;assert.deepEqual(attention.candidateAttention(item),[]);
 item.issues=[{key:'contact',message:'Confirm contact',action:'Confirm contact',href:'/intake/i1#contact'},{key:'telegram',message:'Connect',action:'Connect',href:'/workflows/w1'}];item.run={id:'run1',workflowId:'w1',status:'failed',updatedAt:'2026-10-02T00:00:00Z',archived:false};
 let tasks=attention.candidateAttention(item);assert.equal(tasks.filter(t=>t.type==='telegram').length,1);assert.equal(tasks.find(t=>t.type==='telegram').since,null);assert(tasks.some(t=>t.type==='preparation'&&t.href.includes('run=run1')));
 item.run.archived=true;assert(!attention.candidateAttention(item).some(t=>t.type==='preparation'));
 item.issues=[];item.facts.preparationCurrent=true;item.forms=[{id:'f1',name:'Form',status:'assigned',assignedAt:'2026-10-01T00:00:00Z'},{id:'f2',status:'completed'},{id:'f3',status:'expired'}];
 tasks=attention.candidateAttention(item);assert.equal(tasks.filter(t=>t.type==='pending_forms').length,1);assert.match(tasks[0].reason,/1 assigned form/);
 item.forms[0].status='completed';assert.deepEqual(attention.candidateAttention(item),[]);
});
test('attention pagination searches before paging, sorts unknown clocks last and counts tasks separately from candidates',()=>{
 const tasks=Array.from({length:61},(_,i)=>({id:'task'+i,type:'cv_review',candidateId:'one',name:'TEST Dara',email:'test@example.test',detail:'CV.pdf',reason:'Needs review',since:i===0?null:'2026-10-01T00:00:00Z',urgent:false}));
 const page=attention.attentionPage(tasks,new URLSearchParams({page:'2',search:'Dara'}));assert.equal(page.total,61);assert.equal(page.items.length,25);assert.equal(page.candidates,1);
 assert.equal(attention.attentionPage(tasks,new URLSearchParams({page:'999'})).page,3);assert.equal(attention.attentionPage(tasks,new URLSearchParams({type:'telegram'})).total,0);
 assert.equal(attention.attentionPage(tasks,new URLSearchParams({sort:'oldest',page:'3'})).items.at(-1).id,'task0');assert.equal(attention.attentionAge(null),'Start time unknown');
});
