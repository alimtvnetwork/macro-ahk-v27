import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { attachClickTrail } from "./lib/click-trail";

attachClickTrail();

createRoot(document.getElementById("root")!).render(<App />);
