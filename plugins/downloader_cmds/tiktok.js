const config = require('../../config');
const chalk = require('chalk');
const { ttdl } = require('ruhend-scraper');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

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
 * Format number to readable format (e.g., 1.2M, 345K)
 */
function formatNumber(num) {
  if (!num) return '0';
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

/**
 * Download file from URL
 */
function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    const file = fs.createWriteStream(filepath);
    
    protocol.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        file.close();
        fs.unlinkSync(filepath);
        downloadFile(response.headers.location, filepath)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve(filepath);
      });

      file.on('error', (err) => {
        fs.unlinkSync(filepath);
        reject(err);
      });
    }).on('error', (err) => {
      fs.unlinkSync(filepath);
      reject(err);
    });
  });
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

module.exports = {
  command: 'ttdl',
  description: '📥 Download TikTok videos',
  category: 'DOWNLOADER',
  aliases: ['tiktok', 'tt'],

  async execute(conn, msg, args) {
    const sender = msg.key.remoteJid;
    const currentTime = getCurrentDateTime();

    // Check if URL is provided
    if (args.length === 0) {
      const helpMsg = `📥 *TikTok Downloader*

*Usage:*
${config.prefix}ttdl <tiktok_url>

*Aliases:*
${config.prefix}tiktok <url>
${config.prefix}tt <url>

*Example:*
${config.prefix}ttdl https://vt.tiktok.com/ZSxxxxx
${config.prefix}ttdl https://www.tiktok.com/@username/video/1234567890
${config.prefix}ttdl https://vm.tiktok.com/ZMxxxxx

*Features:*
✅ Download videos without watermark
✅ High quality downloads
✅ Shows video info (likes, comments, shares, views)
✅ Author information

${generateFooter()}`;
      
      await conn.sendMessage(sender, { text: helpMsg });
      return;
    }

    const url = args[0];

    // Validate TikTok URL
    if (!url.includes('tiktok.com') && !url.includes('vt.tiktok.com') && !url.includes('vm.tiktok.com')) {
      const invalidMsg = `❌ *Invalid URL*

Please provide a valid TikTok URL.

*Examples:*
• https://vt.tiktok.com/ZSxxxxx
• https://www.tiktok.com/@username/video/1234567890
• https://vm.tiktok.com/ZMxxxxx

${generateFooter()}`;
      
      await conn.sendMessage(sender, { text: invalidMsg });
      return;
    }

    // Send processing message
    const processingMsg = `📥 *TikTok Downloader*

⏳ Processing your request...
🔗 URL: ${url}

Please wait while we fetch the content...

${generateFooter()}`;
    
    await conn.sendMessage(sender, { text: processingMsg });

    console.log(chalk.blue('━'.repeat(60)));
    console.log(chalk.cyan.bold('📥 TikTok Download Request'));
    console.log(chalk.white(`   From: ${sender.split('@')[0]}`));
    console.log(chalk.white(`   URL: ${url}`));
    console.log(chalk.white(`   Time: ${currentTime}`));
    console.log(chalk.blue('━'.repeat(60)));

    try {
      // Fetch TikTok data using ttdl
      console.log(chalk.yellow('   Fetching TikTok data...'));
      const data = await ttdl(url);

      if (!data || !data.video) {
        throw new Error('Failed to fetch TikTok data or no video found');
      }

      console.log(chalk.green('   ✅ Data fetched successfully'));
      console.log(chalk.white(`   Title: ${data.title || 'No title'}`));
      console.log(chalk.white(`   Author: ${data.author || 'Unknown'}`));
      console.log(chalk.white(`   Username: @${data.username || 'unknown'}`));

      // Determine which video URL to use (prefer the first one if array, or direct URL)
      let videoUrl;
      if (Array.isArray(data.video)) {
        videoUrl = data.video[0]; // Use first video if array
      } else {
        videoUrl = data.video;
      }

      if (!videoUrl) {
        throw new Error('No video URL found');
      }

      // Create temp directory
      const tempDir = path.join(process.cwd(), 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // Download video
      console.log(chalk.yellow('   Downloading video...'));
      const tempFile = path.join(tempDir, `tiktok_${Date.now()}.mp4`);
      await downloadFile(videoUrl, tempFile);

      const fileSize = fs.statSync(tempFile).size;
      console.log(chalk.green(`   ✅ Downloaded: ${formatBytes(fileSize)}`));

      // Prepare caption with all available data
      const caption = `🎵 *TikTok Video Downloaded*

👤 *Author:* ${data.author || 'Unknown'}
📝 *Username:* @${data.username || 'unknown'}
💬 *Caption:* ${data.title || 'No caption'}

📊 *Statistics:*
❤️ Likes: ${formatNumber(data.like || 0)}
💬 Comments: ${formatNumber(data.comment || 0)}
🔄 Shares: ${formatNumber(data.share || 0)}
👀 Views: ${formatNumber(data.views || 0)}
🔖 Bookmarks: ${formatNumber(data.bookmark || 0)}

📅 *Published:* ${data.published || 'Unknown'}

📥 Downloaded by ${config.botName}

${generateFooter()}`;

      // Send video
      console.log(chalk.yellow('   Uploading video...'));
      await conn.sendMessage(sender, {
        video: fs.readFileSync(tempFile),
        caption: caption,
        mimetype: 'video/mp4'
      });

      // Clean up
      fs.unlinkSync(tempFile);
      console.log(chalk.green('   ✅ Video sent successfully'));

      console.log(chalk.blue('━'.repeat(60)));
      console.log('');

    } catch (error) {
      console.error(chalk.red('❌ TikTok download error:'), error.message);
      console.log(chalk.blue('━'.repeat(60)));
      console.log('');

      const errorMsg = `❌ *Download Failed*

Failed to download TikTok content.

*Error:* ${error.message}

*Possible causes:*
• Invalid or expired URL
• Private or deleted video
• Age-restricted content
• Network issues
• Video not available in your region

*Tips:*
• Make sure the video is public
• Try using a different URL format (vt.tiktok.com or vm.tiktok.com)
• Check if the video still exists on TikTok
• Try again in a few moments

${generateFooter()}`;

      await conn.sendMessage(sender, { text: errorMsg });
    }
  }
};