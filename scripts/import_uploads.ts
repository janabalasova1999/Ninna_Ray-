import { db } from '../server/db';
import { contentItems } from '../shared/schema';
import fs from 'fs';
import path from 'path';

async function importUploads() {
  const uploadsDir = path.resolve('uploads');
  const files = fs.readdirSync(uploadsDir);
  
  let imported = 0;
  for (const filename of files) {
    const filePath = path.join(uploadsDir, filename);
    const stat = fs.statSync(filePath);
    const ext = path.extname(filename).toLowerCase();
    
    let mimeType = 'application/octet-stream';
    if (['.jpg', '.jpeg'].includes(ext)) mimeType = 'image/jpeg';
    else if (ext === '.png') mimeType = 'image/png';
    else if (ext === '.gif') mimeType = 'image/gif';
    else if (['.mp4', '.mov'].includes(ext)) mimeType = 'video/mp4';
    
    const isImage = mimeType.startsWith('image/');
    const isVideo = mimeType.startsWith('video/');
    const category = isVideo ? 'video' : 'general';
    
    await db.insert(contentItems).values({
      filename,
      originalName: filename,
      mimeType,
      size: stat.size,
      tags: [],
      category,
      description: null,
      timesUsed: 0,
    });
    imported++;
  }
  
  console.log(`Imported ${imported} files into content vault`);
  process.exit(0);
}

importUploads().catch(e => { console.error(e); process.exit(1); });
