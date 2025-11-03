const config = require('../../config');
const fs = require('fs');
const path = require('path');
const { parseQuotedMessage, formatToJid } = require('../../lib/fileHandler');

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

function getRandomDelay(min = 3000, max = 8000) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function listContactFiles() {
  const contactsDir = path.join(process.cwd(), 'contacts');
  if (!fs.existsSync(contactsDir)) return [];
  return fs.readdirSync(contactsDir).filter(f => f.endsWith('.json'));
}

function loadContacts(filename) {
  const contactsDir = path.join(process.cwd(), 'contacts');
  const filePath = path.join(contactsDir, filename);
  if (!fs.existsSync(contactsDir)) throw new Error('Contacts directory does not exist. Create "contacts" in the bot home.');
  if (!fs.existsSync(filePath)) throw new Error(`Contact file "${filename}" not found in contacts directory.`);
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('Contact file must be a JSON array.');
  return parsed;
}

module.exports = {
  command: 'custombc',
  description: '📢 Broadcast a quoted message to contacts from a JSON file',
  category: 'GRACE',
  aliases: ['cbc', 'broadcast', 'custombroadcast'],

  /**
   * execute(conn, msg, args, globalContext)
   * - requires owner
   * - requires that the user replies to a message (quoted)
   * - arg[0] is filename or filename.json located in ./contacts
   */
  async execute(conn, msg, args) {
    const sender = msg.key.remoteJid;
    const senderId = sender.split('@')[0];
    const currentTime = getCurrentDateTime();

    // Owner-only
    if (senderId !== config.ownerNumber) {
      const notOwnerMsg = `❌ *Access Denied*

This command is only available to the bot owner.

${generateFooter()}`;
      await conn.sendMessage(sender, { text: notOwnerMsg });
      return;
    }

    // If no arg, show help + available files
    if (!args || args.length === 0) {
      const files = listContactFiles();
      let helpMsg = `📢 *Custom Broadcast Command*

*Usage:*
${config.prefix}custombc <filename.json>

*Example:*
${config.prefix}custombc bc1.json

*Instructions:*
1️⃣ Reply to a message you want to broadcast
2️⃣ Use the command with the contact file name
3️⃣ The bot will forward/send the message to all contacts with random delays

*Supported types:* text, image, video, document, audio, sticker, contacts, location

`;

      if (files.length) {
        helpMsg += `*Available Contact Files:*\n`;
        files.forEach((f, i) => (helpMsg += `${i + 1}. ${f}\n`));
      } else {
        helpMsg += `⚠️ No contact files found in ./contacts. Create JSON files there.`;
      }

      helpMsg += `\n${generateFooter()}`;
      await conn.sendMessage(sender, { text: helpMsg });
      return;
    }

    // Ensure message is a reply (quoted)
    const contextInfo = msg.message.extendedTextMessage?.contextInfo;
    if (!contextInfo || !contextInfo.quotedMessage) {
      const noReplyMsg = `❌ *No Message to Broadcast*

Please reply to the message you want to broadcast, then use:
${config.prefix}custombc ${args[0]}

${generateFooter()}`;
      await conn.sendMessage(sender, { text: noReplyMsg });
      return;
    }

    const rawFilename = args[0];
    const filename = rawFilename.endsWith('.json') ? rawFilename : `${rawFilename}.json`;

    let contacts;
    try {
      contacts = loadContacts(filename);
    } catch (err) {
      const errMsg = `❌ *Contact File Error*

${err.message}

${generateFooter()}`;
      await conn.sendMessage(sender, { text: errMsg });
      return;
    }

    if (contacts.length === 0) {
      const noContactsMsg = `❌ *No Contacts Found* in ${filename}\n\n${generateFooter()}`;
      await conn.sendMessage(sender, { text: noContactsMsg });
      return;
    }

    // Parse the quoted message once into a payload
    let payload;
    try {
      // Pass only the msg object (it contains everything we need)
      payload = await parseQuotedMessage(msg);
    } catch (err) {
      const unsupportedMsg = `❌ *Unsupported or Failed to Parse Quoted Message*

${err.message}

Supported types: text, image, video, document, audio, sticker, contacts, location

${generateFooter()}`;
      await conn.sendMessage(sender, { text: unsupportedMsg });
      return;
    }

    // Send a start report to owner
    const startMsg = `📢 *Broadcast Started*

📁 File: ${filename}
👥 Total Contacts: ${contacts.length}
⏱️ Estimated Time: ${Math.ceil((contacts.length * 5.5) / 60)} minutes
🕐 Started: ${currentTime.split(' ')[1]} UTC

⏳ Broadcasting...

${generateFooter()}`;
    await conn.sendMessage(sender, { text: startMsg });

    // Iterate contacts and send message(s)
    let successCount = 0;
    let failedCount = 0;
    const failedList = [];

    for (let i = 0; i < contacts.length; i++) {
      const c = contacts[i];
      const number = c.number || c.Number || c.phone || '';
      if (!number) {
        failedCount++;
        failedList.push({ number: 'missing', reason: 'No number field' });
        continue;
      }

      const jid = formatToJid(number);
      const display = c.Name || c['Push Name'] || number;

      try {
        // sendMessage accepts the same payload we produced.
        await conn.sendMessage(jid, payload);

        successCount++;
        console.log(`✅ ${i + 1}/${contacts.length} -> ${display} (${number})`);

        // Random delay between messages
        const delay = getRandomDelay(3000, 8000);
        await sleep(delay);

        // Send progress update every 10 messages
        if ((i + 1) % 10 === 0) {
          const progress = `📊 Broadcast Progress

✅ Sent: ${successCount}
❌ Failed: ${failedCount}
⏳ Remaining: ${contacts.length - (i + 1)}

${generateFooter()}`;
          await conn.sendMessage(sender, { text: progress });
        }
      } catch (err) {
        failedCount++;
        failedList.push({ number, reason: err.message });
        console.error(`❌ Failed to send to ${display} (${number}) - ${err.message}`);
        // small pause on error
        await sleep(2000);
        continue;
      }
    }

    const endTime = getCurrentDateTime();
    const resultMsgLines = [
      '╔════════════════════════════╗',
      '║   BROADCAST COMPLETED      ║',
      '╚════════════════════════════╝',
      '',
      `📁 File: ${filename}`,
      `👥 Total Contacts: ${contacts.length}`,
      '',
      '📊 Results:',
      `✅ Successful: ${successCount}`,
      `❌ Failed: ${failedCount}`,
      `📈 Success Rate: ${((successCount / contacts.length) * 100).toFixed(2)}%`,
      '',
      `🕐 Started: ${currentTime.split(' ')[1]} UTC`,
      `🕐 Completed: ${endTime.split(' ')[1]} UTC`,
      ''
    ];

    if (failedCount > 0) {
      resultMsgLines.push('⚠️ Failed Contacts (first 10):');
      failedList.slice(0, 10).forEach((f, idx) => {
        resultMsgLines.push(`${idx + 1}. ${f.number} - ${f.reason}`);
      });
      if (failedCount > 10) resultMsgLines.push(`...and ${failedCount - 10} more`);
      resultMsgLines.push('');
    }

    resultMsgLines.push(generateFooter());

    await conn.sendMessage(sender, { text: resultMsgLines.join('\n') });
  }
};