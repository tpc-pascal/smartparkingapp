jest.mock('react-native-vector-icons/Feather', () => 'Feather');

jest.mock('react-native-vision-camera', () => ({
  Camera: 'Camera',
  useCameraDevice: () => ({ id: 'back' }),
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

jest.mock('react-native-vision-camera', () => ({
  Camera: 'Camera',
  useCameraDevice: () => ({ id: 'back' }),
  useCameraPermission: () => ({ requestPermission: jest.fn().mockResolvedValue(true) }),
}));


global.__mockNavigate = mockNavigate;
global.__mockReplace = mockReplace;
global.__mockGoBack = mockGoBack;
global.__mockRouteParams = mockRouteParams;
