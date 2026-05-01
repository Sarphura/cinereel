/// <reference types="vite/client" />
import { createApp } from './app'
const { app, hyper } = await createApp()

try {
  const port = Number(process.env.PORT ?? 3000)
  await app.listen({ port, host: '0.0.0.0' })
  app.log.info(`Cinereel API 已启动: http://localhost:${port}`)
} catch (error) {
  app.log.error(error)
  process.exit(1)
}

const shutdown = async () => {
  app.log.info('收到终止信号，正在关闭 Hypercore 传输层...')
  await hyper.close()
  await app.close()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

// Vite Hot Module Replacement (HMR) 支持
if (import.meta.hot) {
  import.meta.hot.on('vite:beforeFullReload', async () => {
    app.log.info('Vite HMR: 正在关闭旧实例以便热更新...')
    await hyper.close()
    await app.close()
  })
}
