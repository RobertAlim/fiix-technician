// src/navigation/AppTabs.tsx
//
// Technician's only two web modules plus Profile. Maintenance is gated
// behind on-duty status here — a requirement specific to this app, not
// present on web. Blocked via a tabPress listener rather than removing
// the tab entirely, so a Technician can still see it exists and gets a
// clear reason instead of it silently disappearing.
import React from "react";
import { Alert } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";

import { useApi } from "@/hooks/useApi";
import { useAppTheme } from "@/theme";
import { DashboardScreen } from "@/screens/DashboardScreen";
import { MaintenanceListScreen } from "@/screens/MaintenanceListScreen";
import { ProfileScreen } from "@/screens/ProfileScreen";

export type AppTabsParamList = {
  Dashboard: undefined;
  Maintenance: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<AppTabsParamList>();

interface AttendanceStatusMin {
  session: { timeOut: string | null } | null;
}

export function AppTabs() {
  const { theme } = useAppTheme();
  const api = useApi();
  const statusQuery = useQuery({
    queryKey: ["attendance-status"],
    queryFn: () => api.get<AttendanceStatusMin>("/api/attendance/status"),
    refetchInterval: 60_000,
  });
  const onDuty = !!statusQuery.data?.session && !statusQuery.data.session.timeOut;

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: theme.card },
        headerTitleStyle: { color: theme.foreground },
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: theme.card, borderTopColor: theme.border },
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.mutedForeground,
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Feather name="home" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Maintenance"
        component={MaintenanceListScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Feather name="tool" size={size} color={color} />,
          tabBarActiveTintColor: onDuty ? theme.primary : theme.mutedForeground,
          tabBarInactiveTintColor: onDuty ? theme.mutedForeground : theme.border,
        }}
        listeners={{
          tabPress: (e) => {
            if (!onDuty) {
              e.preventDefault();
              Alert.alert(
                "Time in required",
                "Maintenance reports are only available while you're clocked in. Time in from the Dashboard tab first."
              );
            }
          },
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Feather name="user" size={size} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}
