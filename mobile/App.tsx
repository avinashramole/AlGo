import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { HybridDeskScreen } from "./src/screens/HybridDeskScreen";

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <HybridDeskScreen />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
