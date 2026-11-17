import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const caja=fs.readFileSync(new URL('../src/CajaView.jsx',import.meta.url),'utf8');
const historial=fs.readFileSync(new URL('../src/HistorialCajaView.jsx',import.meta.url),'utf8');
function fixture({view='caja',id='1790000000000',reject=false,closing=false,fresh=false}={}){
 const original={id,paciente:'PACIENTE FICTICIO',pesos:1000,dolares:0,cobrado:true,creadoPor:'AUTOR ORIGINAL',createdAt:'2020-01-01',fecha:'2026-10-31'};
 const db=new Map(fresh?[]:[[id,{...original}]]),state={history:fresh?[]:[{...original}],entries:[{...original,pesos:2000}],editId:id,form:{...original,pesos:2000},alerts:[],adds:0,updates:0,cleared:false};
 const write=async(col,key,data)=>{assert.equal(col,'caja');if(reject)throw Object.assign(Error('Permisos insuficientes'),{code:'permission-denied'});if(!db.has(String(key)))throw Error('Documento inexistente');db.set(String(key),{...db.get(String(key)),...data});state.updates++;return true;};
 const matchPctSummary=caja.match(/export const getLibrePercentageSummary = \([\s\S]*?\n\};\n/);
 const scope={isReadOnly:false,entries:state.entries,history:state.history,editId:id,editForm:state.form,date:original.fecha,currentUser:{nombre:'EDITOR'},calcLiq:x=>({...x}),normalizeDate:x=>x,emptyEntry:()=>({}),getLibrePercentageSummary:matchPctSummary?new Function(`return ${matchPctSummary[0].replace('export const getLibrePercentageSummary = ','')}`)():(()=>({required:false,valid:true,total:100})),apiService:{setDocument:write,updateDocument:write,addDocument:async(col,data)=>{state.adds++;db.set('nuevo',{...data,id:'nuevo'});return 'nuevo';}},setHistory:fn=>state.history=fn(state.history),setEntries:v=>state.entries=v,setEditId:v=>state.editId=v,setEditForm:v=>state.form=v,localStorage:{removeItem:()=>state.cleared=true},alert:v=>state.alerts.push(v),window:{confirm:()=>true},console:{error(){}},saveDailyComment:async()=>{}};
 const source=view==='historial'?historial.slice(historial.indexOf('  const handleEditSave ='),historial.indexOf('  const handleDelete =')):caja.slice(caja.indexOf('  const handleSave ='),caja.indexOf('  const loadToEdit ='));
 const context=vm.createContext(scope);vm.runInContext(source+`\nglobalThis.run=${view==='historial'?'handleEditSave':closing?'handleCerrarCaja':'handleSave'};`,context);
 return{state,db,original,run:()=>context.run()};
}
for(const closing of [false,true]){
 test(`Caja ${closing?'cerrar':'guardar'}: creación conserva la ruta de alta existente`,async()=>{
  const f=fixture({fresh:true,closing});await f.run();assert.equal(f.state.adds,1);assert.equal(f.state.updates,0);assert.equal(f.db.size,1);assert.equal(f.db.get('nuevo').pesos,2000);assert.equal(f.db.get('nuevo').creadoPor,'EDITOR');assert.equal(f.state.history[0].id,'nuevo');assert.equal(f.state.cleared,true);
 });
 test(`Caja ${closing?'cerrar':'guardar'}: editar ID numérico conserva documento, cobro y autoría`,async()=>{
  const f=fixture({closing});await f.run();assert.equal(f.state.adds,0);assert.equal(f.db.size,1);const saved=f.db.get(f.original.id);assert.equal(saved.pesos,2000);assert.equal(saved.cobrado,true);assert.equal(saved.creadoPor,f.original.creadoPor);assert.equal(saved.createdAt,f.original.createdAt);
 });
 test(`Caja ${closing?'cerrar':'guardar'}: rechazo no inventa registros ni anuncia éxito`,async()=>{
  const f=fixture({id:'existing-firestore-id',reject:true,closing});await f.run();assert.equal(f.db.get(f.original.id).pesos,1000);assert.equal(f.state.history[0].pesos,1000);assert.equal(f.state.entries[0].pesos,2000);assert.equal(f.state.cleared,false);assert.equal(f.state.alerts.length,1);assert.match(f.state.alerts[0],/permission-denied/);
 });
}
test('Historial: rechazo conserva formulario e historial y muestra el error',async()=>{
 const f=fixture({view:'historial',reject:true});await f.run();assert.equal(f.state.editId,f.original.id);assert.equal(f.state.form.pesos,2000);assert.equal(f.state.history[0].pesos,1000);assert.equal(f.state.alerts.length,1);assert.match(f.state.alerts[0],/permission-denied/);
});
test('Historial: actualización confirmada conserva mismo ID, cobro, autoría y fecha',async()=>{
 const f=fixture({view:'historial'});await f.run();assert.equal(f.db.size,1);const saved=f.db.get(f.original.id);assert.equal(saved.pesos,2000);assert.equal(saved.cobrado,true);assert.equal(saved.creadoPor,f.original.creadoPor);assert.equal(saved.createdAt,f.original.createdAt);assert.equal(f.state.editId,null);
});

test('Caja calcLiq: modalidades LIBRE, 10% y 20% según especificación', () => {
 const match = caja.match(/export const calcLiq = \([\s\S]*?\n\};\n/);
 assert.ok(match, 'calcLiq debe existir en CajaView.jsx');
 const context = vm.createContext({});
 vm.runInContext(`const calcLiq = ${match[0].replace('export const calcLiq = ', '')}; globalThis.calcLiq = calcLiq;`, context);
 const calcLiq = context.calcLiq;

 // === 1. MODALIDAD LIBRE (PREDETERMINADA) ===
 // Retención manual en ARS y USD sin porcentajes ni mínimos automáticos
 const libre1 = calcLiq({
   pesos: 500000,
   dolares: 1000,
   modalidad_retencion: 'libre',
   coat_pesos: 50000,
   coat_dolares: 150,
   porcentaje_prof_1: 100,
   liq_prof_1_currency: 'ARS'
 });
 assert.equal(libre1.modalidad_retencion, 'libre');
 assert.equal(libre1.coat_pesos, 50000); // respeta el valor manual
 assert.equal(libre1.coat_dolares, 150); // respeta el valor manual USD
 assert.equal(libre1.liq_prof_1, 500000); // en LIBRE calcula sobre el 100% del cobro sin descontar COAT

 // LIBRE con distribución multi-profesional (60% / 40%) sobre el total cobrado
 const libreMulti = calcLiq({
   pesos: 600000,
   modalidad_retencion: 'libre',
   coat_pesos: 60000,
   porcentaje_prof_1: 60,
   porcentaje_prof_2: 40,
   liq_prof_1_currency: 'ARS',
   liq_prof_2_currency: 'ARS'
 });
 assert.equal(libreMulti.coat_pesos, 60000);
 assert.equal(libreMulti.liq_prof_1, 360000); // 600k * 0.60
 assert.equal(libreMulti.liq_prof_2, 240000); // 600k * 0.40

 // LIBRE con importes manuales sin doctores con porcentaje aún configurado
 const libreRaw = calcLiq({
   pesos: 300000,
   dolares: 200,
   modalidad_retencion: 'libre',
   coat_pesos: 30000,
   coat_dolares: 40
 });
 assert.equal(libreRaw.coat_pesos, 30000);
 assert.equal(libreRaw.coat_dolares, 40);

 // === 2. MODALIDAD 10%: exactamente 10% sin mínimo en ARS y USD ===
 const m10_200 = calcLiq({ pesos: 200000, dolares: 1000, modalidad_retencion: '10', porcentaje_prof_1: 100, liq_prof_1_currency: 'ARS' });
 assert.equal(m10_200.modalidad_retencion, '10');
 assert.equal(m10_200.coat_pesos, 20000);
 assert.equal(m10_200.coat_dolares, 100); // 10% de 1000 USD
 assert.equal(m10_200.liq_prof_1, 180000);

 const m10_420 = calcLiq({ pesos: 420000, modalidad_retencion: '10', porcentaje_prof_1: 100, liq_prof_1_currency: 'ARS' });
 assert.equal(m10_420.coat_pesos, 42000);
 assert.equal(m10_420.liq_prof_1, 378000);

 const m10_600 = calcLiq({ pesos: 600000, modalidad_retencion: '10', porcentaje_prof_1: 100, liq_prof_1_currency: 'ARS' });
 assert.equal(m10_600.coat_pesos, 60000);
 assert.equal(m10_600.liq_prof_1, 540000);

 const m10_1000 = calcLiq({ pesos: 1000000, modalidad_retencion: '10', porcentaje_prof_1: 100, liq_prof_1_currency: 'ARS' });
 assert.equal(m10_1000.coat_pesos, 100000);
 assert.equal(m10_1000.liq_prof_1, 900000);

 // === 3. MODALIDAD 20%: 20% en ARS con mínimo de $80.000, y 20% en USD sin mínimo ===
 const m20_200 = calcLiq({ pesos: 200000, dolares: 500, modalidad_retencion: '20', porcentaje_prof_1: 100, liq_prof_1_currency: 'ARS' });
 assert.equal(m20_200.modalidad_retencion, '20');
 assert.equal(m20_200.coat_pesos, 80000); // 20% de 200k es 40k < 80k -> aplica mín 80k
 assert.equal(m20_200.coat_dolares, 100); // 20% de 500 USD sin mínimo
 assert.equal(m20_200.liq_prof_1, 120000); // 200k - 80k = 120k

 const m20_420 = calcLiq({ pesos: 420000, modalidad_retencion: '20', porcentaje_prof_1: 100, liq_prof_1_currency: 'ARS' });
 assert.equal(m20_420.coat_pesos, 84000); // 20% de 420k es 84k > 80k -> aplica 84k
 assert.equal(m20_420.liq_prof_1, 336000);

 const m20_600 = calcLiq({ pesos: 600000, modalidad_retencion: '20', porcentaje_prof_1: 100, liq_prof_1_currency: 'ARS' });
 assert.equal(m20_600.coat_pesos, 120000); // 20% de 600k = 120k
 assert.equal(m20_600.liq_prof_1, 480000);

 const m20_1000 = calcLiq({ pesos: 1000000, modalidad_retencion: '20', porcentaje_prof_1: 100, liq_prof_1_currency: 'ARS' });
 assert.equal(m20_1000.coat_pesos, 200000); // 20% de 1M = 200k
 assert.equal(m20_1000.liq_prof_1, 800000);

 // Casos borde (< 80k) en 20%: no introduce saldos negativos
 const m20_50 = calcLiq({ pesos: 50000, modalidad_retencion: '20', porcentaje_prof_1: 100, liq_prof_1_currency: 'ARS' });
 assert.equal(m20_50.coat_pesos, 50000);
 assert.equal(m20_50.liq_prof_1, 0);

 const m10_50 = calcLiq({ pesos: 50000, modalidad_retencion: '10', porcentaje_prof_1: 100, liq_prof_1_currency: 'ARS' });
 assert.equal(m10_50.coat_pesos, 5000);
 assert.equal(m10_50.liq_prof_1, 45000);

 // === 4. COMPATIBILIDAD CON REGISTROS HISTÓRICOS ===
 // Registros anteriores sin campo modalidad_retencion se asumen LIBRE y preservan su coat_pesos manual
 const histManual = calcLiq({
   pesos: 400000,
   dolares: 200,
   coat_pesos: 20000,
   coat_dolares: 200,
   porcentaje_prof_1: 75,
   porcentaje_prof_2: 25,
   liq_prof_1_currency: 'ARS',
   liq_prof_2_currency: 'ARS'
 });
 assert.equal(histManual.modalidad_retencion, 'libre');
 assert.equal(histManual.coat_pesos, 20000); // NO recalculó a 20% ($80.000)
 assert.equal(histManual.coat_dolares, 200);
});

test('Caja: guardar y reabrir operaciones en las tres modalidades conserva importes y modalidad', async () => {
 const matchCalc = caja.match(/export const calcLiq = \([\s\S]*?\n\};\n/);
 const matchEmpty = caja.match(/const emptyEntry = \(\) => \(\{[\s\S]*?\n\}\);\n/);
 assert.ok(matchCalc && matchEmpty, 'calcLiq y emptyEntry deben existir');

 const context = vm.createContext({});
 vm.runInContext(`
   const emptyEntry = ${matchEmpty[0].replace('const emptyEntry = ', '')};
   const calcLiq = ${matchCalc[0].replace('export const calcLiq = ', '')};
   globalThis.emptyEntry = emptyEntry;
   globalThis.calcLiq = calcLiq;
 `, context);
 const { emptyEntry, calcLiq } = context;

 // 1. Operación nueva por defecto es LIBRE
 const newOp = emptyEntry();
 assert.equal(newOp.modalidad_retencion, 'libre');

 // 2. Guardar y reabrir operación LIBRE con retención manual
 const opLibre = calcLiq({
   ...emptyEntry(),
   id: 'op-libre-1',
   paciente: 'PACIENTE LIBRE',
   pesos: 350000,
   dolares: 100,
   modalidad_retencion: 'libre',
   coat_pesos: 35000,
   coat_dolares: 20,
   porcentaje_prof_1: 100,
   liq_prof_1_currency: 'ARS'
 });
 assert.equal(opLibre.coat_pesos, 35000);
 assert.equal(opLibre.coat_dolares, 20);
 assert.equal(opLibre.modalidad_retencion, 'libre');

 // Simulación de reabrir para edición (loadToEdit)
 const reopenedLibre = calcLiq({ ...opLibre });
 assert.equal(reopenedLibre.coat_pesos, 35000);
 assert.equal(reopenedLibre.coat_dolares, 20);
 assert.equal(reopenedLibre.modalidad_retencion, 'libre');
 assert.equal(reopenedLibre.liq_prof_1, 350000); // En LIBRE calcula sobre el 100% del cobro sin descontar COAT

 // 3. Guardar y reabrir operación 10%
 const op10 = calcLiq({
   ...emptyEntry(),
   id: 'op-10-1',
   paciente: 'PACIENTE 10',
   pesos: 300000,
   dolares: 400,
   modalidad_retencion: '10',
   porcentaje_prof_1: 100,
   liq_prof_1_currency: 'ARS'
 });
 assert.equal(op10.coat_pesos, 30000);
 assert.equal(op10.coat_dolares, 40);
 assert.equal(op10.modalidad_retencion, '10');

 const reopened10 = calcLiq({ ...op10 });
 assert.equal(reopened10.coat_pesos, 30000);
 assert.equal(reopened10.coat_dolares, 40);
 assert.equal(reopened10.modalidad_retencion, '10');

 // 4. Guardar y reabrir operación 20%
 const op20 = calcLiq({
   ...emptyEntry(),
   id: 'op-20-1',
   paciente: 'PACIENTE 20',
   pesos: 250000,
   dolares: 300,
   modalidad_retencion: '20',
   porcentaje_prof_1: 100,
   liq_prof_1_currency: 'ARS'
 });
 assert.equal(op20.coat_pesos, 80000); // 20% de 250k es 50k < 80k mín
 assert.equal(op20.coat_dolares, 60); // 20% de 300 USD sin mín
 assert.equal(op20.modalidad_retencion, '20');

 const reopened20 = calcLiq({ ...op20 });
 assert.equal(reopened20.coat_pesos, 80000);
 assert.equal(reopened20.coat_dolares, 60);
 assert.equal(reopened20.modalidad_retencion, '20');
});

test('Caja LIBRE: distribución sobre 100% del cobro (porcentaje y fijo), validación 100%, guardado y comparación con 10%/20%', async () => {
 const matchCalc = caja.match(/export const calcLiq = \([\s\S]*?\n\};\n/);
 const matchEmpty = caja.match(/const emptyEntry = \(\) => \(\{[\s\S]*?\n\}\);\n/);
 const matchPctSummary = caja.match(/export const getLibrePercentageSummary = \([\s\S]*?\n\};\n/);
 assert.ok(matchCalc && matchEmpty && matchPctSummary, 'calcLiq, emptyEntry y getLibrePercentageSummary deben existir');

 const context = vm.createContext({});
 vm.runInContext(`
   const emptyEntry = ${matchEmpty[0].replace('const emptyEntry = ', '')};
   const calcLiq = ${matchCalc[0].replace('export const calcLiq = ', '')};
   const getLibrePercentageSummary = ${matchPctSummary[0].replace('export const getLibrePercentageSummary = ', '')};
   globalThis.emptyEntry = emptyEntry;
   globalThis.calcLiq = calcLiq;
   globalThis.getLibrePercentageSummary = getLibrePercentageSummary;
 `, context);
 const { emptyEntry, calcLiq, getLibrePercentageSummary } = context;

 // 1. Nueva operación en LIBRE inicializa retención en 0 y NO retiene 100% del cobro
 const newOp = calcLiq({ ...emptyEntry(), pesos: 250000, dolares: 100 });
 assert.equal(newOp.modalidad_retencion, 'libre');
 assert.equal(newOp.tipo_retencion_libre, 'monto');
 assert.equal(newOp.coat_pesos, 0);
 assert.equal(newOp.coat_dolares, 0);

 // 2. LIBRE por porcentaje: COAT y profesionales calculan directamente sobre el 100% del cobro (ARS y USD)
 // Ejemplo: cobro $500.000, COAT 50%, Médico 1 25%, Médico 2 25% -> $250.000 / $125.000 / $125.000
 const opPct = calcLiq({
   ...emptyEntry(),
   id: 'op-libre-pct-1',
   paciente: 'PACIENTE LIBRE PCT',
   pesos: 500000,
   dolares: 1000,
   modalidad_retencion: 'libre',
   tipo_retencion_libre: 'porcentaje',
   porcentaje_retencion: 50,
   porcentaje_prof_1: 25,
   porcentaje_prof_2: 25,
   liq_prof_1_currency: 'ARS',
   liq_prof_2_currency: 'ARS',
   showSecondary_1: true,
   liq_prof_1_currency_secondary: 'USD',
   showSecondary_2: true,
   liq_prof_2_currency_secondary: 'USD'
 });
 assert.equal(opPct.tipo_retencion_libre, 'porcentaje');
 assert.equal(opPct.porcentaje_retencion, 50);
 assert.equal(opPct.minimo_retencion, 0);
 assert.equal(opPct.coat_pesos, 250000);
 assert.equal(opPct.liq_prof_1, 125000);
 assert.equal(opPct.liq_prof_2, 125000);
 assert.equal(opPct.coat_pesos + opPct.liq_prof_1 + opPct.liq_prof_2, 500000);
 assert.equal(opPct.coat_dolares, 500);
 assert.equal(opPct.liq_prof_1_secondary, 250);
 assert.equal(opPct.liq_prof_2_secondary, 250);
 assert.equal(opPct.coat_dolares + opPct.liq_prof_1_secondary + opPct.liq_prof_2_secondary, 1000);
 assert.equal(getLibrePercentageSummary(opPct).required, true);
 assert.equal(getLibrePercentageSummary(opPct).valid, true);
 assert.equal(getLibrePercentageSummary(opPct).total, 100);

 // Porcentaje con decimales sin mínimo de $80.000
 const opPctDec = calcLiq({
   ...emptyEntry(),
   pesos: 100000,
   modalidad_retencion: 'libre',
   tipo_retencion_libre: 'porcentaje',
   porcentaje_retencion: 12.5,
   porcentaje_prof_1: 47.5,
   porcentaje_prof_2: 40,
   liq_prof_1_currency: 'ARS',
   liq_prof_2_currency: 'ARS'
 });
 assert.equal(opPctDec.coat_pesos, 12500);
 assert.equal(opPctDec.liq_prof_1, 47500);
 assert.equal(opPctDec.liq_prof_2, 40000);
 assert.equal(opPctDec.coat_pesos + opPctDec.liq_prof_1 + opPctDec.liq_prof_2, 100000);
 assert.equal(getLibrePercentageSummary(opPctDec).valid, true);

 // Validación 100%: bloquea si COAT + profesionales != 100%
 const opPctInvalidLow = { ...opPct, porcentaje_retencion: 40, porcentaje_prof_1: 25, porcentaje_prof_2: 25 };
 const sumLow = getLibrePercentageSummary(opPctInvalidLow);
 assert.equal(sumLow.required, true);
 assert.equal(sumLow.valid, false);
 assert.equal(sumLow.total, 90);

 const opPctInvalidHigh = { ...opPct, porcentaje_retencion: 60, porcentaje_prof_1: 30, porcentaje_prof_2: 25 };
 const sumHigh = getLibrePercentageSummary(opPctInvalidHigh);
 assert.equal(sumHigh.required, true);
 assert.equal(sumHigh.valid, false);
 assert.equal(sumHigh.total, 115);

 // Límites de porcentaje (0% y 100%)
 const opPctOver = calcLiq({ ...opPct, porcentaje_retencion: 150, porcentaje_prof_1: 0, porcentaje_prof_2: 0 });
 assert.equal(opPctOver.porcentaje_retencion, 100);
 assert.equal(opPctOver.coat_pesos, 500000);

 const opPctNeg = calcLiq({ ...opPct, porcentaje_retencion: -10, porcentaje_prof_1: 60, porcentaje_prof_2: 40 });
 assert.equal(opPctNeg.porcentaje_retencion, 0);
 assert.equal(opPctNeg.coat_pesos, 0);
 assert.equal(opPctNeg.liq_prof_1, 300000);
 assert.equal(opPctNeg.liq_prof_2, 200000);

 // Guardar y reabrir operación LIBRE con porcentaje manual
 const reopenedPct = calcLiq({ ...opPct });
 assert.equal(reopenedPct.modalidad_retencion, 'libre');
 assert.equal(reopenedPct.tipo_retencion_libre, 'porcentaje');
 assert.equal(reopenedPct.porcentaje_retencion, 50);
 assert.equal(reopenedPct.coat_pesos, 250000);
 assert.equal(reopenedPct.liq_prof_1, 125000);
 assert.equal(reopenedPct.liq_prof_2, 125000);

 // 3. LIBRE por importe fijo: conserva retención manual y distribuye profesionales sobre el total cobrado sin descontar COAT
 const opMontoOk = calcLiq({
   ...emptyEntry(),
   id: 'op-libre-monto-ok',
   paciente: 'PACIENTE LIBRE MONTO',
   pesos: 500000,
   dolares: 200,
   modalidad_retencion: 'libre',
   tipo_retencion_libre: 'monto',
   coat_pesos: 100000,
   coat_dolares: 30,
   porcentaje_prof_1: 50,
   porcentaje_prof_2: 50,
   liq_prof_1_currency: 'ARS',
   liq_prof_2_currency: 'ARS'
 });
 assert.equal(opMontoOk.coat_pesos, 100000);
 assert.equal(opMontoOk.coat_dolares, 30);
 assert.equal(opMontoOk.liq_prof_1, 250000);
 assert.equal(opMontoOk.liq_prof_2, 250000);
 assert.equal(getLibrePercentageSummary(opMontoOk).required, false);

 // Tope al cobro disponible en importe fijo
 const opMontoCap = calcLiq({ ...opMontoOk, coat_pesos: 700000, coat_dolares: 350 });
 assert.equal(opMontoCap.coat_pesos, 500000);
 assert.equal(opMontoCap.coat_dolares, 200);

 // Guardar y reabrir operación LIBRE con importe fijo
 const reopenedMonto = calcLiq({ ...opMontoOk });
 assert.equal(reopenedMonto.tipo_retencion_libre, 'monto');
 assert.equal(reopenedMonto.porcentaje_retencion, null);
 assert.equal(reopenedMonto.coat_pesos, 100000);
 assert.equal(reopenedMonto.liq_prof_1, 250000);

 // 4. Modalidades automáticas 10% y 20% siguen distribuyendo el remanente después de COAT
 const op10Check = calcLiq({
   ...emptyEntry(),
   pesos: 500000,
   modalidad_retencion: '10',
   porcentaje_prof_1: 60,
   porcentaje_prof_2: 40,
   liq_prof_1_currency: 'ARS',
   liq_prof_2_currency: 'ARS'
 });
 assert.equal(op10Check.coat_pesos, 50000);
 assert.equal(op10Check.liq_prof_1, 270000);
 assert.equal(op10Check.liq_prof_2, 180000);
 assert.equal(op10Check.coat_pesos + op10Check.liq_prof_1 + op10Check.liq_prof_2, 500000);

 const op20Check = calcLiq({
   ...emptyEntry(),
   pesos: 250000,
   modalidad_retencion: '20',
   porcentaje_prof_1: 50,
   porcentaje_prof_2: 50,
   liq_prof_1_currency: 'ARS',
   liq_prof_2_currency: 'ARS'
 });
 assert.equal(op20Check.coat_pesos, 80000);
 assert.equal(op20Check.liq_prof_1, 85000);
 assert.equal(op20Check.liq_prof_2, 85000);
 assert.equal(op20Check.coat_pesos + op20Check.liq_prof_1 + op20Check.liq_prof_2, 250000);

 // 5. Registro histórico sin tipo_retencion_libre conserva sus valores manuales
 const historical = calcLiq({
   id: 'hist-old-1',
   pesos: 300000,
   dolares: 50,
   coat_pesos: 45000,
   coat_dolares: 10,
   porcentaje_prof_1: 0,
   liq_prof_1: 255000,
   liq_prof_1_currency: 'ARS'
 });
 assert.equal(historical.modalidad_retencion, 'libre');
 assert.equal(historical.tipo_retencion_libre, 'monto');
 assert.equal(historical.coat_pesos, 45000);
 assert.equal(historical.coat_dolares, 10);
 assert.equal(historical.liq_prof_1, 255000);
});

test('Recibo Libre y Liquidaciones: unifican el concepto mediante buildReceiptConcept', () => {
 const profUtilsSrc = fs.readFileSync(new URL('../src/utils/profUtils.js', import.meta.url), 'utf8');
 const matchConcept = profUtilsSrc.match(/export const buildReceiptConcept = \([\s\S]*?\n\};/);
 assert.ok(matchConcept, 'buildReceiptConcept debe existir en profUtils.js');

 const context = vm.createContext({});
 vm.runInContext(`
   const buildReceiptConcept = ${matchConcept[0].replace('export const buildReceiptConcept = ', '')};
   globalThis.buildReceiptConcept = buildReceiptConcept;
 `, context);
 const { buildReceiptConcept } = context;

 assert.equal(buildReceiptConcept(''), '');
 assert.equal(buildReceiptConcept('   '), '');
 assert.equal(
   buildReceiptConcept(' Dr. García '),
   'Honorarios por técnica no convenida por cuenta y orden de Dr. García'
 );

 const liqSrc = fs.readFileSync(new URL('../src/LiquidacionView.jsx', import.meta.url), 'utf8');
 const libreSrc = fs.readFileSync(new URL('../src/components/ReciboLibreView.jsx', import.meta.url), 'utf8');
 assert.ok(liqSrc.includes('buildReceiptConcept('), 'LiquidacionView debe usar buildReceiptConcept');
 assert.ok(libreSrc.includes('buildReceiptConcept('), 'ReciboLibreView debe usar buildReceiptConcept');
 assert.ok(!libreSrc.includes('técnica en común'), 'ReciboLibreView no debe conservar el texto anterior');
});
