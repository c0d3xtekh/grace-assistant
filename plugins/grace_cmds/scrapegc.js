const config = require('../../config');
const fs = require('fs');
const path = require('path');

function generateFooter() {
  const line = config.footer.line.repeat(config.footer.lineCount);
  return `${line}\n> _${config.folder.text}_`;
}

function getCurrentDateTime() {
  const now = new Date();
  const date = now.toISOString().split('T')[0];
  const time = now.toISOString().split('T')[1].split('.')[0];
  return `${date} ${time}`;
}

module.exports = {
  command: 'scrapegc',
  description: '📥 Scrape all group members and export to JSON',
  category: 'GRACE',
  aliases: ['scrapegroup', 'exportgc'],
  
  async execute(conn, msg, args) {
    const sender = msg.key.remoteJid;
    const currentTime = getCurrentDateTime();
    
    // Check if group ID is provided
    if (args.length === 0) {
      const usageMsg = `❌ *Missing Group ID*

*Usage:* ${config.prefix}scrapegc <group_id>

*Example:* ${config.prefix}scrapegc 1234567890@g.us

💡 *Tip:* Use ${config.prefix}listgc to get group IDs

${generateFooter()}`;
      
      await conn.sendMessage(sender, { text: usageMsg });
      return;
    }
    
    const groupId = args[0];
    
    // Validate group ID format
    if (!groupId.includes('@g.us')) {
      const invalidMsg = `❌ *Invalid Group ID*

The provided ID doesn't appear to be a valid group ID.

*Format:* Group IDs should end with @g.us

💡 *Tip:* Use ${config.prefix}listgc to get correct group IDs

${generateFooter()}`;
      
      await conn.sendMessage(sender, { text: invalidMsg });
      return;
    }
    
    // Send processing message
    const processingMsg = `⏳ *Scraping Group Members...*

📱 *Group ID:* ${groupId}
⏰ *Time:* ${currentTime}

Please wait while members are being scraped...
This may take a moment for large groups...

${generateFooter()}`;
    
    await conn.sendMessage(sender, { text: processingMsg });
    
    try {
      // Fetch group metadata
      const groupMetadata = await conn.groupMetadata(groupId);
      
      if (!groupMetadata) {
        throw new Error('Group not found or bot is not a member');
      }
      
      const groupName = groupMetadata.subject || 'Unknown Group';
      const groupDesc = groupMetadata.desc || 'No description';
      const participants = groupMetadata.participants || [];
      
      if (participants.length === 0) {
        const noMembersMsg = `❌ *No Members Found*

The group appears to be empty or inaccessible.

*Group:* ${groupName}

${generateFooter()}`;
        
        await conn.sendMessage(sender, { text: noMembersMsg });
        return;
      }
      
      // Build members data
      const membersData = {
        group_info: {
          name: groupName,
          description: groupDesc,
          id: groupId,
          total_members: participants.length,
          creation_date: groupMetadata.creation ? new Date(groupMetadata.creation * 1000).toISOString() : null,
          scraped_at: currentTime,
          scraped_by: config.botName
        },
        members: []
      };
      
      let adminCount = 0;
      let superAdminCount = 0;
      let memberCounter = 0;
      let withNamesCount = 0;
      
      console.log(`\n📋 Scraping ${participants.length} members from ${groupName}...`);
      
      // Process each participant with delay to avoid rate limiting
      for (let i = 0; i < participants.length; i++) {
        const participant = participants[i];
        const jid = participant.id;
        const isAdmin = participant.admin === 'admin';
        const isSuperAdmin = participant.admin === 'superadmin';
        
        if (isAdmin) adminCount++;
        if (isSuperAdmin) superAdminCount++;
        
        let phoneNumber = null;
        let displayName = null;
        let pushName = null;
        
        // Extract phone number or LID
        if (jid.includes('@s.whatsapp.net')) {
          phoneNumber = jid.split('@')[0];
        } else if (jid.includes('@lid')) {
          phoneNumber = jid.split('@')[0]; // LID number
        }
        
        // Try to get pushName from participant metadata first
        if (participant.name) {
          displayName = participant.name;
          pushName = participant.name;
        }
        
        // Try notify field
        if (!displayName && participant.notify) {
          displayName = participant.notify;
          pushName = participant.notify;
        }
        
        // Try verifiedName
        if (!displayName && participant.verifiedName) {
          displayName = participant.verifiedName;
        }
        
        // Try to get from connection profile picture query (often has name)
        if (!displayName && phoneNumber) {
          try {
            const ppUrl = await conn.profilePictureUrl(jid, 'image').catch(() => null);
            // Note: This doesn't give us the name directly, but we tried
          } catch (e) {
            // Silent
          }
        }
        
        // If still no name found, check if we can query WhatsApp for this number
        if (!displayName && phoneNumber && !jid.includes('@lid')) {
          try {
            const [result] = await conn.onWhatsApp(phoneNumber);
            if (result && result.notify) {
              displayName = result.notify;
              pushName = result.notify;
            }
          } catch (e) {
            // Silent
          }
        }
        
        // Last resort: generic naming
        if (!displayName) {
          memberCounter++;
          displayName = `member${memberCounter}`;
        } else {
          withNamesCount++;
        }
        
        // Build member object with all available data
        const memberData = {
          index: i + 1,
          name: displayName,
          push_name: pushName,
          phone: phoneNumber,
          jid: jid,
          is_admin: isAdmin,
          is_super_admin: isSuperAdmin,
          role: isSuperAdmin ? 'superadmin' : (isAdmin ? 'admin' : 'member'),
          has_whatsapp_name: displayName && !displayName.startsWith('member'),
          is_lid: jid.includes('@lid'),
          is_business: jid.includes('@business') || false
        };
        
        membersData.members.push(memberData);
        
        console.log(`  ${i + 1}/${participants.length} - ${displayName} (${phoneNumber})`);
        
        // Small delay to avoid rate limiting
        if (i < participants.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      // Sort: superadmins first, then admins, then members
      membersData.members.sort((a, b) => {
        if (a.is_super_admin && !b.is_super_admin) return -1;
        if (!a.is_super_admin && b.is_super_admin) return 1;
        if (a.is_admin && !b.is_admin) return -1;
        if (!a.is_admin && b.is_admin) return 1;
        return 0;
      });
      
      // Add statistics
      membersData.statistics = {
        total_members: participants.length,
        super_admins: superAdminCount,
        admins: adminCount,
        regular_members: participants.length - adminCount - superAdminCount,
        with_names: withNamesCount,
        without_names: memberCounter,
        lid_users: membersData.members.filter(m => m.is_lid).length,
        business_accounts: membersData.members.filter(m => m.is_business).length
      };
      
      // Create temp directory if it doesn't exist
      const tempDir = path.join(__dirname, '../../temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      // Generate filename
      const sanitizedGroupName = groupName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const timestamp = Date.now();
      const filename = `${sanitizedGroupName}_${timestamp}.json`;
      const filepath = path.join(tempDir, filename);
      
      // Write JSON file
      fs.writeFileSync(filepath, JSON.stringify(membersData, null, 2), 'utf-8');
      
      // Count members with LID
      const lidCount = membersData.members.filter(m => m.is_lid).length;
      
      // Send success message
      const successMsg = `✅ *Group Members Scraped Successfully!*

📊 *Scrape Summary:*
• Group: ${groupName}
• Total Members: ${participants.length}
• Super Admins: ${superAdminCount}
• Admins: ${adminCount}
• Regular Members: ${participants.length - adminCount - superAdminCount}
• Members with Names: ${withNamesCount}
• Generic Names: ${memberCounter}
• Privacy Protected (LID): ${lidCount}
• Scraped At: ${currentTime}

📄 *File:* ${filename}
📦 *Size:* ${(fs.statSync(filepath).size / 1024).toFixed(2)} KB

${lidCount > 0 ? '⚠️ *Note:* ' + lidCount + ' members use WhatsApp privacy features (LID). Their actual phone numbers and names are hidden by WhatsApp for privacy.\n\n' : ''}Sending JSON file...

${generateFooter()}`;
      
      await conn.sendMessage(sender, { text: successMsg });
      
      // Send the JSON file
      await conn.sendMessage(sender, {
        document: fs.readFileSync(filepath),
        fileName: filename,
        mimetype: 'application/json',
        caption: `📥 *Group Members Export*

*Group:* ${groupName}
*Total Members:* ${participants.length}
*With Names:* ${withNamesCount}
*LID Protected:* ${lidCount}
*Format:* JSON

${generateFooter()}`
      });
      
      // Clean up - delete file after sending
      setTimeout(() => {
        try {
          if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
            console.log(`🗑️  Cleaned up: ${filename}`);
          }
        } catch (err) {
          console.error('Error cleaning up file:', err);
        }
      }, 5000);
      
      console.log(`✅ Scraping complete: ${withNamesCount}/${participants.length} members with names`);
      
    } catch (error) {
      console.error('Error scraping group:', error);
      
      let errorMessage = error.message;
      
      // Handle specific errors
      if (error.message.includes('not-authorized')) {
        errorMessage = 'Bot is not a member of this group or lacks permissions';
      } else if (error.message.includes('item-not-found')) {
        errorMessage = 'Group not found. Please check the group ID';
      } else if (error.message.includes('forbidden')) {
        errorMessage = 'Bot lacks permissions to access group member data';
      }
      
      const errorMsg = `❌ *Scraping Failed*

An error occurred while scraping the group.

*Error:* ${errorMessage}

*Group ID:* ${groupId}

💡 *Troubleshooting Tips:*
• Ensure the bot is a member of the group
• Verify the group ID using ${config.prefix}listgc
• Check that the group still exists
• Make sure the bot has necessary permissions

${generateFooter()}`;
      
      await conn.sendMessage(sender, { text: errorMsg });
    }
  }
};