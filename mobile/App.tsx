import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./src/AuthContext";
import { BrandMark } from "./src/components/BrandMark";
import { DeskWebScreen } from "./src/screens/DeskWebScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { colors } from "./src/theme";

const Stack = createNativeStackNavigator();

function Root() {
  const { ready, user } = useAuth();
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <BrandMark variant="emblem" />
        <Text style={{ marginTop: 12, color: colors.muted }}>Starting T2S...</Text>
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerTintColor: colors.brand, headerTitleStyle: { fontWeight: "800" } }}>
      {user ? (
        <Stack.Screen
          name="Desk"
          component={DeskWebScreen}
          options={{ headerShown: false, title: user.role === "admin" ? "Admin Algo" : "Member desk" }}
        />
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <NavigationContainer>
            <StatusBar style="dark" />
            <Root />
          </NavigationContainer>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
