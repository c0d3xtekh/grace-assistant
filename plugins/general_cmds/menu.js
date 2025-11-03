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
  command: 'menu',
  description: '📋 Display all available commands',
  category: 'GENERAL',
  aliases: ['list', 'help'],
  
  async execute(conn, msg, args, { categories }) {
    const currentTime = getCurrentDateTime();
    
    let menuText = `╔════════════════════════════╗
║      ${config.botName.toUpperCase().padEnd(22)}║
╚════════════════════════════╝

👋 *Hello!* I'm ${config.botName}

📊 *Bot Information:*
• Prefix: ${config.prefix}
• Owner: ${config.ownerName}
• Commands: ${Object.values(categories).flat().length}
• Date: ${currentTime.split(' ')[0]}
• Time: ${currentTime.split(' ')[1]} UTC

`;

    // Generate command list by category
    for (const [categoryName, commands] of Object.entries(categories)) {
      if (commands.length === 0) continue;
      
      menuText += `\n╭─「 *${categoryName}* 」\n`;
      
      commands.forEach(cmd => {
        menuText += `│ ${config.prefix}${cmd.command}\n`;
        menuText += `│ └ _${cmd.description}_\n`;
      });
      
      menuText += `╰────────────\n`;
    }

    menuText += `\n💡 *Usage:* ${config.prefix}<command>
📖 *Example:* ${config.prefix}ping

${generateFooter()}`;

    await conn.sendMessage(msg.key.remoteJid, { text: menuText });
  }
};