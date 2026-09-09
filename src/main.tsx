import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import * as pdfjsLib from "pdfjs-dist";
import App from "./App.tsx";
import "./index.css";
import { registerSW } from "virtual:pwa-register";

// Polyfill 1: Map.prototype.getOrInsertComputed (fixes iOS Safari PDF.js v4 crash)
if (typeof Map !== "undefined" && !(Map.prototype as any).getOrInsertComputed) {
  (Map.prototype as any).getOrInsertComputed = function (key: any, callback: () => any) {
    if (this.has(key)) return this.get(key);
    const value = callback();
    this.set(key, value);
    return value;
  };
}

// Polyfill 2: Promise.withResolvers (safeguard for iOS 16/17 WebKit)
if (typeof (Promise as any).withResolvers === "undefined") {
  (Promise as any).withResolvers = function () {
    let resolve: any, reject: any;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

// Zero-Worker Architecture: Runs synchronously in-engine, bypassing iOS Worker sandboxes
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  (pdfjsLib.GlobalWorkerOptions as any).workerSrc = "";
  delete (pdfjsLib.GlobalWorkerOptions as any).workerPort;
}

registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
