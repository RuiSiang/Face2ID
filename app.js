const tf = require('@tensorflow/tfjs-node')
const faceapi = require('@vladmandic/face-api')
const Canvas = require('canvas')
const path = require('path')
const Koa = require('koa')
const Static = require('koa-static')
const Router = require('@koa/router')
const bodyParser = require('koa-bodyparser')
const moment = require('moment')
const sqlite3 = require('sqlite3')
const { open } = require('sqlite')
const Uuid = require('uuid')

const app = new Koa()
const router = new Router()

async function openDb() {
  return open({
    filename: './database.db',
    driver: sqlite3.Database
  })
}

const init = async () => {
  await faceapi.tf.setBackend('tensorflow');
  await faceapi.tf.ready();
  await faceapi.nets.faceRecognitionNet.loadFromDisk(path.join(process.cwd(), 'models'))
  await faceapi.nets.faceLandmark68Net.loadFromDisk(path.join(process.cwd(), 'models'))
  await faceapi.nets.ssdMobilenetv1.loadFromDisk(path.join(process.cwd(), 'models'))
  console.log('Models Loaded')
  const db = await openDb()
  const createSchema = `
CREATE TABLE IF NOT EXISTS biometrics (
    uuid VARCHAR(36) PRIMARY KEY,
    timestamp TEXT,
    descriptor TEXT
)`
  await db.run(createSchema)
  await db.close()
  console.log('Database Ready')
}
init()


const insertData = async (db, descriptor) => {
  const uuid = Uuid.v4()
  const timestamp = moment().toISOString()
  try {
    const sql = `INSERT INTO biometrics (uuid, timestamp, descriptor) VALUES (?, ?, ?)`
    await db.run(sql, [uuid, timestamp, descriptor])
    if (debugLevel > 0) {
      console.log(`Entry ${uuid} added to the table: ${timestamp}`)
    }
    return uuid
  } catch (err) {
    console.error(err.message)
  }
}

const queryDataAndCount = async (db) => {
  try {
    // Query to select the rows
    const sqlQuery = `SELECT uuid, descriptor FROM biometrics ORDER BY timestamp DESC`;
    const entries = (await db.all(sqlQuery)) || [];

    // Query to count the rows
    const sqlCount = `SELECT COUNT(*) AS count FROM biometrics`;
    const countResult = await db.get(sqlCount);
    const count = countResult.count;

    return { entries, count };
  } catch (err) {
    console.error(err.message);
  }
}

app.use(bodyParser())
app.use(Static(path.join(process.cwd(), 'public')))

function float32ArrayToBase64(float32Array) {
  let buffer = float32Array.buffer
  let binary = ''
  let bytes = new Uint8Array(buffer)
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return Buffer.from(binary, 'binary').toString('base64')
}

function base64ToFloat32Array(base64) {
  let binary = Buffer.from(base64, 'base64').toString('binary')

  let buffer = new ArrayBuffer(binary.length)
  let bytes = new Uint8Array(buffer)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Float32Array(buffer)
}

const generateDescriptor = async (img) => {
  const detection = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor()
  return float32ArrayToBase64(detection.descriptor)
}

router.post('/detect', async (ctx, next) => {
  const base64Data = ctx.request.body.base64.replace(/^data:image\/jpeg;base64,/, "");
  const buffer = Buffer.from(base64Data, 'base64')
  image = await Canvas.loadImage(buffer)

  const canvas = Canvas.createCanvas(image.width, image.height)
  const canvasCtx = canvas.getContext('2d')
  canvasCtx.drawImage(image, 0, 0, image.width, image.height)

  const displaySize = { width: image.width, height: image.height }
  faceapi.matchDimensions(canvas, displaySize)

  const decodeT = faceapi.tf.node.decodeImage(buffer, 3)
  const expandT = faceapi.tf.expandDims(decodeT, 0)

  const detection = await faceapi.detectSingleFace(expandT).withFaceLandmarks().withFaceDescriptor()
  const resizedDetection = faceapi.resizeResults(detection, displaySize)

  const db = await openDb()
  const { entries, count } = await queryDataAndCount(db)

  const labeledFaceDescriptors = entries.map(entry => {
    return new faceapi.LabeledFaceDescriptors(entry.uuid, [base64ToFloat32Array(entry.descriptor)])
  })

  let result
  if (labeledFaceDescriptors.length > 0) {
    const faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors, 0.6)
    result = faceMatcher.findBestMatch(resizedDetection.descriptor)
  } else {
    result = { _label: 'unknown', _distance: 1 }
  }

  if (!result || result._label == 'unknown') {
    result._label = await insertData(db, await generateDescriptor(expandT))
    result._distance = 1
  }

  await db.close()

  ctx.body = { detection, result }
})

app
  .use(router.routes())
  .use(router.allowedMethods())
  .listen(process.env.PORT || 3000)
