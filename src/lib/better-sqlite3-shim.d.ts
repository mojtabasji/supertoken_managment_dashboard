declare module "better-sqlite3" {
  export interface RunResult {
    changes: number;
    lastInsertRowid: number | bigint;
  }

  export interface Value {
    column(readonlyMaxVariableColumns?: number): unknown;
  }

  export interface Statement {
    bind(...params: unknown[]): this;
    step(): boolean;
    reset(): this;
    finalize(): this;
    run(...params: unknown[]): RunResult;
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
  }

  export interface Database {
    prepare(sql: string): Statement;
    exec(sql: string): this;
    pragma(pragma: string, value?: unknown): this;
    isOpen(connection?: string): boolean;
    close(): void;
    path: string;
    readonly sqliteVersion: string;
    readonly filename: string;
    readonly open: boolean;
    readonly inTransaction: boolean;
    readonly readonly: boolean;
    readonly trace: unknown;
    readonly busyprotocol: unknown;
    readonly defaultSafeIntegers: unknown;
    readonly safeIntegers: unknown;
  }

  export interface ConstructorOptions {
    readonly readOnly?: boolean;
    readonly fileMustExist?: boolean;
    readonly shared?: unknown;
    readonly verbose?: unknown;
  }

  function Database(path: string, options?: ConstructorOptions): Database;
  export = Database;
}
