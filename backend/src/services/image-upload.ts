import fs from 'fs/promises';
import path from 'path';
// import sharp from 'sharp';
import { nanoid } from 'nanoid';

// Sharp is optional - gracefully degrade if not available
let sharp: any = null;
try {
  sharp = require('sharp');
} catch (e) {
  console.warn('⚠️ Sharp module not available - image resizing disabled');
}

export interface UploadedImage {
  id: string;
  filename: string;
  originalName: string;
  path: string;
  url: string;
  size: number;
  mimeType: string;
  width?: number;
  height?: number;
  thumbnailUrl?: string;
  uploadedAt: number;
}

export class ImageUploadService {
  private uploadDir: string;
  private thumbnailDir: string;
  private maxFileSize: number = 10 * 1024 * 1024; // 10MB
  private maxWidth: number = 2000;
  private maxHeight: number = 2000;
  private thumbnailSize: number = 300;

  constructor(uploadDir: string = './data/uploads') {
    this.uploadDir = uploadDir;
    this.thumbnailDir = path.join(uploadDir, 'thumbnails');
    this.ensureDirectories();
  }

  private async ensureDirectories() {
    try {
      await fs.mkdir(this.uploadDir, { recursive: true });
      await fs.mkdir(this.thumbnailDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create upload directories:', error);
    }
  }

  /**
   * Process and save uploaded image
   */
  async uploadImage(
    file: Express.Multer.File,
    documentId: string
  ): Promise<UploadedImage> {
    // Validate file
    if (!this.isValidImage(file)) {
      throw new Error('Invalid image file');
    }

    if (file.size > this.maxFileSize) {
      throw new Error(`File size exceeds maximum of ${this.maxFileSize / 1024 / 1024}MB`);
    }

    const imageId = nanoid(12);
    const ext = path.extname(file.originalname);
    const filename = `${documentId}_${imageId}${ext}`;
    const imagePath = path.join(this.uploadDir, filename);
    const thumbnailPath = path.join(this.thumbnailDir, filename);

    let width: number | undefined;
    let height: number | undefined;

    if (sharp) {
      // Process image with sharp (if available)
      const image = sharp(file.buffer);
      const metadata = await image.metadata();
      width = metadata.width;
      height = metadata.height;

      // Resize if too large
      let processedImage = image;
      if (metadata.width && metadata.width > this.maxWidth) {
        processedImage = processedImage.resize(this.maxWidth, null, {
          withoutEnlargement: true,
        });
      }
      if (metadata.height && metadata.height > this.maxHeight) {
        processedImage = processedImage.resize(null, this.maxHeight, {
          withoutEnlargement: true,
        });
      }

      // Save original (or resized) image
      await processedImage.toFile(imagePath);

      // Create thumbnail
      await sharp(file.buffer)
        .resize(this.thumbnailSize, this.thumbnailSize, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .toFile(thumbnailPath);
    } else {
      // Fallback: save file without processing
      await fs.writeFile(imagePath, file.buffer);
      // Skip thumbnail creation
    }

    // Get final image dimensions (if sharp available)
    if (sharp && !width) {
      const finalMetadata = await sharp(imagePath).metadata();
      width = finalMetadata.width;
      height = finalMetadata.height;
    }

    const uploadedImage: UploadedImage = {
      id: imageId,
      filename,
      originalName: file.originalname,
      path: imagePath,
      url: `/api/images/${filename}`,
      thumbnailUrl: sharp ? `/api/images/thumbnails/${filename}` : undefined,
      size: (await fs.stat(imagePath)).size,
      mimeType: file.mimetype,
      width,
      height,
      uploadedAt: Date.now(),
    };

    return uploadedImage;
  }

  /**
   * Get image file
   */
  async getImage(filename: string): Promise<Buffer> {
    const imagePath = path.join(this.uploadDir, filename);
    
    try {
      return await fs.readFile(imagePath);
    } catch (error) {
      throw new Error('Image not found');
    }
  }

  /**
   * Get thumbnail
   */
  async getThumbnail(filename: string): Promise<Buffer> {
    const thumbnailPath = path.join(this.thumbnailDir, filename);
    
    try {
      return await fs.readFile(thumbnailPath);
    } catch (error) {
      throw new Error('Thumbnail not found');
    }
  }

  /**
   * Delete image and thumbnail
   */
  async deleteImage(filename: string): Promise<void> {
    const imagePath = path.join(this.uploadDir, filename);
    const thumbnailPath = path.join(this.thumbnailDir, filename);

    try {
      await fs.unlink(imagePath);
      await fs.unlink(thumbnailPath).catch(() => {}); // Ignore if thumbnail doesn't exist
    } catch (error) {
      throw new Error('Failed to delete image');
    }
  }

  /**
   * Delete all images for a document
   */
  async deleteDocumentImages(documentId: string): Promise<void> {
    const files = await fs.readdir(this.uploadDir);
    const documentFiles = files.filter(f => f.startsWith(`${documentId}_`));

    await Promise.all(
      documentFiles.map(filename => this.deleteImage(filename))
    );
  }

  /**
   * Validate if file is a valid image
   */
  private isValidImage(file: Express.Multer.File): boolean {
    const validMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
    ];

    return validMimeTypes.includes(file.mimetype);
  }

  /**
   * Get all images for a document
   */
  async getDocumentImages(documentId: string): Promise<UploadedImage[]> {
    const files = await fs.readdir(this.uploadDir);
    const documentFiles = files.filter(f => f.startsWith(`${documentId}_`));

    const images = await Promise.all(
      documentFiles.map(async (filename) => {
        const imagePath = path.join(this.uploadDir, filename);
        const stats = await fs.stat(imagePath);
        const metadata = await sharp(imagePath).metadata();

        const imageId = filename.split('_')[1].split('.')[0];

        return {
          id: imageId,
          filename,
          originalName: filename,
          path: imagePath,
          url: `/api/images/${filename}`,
          thumbnailUrl: `/api/images/thumbnails/${filename}`,
          size: stats.size,
          mimeType: `image/${metadata.format}`,
          width: metadata.width,
          height: metadata.height,
          uploadedAt: stats.mtimeMs,
        };
      })
    );

    return images.sort((a, b) => b.uploadedAt - a.uploadedAt);
  }
}

// Singleton instance
let imageUploadService: ImageUploadService | null = null;

export function getImageUploadService(): ImageUploadService {
  if (!imageUploadService) {
    imageUploadService = new ImageUploadService();
  }
  return imageUploadService;
}
