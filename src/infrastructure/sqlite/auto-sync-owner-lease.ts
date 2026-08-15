import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  SymbolLatticeError,
  type AutoSyncOwnerLease,
  type AutoSyncOwnerLeaseResult
} from "../../application/index.js";

const INDEX_DIRECTORY_NAME = ".SymbolLattice";
const INDEX_DATABASE_FILE_NAME = "index.sqlite";
export const AUTO_SYNC_OWNER_LEASE_FILE_NAME = "auto-sync-owner.sqlite";

/**
 * Holds a project-local SQLite exclusive transaction for the life of one MCP
 * host. SQLite releases the operating-system lock if the process exits, so
 * this avoids stale PID files and watcher heartbeat races.
 */
export class SqliteAutoSyncOwnerLease implements AutoSyncOwnerLease {
  private readonly projectPath: string;
  private database: DatabaseSync | null = null;

  public constructor(projectPath: string) {
    this.projectPath = resolve(projectPath);
  }

  public acquire(): AutoSyncOwnerLeaseResult {
    if (this.database !== null) {
      return this.acquired();
    }
    if (!existsSync(this.indexPath())) {
      throw new SymbolLatticeError(
        "MISSING_INDEX",
        `No SymbolLattice index exists for ${this.projectPath}. Run "SymbolLattice init ${this.projectPath}" first.`
      );
    }

    let database: DatabaseSync | null = null;
    try {
      database = new DatabaseSync(this.leasePath());
      // A contender must degrade to read-only MCP immediately instead of
      // waiting behind an existing watcher and appearing to own it.
      database.exec("PRAGMA busy_timeout = 0");
      database.exec("BEGIN EXCLUSIVE");
      this.database = database;
      return this.acquired();
    } catch {
      try {
        database?.close();
      } catch {
        // The failed contender has no useful recovery path; its process owns
        // no successful lease and must remain a read-only MCP host.
      }
      return {
        state: "unavailable",
        error: {
          code: "AUTO_SYNC_OWNER_UNAVAILABLE",
          message:
            "Could not acquire the exclusive auto-sync owner lease for this project. Another SymbolLattice host may already own it."
        }
      };
    }
  }

  private acquired(): AutoSyncOwnerLeaseResult {
    return {
      state: "owned",
      release: () => this.release()
    };
  }

  private release(): void {
    const database = this.database;
    if (database === null) {
      return;
    }

    this.database = null;
    try {
      database.exec("COMMIT");
    } finally {
      database.close();
    }
  }

  private indexPath(): string {
    return join(this.projectPath, INDEX_DIRECTORY_NAME, INDEX_DATABASE_FILE_NAME);
  }

  private leasePath(): string {
    return join(this.projectPath, INDEX_DIRECTORY_NAME, AUTO_SYNC_OWNER_LEASE_FILE_NAME);
  }
}
