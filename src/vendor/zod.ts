type SchemaType<T> = T extends BaseType<infer U> ? U : never;

abstract class BaseType<T> {
  protected _defaultSet = false;
  protected _defaultValue!: T;

  default(value: T): this {
    this._defaultSet = true;
    this._defaultValue = value;
    return this;
  }

  optional(): ZOptional<T> {
    return new ZOptional(this);
  }

  protected getDefault(): T | undefined {
    return this._defaultSet ? this._defaultValue : undefined;
  }

  abstract parse(input: unknown): T;
}

class ZOptional<T> extends BaseType<T | undefined> {
  constructor(private inner: BaseType<T>) {
    super();
  }

  parse(input: unknown): T | undefined {
    if (input === undefined || input === null || input === "") {
      return this.getDefault();
    }
    return this.inner.parse(input);
  }
}

class ZString extends BaseType<string> {
  private validators: Array<(value: string) => boolean> = [];
  private validatorMessage = "Invalid string";

  url(): this {
    this.validators.push((v) => /^https?:\/\//i.test(v));
    this.validatorMessage = "Invalid URL";
    return this;
  }

  email(): this {
    this.validators.push((v) => /\S+@\S+\.\S+/.test(v));
    this.validatorMessage = "Invalid email";
    return this;
  }

  parse(input: unknown): string {
    let value = typeof input === "string" ? input : "";
    if (!value && this._defaultSet) {
      value = this._defaultValue;
    }
    for (const validator of this.validators) {
      if (!validator(value)) {
        throw new Error(this.validatorMessage);
      }
    }
    return value;
  }
}

class ZNumber extends BaseType<number> {
  private ensureInt = false;
  private ensurePositive = false;

  int(): this {
    this.ensureInt = true;
    return this;
  }

  positive(): this {
    this.ensurePositive = true;
    return this;
  }

  parse(input: unknown): number {
    let value = typeof input === "number" ? input : Number(input);
    if (Number.isNaN(value)) {
      const fallback = this.getDefault();
      if (fallback !== undefined) return fallback;
      throw new Error("Invalid number");
    }
    if (this.ensureInt) value = Math.trunc(value);
    if (this.ensurePositive && value < 0) value = Math.abs(value);
    return value;
  }
}

class ZBoolean extends BaseType<boolean> {
  parse(input: unknown): boolean {
    if (typeof input === "boolean") return input;
    if (input === "true") return true;
    if (input === "false") return false;
    const fallback = this.getDefault();
    if (fallback !== undefined) return fallback;
    return Boolean(input);
  }
}

class ZEnum<T extends string> extends BaseType<T> {
  constructor(private options: readonly T[]) {
    super();
  }

  parse(input: unknown): T {
    if (typeof input === "string" && this.options.includes(input as T)) {
      return input as T;
    }
    const fallback = this.options[0];
    if (fallback !== undefined) return fallback;
    throw new Error("Invalid enum value");
  }
}

class ZArray<T> extends BaseType<T[]> {
  private maxLength?: number;
  constructor(private schema: BaseType<T>) {
    super();
  }

  max(count: number): this {
    this.maxLength = count;
    return this;
  }

  parse(input: unknown): T[] {
    const fallback = this.getDefault();
    if (!Array.isArray(input)) {
      return fallback ?? [];
    }
    const result = input.map((item) => this.schema.parse(item));
    if (this.maxLength && result.length > this.maxLength) {
      return result.slice(0, this.maxLength);
    }
    return result;
  }
}

class ZObject<T extends Record<string, BaseType<unknown>>> extends BaseType<{ [K in keyof T]: SchemaType<T[K]> }> {
  constructor(private shape: T) {
    super();
  }

  parse(input: unknown): { [K in keyof T]: SchemaType<T[K]> } {
    const obj = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
    const result: Record<string, unknown> = {};
    (Object.keys(this.shape) as Array<keyof T>).forEach((key) => {
      result[key as string] = this.shape[key].parse(obj[key as string]);
    });
    return result as { [K in keyof T]: SchemaType<T[K]> };
  }
}

export const z = {
  string: () => new ZString(),
  number: () => new ZNumber(),
  boolean: () => new ZBoolean(),
  enum: <T extends string>(values: readonly T[]) => new ZEnum(values),
  array: <T>(schema: BaseType<T>) => new ZArray(schema),
  object: <T extends Record<string, BaseType<unknown>>>(shape: T) => new ZObject(shape),
};

export type Infer<T extends BaseType<unknown>> = SchemaType<T>;
