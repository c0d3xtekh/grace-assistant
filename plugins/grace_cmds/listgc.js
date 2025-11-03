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
  command: 'listgc',
  description: '📋 List all groups with their IDs',
  category: 'GRACE',
  aliases: ['grouplist', 'gclist'],
  
  async execute(conn, msg, args) {
    const currentTime = getCurrentDateTime();
    
    try {
      // Get all chats
      const chats = await conn.groupFetchAllParticipating();
      const groups = Object.values(chats);
      
      if (groups.length === 0) {
        const noGroupsMsg = `📋 *Group List*

❌ No groups found!

The bot is not currently in any groups.

${generateFooter()}`;
        
        await conn.sendMessage(msg.key.remoteJid, { text: noGroupsMsg });
        return;
      }
      
      // Build group list message
      let groupListMsg = `╔════════════════════════════╗
║       GROUP LIST           ║
╚════════════════════════════╝

📊 *Total Groups:* ${groups.length}
📅 *Date:* ${currentTime.split(' ')[0]}
🕐 *Time:* ${currentTime.split(' ')[1]} UTC

`;

      groups.forEach((group, index) => {
        const groupName = group.subject || 'Unknown Group';
        const groupId = group.id;
        const participantCount = group.participants ? group.participants.length : 0;
        
        groupListMsg += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        groupListMsg += `*${index + 1}. ${groupName}*\n`;
        groupListMsg += `📱 *ID:* ${groupId}\n`;
        groupListMsg += `👥 *Members:* ${participantCount}\n`;
      });
      
      groupListMsg += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      groupListMsg += `💡 *Tip:* Copy the Group ID for other commands\n\n`;
      groupListMsg += generateFooter();
      
      await conn.sendMessage(msg.key.remoteJid, { text: groupListMsg });
      
    } catch (error) {
      console.error('Error fetching groups:', error);
      
      const errorMsg = `❌ *Error Fetching Groups*

An error occurred while fetching the group list.

*Error:* ${error.message}

Please try again later.

${generateFooter()}`;
      
      await conn.sendMessage(msg.key.remoteJid, { text: errorMsg });
    }
  }
};