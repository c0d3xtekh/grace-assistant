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
  command: 'ping',
  description: '🏓 Check bot response time and status',
  category: 'GENERAL',
  
  async execute(conn, msg, args) {
    const currentTime = getCurrentDateTime();
    const responseMsg = `🏓 *Pong!*

⚡ *Bot Status:* Online
⏱️ *Response Time:* Fast
📅 *Date:* ${currentTime.split(' ')[0]}
🕐 *Time:* ${currentTime.split(' ')[1]} UTC

_${config.botName} is working perfectly!_

${generateFooter()}`;

    await conn.sendMessage(msg.key.remoteJid, { text: responseMsg });
  }
};