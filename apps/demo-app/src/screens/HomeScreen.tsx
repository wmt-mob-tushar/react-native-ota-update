import React from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Alert, Platform,
} from 'react-native';
import { useOTA } from '../hooks/useOTA';
import OTAStatusBadge from '../components/OTAStatusBadge';
import ProgressBar from '../components/ProgressBar';
import InfoRow from '../components/InfoRow';
import { APP_VERSION, APP_TAGLINE, APP_ACCENT } from '../appVersion';

export default function HomeScreen() {
  const {
    status, progress,
    currentBundle, pendingBundle, lastGoodBundle,
    errorMessage, updateMessage, isForced,
    checkForUpdate, installUpdate, rollback, dismissError,
  } = useOTA();

  const isBusy = status === 'checking' || status === 'downloading' || status === 'installing';

  function handleRollback() {
    Alert.alert(
      'Rollback',
      'Revert to the last known-good bundle?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Rollback', style: 'destructive', onPress: rollback },
      ],
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* ── Version hero — this is what changes over the air ── */}
      <View style={[styles.hero, { backgroundColor: APP_ACCENT }]}>
        <Text style={styles.heroEyebrow}>OTA DEMO</Text>
        <Text style={styles.heroVersion}>{APP_VERSION}</Text>
        <Text style={styles.heroTagline}>{APP_TAGLINE}</Text>
        <View style={styles.heroBadge}>
          <OTAStatusBadge status={status} />
        </View>
      </View>

      {/* Error banner */}
      {errorMessage && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>⚠ {errorMessage}</Text>
          <TouchableOpacity onPress={dismissError}>
            <Text style={styles.errorDismiss}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Update ready banner */}
      {status === 'ready' && (
        <View style={[styles.banner, isForced ? styles.bannerForced : styles.bannerInfo]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>
              {isForced ? '⚡ Mandatory Update' : '🆕 Update downloaded'}
            </Text>
            <Text style={styles.bannerMsg}>{updateMessage ?? 'Restart to apply.'}</Text>
          </View>
          <TouchableOpacity style={styles.bannerBtn} onPress={installUpdate}>
            <Text style={styles.bannerBtnText}>Restart</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Rollback banner */}
      {status === 'rollback' && (
        <View style={[styles.banner, styles.bannerWarn]}>
          <Text style={styles.bannerTitle}>↩ Rollback applied. Previous bundle restored.</Text>
        </View>
      )}

      {/* Up-to-date pill */}
      {status === 'up_to_date' && (
        <View style={[styles.banner, styles.bannerOk]}>
          <Text style={styles.bannerTitle}>✓ You're on the latest version.</Text>
        </View>
      )}

      {/* Download progress */}
      {status === 'downloading' && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Downloading update…  {progress}%</Text>
          <View style={{ marginTop: 8 }}>
            <ProgressBar progress={progress} />
          </View>
        </View>
      )}

      {/* Actions */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Actions</Text>

        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary, isBusy && styles.btnDisabled]}
          disabled={isBusy}
          onPress={checkForUpdate}>
          <Text style={styles.btnPrimaryText}>
            {status === 'checking'    ? 'Checking…'
            : status === 'downloading' ? `Downloading… ${progress}%`
            : 'Check for Update'}
          </Text>
        </TouchableOpacity>

        {(status === 'ready' || pendingBundle) && (
          <TouchableOpacity style={[styles.btn, styles.btnSuccess]} onPress={installUpdate}>
            <Text style={styles.btnPrimaryText}>Restart &amp; Apply Update</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={[styles.btn, styles.btnDanger]} onPress={handleRollback}>
          <Text style={styles.btnDangerText}>Rollback to Last Good</Text>
        </TouchableOpacity>
      </View>

      {/* Bundle state */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Bundle State</Text>
        <InfoRow label="Current bundle"   value={currentBundle}  mono />
        <InfoRow label="Pending bundle"   value={pendingBundle}  mono />
        <InfoRow label="Last good bundle" value={lastGoodBundle} mono />
        <InfoRow label="Platform"         value={Platform.OS}    />
      </View>

      {/* How it works */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>How It Works</Text>
        <Text style={styles.info}>
          1. App checks for updates on launch and every 60 s.{'\n'}
          2. A new bundle downloads + verifies in the background.{'\n'}
          3. A dialog pops up — tap “Restart Now”.{'\n'}
          4. The app reloads and the new version appears above.{'\n'}
          5. If it crashes on launch, the SDK auto-rolls back.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  content:   { padding: 16, paddingBottom: 40 },

  hero: {
    borderRadius: 20, padding: 22, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 12, elevation: 4,
  },
  heroEyebrow: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  heroVersion: { color: '#fff', fontSize: 44, fontWeight: '800', marginTop: 4 },
  heroTagline: { color: 'rgba(255,255,255,0.9)', fontSize: 14, marginTop: 4 },
  heroBadge:   { marginTop: 14, alignSelf: 'flex-start' },

  errorBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FEF2F2', borderRadius: 12,
    padding: 12, marginBottom: 12,
    borderWidth: 1, borderColor: '#FECACA',
  },
  errorText:    { flex: 1, color: '#B91C1C', fontSize: 13 },
  errorDismiss: { color: '#B91C1C', fontSize: 16, paddingLeft: 8 },

  banner: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1,
  },
  bannerInfo:  { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  bannerForced:{ backgroundColor: '#FFF7ED', borderColor: '#FED7AA' },
  bannerWarn:  { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  bannerOk:    { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  bannerTitle: { fontSize: 14, fontWeight: '600', color: '#111827' },
  bannerMsg:   { fontSize: 12, color: '#6B7280', marginTop: 2 },
  bannerBtn: {
    backgroundColor: '#6366F1', paddingHorizontal: 14,
    paddingVertical: 8, borderRadius: 8, marginLeft: 12,
  },
  bannerBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },

  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    marginBottom: 12, shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06,
    shadowRadius: 4, elevation: 2,
  },
  cardTitle: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },

  btn: { borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 8 },
  btnPrimary:     { backgroundColor: '#6366F1' },
  btnSuccess:     { backgroundColor: '#059669' },
  btnDanger:      { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
  btnDisabled:    { opacity: 0.5 },
  btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnDangerText:  { color: '#DC2626', fontWeight: '600', fontSize: 15 },

  info: { fontSize: 13, color: '#4B5563', lineHeight: 22 },
});
