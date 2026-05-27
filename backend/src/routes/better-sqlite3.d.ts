declare module 'better-sqlite3' {
  interface Database {
    pragma(sql: string): void;
    exec(sql: string): void;
    prepare(sql: string): Statement;
    close(): void;
  }
  interface Statement {
    run(...params: any[]): { changes: number; lastInsertRowid: number };
    get(...params: any[]): any;
    all(...params: any[]): any[];
  }
  interface DatabaseConstructor {
    new (filename: string, options?: any): Database;
    (filename: string, options?: any): Database;
  }
  const Database: DatabaseConstructor;
  export default Database;
}
