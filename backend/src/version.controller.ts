import { Controller, Get } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';

function readPackageVersion(): string {
  try {
    const pkgPath = join(process.cwd(), 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
    return pkg.version ?? 'dev';
  } catch {
    return 'dev';
  }
}

function fallback(value: string | undefined): string {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : 'dev';
}

const packageVersion = readPackageVersion();

@Controller('version')
export class VersionController {
  @Get()
  getVersion() {
    return {
      commit: fallback(process.env.BUILD_SHA),
      builtAt: fallback(process.env.BUILT_AT),
      version: packageVersion,
      environment: fallback(process.env.NODE_ENV),
    };
  }
}
