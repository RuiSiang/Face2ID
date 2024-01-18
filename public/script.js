document.addEventListener("DOMContentLoaded", function () {
  const video = document.getElementById('video');
  const canvas = document.getElementById('canvas');
  const context = canvas.getContext('2d');
  const captureButton = document.getElementById('capture');
  const resetButton = document.getElementById('reset');
  const labelDisplay = document.getElementById('label');
  let stream = null;

  if (isMobileDevice()) {
    // For mobile devices
    document.getElementById('toggleCamera').style.display = 'block';
    startWebcam(); // Start with default camera
  } else {
    // For PC users
    document.getElementById('cameraOptions').style.display = 'block';
  }

  function populateCameraSelect() {
    navigator.mediaDevices.enumerateDevices()
      .then(devices => {
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        const cameraSelect = document.getElementById('cameraSelect');
        videoDevices.forEach((device, index) => {
          let option = document.createElement('option');
          option.value = device.deviceId;
          option.text = device.label || `Camera ${index + 1}`;
          cameraSelect.appendChild(option);
        });
      })
      .catch(err => console.error("Error listing devices:", err));
  }

  document.getElementById('cameraSelect').addEventListener('change', function () {
    startWebcam(this.value);
  });

  // Function to start the webcam
  function startWebcam(deviceId = null, useFrontCamera = true) {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    let constraints = {
      video: {}
    };
    if (isMobileDevice()) {
      // For iOS, specifying the exact camera is often necessary
      constraints.video = {
        facingMode: useFrontCamera ? 'user' : 'environment',
        deviceId: deviceId ? { exact: deviceId } : undefined
      }
    } else {
      // For non-mobile devices, or as a fallback
      constraints.video = {
        deviceId: deviceId ? { exact: deviceId } : undefined, width: 1280, height: 720
      };
    }
    navigator.mediaDevices.getUserMedia(constraints)
      .then(localStream => {
        stream = localStream;
        video.srcObject = localStream;
      })
      .catch(err => {
        console.error("Error accessing webcam:", err);
        alert("Could not access the camera. Error: " + err.message);
      });
  }

  // function adjustCanvasDisplaySize() {
  //   // Adjust the canvas display size to maintain aspect ratio
  //   const aspectRatio = video.videoWidth / video.videoHeight;
  //   canvas.style.width = '100%';
  //   canvas.style.height = `${canvas.offsetWidth / aspectRatio}px`;
  // }

  // video.onplay = () => {
  //   // Set canvas size when the video starts playing
  //   canvas.width = video.videoWidth;
  //   canvas.height = video.videoHeight;
  //   adjustCanvasDisplaySize();
  // };

  // window.addEventListener('resize', adjustCanvasDisplaySize);

  captureButton.addEventListener('click', function () {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);

    const imageDataUrl = canvas.toDataURL('image/jpeg');
    const base64Image = imageDataUrl.split(',')[1];

    fetch('/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64: base64Image })
    })
      .then(response => response.json())
      .then(data => displayResults(data, context))
      .catch(err => console.error("Error processing image:", err));

    // Reset canvas display size after capture
    captureButton.style.display = 'none';
    resetButton.style.display = 'block';
  })

  // Reset functionality
  resetButton.addEventListener('click', function () {
    context.clearRect(0, 0, canvas.width, canvas.height);
    resetButton.style.display = 'none';
    captureButton.style.display = 'block';
    displayLabel();
  });

  // Display label
  let showSemanticLabel = false;
  function toggleLabelDisplay() {
    showSemanticLabel = !showSemanticLabel;
    displayLabel();
  }
  function displayLabel() {
    const labelDisplay = document.getElementById('label');
    if (showSemanticLabel && semanticLabel || !showSemanticLabel && uuidLabel) {
      labelDisplay.textContent = showSemanticLabel ? semanticLabel : uuidLabel;
    } else if (!semanticLabel && !uuidLabel) {
      labelDisplay.textContent = `Click to copy label ${showSemanticLabel ? '(semantic mode)' : '(uuid mode)'}`
    }
  }

  // Function to display results
  let uuidLabel = '';
  let semanticLabel = '';
  function displayResults(data, context) {
    const det = data.detection;
    const box = det.detection._box;

    // Draw bounding box
    context.strokeStyle = 'red';
    context.lineWidth = 3;
    context.strokeRect(box._x, box._y, box._width, box._height);

    // Draw landmarks
    if (det.landmarks) {
      context.fillStyle = 'blue';
      det.landmarks._positions.forEach(pos => {
        context.beginPath();
        context.arc(pos._x, pos._y, 2, 0, 2 * Math.PI);
        context.fill();
      });
    }

    // Display face label and angles
    const label = data.result.label;
    const angle = det.angle;

    context.fillStyle = 'yellow';
    context.font = '12px Arial';
    context.fillText(`Label: ${label}`, box._x, box._y - 20);
    context.fillText(`Distance: ${Math.round(data.result.distance * 100) / 100}, Roll: ${angle.roll}°, Pitch: ${angle.pitch}°, Yaw: ${angle.yaw}°`, box._x, box._y - 5);

    const rollThreshold = 45;
    const pitchThreshold = 10;
    const yawThreshold = 15;

    if (data.result) {
      uuidLabel = data.result.label || '';
      semanticLabel = data.result.semantic || '';
    }
    displayLabel(uuidLabel);

    if (Math.abs(angle.roll) > rollThreshold) {
      alert(`Face roll should not exceed ${rollThreshold}°`)
    }
    if (Math.abs(angle.pitch) > pitchThreshold) {
      alert(`Face pitch should not exceed ${pitchThreshold}°`)
    }
    if (Math.abs(angle.yaw) > yawThreshold) {
      alert(`Face yaw should not exceed ${yawThreshold}°`)
    }
  }

  // Event listener to copy label
  labelDisplay.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(labelDisplay.textContent);
      alert('Label copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy: ', err);
      alert('Failed to copy label');
    }
  });

  video.addEventListener('webkitenterfullscreen', function () {
    document.webkitExitFullscreen();
  });

  function isMobileDevice() {
    function hasTouchSupport() {
      return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    }
    if (hasTouchSupport()) {
      return true
    } else {
      return false
    }
  }

  let usingFrontCamera = true;
  document.getElementById('toggleCamera').addEventListener('click', function () {
    usingFrontCamera = !usingFrontCamera;
    startWebcam(null, usingFrontCamera);
  });

  document.querySelector('.info-icon').addEventListener('click', function () {
    var popup = document.querySelector('.popup-content');
    popup.style.display = popup.style.display === 'block' ? 'none' : 'block';
  });

  document.getElementById('toggleLabelButton').addEventListener('click', toggleLabelDisplay);

  populateCameraSelect();
  startWebcam();
});
