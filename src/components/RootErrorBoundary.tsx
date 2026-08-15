// src/components/RootErrorBoundary.tsx
//
// Added specifically because a release/preview EAS build has no red-box
// error screen the way dev-client testing does — an uncaught error during
// initial render in production mode just renders nothing, which is
// exactly what a "black screen on every device, reproducible" report
// looks like from the outside. There's no way to tell "crashed" apart
// from "hung" apart from "rendered but is literally black" without this.
//
// Deliberately a class component — componentDidCatch is the ONLY React
// API that can catch a render-time error in a subtree; there's no hooks
// equivalent, and this is exactly the "wrap the whole app" case that
// exists for.
import React from "react";
import { View, Text, ScrollView, StyleSheet, Pressable } from "react-native";

interface Props {
  children: React.ReactNode;
}
interface State {
  error: Error | null;
}

export class RootErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // console output isn't visible in a release build without a device
    // log tool attached, but this costs nothing to keep and helps anyone
    // debugging via `adb logcat` later.
    console.error("[RootErrorBoundary] caught:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.title}>Something went wrong on startup</Text>
          <Text style={styles.message}>{this.state.error.message}</Text>
          {this.state.error.stack ? (
            <Text style={styles.stack}>{this.state.error.stack}</Text>
          ) : null}
        </ScrollView>
        <Pressable style={styles.button} onPress={() => this.setState({ error: null })}>
          <Text style={styles.buttonText}>Try Again</Text>
        </Pressable>
      </View>
    );
  }
}

// Plain hardcoded colors, not the app's theme system — this has to render
// correctly even if the crash happened INSIDE ThemeProvider itself, so it
// can't depend on any app context being available.
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#010d16", paddingTop: 60, paddingHorizontal: 20 },
  scrollContent: { paddingBottom: 24 },
  title: { color: "#ff5c82", fontSize: 18, fontWeight: "700", marginBottom: 12 },
  message: { color: "#e4f3ea", fontSize: 14, marginBottom: 16 },
  stack: { color: "#6ebfb9", fontSize: 11, fontFamily: "monospace" },
  button: {
    backgroundColor: "#00bb90",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 24,
  },
  buttonText: { color: "#010d16", fontWeight: "700", fontSize: 16 },
});
