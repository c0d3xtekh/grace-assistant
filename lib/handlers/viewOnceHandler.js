const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

/**
 * viewOnceHandler.js
 * Automatically extracts and saves ViewOnce media when REPLIED TO
 * Works for both incoming and outgoing replies
 * SILENT MODE - No messages sent, only terminal logs
 */

/**
 * Ensure the secret directory exists
 */
function ensureSecretDir() {
  const secretDir = path.join(process.cwd(), 'secret');
  if (!fs.existsSync(secretDir)) {
    fs.mkdirSync(secretDir, { recursive: true });
    console.log(chalk.cyan('📁 Created secret directory'));
  }
  return secretDir;
}

/**
 * Format date for filename
 */
function getTimestamp() {
  return new Date().toISOString();
}

/**
 * Get file extension from mimetype
 */
function getExtensionFromMime(mimetype) {
  const mimeMap = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/3gpp': '3gp',
    'video/quicktime': 'mov',
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/aac': 'aac'
  };
  return mimeMap[mimetype] || 'bin';
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Extract and save ViewOnce media from quoted/replied message
 */
async function extractViewOnce(msg, sender) {
  try {
    const secretDir = ensureSecretDir();
    const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
    
    if (!contextInfo || !contextInfo.quotedMessage) {
      return null;
    }

    const quoted = contextInfo.quotedMessage;
    
    // Check if quoted message is a ViewOnce message
    if (!quoted.viewOnceMessage && !quoted.viewOnceMessageV2 && !quoted.viewOnceMessageV2Extension) {
      return null;
    }

    // Extract the actual message from ViewOnce wrapper
    let actualMessage = null;
    let viewOnceType = '';

    if (quoted.viewOnceMessage) {
      actualMessage = quoted.viewOnceMessage.message;
      viewOnceType = 'viewOnceMessage';
    } else if (quoted.viewOnceMessageV2) {
      actualMessage = quoted.viewOnceMessageV2.message;
      viewOnceType = 'viewOnceMessageV2';
    } else if (quoted.viewOnceMessageV2Extension) {
      actualMessage = quoted.viewOnceMessageV2Extension.message;
      viewOnceType = 'viewOnceMessageV2Extension';
    }

    if (!actualMessage) {
      console.log(chalk.yellow('⚠️  ViewOnce message found but no actual message inside'));
      return null;
    }

    // Determine message type and extract media
    let mediaMessage = null;
    let messageType = '';
    let mimetype = '';
    let caption = '';

    if (actualMessage.imageMessage) {
      mediaMessage = actualMessage.imageMessage;
      messageType = 'image';
      mimetype = mediaMessage.mimetype || 'image/jpeg';
      caption = mediaMessage.caption || '';
    } else if (actualMessage.videoMessage) {
      mediaMessage = actualMessage.videoMessage;
      messageType = 'video';
      mimetype = mediaMessage.mimetype || 'video/mp4';
      caption = mediaMessage.caption || '';
    } else if (actualMessage.audioMessage) {
      mediaMessage = actualMessage.audioMessage;
      messageType = 'audio';
      mimetype = mediaMessage.mimetype || 'audio/ogg';
      caption = '';
    } else {
      console.log(chalk.yellow('⚠️  ViewOnce message type not supported:'), Object.keys(actualMessage));
      return null;
    }

    // Download the media
    console.log(chalk.blue('━'.repeat(60)));
    console.log(chalk.cyan.bold(`🔒 ViewOnce Media Extracted`));
    console.log(chalk.white(`   ViewOnce Type: ${viewOnceType}`));
    console.log(chalk.white(`   Media Type: ${messageType.toUpperCase()}`));
    console.log(chalk.yellow(`   Status: Downloading...`));

    const tempMsg = {
      key: msg.key,
      message: {}
    };
    tempMsg.message[`${messageType}Message`] = mediaMessage;

    const buffer = await downloadMediaMessage(
      tempMsg,
      'buffer',
      {},
      {
        logger: { info() {}, error() {}, warn() {}, trace() {}, debug() {} },
        reuploadRequest: () => {}
      }
    );

    // Generate filename
    const timestamp = getTimestamp().replace(/[:.]/g, '-');
    const senderNum = sender.split('@')[0];
    const extension = getExtensionFromMime(mimetype);
    const filename = `viewonce_${senderNum}_${timestamp}.${extension}`;
    const filepath = path.join(secretDir, filename);

    // Save the media
    fs.writeFileSync(filepath, buffer);

    // Save metadata if caption exists or for all files
    const metaFilename = `viewonce_${senderNum}_${timestamp}.txt`;
    const metaPath = path.join(secretDir, metaFilename);
    const metadata = `ViewOnce Media Metadata
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Sender: ${senderNum}
ViewOnce Type: ${viewOnceType}
Media Type: ${messageType}
Timestamp: ${new Date().toISOString()}
Mimetype: ${mimetype}
File Size: ${formatBytes(buffer.length)}
Media File: ${filename}
${caption ? `\nCaption:\n${caption}\n` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Extracted by Grace Assistant
Reply-to-ViewOnce Method
`;
    fs.writeFileSync(metaPath, metadata);

    console.log(chalk.green(`   ✅ Media saved: ${filename}`));
    console.log(chalk.green(`   ✅ Metadata saved: ${metaFilename}`));
    console.log(chalk.white(`   📊 Size: ${formatBytes(buffer.length)}`));
    console.log(chalk.white(`   📁 Location: ./secret/${filename}`));
    console.log(chalk.white(`   👤 Sender: ${senderNum}`));
    if (caption) {
      const shortCaption = caption.length > 50 ? caption.substring(0, 50) + '...' : caption;
      console.log(chalk.white(`   💬 Caption: ${shortCaption}`));
    }
    console.log(chalk.blue('━'.repeat(60)));
    console.log('');

    return {
      type: messageType,
      filename,
      filepath,
      size: buffer.length,
      sender: senderNum,
      caption,
      mimetype,
      viewOnceType,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error(chalk.red('❌ Error extracting ViewOnce:'), error.message);
    return null;
  }
}

/**
 * Handle incoming messages for ViewOnce extraction
 * Triggers when someone (including you) replies to a ViewOnce message
 */
async function handleViewOnce(conn, msg) {
  try {
    // Check if message exists and has content
    if (!msg || !msg.message) return;

    const sender = msg.key.remoteJid;
    
    // Check if this is a reply to any message
    const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
    if (!contextInfo || !contextInfo.quotedMessage) return;

    // Try to extract ViewOnce media (silently)
    await extractViewOnce(msg, sender);

  } catch (error) {
    // Silently handle errors to not disrupt other message handling
    if (!error.message?.includes('decrypt') && 
        !error.message?.includes('MAC') &&
        !error.message?.includes('internal server error')) {
      console.error(chalk.red('❌ ViewOnce handler error:'), error.message);
    }
  }
}

module.exports = {
  handleViewOnce,
  extractViewOnce
};