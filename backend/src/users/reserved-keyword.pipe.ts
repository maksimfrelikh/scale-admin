import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { isReservedUserIdKeyword } from './reserved-keyword.util';

@Injectable()
export class ReservedKeywordUserIdPipe implements PipeTransform<string, string> {
  constructor(private readonly i18n: I18nService) {}

  transform(value: string): string {
    if (isReservedUserIdKeyword(value)) {
      throw new BadRequestException(this.i18n.t('errors.users.reservedUserId', { args: { value } }));
    }
    return value;
  }
}
