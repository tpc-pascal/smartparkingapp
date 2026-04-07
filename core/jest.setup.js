jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  RN.NativeModules.DatabaseModule = {
    ...RN.NativeModules.DatabaseModule,
    saveFile: jest.fn(() => Promise.resolve()),
  };
  return RN;
}, { virtual: true });

jest.mock('react-native-fs', () => ({
  CachesDirectoryPath: '/mock/cache',
  writeFile: jest.fn(() => Promise.resolve()),
}));

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn(() => Promise.resolve({ isConnected: true, isInternetReachable: true })),
}));

jest.mock('react-native-vector-icons/Feather', () => 'Feather');

jest.mock('react-native-vision-camera', () => ({
  Camera: 'Camera',
  useCameraDevice: () => ({ id: 'back' }),
  useCameraPermission: () => ({ requestPermission: jest.fn().mockResolvedValue(true) }),
  useFrameProcessor: jest.fn().mockReturnValue({ frameProcessor: jest.fn(), type: 'readonly' }),
  runAtTargetFps: jest.fn((_fps, func) => func()),
  VisionCameraProxy: {
    initFrameProcessorPlugin: jest.fn().mockReturnValue(undefined),
  },
}));

jest.mock('react-native-worklets-core', () => ({
  Worklets: {
    runOnJS: jest.fn(),
    createSharedValue: jest.fn(() => ({ value: false })),
    createContext: jest.fn(() => ({ createRunAsync: jest.fn() })),
    defaultContext: { runAsync: jest.fn() },
  },
}));

jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.View = 'View';
  return Reanimated;
});

const mockNavigate = jest.fn();
const mockReplace = jest.fn();
const mockGoBack = jest.fn();
const mockRouteParams = {};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    replace: mockReplace,
    goBack: mockGoBack,
    setOptions: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    reset: jest.fn(),
  }),
  useRoute: () => ({ params: mockRouteParams }),
  NavigationContainer: ({ children }) => children,
  useNavigationContainerRef: () => ({ current: { navigate: mockNavigate } }),
}));

jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({ children }) => children,
    Screen: ({ children }) => children,
    Group: ({ children }) => children,
  }),
}));

global.__mockNavigate = mockNavigate;
global.__mockReplace = mockReplace;
global.__mockGoBack = mockGoBack;
global.__mockRouteParams = mockRouteParams;
