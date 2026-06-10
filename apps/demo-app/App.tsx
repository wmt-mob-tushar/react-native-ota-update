import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, StatusBar, Platform,
} from 'react-native';
import HomeScreen    from './src/screens/HomeScreen';
import SettingsScreen from './src/screens/SettingsScreen';

type Tab = 'home' | 'settings';

export default function App() {
  const [tab, setTab] = useState<Tab>('home');

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Top nav */}
      <View style={styles.topBar}>
        <View style={styles.logo}>
          <View style={styles.logoIcon}>
            <Text style={styles.logoIconText}>⚡</Text>
          </View>
          <View>
            <Text style={styles.logoTitle}>OTA Platform</Text>
            <Text style={styles.logoSub}>React Native Demo</Text>
          </View>
        </View>
        <Text style={styles.platformTag}>{Platform.OS.toUpperCase()}</Text>
      </View>

      {/* Screen */}
      <View style={styles.screen}>
        {tab === 'home'     && <HomeScreen />}
        {tab === 'settings' && <SettingsScreen />}
      </View>

      {/* Bottom tab bar */}
      <View style={styles.tabBar}>
        {([
          { key: 'home',     icon: '🏠', label: 'Updates' },
          { key: 'settings', icon: '⚙️',  label: 'Settings' },
        ] as { key: Tab; icon: string; label: string }[]).map(t => (
          <TouchableOpacity
            key={t.key}
            style={styles.tabItem}
            onPress={() => setTab(t.key)}>
            <Text style={[styles.tabIcon, tab === t.key && styles.tabActiveIcon]}>
              {t.icon}
            </Text>
            <Text style={[styles.tabLabel, tab === t.key && styles.tabActiveLabel]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#F9FAFB' },

  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB',
  },
  logo:         { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoIcon:     { width: 36, height: 36, borderRadius: 10, backgroundColor: '#6366F1', justifyContent: 'center', alignItems: 'center' },
  logoIconText: { fontSize: 18 },
  logoTitle:    { fontSize: 16, fontWeight: '700', color: '#111827' },
  logoSub:      { fontSize: 11, color: '#6B7280' },
  platformTag:  { fontSize: 11, fontWeight: '700', color: '#6366F1', backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },

  screen: { flex: 1 },

  tabBar: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E5E7EB',
    paddingBottom: Platform.OS === 'ios' ? 20 : 4,
  },
  tabItem:      { flex: 1, alignItems: 'center', paddingVertical: 10 },
  tabIcon:      { fontSize: 20, marginBottom: 2, opacity: 0.45 },
  tabActiveIcon:{ opacity: 1 },
  tabLabel:     { fontSize: 10, color: '#9CA3AF', fontWeight: '500' },
  tabActiveLabel:{ color: '#6366F1', fontWeight: '700' },
});
