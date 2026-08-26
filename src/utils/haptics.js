export const triggerHaptic = () => {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    // Only fires on Android/supported devices, avoiding iOS Safari issues
    navigator.vibrate(50); 
  }
};
