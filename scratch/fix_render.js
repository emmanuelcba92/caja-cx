const fs = require('fs');
const f = 'frontend/src/components/OrdenesView.jsx';
let code = fs.readFileSync(f, 'utf8');

// Fix the suggestion rendering
const oldRender = `{suggestions.map((s, i) => (
                                                        <div
                                                            key={i}
                                                            onClick={() => selectSuggestion(s, index)}
                                                            className={\`px-5 py-3.5 cursor-pointer border-b border-slate-100 dark:border-slate-700 last:border-0 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors \${highlightedIndex === i ? 'bg-teal-50 dark:bg-teal-900/30' : ''}\`}
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <span className={\`font-mono text-[10px] font-black px-2 py-0.5 rounded \${
                                                                    s.source === 'sm' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400' :
                                                                    s.source === 'dynamic' ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400' :
                                                                    s.source === 'iosfa' ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400' :
                                                                    'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-400'
                                                                }\`}>
                                                                    {s.codigo}
                                                                </span>
                                                                <div className="flex-1 flex flex-col">
                                                                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                                                                        {s.nombre.replace(' (Swiss Medical)', '')}
                                                                    </span>
                                                                    {s.source === 'sm' && (
                                                                        <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Swiss Medical</span>
                                                                    )}
                                                                    {s.source === 'dynamic' && (
                                                                        <span className="text-[10px] font-black text-purple-500 uppercase tracking-widest">Personalizado</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}`;

const newRender = `{suggestions.map((s, i) => {
                                                        const displayCode = s.parentModule ? s.parentModule.codigo : s.codigo;
                                                        const displayName = s.parentModule
                                                            ? \`\${s.parentModule.nombre} - \${s.codigo} \${s.nombre}\`
                                                            : s.nombre;
                                                        return (
                                                        <div
                                                            key={i}
                                                            onClick={() => selectSuggestion(s, index)}
                                                            className={\`px-5 py-3.5 cursor-pointer border-b border-slate-100 dark:border-slate-700 last:border-0 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors \${highlightedIndex === i ? 'bg-teal-50 dark:bg-teal-900/30' : ''}\`}
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <span className={\`font-mono text-[10px] font-black px-2 py-0.5 rounded \${
                                                                    s.source === 'sm' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400' :
                                                                    s.source === 'dynamic' ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400' :
                                                                    s.source === 'iosfa' ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400' :
                                                                    'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-400'
                                                                }\`}>
                                                                    {displayCode}
                                                                </span>
                                                                <span className="text-sm font-bold text-slate-700 dark:text-slate-200 flex-1">
                                                                    {displayName}
                                                                </span>
                                                                {s.source === 'sm' && (
                                                                    <span className="text-[9px] font-black text-blue-500 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded-full uppercase tracking-wider">SM</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        );
                                                    })}`;

const idx = code.indexOf('{suggestions.map((s, i) => (');
if (idx === -1) {
    console.log('Render block not found');
    process.exit(1);
}

// Find the end of this block - look for the closing '))}' 
const endSearch = '))}';
let endIdx = code.indexOf(endSearch, idx);
// We need to find the RIGHT '))}' - the one that closes suggestions.map
// Let's find it by looking after the last '</div>' pattern in the block
const blockEnd = code.indexOf('                                                    ))}', idx);
if (blockEnd === -1) {
    console.log('End of render block not found');
    process.exit(1);
}
const fullEnd = blockEnd + '                                                    ))}'.length;

const oldBlock = code.substring(idx, fullEnd);
code = code.replace(oldBlock, newRender);

fs.writeFileSync(f, code, 'utf8');
console.log('Render updated successfully');
