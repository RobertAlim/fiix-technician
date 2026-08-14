// src/screens/ScanQRScreen.tsx
//
// Mirrors app/(root)/scan-qrcode + components/ScanQRCodeModalContent.tsx:
// scan a printer's QR code (which encodes its serial number) and hand the
// decoded value back to whichever screen asked for it. Web's version reads
// a `callingPage` query param to theme the icon (Replace vs Wrench) — kept
// as an optional nav param for the same purpose, defaulted to the wrench
// icon since MaintenanceListScreen (the only caller so far) doesn't set it.
import React, { useState, useRef } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { CameraView, useCameraPermissions, BarcodeScanningResult } from "expo-camera";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { emitScan } from "@/lib/scan-bridge";
import { useAppTheme } from "@/theme";
import { Palette } from "@/theme/palettes";
import { RootStackParamList } from "@/navigation/RootNavigator";

type ScanRoute = RouteProp<RootStackParamList, "ScanQR">;

export function ScanQRScreen() {
  const { theme } = useAppTheme();
  const styles = createStyles(theme);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<ScanRoute>();
  const [permission, requestPermission] = useCameraPermissions();
  const scanLocked = useRef(false);

  const onScan = (result: BarcodeScanningResult) => {
    if (scanLocked.current) return;
    scanLocked.current = true;
    emitScan(result.data);
    navigation.goBack();
  };

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.body}>Camera access is needed to scan a printer's QR code.</Text>
        <Pressable style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={onScan}
      />
      <View style={styles.frame} pointerEvents="none" />
      <Text style={styles.hint}>Point the camera at the printer's QR code</Text>
    </View>
  );
}

function createStyles(theme: Palette) {
  return StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12, backgroundColor: theme.background },
  body: { textAlign: "center", color: theme.mutedForeground },
  button: {
    backgroundColor: theme.primary,
    borderRadius: theme.radius,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  buttonText: { color: theme.primaryForeground, fontWeight: "700" },
  frame: {
    position: "absolute",
    width: 240,
    height: 240,
    borderWidth: 2,
    borderColor: theme.primary,
    borderRadius: theme.radius,
  },
  hint: {
    position: "absolute",
    bottom: 32,
    color: "#fff",
    backgroundColor: "rgba(1,13,22,0.75)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius,
  },
  });
}
