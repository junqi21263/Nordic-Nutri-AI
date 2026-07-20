type ProductUserRow = { id: string };

type QueryResult = Promise<{ data: ProductUserRow | null; error: unknown }>;

export interface CloudbaseProductSessionClient {
  from: (table: "app_users") => {
    select: (columns: "id") => { maybeSingle: () => QueryResult };
    insert: (payload: Record<string, never>) => {
      select: (columns: "id") => { single: () => QueryResult };
    };
  };
}

function readProductUserFailure(error: unknown): Error {
  return new Error(error ? "CloudBase 用户资料读取失败" : "CloudBase 用户资料不存在");
}

export async function ensureCloudbaseProductUser(client: CloudbaseProductSessionClient): Promise<string> {
  const appUsers = client.from("app_users");
  const existing = await appUsers.select("id").maybeSingle();
  if (existing.data?.id) return existing.data.id;
  if (existing.error) throw readProductUserFailure(existing.error);

  const created = await appUsers.insert({}).select("id").single();
  if (!created.data?.id || created.error) throw readProductUserFailure(created.error);
  return created.data.id;
}
