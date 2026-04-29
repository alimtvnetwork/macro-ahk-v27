import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect } from "react";
import { ThemeProvider } from "./components/theme/ThemeProvider";
import { ErrorBoundary } from "./components/ErrorBoundary";
import Popup from "./pages/Popup";
import Options from "./pages/Options";
import NotFound from "./pages/NotFound";

/**
 * Redirect helper for the retired standalone Step-Group pages
 * (`/step-groups`, `/step-groups/list`). The panels now live inside the
 * Options shell and are addressable via hash deep-links so that any
 * shared bookmark, in-app `<Link>`, or external doc keeps working
 * without a 404. We do this in an effect (instead of `<Navigate to>`)
 * because React Router strips the hash from `to`, which is exactly
 * what Options reads to pick the sub-view.
 */
function HashRedirect({ hash }: { hash: string }) {
  useEffect(() => {
    window.location.replace(`/#${hash}`);
  }, [hash]);
  return null;
}

export default function App() {
  return (
    <ThemeProvider>
      <ErrorBoundary section="App Root">
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Options />} />
            <Route path="/step-groups" element={<HashRedirect hash="step-groups" />} />
            <Route path="/step-groups/list" element={<HashRedirect hash="step-groups-list" />} />
            <Route path="/popup" element={<Popup />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </ErrorBoundary>
    </ThemeProvider>
  );
}
