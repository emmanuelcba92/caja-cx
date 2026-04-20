import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, SafeAreaView, ActivityIndicator, TouchableOpacity, TextInput, ScrollView, Alert, Platform } from 'react-native';
import { Landmark, Search, User, ChevronRight, DollarSign, Wallet, ChevronLeft, Calendar, Printer, FileText, Share2, Download } from 'lucide-react-native';
import { apiService } from '../services/apiService';
import { useTheme } from '../context/ThemeContext';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

const LiquidacionScreen = () => {
    const { colors } = useTheme();
    const [professionals, setProfessionals] = useState([]);
    const [cajaMovements, setCajaMovements] = useState([]);
    const [deductions, setDeductions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    
    // Selection state
    const [selectedProf, setSelectedProf] = useState(null);
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);

    const fetchData = async () => {
        try {
            setLoading(true);
            const profsData = await apiService.getCollection('profesionales', {}, 'nombre');
            const cajaData = await apiService.getCollection('caja', {}, 'fecha');
            const deductionsData = await apiService.getCollection('deducciones', {}, 'date');
            
            setProfessionals(profsData);
            setCajaMovements(cajaData);
            setDeductions(deductionsData);
        } catch (error) {
            console.error("Error fetching liquidations:", error);
            Alert.alert("Error", "No se pudieron cargar los datos de liquidación.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const formatJSDate = (date) => {
        if (!date) return '';
        const d = new Date(date);
        return `${d.getDate().toString().padStart(2, '0')}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getFullYear()}`;
    };

    const formatDateForQuery = (date) => {
        return date.toISOString().split('T')[0];
    };

    // Calculate balance ONLY for the selected date ("solo lo del dia")
    const profsWithBalance = useMemo(() => {
        const targetDate = formatDateForQuery(selectedDate);
        
        return professionals.map(prof => {
            let pesos = 0;
            let dolares = 0;
            
            // 1. Calculate from Caja
            cajaMovements.filter(mov => mov.fecha === targetDate).forEach(mov => {
                // Support both legacy and new schema
                const processLiquidation = (profName, liqAmount, liqCurr) => {
                    if (profName === prof.nombre && liqAmount) {
                        if (liqCurr === 'USD') dolares += parseFloat(liqAmount);
                        else pesos += parseFloat(liqAmount);
                    }
                };

                // PC logic mappings
                if (mov.prof_1) {
                    processLiquidation(mov.prof_1, mov.liq_prof_1, mov.liq_prof_1_currency);
                    processLiquidation(mov.prof_1, mov.liq_prof_1_secondary, mov.liq_prof_1_currency_secondary);
                }
                if (mov.prof_2) {
                    processLiquidation(mov.prof_2, mov.liq_prof_2, mov.liq_prof_2_currency);
                    processLiquidation(mov.prof_2, mov.liq_prof_2_secondary, mov.liq_prof_2_currency_secondary);
                }
                if (mov.prof_3) {
                    processLiquidation(mov.prof_3, mov.liq_prof_3, mov.liq_prof_3_currency);
                    processLiquidation(mov.prof_3, mov.liq_prof_3_secondary, mov.liq_prof_3_currency_secondary);
                }
                if (mov.anestesista) {
                    processLiquidation(mov.anestesista, mov.liq_anestesista, mov.liq_anestesista_currency);
                }

                // Generic/Legacy fields
                if (!mov.prof_1 && mov.profesional === prof.nombre) {
                    pesos += parseFloat(mov.honorario) || 0;
                }
                if (mov.medicos && Array.isArray(mov.medicos)) {
                    mov.medicos.forEach(m => {
                        if (m.nombre === prof.nombre) {
                            pesos += parseFloat(m.honorarioPesos) || parseFloat(m.honorario) || 0;
                            dolares += parseFloat(m.honorarioDolares) || 0;
                        }
                    });
                }
            });

            // 2. Subtract Deductions
            deductions.filter(d => d.profesional === prof.nombre && d.date === targetDate).forEach(d => {
                const amount = Math.abs(parseFloat(d.amount || 0));
                if (d.currency === 'USD') dolares -= amount;
                else pesos -= amount;
            });

            return { ...prof, pesos, dolares };
        }).filter(p => p.pesos !== 0 || p.dolares !== 0 || search === '')
          .sort((a, b) => b.pesos - a.pesos);
    }, [professionals, cajaMovements, deductions, selectedDate, search]);

    const filteredProfessionals = useMemo(() => {
        return profsWithBalance.filter(p => 
            p.nombre?.toLowerCase().includes(search.toLowerCase())
        );
    }, [search, profsWithBalance]);

    // Data for the detailed view of a professional
    const settlementData = useMemo(() => {
        if (!selectedProf) return { items: [], deductions: [], totalPesos: 0, totalUSD: 0 };
        
        const targetDate = formatDateForQuery(selectedDate);
        let pesos = 0;
        let dolares = 0;
        const items = [];
        const dailyDeductions = [];

        // 1. Process Caja entries
        cajaMovements.filter(m => m.fecha === targetDate).forEach(mov => {
            let hPesos = 0;
            let hUSD = 0;
            let found = false;

            const checkRole = (profName, liqAmount, liqCurr) => {
                if (profName === selectedProf.nombre && liqAmount) {
                    if (liqCurr === 'USD') hUSD += parseFloat(liqAmount);
                    else hPesos += parseFloat(liqAmount);
                    found = true;
                }
            };

            checkRole(mov.prof_1, mov.liq_prof_1, mov.liq_prof_1_currency);
            checkRole(mov.prof_1, mov.liq_prof_1_secondary, mov.liq_prof_1_currency_secondary);
            checkRole(mov.prof_2, mov.liq_prof_2, mov.liq_prof_2_currency);
            checkRole(mov.prof_2, mov.liq_prof_2_secondary, mov.liq_prof_2_currency_secondary);
            checkRole(mov.prof_3, mov.liq_prof_3, mov.liq_prof_3_currency);
            checkRole(mov.prof_3, mov.liq_prof_3_secondary, mov.liq_prof_3_currency_secondary);
            checkRole(mov.anestesista, mov.liq_anestesista, mov.liq_anestesista_currency);

            if (!mov.prof_1 && mov.profesional === selectedProf.nombre) {
                hPesos += parseFloat(mov.honorario) || 0;
                found = true;
            }

            if (found && (hPesos !== 0 || hUSD !== 0)) {
                pesos += hPesos;
                dolares += hUSD;
                items.push({
                    id: mov.id,
                    paciente: mov.paciente || 'S/D',
                    obraSocial: mov.obraSocial || 'Particular',
                    pesos: hPesos,
                    usd: hUSD,
                    tipo: mov.tipo || 'Cirugía'
                });
            }
        });

        // 2. Process Deductions
        deductions.filter(d => d.profesional === selectedProf.nombre && d.date === targetDate).forEach(d => {
            const amount = Math.abs(parseFloat(d.amount || 0));
            dailyDeductions.push(d);
            if (d.currency === 'USD') dolares -= amount;
            else pesos -= amount;
        });

        return { items, deductions: dailyDeductions, totalPesos: pesos, totalUSD: dolares };
    }, [selectedProf, selectedDate, cajaMovements, deductions]);

    const generatePDF = async (type) => {
        const isRecibo = type === 'recibo';
        const isDetalle = type === 'detalle';
        const dateStr = formatJSDate(selectedDate);
        
        // PC Parity: Identify model/category
        const categoria = selectedProf.categoria || 'ORL';
        const model = (categoria === 'ORL') ? 1 : 2;

        const html = `
            <html>
                <head>
                    <style>
                        body { font-family: 'Arial', sans-serif; padding: 20px; color: #333; line-height: 1.4; }
                        .header { border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
                        .title { font-size: 20px; font-weight: bold; color: #000; }
                        .info { margin-bottom: 25px; }
                        .info div { margin-bottom: 4px; }
                        table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 12px; }
                        th { border-bottom: 1px solid #333; padding: 8px; text-align: left; background: #f2f2f2; font-weight: bold; }
                        td { border-bottom: 1px solid #eee; padding: 8px; }
                        .text-right { text-align: right; }
                        .totals { margin-top: 20px; padding-top: 10px; border-top: 2px solid #333; text-align: right; font-weight: bold; font-size: 14px; }
                        .deductions { margin-top: 10px; color: #d32f2f; font-size: 12px; }
                        .footer { margin-top: 60px; display: flex; justify-content: space-around; }
                        .signature { border-top: 1px solid #333; width: 180px; text-align: center; padding-top: 8px; font-size: 11px; }
                        .clinic-name { color: #26a69a; font-weight: bold; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <div>
                            <div class="title">${isRecibo ? 'RECIBO DE HONORARIOS' : (isDetalle ? 'DETALLE DE LIQUIDACIÓN' : 'LIQUIDACIÓN PROFESIONAL')}</div>
                            <div class="clinic-name">CIRUGÍAS COAT</div>
                        </div>
                        <div style="text-align: right">
                            <div style="font-weight: bold">FECHA: ${dateStr}</div>
                        </div>
                    </div>
                    
                    <div class="info">
                        <div><strong>PROFESIONAL:</strong> ${selectedProf.nombre}</div>
                        ${selectedProf.especialidad ? `<div><strong>ESPECIALIDAD:</strong> ${selectedProf.especialidad}</div>` : ''}
                        ${selectedProf.mp ? `<div><strong>MP:</strong> ${selectedProf.mp} ${selectedProf.me ? ` | <strong>ME:</strong> ${selectedProf.me}` : ''}</div>` : ''}
                    </div>

                    <table>
                        <thead>
                            <tr>
                                <th>PACIENTE</th>
                                <th>OBRA SOCIAL</th>
                                <th class="text-right">PESOS ($)</th>
                                ${settlementData.totalUSD > 0 || settlementData.items.some(i => i.usd > 0) ? '<th class="text-right">USD</th>' : ''}
                            </tr>
                        </thead>
                        <tbody>
                            ${settlementData.items.map(item => `
                                <tr>
                                    <td>${item.paciente}</td>
                                    <td>${item.obraSocial}</td>
                                    <td class="text-right">$ ${item.pesos.toLocaleString('es-AR', {minimumFractionDigits: 2})}</td>
                                    ${settlementData.totalUSD > 0 || item.usd > 0 ? `<td class="text-right">U$D ${item.usd.toLocaleString('es-AR', {minimumFractionDigits: 2})}</td>` : ''}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>

                    ${settlementData.deductions.length > 0 ? `
                        <div class="deductions">
                            <strong>DEDUCCIONES:</strong>
                            ${settlementData.deductions.map(d => `
                                <div style="display: flex; justify-content: space-between; padding: 2px 0;">
                                    <span>- ${d.desc}</span>
                                    <span>${d.currency === 'USD' ? 'U$D' : '$'} ${Math.abs(d.amount).toLocaleString('es-AR', {minimumFractionDigits: 2})}</span>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}

                    <div class="totals">
                        TOTAL FINAL: $ ${settlementData.totalPesos.toLocaleString('es-AR', {minimumFractionDigits: 2})}
                        ${settlementData.totalUSD !== 0 ? `<br>TOTAL FINAL USD: U$D ${settlementData.totalUSD.toLocaleString('es-AR', {minimumFractionDigits: 2})}` : ''}
                    </div>

                    <div class="footer">
                        <div class="signature">
                            ${isRecibo ? 'FIRMA DEL PROFESIONAL' : 'FIRMA ADMINISTRACIÓN'}
                        </div>
                        ${isRecibo ? '<div class="signature">ADMINISTRACIÓN COAT</div>' : ''}
                    </div>
                </body>
            </html>
        `;

        try {
            const { uri } = await Print.printToFileAsync({ html });
            await Sharing.shareAsync(uri);
        } catch (error) {
            console.error("PDF Error:", error);
            Alert.alert("Error", "No se pudo generar el PDF.");
        }
    };

    const renderProfItem = ({ item }) => (
        <TouchableOpacity 
            onPress={() => setSelectedProf(item)}
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
            <View style={[styles.avatar, { backgroundColor: colors.primary + '15' }]}>
                <Text style={{ color: colors.primary, fontWeight: 'bold' }}>{item.nombre.charAt(0)}</Text>
            </View>
            <View style={styles.cardInfo}>
                <Text style={[styles.profName, { color: colors.text }]}>{item.nombre}</Text>
                <Text style={[styles.profCategory, { color: colors.subtext }]}>{item.categoria || item.rol || 'Médico'}</Text>
            </View>
            <View style={styles.cardBalance}>
                <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.balancePesos, { color: '#4caf50' }]}>$ {item.pesos.toLocaleString()}</Text>
                    {item.dolares !== 0 && (
                        <Text style={[styles.balanceDolares, { color: '#2196f3' }]}>U$D {item.dolares.toLocaleString()}</Text>
                    )}
                </View>
                <ChevronRight color={colors.border} size={16} />
            </View>
        </TouchableOpacity>
    );

    if (selectedProf) {
        const isORL = (selectedProf.categoria || 'ORL') === 'ORL';
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={[styles.detailHeader, { backgroundColor: colors.card }]}>
                    <TouchableOpacity onPress={() => setSelectedProf(null)} style={styles.backBtn}>
                        <ChevronLeft color={colors.text} size={28} />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.detailTitle, { color: colors.text }]}>Liquidación: {selectedProf.categoria || 'Médico'}</Text>
                        <Text style={[styles.detailName, { color: colors.primary }]}>{selectedProf.nombre}</Text>
                    </View>
                    <TouchableOpacity onPress={() => setShowDatePicker(true)} style={styles.dateSelector}>
                        <Calendar size={20} color={colors.primary} />
                        <Text style={[styles.dateText, { color: colors.text }]}>{formatJSDate(selectedDate)}</Text>
                    </TouchableOpacity>
                </View>

                {showDatePicker && (
                    <DateTimePicker
                        value={selectedDate}
                        mode="date"
                        display="default"
                        onChange={(event, date) => {
                            setShowDatePicker(false);
                            if (date) setSelectedDate(date);
                        }}
                    />
                )}

                <ScrollView contentContainerStyle={styles.detailBody}>
                    <View style={styles.summaryRowDetailed}>
                        <View style={[styles.sumBox, { backgroundColor: colors.card }]}>
                            <Text style={[styles.sumLabel, { color: colors.subtext }]}>PESOS FINAL</Text>
                            <Text style={[styles.sumValue, { color: '#4caf50' }]}>$ {settlementData.totalPesos.toLocaleString()}</Text>
                        </View>
                        <View style={[styles.sumBox, { backgroundColor: colors.card }]}>
                            <Text style={[styles.sumLabel, { color: colors.subtext }]}>USD FINAL</Text>
                            <Text style={[styles.sumValue, { color: '#2196f3' }]}>U$D {settlementData.totalUSD.toLocaleString()}</Text>
                        </View>
                    </View>

                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Detalle del Día</Text>
                    
                    {settlementData.items.length === 0 && settlementData.deductions.length === 0 ? (
                        <View style={styles.emptyDetail}>
                            <FileText size={48} color={colors.border} />
                            <Text style={{ color: colors.subtext, marginTop: 10 }}>No hay actividad para este día.</Text>
                        </View>
                    ) : (
                        <>
                            {settlementData.items.map((item, idx) => (
                                <View key={`item-${idx}`} style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                                    <View style={styles.itemHeader}>
                                        <Text style={[styles.itemPatient, { color: colors.text }]}>{item.paciente}</Text>
                                        <Text style={[styles.itemOS, { color: colors.subtext }]}>{item.obraSocial}</Text>
                                    </View>
                                    <View style={{ alignItems: 'flex-end' }}>
                                        <Text style={{ color: '#4caf50', fontWeight: 'bold' }}>$ {item.pesos.toLocaleString()}</Text>
                                        {item.usd !== 0 && <Text style={{ color: '#2196f3', fontSize: 12 }}>U$D {item.usd.toLocaleString()}</Text>}
                                    </View>
                                </View>
                            ))}
                            
                            {settlementData.deductions.map((d, idx) => (
                                <View key={`ded-${idx}`} style={[styles.itemCard, { backgroundColor: '#fff5f5', borderColor: '#feb2b2' }]}>
                                    <View style={styles.itemHeader}>
                                        <Text style={[styles.itemPatient, { color: '#c53030' }]}>Deducción: {d.desc}</Text>
                                        <Text style={[styles.itemOS, { color: '#c53030', opacity: 0.7 }]}>Retención / Gasto</Text>
                                    </View>
                                    <View style={{ alignItems: 'flex-end' }}>
                                        <Text style={{ color: '#c53030', fontWeight: 'bold' }}>- {d.currency === 'USD' ? 'U$D' : '$'} {Math.abs(d.amount).toLocaleString()}</Text>
                                    </View>
                                </View>
                            ))}
                        </>
                    )}

                    <View style={styles.actionsContainer}>
                        {isORL ? (
                            <>
                                <TouchableOpacity 
                                    onPress={() => generatePDF('recibo')}
                                    disabled={settlementData.items.length === 0}
                                    style={[styles.actionBtn, { backgroundColor: '#7b1fa2', opacity: settlementData.items.length === 0 ? 0.6 : 1 }]}
                                >
                                    <FileText color="#fff" size={20} />
                                    <Text style={styles.actionBtnText}>GENERAR RECIBO</Text>
                                </TouchableOpacity>
                                
                                <TouchableOpacity 
                                    onPress={() => generatePDF('detalle')}
                                    disabled={settlementData.items.length === 0}
                                    style={[styles.actionBtn, { backgroundColor: '#455a64', opacity: settlementData.items.length === 0 ? 0.6 : 1 }]}
                                >
                                    <Printer color="#fff" size={20} />
                                    <Text style={styles.actionBtnText}>GENERAR DETALLE</Text>
                                </TouchableOpacity>
                            </>
                        ) : (
                            <TouchableOpacity 
                                onPress={() => generatePDF('liquidacion')}
                                disabled={settlementData.items.length === 0 && settlementData.deductions.length === 0}
                                style={[styles.actionBtn, { backgroundColor: colors.primary, opacity: (settlementData.items.length === 0 && settlementData.deductions.length === 0) ? 0.6 : 1 }]}
                            >
                                <Printer color="#fff" size={20} />
                                <Text style={styles.actionBtnText}>GENERAR LIQUIDACIÓN</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </ScrollView>
            </SafeAreaView>
        );
    }


    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.header, { backgroundColor: colors.primary }]}>
                <View style={styles.headerTop}>
                    <Landmark color="rgba(255,255,255,0.7)" size={20} />
                    <Text style={styles.headerTitle}>LIQUIDACIONES</Text>
                </View>
                
                <View style={[styles.searchContainer, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                    <Search color="#fff" size={18} />
                    <TextInput 
                        placeholder="Buscar profesional..."
                        placeholderTextColor="rgba(255,255,255,0.6)"
                        style={styles.searchInput}
                        value={search}
                        onChangeText={setSearch}
                    />
                </View>
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            ) : (
                <FlatList
                    data={filteredProfessionals}
                    keyExtractor={(item) => item.id}
                    renderItem={renderProfItem}
                    contentContainerStyle={styles.list}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Wallet color={colors.border} size={60} />
                            <Text style={[styles.empty, { color: colors.subtext }]}>
                                {search ? 'No se encontraron profesionales.' : 'Sin liquidaciones disponibles.'}
                            </Text>
                        </View>
                    }
                />
            )}
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        padding: 20,
        paddingTop: Platform.OS === 'ios' ? 20 : 50,
        borderBottomLeftRadius: 30,
        borderBottomRightRadius: 30,
        elevation: 8,
    },
    headerTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
    headerTitle: { color: '#fff', fontSize: 13, fontWeight: '900', letterSpacing: 2, marginLeft: 10 },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 15,
        height: 50,
        borderRadius: 15,
    },
    searchInput: { flex: 1, marginLeft: 10, fontSize: 15, color: '#fff' },
    list: { padding: 20, paddingBottom: 100 },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 15,
        borderRadius: 20,
        marginBottom: 12,
        borderWidth: 1,
        elevation: 2,
    },
    avatar: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
    cardInfo: { flex: 1 },
    profName: { fontSize: 15, fontWeight: '800' },
    profCategory: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', marginTop: 2, opacity: 0.6 },
    cardBalance: { flexDirection: 'row', alignItems: 'center' },
    balancePesos: { fontSize: 16, fontWeight: '900', marginBottom: 2 },
    balanceDolares: { fontSize: 12, fontWeight: '700' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    emptyContainer: { alignItems: 'center', marginTop: 80, opacity: 0.5 },
    empty: { textAlign: 'center', marginTop: 15, fontSize: 15, fontWeight: '500' },

    // Detail Styles
    detailHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 15,
        paddingTop: Platform.OS === 'ios' ? 10 : 40,
        elevation: 4,
    },
    backBtn: { marginRight: 15 },
    detailTitle: { fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', opacity: 0.6 },
    detailName: { fontSize: 18, fontWeight: '900' },
    dateSelector: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        paddingVertical: 8, 
        paddingHorizontal: 12, 
        borderRadius: 12,
        backgroundColor: 'rgba(0,0,0,0.05)'
    },
    dateText: { marginLeft: 8, fontSize: 14, fontWeight: 'bold' },
    detailBody: { padding: 20, paddingBottom: 50 },
    summaryRowDetailed: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 25 },
    sumBox: { flex: 1, padding: 15, borderRadius: 18, marginHorizontal: 5, elevation: 2 },
    sumLabel: { fontSize: 10, fontWeight: 'bold', marginBottom: 5 },
    sumValue: { fontSize: 20, fontWeight: '900' },
    sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 15 },
    itemCard: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 15,
        borderRadius: 15,
        borderWidth: 1,
        marginBottom: 10
    },
    itemHeader: { flex: 1 },
    itemPatient: { fontSize: 14, fontWeight: 'bold' },
    itemOS: { fontSize: 12, marginTop: 2 },
    emptyDetail: { alignItems: 'center', padding: 40, opacity: 0.4 },
    actionsContainer: { marginTop: 30 },
    actionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 55,
        borderRadius: 15,
        marginBottom: 12,
        elevation: 3
    },
    actionBtnText: { color: '#fff', fontWeight: 'bold', marginLeft: 10, letterSpacing: 1 }
});

export default LiquidacionScreen;
