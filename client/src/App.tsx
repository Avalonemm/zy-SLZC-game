import { ConnectionPage } from "./pages/ConnectionPage";
import { AudioProvider } from "./audio/AudioProvider";

export function App() {
  return (
    <AudioProvider>
      <ConnectionPage />
    </AudioProvider>
  );
}
