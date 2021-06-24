require('log-timestamp')

const cors = require('cors')
const express = require('express')
const { Client } = require('pg')
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

// hardcoded stuff
const dataDir = '../data'
const certDir = dataDir
const inboxDir = `${dataDir}/inbox`
const { runInNewContext } = require('vm')
const { restart } = require('nodemon')
const mzHost = '8vsns4vif3o.materialize.cloud'

//
// photo processing
//

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

//
// setup
//

function createDirectoriesSync() {
  const directories = [ dataDir, certDir, inboxDir ]
  for (const dir of directories) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir)
    }
  }
}

async function createTablesAndViews(client) {
  console.log('creating tables and views - all prior data will be erased')

  await client.query('DROP VIEW IF EXISTS photos_count')
  await client.query('DROP VIEW IF EXISTS next_photo')
  await client.query('DROP TABLE IF EXISTS photos')
  await client.query(
    'CREATE TABLE photos (id NUMERIC, insert_ts NUMERIC, delete_ts NUMERIC, comment TEXT, photo TEXT)'
  )
  // every photo takes 2x storage in Materialize because of table + mat. view
  await client.query(
    // would love to break this into a string with newlines, but that triggers
    // the error: TypeError: "" is not a function
    'CREATE MATERIALIZED VIEW next_photo AS SELECT id, insert_ts, delete_ts, comment, photo FROM photos WHERE mz_logical_timestamp() >= insert_ts AND mz_logical_timestamp()  < delete_ts ORDER BY insert_ts LIMIT 1'
  )

  // TODO: use this from the frontend -- need to figure out how to do a
  // long-poll HTTP request or equivalent
  await client.query(
    'CREATE MATERIALIZED VIEW photos_count AS SELECT COUNT(*) AS count FROM photos WHERE mz_logical_timestamp() >= insert_ts AND mz_logical_timestamp()  < delete_ts'
  )
  await client.query('BEGIN')
  await client.query('DECLARE photos_count_cursor CURSOR FOR TAIL photos_count')
  await client.query('COMMIT')
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

//
// photo resizing and upload
//

// shrink photos and insert into Materialize table
async function processPhotos(client) {
  await createTablesAndViews(client)

  let filesToProcess = []
  console.log(`watching for photos in ${inboxDir}`)

  // watch file system for changed files and queue up files to process if
  // they're a reasonable size to be a photo
  fs.watch(inboxDir, {}, (_, filename) => {
    const path = `${inboxDir}/${filename}`
    if (fs.existsSync(path) && fs.statSync(path).size > 50400) {
      filesToProcess.push(path)
    }
  })

  // insert photos into Materialize as base64-encoded TEXT values
  let id = 1;
  while(true) {
    let imagePath = filesToProcess.shift()
    while(imagePath) {
      console.log(`processing ${imagePath}`)

      // create smaller version of image
      const image = await await sharp(imagePath).resize(700).toBuffer()
      const imageB64 = image.toString('base64')

      // use file name as comment
      const comment = path.parse(imagePath).name

      // insert base64-encoded image, because MZ doesn't support binary BLOBs
      const photoLifetime = 15000 /* ms */; //TODO: lower
      const q = `INSERT INTO photos VALUES ($1, extract(epoch from now()) * 1000, extract(epoch from now()) * 1000 + ${photoLifetime}, $2, $3)`
      // TODO: put random comment in
      const res = await client.query(q, [id, comment, imageB64])
      if (res.rowCount != 1) {
        console.error('insert row count =', res.rowCount, '(expected 1)')
      }
      id++
      console.log(`${imagePath} inserted into Materialize`)

      imagePath = filesToProcess.shift()
    }
    await sleep(50)
  }
}

//
// REST server
//

const app = express()
app.use(cors());
const port = 3001

async function startRestServer(client) {

  app.get('/', (_, response) => {
    response.json('hello')
  })

  // returns next photo from the next_photo materialized view
  app.get('/next_photo', async (_, response, next) => {
    const res = await client.query(
      'SELECT id, insert_ts, delete_ts, comment, photo FROM next_photo'
    )
    if (res.rows > 1) {
      console.error(`expected 1 row, got ${res.rows} rows`)
    }
    response.json(res.rows[0] ? res.rows[0] : {})
  })

  app.listen(port, () => {
    console.log(`started on port ${port}`)
  })
}

(async function() {
  createDirectoriesSync()
  const client = await mzConnect()
  processPhotos(client)
  await startRestServer(client)
})()
