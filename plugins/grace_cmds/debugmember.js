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
  command: 'debugmember',
  description: '🔍 Debug raw Baileys data for a random group member',
  category: 'GRACE',
  aliases: ['debuguser', 'rawmember'],
  ownerOnly: true,
  
  async execute(conn, msg, args) {
    const sender = msg.key.remoteJid;
    const senderNumber = sender.split('@')[0];
    const currentTime = getCurrentDateTime();
    
    try {
      // Check if sender is owner
      if (senderNumber !== config.ownerNumber) {
        const noPermMsg = `❌ *Access Denied*

This command is restricted to the bot owner only.

🔐 *Owner:* ${config.ownerName}

${generateFooter()}`;
        
        await conn.sendMessage(sender, { text: noPermMsg });
        return;
      }
      
      // Check if group ID is provided
      if (args.length === 0) {
        const usageMsg = `❌ *Missing Group ID*

*Usage:* ${config.prefix}debugmember <group_id>

*Example:* ${config.prefix}debugmember 1234567890@g.us

💡 *Tip:* Use ${config.prefix}listgc to get group IDs

This will fetch raw Baileys data for a random member in the group.

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
      const processingMsg = `🔍 *Fetching Debug Data...*

📱 *Group ID:* ${groupId}
⏰ *Time:* ${currentTime}

Fetching raw Baileys data for a random member...

${generateFooter()}`;
      
      await conn.sendMessage(sender, { text: processingMsg });
      
      // Fetch group metadata
      const groupMetadata = await conn.groupMetadata(groupId);
      
      if (!groupMetadata) {
        throw new Error('Group not found or bot is not a member');
      }
      
      const groupName = groupMetadata.subject || 'Unknown Group';
      const participants = groupMetadata.participants || [];
      
      if (participants.length === 0) {
        const noMembersMsg = `❌ *No Members Found*

The group appears to be empty.

*Group:* ${groupName}

${generateFooter()}`;
        
        await conn.sendMessage(sender, { text: noMembersMsg });
        return;
      }
      
      // Extract phone numbers from participants
      let participantPhones = [];
      
      // Extract from groupMetadata participants
      participantPhones = participants.map(p => {
        const jid = p.id;
        // Extract phone number, handling LID and regular JIDs
        if (jid.includes('@s.whatsapp.net')) {
          return jid.split('@')[0];
        } else if (jid.includes('@lid')) {
          // Try to extract number from LID if possible
          const lidParts = jid.split(':');
          if (lidParts.length > 0) {
            return lidParts[0];
          }
        }
        return jid.split('@')[0];
      }).filter(Boolean);
      
      // Select a random member
      const randomIndex = Math.floor(Math.random() * participants.length);
      const randomMember = participants[randomIndex];
      const memberJid = randomMember.id;
      const memberPhone = participantPhones[randomIndex] || memberJid.split('@')[0];
      
      console.log(`\n🔍 Debugging Member ${randomIndex + 1}/${participants.length} from ${groupName}`);
      console.log('Raw Participant Object:', JSON.stringify(randomMember, null, 2));
      console.log('Extracted Phone Number:', memberPhone);
      
      // Collect all possible data
      const debugData = {
        debug_info: {
          group_name: groupName,
          group_id: groupId,
          member_index: `${randomIndex + 1}/${participants.length}`,
          fetched_at: currentTime,
          baileys_version: 'Unknown'
        },
        
        raw_participant_data: randomMember,
        
        extracted_phone_numbers: {
          from_participant: memberPhone,
          all_participants_phones: participantPhones,
          extraction_method: 'groupMetadata.participants'
        },
        
        parsed_data: {
          jid: memberJid,
          phone_extracted: memberPhone,
          phone_from_jid: memberJid.split('@')[0],
          jid_type: memberJid.includes('@lid') ? 'LID (Privacy Protected)' : 
                    memberJid.includes('@s.whatsapp.net') ? 'Standard WhatsApp' :
                    memberJid.includes('@business') ? 'Business Account' : 'Unknown',
          is_admin: randomMember.admin === 'admin',
          is_super_admin: randomMember.admin === 'superadmin',
          admin_value: randomMember.admin || null
        },
        
        available_fields: {},
        
        attempted_fetches: {}
      };
      
      // Try to get Baileys version safely
      try {
        debugData.debug_info.baileys_version = require('@whiskeysockets/baileys/package.json').version;
      } catch (e) {
        console.log('Could not get Baileys version:', e.message);
      }
      
      // Check all possible fields from participant
      const participantFields = [
        'id', 'admin', 'name', 'notify', 'verifiedName', 'status', 
        'imgUrl', 'phone', 'displayName', 'pushname', 'isBot'
      ];
      
      participantFields.forEach(field => {
        if (randomMember[field] !== undefined) {
          debugData.available_fields[field] = randomMember[field];
        }
      });
      
      // Try to fetch additional data using various Baileys methods
      
      // 1. Try fetchStatus with phone number
      try {
        const phoneJid = `${memberPhone}@s.whatsapp.net`;
        const status = await conn.fetchStatus(phoneJid);
        debugData.attempted_fetches.fetchStatus = {
          success: true,
          data: status,
          used_jid: phoneJid
        };
        console.log('fetchStatus:', JSON.stringify(status, null, 2));
      } catch (e) {
        debugData.attempted_fetches.fetchStatus = {
          success: false,
          error: e.message
        };
      }
      
      // 2. Try profilePictureUrl with phone number
      try {
        const phoneJid = `${memberPhone}@s.whatsapp.net`;
        const ppUrl = await conn.profilePictureUrl(phoneJid, 'image');
        debugData.attempted_fetches.profilePictureUrl = {
          success: true,
          data: ppUrl,
          used_jid: phoneJid
        };
        console.log('profilePictureUrl:', ppUrl);
      } catch (e) {
        debugData.attempted_fetches.profilePictureUrl = {
          success: false,
          error: e.message
        };
      }
      
      // 3. Try onWhatsApp with extracted phone number
      try {
        const onWA = await conn.onWhatsApp(memberPhone);
        debugData.attempted_fetches.onWhatsApp = {
          success: true,
          data: onWA,
          phone_used: memberPhone
        };
        console.log('onWhatsApp:', JSON.stringify(onWA, null, 2));
      } catch (e) {
        debugData.attempted_fetches.onWhatsApp = {
          success: false,
          error: e.message,
          phone_used: memberPhone
        };
      }
      
      // 4. Try getBusinessProfile with phone number
      try {
        const phoneJid = `${memberPhone}@s.whatsapp.net`;
        const businessProfile = await conn.getBusinessProfile(phoneJid);
        debugData.attempted_fetches.getBusinessProfile = {
          success: true,
          data: businessProfile,
          used_jid: phoneJid
        };
        console.log('getBusinessProfile:', JSON.stringify(businessProfile, null, 2));
      } catch (e) {
        debugData.attempted_fetches.getBusinessProfile = {
          success: false,
          error: e.message
        };
      }
      
      // 5. Check connection store
      try {
        const phoneJid = `${memberPhone}@s.whatsapp.net`;
        const storeContact = conn.store?.contacts?.[phoneJid] || conn.store?.contacts?.[memberJid];
        debugData.attempted_fetches.storeContact = {
          success: !!storeContact,
          data: storeContact || null,
          checked_jids: [phoneJid, memberJid]
        };
        console.log('storeContact:', JSON.stringify(storeContact, null, 2));
      } catch (e) {
        debugData.attempted_fetches.storeContact = {
          success: false,
          error: e.message
        };
      }
      
      // 6. Check group metadata for this specific member
      const memberInMetadata = groupMetadata.participants.find(p => p.id === memberJid);
      debugData.group_metadata_entry = memberInMetadata;
      
      // 7. Presence data
      debugData.attempted_fetches.presence = {
        success: false,
        note: 'Presence data requires active subscription'
      };
      
      // Create detailed text summary
      let summaryText = `🔍 *DEBUG: Random Member Data*

╔════════════════════════════╗
║   BAILEYS RAW DATA DUMP    ║
╚════════════════════════════╝

📊 *Group Info:*
• Name: ${groupName}
• Member: ${randomIndex + 1}/${participants.length}
• Time: ${currentTime}

🆔 *Member JID:*
\`\`\`${memberJid}\`\`\`

📱 *Extracted Phone Number:*
\`\`\`${memberPhone}\`\`\`

📱 *JID Type:* ${debugData.parsed_data.jid_type}
👤 *Role:* ${debugData.parsed_data.is_super_admin ? 'Super Admin' : 
              debugData.parsed_data.is_admin ? 'Admin' : 'Member'}

━━━━━━━━━━━━━━━━━━━━━━━━

📋 *AVAILABLE FIELDS IN PARTICIPANT:*
`;

      if (Object.keys(debugData.available_fields).length > 0) {
        for (const [key, value] of Object.entries(debugData.available_fields)) {
          summaryText += `• *${key}:* ${value || 'null'}\n`;
        }
      } else {
        summaryText += `❌ No additional fields found\n`;
      }
      
      summaryText += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      summaryText += `🔬 *BAILEYS METHOD RESULTS:*\n\n`;
      
      for (const [method, result] of Object.entries(debugData.attempted_fetches)) {
        const icon = result.success ? '✅' : '❌';
        summaryText += `${icon} *${method}:*\n`;
        if (result.success) {
          summaryText += `   Data found (see JSON)\n`;
        } else {
          summaryText += `   ${result.error || result.note}\n`;
        }
        summaryText += `\n`;
      }
      
      summaryText += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      summaryText += `📞 *All Extracted Phone Numbers:* ${participantPhones.length} found\n`;
      summaryText += `📄 *Full JSON data sent as file*\n\n`;
      summaryText += generateFooter();
      
      // Save to JSON file
      const fs = require('fs');
      const path = require('path');
      
      const tempDir = path.join(__dirname, '../../temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const filename = `debug_member_${Date.now()}.json`;
      const filepath = path.join(tempDir, filename);
      
      fs.writeFileSync(filepath, JSON.stringify(debugData, null, 2), 'utf-8');
      
      // Send summary text
      await conn.sendMessage(sender, { text: summaryText });
      
      // Send JSON file
      await conn.sendMessage(sender, {
        document: fs.readFileSync(filepath),
        fileName: filename,
        mimetype: 'application/json',
        caption: `🔍 *Complete Debug Data*\n\n*Member:* ${memberJid}\n*Phone:* ${memberPhone}\n*Group:* ${groupName}\n*Format:* JSON\n\n${generateFooter()}`
      });
      
      // Clean up
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
      
      console.log(`✅ Debug complete for member ${randomIndex + 1}`);
      
    } catch (error) {
      console.error('❌ Error in debugmember command:', error);
      console.error('Stack trace:', error.stack);
      
      try {
        const errorMsg = `❌ *Debug Failed*

An error occurred while fetching debug data.

*Error:* ${error.message}

*Stack:* \`\`\`${error.stack ? error.stack.substring(0, 200) : 'No stack trace'}\`\`\`

${generateFooter()}`;
        
        await conn.sendMessage(sender, { text: errorMsg });
      } catch (sendError) {
        console.error('❌ Failed to send error message:', sendError);
      }
    }
  }
};