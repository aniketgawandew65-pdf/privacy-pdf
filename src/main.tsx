import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import * as pdfjsLib from "pdfjs-dist";
import App from "./App.tsx";
import "./index.css";
import { registerSW } from "virtual:pwa-register";

// Inline blob worker: immune to Cloudflare MIME types, PWA caching, and WebKit classic worker bugs
if (typeof window !== "undefined") {
  try {
    const workerBlob = new Blob(
      ['importScripts("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + pdfjsLib.version + '/pdf.worker.min.js");'],
      { type: "application/javascript" }
    );
    pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(workerBlob);
  } catch {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/" + pdfjsLib.version + "/pdf.worker.min.js";
  }
}

registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
