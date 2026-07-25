/**
 * SecurityModule — exposes the shared-secret token to the DI graph.
 *
 * The token itself is loaded outside Nest (in `main.ts`) so the value
 * is known *before* any HTTP listener binds. We export the
 * `SHARED_TOKEN` provider value from `main.ts` via `forRoot(token)` so
 * tests can override it with `Test.createTestingModule`.
 */
import { Global, Module, type DynamicModule } from '@nestjs/common'
import { SHARED_TOKEN, type SharedTokenPort } from '../../infrastructure/security/security.tokens.js'

@Global()
@Module({})
export class SecurityModule {
  static forRoot(token: SharedTokenPort): DynamicModule {
    return {
      module: SecurityModule,
      providers: [
        {
          provide: SHARED_TOKEN,
          useValue: token,
        },
      ],
      exports: [SHARED_TOKEN],
    }
  }
}
