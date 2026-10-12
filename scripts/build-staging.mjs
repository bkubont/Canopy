import { readFile, writeFile, mkdir, rm, copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
function replaceOnce(source, before, after) {
  if(source.split(before).length!==2) throw new Error(`Staging source contract changed: ${before.slice(0,60)}`);
  return source.replace(before,after);
}
let app=await readFile('app.js','utf8');
app=replaceOnce(app,'const KEY="canopy-v1"','const KEY="canopy-testing-v1"');
app=replaceOnce(app,'db=await load()||fresh();render()', 'db=await load()||sample();await save();render()');
app=replaceOnce(app,'let db=fresh()', `function sample(){let data=fresh(),date=day();
 data.clients.push({id:'sample-client',name:'SAMPLE Client',address:'100 Example Lane',email:'sample@example.test',phone:'',details:'Fictional test record only'});
 data.workers.push({id:'sample-worker',name:'SAMPLE Worker',phone:'',role:'Crew'});
 data.projects.push({id:'sample-project',clientId:'sample-client',title:'SAMPLE Tree Job',address:'100 Example Lane',description:'Fictional private testing job',stage:'scheduled',phases:{},workerIds:['sample-worker']});
 data.visits.push({id:'sample-visit',projectId:'sample-project',start:date,end:date,startTime:'09:00',endTime:'12:00',workerIds:['sample-worker'],description:'Sample visit'});
 data.history.push({id:'sample-event',projectId:'sample-project',phase:null,type:'created',message:'SAMPLE project created',date,time:new Date().toISOString()});return data;}
let db=fresh()`);
app=replaceOnce(app, '🌲 Canopy<small>Tree work planner</small>', '🌲 CANOPY TESTING<small>Sample records only</small>');
app=replaceOnce(app,'canopy-backup-', 'CANOPY-TESTING-SAMPLE-backup-');
const settings=app.match(/^function settings\(\).*$/m)?.[0];
if(!settings)throw Error('Missing settings contract');
app=replaceOnce(app,settings,`function settings(){return page("Testing settings","SAMPLE DATA ONLY — no customer records.",btn("Export SAMPLE backup","export","primary"))+'<section class="panel"><h2>Private testing</h2><p>Records stay in this browser only. Your phone and computer do not synchronize. Backup import is disabled.</p>'+btn("Reset testing samples","reset-testing","danger")+'</section>'}`);
const restore=app.match(/^async function restore\(file\).*$/m)?.[0];
if(!restore)throw Error('Missing restore contract');
app=replaceOnce(app,restore,'');
app=replaceOnce(app,'document.addEventListener("change",e=>{if(e.target.id==="restore")restore(e.target.files[0])});','');
app=replaceOnce(app,'async function perform(action){', 'async function perform(action){if(action==="reset-testing"){if(confirm("Replace this browser’s TEST records with fresh samples?")){db=sample();await persist();go("dashboard")}return;}');
let html=await readFile('index.html','utf8');
html=replaceOnce(html,'<title>Canopy · Tree Work Planner</title>','<title>CANOPY TESTING · Sample data only</title>\n  <meta name="robots" content="noindex, nofollow, noarchive">');
html=replaceOnce(html,'<body>','<body>\n<div class="testing-banner" role="note">CANOPY TESTING — SAMPLE DATA ONLY · Local browser storage · No device sync</div>');
await rm('dist',{recursive:true,force:true});await mkdir('dist');
await writeFile('dist/index.html',html);await writeFile('dist/app.js',app);
await writeFile('dist/styles.css',(await readFile('styles.css','utf8'))+'\n.testing-banner{background:#ffe69a;color:#292000;padding:12px;text-align:center;font-weight:700;font-size:14px;line-height:1.4}');
await writeFile('dist/robots.txt','User-agent: *\nDisallow: /\n');
await copyFile('staging/htaccess','dist/.htaccess');
await mkdir('artifacts',{recursive:true});await rm('artifacts/canopy-testing.zip',{force:true});
execFileSync('zip',['-q','-r','../artifacts/canopy-testing.zip','.'],{cwd:'dist'});
console.log('Static sample-only build: dist/; deployment artifact: artifacts/canopy-testing.zip (includes .htaccess). No cloud configuration included.');
