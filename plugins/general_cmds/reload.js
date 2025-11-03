const config = require('../../config');
const { loadPlugins } = require('../utils/pluginLoader');
const chalk = require('chalk');

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
  command: 'reload',
  description: '🔄 Hot reload all plugins without restart',
  category: 'GENERAL',
  ownerOnly: true,
  
  async execute(conn, msg, args, context) {
    const sender = msg.key.remoteJid;
    const senderNumber = sender.split('@')[0];
    
    // Check if sender is owner
    if (senderNumber !== config.ownerNumber) {
      const noPermMsg = `❌ *Access Denied*

This command is restricted to the bot owner only.

🔐 *Owner:* ${config.ownerName}

${generateFooter()}`;
      
      await conn.sendMessage(sender, { text: noPermMsg });
      return;
    }
    
    const currentTime = getCurrentDateTime();
    
    // Send reloading message
    const reloadingMsg = `🔄 *Reloading Plugins...*

⏳ Please wait while plugins are being reloaded...

${generateFooter()}`;
    
    await conn.sendMessage(sender, { text: reloadingMsg });
    
    try {
      // Reload plugins
      console.log(chalk.cyan('\n' + '━'.repeat(60)));
      console.log(chalk.yellow.bold('🔄 Hot Reload Triggered by Owner'));
      console.log(chalk.cyan('━'.repeat(60)));
      
      const { commands: newCommands, categories: newCategories } = loadPlugins(true);
      
      // Update the context (passed from main)
      context.commands.clear();
      for (const [key, value] of newCommands.entries()) {
        context.commands.set(key, value);
      }
      
      // Update categories
      Object.keys(context.categories).forEach(key => delete context.categories[key]);
      Object.assign(context.categories, newCategories);
      
      console.log(chalk.cyan('━'.repeat(60) + '\n'));
      
      // Calculate stats
      const totalCommands = newCommands.size;
      const totalCategories = Object.keys(newCategories).length;
      
      const successMsg = `✅ *Plugins Reloaded Successfully!*

📊 *Reload Statistics:*
• Total Commands: ${totalCommands}
• Total Categories: ${totalCategories}
• Date: ${currentTime.split(' ')[0]}
• Time: ${currentTime.split(' ')[1]} UTC

🎉 *Status:* All plugins are now up-to-date!

💡 *Tip:* You can now use any newly added commands immediately.

${generateFooter()}`;
      
      await conn.sendMessage(sender, { text: successMsg });
      
    } catch (error) {
      console.error(chalk.red('❌ Error during hot reload:'), error);
      
      const errorMsg = `❌ *Reload Failed*

An error occurred while reloading plugins.

*Error:* ${error.message}

Please check the console for details.

${generateFooter()}`;
      
      await conn.sendMessage(sender, { text: errorMsg });
    }
  }
};