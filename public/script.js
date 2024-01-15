document.addEventListener("DOMContentLoaded", function () {
  const video = document.getElementById('video');
  const canvas = document.getElementById('canvas');
  const context = canvas.getContext('2d');
  const captureButton = document.getElementById('capture');
  const resetButton = document.getElementById('reset');
  const labelDisplay = document.getElementById('label');
  let stream = null;

  // Function to start the webcam
  function startWebcam() {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }

    let constraints = {
      video: { facingMode: "user", aspectRatio: { ideal: 1 } }
    };

    navigator.mediaDevices.getUserMedia(constraints)
      .then(localStream => {
        stream = localStream;
        video.srcObject = localStream;
      })
      .catch(err => {
        console.error("Error accessing webcam:", err);
        alert("Could not access the camera");
      });
  }

  function adjustCanvasDisplaySize() {
    // Adjust the canvas display size to maintain aspect ratio
    const aspectRatio = video.videoWidth / video.videoHeight;
    canvas.style.width = '100%';
    canvas.style.height = `${canvas.offsetWidth / aspectRatio}px`;
  }

  video.onplay = () => {
    // Set canvas size when the video starts playing
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    adjustCanvasDisplaySize();
  };

  window.addEventListener('resize', adjustCanvasDisplaySize);

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
    context.clearRect(0, 0, canvas.width, canvas.height); // Clear the canvas
    // startWebcam(); // Restart the webcam
    resetButton.style.display = 'none';
    captureButton.style.display = 'block';
    displayLabel('Click to copy label');
  });

  // Display label
  function displayLabel(label) {
    labelDisplay.textContent = label;
    labelDisplay.style.display = 'block';
  }

  // Function to display results
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
    const label = data.result._label;
    const angle = det.angle;
    context.fillStyle = 'yellow';
    context.font = '12px Arial';
    context.fillText(`Label: ${label}`, box._x, box._y - 20);
    context.fillText(`Distance: ${Math.round(data.result._distance * 100) / 100}, Roll: ${angle.roll}°, Pitch: ${angle.pitch}°, Yaw: ${angle.yaw}°`, box._x, box._y - 5);

    if (data.result && data.result._label) {
      displayLabel(data.result._label);
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

  startWebcam();
});
