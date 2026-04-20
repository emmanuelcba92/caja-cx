import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Modal, 
  TextInput, 
  TouchableOpacity, 
  FlatList, 
  SafeAreaView, 
  KeyboardAvoidingView, 
  Platform,
  ActivityIndicator
} from 'react-native';
import { X, Search, User, Hash, ChevronRight } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';

const SearchModal = ({ 
  visible, 
  onClose, 
  onSelect, 
  data, 
  title, 
  placeholder, 
  searchKey = 'nombre', 
  secondaryKey = 'codigo',
  type = 'text' // 'text' | 'professional' | 'code'
}) => {
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const [filteredData, setFilteredData] = useState([]);

  useEffect(() => {
    if (visible) {
      setSearch('');
      setFilteredData(data);
    }
  }, [visible, data]);

  const handleSearch = (text) => {
    setSearch(text);
    if (!text) {
      setFilteredData(data);
      return;
    }

    const filtered = data.filter(item => {
      const mainValue = String(item[searchKey] || '').toLowerCase();
      const secondaryValue = String(item[secondaryKey] || '').toLowerCase();
      return mainValue.includes(text.toLowerCase()) || secondaryValue.includes(text.toLowerCase());
    });
    setFilteredData(filtered);
  };

  const renderItem = ({ item }) => {
    return (
      <TouchableOpacity 
        style={[styles.item, { borderBottomColor: colors.border }]} 
        onPress={() => onSelect(item)}
      >
        <View style={styles.itemContent}>
          {type === 'professional' ? (
            <View style={[styles.iconContainer, { backgroundColor: colors.primary + '15' }]}>
              <User size={20} color={colors.primary} />
            </View>
          ) : type === 'code' ? (
            <View style={[styles.iconContainer, { backgroundColor: '#e2e8f0' }]}>
              <Hash size={20} color="#64748b" />
            </View>
          ) : null}
          
          <View style={styles.textContainer}>
            {type === 'code' && (
              <Text style={[styles.codeText, { color: colors.primary }]}>{item[secondaryKey]}</Text>
            )}
            <Text style={[styles.itemTitle, { color: colors.text }]} numberOfLines={2}>
              {item[searchKey]}
            </Text>
          </View>
        </View>
        <ChevronRight size={20} color={colors.subtext} />
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
        <SafeAreaView style={[styles.modalContent, { backgroundColor: colors.background }]}>
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
          >
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
              <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* Search Input */}
            <View style={styles.searchContainer}>
              <View style={[styles.searchWrapper, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Search size={20} color={colors.subtext} />
                <TextInput
                  style={[styles.searchInput, { color: colors.text }]}
                  placeholder={placeholder || "Buscar..."}
                  placeholderTextColor={colors.subtext}
                  value={search}
                  onChangeText={handleSearch}
                  autoFocus={true}
                />
                {search.length > 0 && (
                  <TouchableOpacity onPress={() => handleSearch('')}>
                    <X size={18} color={colors.subtext} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* List */}
            <FlatList
              data={filteredData}
              keyExtractor={(item, index) => index.toString()}
              renderItem={renderItem}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={[styles.emptyText, { color: colors.subtext }]}>
                    No se encontraron resultados
                  </Text>
                </View>
              }
            />
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    height: '90%',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 20,
    fontBold: '700',
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 5,
  },
  searchContainer: {
    padding: 15,
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    height: 55,
    borderRadius: 15,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 16,
  },
  listContent: {
    paddingBottom: 40,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
  },
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  textContainer: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  codeText: {
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginBottom: 2,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
  }
});

export default SearchModal;
