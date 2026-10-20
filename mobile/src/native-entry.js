import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';

const CallerId = registerPlugin('CallerId');
const AttachmentViewer = registerPlugin('AttachmentViewer');
const NikaraPrint = registerPlugin('NikaraPrint');

window.NativeBridge = {
  isNative: Capacitor.isNativePlatform(),
  App,
  LocalNotifications,
  CallerId,
  AttachmentViewer,
  NikaraPrint,
};
