import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {parser} from '@lezer/python';
import {extractPythonFileFacts} from '../../dist/extraction/python.js';
import {SYMBOL_LATTICE_VERSION} from '../../dist/version.js';
const [projectArgument,python,outputArgument,baselineArgument]=process.argv.slice(2);
if(!projectArgument||!python||!outputArgument) throw new Error('Usage: node benchmarks/python/module-bindings.mjs PROJECT PYTHON OUTPUT [BASELINE_PRODUCT]');
const baseline=baselineArgument ? await import(pathToFileURL(resolve(baselineArgument,'dist/extraction/python.js')).href) : null;
const project=resolve(projectArgument),output=resolve(outputArgument);
const git=(...args)=>execFileSync('git',['-C',project,...args],{encoding:'utf8',windowsHide:true}).trim();
const commit=git('rev-parse','HEAD'),repository=git('remote','get-url','origin');
if(git('status','--porcelain','--untracked-files=no')) throw new Error('Corpus tracked sources must be clean');
const truthPath=output+'.truth.json';
execFileSync(python,[fileURLToPath(new URL('./ModuleBindingOracle.py',import.meta.url)),project,truthPath],{windowsHide:true});
const truth=JSON.parse(readFileSync(truthPath,'utf8'));
let tp=0,fp=0,fn=0,rejected=0,unsupported=0,comparedFiles=0;
const failures=[];
const started=performance.now();
for(const record of truth.records) {
 const raw=readFileSync(resolve(project,record.path));
 if(createHash('sha256').update(raw).digest('hex')!==record.sha256) throw new Error(record.path);
 if(record.rejected){rejected++;continue;}
 const sourceText=raw.toString('utf8').replace(/^\uFEFF/,'');
 const cursor=parser.parse(sourceText).cursor();let invalid=false;
 do {if(cursor.type.isError)invalid=true;}while(cursor.next());
 const facts=extractPythonFileFacts({filePath:record.path,language:'python',sourceText});
 if(baseline) {
   const previous=baseline.extractPythonFileFacts({filePath:record.path,language:'python',sourceText});
   const addedIds=new Set(facts.symbols.filter(s=>s.kind==='variable').map(s=>s.id));
   const stable={...facts,symbols:facts.symbols.filter(s=>!addedIds.has(s.id)),edges:facts.edges.filter(e=>!addedIds.has(e.sourceId)&&!addedIds.has(e.targetId))};
   if(!isDeepStrictEqual(stable,previous)) failures.push({file:record.path,existingFactsChanged:true});
   comparedFiles++;
 }
 const actual=facts.symbols.filter(s=>s.kind==='variable').map(s=>({name:s.name,range:s.range}));
 if(invalid){unsupported+=record.bindings.length;if(actual.length) failures.push({file:record.path,invalid,actual});continue;}
 const key=x=>JSON.stringify(x);
 const expectedKeys=new Set(record.bindings.map(key));const actualKeys=new Set(actual.map(key));
 if(actualKeys.size!==actual.length)failures.push({file:record.path,duplicateDeclarations:true});
 const missing=record.bindings.filter(x=>!actualKeys.has(key(x)));
 const unexpected=actual.filter(x=>!expectedKeys.has(key(x)));
 tp+=record.bindings.length-missing.length;fn+=missing.length;fp+=unexpected.length;
 if(missing.length||unexpected.length)failures.push({file:record.path,missing,unexpected});
}
if(git('rev-parse','HEAD')!==commit||git('status','--porcelain','--untracked-files=no')) throw new Error('Corpus changed during audit');
const report={version:SYMBOL_LATTICE_VERSION,node:process.version,repository,commit,command:process.argv.slice(1),python:truth.python,files:truth.records.length,tp,fp,fn,precision:tp+fp?tp/(tp+fp):null,recall:tp+fn?tp/(tp+fn):null,rejected,unsupported,comparedFiles,ms:performance.now()-started,failures};
writeFileSync(output,JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,failures:failures.slice(0,8)},null,2));
if(fp||fn||failures.length)process.exitCode=1;
