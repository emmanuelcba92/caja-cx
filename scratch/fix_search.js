const fs = require('fs');
const f = 'frontend/src/components/OrdenesView.jsx';
let code = fs.readFileSync(f, 'utf8');

const startMarker = '            // 1. Search in General Codes';
const endMarker = '            setHighlightedIndex(0);';

const startIdx = code.indexOf(startMarker);
const endIdx = code.indexOf(endMarker, startIdx);

if (startIdx === -1) { console.log('START NOT FOUND'); process.exit(1); }
if (endIdx === -1) { console.log('END NOT FOUND'); process.exit(1); }

const newBlock = `            // 1. Collect all SM module codes so we can exclude them from general results
            const smModuleCodes = new Set();
            if (MODULOS_SM) {
                MODULOS_SM.forEach(m => smModuleCodes.add(m.codigo));
            }

            // 2. Search in General Codes (excluding SM module codes)
            let results = [];
            const seenCodes = new Set();

            const generalMatches = (CODIGOS_CIRUGIA || []).filter(c => {
                if (field === 'codigo') {
                    return c.codigo && c.codigo.toString().startsWith(term);
                } else {
                    return c.nombre && c.nombre.toLowerCase().includes(term);
                }
            });

            generalMatches.forEach(surgery => {
                if (seenCodes.has(surgery.codigo)) return;
                // Skip SM module codes - they only appear through parentModule
                if (smModuleCodes.has(surgery.codigo)) return;

                if (isSwissMedical && MODULOS_SM) {
                    const parentModule = MODULOS_SM.find(m => m.incluye && m.incluye.includes(surgery.codigo));
                    if (parentModule) {
                        // Show as SM module version (single entry)
                        results.push({ ...surgery, parentModule, source: 'sm' });
                        seenCodes.add(surgery.codigo);
                        return;
                    }
                }

                results.push({ ...surgery, source: 'general' });
                seenCodes.add(surgery.codigo);
            });

            // 3. Search in IOSFA Codes (Only if IOSFA)
            if (isIOSFA && Array.isArray(CODIGOS_IOSFA)) {
                CODIGOS_IOSFA.filter(c => {
                    const codeMatch = c.codigo && c.codigo.toString().toLowerCase().startsWith(term);
                    const cleanGeneral = c.codigoGeneral ? c.codigoGeneral.replace(/\\./g, '') : '';
                    const generalCodeMatch = cleanGeneral.startsWith(term);
                    const nameMatch = c.nombre && c.nombre.toLowerCase().includes(term);
                    return codeMatch || generalCodeMatch || nameMatch;
                }).forEach(c => {
                    if (!seenCodes.has(c.codigo)) {
                        results.push({
                            ...c,
                            isIOSFA: true,
                            source: 'iosfa',
                            displayLabel: \`\${c.codigo} (\${c.codigoGeneral}) - \${c.nombre}\`
                        });
                        seenCodes.add(c.codigo);
                    }
                });
            }

            // 4. Search in Dynamic Mappings (Admin created)
            const dynamicResults = [];
            Object.entries(dynamicConsents)
                .filter(([code, data]) => {
                    if (field === 'codigo') {
                        return code.startsWith(term);
                    } else {
                        return data.nombre && data.nombre.toLowerCase().includes(term);
                    }
                })
                .forEach(([code, data]) => {
                    dynamicResults.push({
                        codigo: code,
                        nombre: data.nombre,
                        source: 'dynamic',
                        isDynamic: true
                    });
                });

            // Final: Dynamic first, then general/iosfa/sm, deduplicated by code
            const combined = [...dynamicResults, ...results]
                .filter((item, idx, arr) => arr.findIndex(x => x.codigo === item.codigo) === idx)
                .slice(0, 15);
            setSuggestions(combined);
`;

code = code.substring(0, startIdx) + newBlock + code.substring(endIdx);
fs.writeFileSync(f, code, 'utf8');
console.log('Search logic fixed successfully');
