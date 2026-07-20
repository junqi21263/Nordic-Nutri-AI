export interface CloudbaseTicketResponse {
  ticket: string;
  identityProof: string;
}

export interface CloudbaseTicketLoginResult<User = { id: string }, Session = unknown> {
  session: Session;
  user: User;
  identityProof: string;
}

export interface CloudbaseTicketLoginDependencies<User = { id: string }, Session = unknown> {
  wxLogin: () => Promise<{ code?: string }>;
  requestTicket: (code: string) => Promise<CloudbaseTicketResponse>;
  signInWithCustomTicket: (ticket: string) => Promise<{ session: Session; user: User }>;
}

export function createCloudbaseTicketLogin<User = { id: string }, Session = unknown>(
  dependencies: CloudbaseTicketLoginDependencies<User, Session>,
) {
  let inFlight: Promise<CloudbaseTicketLoginResult<User, Session>> | null = null;

  const login = () => {
    if (!inFlight) {
      inFlight = (async () => {
        const wechatLogin = await dependencies.wxLogin();
        if (!wechatLogin.code) throw new Error("WeChat login code is missing");

        const ticketResponse = await dependencies.requestTicket(wechatLogin.code);
        if (!ticketResponse.ticket || !ticketResponse.identityProof) {
          throw new Error("CloudBase ticket response is invalid");
        }

        const signedIn = await dependencies.signInWithCustomTicket(ticketResponse.ticket);
        return { ...signedIn, identityProof: ticketResponse.identityProof };
      })().finally(() => { inFlight = null; });
    }
    return inFlight;
  };

  return login;
}
