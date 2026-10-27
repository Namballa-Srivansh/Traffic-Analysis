const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

// Serve the temp directory statically so frontend can access the output image
app.use('/temp', express.static(path.join(__dirname, 'temp')));

app.get('/api/health', (req, res) => {
    res.json({ status: 'online', engine: 'YOLOv8', timestamp: Date.now() });
});

// Ensure temp directory exists
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'temp/');
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname) || '.jpg';
        cb(null, file.fieldname + '-' + Date.now() + ext);
    }
});
const upload = multer({
    storage: storage
    // No size limits specified - allows unlimited file size for high-res video feeds
});

// Optional progress polling endpoint
app.get('/api/progress/:jobId', (req, res) => {
    const progressFile = path.join(__dirname, 'temp', req.params.jobId + '_out', 'progress.json');
    if (fs.existsSync(progressFile)) {
        try {
            const data = JSON.parse(fs.readFileSync(progressFile, 'utf-8'));
            return res.json(data);
        } catch (e) {
            return res.json({ percent: 0 });
        }
    }
    res.json({ percent: 0 });
});

app.post('/api/analyze', (req, res) => {
    upload.single('file')(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            console.error('Multer upload error:', err);
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({
                    error: 'The uploaded video exceeds the server limit (Max 10 GB). Please upload a smaller video or clip.'
                });
            }
            return res.status(400).json({ error: `Upload error: ${err.message}` });
        } else if (err) {
            console.error('Unknown upload error:', err);
            return res.status(500).json({ error: `File upload failed: ${err.message}` });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'No file received by server.' });
        }

        const jobId = (req.body && req.body.jobId) ? req.body.jobId : req.file.filename;
        const filePath = req.file.path;
        const outputDir = path.join(__dirname, 'temp', jobId + '_out');
        fs.mkdirSync(outputDir, { recursive: true });

        // Initial progress write
        try {
            fs.writeFileSync(path.join(outputDir, 'progress.json'), JSON.stringify({
                percent: 5,
                status: 'Server initializing neural vision engine...'
            }));
        } catch (e) {}

        const ext = path.extname(req.file.originalname).toLowerCase();
        const isVideo = ['.mp4', '.mov', '.avi', '.webm', '.mkv', '.m4v'].includes(ext) ||
                        (req.file.mimetype && req.file.mimetype.startsWith('video/'));

        const script = isVideo ? 'video_inference.py' : 'inference.py';
        const pythonArgs = [script, filePath, outputDir];
        if (isVideo) {
            // default frame stride = 2 for balanced CPU speed and visual smoothness
            pythonArgs.push('2');
        }

        console.log(`Starting ${script} for ${req.file.originalname} (Job: ${jobId}, ${(req.file.size / (1024 * 1024)).toFixed(1)} MB)...`);
        const pythonProcess = spawn('python', pythonArgs);

        pythonProcess.stderr.on('data', (data) => {
            console.error(`Python stderr: ${data}`);
        });

        pythonProcess.on('close', (code) => {
            console.log(`Python process finished with code ${code} for Job: ${jobId}`);
            const errorFile = path.join(outputDir, 'error.txt');
            if (fs.existsSync(errorFile)) {
                const errorMsg = fs.readFileSync(errorFile, 'utf-8');
                console.error('Inference error file content:', errorMsg);
                return res.status(500).json({ error: errorMsg });
            }

            if (isVideo) {
                const telemetryFile = path.join(outputDir, 'telemetry.json');
                let telemetry = {};
                if (fs.existsSync(telemetryFile)) {
                    try {
                        telemetry = JSON.parse(fs.readFileSync(telemetryFile, 'utf-8'));
                    } catch (e) {
                        console.error('Error reading video telemetry:', e);
                    }
                }

                const resultVideoUrl = `http://localhost:${port}/temp/${jobId}_out/result.mp4`;
                const originalVideoUrl = `http://localhost:${port}/temp/${req.file.filename}`;

                return res.json({
                    mediaType: 'video',
                    jobId: jobId,
                    video: resultVideoUrl,
                    originalVideo: originalVideoUrl,
                    counts: telemetry.counts || {},
                    summary: telemetry.summary || {},
                    timeline: telemetry.timeline || []
                });
            } else {
                const countsFile = path.join(outputDir, 'counts.json');
                let counts = {};
                if (fs.existsSync(countsFile)) {
                    try {
                        counts = JSON.parse(fs.readFileSync(countsFile, 'utf-8'));
                    } catch (e) {
                        console.error('Error reading image counts:', e);
                    }
                }

                // Return the URL to the image so the frontend can render it directly
                const resultImageUrl = `http://localhost:${port}/temp/${req.file.filename}_out/result.jpg`;

                return res.json({
                    mediaType: 'image',
                    jobId: req.file.filename,
                    image: resultImageUrl,
                    counts: counts
                });
            }
        });
    });
});

// Global Express error handler to ensure JSON error responses
app.use((err, req, res, next) => {
    console.error('Express error:', err);
    res.status(500).json({ error: err.message || 'An unexpected server error occurred.' });
});

const server = app.listen(port, () => {
    console.log(`Backend listening at http://localhost:${port}`);
});
// Set timeout to 15 minutes for large video uploads & multi-frame tracking
server.setTimeout(900000);
