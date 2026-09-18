import React, { useEffect, useState } from 'react';
import { Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getTimeAgo, type MissingChild } from '../data/mockData';
import { fetchPublicMissingChildren } from '../services/api';

export function MissingChildDetail({ navigation }: any) {
  const [children, setChildren] = useState<MissingChild[]>([]);

  useEffect(() => {
    const loadMissingChildren = async () => {
      try {
        const items = await fetchPublicMissingChildren();

        setChildren(items);
      } catch (err) {
        console.warn('Failed to load missing children', err);
      }
    };

    loadMissingChildren();
  }, []);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color="#111827" />
          <Text style={styles.backText}>뒤로</Text>
        </TouchableOpacity>
        <Text style={styles.title}>미아 찾기</Text>
        <Text style={styles.subtitle}>목격 시 즉시 연락해주세요</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        {children.map((child) => (
          <View key={child.id} style={styles.card}>
            <Image source={{ uri: child.imageUrl }} style={styles.image} />
            <View style={styles.body}>
              <Text style={styles.name}>{child.name} <Text style={styles.age}>{child.age}세</Text></Text>
              <Text style={styles.text}>{child.description}</Text>
              <Text style={styles.text}>{child.lastSeenLocation} · {getTimeAgo(child.lastSeenTime)}</Text>
              <TouchableOpacity style={styles.callButton} onPress={() => Linking.openURL(`tel:${child.contactNumber}`)}>
                <Ionicons name="call" size={18} color="#fff" />
                <Text style={styles.callText}>연락하기</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
        {children.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>등록된 미아 정보가 없습니다.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  header: { paddingHorizontal: 28, paddingTop: 18, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: '#F2F4F6' },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 18 },
  backText: { fontSize: 16, fontWeight: '800', color: '#111827' },
  title: { fontSize: 25, fontWeight: '900', color: '#111827', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#8B95A1' },
  scroll: { padding: 24, paddingBottom: 42 },
  card: { borderRadius: 20, backgroundColor: '#fff', marginBottom: 16, overflow: 'hidden', shadowColor: '#111827', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  image: { width: '100%', height: 250 },
  body: { padding: 20 },
  name: { fontSize: 20, fontWeight: '900', color: '#111827', marginBottom: 10 },
  age: { fontSize: 16, color: '#8B95A1', fontWeight: '700' },
  text: { fontSize: 15, color: '#6B7280', lineHeight: 23, marginBottom: 8 },
  emptyState: { minHeight: 120, borderRadius: 18, borderWidth: 1, borderColor: '#EEF1F4', backgroundColor: '#F8FAFB', alignItems: 'center', justifyContent: 'center', padding: 20 },
  emptyStateText: { color: '#8B95A1', fontSize: 15, fontWeight: '800', textAlign: 'center' },
  callButton: { height: 52, borderRadius: 14, backgroundColor: '#7BCBC6', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10 },
  callText: { color: '#fff', fontSize: 16, fontWeight: '900' },
});
