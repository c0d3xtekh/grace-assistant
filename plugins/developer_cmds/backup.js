const config = require('../../config');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

function generateFooter() {
  const line = config.footer.line.repeat(config.footer.lineCount);
  return `${line}\n> _${config.footer.text}_`;
}

function getCurrentDateTime() {
  const now = new Date();
  const date = now.toISOString().split('T')[0];
  const time = now.toISOString().split('T')[1].split('.')[0];
  return `${date} ${time}`;
}

/**
 * Format bytes to human readable size
 */
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Create a zip backup of the bot folder
 */
async function createBackup() {
  const botDir = process.cwd();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
  const backupFileName = `grace-backup-${timestamp}.zip`;
  const backupPath = path.join(botDir, backupFileName);

  // Folders and files to exclude
  const excludedDirs = [
    'node_modules',
    'session',
    'temp',
    '.cache',
    '.npm',
    '.git',
    'backups'
  ];

  const excludedFiles = [
    '.env',
    '.DS_Store',
    backupFileName
  ];

  return new Promise((resolve, reject) => {
    // Create write stream
    const output = fs.createWriteStream(backupPath);
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    });

    let totalFiles = 0;
    let totalSize = 0;

    // Listen for warnings
    archive.on('warning', (err) => {
      if (err.code === 'ENOENT') {
        console.warn('Archiver warning:', err);
      } else {
        reject(err);
      }
    });

    // Listen for errors
    archive.on('error', (err) => {
      reject(err);
    });

    // Track progress
    archive.on('entry', (entry) => {
      totalFiles++;
      totalSize += entry.stats.size;
    });

    // Pipe archive data to file
    archive.pipe(output);

    // When output stream closes, resolve
    output.on('close', () => {
      const finalSize = archive.pointer();
      resolve({
        path: backupPath,
        fileName: backupFileName,
        size: finalSize,
        formattedSize: formatBytes(finalSize),
        filesCount: totalFiles,
        originalSize: totalSize
      });
    });

    // Add all files from bot directory with filters
    archive.glob('**/*', {
      cwd: botDir,
      ignore: [
        ...excludedDirs.map(dir => `${dir}/**`),
        ...excludedDirs,
        ...excludedFiles,
        '**/*.zip'
      ],
      dot: true // Include hidden files except excluded ones
    });

    // Finalize the archive
    archive.finalize();
  });
}

module.exports = {
  command: 'backup',
  description: '📦 Create and send a backup of the bot folder',
  category: 'DEVELOPER',
  aliases: ['bkp', 'export'],

  async execute(conn, msg, args) {
    const sender = msg.key.remoteJid;
    const senderId = sender.split('@')[0];
    const currentTime = getCurrentDateTime();

    // Owner-only command
    if (senderId !== config.ownerNumber) {
      const notOwnerMsg = `❌ *Access Denied*

This command is only available to the bot owner.

${generateFooter()}`;
      await conn.sendMessage(sender, { text: notOwnerMsg });
      return;
    }

    // Send initial message
    const startMsg = `📦 *Bot Backup*

🔄 Creating backup...
⏳ Please wait, this may take a moment...

📅 Date: ${currentTime.split(' ')[0]}
🕐 Time: ${currentTime.split(' ')[1]} UTC

${generateFooter()}`;

    await conn.sendMessage(sender, { text: startMsg });

    try {
      // Create the backup
      console.log('📦 Starting backup creation...');
      const backupInfo = await createBackup();
      
      console.log(`✅ Backup created: ${backupInfo.fileName}`);
      console.log(`📊 Size: ${backupInfo.formattedSize}`);
      console.log(`📁 Files: ${backupInfo.filesCount}`);

      // Send progress message
      const progressMsg = `✅ *Backup Created Successfully*

📁 File: ${backupInfo.fileName}
📊 Size: ${backupInfo.formattedSize}
📄 Files: ${backupInfo.filesCount}

📤 Uploading backup file...

${generateFooter()}`;

      await conn.sendMessage(sender, { text: progressMsg });

      // Check file size (WhatsApp has limits)
      const maxSize = 100 * 1024 * 1024; // 100MB limit for documents
      if (backupInfo.size > maxSize) {
        const sizeErrorMsg = `⚠️ *Backup Too Large*

The backup file is ${backupInfo.formattedSize}, which exceeds WhatsApp's ${formatBytes(maxSize)} limit.

📁 File saved locally: ${backupInfo.fileName}

*Suggestions:*
• Clear unnecessary files and try again
• Use manual file transfer methods
• Upload to cloud storage

${generateFooter()}`;

        await conn.sendMessage(sender, { text: sizeErrorMsg });
        return;
      }

      // Read the backup file
      const backupBuffer = fs.readFileSync(backupInfo.path);

      // Send the backup file
      await conn.sendMessage(sender, {
        document: backupBuffer,
        mimetype: 'application/zip',
        fileName: backupInfo.fileName,
        caption: `📦 *Grace Assistant Backup*

📅 Date: ${currentTime.split(' ')[0]}
🕐 Time: ${currentTime.split(' ')[1]} UTC
📊 Size: ${backupInfo.formattedSize}
📄 Files: ${backupInfo.filesCount}

✅ Backup completed successfully!

*Excluded folders:*
• node_modules
• session
• temp
• .cache
• .npm
• .git

${generateFooter()}`
      });

      // Delete the backup file after sending
      fs.unlinkSync(backupInfo.path);
      console.log('🗑️ Temporary backup file deleted');

      // Send completion message
      const completeMsg = `✅ *Backup Sent Successfully*

The backup has been uploaded and the temporary file has been deleted.

${generateFooter()}`;

      await conn.sendMessage(sender, { text: completeMsg });

    } catch (error) {
      console.error('❌ Backup error:', error);

      const errorMsg = `❌ *Backup Failed*

An error occurred while creating the backup:

*Error:* ${error.message}

*Possible causes:*
• Insufficient disk space
• File permission issues
• Large file size

Please check the logs and try again.

${generateFooter()}`;

      await conn.sendMessage(sender, { text: errorMsg });

      // Clean up backup file if it exists
      try {
        const botDir = process.cwd();
        const files = fs.readdirSync(botDir);
        files.forEach(file => {
          if (file.startsWith('grace-backup-') && file.endsWith('.zip')) {
            fs.unlinkSync(path.join(botDir, file));
            console.log(`🗑️ Cleaned up failed backup: ${file}`);
          }
        });
      } catch (cleanupError) {
        console.error('Error during cleanup:', cleanupError);
      }
    }
  }
};