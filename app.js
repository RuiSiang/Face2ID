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
const fs = require('fs')

const app = new Koa()
const router = new Router()
const debugLevel = process.env.DEBUG || 1
const rollThreshold = process.env.ROLL_THRESHOLD || 15
const pitchThreshold = process.env.PITCH_THRESHOLD || 10
const yawThreshold = process.env.YAW_THRESHOLD || 45

const bip0039 = JSON.parse(fs.readFileSync('bip-0039.json'))
const randomSemantic = () => {
  let result = [];
  let usedIndices = new Set();
  while (result.length < 4) {
    let randomIndex = Math.floor(Math.random() * bip0039.length);

    if (!usedIndices.has(randomIndex)) {
      result.push(bip0039[randomIndex]);
      usedIndices.add(randomIndex);
    }
  }
  return result.join(' ')
}

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
  await faceapi.nets.faceExpressionNet.loadFromDisk(path.join(process.cwd(), 'models'))
  console.log('Models Loaded')
  const db = await openDb()
  const createSchema = `
CREATE TABLE IF NOT EXISTS biometrics (
    uuid VARCHAR(36) PRIMARY KEY,
    timestamp TEXT,
    semantic VARCHAR(64),
    descriptor TEXT,
    UNIQUE (semantic)
)`
  await db.run(createSchema)
  await db.close()
  console.log('Database Ready')
}
init()


const insertData = async (db, descriptor) => {
  const uuid = Uuid.v4()
  const timestamp = moment().toISOString()
  const semantic = randomSemantic()
  try {
    const sql = `INSERT INTO biometrics (uuid, timestamp, descriptor, semantic) VALUES (?, ?, ?, ?)`
    await db.run(sql, [uuid, timestamp, descriptor, semantic])
    if (debugLevel > 0) {
      console.log(`Entry ${uuid} added to the table: ${timestamp}`)
    }
    return {
      uuid, semantic
    }
  } catch (err) {
    console.error(err.message)
  }
}

const queryDataAndCount = async (db) => {
  try {
    // Query to select the rows
    const sqlQuery = `SELECT uuid, descriptor, semantic FROM biometrics ORDER BY timestamp DESC`;
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

  const detection = await faceapi.detectSingleFace(expandT).withFaceLandmarks().withFaceDescriptor().withFaceExpressions()
  const resizedDetection = faceapi.resizeResults(detection, displaySize)

  const expression = ((Object.entries(detection.expressions).reduce((acc, val) => ((val[1] > acc[1]) ? val : acc), ['', 0])).slice(0, 2))

  const db = await openDb()
  const { entries, count } = await queryDataAndCount(db)

  const labeledFaceDescriptors = entries.map(entry => {
    return new faceapi.LabeledFaceDescriptors(`${entry.uuid}|${entry.semantic}`, [base64ToFloat32Array(entry.descriptor)])
  })

  let result
  if (labeledFaceDescriptors.length > 0) {
    const faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors, 0.4)
    result = faceMatcher.findBestMatch(resizedDetection.descriptor)
    const [label, semantic] = result._label.split('|')
    result = { label, semantic, distance: result._distance }
  } else {
    result = { label: 'unknown', semantic: 'unknown', distance: 1 }
  }


  const { roll, pitch, yaw } = detection.angle
  if (expression[0] != 'neutral' || expression[1] < 0.90 || Math.abs(roll) > rollThreshold || Math.abs(pitch) > pitchThreshold || Math.abs(yaw) > yawThreshold) {
    result = { label: 'unknown', semantic: 'unknown', distance: 1 }
  } else {
    if (!result || !result.label || result.label == 'unknown') {
      try {
        const { uuid, semantic } = await insertData(db, await generateDescriptor(expandT))
        result = { label: uuid, semantic, distance: 0 }
      } catch (err) {
        result = { label: 'unknown', semantic: 'unknown', distance: 1 }
      }
    }
  }
  await db.close()

  ctx.body = { detection, result, expression }
})

router.get('/wordlist', async (ctx, next) => {
  ctx.status = 200
  ctx.type = 'application/json'
  ctx.body = bip0039
})

app
  .use(router.routes())
  .use(router.allowedMethods())
  .listen(process.env.PORT || 3000)
