import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { ServiceWorkerRegistrar } from "./service-worker";

type Listener = (ev?: unknown) => void;

function fakeWorker(state: string) {
  const listeners = new Map<string, Listener[]>();
  return {
    state,
    postMessage: vi.fn(),
    addEventListener: (t: string, l: Listener) =>
      listeners.set(t, [...(listeners.get(t) ?? []), l]),
    emit: (t: string) => (listeners.get(t) ?? []).forEach((l) => l()),
  };
}

function installServiceWorker(opts: {
  waiting?: ReturnType<typeof fakeWorker>;
  controlled: boolean;
}) {
  const reg = {
    waiting: opts.waiting ?? null,
    installing: null as null | ReturnType<typeof fakeWorker>,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  const sw = {
    controller: opts.controlled ? {} : null,
    register: vi.fn(async () => reg),
    addEventListener: vi.fn(),
  };
  Object.defineProperty(navigator, "serviceWorker", { value: sw, configurable: true });
  return { sw, reg };
}

afterEach(() => {
  vi.unstubAllEnvs();
  // @ts-expect-error test cleanup
  delete navigator.serviceWorker;
});

describe("ServiceWorkerRegistrar update prompt", () => {
  it("registers nothing in development: the service worker is off outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    const { sw } = installServiceWorker({ controlled: true });
    renderWithProviders(<ServiceWorkerRegistrar />);
    expect(sw.register).not.toHaveBeenCalled();
    expect(screen.queryByText(/new version is available/i)).not.toBeInTheDocument();
  });

  it("shows the prompt when an update is already waiting", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const waiting = fakeWorker("installed");
    const { sw } = installServiceWorker({ waiting, controlled: true });
    renderWithProviders(<ServiceWorkerRegistrar />);
    expect(sw.register).toHaveBeenCalledWith("/sw.js", expect.objectContaining({ scope: "/" }));
    expect(await screen.findByText("A new version is available")).toBeInTheDocument();
  });

  it("does not show the prompt on a first install (nothing controls the page yet)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    installServiceWorker({ waiting: fakeWorker("installed"), controlled: false });
    renderWithProviders(<ServiceWorkerRegistrar />);
    await waitFor(() => expect(navigator.serviceWorker.register).toHaveBeenCalled());
    expect(screen.queryByText("A new version is available")).not.toBeInTheDocument();
  });

  it("sends SKIP_WAITING only when the user accepts, and waits for the new worker to take over", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const waiting = fakeWorker("installed");
    installServiceWorker({ waiting, controlled: true });
    renderWithProviders(<ServiceWorkerRegistrar />);
    expect(waiting.postMessage).not.toHaveBeenCalled(); // no automatic takeover
    fireEvent.click(await screen.findByRole("button", { name: "Refresh now" }));
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    const addListener = navigator.serviceWorker.addEventListener as unknown as ReturnType<
      typeof vi.fn
    >;
    expect(addListener).toHaveBeenCalledWith("controllerchange", expect.any(Function), {
      once: true,
    });
  });

  it("shows the prompt when a worker finishes installing during the session", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const installing = fakeWorker("installing");
    const { reg } = installServiceWorker({ controlled: true });
    renderWithProviders(<ServiceWorkerRegistrar />);
    await waitFor(() =>
      expect(reg.addEventListener).toHaveBeenCalledWith("updatefound", expect.any(Function)),
    );
    const onFound = reg.addEventListener.mock.calls.find(
      (c) => c[0] === "updatefound",
    )?.[1] as () => void;
    reg.installing = installing;
    act(() => {
      onFound();
    });
    installing.state = "installed";
    act(() => installing.emit("statechange"));
    expect(await screen.findByText("A new version is available")).toBeInTheDocument();
  });
});
