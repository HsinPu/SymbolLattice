import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parser} from '@lezer/python';
import {extractPythonFileFacts} from '../../dist/extraction/python.js';
import {SYMBOL_LATTICE_VERSION} from '../../dist/version.js';
import {ARTIFACT_FACTS_EXTRACTOR_VERSION} from '../../dist/domain/facts.js';
const [projectArgument,python,outputArgument,baselineArgument]=process.argv.slice(2);
if(!projectArgument||!python||!outputArgument||!baselineArgument)throw Error('Usage: node benchmarks/python/member-calls.mjs PROJECT PYTHON OUTPUT BASELINE_PRODUCT');
const project=resolve(projectArgument),output=resolve(outputArgument);
const old=await import(pathToFileURL(resolve(baselineArgument,'dist/extraction/python.js')));
const git=(...args)=>execFileSync('git',['-C',project,...args],{encoding:'utf8',windowsHide:true}).trim();
const commit=git('rev-parse','HEAD'),repository=git('remote','get-url','origin');
if(git('status','--porcelain','--untracked-files=no'))throw Error('Corpus tracked sources must be clean');
execFileSync(python,[fileURLToPath(new URL('./MemberCallOracle.py',import.meta.url)),project,output+'.truth.json'],{windowsHide:true});
const truth=JSON.parse(readFileSync(output+'.truth.json','utf8'));
let tp=0,fp=0,fn=0,unsupported=0,rejected=0,existingFactsChanged=0;
const failures=[];const start=performance.now();
for(const record of truth.records){
 if(record.rejected){rejected++;continue;}
 const raw=readFileSync(resolve(project,record.path));
 if(createHash('sha256').update(raw).digest('hex')!==record.sha256)throw Error('Corpus changed: '+record.path);
 const sourceText=raw.toString('utf8').replace(/^\uFEFF/,'');
 const input={filePath:record.path,language:'python',sourceText};
 const facts=extractPythonFileFacts(input),previous=old.extractPythonFileFacts(input);
 const added=facts.edges.filter(e=>e.evidence?.ruleId==='syntax.python.member-call.unknown-receiver');
 if(!isDeepStrictEqual({...facts,edges:facts.edges.filter(e=>!added.includes(e))},previous)){existingFactsChanged++;failures.push({path:record.path,existingFactsChanged:true});}
 const cursor=parser.parse(sourceText).cursor();let invalid=false,rootError=false;
 do{if(cursor.type.isError){invalid=true;rootError ||= cursor.node.parent?.name==='Script';}}while(cursor.next());
 if(invalid&&!rootError&&sourceText.includes('\r\n')){const normalized=parser.parse(sourceText.replace(/\r\n/gu,'\n')).cursor();invalid=false;do{invalid ||= normalized.type.isError;}while(normalized.next());}
 if(invalid){unsupported+=record.calls.length;if(added.length)failures.push({path:record.path,invalid:true});continue;}
 const expected=record.calls.filter(c=>!previous.edges.some(e=>e.kind==='calls'&&e.resolution==='exact'&&e.range.end.line===c.range.end.line&&e.range.end.column===c.range.end.column));
 const actual=added.map(e=>{const s=facts.symbols.find(s=>s.id===e.sourceId);return {owner:{name:s?.name,line:s?.range.start.line},referenceName:e.referenceName,range:e.range};});
 const key=x=>JSON.stringify(x),a=new Set(actual.map(key)),b=new Set(expected.map(key));
 const missing=expected.filter(e=>!a.has(key(e))),unexpected=actual.filter(e=>!b.has(key(e)));
 tp+=expected.length-missing.length;fn+=missing.length;fp+=unexpected.length;
 if(missing.length||unexpected.length)failures.push({path:record.path,missing,unexpected});
}
if(git('rev-parse','HEAD')!==commit||git('status','--porcelain','--untracked-files=no'))throw Error('Corpus changed during audit');
const report={version:SYMBOL_LATTICE_VERSION,extractor:ARTIFACT_FACTS_EXTRACTOR_VERSION,node:process.version,python:truth.python,
 repository,commit,command:process.argv.slice(1),scope:'CPython dotted-name member calls in function bodies, excluding lambda and class-body execution, decorators and default arguments, and existing exact calls. Lezer rejected files (after eligible closed CRLF recovery) are counted separately. Targets are not inferred.',
 tp,fp,fn,precision:tp+fp?tp/(tp+fp):null,recall:tp+fn?tp/(tp+fn):null,
 unsupported,rejected,existingFactsChanged,files:truth.records.length,ms:performance.now()-start,failures};
writeFileSync(output,JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,failures:failures.slice(0,5)},null,2));
if(fp||fn||failures.length)process.exitCode=1;
