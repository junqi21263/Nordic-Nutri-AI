import Taro from "@tarojs/taro";
import { cloudbaseEnvironment } from "../lib/cloudbase";
import type { CloudbaseTicketResponse } from "../auth/cloudbase-ticket-login";

type TicketErrorPayload = { code?: unknown };

function isTicketResponse(value: unknown): value is CloudbaseTicketResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { ticket?: unknown; identityProof?: unknown };
  return typeof candidate.ticket === "string" && Boolean(candidate.ticket)
    && typeof candidate.identityProof === "string" && Boolean(candidate.identityProof);
}

function readErrorCode(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as TicketErrorPayload;
  return typeof payload.code === "string" ? payload.code : null;
}

export async function requestCloudbaseLoginTicket(code: string): Promise<CloudbaseTicketResponse> {
  const response = await Taro.request<unknown>({
    url: cloudbaseEnvironment.ticketEndpoint,
    method: "POST",
    header: { "content-type": "application/json" },
    data: { code },
  });

  if (response.statusCode !== 200 || !isTicketResponse(response.data)) {
    const error = new Error("CloudBase ticket request failed");
    error.name = readErrorCode(response.data) ?? "CloudbaseTicketRequestError";
    throw error;
  }
  return response.data;
}
