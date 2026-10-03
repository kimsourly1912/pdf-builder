import assert from "node:assert/strict";
import test, {after} from "node:test";
import {createServer} from "vite";
const vite=await createServer({configFile:false,appType:"custom",server:{middlewareMode:true}});
after(()=>vite.close());
const {defaultGraph,graphIssues}=await vite.ssrLoadModule('/features/workflows/workflow.ts');
const tools=await vite.ssrLoadModule('/features/workflows/editor-tools.ts');
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
