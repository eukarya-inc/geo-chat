import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SQLHistoryManager } from './sqlHistoryManager';

describe('SQLHistoryManager', () => {
  let manager: SQLHistoryManager;

  beforeEach(() => {
    manager = new SQLHistoryManager();
  });

  describe('recordCreateTable', () => {
    it('should record a CREATE TABLE statement', () => {
      manager.recordCreateTable('test_table', 'CREATE TABLE test_table AS SELECT 1', 'manual');
      
      const entry = manager.getTableSQL('test_table');
      expect(entry).toBeDefined();
      expect(entry?.tableName).toBe('test_table');
      expect(entry?.sql).toBe('CREATE TABLE test_table AS SELECT 1');
      expect(entry?.source).toBe('manual');
    });

    it('should normalize table names to lowercase', () => {
      manager.recordCreateTable('TEST_TABLE', 'CREATE TABLE TEST_TABLE AS SELECT 1', 'manual');
      
      const entry = manager.getTableSQL('test_table');
      expect(entry).toBeDefined();
      expect(entry?.tableName).toBe('test_table');
    });

    it('should overwrite existing entries with the same table name', () => {
      manager.recordCreateTable('test_table', 'CREATE TABLE test_table AS SELECT 1', 'manual');
      manager.recordCreateTable('test_table', 'CREATE TABLE test_table AS SELECT 2', 'ai-chat');
      
      const entry = manager.getTableSQL('test_table');
      expect(entry?.sql).toBe('CREATE TABLE test_table AS SELECT 2');
      expect(entry?.source).toBe('ai-chat');
    });

    it('should include explanation if provided', () => {
      manager.recordCreateTable('test_table', 'CREATE TABLE test_table AS SELECT 1', 'manual', 'Test explanation');
      
      const entry = manager.getTableSQL('test_table');
      expect(entry?.explanation).toBe('Test explanation');
    });
  });

  describe('updateExplanation', () => {
    it('should update explanation for existing table', () => {
      manager.recordCreateTable('test_table', 'CREATE TABLE test_table AS SELECT 1', 'manual');
      manager.updateExplanation('test_table', 'Updated explanation');
      
      const entry = manager.getTableSQL('test_table');
      expect(entry?.explanation).toBe('Updated explanation');
    });

    it('should not create entry for non-existent table', () => {
      manager.updateExplanation('non_existent', 'Some explanation');
      
      const entry = manager.getTableSQL('non_existent');
      expect(entry).toBeUndefined();
    });
  });

  describe('getTableSQL', () => {
    it('should return undefined for non-existent table', () => {
      const entry = manager.getTableSQL('non_existent');
      expect(entry).toBeUndefined();
    });

    it('should be case-insensitive', () => {
      manager.recordCreateTable('test_table', 'CREATE TABLE test_table AS SELECT 1', 'manual');
      
      expect(manager.getTableSQL('TEST_TABLE')).toBeDefined();
      expect(manager.getTableSQL('Test_Table')).toBeDefined();
      expect(manager.getTableSQL('test_table')).toBeDefined();
    });
  });

  describe('getAllHistory', () => {
    it('should return empty map initially', () => {
      const history = manager.getAllHistory();
      expect(history.size).toBe(0);
    });

    it('should return all recorded tables', () => {
      manager.recordCreateTable('table1', 'CREATE TABLE table1 AS SELECT 1', 'manual');
      manager.recordCreateTable('table2', 'CREATE TABLE table2 AS SELECT 2', 'ai-chat');
      
      const history = manager.getAllHistory();
      expect(history.size).toBe(2);
      expect(history.has('table1')).toBe(true);
      expect(history.has('table2')).toBe(true);
    });

    it('should return a copy of the history map', () => {
      manager.recordCreateTable('table1', 'CREATE TABLE table1 AS SELECT 1', 'manual');
      
      const history1 = manager.getAllHistory();
      history1.clear();
      
      const history2 = manager.getAllHistory();
      expect(history2.size).toBe(1);
    });
  });

  describe('clearTableHistory', () => {
    it('should remove specific table from history', () => {
      manager.recordCreateTable('table1', 'CREATE TABLE table1 AS SELECT 1', 'manual');
      manager.recordCreateTable('table2', 'CREATE TABLE table2 AS SELECT 2', 'manual');
      
      manager.clearTableHistory('table1');
      
      const history = manager.getAllHistory();
      expect(history.size).toBe(1);
      expect(history.has('table1')).toBe(false);
      expect(history.has('table2')).toBe(true);
    });

    it('should be case-insensitive', () => {
      manager.recordCreateTable('test_table', 'CREATE TABLE test_table AS SELECT 1', 'manual');
      manager.clearTableHistory('TEST_TABLE');
      
      const history = manager.getAllHistory();
      expect(history.size).toBe(0);
    });
  });

  describe('clearAllHistory', () => {
    it('should remove all tables from history', () => {
      manager.recordCreateTable('table1', 'CREATE TABLE table1 AS SELECT 1', 'manual');
      manager.recordCreateTable('table2', 'CREATE TABLE table2 AS SELECT 2', 'manual');
      
      manager.clearAllHistory();
      
      const history = manager.getAllHistory();
      expect(history.size).toBe(0);
    });
  });

  describe('subscribe', () => {
    it('should notify listeners when history changes', () => {
      const listener = vi.fn();
      const unsubscribe = manager.subscribe(listener);
      
      manager.recordCreateTable('test_table', 'CREATE TABLE test_table AS SELECT 1', 'manual');
      
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(expect.any(Map));
      
      const calledHistory = listener.mock.calls[0][0] as ReturnType<SQLHistoryManager['getAllHistory']>;
      expect(calledHistory.size).toBe(1);
      expect(calledHistory.has('test_table')).toBe(true);
      
      unsubscribe();
    });

    it('should notify multiple listeners', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      
      manager.subscribe(listener1);
      manager.subscribe(listener2);
      
      manager.recordCreateTable('test_table', 'CREATE TABLE test_table AS SELECT 1', 'manual');
      
      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it('should stop notifying after unsubscribe', () => {
      const listener = vi.fn();
      const unsubscribe = manager.subscribe(listener);
      
      manager.recordCreateTable('table1', 'CREATE TABLE table1 AS SELECT 1', 'manual');
      expect(listener).toHaveBeenCalledTimes(1);
      
      unsubscribe();
      listener.mockClear();
      
      manager.recordCreateTable('table2', 'CREATE TABLE table2 AS SELECT 2', 'manual');
      expect(listener).not.toHaveBeenCalled();
    });

    it('should notify on updateExplanation', () => {
      const listener = vi.fn();
      manager.subscribe(listener);
      
      manager.recordCreateTable('test_table', 'CREATE TABLE test_table AS SELECT 1', 'manual');
      listener.mockClear();
      
      manager.updateExplanation('test_table', 'New explanation');
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should notify on clearTableHistory', () => {
      const listener = vi.fn();
      manager.subscribe(listener);
      
      manager.recordCreateTable('test_table', 'CREATE TABLE test_table AS SELECT 1', 'manual');
      listener.mockClear();
      
      manager.clearTableHistory('test_table');
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should notify on clearAllHistory', () => {
      const listener = vi.fn();
      manager.subscribe(listener);
      
      manager.recordCreateTable('test_table', 'CREATE TABLE test_table AS SELECT 1', 'manual');
      listener.mockClear();
      
      manager.clearAllHistory();
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });
});