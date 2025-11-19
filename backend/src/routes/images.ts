import { Router, type Response } from 'express';
import multer from 'multer';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { PermissionService } from '../services/permissions.js';
import { getImageUploadService } from '../services/image-upload.js';
import { AppError } from '../middleware/errorHandler.js';

export const imageRoutes = Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (_req, file, cb) => {
    const validMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
    ];

    if (validMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, WebP, and SVG are allowed.'));
    }
  },
});

/**
 * POST /api/images/upload/:documentId
 * Upload an image for a document
 */
imageRoutes.post(
  '/upload/:documentId',
  authMiddleware,
  upload.single('image'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { documentId } = req.params;
      const file = req.file;

      if (!file) {
        throw new AppError(400, 'No image file provided');
      }

      // Check if user has write permission on document
      const hasPermission = await PermissionService.checkPermission(
        documentId,
        req.user!.id,
        'write'
      );

      if (!hasPermission) {
        throw new AppError(403, 'No permission to upload images to this document');
      }

      const imageService = getImageUploadService();
      const uploadedImage = await imageService.uploadImage(file, documentId);

      return res.status(201).json({
        success: true,
        image: uploadedImage,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(500, error.message || 'Failed to upload image');
    }
  }
);

/**
 * GET /api/images/:filename
 * Get an image file
 */
imageRoutes.get('/:filename', async (req, res: Response) => {
  try {
    const { filename } = req.params;
    const imageService = getImageUploadService();
    
    const imageBuffer = await imageService.getImage(filename);
    
    // Determine content type from filename
    const ext = filename.split('.').pop()?.toLowerCase();
    const contentTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
    };

    const contentType = contentTypes[ext || ''] || 'application/octet-stream';
    
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
    return res.send(imageBuffer);
  } catch (error: any) {
    throw new AppError(404, 'Image not found');
  }
});

/**
 * GET /api/images/thumbnails/:filename
 * Get a thumbnail
 */
imageRoutes.get('/thumbnails/:filename', async (req, res: Response) => {
  try {
    const { filename } = req.params;
    const imageService = getImageUploadService();
    
    const thumbnailBuffer = await imageService.getThumbnail(filename);
    
    // Determine content type from filename
    const ext = filename.split('.').pop()?.toLowerCase();
    const contentTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
    };

    const contentType = contentTypes[ext || ''] || 'application/octet-stream';
    
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
    return res.send(thumbnailBuffer);
  } catch (error: any) {
    throw new AppError(404, 'Thumbnail not found');
  }
});

/**
 * GET /api/images/document/:documentId
 * Get all images for a document
 */
imageRoutes.get(
  '/document/:documentId',
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { documentId } = req.params;

      // Check if user has read permission
      const hasPermission = await PermissionService.checkPermission(
        documentId,
        req.user!.id,
        'read'
      );

      if (!hasPermission) {
        throw new AppError(403, 'No permission to view images for this document');
      }

      const imageService = getImageUploadService();
      const images = await imageService.getDocumentImages(documentId);

      return res.json({
        success: true,
        images,
        count: images.length,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(500, 'Failed to fetch images');
    }
  }
);

/**
 * DELETE /api/images/:filename
 * Delete an image
 */
imageRoutes.delete(
  '/:filename',
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { filename } = req.params;
      
      // Extract document ID from filename (format: documentId_imageId.ext)
      const documentId = filename.split('_')[0];

      // Check if user has write permission
      const hasPermission = await PermissionService.checkPermission(
        documentId,
        req.user!.id,
        'write'
      );

      if (!hasPermission) {
        throw new AppError(403, 'No permission to delete images from this document');
      }

      const imageService = getImageUploadService();
      await imageService.deleteImage(filename);

      return res.json({
        success: true,
        message: 'Image deleted successfully',
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(500, error.message || 'Failed to delete image');
    }
  }
);
