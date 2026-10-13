import { createServer } from 'node:http'
import { createApp } from './app.js'
import { createRepositoryFromEnvironment } from './storage/factory.js'

const port = Number.parseInt(process.env.PORT ?? '3001', 10)
const server = createServer(createApp(createRepositoryFromEnvironment()))

server.listen(port, () => {
  console.log(`A.Y Scan API listening on port ${port}`)
})
