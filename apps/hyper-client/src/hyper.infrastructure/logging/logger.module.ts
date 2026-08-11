import { Global, Module } from '@nestjs/common'
import { LoggerModule } from 'nestjs-pino'

const isProd = process.env.NODE_ENV === 'production'

@Global()
@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.SIDECAR_LOG_LEVEL ?? (isProd ? 'info' : 'debug'),
        transport: isProd
          ? undefined
          : { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' } },
      },
    }),
  ],
  exports: [LoggerModule],
})
export class CoreLoggerModule {}
