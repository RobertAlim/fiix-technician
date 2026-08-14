// src/screens/RegistrationScreen.tsx
//
// Mirrors app/(root)/registration/page.tsx exactly: send OTP to contactNo
// -> verify it -> save profile. Saving a profile does NOT activate the
// account — isActive stays false until an Admin approves it.
import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useApi } from "@/hooks/useApi";
import { useAppTheme } from "@/theme";
import { Palette } from "@/theme/palettes";

export function RegistrationScreen() {
  const { theme } = useAppTheme();
  const styles = createStyles(theme);
  const api = useApi();
  const queryClient = useQueryClient();
  const [middleName, setMiddleName] = useState("");
  const [birthday, setBirthday] = useState("");
  const [contactNo, setContactNo] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const sendOtp = async () => {
    setError(null);
    setLoading(true);
    try {
      await api.post("/api/send-otp", { phone: contactNo });
      setOtpSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error sending OTP");
    } finally {
      setLoading(false);
    }
  };

  const verifyAndSave = async () => {
    setError(null);
    setLoading(true);
    try {
      await api.post("/api/verify-otp", { phone: contactNo, otp: otpCode });
      await api.post("/api/save-profile", { middleName, birthday, contactNo });
      await queryClient.invalidateQueries({ queryKey: ["user-status"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving profile");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Complete your profile</Text>
      <TextInput
        style={styles.input}
        placeholder="Middle name"
        placeholderTextColor={theme.mutedForeground}
        value={middleName}
        onChangeText={setMiddleName}
      />
      <TextInput
        style={styles.input}
        placeholder="Birthday (YYYY-MM-DD)"
        placeholderTextColor={theme.mutedForeground}
        value={birthday}
        onChangeText={setBirthday}
      />
      <TextInput
        style={styles.input}
        placeholder="Contact number"
        placeholderTextColor={theme.mutedForeground}
        keyboardType="phone-pad"
        value={contactNo}
        onChangeText={setContactNo}
        editable={!otpSent}
      />
      {!otpSent ? (
        <Pressable style={styles.button} onPress={sendOtp} disabled={loading}>
          {loading ? <ActivityIndicator color={theme.primaryForeground} /> : <Text style={styles.buttonText}>Send OTP</Text>}
        </Pressable>
      ) : (
        <>
          <TextInput
            style={styles.input}
            placeholder="Enter OTP"
            placeholderTextColor={theme.mutedForeground}
            keyboardType="number-pad"
            value={otpCode}
            onChangeText={setOtpCode}
          />
          <Pressable style={styles.button} onPress={verifyAndSave} disabled={loading}>
            {loading ? (
              <ActivityIndicator color={theme.primaryForeground} />
            ) : (
              <Text style={styles.buttonText}>Verify & Save</Text>
            )}
          </Pressable>
        </>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function createStyles(theme: Palette) {
  return StyleSheet.create({
    container: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: theme.background },
    title: { fontSize: 20, fontWeight: "700", marginBottom: 24, textAlign: "center", color: theme.foreground },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: theme.radius,
      padding: 12,
      marginBottom: 12,
      color: theme.foreground,
      backgroundColor: theme.card,
    },
    button: {
      backgroundColor: theme.primary,
      borderRadius: theme.radius,
      paddingVertical: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    buttonText: { color: theme.primaryForeground, fontWeight: "700", fontSize: 16 },
    error: { color: theme.destructive, marginTop: 8, textAlign: "center" },
  });
}
