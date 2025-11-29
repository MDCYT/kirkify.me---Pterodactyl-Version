const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const preview = document.getElementById('preview');
const previewImage = document.getElementById('previewImage');
const fileName = document.getElementById('fileName');
const uploadBtn = document.getElementById('uploadBtn');
const btnText = document.getElementById('btnText');
const btnSpinner = document.getElementById('btnSpinner');
const errorMsg = document.getElementById('errorMsg');
const uploadSection = document.getElementById('upload-section');
const resultSection = document.getElementById('result-section');
const resultImage = document.getElementById('resultImage');
const downloadBtn = document.getElementById('downloadBtn');
const newImageBtn = document.getElementById('newImageBtn');

let selectedFile = null;

// Drag and drop handlers
dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    handleFile(files[0]);
  }
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    handleFile(e.target.files[0]);
  }
});

function handleFile(file) {
  // Validate file type
  if (!file.type.startsWith('image/')) {
    showError('Please select an image file (JPEG, PNG, or GIF)');
    return;
  }

  // Validate file size (10MB limit)
  if (file.size > 10 * 1024 * 1024) {
    showError('File size must be less than 10MB');
    return;
  }

  selectedFile = file;
  errorMsg.classList.add('hidden');

  // Show preview
  const reader = new FileReader();
  reader.onload = (e) => {
    previewImage.src = e.target.result;
    fileName.textContent = file.name;
    preview.classList.remove('hidden');
    uploadBtn.disabled = false;
  };
  reader.readAsDataURL(file);
}

uploadBtn.addEventListener('click', async () => {
  if (!selectedFile) return;

  setLoading(true);
  hideError();

  const formData = new FormData();
  formData.append('image', selectedFile);

  try {
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (result.success) {
      showResult(result.outputPath);
    } else {
      showError(result.error || 'Kirkification FAILED for some reason');
    }
  } catch (error) {
    showError('Network error. Please try again.');
    console.error('Upload error:', error);
  } finally {
    setLoading(false);
  }
});

function setLoading(isLoading) {
  uploadBtn.disabled = isLoading;
  btnText.textContent = isLoading ? 'Kirkifying...' : 'Kirkify';
  btnSpinner.classList.toggle('hidden', !isLoading);
}

function showError(message) {
  errorMsg.textContent = message;
  errorMsg.classList.remove('hidden');
}

function hideError() {
  errorMsg.classList.add('hidden');
}

function showResult(imagePath) {
  resultImage.src = imagePath;
  downloadBtn.href = imagePath;
  uploadSection.classList.add('hidden');
  resultSection.classList.remove('hidden');
}

newImageBtn.addEventListener('click', () => {
  // Reset form
  selectedFile = null;
  fileInput.value = '';
  preview.classList.add('hidden');
  uploadBtn.disabled = true;
  uploadSection.classList.remove('hidden');
  resultSection.classList.add('hidden');
});


document.addEventListener('DOMContentLoaded', () => {
  const audio = document.getElementById('bgAudio');
  if (!audio) return;

  audio.volume = 0.3;


  const toggleBtn = document.createElement('button');
  toggleBtn.textContent = '🔊';
  toggleBtn.style.cssText = 'position:fixed;top:10px;right:10px;z-index:1000;padding:8px;font-size:16px;cursor:pointer;';
  
  toggleBtn.onclick = () => {
    audio.muted = !audio.muted;
    toggleBtn.textContent = audio.muted ? '🔇' : '🔊';
  };
  
  document.body.appendChild(toggleBtn);
  // try and play on first load
  audio.play().catch(e => {
    toggleBtn.textContent = '🔇'
  });


  document.addEventListener('click', () => {
    audio.play().catch(e => console.log('Autoplay blocked:', e.message));
    toggleBtn.textContent = '🔊'
  }, { once: true });
});
document.body.appendChild(toggleBtn);