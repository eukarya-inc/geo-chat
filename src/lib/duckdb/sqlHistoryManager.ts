export interface SQLHistoryEntry {
  tableName: string;
  sql: string;
  timestamp: number;
  source: 'remote-file' | 'ai-chat' | 'manual' | 'unknown';
}

export class SQLHistoryManager {
  private history: Map<string, SQLHistoryEntry> = new Map();
  private listeners: Set<(history: Map<string, SQLHistoryEntry>) => void> = new Set();

  /**
   * Record a CREATE TABLE SQL statement
   */
  recordCreateTable(tableName: string, sql: string, source: SQLHistoryEntry['source'] = 'unknown'): void {
    // Normalize table name to lowercase for consistent lookup
    const normalizedName = tableName.toLowerCase();
    
    const entry: SQLHistoryEntry = {
      tableName: normalizedName,
      sql: sql.trim(),
      timestamp: Date.now(),
      source
    };
    
    this.history.set(normalizedName, entry);
    this.notifyListeners();
  }

  /**
   * Get SQL history for a specific table
   */
  getTableSQL(tableName: string): SQLHistoryEntry | undefined {
    return this.history.get(tableName.toLowerCase());
  }

  /**
   * Get all SQL history
   */
  getAllHistory(): Map<string, SQLHistoryEntry> {
    return new Map(this.history);
  }

  /**
   * Clear history for a specific table (e.g., when table is dropped)
   */
  clearTableHistory(tableName: string): void {
    const normalizedName = tableName.toLowerCase();
    if (this.history.delete(normalizedName)) {
      this.notifyListeners();
    }
  }

  /**
   * Clear all history
   */
  clearAllHistory(): void {
    this.history.clear();
    this.notifyListeners();
  }

  /**
   * Subscribe to history changes
   */
  subscribe(listener: (history: Map<string, SQLHistoryEntry>) => void): () => void {
    this.listeners.add(listener);
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      listener(this.getAllHistory());
    });
  }

  /**
   * Export history as JSON for debugging/persistence
   */
  toJSON(): Record<string, SQLHistoryEntry> {
    const obj: Record<string, SQLHistoryEntry> = {};
    this.history.forEach((value, key) => {
      obj[key] = value;
    });
    return obj;
  }

  /**
   * Import history from JSON
   */
  fromJSON(data: Record<string, SQLHistoryEntry>): void {
    this.history.clear();
    Object.entries(data).forEach(([key, value]) => {
      this.history.set(key, value);
    });
    this.notifyListeners();
  }
}