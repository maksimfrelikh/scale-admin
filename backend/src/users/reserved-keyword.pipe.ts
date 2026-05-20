import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { isReservedUserIdKeyword, reservedUserIdMessage } from './reserved-keyword.util';

@Injectable()
export class ReservedKeywordUserIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (isReservedUserIdKeyword(value)) {
      throw new BadRequestException(reservedUserIdMessage(value));
    }
    return value;
  }
}
