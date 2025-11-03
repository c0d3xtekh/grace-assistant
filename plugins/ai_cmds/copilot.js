const config = require('../../config');
const chalk = require('chalk');
const axios = require('axios');

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
  command: 'copilot',
  description: '🤖 Chat with Copilot AI',
  category: 'AI',
  aliases: [],

  async execute(conn, msg, args) {
    const sender = msg.key.remoteJid;
    const currentTime = getCurrentDateTime();

    // Check if query is provided
    if (args.length === 0) {
      const helpMsg = `🤖 *Copilot AI Assistant*

*Usage:*
${config.prefix}copilot <your_question>

*Examples:*
${config.prefix}copilot What is JavaScript?
${config.prefix}copilot Explain quantum computing
${config.prefix}copilot Write a poem about coding
${config.prefix}copilot How does blockchain work?

*Features:*
✅ Intelligent AI responses
✅ Multi-topic conversations
✅ Programming help
✅ General knowledge
✅ Creative writing

${generateFooter()}`;
      
      await conn.sendMessage(sender, { text: helpMsg });
      return;
    }

    const query = args.join(' ');

    // Send processing message
    const processingMsg = `🤖 *Copilot AI*

⏳ Thinking...

_"${query}"_

${generateFooter()}`;
    
    await conn.sendMessage(sender, { text: processingMsg });

    console.log(chalk.blue('━'.repeat(60)));
    console.log(chalk.cyan.bold('🤖 Copilot AI Request'));
    console.log(chalk.white(`   From: ${sender.split('@')[0]}`));
    console.log(chalk.white(`   Query: ${query}`));
    console.log(chalk.white(`   Time: ${currentTime}`));
    console.log(chalk.blue('━'.repeat(60)));

    try {
      // Call Copilot API
      console.log(chalk.yellow('   Sending request to Copilot API...'));
      
      const response = await axios.post('https://api.nekolabs.web.id/ai/copilot', {
        text: query
      }, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 60000 // 60 seconds timeout
      });

      if (!response.data || !response.data.success) {
        throw new Error('Invalid API response');
      }

      const result = response.data.result;
      const aiResponse = result.text;
      const citations = result.citations || [];
      const responseTime = response.data.responseTime || 'N/A';

      console.log(chalk.green(`   ✅ Response received (${responseTime})`));
      console.log(chalk.white(`   Length: ${aiResponse.length} characters`));

      // Prepare response message
      let replyMsg = `🤖 *Copilot AI*

${aiResponse}

`;

      // Add citations if available
      if (citations && citations.length > 0) {
        replyMsg += `\n📚 *Sources:*\n`;
        citations.forEach((citation, index) => {
          replyMsg += `${index + 1}. ${citation}\n`;
        });
        replyMsg += '\n';
      }

      // Add response time
      replyMsg += `⏱️ ${responseTime}\n`;
      replyMsg += `\n${generateFooter()}`;

      // Send response
      await conn.sendMessage(sender, { text: replyMsg });

      console.log(chalk.green('   ✅ Response sent successfully'));
      console.log(chalk.blue('━'.repeat(60)));
      console.log('');

    } catch (error) {
      console.error(chalk.red('❌ Copilot AI error:'), error.message);
      console.log(chalk.blue('━'.repeat(60)));
      console.log('');

      let errorMessage = error.message;

      // Handle specific error types
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        errorMessage = 'Request timeout - The AI took too long to respond';
      } else if (error.response) {
        errorMessage = `API Error: ${error.response.status} - ${error.response.statusText}`;
      } else if (error.request) {
        errorMessage = 'Network error - Unable to reach the AI service';
      }

      const errorMsg = `❌ *Copilot AI Error*

Failed to get AI response.

*Error:* ${errorMessage}

*Your Question:*
"${query}"

*Possible causes:*
• Service temporarily unavailable
• Network connectivity issues
• Request timeout
• Rate limiting

*Tip:* Please try again in a few moments.

${generateFooter()}`;

      await conn.sendMessage(sender, { text: errorMsg });
    }
  }
};