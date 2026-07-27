// Same shape the backend returns from GET /api/hello (backend is the source
// of truth for this contract - see backend/src/app.service.ts).
interface HelloResponse {
  message: string;
}

async function getHello(): Promise<HelloResponse> {
  const baseUrl = process.env.BACKEND_URL ?? 'http://localhost:3000';
  // no-store: always hit the API so the page reflects the live backend.
  const res = await fetch(`${baseUrl}/api/hello`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`API responded with ${res.status}`);
  }
  return res.json();
}

// Async Server Component: the fetch runs on the server at request time, so
// there is no CORS involved and no client-side loading state to manage.
export default async function Home() {
  let message: string;
  let reachable = true;

  try {
    const data = await getHello();
    message = data.message;
  } catch {
    reachable = false;
    message = 'Could not reach the API. Is the backend running on port 3000?';
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24 text-center">
      <span className="rounded-full border border-black/10 px-3 py-1 text-sm font-medium text-zinc-600 dark:border-white/15 dark:text-zinc-400">
        Decode Academy Demo
      </span>
      <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
        Frontend + Backend connected 🎉
      </h1>
      <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
        {reachable ? 'Message fetched from the NestJS API:' : 'Backend unreachable:'}
      </p>
      <p
        className={`max-w-md rounded-lg border px-4 py-3 font-mono text-base ${
          reachable
            ? 'border-black/10 bg-black/5 dark:border-white/15 dark:bg-white/10'
            : 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400'
        }`}
      >
        {message}
      </p>
    </main>
  );
}
