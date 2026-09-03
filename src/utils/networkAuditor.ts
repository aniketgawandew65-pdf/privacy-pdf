type NetworkListener = (bytesSent: number, requestCount: number) => void;

class NetworkAuditor {
  private static instance: NetworkAuditor;
  private bytesSent: number = 0;
  private requestCount: number = 0;
  private listeners: Set<NetworkListener> = new Set();
  private isInitialized: boolean = false;

  private constructor() {}

  public static getInstance(): NetworkAuditor {
    if (!NetworkAuditor.instance) {
      NetworkAuditor.instance = new NetworkAuditor();
    }
    return NetworkAuditor.instance;
  }

  public init(): void {
    if (this.isInitialized || typeof window === 'undefined') return;
    this.isInitialized = true;

    // 1. Intercept Fetch API
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const [, init] = args;
      let payloadSize = 0;

      if (init?.body) {
        payloadSize = this.calculateBodySize(init.body);
      }

      this.recordTransmission(payloadSize);
      return originalFetch.apply(window, args);
    };

    // 2. Intercept XMLHttpRequest
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    const self = this;

    XMLHttpRequest.prototype.open = function (...args: unknown[]) {
      return originalOpen.apply(this, args as Parameters<typeof originalOpen>);
    };

    XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
      if (body) {
        self.recordTransmission(self.calculateBodySize(body));
      } else {
        self.recordTransmission(0);
      }
      return originalSend.apply(this, [body]);
    };

    // 3. Intercept Navigator.sendBeacon
    if (navigator.sendBeacon) {
      const originalSendBeacon = navigator.sendBeacon;
      navigator.sendBeacon = (url: string | URL, data?: BodyInit | null) => {
        if (data) {
          this.recordTransmission(this.calculateBodySize(data));
        }
        return originalSendBeacon.apply(navigator, [url, data]);
      };
    }
  }

  private calculateBodySize(body: unknown): number {
    try {
      if (typeof body === 'string') return new Blob([body]).size;
      if (body instanceof Blob) return body.size;
      if (body instanceof FormData) {
        let total = 0;
        body.forEach((value) => {
          if (typeof value === 'string') total += new Blob([value]).size;
          else if (value instanceof Blob) total += value.size;
        });
        return total;
      }
      if (body instanceof ArrayBuffer) return body.byteLength;
      return 0;
    } catch {
      return 0;
    }
  }

  private recordTransmission(bytes: number): void {
    this.bytesSent += bytes;
    this.requestCount += 1;
    this.notify();
  }

  public subscribe(listener: NetworkListener): () => void {
    this.listeners.add(listener);
    listener(this.bytesSent, this.requestCount);
    return () => this.listeners.delete(listener);
  }

  public getStats(): { bytesSent: number; requestCount: number } {
    return { bytesSent: this.bytesSent, requestCount: this.requestCount };
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener(this.bytesSent, this.requestCount));
  }
}

export const networkAuditor = NetworkAuditor.getInstance();