type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type MailpitClientOptions = {
  baseUrl: string;
  username: string;
  password: string;
  fetcher?: FetchLike;
};

type MailpitListParams = {
  start?: number;
  limit?: number;
};

type MailpitSearchParams = MailpitListParams & {
  query: string;
};

type MailpitSendParams = {
  from_email: string;
  from_name?: string;
  to_email: string;
  to_name?: string;
  subject: string;
  text: string;
  html?: string;
};

export class MailpitRequestError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

function buildBasicAuth(username: string, password: string) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

async function parseJsonResponse(res: Response) {
  const text = await res.text();
  if (!res.ok) {
    throw new MailpitRequestError(res.status, text || `mailpit request failed: ${res.status}`);
  }
  return text.trim() ? (JSON.parse(text) as unknown) : {};
}

export function createMailpitClient(options: MailpitClientOptions) {
  const fetcher = options.fetcher ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const auth = buildBasicAuth(options.username, options.password);

  async function getJson(path: string) {
    const res = await fetcher(`${baseUrl}${path}`, {
      method: "GET",
      headers: {
        authorization: auth,
      },
    });
    return parseJsonResponse(res);
  }

  async function postJson(path: string, body: unknown) {
    const res = await fetcher(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        authorization: auth,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return parseJsonResponse(res);
  }

  return {
    async listMessages(params: MailpitListParams = {}) {
      const search = new URLSearchParams();
      search.set("start", String(params.start ?? 0));
      search.set("limit", String(params.limit ?? 20));
      return getJson(`/messages?${search.toString()}`);
    },
    async searchMessages(params: MailpitSearchParams) {
      const search = new URLSearchParams();
      search.set("query", params.query);
      search.set("start", String(params.start ?? 0));
      search.set("limit", String(params.limit ?? 20));
      return getJson(`/search?${search.toString()}`);
    },
    async getMessage(messageId: string) {
      return getJson(`/message/${encodeURIComponent(messageId)}`);
    },
    async sendMessage(payload: MailpitSendParams) {
      const body: Record<string, unknown> = {
        From: {
          Email: payload.from_email,
          Name: payload.from_name ?? "",
        },
        To: [
          {
            Email: payload.to_email,
            Name: payload.to_name ?? "",
          },
        ],
        Subject: payload.subject,
        Text: payload.text,
      };
      if (payload.html) {
        body.HTML = payload.html;
      }
      return postJson("/send", body);
    },
  };
}
