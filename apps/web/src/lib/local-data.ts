import * as duckdb from "@duckdb/duckdb-wasm";

let databasePromise: Promise<duckdb.AsyncDuckDB> | undefined;

async function getDatabase(): Promise<duckdb.AsyncDuckDB> {
  if (!databasePromise) {
    databasePromise = (async () => {
      const selected = await duckdb.selectBundle({
        mvp: {
          mainModule: "/duckdb/duckdb-mvp.wasm",
          mainWorker: "/duckdb/duckdb-browser-mvp.worker.js",
        },
      });
      if (!selected.mainWorker) throw new Error("DuckDB could not select its browser worker.");
      const worker = new Worker(selected.mainWorker);
      const database = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);
      await database.instantiate(selected.mainModule, selected.pthreadWorker);
      return database;
    })().catch((error: unknown) => {
      databasePromise = undefined;
      throw error;
    });
  }
  return databasePromise;
}

export async function inspectTabularFile(
  file: File,
  sourceId: string,
): Promise<Array<{ name: string; type: string }>> {
  const extension = file.name.toLowerCase().endsWith(".parquet") ? "parquet" : "csv";
  const registeredName = `${sourceId.replace(/[^a-zA-Z0-9_]/g, "")}.${extension}`;
  const database = await getDatabase();
  const connection = await database.connect();

  try {
    await database.registerFileBuffer(registeredName, new Uint8Array(await file.arrayBuffer()));
    const reader = extension === "parquet" ? "read_parquet" : "read_csv_auto";
    const table = await connection.query(`DESCRIBE SELECT * FROM ${reader}('${registeredName}')`);
    return table.toArray().map((row) => {
      const value = row.toJSON() as { column_name?: unknown; column_type?: unknown };
      return { name: String(value.column_name ?? ""), type: String(value.column_type ?? "") };
    });
  } finally {
    await connection.close();
  }
}
