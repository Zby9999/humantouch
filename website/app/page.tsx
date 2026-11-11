export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-4 px-6">
      <h1 className="text-5xl font-semibold tracking-tight">Human Touch</h1>
      <p className="text-lg text-neutral-600">
        An editor layer for your project&apos;s local dev server: edit the page itself, visually, on a canvas, then have your Agent write the changes into the code.
      </p>
    </main>
  );
}
