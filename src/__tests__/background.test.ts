describe("background", () => {
  it("opens the options page when it receives an OPEN_OPTIONS_PAGE message", async () => {
    const openOptionsPage = vi.fn();
    let listener: (message: unknown) => void = () => {};

    globalThis.chrome = {
      runtime: {
        openOptionsPage,
        onMessage: {
          addListener: vi.fn((cb) => {
            listener = cb;
          }),
        },
      },
    } as any;

    await import("../background");

    expect(globalThis.chrome.runtime.onMessage.addListener).toHaveBeenCalledTimes(1);

    listener({ type: "OPEN_OPTIONS_PAGE" });
    expect(openOptionsPage).toHaveBeenCalledTimes(1);

    listener({ type: "SOME_OTHER_MESSAGE" });
    expect(openOptionsPage).toHaveBeenCalledTimes(1);
  });
});
