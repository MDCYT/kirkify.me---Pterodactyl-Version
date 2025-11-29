const express = require('express');
const multer = require('multer');
const { spawn } = require('child_process');
const path = require('path');
const fsp = require('fs').promises;
const crypto = require('crypto');


const app = express();
const PORT = process.env.PORT || 3000;
const GENERIC_ERROR_MESSAGE = process.env.GENERIC_ERROR_MESSAGE;
const NO_FACES_DETECTED_ERROR_MESSAGE = process.env.NO_FACES_DETECTED_ERROR_MESSAGE;

// Start up the actual kirkification engine in the background
const pythonProcess = spawn('python3', ['kirkifier.py']);
// For optimization purposes, requests are stored here and processed on a first come first serve basis
const pendingRequests = new Map();

// Set up storage object
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    // Uploads are stored in uploads/temp
    const uploadDir = 'uploads/temp';
    await fsp.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Files are given a unique to avoid conflicts and to stop those darn path traversal attacks
    const uniqueName = `${crypto.randomBytes(16).toString('hex')}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

// File filter (only images) 
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    console.log(`Rejected non-image file: ${file.originalname} (mimetype: ${file.mimetype})`);
    cb(new Error('Invalid file type. Only JPEG, PNG, and GIF images are allowed.'));
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB 
  },
  fileFilter: fileFilter
});


app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));



// This is where the magic happens (This runs every time the kirkifier outputs on stdout)
pythonProcess.stdout.on('data', (data) => {
  try {

    const lines = data.toString().split('\n').filter(line => line.trim());

    for (const line of lines) {

      const response = JSON.parse(line);
      const requestId = response.request_id;
      
      if (pendingRequests.has(requestId)) {
        // Pull back up the request object
        const { resolve, reject, cleanup } = pendingRequests.get(requestId);
        // Remove it from the queue
        pendingRequests.delete(requestId);
        cleanup();
        
        if (response.error) {
          reject(new Error(response.error));
        } else {
          // Send back output path
          resolve(response);
        }
      }
    }
  } catch (e) {
    console.error('Failed to parse Python response:', e);
  }
});


pythonProcess.stderr.on('data', (data) => {
  const stderrText = data.toString().trim();
  console.error('Python stderr:', stderrText);
  
  try {
    const errorData = JSON.parse(stderrText);
    
    // If it has a request_id, reject the specific pending request
    if (errorData.request_id && pendingRequests.has(errorData.request_id)) {
      const { reject, cleanup } = pendingRequests.get(errorData.request_id);
      pendingRequests.delete(errorData.request_id);
      cleanup();
      reject(new Error(errorData.error || 'Unknown Python error'));
    }
    
    
    
  } catch (e) {
    console.error(`ERROR: ${stderrText}`);
  }
});

pythonProcess.on('error', (err) => {
  console.error('Python process died:', err);
  
  pendingRequests.forEach(({ reject, cleanup }) => {
    cleanup();
    reject(new Error('Python process crashed'));
  });
  pendingRequests.clear();
});

// Basically all this does is add the incoming request to the queue 
app.post('/api/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    // The file will be saved as kirkified_(current time).jpg
    const inputPath = req.file.path;
    const outputFilename = `kirkified_${Date.now()}.jpg`;
    const outputPath = path.join('uploads/output', outputFilename);
    const requestId = crypto.randomUUID();

    console.log(`received '${req.file.originalname}' as ${req.file.filename}`);

    await fsp.mkdir('uploads/output', { recursive: true });
    
    // Create promise with timeout
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

    // Send to kirkifier through stdin
    pythonProcess.stdin.write(JSON.stringify({
      request_id: requestId,
      target_path: inputPath,
      output_path: outputPath
    }) + "\n");

    // Wait for response
    await responsePromise;
    
    // Clean up temp file
    await fsp.unlink(inputPath).catch(() => {});
    

    res.json({
      success: true,
      outputPath: `/uploads/output/${outputFilename}`,
      originalName: req.file.originalname
    });

  } catch (error) {

    if (error?.message !== 'NO_FACES_DETECTED') {
      console.error('Upload error:', error);
    }
    
    // If no faces are detected (a shockingly common problem) then return an error, otherwise return a generic error
    const errorMessage = error.message === 'NO_FACES_DETECTED' ? NO_FACES_DETECTED_ERROR_MESSAGE : GENERIC_ERROR_MESSAGE;

    res.status(500).json({ 
      success: false, 
      error: errorMessage 
    });
  }
});

// Once an hour delete kirkified images
setInterval(async () => {
  try {
    const outputDir = 'uploads/output';
    const files = await fsp.readdir(outputDir);
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    for (const file of files) {
      const filePath = path.join(outputDir, file);
      const stats = await fsp.stat(filePath);
      if (now - stats.mtime.getTime() > oneHour) {
        await fsp.unlink(filePath);
        console.log(`Cleaned up old file: ${file}`);
      }
    }
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}, 60 * 60 * 1000);


app.listen(PORT, () => {
  console.log(`Kirkify Me running on http://localhost:${PORT}`);
});