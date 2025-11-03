const config = require('../../config');

const { exec } = require('child_process');

const { promisify } = require('util');

const execAsync = promisify(exec);

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

  command: 'run',

  description: '⚡ Execute Linux terminal commands',

  category: 'DEVELOPER',

  aliases: ['exec', 'terminal', 'shell'],

  ownerOnly: true,

  

  async execute(conn, msg, args) {

    const sender = msg.key.remoteJid;

    const senderNumber = sender.split('@')[0];

    const currentTime = getCurrentDateTime();

    

    // Check if sender is owner

    if (senderNumber !== config.ownerNumber) {

      const noPermMsg = `❌ *Access Denied*

This command is restricted to the bot owner only.

🔐 *Owner:* ${config.ownerName}

⚠️ *Reason:* Security - System command execution

${generateFooter()}`;

      

      await conn.sendMessage(sender, { text: noPermMsg });

      return;

    }

    

    // Check if command is provided

    if (args.length === 0) {

      const usageMsg = `⚡ *Terminal Command Executor*

*Usage:* ${config.prefix}run <command>

*Examples:*

• ${config.prefix}run ls

• ${config.prefix}run pwd

• ${config.prefix}run ls -la

• ${config.prefix}run cat config.js

• ${config.prefix}run mkdir newfolder

• ${config.prefix}run touch newfile.txt

• ${config.prefix}run node --version

• ${config.prefix}run npm list

⚠️ *Warning:*

• Commands execute in bot root directory

• Be careful with destructive commands

• No confirmation prompts

• Powerful access - use responsibly

📂 *Current Directory:* Bot Root

${generateFooter()}`;

      

      await conn.sendMessage(sender, { text: usageMsg });

      return;

    }

    

    // Join all args to form the complete command

    const command = args.join(' ');

    

    // Blacklist dangerous commands (optional safety)

    const dangerousCommands = [

      'rm -rf /',

      'rm -rf *',

      'mkfs',

      'dd if=/dev/zero',

      ':(){ :|:& };:',

      'chmod -R 777 /'

    ];

    

    const isDangerous = dangerousCommands.some(dangerous => 

      command.toLowerCase().includes(dangerous.toLowerCase())

    );

    

    if (isDangerous) {

      const dangerMsg = `⚠️ *BLOCKED: Dangerous Command*

The command you tried to execute has been blocked for safety.

*Command:* \`${command}\`

🛡️ *Reason:* Potentially destructive system command

💡 *Tip:* If you need to run this, modify the blacklist in the code.

${generateFooter()}`;

      

      await conn.sendMessage(sender, { text: dangerMsg });

      return;

    }

    

    // Send executing message

    const executingMsg = `⚡ *Executing Command...*

💻 *Command:* \`${command}\`

📂 *Directory:* Bot Root

⏰ *Time:* ${currentTime}

⏳ Please wait...

${generateFooter()}`;

    

    await conn.sendMessage(sender, { text: executingMsg });

    

    console.log(`\n⚡ Executing terminal command: ${command}`);

    console.log(`👤 Executed by: ${config.ownerName} (${senderNumber})`);

    console.log(`⏰ Time: ${currentTime}\n`);

    

    try {

      // Execute command with timeout

      const { stdout, stderr } = await execAsync(command, {

        cwd: process.cwd(), // Bot root directory

        timeout: 60000, // 60 second timeout

        maxBuffer: 1024 * 1024 * 10, // 10MB buffer

        shell: '/bin/bash' // Use bash shell

      });

      

      const output = stdout || stderr || 'Command executed successfully (no output)';

      

      console.log('✅ Command Output:\n', output);

      

      // Prepare response

      let responseMsg = `✅ *Command Executed Successfully*

💻 *Command:*

\`\`\`${command}\`\`\`

📤 *Output:*

\`\`\`

${output.trim()}

\`\`\`

⏰ *Completed:* ${getCurrentDateTime()}

${generateFooter()}`;

      

      // Check if output is too long

      if (responseMsg.length > 4000) {

        // Split into multiple messages

        const outputLines = output.split('\n');

        const chunks = [];

        let currentChunk = '';

        

        for (const line of outputLines) {

          if ((currentChunk + line + '\n').length > 3500) {

            chunks.push(currentChunk);

            currentChunk = line + '\n';

          } else {

            currentChunk += line + '\n';

          }

        }

        if (currentChunk) chunks.push(currentChunk);

        

        // Send first message with header

        await conn.sendMessage(sender, {

          text: `✅ *Command Executed Successfully*

💻 *Command:*

\`\`\`${command}\`\`\`

📤 *Output (Part 1/${chunks.length}):*

\`\`\`

${chunks[0].trim()}

\`\`\`

${generateFooter()}`

        });

        

        // Send remaining chunks

        for (let i = 1; i < chunks.length; i++) {

          await conn.sendMessage(sender, {

            text: `📤 *Output (Part ${i + 1}/${chunks.length}):*

\`\`\`

${chunks[i].trim()}

\`\`\`

${i === chunks.length - 1 ? generateFooter() : ''}`

          });

        }

      } else {

        // Send single message

        await conn.sendMessage(sender, { text: responseMsg });

      }

      

      // If stderr has warnings but command succeeded

      if (stderr && stdout) {

        const warningMsg = `⚠️ *Command Warning*

The command executed but produced warnings:

\`\`\`

${stderr.trim()}

\`\`\`

${generateFooter()}`;

        

        await conn.sendMessage(sender, { text: warningMsg });

      }

      

    } catch (error) {

      console.error('❌ Command Error:', error);

      

      let errorOutput = error.message;

      

      // Get stderr if available

      if (error.stderr) {

        errorOutput = error.stderr;

      } else if (error.stdout) {

        errorOutput = error.stdout;

      }

      

      // Handle timeout

      if (error.killed && error.signal === 'SIGTERM') {

        errorOutput = 'Command execution timeout (exceeded 60 seconds)';

      }

      

      const errorMsg = `❌ *Command Execution Failed*

💻 *Command:*

\`\`\`${command}\`\`\`

⚠️ *Error:*

\`\`\`

${errorOutput.trim()}

\`\`\`

📋 *Error Details:*

• Code: ${error.code || 'N/A'}

• Signal: ${error.signal || 'N/A'}

• Killed: ${error.killed ? 'Yes (Timeout)' : 'No'}

⏰ *Failed at:* ${getCurrentDateTime()}

💡 *Tips:*

• Check command syntax

• Verify file/directory exists

• Check permissions

• Review error message above

${generateFooter()}`;

      

      await conn.sendMessage(sender, { text: errorMsg });

    }

  }

};