export interface SQLHistoryEntry {
  tableName: string;
  sql: string;
  explanation?: string;
  timestamp: number;
  source: 'remote-file' | 'ai-chat' | 'manual' | 'unknown';
  schema?: string | null;
}

export class SQLHistoryManager {
  private history: Map<string, SQLHistoryEntry> = new Map();
  private listeners: Set<(history: Map<string, SQLHistoryEntry>) => void> = new Set();

  /**
   * Record a CREATE TABLE SQL statement
   */
  recordCreateTable(tableName: string, sql: string, source: SQLHistoryEntry['source'] = 'unknown', explanation?: string, schema?: string | null): void {
    // Normalize table name to lowercase for consistent lookup
    const normalizedName = tableName.toLowerCase();
    // Create a key that includes schema if provided
    const key = schema ? `${schema}.${normalizedName}` : normalizedName;
    
    const entry: SQLHistoryEntry = {
      tableName: normalizedName,
      sql: sql.trim(),
      explanation,
      timestamp: Date.now(),
      source,
      schema
    };
    
    this.history.set(key, entry);
    this.notifyListeners();
  }

  /**
   * Update explanation for existing table
   */
  updateExplanation(tableName: string, explanation: string, schema?: string | null): void {
    const normalizedName = tableName.toLowerCase();
    const key = schema ? `${schema}.${normalizedName}` : normalizedName;
    const existing = this.history.get(key);
    if (existing) {
      existing.explanation = explanation;
      this.notifyListeners();
    }
  }

  /**
   * Get SQL history for a specific table
   */
  getTableSQL(tableName: string, schema?: string | null): SQLHistoryEntry | undefined {
    const normalizedName = tableName.toLowerCase();
    const key = schema ? `${schema}.${normalizedName}` : normalizedName;
    return this.history.get(key);
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
  clearTableHistory(tableName: string, schema?: string | null): void {
    const normalizedName = tableName.toLowerCase();
    const key = schema ? `${schema}.${normalizedName}` : normalizedName;
    if (this.history.delete(key)) {
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