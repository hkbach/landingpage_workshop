import { NotFoundException, type PipeTransform } from "@nestjs/common";
import { z } from "zod";

const uuid = z.uuid();

/** A path id that is not a uuid is a 404 (the same answer as an id that does not exist or belongs to another shop), never a 422 that tells it apart. */
export class UuidPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!uuid.safeParse(value).success) throw new NotFoundException({ code: "NOT_FOUND", message: "Not found." });
    return value;
  }
}
