import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, ActivityIndicator, Alert, ScrollView, Modal, TextInput, LayoutAnimation, Platform } from 'react-native';
import { Wallet, Plus, Search, ArrowLeft, Folder, FileText, Calendar, Download, Share2, X, ChevronRight, MessageSquare, Lock, Unlock, Trash2, Edit2, ChevronDown, ChevronUp } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { apiService } from '../services/apiService';
import { auth } from '../services/firebase';
import ExcelJS from 'exceljs';
import { Buffer } from 'buffer';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { COAT_LOGO } from '../constants/logo';

const CajaScreen = ({ navigation }) => {
    const { colors, isDark } = useTheme();
    const [movements, setMovements] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Navigation State
    const [viewLevel, setViewLevel] = useState('years'); // 'years', 'months', 'days'
    const [selectedYear, setSelectedYear] = useState(null);
    const [selectedMonth, setSelectedMonth] = useState(null);
    const [selectedDayData, setSelectedDayData] = useState(null);
    const [dayModalVisible, setDayModalVisible] = useState(false);
    const [expandedEntry, setExpandedEntry] = useState(null); 

    // Admin / Security State
    const [isAdmin, setIsAdmin] = useState(false);
    const [pinModalVisible, setPinModalVisible] = useState(false);
    const [pinInput, setPinInput] = useState('');

    // Daily Comment State
    const [dailyComment, setDailyComment] = useState('');

    const fetchMovements = async () => {
        const userId = auth.currentUser?.uid;
        if (!userId) return;

        try {
            const data = await apiService.getCollection('caja', { userId });
            setMovements(data);
        } catch (error) {
            console.error("Error fetching caja:", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchDailyComment = async (date) => {
        const userId = auth.currentUser?.uid;
        if (!userId || !date) return;
        try {
            const comments = await apiService.getCollection('daily_comments', { userId, date });
            if (comments.length > 0) {
                setDailyComment(comments[0].comment);
            } else {
                setDailyComment('');
            }
        } catch (error) {
            console.error("Error fetching daily comment:", error);
        }
    };

    useEffect(() => {
        fetchMovements();
    }, []);

    const getMonthName = (monthIdx) => {
        const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        return months[parseInt(monthIdx) - 1];
    };

    const hierarchy = useMemo(() => {
        const tree = {};
        movements.forEach(m => {
            if (!m.fecha) return;
            const [year, month, day] = m.fecha.split('-');
            if (!tree[year]) tree[year] = {};
            if (!tree[year][month]) tree[year][month] = {};
            if (!tree[year][month][day]) tree[year][month][day] = [];
            tree[year][month][day].push(m);
        });
        return tree;
    }, [movements]);

    const calculateDayTotals = (entries) => {
        return entries.reduce((acc, e) => {
            acc.pesos += parseFloat(e.pesos) || 0;
            acc.dolares += parseFloat(e.dolares) || 0;
            acc.coat_pesos += parseFloat(e.coat_pesos) || 0;
            acc.coat_dolares += parseFloat(e.coat_dolares) || 0;
            return acc;
        }, { pesos: 0, dolares: 0, coat_pesos: 0, coat_dolares: 0 });
    };

    const exportToExcel = async (day, month, year, entries) => {
        try {
            const dateStr = `${day}/${month}/${year}`;
            const fileName = `CAJA CX ${day}-${month}-${year}.xlsx`;
            
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Caja Diaria');

            // Set Column Widths
            worksheet.columns = [
                { width: 25 }, { width: 12 }, { width: 15 }, { width: 18 }, { width: 18 }, { width: 18 },
                { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 },
                { width: 18 }, { width: 12 }, { width: 15 }, { width: 15 }
            ];

            // Set Row Heights for Logo area
            for (let i = 1; i <= 4; i++) {
                worksheet.getRow(i).height = 20;
            }

            // Add Logo
            const cleanBase64 = COAT_LOGO.includes('base64,') 
                ? COAT_LOGO.split('base64,')[1] 
                : COAT_LOGO;

            const logoId = workbook.addImage({
                base64: cleanBase64,
                extension: 'png',
            });
            
            worksheet.addImage(logoId, {
                tl: { col: 0, row: 0 },
                br: { col: 1, row: 4 },
                editAs: 'oneCell'
            });

            // Row 5: Title and Date
            worksheet.getRow(5).values = ["Caja de cirugía", dateStr];
            worksheet.getRow(5).font = { bold: true, size: 12 };

            // Row 6: Monto COAT Header
            worksheet.mergeCells('N6:O6');
            const coatHeaderCell = worksheet.getCell('N6');
            coatHeaderCell.value = "Monto COAT";
            coatHeaderCell.alignment = { horizontal: 'center' };
            coatHeaderCell.font = { bold: true };

            // Row 7: Main Headers
            const headerRow = worksheet.getRow(7);
            headerRow.values = [
                "Paciente", "DNI", "Obra social", "Prof. 1", "Prof. 2", "Prof. 3", 
                "Pesos", "Dolares", "Liq. P1", "Liq. P2", "Liq. P3", 
                "Anest.", "Liq. Anest.", "Coat $", "Coat USD"
            ];
            headerRow.font = { bold: true };

            // Apply Borders and Alignment to Headers
            headerRow.eachCell((cell) => {
                cell.border = {
                    top: { style: 'medium', color: { argb: 'FF000000' } }, 
                    left: { style: 'medium', color: { argb: 'FF000000' } },
                    bottom: { style: 'medium', color: { argb: 'FF000000' } }, 
                    right: { style: 'medium', color: { argb: 'FF000000' } }
                };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
            });

            // Add Data Rows
            entries.forEach((e, index) => {
                const row = worksheet.addRow([
                    (e.paciente || '').toUpperCase(),
                    e.dni || '',
                    e.obra_social || '',
                    e.prof_1 || '',
                    e.prof_2 || '',
                    e.prof_3 || '',
                    parseFloat(e.pesos) || 0,
                    parseFloat(e.dolares) || 0,
                    parseFloat(e.liq_prof_1) || 0,
                    parseFloat(e.liq_prof_2) || 0,
                    parseFloat(e.liq_prof_3) || 0,
                    e.anestesista || '',
                    parseFloat(e.liq_anestesista) || 0,
                    parseFloat(e.coat_pesos) || 0,
                    parseFloat(e.coat_dolares) || 0
                ]);

                // Style data cells
                row.eachCell((cell, colNumber) => {
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FF000000' } }, 
                        left: { style: 'thin', color: { argb: 'FF000000' } },
                        bottom: { style: 'thin', color: { argb: 'FF000000' } }, 
                        right: { style: 'thin', color: { argb: 'FF000000' } }
                    };
                    if (colNumber === 1) {
                        cell.font = { bold: true };
                    }
                });
            });

            // Total Row
            const totals = calculateDayTotals(entries);
            const totalRow = worksheet.addRow([]);
            totalRow.getCell(13).value = "Total";
            totalRow.getCell(13).font = { bold: true };
            totalRow.getCell(14).value = totals.coat_pesos;
            totalRow.getCell(15).value = totals.coat_dolares;
            
            [13, 14, 15].forEach(col => {
                const cell = totalRow.getCell(col);
                cell.font = { bold: true };
                cell.border = {
                    top: { style: 'thin' }, left: { style: 'thin' },
                    bottom: { style: 'thin' }, right: { style: 'thin' }
                };
            });

            // Generate Output
            const buffer = await workbook.xlsx.writeBuffer();
            const base64 = Buffer.from(buffer).toString('base64');

            if (Platform.OS === 'web') {
                const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                a.click();
                return;
            }

            const uri = FileSystem.cacheDirectory + fileName;
            await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
            
            await Sharing.shareAsync(uri, {
                mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                dialogTitle: 'Exportar Caja Diaria',
                UTI: 'com.microsoft.excel.xlsx'
            });

        } catch (error) {
            console.error("ExcelJS Error:", error);
            Alert.alert("Error", "Problema al generar el Excel: " + error.message);
        }
    };

    function s2ab(s) {
        const buf = new ArrayBuffer(s.length);
        const view = new Uint8Array(buf);
        for (let i = 0; i < s.length; i++) view[i] = s.charCodeAt(i) & 0xFF;
        return buf;
    }

    const toggleExpansion = (id) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpandedEntry(expandedEntry === id ? null : id);
    };

    const handleUnlock = () => {
        const masterPins = ['0511', '1234', '2024', '2025'];
        if (masterPins.includes(pinInput)) {
            setIsAdmin(true);
            setPinModalVisible(false);
            setPinInput('');
            Alert.alert("Éxito", "Modo administrador activado");
        } else {
            Alert.alert("Error", "PIN incorrecto");
            setPinInput('');
        }
    };

    const handleDeleteEntry = async (id) => {
        Alert.alert(
            "Eliminar Registro",
            "¿Estás seguro?",
            [
                { text: "Cancelar", style: "cancel" },
                { 
                    text: "Eliminar", 
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await apiService.deleteDocument('caja', id);
                            fetchMovements();
                            setDayModalVisible(false);
                        } catch (error) {
                            Alert.alert("Error", error.message);
                        }
                    }
                }
            ]
        );
    };

    const goBack = () => {
        if (viewLevel === 'days') setViewLevel('months');
        else if (viewLevel === 'months') setViewLevel('years');
    };

    const renderGridItem = (id, label, type, onPress) => (
        <TouchableOpacity style={[styles.gridItem, { backgroundColor: colors.card }]} onPress={onPress}>
            <View style={[styles.iconWrapper, { backgroundColor: isDark ? 'rgba(0,128,128,0.15)' : '#f0f9f9' }]}>
                {type === 'folder' ? (
                    <Folder color={colors.primary} size={32} fill={isDark ? colors.primary + '40' : colors.primary + '20'} />
                ) : (
                    <FileText color="#ff9800" size={32} />
                )}
            </View>
            <Text style={[styles.gridLabel, { color: colors.text }]} numberOfLines={1}>{label}</Text>
        </TouchableOpacity>
    );

    const renderContent = () => {
        if (viewLevel === 'years') {
            const years = Object.keys(hierarchy).sort((a, b) => b - a);
            return (
                <View style={styles.grid}>
                    {years.map(year => renderGridItem(year, year, 'folder', () => {
                        setSelectedYear(year); setViewLevel('months');
                    }))}
                </View>
            );
        }
        if (viewLevel === 'months') {
            const months = Object.keys(hierarchy[selectedYear] || {}).sort((a, b) => b - a);
            return (
                <View style={styles.grid}>
                    {months.map(month => renderGridItem(month, getMonthName(month), 'folder', () => {
                        setSelectedMonth(month); setViewLevel('days');
                    }))}
                </View>
            );
        }
        if (viewLevel === 'days') {
            const days = Object.keys(hierarchy[selectedYear][selectedMonth] || {}).sort((a, b) => b - a);
            return (
                <View style={styles.grid}>
                    {days.map(day => renderGridItem(day, `Día ${day}`, 'file', () => {
                        const entries = hierarchy[selectedYear][selectedMonth][day];
                        const dateStr = `${selectedYear}-${selectedMonth}-${day}`;
                        setSelectedDayData({ day, entries });
                        fetchDailyComment(dateStr);
                        setDayModalVisible(true);
                        setExpandedEntry(null);
                    }))}
                </View>
            );
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.header, { backgroundColor: colors.card }]}>
                <View style={styles.headerTop}>
                    {viewLevel !== 'years' ? (
                        <TouchableOpacity onPress={goBack} style={styles.backButton}>
                            <ArrowLeft color={colors.primary} size={22} />
                            <Text style={{ color: colors.primary, marginLeft: 8, fontWeight: 'bold' }}>Volver</Text>
                        </TouchableOpacity>
                    ) : (
                        <View>
                            <Text style={[styles.headerTitle, { color: colors.text }]}>Historial</Text>
                            <Text style={{ color: colors.subtext, fontSize: 12 }}>{movements.length} operaciones</Text>
                        </View>
                    )}
                    <TouchableOpacity onPress={() => isAdmin ? setIsAdmin(false) : setPinModalVisible(true)} style={styles.lockBtn}>
                        {isAdmin ? <Unlock color="#4caf50" size={20} /> : <Lock color={colors.subtext} size={20} />}
                    </TouchableOpacity>
                </View>
                <View style={styles.breadcrumbs}>
                    <Text style={[styles.breadcrumbText, { color: colors.subtext }]}>Raíz</Text>
                    {selectedYear && <Text style={[styles.breadcrumbText, { color: colors.primary }]}>  /  {selectedYear}</Text>}
                    {selectedMonth && <Text style={[styles.breadcrumbText, { color: colors.primary }]}>  /  {getMonthName(selectedMonth)}</Text>}
                </View>
            </View>

            {loading ? (
                <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
            ) : (
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    {renderContent()}
                    {movements.length === 0 && (
                        <View style={styles.emptyState}>
                            <Folder size={60} color={colors.border} />
                            <Text style={{ color: colors.subtext, marginTop: 15 }}>No hay registros</Text>
                        </View>
                    )}
                </ScrollView>
            )}

            <Modal visible={pinModalVisible} transparent animationType="fade">
                <View style={styles.pinOverlay}>
                    <View style={[styles.pinBox, { backgroundColor: colors.card }]}>
                        <Text style={[styles.pinTitle, { color: colors.text }]}>PIN</Text>
                        <TextInput style={[styles.pinInput, { color: colors.text, borderBottomColor: colors.primary }]} keyboardType="numeric" secureTextEntry value={pinInput} onChangeText={setPinInput} autoFocus />
                        <View style={styles.pinActions}>
                            <TouchableOpacity onPress={() => setPinModalVisible(false)} style={styles.pinCancel}><Text style={{ color: colors.subtext }}>Cancelar</Text></TouchableOpacity>
                            <TouchableOpacity onPress={handleUnlock} style={[styles.pinConfirm, { backgroundColor: colors.primary }]}><Text style={{ color: '#fff' }}>OK</Text></TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            <Modal visible={dayModalVisible} animationType="slide" transparent={true}>
                <View style={styles.modalBackdrop}>
                    <View style={[styles.modalBox, { backgroundColor: colors.card }]}>
                        <View style={styles.modalHeader}>
                            <View>
                                <Text style={[styles.modalTitle, { color: colors.text }]}>Cierre: {selectedDayData?.day}-{selectedMonth}-{selectedYear}</Text>
                                <Text style={{ color: colors.subtext, fontSize: 12 }}>{selectedDayData?.entries.length} registros</Text>
                            </View>
                            <TouchableOpacity onPress={() => setDayModalVisible(false)}><X size={24} color={colors.text} /></TouchableOpacity>
                        </View>

                        {selectedDayData && (
                            <View style={[styles.summaryBar, { backgroundColor: isDark ? '#1a1a1a' : '#f8f9fa' }]}>
                                <View style={styles.summaryItem}><Text style={styles.summaryLabel}>ARS COAT</Text><Text style={[styles.summaryValue, { color: '#198754' }]}>$ {calculateDayTotals(selectedDayData.entries).coat_pesos.toLocaleString()}</Text></View>
                                <View style={styles.summaryItem}><Text style={styles.summaryLabel}>USD COAT</Text><Text style={[styles.summaryValue, { color: '#0d6efd' }]}>U$D {calculateDayTotals(selectedDayData.entries).coat_dolares.toLocaleString()}</Text></View>
                            </View>
                        )}

                        <FlatList data={selectedDayData?.entries} keyExtractor={(item) => item.id} renderItem={({ item }) => {
                            const isExpanded = expandedEntry === item.id;
                            return (
                                <TouchableOpacity activeOpacity={0.8} onPress={() => toggleExpansion(item.id)} style={[styles.entryCard, { backgroundColor: isExpanded ? (isDark ? '#252525' : '#f0f0f0') : 'transparent' }]}>
                                    <View style={styles.entryHeader}>
                                        <View style={{ flex: 1 }}><Text style={[styles.entryName, { color: colors.text }]}>{item.paciente?.toUpperCase()}</Text><Text style={{ color: colors.subtext, fontSize: 10 }}>{item.obra_social || 'S/O'}</Text></View>
                                        <View style={{ alignItems: 'flex-end', flexDirection: 'row' }}><View style={{ marginRight: 10 }}><Text style={{ color: '#4caf50', fontWeight: 'bold' }}>$ {item.pesos?.toLocaleString()}</Text></View>{isExpanded ? <ChevronUp size={16} color={colors.subtext} /> : <ChevronDown size={16} color={colors.subtext} />}</View>
                                    </View>
                                    {isExpanded && (
                                        <View style={styles.entryDetails}>
                                            <View style={styles.detailRow}>
                                                <View style={styles.detailCol}>
                                                    <Text style={styles.detailLabel}>LIQUIDACIÓN</Text>
                                                    {item.prof_1 && <Text style={[styles.detailText, { color: colors.text }]}>{item.prof_1}: {item.liq_prof_1_currency==='ARS'?'$':'U$D'} {item.liq_prof_1?.toLocaleString()}</Text>}
                                                    {item.prof_2 && <Text style={[styles.detailText, { color: colors.text }]}>{item.prof_2}: {item.liq_prof_2_currency==='ARS'?'$':'U$D'} {item.liq_prof_2?.toLocaleString()}</Text>}
                                                    {item.prof_3 && <Text style={[styles.detailText, { color: colors.text }]}>{item.prof_3}: {item.liq_prof_3_currency==='ARS'?'$':'U$D'} {item.liq_prof_3?.toLocaleString()}</Text>}
                                                    {item.anestesista && <Text style={[styles.detailText, { color: '#6f42c1' }]}>Anes: $ {item.liq_anestesista?.toLocaleString()}</Text>}
                                                </View>
                                                <View style={[styles.detailCol, { alignItems: 'flex-end' }]}><Text style={styles.detailLabel}>COAT</Text><Text style={{ fontSize: 15, fontWeight: '900', color: '#ff9800' }}>$ {item.coat_pesos?.toLocaleString()}</Text></View>
                                            </View>
                                            {isAdmin && <TouchableOpacity style={styles.deleteEntryBtn} onPress={() => handleDeleteEntry(item.id)}><Trash2 size={14} color="#dc3545" /><Text style={{ color: '#dc3545', fontSize: 11, fontWeight: 'bold', marginLeft: 6 }}>ELIMINAR</Text></TouchableOpacity>}
                                        </View>
                                    )}
                                </TouchableOpacity>
                            );
                        }} />

                        <View style={[styles.noteSection, { backgroundColor: isDark ? 'rgba(255,193,7,0.1)' : '#fff9e6' }]}><View style={styles.row}><MessageSquare size={16} color="#ffc107" /><Text style={styles.noteTitle}>Nota del día</Text></View><Text style={[styles.noteText, { color: colors.text }]} numberOfLines={2}>{dailyComment || "Sin observaciones."}</Text></View>

                        <TouchableOpacity style={[styles.exportBtn, { backgroundColor: colors.primary }]} onPress={() => exportToExcel(selectedDayData.day, selectedMonth, selectedYear, selectedDayData.entries)}>
                            <Download color="#fff" size={20} /><Text style={styles.exportBtnText}>DESCARGAR EXCEL (.XLSX)</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
    headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    headerTitle: { fontSize: 24, fontWeight: '900' },
    backButton: { flexDirection: 'row', alignItems: 'center' },
    lockBtn: { padding: 10, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.03)' },
    breadcrumbs: { flexDirection: 'row', marginTop: 15, alignItems: 'center' },
    breadcrumbText: { fontSize: 13, fontWeight: '600' },
    scrollContent: { padding: 15, paddingBottom: 100 },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    gridItem: { width: '30%', aspectRatio: 0.9, margin: '1.6%', borderRadius: 24, justifyContent: 'center', alignItems: 'center', elevation: 2 },
    iconWrapper: { width: 55, height: 55, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
    gridLabel: { fontSize: 12, fontWeight: 'bold', textAlign: 'center' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    emptyState: { alignItems: 'center', marginTop: 100, opacity: 0.5 },
    pinOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
    pinBox: { width: '80%', padding: 25, borderRadius: 24, alignItems: 'center' },
    pinTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 20 },
    pinInput: { width: '100%', fontSize: 32, textAlign: 'center', borderBottomWidth: 2, marginBottom: 30 },
    pinActions: { flexDirection: 'row', width: '100%', justifyContent: 'space-between' },
    pinCancel: { padding: 15, flex: 1 },
    pinConfirm: { padding: 15, flex: 2, borderRadius: 15, alignItems: 'center' },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
    modalBox: { borderTopLeftRadius: 40, borderTopRightRadius: 40, padding: 25, height: '85%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
    modalTitle: { fontSize: 18, fontWeight: 'bold' },
    summaryBar: { flexDirection: 'row', padding: 15, borderRadius: 20, marginBottom: 10 },
    summaryItem: { flex: 1, alignItems: 'center' },
    summaryLabel: { fontSize: 9, fontWeight: 'bold', color: '#888' },
    summaryValue: { fontSize: 16, fontWeight: '900' },
    entryCard: { padding: 15, borderRadius: 15, marginBottom: 5 },
    entryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    entryName: { fontSize: 14, fontWeight: 'bold' },
    entryDetails: { marginTop: 15, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)', paddingTop: 12 },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between' },
    detailCol: { flex: 1 },
    detailLabel: { fontSize: 8, fontWeight: '900', color: '#aaa', marginBottom: 6 },
    detailText: { fontSize: 11, marginBottom: 3 },
    deleteEntryBtn: { flexDirection: 'row', alignItems: 'center', marginTop: 15, alignSelf: 'flex-end' },
    noteSection: { padding: 15, borderRadius: 20, marginTop: 10, marginBottom: 20 },
    row: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
    noteTitle: { fontSize: 12, fontWeight: 'bold', marginLeft: 6, color: '#ffc107' },
    noteText: { fontSize: 12, fontStyle: 'italic' },
    exportBtn: { height: 60, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 5 },
    exportBtnText: { color: '#fff', fontWeight: '900', marginLeft: 10 }
});

export default CajaScreen;
