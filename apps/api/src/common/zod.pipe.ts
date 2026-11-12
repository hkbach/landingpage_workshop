import { type PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";

/** Validates a body, a query or a param with a Zod schema (the schemas of packages/shared); a wrong value throws a ZodError, which the error filter answers with 422. Usage: `@Body(new ZodPipe(schema))`. */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    return this.schema.parse(value);
  }
}
