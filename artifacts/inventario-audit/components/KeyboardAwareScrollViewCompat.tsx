import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from "react-native";
import type { ScrollViewProps } from "react-native";

type Props = ScrollViewProps & {
  keyboardShouldPersistTaps?: "always" | "handled" | "never";
};

export function KeyboardAwareScrollViewCompat({
  children,
  keyboardShouldPersistTaps = "handled",
  style,
  contentContainerStyle,
  ...props
}: Props) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.flex}
    >
      <ScrollView
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        style={[styles.flex, style]}
        contentContainerStyle={contentContainerStyle}
        {...props}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
