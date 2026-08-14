// src/screens/UnsupportedRoleScreen.tsx
//
// This app is Technician-only by requirement — Admin/Scheduler continue
// using the web app.
import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useAuth } from "@clerk/expo";
import { useAppTheme } from "@/theme";
import { Palette } from "@/theme/palettes";

export function UnsupportedRoleScreen({ role }: { role: string | null }) {
  const { theme } = useAppTheme();
  const styles = createStyles(theme);
  const { signOut } = useAuth();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>This app is for Technicians only</Text>
      <Text style={styles.body}>
        {role
          ? `Your account role is "${role}". Please use the Fiix web app instead.`
          : "Please use the Fiix web app instead."}
      </Text>
      <Pressable style={styles.button} onPress={() => signOut()}>
        <Text style={styles.buttonText}>Sign Out</Text>
      </Pressable>
    </View>
  );
}

function createStyles(theme: Palette) {
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      gap: 16,
      backgroundColor: theme.background,
    },
    title: { fontSize: 18, fontWeight: "700", textAlign: "center", color: theme.foreground },
    body: { textAlign: "center", color: theme.mutedForeground },
    button: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: theme.radius,
      paddingVertical: 10,
      paddingHorizontal: 24,
      marginTop: 8,
    },
    buttonText: { color: theme.foreground, fontWeight: "600" },
  });
}
