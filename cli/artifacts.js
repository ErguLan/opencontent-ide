#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseDiagramDsl, diagramToSvg } from '../src/services/artifacts/diagramEngine.js';
import { documentFromText, serializeDocumentToPdf } from '../src/services/artifacts/pdfEngine.js';
const [command, ...args] = process.argv.slice(2); const outIndex = args.indexOf('--out'); const out = outIndex >= 0 ? args[outIndex + 1] : null; const cleanArgs = args.filter((_,i)=>i!==outIndex&&i!==outIndex+1);
async function main(){ if(command==='diagram'){const artifact=parseDiagramDsl(cleanArgs.join(' ').replace(/\s*;\s*/g,'\n'));const target=resolve(out||'opencontent-diagram.svg');writeFileSync(target,diagramToSvg(artifact));console.log(target);return;} if(command==='document'){const artifact=documentFromText(cleanArgs.join(' '),{name:'OpenContent document'});const blob=serializeDocumentToPdf(artifact);const target=resolve(out||'opencontent-document.pdf');writeFileSync(target,Buffer.from(await blob.arrayBuffer()));console.log(target);return;} console.log('Usage: node cli/artifacts.js diagram "A -> B; B -> C" --out diagram.svg');console.log('       node cli/artifacts.js document "Document text" --out document.pdf');}
main().catch((error)=>{console.error(error.message);process.exitCode=1;});
