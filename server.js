const express = require('express');
const multer = require('multer');
const { spawn } = require('child_process');
const path = require('path');
const fsp = require('fs').promises;
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;

// Use writable directory (Pterodactyl compatible)
const BASE_UPLOAD_DIR = process.env.UPLOAD_DIR || '/home/container/uploads';

// Ensure base dirs exist
fs.mkdirSync(`${BASE_UPLOAD_DIR}/temp`, { recursive: true });
fs.mkdirSync(`${BASE_UPLOAD_DIR}/output`, { recursive: true });

const GENERIC_ERROR_MESSAGE = process.env.GENERIC_ERROR_MESSAGE;
const NO_FACES_DETECTED_ERROR_MESSAGE = process.env.NO_FACES_DETECTED_ERROR_MESSAGE;

// Start Python engine
const pythonProcess = spawn('python3', ['kirkifier.py']);

// Multer storage
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    cb(null, `${BASE_UPLOAD_DIR}/temp`);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${crypto.randomBytes(16).toString('hex')}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Invalid file type.'));
};

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter
});

// Serve static files from writable dir
app.use('/uploads', express.static(`${BASE_UPLOAD_DIR}`));
app.use(express.static('public'));

// Python stdout handler (igual a tu código)
const pendingRequests = new Map();
pythonProcess.stdout.on('data', (data) => {
  try {
    const lines = data.toString().split('\n').filter(line => line.trim());
    for (const line of lines) {
      const response = JSON.parse(line);
      const requestId = response.request_id;

      if (pendingRequests.has(requestId)) {
        const { resolve, reject, cleanup } = pendingRequests.get(requestId);
        pendingRequests.delete(requestId);
        cleanup();

        if (response.error) reject(new Error(response.error));
        else resolve(response);
      }
    }
  } catch (e) {
    console.error('Failed to parse Python response:', e);
  }
});

pythonProcess.stderr.on('data', (data) => {
  console.error('Python stderr:', data.toString());
});


// Route handler
app.post('/api/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

    const inputPath = req.file.path;
    const outputFilename = `kirkified_${Date.now()}.jpg`;
    const outputPath = path.join(`${BASE_UPLOAD_DIR}/output`, outputFilename);
    const requestId = crypto.randomUUID();

    let timeoutId;
    const responsePromise = new Promise((resolve, reject) => {
      timeoutId = setTimeout(() => {
        pendingRequests.delete(requestId);
        reject(new Error('Python process timeout'));
      }, 30000);

      pendingRequests.set(requestId, {
        resolve,
        reject,
        cleanup: () => clearTimeout(timeoutId)
      });
    });

    pythonProcess.stdin.write(JSON.stringify({
      request_id: requestId,
      target_path: inputPath,
      output_path: outputPath
    }) + "\n");

    await responsePromise;

    // Clean temp file
    await fsp.unlink(inputPath).catch(() => {});

    res.json({
      success: true,
      outputPath: `/uploads/output/${outputFilename}`,
      originalName: req.file.originalname
    });

  } catch (error) {
    const errorMessage = error.message === 'NO_FACES_DETECTED'
      ? NO_FACES_DETECTED_ERROR_MESSAGE
      : GENERIC_ERROR_MESSAGE;

    res.status(500).json({
      success: false,
      error: errorMessage
    });
  }
});


// Cleanup old output
setInterval(async () => {
  try {
    const files = await fsp.readdir(`${BASE_UPLOAD_DIR}/output`);
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    for (const file of files) {
      const filePath = `${BASE_UPLOAD_DIR}/output/${file}`;
      const stats = await fsp.stat(filePath);
      if (now - stats.mtime.getTime() > oneHour) {
        await fsp.unlink(filePath);
      }
    }
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}, 60 * 60 * 1000);


app.listen(PORT, () => {
  console.log(`Kirkify Me running on http://localhost:${PORT}`);
});
