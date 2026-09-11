import { refreshLicense } from './utils/license';
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import * as pdfjsLib from "pdfjs-dist";
import App from "./App.tsx";
import "./index.css";
import { registerSW } from "virtual:pwa-register";

if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  registerSW({ immediate: true });
}

void refreshLicense();
window.addEventListener('online', () => { void refreshLicense(); });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
