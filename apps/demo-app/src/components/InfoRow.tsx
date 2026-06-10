import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props { label: string; value: string | null; mono?: boolean; }

export default function InfoRow({ label, value, mono }: Props) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text
        style={[styles.value, mono && styles.mono]}
        numberOfLines={1}
        ellipsizeMode="middle">
        {value ?? '—'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  label: { fontSize: 13, color: '#6B7280', flex: 1 },
  value: { fontSize: 13, color: '#111827', flex: 2, textAlign: 'right' },
  mono:  { fontFamily: 'Courier New' },
});
