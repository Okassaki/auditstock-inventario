import { useEffect, useRef } from "react";
import { Animated, Keyboard, Platform } from "react-native";

/**
 * Returns an Animated.Value tracking the on-screen keyboard height.
 * - iOS: uses keyboardWillShow/Hide for smooth pre-animation
 * - Android: uses keyboardDidShow/Hide (no "will" events available)
 */
export function useKeyboardAnimatedHeight(): Animated.Value {
  const keyboardHeight = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const duration = Platform.OS === "ios" ? 250 : 120;

    const show = Keyboard.addListener(showEvent, (e) => {
      Animated.timing(keyboardHeight, {
        toValue: e.endCoordinates.height,
        duration,
        useNativeDriver: false,
      }).start();
    });

    const hide = Keyboard.addListener(hideEvent, () => {
      Animated.timing(keyboardHeight, {
        toValue: 0,
        duration,
        useNativeDriver: false,
      }).start();
    });

    return () => {
      show.remove();
      hide.remove();
    };
  }, [keyboardHeight]);

  return keyboardHeight;
}
