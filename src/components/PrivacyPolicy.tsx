export function PrivacyPolicy() {
  return (
    <div className="w-full max-w-3xl mx-auto p-8 rounded-2xl bg-zinc-900/60 border border-zinc-800 text-left text-zinc-300 space-y-6 text-sm">
      <h2 className="text-2xl font-bold text-white">Privacy Policy</h2>
      <p className="text-xs text-zinc-400">Last updated: September 2026</p>

      <section className="space-y-2">
        <h3 className="text-base font-semibold text-zinc-100">1. Zero-Upload Architecture</h3>
        <p>
          1into1 operates on a local-first, zero-knowledge architecture. All document and image
          operations (including compression, conversion, optical character recognition, merging, and
          signing) are executed entirely inside your browser using client-side WebAssembly and Web
          Workers.
        </p>
        <p className="text-emerald-400 font-medium">
          Your files never touch our servers or any third-party infrastructure.
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="text-base font-semibold text-zinc-100">2. Analytics & Tracking</h3>
        <p>
          We do not track, profile, or log your document contents. We do not use third-party behavioral
          tracking scripts, telemetry pixels, or intrusive tracking cookies.
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="text-base font-semibold text-zinc-100">3. Payment Processing</h3>
        <p>
          Pro upgrades and billing transactions are processed securely by Lemon Squeezy (our Merchant
          of Record). We do not store or process credit card numbers on our servers.
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="text-base font-semibold text-zinc-100">4. Local Storage</h3>
        <p>
          We only store your Pro activation status and license validation hash locally in your
          browser's <code className="text-zinc-200 bg-zinc-800 px-1 py-0.5 rounded">localStorage</code>{' '}
          to retain your unlocked features across sessions.
        </p>
      </section>
    </div>
  );
}