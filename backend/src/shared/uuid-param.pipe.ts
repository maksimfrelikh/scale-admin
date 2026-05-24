import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';

// Shared ParseUUIDPipe instance for UUID path params (:storeId, :userId,
// :productId, :catalogVersionId, :bannerId, :id and friends). Prevents
// Prisma value-parsing errors against `@db.Uuid` columns from falling
// through to Nest's default exception filter as English 500 "Internal
// server error" (BUG-REG-071) and likewise blocks bogus-UUID input from
// reaching service code that would otherwise raise a Prisma error
// (BUG-REG-069 family). All schema IDs are v4 (`@default(uuid())`).
export const RussianParseUUIDPipe = new ParseUUIDPipe({
  version: '4',
  exceptionFactory: () => new BadRequestException('Некорректный идентификатор'),
});
