import { describe, it, expect } from 'vitest';
import { checkSQLType } from './sqlTypeChecker';

describe('checkSQLType', () => {
  describe('Multiple statements detection', () => {
    it('should detect single statement', () => {
      const result = checkSQLType('SELECT * FROM users');
      expect(result.hasMultipleStatements).toBe(false);
      expect(result.statementCount).toBe(1);
    });

    it('should detect multiple statements', () => {
      const result = checkSQLType('SELECT * FROM users; SELECT * FROM products');
      expect(result.hasMultipleStatements).toBe(true);
      expect(result.statementCount).toBe(2);
    });

    it('should ignore semicolons in strings', () => {
      const result = checkSQLType("SELECT * FROM users WHERE name = 'John; Doe'");
      expect(result.hasMultipleStatements).toBe(false);
      expect(result.statementCount).toBe(1);
    });

    it('should handle CREATE TABLE followed by INSERT', () => {
      const result = checkSQLType('CREATE TABLE test (id INT); INSERT INTO test VALUES (1)');
      expect(result.hasMultipleStatements).toBe(true);
      expect(result.statementCount).toBe(2);
    });

    it('should handle trailing semicolon as single statement', () => {
      const result = checkSQLType('SELECT * FROM users;');
      expect(result.hasMultipleStatements).toBe(false);
      expect(result.statementCount).toBe(1);
    });

    it('should handle multiple semicolons', () => {
      const result = checkSQLType('SELECT * FROM users; DELETE FROM products; UPDATE orders SET status = 1');
      expect(result.hasMultipleStatements).toBe(true);
      expect(result.statementCount).toBe(3);
    });

    it('should handle empty statements', () => {
      const result = checkSQLType('SELECT * FROM users;;');
      expect(result.hasMultipleStatements).toBe(false);
      expect(result.statementCount).toBe(1);
    });
  });
  describe('CREATE TABLE detection', () => {
    it('should detect CREATE TABLE', () => {
      const result = checkSQLType('CREATE TABLE users (id INTEGER, name VARCHAR)');
      expect(result.isCreateTable).toBe(true);
      expect(result.isTableOperation).toBe(true);
      expect(result.isDDL).toBe(true);
      expect(result.isDropTable).toBe(false);
    });

    it('should detect CREATE OR REPLACE TABLE', () => {
      const result = checkSQLType('CREATE OR REPLACE TABLE products (id INTEGER)');
      expect(result.isCreateTable).toBe(true);
      expect(result.isTableOperation).toBe(true);
      expect(result.isDDL).toBe(true);
    });

    it('should be case-insensitive', () => {
      const result = checkSQLType('create table test_table (id integer)');
      expect(result.isCreateTable).toBe(true);
    });

    it('should handle CREATE TABLE with IF NOT EXISTS', () => {
      const result = checkSQLType('CREATE TABLE IF NOT EXISTS users (id INTEGER)');
      expect(result.isCreateTable).toBe(true);
      expect(result.isTableOperation).toBe(true);
    });
  });

  describe('DROP TABLE detection', () => {
    it('should detect DROP TABLE', () => {
      const result = checkSQLType('DROP TABLE users');
      expect(result.isDropTable).toBe(true);
      expect(result.isTableOperation).toBe(true);
      expect(result.isDDL).toBe(true);
      expect(result.isCreateTable).toBe(false);
    });

    it('should detect DROP TABLE IF EXISTS', () => {
      const result = checkSQLType('DROP TABLE IF EXISTS products');
      expect(result.isDropTable).toBe(true);
      expect(result.isTableOperation).toBe(true);
    });
  });

  describe('Other DDL operations', () => {
    it('should detect ALTER TABLE', () => {
      const result = checkSQLType('ALTER TABLE users ADD COLUMN email VARCHAR');
      expect(result.isDDL).toBe(true);
      expect(result.isTableOperation).toBe(false);
      expect(result.isCreateTable).toBe(false);
    });

    it('should detect CREATE SCHEMA', () => {
      const result = checkSQLType('CREATE SCHEMA IF NOT EXISTS test_schema');
      expect(result.isDDL).toBe(true);
      expect(result.isTableOperation).toBe(false);
    });

    it('should detect CREATE INDEX', () => {
      const result = checkSQLType('CREATE INDEX idx_user_email ON users(email)');
      expect(result.isDDL).toBe(true);
      expect(result.isTableOperation).toBe(false);
    });

    it('should detect CREATE VIEW', () => {
      const result = checkSQLType('CREATE VIEW user_summary AS SELECT * FROM users');
      expect(result.isDDL).toBe(true);
      expect(result.isTableOperation).toBe(false);
    });
  });

  describe('Non-DDL operations', () => {
    it('should not detect SELECT as DDL', () => {
      const result = checkSQLType('SELECT * FROM users');
      expect(result.isDDL).toBe(false);
      expect(result.isTableOperation).toBe(false);
      expect(result.isCreateTable).toBe(false);
    });

    it('should not detect INSERT as DDL', () => {
      const result = checkSQLType('INSERT INTO users VALUES (1, "John")');
      expect(result.isDDL).toBe(false);
      expect(result.isTableOperation).toBe(false);
    });

    it('should not detect UPDATE as DDL', () => {
      const result = checkSQLType('UPDATE users SET name = "Jane" WHERE id = 1');
      expect(result.isDDL).toBe(false);
      expect(result.isTableOperation).toBe(false);
    });

    it('should not detect DELETE as DDL', () => {
      const result = checkSQLType('DELETE FROM users WHERE id = 1');
      expect(result.isDDL).toBe(false);
      expect(result.isTableOperation).toBe(false);
    });

    it('should not detect DESCRIBE as DDL', () => {
      const result = checkSQLType('DESCRIBE users');
      expect(result.isDDL).toBe(false);
      expect(result.isTableOperation).toBe(false);
      expect(result.isCreateTable).toBe(false);
    });

    it('should not detect SHOW TABLES as DDL', () => {
      const result = checkSQLType('SHOW TABLES');
      expect(result.isDDL).toBe(false);
      expect(result.isTableOperation).toBe(false);
    });
  });

  describe('Comment handling', () => {
    it('should ignore single-line comments', () => {
      const sql = `-- This is a comment
CREATE TABLE users (id INTEGER)`;
      const result = checkSQLType(sql);
      expect(result.isCreateTable).toBe(true);
    });

    it('should ignore multi-line comments', () => {
      const sql = `/* This is a
multi-line comment */
CREATE TABLE products (id INTEGER)`;
      const result = checkSQLType(sql);
      expect(result.isCreateTable).toBe(true);
    });

    it('should handle mixed comments', () => {
      const sql = `-- Single line comment
/* Multi-line
   comment */
CREATE TABLE test (id INTEGER) -- inline comment`;
      const result = checkSQLType(sql);
      expect(result.isCreateTable).toBe(true);
    });

    it('should not detect commented out CREATE TABLE', () => {
      const sql = `-- CREATE TABLE users (id INTEGER)
SELECT * FROM users`;
      const result = checkSQLType(sql);
      expect(result.isCreateTable).toBe(false);
      expect(result.isDDL).toBe(false);
    });

    it('should not detect CREATE TABLE in multi-line comment', () => {
      const sql = `/* 
CREATE TABLE users (id INTEGER)
*/
SELECT * FROM products`;
      const result = checkSQLType(sql);
      expect(result.isCreateTable).toBe(false);
      expect(result.isDDL).toBe(false);
    });
  });

  describe('Complex SQL patterns', () => {
    it('should handle SQL with schema prefix', () => {
      const result = checkSQLType('CREATE TABLE myschema.users (id INTEGER)');
      expect(result.isCreateTable).toBe(true);
    });

    it('should handle SQL with backticks', () => {
      const result = checkSQLType('CREATE TABLE `users` (id INTEGER)');
      expect(result.isCreateTable).toBe(true);
    });

    it('should handle SQL with double quotes', () => {
      const result = checkSQLType('CREATE TABLE "users" (id INTEGER)');
      expect(result.isCreateTable).toBe(true);
    });

    it('should handle SQL with Japanese column names', () => {
      const result = checkSQLType('CREATE TABLE データ ("都道府県名" VARCHAR, "人口" INTEGER)');
      expect(result.isCreateTable).toBe(true);
    });
  });
});