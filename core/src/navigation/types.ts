export type RootStackParamList = {
  Splash: undefined;
  Permission: undefined;
  Login: undefined;
  Home: undefined;
  Entry: undefined;
  Exit: undefined;
  NfcEntry: {
    plateText: string;
    mode: 'write' | 'read';
    imageUri?: string;
  };
  History: undefined;
  Debug: undefined;
  Settings: undefined;
  ResetPassword: { initialEmail?: string };
};
