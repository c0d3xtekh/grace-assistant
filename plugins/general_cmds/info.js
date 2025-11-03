const config = require('../../config');

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

module.exports = {
  command: 'info',
  description: 'ℹ️ Get bot information',
  category: 'GENERAL',
  
  async execute(conn, msg, args) {
    const currentTime = getCurrentDateTime();
    
    const infoMsg = `╔════════════════════════════╗
║      BOT INFORMATION       ║
╚════════════════════════════╝

🤖 *Bot Details:*
• Name: ${config.botName}
• Prefix: ${config.prefix}
• Version: 1.0.0
• Status: Online

👤 *Owner Details:*
• Name: ${config.ownerName}
• Number: +${config.ownerNumber}

📊 *System Info:*
• Date: ${currentTime.split(' ')[0]}
• Time: ${currentTime.split(' ')[1]} UTC
• Platform: WhatsApp Bot
• Framework: Baileys

💡 *Quick Commands:*
• ${config.prefix}menu - View all commands
• ${config.prefix}ping - Check bot status
• ${config.prefix}info - This message

${generateFooter()}`;

    await conn.sendMessage(msg.key.remoteJid, { text: infoMsg });
  }
};