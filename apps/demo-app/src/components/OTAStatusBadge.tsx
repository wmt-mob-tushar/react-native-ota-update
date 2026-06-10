import React from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import type { OTAStatus } from '../hooks/useOTA';

interface Props { status: OTAStatus; }

const CONFIG: Record<OTAStatus, { label: string; bg: string; text: string }> = {
  idle:        { label: 'Idle',           bg: '#E5E7EB', text: '#6B7280' },
  checking:    { label: 'Checking…',      bg: '#DBEAFE', text: '#2563EB' },
  downloading: { label: 'Downloading…',   bg: '#E0F2FE', text: '#0369A1' },
  ready:       { label: 'Update Ready',   bg: '#D1FAE5', text: '#059669' },
  installing:  { label: 'Installing…',    bg: '#FEF3C7', text: '#D97706' },
  up_to_date:  { label: 'Up to Date ✓',   bg: '#D1FAE5', text: '#059669' },
  error:       { label: 'Error',          bg: '#FEE2E2', text: '#DC2626' },
  rollback:    { label: 'Rolled Back',    bg: '#FEF3C7', text: '#D97706' },
};

export default function OTAStatusBadge({ status }: Props) {
  const c = CONFIG[status];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.label, { color: c.text }]}>{c.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 99 },
  label: { fontSize: 12, fontWeight: '600', letterSpacing: 0.2 },
});
