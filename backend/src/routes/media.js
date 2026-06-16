const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Multer for multipart/form-data uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

const { verifyToken } = require('../middleware/authMiddleware');

// Upload media (POST /api/media/upload) — JWT required to prevent anonymous abuse
// Supports BOTH:
//   1) multipart/form-data with file field (from XHR/FormData)
//   2) JSON body with { file: "base64...", mediaType: "image" }
router.post('/upload', verifyToken, upload.single('file'), async (req, res) => {
  try {
    const mediaType = req.body.mediaType || 'auto';
    const resourceType = mediaType === 'audio' ? 'video' : (mediaType === 'video' ? 'video' : 'auto');

    let uploadSource;

    if (req.file) {
      // Multipart upload - file is in memory buffer
      uploadSource = await new Promise((resolve, reject) => {
        const uploadOpts = { folder: 'trave-social', resource_type: resourceType };
        // Enable chunked upload for large files (>6MB) to bypass Cloudinary single-upload limits
        const isLarge = req.file.buffer.length > 6 * 1024 * 1024;
        if (isLarge) {
          uploadOpts.chunk_size = 6 * 1024 * 1024;
        }
        const stream = isLarge
          ? cloudinary.uploader.upload_large_stream(
              uploadOpts,
              (error, result) => {
                if (error) reject(error);
                else resolve(result);
              }
            )
          : cloudinary.uploader.upload_stream(
              uploadOpts,
              (error, result) => {
                if (error) reject(error);
                else resolve(result);
              }
            );
        stream.end(req.file.buffer);
      });
    } else {
      // JSON body - base64 data URI or remote URL
      const file = req.body.file || req.body.image;
      if (!file) {
        return res.status(400).json({ success: false, error: 'No file provided' });
      }
      uploadSource = await cloudinary.uploader.upload(file, {
        folder: 'trave-social',
        resource_type: resourceType
      });
    }

    return res.json({
      success: true,
      url: uploadSource.secure_url,
      secureUrl: uploadSource.secure_url,
      data: {
        url: uploadSource.secure_url,
        width: uploadSource.width,
        height: uploadSource.height,
        format: uploadSource.format,
        resourceType: uploadSource.resource_type
      }
    });
  } catch (err) {
    console.error('❌ Media upload error:', err.message);
    return res.status(500).json({ success: false, error: 'Operation failed' });
  }
});

module.exports = router;
