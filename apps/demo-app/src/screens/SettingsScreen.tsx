import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet,
  ScrollView, TouchableOpacity, Alert, Switch,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@ota_demo_config';

interface DemoConfig {
  appKey: string;
  channel: string;
  runtimeVersion: string;
  autoCheck: boolean;
}

const DEFAULT_CONFIG: DemoConfig = {
  appKey:         'REPLACE_WITH_YOUR_APP_API_KEY',
  channel:        'production',
  runtimeVersion: '1.0.0',
  autoCheck:      true,
};

export default function SettingsScreen() {
  const [config, setConfig] = useState<DemoConfig>(DEFAULT_CONFIG);
  const [saved,  setSaved]  = useState(false);

  async function load() {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) setConfig(JSON.parse(raw));
  }

  async function save() {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function clearOTAState() {
    Alert.alert('Clear OTA State', 'This will reset the current/pending bundle pointers. Use for testing only.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear', style: 'destructive', onPress: async () => {
          await AsyncStorage.removeItem('@ota_state');
          Alert.alert('Done', 'OTA state cleared. Restart the app.');
        },
      },
    ]);
  }

  React.useEffect(() => { load(); }, []);

  function field(label: string, key: keyof DemoConfig, placeholder: string) {
    return (
      <View style={styles.field} key={key}>
        <Text style={styles.label}>{label}</Text>
        <TextInput
          style={styles.input}
          value={String(config[key])}
          placeholder={placeholder}
          placeholderTextColor="#9CA3AF"
          onChangeText={v => setConfig(c => ({ ...c, [key]: v }))}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Settings</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>OTA Configuration</Text>

        {field('App API Key',       'appKey',         'paste from dashboard')}
        {field('Channel',           'channel',        'production / beta / internal')}
        {field('Runtime Version',   'runtimeVersion', '1.0.0')}

        <View style={styles.switchRow}>
          <Text style={styles.label}>Auto-check on startup</Text>
          <Switch
            value={config.autoCheck}
            onValueChange={v => setConfig(c => ({ ...c, autoCheck: v }))}
            trackColor={{ true: '#6366F1' }}
          />
        </View>

        <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={save}>
          <Text style={styles.btnText}>{saved ? '✓ Saved!' : 'Save Settings'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Debug</Text>
        <TouchableOpacity style={[styles.btn, styles.btnDanger]} onPress={clearOTAState}>
          <Text style={styles.btnDangerText}>Clear OTA State (testing)</Text>
        </TouchableOpacity>
        <Text style={styles.hint}>
          Clears @ota_state from AsyncStorage so you can simulate a fresh install.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Supabase Project</Text>
        <Text style={styles.code}>iboujbxhilhhehcrsorv</Text>
        <Text style={styles.hint}>https://iboujbxhilhhehcrsorv.supabase.co</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  content:   { padding: 16, paddingBottom: 40 },
  title:     { fontSize: 24, fontWeight: '700', color: '#111827', marginBottom: 16 },

  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    marginBottom: 12, shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06,
    shadowRadius: 4, elevation: 2,
  },
  cardTitle: {
    fontSize: 13, fontWeight: '700', color: '#374151',
    marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5,
  },

  field:    { marginBottom: 12 },
  label:    { fontSize: 13, color: '#374151', marginBottom: 4, fontWeight: '500' },
  input: {
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: '#111827', backgroundColor: '#F9FAFB',
  },
  switchRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 4, marginBottom: 12,
  },

  btn: {
    borderRadius: 10, paddingVertical: 13,
    alignItems: 'center', marginTop: 4,
  },
  btnPrimary: { backgroundColor: '#6366F1' },
  btnDanger:  { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
  btnText:    { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnDangerText: { color: '#DC2626', fontWeight: '600', fontSize: 15 },

  hint: { fontSize: 12, color: '#9CA3AF', marginTop: 8 },
  code: { fontFamily: 'Courier New', fontSize: 13, color: '#6366F1' },
});
