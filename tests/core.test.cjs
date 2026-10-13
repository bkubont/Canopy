const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { randomUUID } = require("node:crypto");

function createApp() {
  const source = fs.readFileSync("app.js", "utf8");
  // Do not resolve indexedDB.open; startup stays pending while pure state functions are tested.
  const ctx = vm.createContext({
    console,
    Date,
    crypto: { randomUUID },
    indexedDB: { open: () => ({}) },
    document: { addEventListener: () => {}, getElementById: () => ({innerHTML:""}) },
    window: { addEventListener: () => {} },
    setTimeout: () => {},
    confirm: () => true
  });
  const body = source.replace(/^\(function canopyV1\(\)\{\s*/, "").replace(/\}\)\(\);\s*$/, "");
  vm.runInContext(body, ctx);
  return (code) => vm.runInContext(code, ctx);
}
test("new state starts empty", () => {
  const run=createApp();
  assert.equal(run("db.clients.length"),0);
  assert.equal(run("db.projects.length"),0);
});
test("multi-day visit covers every day including both endpoints", () => {
  const run=createApp();
  assert.equal(run('dateRange("2026-10-11","2026-10-13").join(",")'),"2026-10-11,2026-10-12,2026-10-13");
});
test("moving workflow preserves dated work and does not claim new work", () => {
  const run=createApp();
  run('db.projects.push({id:"p1",clientId:"c1",title:"Oak removal",stage:"scheduled",phases:{}})');
  run('log("p1","prep","work","Prepared lines","2026-10-10")');
  run('changeStage("p1","tree")');
  assert.equal(run('proj("p1").stage'),"tree");
  assert.equal(run('db.history.length'),2);
  assert.equal(run('db.history[0].date'),"2026-10-10");
  assert.equal(run('statusFor("p1","2026-10-10").join(",")'),"prep");
  assert.equal(run('statusFor("p1",day()).join(",")'),"");
});
test("assigning a worker does not count as phase progress", () => {
  const run=createApp();
  run('db.projects.push({id:"p2",stage:"scheduled",phases:{}})');
  run('log("p2","prep","assignment","Assigned a worker","2026-10-11")');
  assert.equal(run('statusFor("p2","2026-10-11").length'),0);
  run('log("p2","prep","phase","Prep completed","2026-10-11")');
  assert.equal(run('statusFor("p2","2026-10-11").join(",")'),"prep");
});
test("user-entered client text is escaped before rendering", () => {
  const run=createApp();
  assert.equal(run('escape("<img src=x onerror=alert(1)>")'),"&lt;img src=x onerror=alert(1)&gt;");
});
test("legacy local data migrates without losing relationships or assignments", () => {
  const run=createApp();
  run(`db=migrate({schema:1,clients:[{id:"c1",name:"Sample"}],workers:[{id:"w1",name:"Worker",role:"Climber"}],projects:[{id:"p1",clientId:"c1",title:"Old title",description:"Old notes",stage:"scheduled",workerIds:["w1"],phases:{}}],visits:[{id:"v1",projectId:"p1",workerIds:["w1"]}],tasks:[{id:"t1",projectId:"p1"}],notes:[{id:"n1",projectId:"p1"}],photos:[{id:"f1",projectId:"p1",data:"data:image/jpeg;base64,sample"}],history:[{id:"h1",projectId:"p1",type:"work",phase:"tree",date:"2026-10-10",time:"2026-10-10T12:00:00Z"}]})`);
  assert.equal(run("db.schema"),2);
  assert.equal(run('proj("p1").stage'),"work_scheduled");
  assert.equal(run('proj("p1").jobNotes'),"Old notes");
  assert.equal(run('proj("p1").workerIds[0]'),"w1");
  assert.equal(run('db.visits[0].workerIds[0]'),"w1");
  assert.equal(run('db.tasks[0].id+db.notes[0].id+db.photos[0].id'),"t1n1f1");
  assert.equal(run("db.history.length"),1);
});
test("workflow order, approval history, and duration defaults are explicit", () => {
  const run=createApp();
  assert.equal(run("STAGES.map(x=>x[1]).join('|')"),"Lead|Estimate|Approved|Work Scheduled|Prep & Rigging|Tree Work|Cleanup|Complete");
  run('db.projects.push({id:"p1",stage:"estimate",phases:{}});changeStage("p1","approved")');
  assert.equal(run('db.history.filter(x=>x.type==="approval").length'),1);
  assert.equal(run('JSON.stringify(defaultEnd("estimate","2026-10-15","10:00"))'),'{"date":"2026-10-15","time":"12:00"}');
  assert.equal(run('JSON.stringify(defaultEnd("dump","2026-10-15","13:00"))'),'{"date":"2026-10-15","time":"14:00"}');
  assert.equal(run('JSON.stringify(defaultEnd("estimate","2026-10-15","23:00"))'),'{"date":"2026-10-16","time":"01:00"}');
  assert.equal(run('JSON.stringify(defaultEnd("dump","2026-10-15","23:30"))'),'{"date":"2026-10-16","time":"00:30"}');
  assert.equal(run('defaultEnd("tree","2026-10-15","10:00")'),null);
});

test("crew assignment controls exist only on calendar visits", () => {
  const run=createApp();
  run('db.projects.push({id:"p1",stage:"approved",phases:{prep:{complete:false,workerIds:["legacy"]}}})');
  assert.equal(run('phaseCard(proj("p1"),"prep","Prep & Rigging").includes("Assign phase")'),false);
  assert.equal(run('modalView().includes("Assign workers")'),false);
  run('modal={type:"visit",ref:null}');
  assert.equal(run('modalView().includes("Assign workers to this visit")'),true);
  assert.equal(run('proj("p1").phases.prep.workerIds[0]'),"legacy");
});
