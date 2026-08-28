// src/components/SignatureCapture.tsx
//
// The signature canvas, extracted for reuse by Support Services. Carries
// forward BOTH hard-won fixes from MaintenanceFormScreen verbatim —
// these are not cosmetic and re-deriving them from scratch on the new
// screen would have reintroduced both bugs:
//
// 1. STROKES RENDER AS DISCONNECTED DOTS. The canvas sits inside a
//    ScrollView, whose pan responder steals the touch mid-stroke, so
//    only touchstart/touchend ever reach the canvas. onBegin/onEnd
//    report drawing state up so the parent can disable scrolling for
//    exactly the duration of a stroke.
// 2. A DRAWN SIGNATURE NEVER GETS CAPTURED. react-native-signature-canvas
//    only converts strokes to data when readSignature() is explicitly
//    called. Without the onEnd call below, a technician could draw a
//    perfectly valid signature and still be told one is required.
//    Calling it on every stroke end keeps the value continuously current
//    with no separate "confirm" step to remember.
//
// Also carries the clear-button subtlety: clearSignature() only wipes the
// visual canvas, so the captured value has to be nulled alongside it or a
// technician who draws, clears, then reconsiders would silently submit
// the old signature under an empty-looking canvas.
import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import SignatureScreen, { SignatureViewRef } from "react-native-signature-canvas";
import { useAppTheme } from "@/theme";
import { Palette } from "@/theme/palettes";

interface Props {
  label?: string;
  /** Base64 PNG data URL, or null. Owned by the parent. */
  value: string | null;
  onChange: (value: string | null) => void;
  /** Parent must use this to set `scrollEnabled={!drawing}` on the
   *  enclosing ScrollView — see fix #1 above. */
  onDrawingChange: (drawing: boolean) => void;
}

export function SignatureCapture({ label, value, onChange, onDrawingChange }: Props) {
  const { theme } = useAppTheme();
  const styles = createStyles(theme);
  const ref = React.useRef<SignatureViewRef>(null);

  return (
    <>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.sigBox}>
        <SignatureScreen
          ref={ref}
          onOK={(base64: string) => onChange(base64)}
          onBegin={() => onDrawingChange(true)}
          onEnd={() => {
            onDrawingChange(false);
            ref.current?.readSignature();
          }}
          descriptionText=""
          webStyle="body,html{background:#fff;}"
        />
      </View>
      <Pressable
        style={styles.secondaryButton}
        onPress={() => {
          ref.current?.clearSignature();
          onChange(null);
        }}
      >
        <Text style={styles.secondaryButtonText}>
          {value ? "Clear Signature" : "Clear"}
        </Text>
      </Pressable>
    </>
  );
}

function createStyles(theme: Palette) {
  return StyleSheet.create({
    label: { fontWeight: "600", color: theme.mutedForeground, fontSize: 13 },
    sigBox: {
      height: 220,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: theme.radius,
      overflow: "hidden",
      backgroundColor: "#fff",
    },
    secondaryButton: {
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: theme.radius,
      paddingVertical: 12,
      backgroundColor: theme.card,
    },
    secondaryButtonText: { color: theme.foreground, fontWeight: "600" },
  });
}
