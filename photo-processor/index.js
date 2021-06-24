const { Client } = require('pg')
const fs = require('fs')
require('log-timestamp')
const sharp = require('sharp')

// hardcoded stuff
const dataDir = '../data'
const certDir = dataDir
const inboxDir = `${dataDir}/inbox`
const processedDir = `${dataDir}/processed`
const mzHost = '8vsns4vif3o.materialize.cloud'

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function createDirectoriesSync() {
  const directories = [ dataDir, certDir, inboxDir, processedDir ]
  for (const dir of directories) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir)
    }
  }
}

async function mzConnect() {
  // needs certs in `certDir`
  if (!fs.existsSync(`${certDir}/ca.crt`)) {
    throw `TLS certs need to be in ${certDir}`
  }
  const ssl = {
    ca: fs.readFileSync(`${certDir}/ca.crt`).toString(),
    key: fs.readFileSync(`${certDir}/materialize.key`).toString(),
    cert: fs.readFileSync(`${certDir}/materialize.crt`).toString(),
  }
  const clientConfig = {
    rejectUnauthorized: false,
    host: mzHost,
    port: 6875,
    user: 'materialize',
    ssl,
  }
  const client = new Client(clientConfig)
  await client.connect()
  const res = await client.query('SELECT mz_version()')
  console.log('connected to Materialize', res.rows[0].mz_version, 'on', clientConfig.host)
  return client
}

async function createTablesAndViews(client) {
  await client.query('DROP VIEW IF EXISTS next_photo')
  await client.query('DROP TABLE IF EXISTS photos')
  await client.query(
    'CREATE TABLE photos (insert_ts NUMERIC, delete_ts NUMERIC, comment TEXT, photo TEXT)'
  )
  // every photo takes 2x storage in Materialize because of table + mat. view
  await client.query(
    // would love to break this into a string with newlines, but that triggers
    // the error: TypeError: "" is not a function
    'CREATE MATERIALIZED VIEW next_photo AS SELECT insert_ts, comment, photo FROM photos WHERE mz_logical_timestamp() >= insert_ts AND mz_logical_timestamp()  < delete_ts ORDER BY insert_ts LIMIT 1'
  )
}

async function processPhotos() {
  const client = await mzConnect()
  await createTablesAndViews(client)

  let filesToProcess = []
  console.log(`watching for photos in ${inboxDir}`)

  // watch file system for changed files and queue up files to process if
  // they're a reasonable size to be a photo
  fs.watch(inboxDir, {}, (_, filename) => {
    const path = `${inboxDir}/${filename}`
    if (fs.existsSync(path) && fs.statSync(path).size > 102400) {
      filesToProcess.push(path)
    }
  })

  // insert photos into Materialize as base64-encoded TEXT values
  while(true) {
    let path = filesToProcess.shift()
    while(path) {
      console.log(`processing ${path}`)

      const image = await await sharp(path).resize(600).toBuffer()
      const imageB64 = image.toString('base64')

      const tsRes = await client.query('SELECT mz_logical_timestamp() AS ts')
      const ts = tsRes.rows[0].ts
      console.log('mz_logical_timestamp =', ts)

      // insert base64-encoded image, because MZ doesn't support binary BLOBs
      const q = "INSERT INTO photos VALUES (extract(epoch from now()) * 1000, extract(epoch from now()) * 1000 + 30000, $1, $2)"
      // TODO: put random comment in
      const res = await client.query(q, ['comment', imageB64])
      if (res.rowCount != 1) {
        console.error('insert row count =', res.rowCount, '(expected 1)')
      }
      console.log(`${path} inserted into Materialize`)

      path = filesToProcess.shift()
    }
    await sleep(50)
  }
}

(async function() {
  createDirectoriesSync()
  await processPhotos()
})()
