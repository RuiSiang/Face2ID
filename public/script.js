const imageUpload = document.getElementById('imageUpload')

Promise.all([
  faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
  faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
  faceapi.nets.ssdMobilenetv1.loadFromUri('/models'),
  faceapi.nets.faceExpressionNet.loadFromUri('/models'),
  faceapi.nets.ageGenderNet.loadFromUri('/models')
]).then(start)

async function start() {
  const container = document.createElement('div')
  container.style.position = 'relative'
  document.body.append(container)
  const labeledFaceDescriptors = loadLabeledImages()
  const faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors, 0.6)
  let image
  let canvas
  document.body.append('Loaded')
  imageUpload.addEventListener('change', async () => {
    if (image) image.remove()
    if (canvas) canvas.remove()
    image = await faceapi.bufferToImage(imageUpload.files[0])
    container.append(image)
    canvas = faceapi.createCanvasFromMedia(image)
    container.append(canvas)
    const displaySize = { width: image.width, height: image.height }
    faceapi.matchDimensions(canvas, displaySize)
    const detections = await faceapi.detectAllFaces(image).withFaceLandmarks().withFaceExpressions().withAgeAndGender().withFaceDescriptors()
    const resizedDetections = faceapi.resizeResults(detections, displaySize)
    faceapi.draw.drawFaceLandmarks(canvas, resizedDetections)
    const minProbability = 0.2
    faceapi.draw.drawFaceExpressions(canvas, resizedDetections, minProbability)
    const results = resizedDetections.map(d => faceMatcher.findBestMatch(d.descriptor))
    for (let i = 0; i < results.length; i++) {
      const { age, gender, genderProbability } = resizedDetections[i]
      new faceapi.draw.DrawTextField(
        [
          results[i].toString(),
          `${Math.round(age, 0)} years`,
          `${gender} (${Math.round(genderProbability)})`,
        ],
        resizedDetections[i].detection.box.topLeft,{
          anchorPosition: 'BOTTOM_LEFT',
        }
      ).draw(canvas)
      const box = resizedDetections[i].detection.box
      const drawBox = new faceapi.draw.DrawBox(box)
      drawBox.draw(canvas)
    }
  })
}

function float32ArrayToBase64(float32Array) {
  let buffer = float32Array.buffer
  let binary = ''
  let bytes = new Uint8Array(buffer)
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return window.btoa(binary)
}

function base64ToFloat32Array(base64) {
  let binary = window.atob(base64)
  let buffer = new ArrayBuffer(binary.length)
  let bytes = new Uint8Array(buffer)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Float32Array(buffer)
}

const testDescriptors = {
  'Black Widow': 'slQGviPEdD24PMc9VoYvvvX6gL1VThC8pIwavS7tn70SWG0+dlQBvlMCHT785W49LwmPvkZChzy71/G8qvUmPo7CKr5C9Hq9ZgVHvYREXbwNJe89itUUPmNyA7wBAvs9vh1SvQLhjb6hbwG+uOCavJrKJL5LSuy9llqAPX073j2dNAO+0KXBungqDb17hwQ+goW/vdi9Gb6qc+Y9hjG0PdRHV75NqtK7EOf4PAAnkD4wFG0+wsSlPFqurzzOQKO9HELePZvWwL6Axza83Jf1PYDRw7z69Fg9xgkoPVWLaL6Afow9WiF/PS0KaL6WXdM8lnqgPSiIhr40hL08j0T5vFDqXD4dfSQ+YwQYvi/LKb53oSg+qkBOvgqZtL0BZNY9T+ASvvUeVb6raoq+6qg3PXQ4sj4NBhg+igWZvc9Phj3onOu96JG+PDCrGbyxaV0+9tkEPbgOIrs72/u9P9wcPZm1TD6+DhO8QNSIO4VRwj40x1Q9Pv5TvNAG3jzHmXE9RYG6vSS1gTwIKfO9n5oJPasd+Lw05G69yK20PPK3Cz6nOjO+ulRlPkzcn72rMhi9/8crvZszGb5ZY6i9Q4bEO6sEID5f+HG+hLvMPSW3Fz4jXtk9X0FIPpIf+zwrpBo+wo3ovOVpxr1V/2O+dlWyPKEDbz1wGMw64jeyPFBdVj0=',
  'Captain America': 'UIkZvvfhMj67o/g9eGNDvVYrRr6RhS49zv1FvURhELu7TwI8MZSDPYROcD65Eta8AjazvghXCzwfZf48g1HyPY24Mb6B3sm9VweTvekon70JLQU9YxtxPVLoM70XtZ09bgtRvv2oor7RYhu9cMAGvnTDTj02Ity94OQ4POYcbDwEjCy+LtZXvdhjfD3Av4M9ZsUZvcbk4r2kR34+mPCCPBem8L0b9PE9JVWwPUnjqz5RqtU9XDwFPTCWwz2yUqK8PYfRPY79Ur688O89YrFlPpVQJj4Mf4U9SkQ1PRd3Tr5XvRw9lBUVPmeHm753Qvg9ICnDPUBIN73bQGw8vrcEvqSZLj6MAqQ98z20vQMcNb55p/Y9vUAJvtwRi71Z/Y89Yg8uvvTLCb5EuYC+7rrVPQ9yqz4BTDk+tZ2EvkRHNbzF0oW96v3VvTHjCT0m1zs9SizHvGp3zL1S5K69O4cuPWFkYT4Keyu7HWYuPVa1ez42qQ4+LgPHvayCNT06Ema8elw8vgpYfr0wZYi9VIHOO7t71r0TcBG+OvPVO6cvvT1K6XK+VMUaPoQBATxCjJi99BfWvbY5wDwMMAy+x8VuvUe/Wj5wqIu+JwxSPqBaRD4nBQU9VBXCPZh5hD2IV5c94fgGvJ55nDwuAvq9hm4Avp+6mj29SL29+t1uPZfISj0=',
  'Captain Marvel': '/ytOvajUET6h7ki8QBkIvlmWDr55rGw96b+SvU3/471EpXk+YDa6vTgEFj6Jtfk8rANQvvzXEjxZgAi8JgTIPXV2Ub5t1jm+iatpvFupmrt7QDM9dduQvCsBtLyfcrg9/iTnvdtYrL5KRFa9/49gvNjolz0sqTm93MuKvewRrT1QCz2+9Oaku9iLhj1om24+Qgk1vWz16L29gzI+p2bqPDBkMr6VLwW8k/u+O95Hjj5YfoY+v7AYvLwN8jw4T6K9ayAhPn29hr644uk9BkRJPgFEmz0EvIM9ATXcPZKrYb6AM607OIbFPUrkNr5oc/28ni9vPZ7bvb0dbyC8+gA2vjZAUD4SpQg+sXmdvWd+P76pMng+3csFvk7Hlb2YsAY9eOTivRqrF76E3GS+OHF2PFBisz4lH4A+9+FEvuXSiz3Hkqq9ywJYvbScfTw1sS09PMjvO6zRwzwtRhe+oJoJPJBXaj4wVly7ND3jOyxlTj5TFHE83KoavcjPfD0J0iA9OlEXvqDI2DwotIC+tlTGvR9nDr24C6+9ns95vHRxJj6WCYO+TBc+Pti2ublRiEC9VHREvYF6m71LGMi9Vqpku2GESz4/OJq+2gYsPtb8/j3omcU9CmpTPhyp/DwUobQ9xCSQPMBi5r1uVS2+pD/YvSB0Nr3ITic8gAvuurvU2j0=',
  'Jim Rhodes': 'QsirvcZlMz7zjTY94LP7vEwoFz1ofnq94FeMu5smub2thCE+AXKTvcCjmj6NUUU9vWIYvgFXw704VZ492IdSPbC1nL6quMK8Mz7jvfdMU71eH6S8BvKqPUkHlj3Tn4o8EiBjvc7mfr4UMKy9UWkavkUZAj4Dj6S9lPqlvHhwgzzX6TS+bS5Vvd9Jorw7y7K9/gqQPb5yEDxpOFw+MlwgPRdphL3xBxa891mCvKtBlz7NfH4+bMO1PIF1c721pG89yLlaPc0YML7yKj09m/a7PSHkPT6Anzw900iuPH0+TL7i4FK95jwGPCNS2b39sjo9xFGIPQdyrb2GwPO8KD6yO3LylT7mEYM9ov3nvfrdHb4iqKw9yAnKveOIS72ij5I9iuAnvso0j73nyF++PdSOPRs7jj6+ANk9xrFUvpbMaLzNgT2+reD3vHh7Wbomqfs8yjXhvSxO3DvAlZm96rqFvGufDD6D1rY84+vgvWkkdj7by4a9cuqVvFRv5zuRJBO+FCyGO73RaL0p3am9zLXsu1JpDzu0tgK+lI9CvTIkLj7CIma+zUvIPbhC0Tn+8oI8UcQPPWkBnj08kty9W6lvvaMiKD6pPoK+H6RmPlByLD5hKIM9H8L4PTZIULwPx889xpdlvRdn4j29WN29aiCZvRvugz2XhwW9IS7KPYiJrTw=',
  'Tony Stark': 'U9iNvRp0tj2+0jY+ZAYEvRfEqTwzaJu9dtwtvZGVAb5OBuQ9vt2vvWmQkD67nDI9FE1svvoYObw0jGO9zF3ZPYraVb7U2Iy94QbXvdSkDL1a23m9znqqPZwurT2mjso8YKMFvjRBqr7O0RK+qC+/ver/fT0CNqm9Xkwqu+c5izxfEiS+DDnRvF24rzz41m08sBiCvWu2tb2VRjU+HiuLPT/WDb57vwg83qNtPQcgoz7d+2U+CSwlPfEhcj0eWfW9fmtqPe8Pgb6UhgA+hdn9PQD/1j3AYrk9JuYVPl22G75Nu2Y9ThXxPX32IL7y7689aLSYPZEtlz34cp89Wc2PPRxjID5mWD49mUUbvgbllL1gOKk9jqMivhB5E70jObA9vQqkvbOxTb7muI2+ybiZPEHq0T7LdyY+tXYqvon5vjzvLw++SwIGvpGWfD1ryR4927AVvim7MrzjXQK+TFonPT6tSz4Vto49lLLPvPLOgT7FZs28XTSvvROXOD2U67Q9GTFKvpT2Wjt+Bxi+aLHUvVT6Dj0HJOe8DuI1vbmKAD4X94G+jktqPkWKoTyb1pK9p8UvPZYjvbyn7wa+gq/tO+dNKD5i24O+Wg4MPtqhIz5cxGc9fN3yPb7Ewz2QdM+60jAnvXD/Qb1oGd69UzaovaUzwjxUT3C95gTnPeydPrs=',
  'Hawkeye': 'UVbzvfC19j0PoiI96XqcvAL9Q73qF4I7kitDPSAsFL7bkHE+XoKgvZf1Iz6iG528GW1/vtzzJr4p57c9XQAsPoSc2r164hy+oSg0vrCUA75ojEG9V8MHvbaW2Lzc58c9zwopvj1por5pLKO9vBqkvYN9K704x3W9ueXjvAq00z0kqBG+eiIJvk1voT29IiU+seu6vWIUSb2Uyl8+6CuDvSJPDb7wxV29yFi3PQJThT6RKDk+QlOCPOtL7TxFz7i8XHhNPpueQL5OvIA9m3kaPsQX2z0Zl949fCv1PdxpJL4ClZe8E0dvPnbqRL7gtRk9nz0FPfgZer4sZwW+BhmVva6dRD7OICo+1/T+vdE4D77/ZWc+012ivaCjobxyZ/A8rocKvqFDG76hk5S+pRyHPeNE3D7fmvw90NFIviY2cL27OU696F8PvWsBvTz25cU9XQhrvRTzlr2S84G9AENDPf6GJz5WoYI9gJE2uJb7KT5Qolu79HQQvLQa5rzgoWC8SyQSvhYdmDu2mRq+Mm0xvTpumj3L4Wu9hrttPfADqz1FACe+0/9DPi1UWj1iFDk9/j2hvFpZEr2GZdG9Vx/gPNi2Oz5tKnC+nkxHPmRi4D1Imya832cYPnJw6DwnU6Q9wrTKPC5Ai73N5ki+IyqOvcJFzz206Lq8E4XMPV7hHj0=',
  'Thor': '1JOmvUaR7j1MvHs9kvmHvQS6lb3XJ0S8E0aFO6G6cb2/wN490oEFPRxpjT4NpKK9SQGCvh/+Ib0iuv88uNpRPZ4KJb4ItNu99vUSvSpaNb2oOus8uSe3PL5AgTyD4vk9RNqwvVPfir5NQIC9zh0mvhk/yT0WUkG++lfOOx4rLT1/B0++jtHYvCezgrxIuZI6v9jfvdVLDb5r14Y+VzM4vLISw71HTC69ChhXvdv0kT6W6gk+C7qDvCGDrjxwQIO98D7OPakRMr5hNP89NVNqPkmKCz42eIE9MFsuvCdlJb4HgMY8Fo/5PamVcr7U1AE+4SeVPVU5gb3OqtW8R9bQvYzFPT5JEcw91melvarwP76kaeo90LLPvSD3jr2hZSI+AXgwvv5qP76sATS+z8k/PfftnD41e5s9h3RXvmJ3N7zi+Qe+0EypvY2mRz0ENDs9tvdGvV54p71vogC+1JwsPbH5Pz7u6RS9qL6RvQ4LRT5accC83rUwvU7vgTweqQq88DlsveYlLT0e9TS9YJI0vAvKI7u1HsG9KAKkvTT2wz3X1EG+h3grPgoNdj1MmPY6VL+LvNPItr09bRK+LZzFvPTeUT6c8pm+8213PmALyz1EEcs9/d3YPTZEOryMRZg9LP8avA2dnb3iGVK+p4hQvN2H5D1asdQ8FnXUPO4cujs='
}

const generateDescriptor = async (img) => {
  const detections = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor()
  console.log(float32ArrayToBase64(detections.descriptor))
  return (float32ArrayToBase64(detections.descriptor))
}

function loadLabeledImages() {
  return Object.keys(testDescriptors).map(label => {
    return new faceapi.LabeledFaceDescriptors(label, [base64ToFloat32Array(testDescriptors[label])])
  })
}
