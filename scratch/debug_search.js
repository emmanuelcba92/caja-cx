const fs = require('fs');
const f = 'frontend/src/components/OrdenesView.jsx';
let code = fs.readFileSync(f, 'utf8');

// Add debug after isIOSFA line
const iosfaLine = "const isIOSFA = os.includes('iosfa');";
const iosfaIdx = code.indexOf(iosfaLine);
if (iosfaIdx === -1) { console.log('IOSFA line not found'); process.exit(1); }

const insertPoint = iosfaIdx + iosfaLine.length;
const debugLine = "\n\n            console.log('[DEBUG SEARCH]', { term, os, currentOS, formObraSocial: formData.obraSocial, isSwissMedical, modulosSMcount: MODULOS_SM?.length });";

code = code.substring(0, insertPoint) + debugLine + code.substring(insertPoint);

// Add debug in the parentModule lookup
const lookupLine = "const parentModule = MODULOS_SM.find(m => m.incluye && m.incluye.includes(surgery.codigo));";
const lookupIdx = code.indexOf(lookupLine);
if (lookupIdx === -1) { console.log('Lookup line not found'); process.exit(1); }
const afterLookup = lookupIdx + lookupLine.length;
const debugLine2 = "\n                    console.log('[DEBUG SM LOOKUP]', { surgeryCode: surgery.codigo, found: !!parentModule, moduleName: parentModule?.nombre });";
code = code.substring(0, afterLookup) + debugLine2 + code.substring(afterLookup);

fs.writeFileSync(f, code, 'utf8');
console.log('Debug logs added successfully');
