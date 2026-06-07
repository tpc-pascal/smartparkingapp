import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';

type IconName =
  | 'camera'
  | 'car'
  | 'history'
  | 'settings'
  | 'logout'
  | 'back'
  | 'check'
  | 'close'
  | 'profile'
  | 'parking'
  | 'search'
  | 'filter'
  | 'moon'
  | 'sun'
  | 'bell'
  | 'nfc'
  | 'volume'
  | 'chevron'
  | 'dot'
  | 'entry'
  | 'exit'
  | 'wifi'
  | 'mail'
  | 'lock'
  | 'pencil'
  | 'delete'
  | 'bug'
  | 'refresh'
  | 'eye'
  | 'download'
  | 'bar-chart';

const FEATHER_MAP: Record<IconName, string> = {
  camera:    'camera',
  car:       'truck',
  history:   'clock',
  settings:  'settings',
  logout:    'log-out',
  back:      'arrow-left',
  check:     'check',
  close:     'x',
  profile:   'user',
  parking:   'map-pin',
  search:    'search',
  filter:    'filter',
  moon:      'moon',
  sun:       'sun',
  bell:      'bell',
  nfc:       'smartphone',
  volume:    'volume-2',
  chevron:   'chevron-right',
  dot:       'circle',
  entry:     'arrow-down-circle',
  exit:      'arrow-up-circle',
  wifi:      'wifi',
  mail:      'mail',
  lock:      'lock',
  pencil:    'edit-2',
  delete:    'trash-2',
  bug:       'terminal',
  refresh:   'refresh-cw',
  eye:       'eye',
  download:  'download',
  'bar-chart': 'bar-chart',
};

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
}

export default function AppIcon({ name, size = 24, color }: IconProps) {
  return <Feather name={FEATHER_MAP[name]} size={size} color={color || '#FFFFFF'} />;
}

export function AvatarCircle({ label, size = 40, color, backgroundColor }: { label: string; size?: number; color?: string; backgroundColor?: string }) {
  return (
    <View style={[avatarStyle.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: backgroundColor || '#2563EB' }]}>
      <Text style={[avatarStyle.label, { fontSize: size * 0.4, color: color || '#FFFFFF' }]}>
        {label.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

const avatarStyle = StyleSheet.create({
  circle: { justifyContent: 'center', alignItems: 'center' },
  label: { fontWeight: '700' },
});
