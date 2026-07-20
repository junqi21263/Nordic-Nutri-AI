import { describe, expect, it, vi } from "vitest";
import { createCloudbaseTicketLogin } from "../src/auth/cloudbase-ticket-login";

describe("CloudBase Custom Ticket login", () => {
  it("exchanges a fresh WeChat code for a ticket and establishes a CloudBase session", async () => {
    const requestTicket = vi.fn().mockResolvedValue({
      ticket: "ticket-123",
      identityProof: "identity-proof-123",
    });
    const signInWithCustomTicket = vi.fn().mockResolvedValue({
      session: { access_token: "access-token", user: { id: "cloudbase-user" } },
      user: { id: "cloudbase-user" },
    });
    const login = createCloudbaseTicketLogin({
      wxLogin: vi.fn().mockResolvedValue({ code: "wx-code" }),
      requestTicket,
      signInWithCustomTicket,
    });

    await expect(login()).resolves.toEqual({
      session: { access_token: "access-token", user: { id: "cloudbase-user" } },
      user: { id: "cloudbase-user" },
      identityProof: "identity-proof-123",
    });
    expect(requestTicket).toHaveBeenCalledWith("wx-code");
    expect(signInWithCustomTicket).toHaveBeenCalledWith("ticket-123");
  });

  it("does not call the ticket service when WeChat does not return a code", async () => {
    const requestTicket = vi.fn();
    const login = createCloudbaseTicketLogin({
      wxLogin: vi.fn().mockResolvedValue({}),
      requestTicket,
      signInWithCustomTicket: vi.fn(),
    });

    await expect(login()).rejects.toThrow("WeChat login code is missing");
    expect(requestTicket).not.toHaveBeenCalled();
  });
});
