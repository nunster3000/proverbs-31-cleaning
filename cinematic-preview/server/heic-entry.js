import { heicTo } from 'heic-to/csp';
// Loaded only after an HEIC/HEIF selection. Conversion stays on this device.
window.P31ConvertHEIC = file => heicTo({ blob: file, type: 'image/jpeg', quality: 0.88 });
