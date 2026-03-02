/**
 * Type declarations for the transit-js package.
 * @see https://github.com/cognitect/transit-js
 */

declare module "transit-js" {
  export interface WriteHandler<T> {
    tag(v: T): string;
    rep(v: T): unknown;
    stringRep?(v: T): string;
  }

  /** Read handlers are plain functions: (rep) => value */
  export type ReadHandler = (rep: unknown) => unknown;

  export interface WriterOptions {
    handlers?: Map<new (...args: unknown[]) => unknown, WriteHandler<unknown>>;
  }

  export interface ReaderOptions {
    handlers?: Record<string, ReadHandler>;
    defaultHandler?: ReadHandler;
  }

  export interface Writer {
    write(obj: unknown): string;
  }

  export interface Reader {
    read(str: string): unknown;
  }

  export function writer(type: "json" | "json-verbose", opts?: WriterOptions): Writer;
  export function reader(type: "json" | "json-verbose", opts?: ReaderOptions): Reader;

  export function keyword(name: string): Keyword;
  export function symbol(name: string): TransitSymbol;
  export function uuid(str: string): TransitUUID;
  export function isKeyword(x: unknown): x is Keyword;
  export function isUUID(x: unknown): x is TransitUUID;
  export function map(arr: unknown[]): TransitMap;

  export interface Keyword {
    _name: string;
    toString(): string;
  }

  export interface TransitSymbol {
    _name: string;
    toString(): string;
  }

  export interface TransitUUID {
    toString(): string;
  }

  export interface TransitMap {
    get(key: unknown): unknown;
    set(key: unknown, val: unknown): void;
    forEach(fn: (val: unknown, key: unknown) => void): void;
    keys(): unknown[];
  }
}
