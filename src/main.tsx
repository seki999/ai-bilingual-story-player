import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<App />);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  void navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`)
    .catch(() => {});
}
