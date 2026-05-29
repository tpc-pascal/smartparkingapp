import { requireNativeComponent } from 'react-native';

interface NativeCameraProps {
  style?: object;
  zoom?: number;
  onSnapshot?: (event: any) => void;
  onPlateRecognized?: (event: any) => void;
}

const LicensePlateCamera = requireNativeComponent<NativeCameraProps>('LicensePlateCamera');

export default LicensePlateCamera;
