import { render, screen } from '@testing-library/react';
import Home from './page';

describe('Home page', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('renders the greeting fetched from the API', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'Hello from the API' }),
    }) as unknown as typeof fetch;

    // Home is an async Server Component, so await it to get the element tree.
    render(await Home());

    expect(
      screen.getByRole('heading', { name: /frontend \+ backend connected/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('Decode Academy Demo')).toBeInTheDocument();
    expect(screen.getByText('Hello from the API')).toBeInTheDocument();
  });

  it('shows an error message when the API is unreachable', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

    render(await Home());

    expect(screen.getByText(/backend unreachable/i)).toBeInTheDocument();
    expect(screen.getByText(/could not reach the api/i)).toBeInTheDocument();
  });
});
