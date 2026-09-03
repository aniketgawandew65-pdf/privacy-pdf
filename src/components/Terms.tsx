export function Terms() {
  return (
    <div className="w-full max-w-3xl mx-auto p-8 rounded-2xl bg-zinc-900/60 border border-zinc-800 text-left text-zinc-300 space-y-6 text-sm">
      <h2 className="text-2xl font-bold text-white">Terms of Service</h2>
      <p className="text-xs text-zinc-400">Last updated: September 2026</p>

      <section className="space-y-2">
        <h3 className="text-base font-semibold text-zinc-100">1. Permitted Use</h3>
        <p>
          You agree to use 1into1 tools only for lawful purposes. You must own or possess the
          legal authorization to manipulate, unlock, decrypt, or process any files you load into
          the application.
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="text-base font-semibold text-zinc-100">2. Disclaimer of Warranties</h3>
        <p>
          All tools and algorithms are provided "as is" without warranty of any kind. Because processing
          occurs locally inside your hardware memory, performance depends entirely on your device's
          available RAM and CPU capabilities.
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="text-base font-semibold text-zinc-100">3. Purchases & Refunds</h3>
        <p>
          Pro subscriptions and digital licenses are governed by the refund terms and policies
          provided at checkout via Lemon Squeezy.
        </p>
      </section>
    </div>
  );
}