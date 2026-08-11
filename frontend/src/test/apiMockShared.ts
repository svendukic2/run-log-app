// The one fake-Response factory both API mocks mint through (review fix:
// it existed as two byte-identical copies). If the fake ever needs another
// field - a headers stub, a text() - it grows here for every mock at once.
export function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}
