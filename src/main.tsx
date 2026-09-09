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

if (typeof window !== "undefined" && "serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => {
      for (const reg of regs) reg.unregister();
    });
    caches.keys().then(keys => {
      for (const k of keys) caches.delete(k);
    });
  }
  // @ts-ignore
  void registerSW;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
