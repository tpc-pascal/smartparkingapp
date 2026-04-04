import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';

import SplashScreen from '../screens/SplashScreen';
import PermissionScreen from '../screens/PermissionScreen';
import LoginScreen from '../screens/LoginScreen';
import HomeScreen from '../screens/HomeScreen';
import DebugScreen from '../screens/DebugScreen';
import EntryScreen from '../screens/EntryScreen';
import ExitScreen from '../screens/ExitScreen';
import NFCScreen from '../screens/NFCScreen';
import HistoryScreen from '../screens/HistoryScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ResetPasswordScreen from '../screens/ResetPasswordScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="Permission" component={PermissionScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="Entry" component={EntryScreen} />
      <Stack.Screen name="Exit" component={ExitScreen} />
      <Stack.Screen name="NfcEntry" component={NFCScreen} />
      <Stack.Screen name="History" component={HistoryScreen} />
      <Stack.Screen name="Debug" component={DebugScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
    </Stack.Navigator>
  );
}
