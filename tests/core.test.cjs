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
test("moving project changes current stage without erasing prior daily history", () => {
  const run=createApp();
  run('db.projects.push({id:"p1",clientId:"c1",title:"Oak removal",stage:"scheduled",phases:{}})');
  run('log("p1","prep","work","Prepared lines","2026-10-10")');
  run('changeStage("p1","tree")');
  assert.equal(run('proj("p1").stage'),"tree");
  assert.equal(run('db.history.length'),2);
  assert.equal(run('db.history[0].date'),"2026-10-10");
  assert.equal(run('statusFor("p1","2026-10-10").join(",")'),"prep");
  assert.equal(run('statusFor("p1",day()).join(",")'),"tree");
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
