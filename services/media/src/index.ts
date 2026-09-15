import process from 'node:process'

import { googleKeySet, verifyFirebaseIdToken } from './auth/firebaseToken.js'
import { createCatalogStore } from './catalogStore.js'
import { ConfigError, readConfig } from './config.js'
import { buildServer } from './server.js'

async function main(): Promise<void> {
  let config
  try {
    config = readConfig(process.env)
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message)
      process.exit(1)
    }
    throw error
  }

  const store = createCatalogStore({
    mediaRoot: config.mediaRoot,
    cacheDir: config.cacheDir,
    onNotice: (message) => {
      console.warn(message)
    },
  })

  const keySet = googleKeySet()
  const app = buildServer({
    config,
    store,
    verifyIdToken: (token) =>
      verifyFirebaseIdToken(token, { projectId: config.firebaseProjectId, keySet }),
    logger: true,
  })

  await app.listen({ host: config.host, port: config.port })
  app.log.info(
    { mediaRoot: config.mediaRoot, allowedOrigins: config.allowedOrigins },
    'hb-media gestartet',
  )

  if (config.scanOnStart) {
    app.log.info('Erster Scan läuft …')
    await store.rescan()
    app.log.info({ books: store.catalog().books.length }, 'Scan fertig')
  }

  // Ohne wiederholten Scan taucht ein neu abgelegtes Hörbuch erst nach einem
  // Neustart auf – das erwartet niemand, der einen Ordner aufs NAS kopiert.
  let timer: NodeJS.Timeout | undefined
  if (config.rescanIntervalMinutes > 0) {
    timer = setInterval(
      () => {
        void store.rescan().then(
          () => {
            app.log.info({ books: store.catalog().books.length }, 'Neu eingelesen')
          },
          (error: unknown) => {
            app.log.error({ error }, 'Scan fehlgeschlagen')
          },
        )
      },
      config.rescanIntervalMinutes * 60_000,
    )
    // Ein wartender Timer soll den Prozess nicht am Beenden hindern.
    timer.unref()
  }

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      if (timer) clearInterval(timer)
      void app.close().then(() => {
        process.exit(0)
      })
    })
  }
}

await main()
